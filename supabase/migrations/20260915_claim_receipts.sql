-- Partial payments stay on the claim (client, 2026-09-15): "they partially paid
-- for Claim X, so they know what is the remainder for that Claim track".
--
-- Each payment received is a claim_receipts row. A trigger keeps
-- claims.paid_amount in step and only stamps claims.paid_date (which is what
-- takes a claim OUT of the payment chase) once the receipts cover the
-- certified amount (or the invoice amount when nothing is certified yet).
-- Until then the claim keeps chasing the outstanding balance, and the chase
-- email's {outstanding} placeholder is that balance.

alter table public.claims add column if not exists paid_amount numeric not null default 0;

create table if not exists public.claim_receipts (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.claims(id) on delete cascade,
  received_date date not null default current_date,
  amount        numeric not null check (amount > 0),
  reference     text,
  notes         text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists claim_receipts_claim_idx on public.claim_receipts (claim_id, received_date);

alter table public.claim_receipts enable row level security;
do $$ begin
  create policy "claim_receipts anon read" on public.claim_receipts for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
grant select on public.claim_receipts to anon, authenticated;

-- expected = certified amount when known, else the invoiced amount
create or replace function public.recompute_claim_paid(p_claim_id uuid)
returns void
language plpgsql
as $$
declare v_paid numeric; v_expected numeric; v_last date; v_cert numeric;
begin
  select coalesce(sum(amount), 0), max(received_date) into v_paid, v_last from claim_receipts where claim_id = p_claim_id;
  select certified_amount, coalesce(certified_amount, total_amount, amount) into v_cert, v_expected from claims where id = p_claim_id;
  update claims set
    paid_amount = v_paid,
    paid_date   = case when v_expected is not null and v_paid >= v_expected - 0.005 then v_last else null end,
    status      = case
                    when v_expected is not null and v_paid >= v_expected - 0.005 then 'paid'
                    when status = 'paid' then (case when v_cert is not null then 'certified' else 'submitted' end)
                    else status
                  end,
    updated_at  = now()
  where id = p_claim_id;
end; $$;

create or replace function public.trg_claim_receipts_recompute()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then perform recompute_claim_paid(old.claim_id); return old; end if;
  perform recompute_claim_paid(new.claim_id);
  if tg_op = 'UPDATE' and old.claim_id <> new.claim_id then perform recompute_claim_paid(old.claim_id); end if;
  return new;
end; $$;

drop trigger if exists claim_receipts_recompute on public.claim_receipts;
create trigger claim_receipts_recompute
  after insert or update or delete on public.claim_receipts
  for each row execute function public.trg_claim_receipts_recompute();

create or replace function public.log_claim_receipt(
  p_claim_id uuid,
  p_amount numeric,
  p_received_date date default current_date,
  p_reference text default null,
  p_notes text default null,
  p_actor text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; c claims%rowtype; v_expected numeric;
begin
  select * into c from claims where id = p_claim_id;
  if not found then return json_build_object('ok', false, 'error', 'claim not found'); end if;
  if p_amount is null or p_amount <= 0 then return json_build_object('ok', false, 'error', 'amount must be greater than 0'); end if;
  insert into claim_receipts (claim_id, received_date, amount, reference, notes, created_by)
  values (p_claim_id, coalesce(p_received_date, current_date), p_amount, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), nullif(trim(p_actor), ''))
  returning id into v_id;
  select * into c from claims where id = p_claim_id;  -- after trigger
  v_expected := coalesce(c.certified_amount, c.total_amount, c.amount);
  return json_build_object('ok', true, 'receipt_id', v_id, 'claim_number', c.claim_number,
    'paid_amount', c.paid_amount, 'expected', v_expected,
    'outstanding', greatest(coalesce(v_expected, 0) - c.paid_amount, 0),
    'fully_paid', c.paid_date is not null, 'paid_date', c.paid_date, 'status', c.status);
end; $$;

create or replace function public.delete_claim_receipt(p_receipt_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_claim uuid; c claims%rowtype;
begin
  delete from claim_receipts where id = p_receipt_id returning claim_id into v_claim;
  if v_claim is null then return json_build_object('ok', false, 'error', 'receipt not found'); end if;
  select * into c from claims where id = v_claim;
  return json_build_object('ok', true, 'paid_amount', c.paid_amount, 'paid_date', c.paid_date, 'status', c.status);
end; $$;

grant execute on function public.log_claim_receipt(uuid, numeric, date, text, text, text) to anon, authenticated;
grant execute on function public.delete_claim_receipt(uuid) to anon, authenticated;

-- payment_chase: append paid_amount / certified_amount / outstanding_amount (existing columns unchanged)
create or replace view public.payment_chase as
 WITH base AS (
         SELECT c.id AS claim_id, c.claim_number, c.claim_no, c.project_id, c.project_code, c.project_name, c.client_name,
            c.contact_person, c.contact_number, c.amount, c.total_amount, c.certified_amount, c.invoice_date, c.paid_date, c.prc_date,
            c.paid_amount,
            p.sales_manager, p.contact_email,
            COALESCE(p.payment_terms_days, ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_terms_default'::text)) AS terms_days,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_reminder_1'::text) AS r1,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_reminder_2'::text) AS r2,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_reminder_final'::text) AS rf,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_soa_every'::text) AS soa_every,
            ( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'chase_from_days_ago'::text) AS from_days,
            ( SELECT max(r.sent_at) AS max FROM chase_reminders r WHERE r.claim_id = c.id AND r.clock = 'payment'::text AND r.decision = 'proceed'::text) AS last_sent_at
           FROM claims c JOIN projects p ON p.id = c.project_id
          WHERE c.invoice_date IS NOT NULL
        ), calc AS (
         SELECT base.*,
            (base.invoice_date + ((base.terms_days || ' days'::text)::interval))::date AS due_date,
            CURRENT_DATE - base.invoice_date AS days_since_invoice,
            (base.invoice_date + ((base.terms_days || ' days'::text)::interval))::date - CURRENT_DATE AS days_to_due,
            CASE WHEN base.last_sent_at IS NOT NULL THEN CURRENT_DATE - base.last_sent_at::date ELSE NULL::integer END AS days_since_last_sent,
            CASE WHEN base.last_sent_at IS NULL THEN (base.invoice_date + ((base.terms_days || ' days'::text)::interval))::date
                 ELSE base.last_sent_at::date + (( SELECT chase_settings.value FROM chase_settings WHERE chase_settings.key = 'pay_soa_every'::text)) END AS next_flag_date
           FROM base
        )
 SELECT calc.claim_id, calc.claim_number, calc.claim_no, calc.project_id, calc.project_code, calc.project_name, calc.client_name,
    calc.contact_person, calc.contact_number, calc.sales_manager,
    COALESCE(calc.total_amount, calc.amount) AS invoice_amount,
    calc.invoice_date, calc.due_date, calc.terms_days, calc.days_since_invoice, calc.days_to_due, calc.last_sent_at, calc.days_since_last_sent,
    calc.next_flag_date, calc.next_flag_date - CURRENT_DATE AS days_to_next_flag,
    CASE WHEN calc.paid_date IS NOT NULL THEN 'paid'::text
         WHEN calc.days_to_due > 0 THEN 'soa'::text
         WHEN calc.days_since_invoice >= calc.rf THEN 'final'::text
         WHEN calc.days_since_invoice >= calc.r2 THEN '2nd'::text
         WHEN calc.days_since_invoice >= calc.r1 THEN '1st'::text
         ELSE 'soa_overdue'::text END AS stage,
    CASE WHEN calc.paid_date IS NOT NULL THEN NULL::text
         WHEN reminders_count.n = 0 THEN '1st'::text
         WHEN reminders_count.n = 1 THEN '2nd'::text
         WHEN reminders_count.n = 2 THEN 'final'::text
         ELSE 'final'::text END AS next_reminder_label,
    CASE WHEN calc.paid_date IS NOT NULL THEN false
         WHEN calc.days_to_due > 0 THEN false
         WHEN calc.last_sent_at IS NULL THEN true
         WHEN calc.days_since_last_sent >= calc.soa_every THEN true
         ELSE false END AS needs_action_today,
    calc.days_to_due <= 0 AS notify_salesperson,
    calc.paid_date IS NOT NULL AS paid,
    (EXISTS ( SELECT 1 FROM chase_holds h WHERE h.claim_id = calc.claim_id AND h.active AND (h.clock = ANY (ARRAY['payment'::text, 'both'::text])))) AS on_hold,
    reminders_count.n AS reminders_sent,
    calc.contact_email, calc.prc_date, calc.paid_date,
    calc.paid_amount,
    calc.certified_amount,
    GREATEST(COALESCE(calc.certified_amount, calc.total_amount, calc.amount, 0) - calc.paid_amount, 0) AS outstanding_amount
   FROM calc
     CROSS JOIN LATERAL ( SELECT count(*) AS n FROM chase_reminders r WHERE r.claim_id = calc.claim_id AND r.clock = 'payment'::text AND r.decision = 'proceed'::text) reminders_count
  WHERE calc.paid_date IS NULL AND calc.days_since_invoice <= calc.from_days;
