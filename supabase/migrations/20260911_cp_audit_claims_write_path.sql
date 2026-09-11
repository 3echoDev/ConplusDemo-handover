-- ConPlus audit-log fixes, 2026-09-11 (CP07 / CP08 / CP11 / CP12)
-- Run in the Supabase SQL editor for project ethxxhlpmfpnuaxeyshy, or via apply_migration.
-- Idempotent: safe to re-run.

begin;

-- CP07: canonical sales manager on projects -------------------------------
update salespeople set aliases = array_append(aliases, 'ng wan fern')
 where canonical_name = 'WAN FERN' and not ('ng wan fern' = any(aliases));

create or replace function public.normalise_project_sales_manager() returns trigger
language plpgsql as $$
declare v text;
begin
  if new.sales_manager is not null then
    v := public.match_salesperson(new.sales_manager);
    if v is not null then new.sales_manager := v; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_projects_sales_manager on public.projects;
create trigger trg_projects_sales_manager before insert or update of sales_manager on public.projects
  for each row execute function public.normalise_project_sales_manager();

-- CP08: single write path for claims (anon has SELECT-only RLS on claims) ---
create or replace function public.update_claim(p_claim_id uuid, p_patch jsonb)
 returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_allowed text[] := array['claim_date','amount','total_amount','certified_amount','retention_amount',
                            'prc_date','invoice_date','paid_date','certified_date','submitted_date',
                            'remarks','status','wo_po_ref','is_final','claim_no',
                            'total_claim','gst','po_ref','wo_ref','do_ref','payment_terms',
                            'client_address','contact_person','contact_number','description','net_amount'];
  v_key text; v_bad text[] := '{}';
  v_status text;
begin
  if not exists (select 1 from claims where id = p_claim_id) then
    return json_build_object('ok', false, 'error', 'claim not found');
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then v_bad := v_bad || v_key; end if;
  end loop;
  if array_length(v_bad,1) > 0 then
    return json_build_object('ok', false, 'error', 'fields not editable: ' || array_to_string(v_bad, ', '));
  end if;
  v_status := p_patch->>'status';
  if v_status is not null and v_status not in ('submitted','certified','paid','pending','rejected') then
    return json_build_object('ok', false, 'error', 'invalid status');
  end if;
  if (p_patch ? 'amount') and (p_patch->>'amount')::numeric < 0 then
    return json_build_object('ok', false, 'error', 'amount cannot be negative');
  end if;

  update claims set
    claim_date       = case when p_patch ? 'claim_date'       then nullif(p_patch->>'claim_date','')::date       else claim_date end,
    amount           = case when p_patch ? 'amount'           then (p_patch->>'amount')::numeric                  else amount end,
    total_amount     = case when p_patch ? 'total_amount'     then nullif(p_patch->>'total_amount','')::numeric   else total_amount end,
    certified_amount = case when p_patch ? 'certified_amount' then nullif(p_patch->>'certified_amount','')::numeric else certified_amount end,
    retention_amount = case when p_patch ? 'retention_amount' then nullif(p_patch->>'retention_amount','')::numeric else retention_amount end,
    prc_date         = case when p_patch ? 'prc_date'         then nullif(p_patch->>'prc_date','')::date         else prc_date end,
    invoice_date     = case when p_patch ? 'invoice_date'     then nullif(p_patch->>'invoice_date','')::date     else invoice_date end,
    paid_date        = case when p_patch ? 'paid_date'        then nullif(p_patch->>'paid_date','')::date        else paid_date end,
    certified_date   = case when p_patch ? 'certified_date'   then nullif(p_patch->>'certified_date','')::date   else certified_date end,
    submitted_date   = case when p_patch ? 'submitted_date'   then nullif(p_patch->>'submitted_date','')::date   else submitted_date end,
    remarks          = case when p_patch ? 'remarks'          then p_patch->>'remarks'                           else remarks end,
    status           = coalesce(v_status, status),
    wo_po_ref        = case when p_patch ? 'wo_po_ref'        then p_patch->>'wo_po_ref'                         else wo_po_ref end,
    is_final         = case when p_patch ? 'is_final'         then (p_patch->>'is_final')::boolean               else is_final end,
    claim_no         = case when p_patch ? 'claim_no'         then nullif(p_patch->>'claim_no','')::int          else claim_no end,
    total_claim      = case when p_patch ? 'total_claim'      then nullif(p_patch->>'total_claim','')::numeric    else total_claim end,
    gst              = case when p_patch ? 'gst'              then nullif(p_patch->>'gst','')::numeric            else gst end,
    po_ref           = case when p_patch ? 'po_ref'           then nullif(p_patch->>'po_ref','')                  else po_ref end,
    wo_ref           = case when p_patch ? 'wo_ref'           then nullif(p_patch->>'wo_ref','')                  else wo_ref end,
    do_ref           = case when p_patch ? 'do_ref'           then nullif(p_patch->>'do_ref','')                  else do_ref end,
    payment_terms    = case when p_patch ? 'payment_terms'    then nullif(p_patch->>'payment_terms','')           else payment_terms end,
    client_address   = case when p_patch ? 'client_address'   then nullif(p_patch->>'client_address','')          else client_address end,
    contact_person   = case when p_patch ? 'contact_person'   then nullif(p_patch->>'contact_person','')          else contact_person end,
    contact_number   = case when p_patch ? 'contact_number'   then nullif(p_patch->>'contact_number','')          else contact_number end,
    description      = case when p_patch ? 'description'      then nullif(p_patch->>'description','')             else description end,
    net_amount       = case when p_patch ? 'net_amount'       then nullif(p_patch->>'net_amount','')::numeric     else net_amount end,
    updated_at       = now()
  where id = p_claim_id;

  return json_build_object('ok', true, 'claim_id', p_claim_id, 'updated', (select array_agg(k) from jsonb_object_keys(p_patch) k));
end $$;

-- CP11: claim lines write path --------------------------------------------
alter table public.claim_lines add column if not exists zone text;

create or replace function public.save_claim_lines(p_claim_id uuid, p_lines jsonb)
 returns json language plpgsql security definer set search_path to 'public' as $$
declare v_n int := 0; v_line jsonb; v_seq int := 0;
        v_rate numeric; v_qty numeric; v_prev numeric; v_curr numeric; v_cum numeric;
begin
  if not exists (select 1 from claims where id = p_claim_id) then
    return json_build_object('ok', false, 'error', 'claim not found');
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return json_build_object('ok', false, 'error', 'p_lines must be a JSON array');
  end if;
  delete from claim_lines where claim_id = p_claim_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_seq := v_seq + 1;
    v_rate := nullif(v_line->>'rate','')::numeric;
    v_qty  := nullif(v_line->>'qty','')::numeric;
    v_prev := coalesce(nullif(v_line->>'prev_qty','')::numeric, 0);
    v_curr := coalesce(nullif(v_line->>'curr_qty','')::numeric, 0);
    v_cum  := v_prev + v_curr;
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
      nullif(v_line->>'remarks',''));
    v_n := v_n + 1;
  end loop;
  return json_build_object('ok', true, 'claim_id', p_claim_id, 'count', v_n);
end $$;
grant execute on function public.save_claim_lines(uuid, jsonb) to anon, authenticated, service_role;

-- CP08C: chase views expose the persisted dates (columns appended) ---------
create or replace view public.certificate_chase as
 WITH base AS (
         SELECT c.id AS claim_id, c.claim_number, c.claim_no, c.project_id, c.project_code, c.project_name,
            c.client_name, c.contact_person, c.contact_number, c.amount, c.certified_amount,
            COALESCE(c.claim_date, c.submitted_date) AS anchor_date,
            c.prc_date, c.invoice_date,
            p.follow_up_owner, p.sales_manager, p.contact_email,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'cert_due_days'::text) AS due_days,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'chase_from_days_ago'::text) AS from_days
           FROM claims c JOIN projects p ON p.id = c.project_id
          WHERE COALESCE(c.claim_date, c.submitted_date) IS NOT NULL
        ), calc AS (
         SELECT base.*,
            base.anchor_date + ((base.due_days || ' days'::text)::interval) AS due_date,
            CURRENT_DATE - base.anchor_date AS days_since_claim,
            (base.anchor_date + ((base.due_days || ' days'::text)::interval))::date - CURRENT_DATE AS days_to_due
           FROM base
        )
 SELECT claim_id, claim_number, claim_no, project_id, project_code, project_name, client_name, contact_person,
    contact_number, amount, certified_amount, anchor_date, due_date::date AS due_date, follow_up_owner, sales_manager,
    days_since_claim, days_to_due,
        CASE
            WHEN days_to_due > 7 THEN 'not_due'::text
            WHEN days_to_due <= 7 AND days_to_due > 4 THEN 't-7'::text
            WHEN days_to_due <= 4 AND days_to_due > 0 THEN 't-4'::text
            WHEN days_to_due = 0 THEN 'due'::text
            WHEN days_to_due < 0 THEN 'overdue'::text
            ELSE NULL::text
        END AS stage,
        CASE WHEN days_to_due < 0 THEN floor(abs(days_to_due)::numeric / 7.0)::integer ELSE NULL::integer END AS overdue_weeks,
        CASE
            WHEN days_to_due = 4 THEN true
            WHEN days_to_due = 0 THEN true
            WHEN days_to_due < 0 AND (abs(days_to_due) % 7) = 0 THEN true
            ELSE false
        END AS needs_action_today,
    days_to_due = 7 AS awareness_only,
    days_to_due <= 0 AS notify_salesperson,
    (EXISTS ( SELECT 1 FROM chase_holds h WHERE h.claim_id = calc.claim_id AND h.active AND (h.clock = ANY (ARRAY['certificate'::text, 'both'::text])))) AS on_hold,
    ( SELECT count(*) FROM chase_reminders r WHERE r.claim_id = calc.claim_id AND r.clock = 'certificate'::text AND r.decision = 'proceed'::text) AS reminders_sent,
    contact_email,
    prc_date, invoice_date
   FROM calc
  WHERE prc_date IS NULL AND days_since_claim <= from_days;

create or replace view public.payment_chase as
 WITH base AS (
         SELECT c.id AS claim_id, c.claim_number, c.claim_no, c.project_id, c.project_code, c.project_name,
            c.client_name, c.contact_person, c.contact_number, c.amount, c.total_amount, c.certified_amount,
            c.invoice_date, c.paid_date, c.prc_date,
            p.sales_manager, p.contact_email,
            COALESCE(p.payment_terms_days, ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_terms_default'::text)) AS terms_days,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_reminder_1'::text) AS r1,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_reminder_2'::text) AS r2,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_reminder_final'::text) AS rf,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_soa_every'::text) AS soa_every,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'chase_from_days_ago'::text) AS from_days,
            ( SELECT max(r.sent_at) FROM chase_reminders r WHERE r.claim_id = c.id AND r.clock = 'payment'::text AND r.decision = 'proceed'::text) AS last_sent_at
           FROM claims c JOIN projects p ON p.id = c.project_id
          WHERE c.invoice_date IS NOT NULL
        ), calc AS (
         SELECT base.*,
            (base.invoice_date + ((base.terms_days || ' days'::text)::interval))::date AS due_date,
            CURRENT_DATE - base.invoice_date AS days_since_invoice,
            (base.invoice_date + ((base.terms_days || ' days'::text)::interval))::date - CURRENT_DATE AS days_to_due,
            CASE WHEN base.last_sent_at IS NOT NULL THEN CURRENT_DATE - base.last_sent_at::date ELSE NULL::integer END AS days_since_last_sent,
            CASE
                WHEN base.last_sent_at IS NULL THEN (base.invoice_date + ((base.terms_days || ' days'::text)::interval))::date
                ELSE base.last_sent_at::date + (( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_soa_every'::text))
            END AS next_flag_date
           FROM base
        )
 SELECT calc.claim_id, calc.claim_number, calc.claim_no, calc.project_id, calc.project_code, calc.project_name,
    calc.client_name, calc.contact_person, calc.contact_number, calc.sales_manager,
    COALESCE(calc.total_amount, calc.amount) AS invoice_amount,
    calc.invoice_date, calc.due_date, calc.terms_days, calc.days_since_invoice, calc.days_to_due,
    calc.last_sent_at, calc.days_since_last_sent, calc.next_flag_date,
    calc.next_flag_date - CURRENT_DATE AS days_to_next_flag,
        CASE
            WHEN calc.paid_date IS NOT NULL THEN 'paid'::text
            WHEN calc.days_to_due > 0 THEN 'soa'::text
            WHEN calc.days_since_invoice >= calc.rf THEN 'final'::text
            WHEN calc.days_since_invoice >= calc.r2 THEN '2nd'::text
            WHEN calc.days_since_invoice >= calc.r1 THEN '1st'::text
            ELSE 'soa_overdue'::text
        END AS stage,
        CASE
            WHEN calc.paid_date IS NOT NULL THEN NULL::text
            WHEN reminders_count.n = 0 THEN '1st'::text
            WHEN reminders_count.n = 1 THEN '2nd'::text
            WHEN reminders_count.n = 2 THEN 'final'::text
            ELSE 'final'::text
        END AS next_reminder_label,
        CASE
            WHEN calc.paid_date IS NOT NULL THEN false
            WHEN calc.days_to_due > 0 THEN false
            WHEN calc.last_sent_at IS NULL THEN true
            WHEN calc.days_since_last_sent >= calc.soa_every THEN true
            ELSE false
        END AS needs_action_today,
    calc.days_to_due <= 0 AS notify_salesperson,
    calc.paid_date IS NOT NULL AS paid,
    (EXISTS ( SELECT 1 FROM chase_holds h WHERE h.claim_id = calc.claim_id AND h.active AND (h.clock = ANY (ARRAY['payment'::text, 'both'::text])))) AS on_hold,
    reminders_count.n AS reminders_sent,
    calc.contact_email,
    calc.prc_date, calc.paid_date
   FROM calc
     CROSS JOIN LATERAL ( SELECT count(*) AS n FROM chase_reminders r WHERE r.claim_id = calc.claim_id AND r.clock = 'payment'::text AND r.decision = 'proceed'::text) reminders_count
  WHERE calc.paid_date IS NULL AND calc.days_since_invoice <= calc.from_days;

commit;
