-- Invoice stage between the Certificate chase and the Payment chase
-- (Accounts' spec, "Account Dashboard" email 21 + 24 Sep 2026).
--
-- Flow: PRC received + certified amount confirmed -> "Certified, invoice pending"
-- -> Accounts previews Quotation | Progress Claim | Invoice, edits the lines,
-- issues the tax invoice (issue_claim_invoice) -> claim status 'invoiced',
-- invoice_date stamped, Payment chase starts.

-- 1. 'invoiced' claim status -------------------------------------------------
alter table public.claims drop constraint if exists claims_status_check;
alter table public.claims add constraint claims_status_check
  check (status = any (array['submitted','certified','invoiced','paid','pending','rejected']));

-- 2. internal_invoices carries the tax invoice as issued ------------------------
alter table public.internal_invoices drop constraint if exists internal_invoices_status_check;
alter table public.internal_invoices add constraint internal_invoices_status_check
  check (status = any (array['draft','issued','sent','paid','cancelled']));

alter table public.internal_invoices
  add column if not exists claim_id uuid references public.claims(id),
  add column if not exists claim_nos text,          -- "01, 02" when one PC covers several claims
  add column if not exists payment_cert text,       -- customer's Payment Certificate no.
  add column if not exists attn text,
  add column if not exists email text,
  add column if not exists site text,
  add column if not exists work_done text,          -- "Aug'26"
  add column if not exists quote_blocks jsonb,      -- [{kind:'main'|'vo', quoteRef, items:[{label,text}]}]
  add column if not exists cum_certified numeric,   -- Total Value of Certified (gross, to date)
  add column if not exists retention numeric,       -- retention held to date (positive)
  add column if not exists payment_received numeric,
  add column if not exists retention_rows jsonb,    -- page 2: [{label, certified, retention, payment}]
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by text;

create index if not exists internal_invoices_claim_id_idx on public.internal_invoices(claim_id);

-- 3. Running number: invoice no. = <running>/<YYYY>/<MM> ------------------------
-- Seeded one past the number on Accounts' template (320014/2026/09). CONFIRM with Accounts.
insert into public.chase_settings(key, value, note)
values ('invoice_next_no', 320015, 'Next tax-invoice running number (invoice no. = <n>/<YYYY>/<MM>); issue_claim_invoice advances it')
on conflict (key) do nothing;

-- 4. update_claim accepts the new status -------------------------------------
create or replace function public.update_claim(p_claim_id uuid, p_patch jsonb)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if v_status is not null and v_status not in ('submitted','certified','invoiced','paid','pending','rejected') then
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
end $function$;

-- 5. A payment reversal drops a 'paid' claim back to 'invoiced' when it has an invoice
create or replace function public.recompute_claim_paid(p_claim_id uuid)
 returns void
 language plpgsql
as $function$
declare v_paid numeric; v_expected numeric; v_last date; v_cert numeric; v_inv date;
begin
  select coalesce(sum(amount), 0), max(received_date) into v_paid, v_last from claim_receipts where claim_id = p_claim_id;
  select certified_amount, coalesce(certified_amount, total_amount, amount), invoice_date
    into v_cert, v_expected, v_inv from claims where id = p_claim_id;
  update claims set
    paid_amount = v_paid,
    paid_date   = case when v_expected is not null and v_paid >= v_expected - 0.005 then v_last else null end,
    status      = case
                    when v_expected is not null and v_paid >= v_expected - 0.005 then 'paid'
                    when status = 'paid' then (case when v_inv is not null then 'invoiced'
                                                    when v_cert is not null then 'certified'
                                                    else 'submitted' end)
                    else status
                  end,
    updated_at  = now()
  where id = p_claim_id;
end; $function$;

-- 6. Issue the tax invoice for a certified claim ------------------------------
-- p_invoice keys: invoice_number (optional; default <next>/<YYYY>/<MM>), invoice_date (default today),
-- client_name, client_address, attn, email, site, payment_cert, claim_nos, payment_terms, client_po,
-- work_done, quote_blocks (jsonb), cum_certified, retention, payment_received, amount, gst, total,
-- retention_rows (jsonb), description, remarks.
create or replace function public.issue_claim_invoice(p_claim_id uuid, p_invoice jsonb, p_actor text default null)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c record;
  v_date date := coalesce(nullif(p_invoice->>'invoice_date','')::date, current_date);
  v_next int;
  v_no text := nullif(trim(p_invoice->>'invoice_number'), '');
  v_run int;
  v_id uuid;
begin
  select cl.*, p.id as p_id into c from claims cl join projects p on p.id = cl.project_id where cl.id = p_claim_id;
  if not found then return json_build_object('ok', false, 'error', 'claim not found'); end if;
  if c.certified_amount is null then
    return json_build_object('ok', false, 'error', 'confirm the certified amount before issuing the invoice');
  end if;
  if c.invoice_date is not null then
    return json_build_object('ok', false, 'error', 'this claim already has an invoice (dated ' || to_char(c.invoice_date, 'DD Mon YYYY') || ')');
  end if;
  if exists (select 1 from internal_invoices where claim_id = p_claim_id and status <> 'cancelled') then
    return json_build_object('ok', false, 'error', 'this claim already has an issued invoice');
  end if;
  if (p_invoice->>'total') is null or (p_invoice->>'total')::numeric <= 0 then
    return json_build_object('ok', false, 'error', 'invoice total must be more than zero');
  end if;

  select value into v_next from chase_settings where key = 'invoice_next_no' for update;
  if v_no is null then
    v_no := coalesce(v_next, 1)::text || '/' || to_char(v_date, 'YYYY') || '/' || to_char(v_date, 'MM');
  end if;
  if exists (select 1 from internal_invoices where invoice_number = v_no) then
    return json_build_object('ok', false, 'error', 'invoice number ' || v_no || ' is already used');
  end if;

  insert into internal_invoices (
    invoice_number, project_id, project_code, claim_id, client_name, client_address, contact_person, email, attn, site,
    client_po, invoice_date, payment_terms, payment_cert, claim_nos, work_done, quote_blocks,
    cum_certified, retention, payment_received, amount, gst, total, retention_rows,
    status, description, remarks, issued_at, issued_by
  ) values (
    v_no, c.project_id, c.project_code, p_claim_id,
    coalesce(nullif(p_invoice->>'client_name',''), c.client_name),
    coalesce(nullif(p_invoice->>'client_address',''), c.client_address),
    c.contact_person,
    nullif(p_invoice->>'email',''), nullif(p_invoice->>'attn',''), nullif(p_invoice->>'site',''),
    nullif(p_invoice->>'client_po',''), v_date, nullif(p_invoice->>'payment_terms',''),
    nullif(p_invoice->>'payment_cert',''), nullif(p_invoice->>'claim_nos',''), nullif(p_invoice->>'work_done',''),
    p_invoice->'quote_blocks',
    nullif(p_invoice->>'cum_certified','')::numeric, nullif(p_invoice->>'retention','')::numeric,
    nullif(p_invoice->>'payment_received','')::numeric,
    (p_invoice->>'amount')::numeric, (p_invoice->>'gst')::numeric, (p_invoice->>'total')::numeric,
    p_invoice->'retention_rows',
    'issued',
    coalesce(nullif(p_invoice->>'description',''), c.project_name || ' — Progress Claim ' || lpad(coalesce(c.claim_no, 0)::text, 2, '0')),
    nullif(p_invoice->>'remarks',''), now(), nullif(p_actor, '')
  ) returning id into v_id;

  update claims set invoice_date = v_date, status = 'invoiced', updated_at = now() where id = p_claim_id;

  -- keep the running number ahead of anything issued
  v_run := nullif(substring(v_no from '^(\d+)'), '')::int;
  if v_run is not null and (v_next is null or v_run >= v_next) then
    update chase_settings set value = v_run + 1 where key = 'invoice_next_no';
  end if;

  return json_build_object('ok', true, 'invoice_id', v_id, 'invoice_number', v_no, 'invoice_date', v_date);
end $function$;

-- 7. Cancel an issued invoice (wrong figures): claim goes back to "invoice pending"
create or replace function public.void_claim_invoice(p_invoice_id uuid, p_actor text default null, p_reason text default null)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare i record;
begin
  select * into i from internal_invoices where id = p_invoice_id;
  if not found then return json_build_object('ok', false, 'error', 'invoice not found'); end if;
  if i.status = 'cancelled' then return json_build_object('ok', false, 'error', 'invoice is already cancelled'); end if;
  if i.claim_id is not null and exists (select 1 from claim_receipts where claim_id = i.claim_id) then
    return json_build_object('ok', false, 'error', 'payments are recorded against this claim; remove them first');
  end if;
  update internal_invoices set status = 'cancelled',
    remarks = trim(both E'\n' from coalesce(remarks, '') || E'\n' || 'Cancelled ' || to_char(now() at time zone 'Asia/Singapore', 'DD Mon YYYY HH24:MI')
              || coalesce(' by ' || nullif(p_actor, ''), '') || coalesce(': ' || nullif(p_reason, ''), ''))
  where id = p_invoice_id;
  if i.claim_id is not null then
    update claims set invoice_date = null,
      status = case when certified_amount is not null then 'certified' else status end,
      updated_at = now()
    where id = i.claim_id;
  end if;
  return json_build_object('ok', true, 'invoice_number', i.invoice_number);
end $function$;

grant execute on function public.issue_claim_invoice(uuid, jsonb, text) to anon, authenticated;
grant execute on function public.void_claim_invoice(uuid, text, text) to anon, authenticated;
