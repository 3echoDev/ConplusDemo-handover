-- Conplus item 2 (Wendy, 3 Nov 2026): claim work-done breakdown per period.
--
-- Wendy's own Claim 02 workbook is the spec. Each priced item carries one
-- "Work Done" sub-row per work period, numbered 1..n, with the quantity in the
-- Previous column for periods already claimed and in the Current column for the
-- period this claim covers; the item row sums the sub-rows:
--
--   A1  To Floor ...                     J=SUM(J17:J19)   K=SUM(K17:K19)
--    1  Work Done: 17-23 Aug'26 - 1st Storey   prev 107.64   curr 0
--    2  Work Done: 01-15 Sep'26 - 1st Storey   prev 0        curr 250
--
-- claim_lines.prev_qty / curr_qty stay the authoritative totals; the periods are
-- the breakdown underneath and must sum to them (save_claim_lines enforces it).

create table if not exists public.claim_work_done (
  id            uuid primary key default uuid_generate_v4(),
  claim_line_id uuid not null references public.claim_lines(id) on delete cascade,
  seq           integer not null default 1,
  label         text,                       -- "Work Done: 17-23 Aug'26 - 1st Storey"
  period_from   date,
  period_to     date,
  location      text,                       -- "1st Storey" / grid line
  qty           numeric not null default 0,
  is_current    boolean not null default true,  -- false = carried from an earlier claim period
  source        text not null default 'manual'  -- manual | wdr | carried
                 check (source in ('manual', 'wdr', 'carried')),
  created_at    timestamptz default now()
);

create index if not exists claim_work_done_line_idx
  on public.claim_work_done (claim_line_id, seq);

alter table public.claim_work_done enable row level security;

drop policy if exists claim_work_done_read on public.claim_work_done;
create policy claim_work_done_read on public.claim_work_done
  for select using (true);   -- writes go through save_claim_lines (SECURITY DEFINER)

-- The Work Done Report that backs this claim's current period. The file itself
-- lives in the public "documents" bucket; the claim keeps the pointer so the
-- print can append it and so it is never carried into a later claim.
alter table public.claims add column if not exists wdr_url          text;
alter table public.claims add column if not exists wdr_filename     text;
alter table public.claims add column if not exists wdr_period_from  date;
alter table public.claims add column if not exists wdr_period_to    date;
alter table public.claims add column if not exists wdr_uploaded_at  timestamptz;

-- save_claim_lines gains an optional "periods" array on each line. Writing the
-- periods here (rather than in a second RPC) matters: this function deletes and
-- re-inserts every claim_line, and the cascade would take the periods with it.
create or replace function public.save_claim_lines(p_claim_id uuid, p_lines jsonb)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_n int := 0; v_line jsonb; v_seq int := 0;
        v_rate numeric; v_qty numeric; v_prev numeric; v_curr numeric; v_cum numeric;
        v_line_id uuid; v_periods jsonb; v_period jsonb; v_pseq int;
        v_pqty numeric; v_pcur boolean; v_np int := 0;
begin
  if not exists (select 1 from claims where id = p_claim_id) then
    return json_build_object('ok', false, 'error', 'claim not found');
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return json_build_object('ok', false, 'error', 'p_lines must be a JSON array');
  end if;
  delete from claim_lines where claim_id = p_claim_id;   -- cascades to claim_work_done
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_seq := v_seq + 1;
    v_rate := nullif(v_line->>'rate','')::numeric;
    v_qty  := nullif(v_line->>'qty','')::numeric;
    v_periods := case when jsonb_typeof(v_line->'periods') = 'array' then v_line->'periods' else null end;

    -- With a breakdown present the periods are the truth: Previous is every
    -- earlier period, Current is this claim's period. Without one, fall back to
    -- the figures the caller sent (the pre-item-2 path, still used by imports).
    if v_periods is not null and jsonb_array_length(v_periods) > 0 then
      select coalesce(sum(case when coalesce((p->>'is_current')::boolean, true) then 0
                               else coalesce(nullif(p->>'qty','')::numeric, 0) end), 0),
             coalesce(sum(case when coalesce((p->>'is_current')::boolean, true)
                               then coalesce(nullif(p->>'qty','')::numeric, 0) else 0 end), 0)
        into v_prev, v_curr
        from jsonb_array_elements(v_periods) p;
    else
      v_prev := coalesce(nullif(v_line->>'prev_qty','')::numeric, 0);
      v_curr := coalesce(nullif(v_line->>'curr_qty','')::numeric, 0);
    end if;
    v_cum := v_prev + v_curr;

    insert into claim_lines (claim_id, section, quotation_ref, seq, pg_ref, zone, description, unit, qty, rate,
      contract_amount, prev_qty, prev_amount, curr_qty, curr_amount, cum_qty, cum_amount,
      verified_qty, verified_amount, remarks)
    values (p_claim_id,
      case when upper(coalesce(v_line->>'section','A')) = 'B' then 'B' else 'A' end,
      nullif(v_line->>'quotation_ref',''),
      coalesce(nullif(v_line->>'seq','')::int, v_seq),
      nullif(v_line->>'pg_ref',''),
      nullif(v_line->>'zone',''),
      coalesce(v_line->>'description',''),
      nullif(v_line->>'unit',''),
      v_qty, v_rate,
      coalesce(nullif(v_line->>'contract_amount','')::numeric, round(coalesce(v_qty,0)*coalesce(v_rate,0),2)),
      v_prev, coalesce(nullif(v_line->>'prev_amount','')::numeric, round(v_prev*coalesce(v_rate,0),2)),
      v_curr, coalesce(nullif(v_line->>'curr_amount','')::numeric, round(v_curr*coalesce(v_rate,0),2)),
      v_cum,  coalesce(nullif(v_line->>'cum_amount','')::numeric,  round(v_cum*coalesce(v_rate,0),2)),
      nullif(v_line->>'verified_qty','')::numeric, nullif(v_line->>'verified_amount','')::numeric,
      nullif(v_line->>'remarks',''))
    returning id into v_line_id;

    if v_periods is not null then
      v_pseq := 0;
      for v_period in select * from jsonb_array_elements(v_periods) loop
        v_pseq := v_pseq + 1;
        v_pqty := coalesce(nullif(v_period->>'qty','')::numeric, 0);
        v_pcur := coalesce((v_period->>'is_current')::boolean, true);
        insert into claim_work_done (claim_line_id, seq, label, period_from, period_to, location, qty, is_current, source)
        values (v_line_id, coalesce(nullif(v_period->>'seq','')::int, v_pseq),
          nullif(v_period->>'label',''),
          nullif(v_period->>'period_from','')::date,
          nullif(v_period->>'period_to','')::date,
          nullif(v_period->>'location',''),
          v_pqty, v_pcur,
          case when coalesce(v_period->>'source','manual') in ('manual','wdr','carried')
               then v_period->>'source' else 'manual' end);
        v_np := v_np + 1;
      end loop;
    end if;
    v_n := v_n + 1;
  end loop;
  return json_build_object('ok', true, 'claim_id', p_claim_id, 'count', v_n, 'periods', v_np);
end $function$;

-- Record the WDR against the claim (anon has no UPDATE on claims).
create or replace function public.set_claim_wdr(
  p_claim_id uuid, p_url text, p_filename text,
  p_period_from date default null, p_period_to date default null)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (select 1 from claims where id = p_claim_id) then
    return json_build_object('ok', false, 'error', 'claim not found');
  end if;
  update claims
     set wdr_url = nullif(p_url, ''),
         wdr_filename = nullif(p_filename, ''),
         wdr_period_from = p_period_from,
         wdr_period_to = p_period_to,
         wdr_uploaded_at = case when nullif(p_url, '') is null then null else now() end
   where id = p_claim_id;
  return json_build_object('ok', true, 'claim_id', p_claim_id);
end $function$;

grant execute on function public.set_claim_wdr(uuid, text, text, date, date) to anon, authenticated;
