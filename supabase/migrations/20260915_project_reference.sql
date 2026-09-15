-- Project Reference master (client ask 2026-09-04: "Project Reference Report").
--
-- The client's project master is the "Project Ref - Standardized" tab of the
-- Claim Summary workbook (~1,000 rows, every project since 2009, with the
-- STANDARDIZED TYPE OF WORK / CODE columns they filter on). The app's
-- `projects` table only holds the ~180 projects loaded for the demo, so an
-- Epoxy-only reference report from `projects` came back nearly empty.
--
-- This table mirrors the sheet 1:1 (snapshot replaced on each upload, same
-- pattern as the stock import) and back-fills projects.work_type_code where it
-- is empty. Reads: anon. Writes: only via the SECURITY DEFINER RPC.

create table if not exists public.project_reference (
  id               uuid primary key default gen_random_uuid(),
  sno              integer,
  project_code     text,
  base_code        text,            -- E25077 for "E25077 (VO)"; used to consolidate
  sales_rep        text,
  project_site     text,
  client           text,
  contract_value   numeric,
  total_claim_value numeric,
  balance_work     numeric,
  progress_pct     numeric,
  commencement     date,
  completion       date,
  officer_in_charge text,
  scope            text,
  quotation_ref    text,
  supplier         text,
  system           text,
  type_of_work     text,            -- "EPOXY / MORTAR"
  standardized_code text,           -- "CP01-EP-MR"
  imported_at      timestamptz not null default now()
);
create index if not exists project_reference_base_code_idx on public.project_reference (base_code);
create index if not exists project_reference_type_idx on public.project_reference (type_of_work);

alter table public.project_reference enable row level security;
do $$ begin
  create policy "project_reference anon read" on public.project_reference for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
grant select on public.project_reference to anon, authenticated;

create or replace function public.replace_project_reference(p_rows jsonb, p_actor text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_deleted int := 0;
  v_inserted int := 0;
  v_backfilled int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) < 50 then
    raise exception 'only % rows — refusing to replace the project master with a near-empty sheet', jsonb_array_length(p_rows);
  end if;

  delete from project_reference where true;  -- Supabase blocks a bare DELETE
  get diagnostics v_deleted = row_count;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into project_reference (
      sno, project_code, base_code, sales_rep, project_site, client, contract_value, total_claim_value,
      balance_work, progress_pct, commencement, completion, officer_in_charge, scope, quotation_ref,
      supplier, system, type_of_work, standardized_code)
    values (
      nullif(r->>'sno','')::int,
      nullif(trim(r->>'project_code'),''),
      nullif(trim(r->>'base_code'),''),
      nullif(trim(r->>'sales_rep'),''),
      nullif(trim(r->>'project_site'),''),
      nullif(trim(r->>'client'),''),
      nullif(r->>'contract_value','')::numeric,
      nullif(r->>'total_claim_value','')::numeric,
      nullif(r->>'balance_work','')::numeric,
      nullif(r->>'progress_pct','')::numeric,
      nullif(r->>'commencement','')::date,
      nullif(r->>'completion','')::date,
      nullif(trim(r->>'officer_in_charge'),''),
      nullif(trim(r->>'scope'),''),
      nullif(trim(r->>'quotation_ref'),''),
      nullif(trim(r->>'supplier'),''),
      nullif(trim(r->>'system'),''),
      nullif(trim(r->>'type_of_work'),''),
      nullif(trim(r->>'standardized_code'),''));
    v_inserted := v_inserted + 1;
  end loop;

  -- projects.work_type_code: fill blanks from the master (exact code first, then base code)
  update projects p set work_type_code = x.code
    from (
      select distinct on (p2.id) p2.id, pr.standardized_code as code
        from projects p2
        join project_reference pr on pr.standardized_code is not null
         and (pr.project_code = p2.project_code or pr.base_code = p2.project_code)
       where p2.work_type_code is null
       order by p2.id, (pr.project_code = p2.project_code) desc, pr.sno desc
    ) x
   where x.id = p.id;
  get diagnostics v_backfilled = row_count;

  insert into audit_log (table_name, record_id, action, new_data)
  values ('project_reference', gen_random_uuid(), 'update',
          jsonb_build_object('kind', 'import_project_reference', 'actor', p_actor,
                             'deleted', v_deleted, 'inserted', v_inserted, 'projects_backfilled', v_backfilled));

  return json_build_object('ok', true, 'deleted', v_deleted, 'inserted', v_inserted, 'projects_backfilled', v_backfilled);
end; $$;

grant execute on function public.replace_project_reference(jsonb, text) to anon, authenticated;
