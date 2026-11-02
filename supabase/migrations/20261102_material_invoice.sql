-- Supply-of-materials tax invoice (Accounts' second invoice format, 2 Nov 2026).
--
-- Same internal_invoices register and the same running number as the progress-claim
-- invoice; the row carries the Works Order it bills, the customer's PO / our DO no.
-- and the item lines. Additive.

alter table public.internal_invoices
  add column if not exists kind    text not null default 'progress_claim',
  add column if not exists wo_id   uuid references public.works_orders(id),
  add column if not exists wo_no   text,
  add column if not exists do_no   text,
  add column if not exists tel     text,
  add column if not exists lines   jsonb;          -- [{description, unit_price, qty, unit, total}]

alter table public.internal_invoices drop constraint if exists internal_invoices_kind_check;
alter table public.internal_invoices add constraint internal_invoices_kind_check
  check (kind in ('progress_claim', 'material_supply'));

create index if not exists internal_invoices_wo_id_idx on public.internal_invoices(wo_id);

create or replace function public.issue_material_invoice(p_wo_id uuid, p_invoice jsonb, p_actor text default null)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  w record;
  v_date date := coalesce(nullif(p_invoice->>'invoice_date','')::date, current_date);
  v_next int;
  v_no text := nullif(trim(p_invoice->>'invoice_number'), '');
  v_run int;
  v_id uuid;
begin
  select wo.*, p.project_code as p_code into w from works_orders wo left join projects p on p.id = wo.project_id where wo.id = p_wo_id;
  if not found then return json_build_object('ok', false, 'error', 'works order not found'); end if;
  if (p_invoice->>'total') is null or (p_invoice->>'total')::numeric <= 0 then
    return json_build_object('ok', false, 'error', 'invoice total must be more than zero');
  end if;
  if jsonb_array_length(coalesce(p_invoice->'lines', '[]'::jsonb)) = 0 then
    return json_build_object('ok', false, 'error', 'add at least one item');
  end if;

  select value into v_next from chase_settings where key = 'invoice_next_no' for update;
  if v_no is null then
    v_no := coalesce(v_next, 1)::text || '/' || to_char(v_date, 'YYYY') || '/' || to_char(v_date, 'MM');
  end if;
  if exists (select 1 from internal_invoices where invoice_number = v_no) then
    return json_build_object('ok', false, 'error', 'invoice number ' || v_no || ' is already used');
  end if;

  insert into internal_invoices (
    invoice_number, kind, project_id, project_code, wo_id, wo_no, do_no, client_name, client_address, contact_person,
    attn, tel, site, client_po, invoice_date, payment_terms, lines, amount, gst, total,
    status, description, remarks, issued_at, issued_by
  ) values (
    v_no, 'material_supply', w.project_id, w.p_code, p_wo_id,
    coalesce(nullif(p_invoice->>'wo_no',''), w.wo_number), nullif(p_invoice->>'do_no',''),
    nullif(p_invoice->>'client_name',''), nullif(p_invoice->>'client_address',''), nullif(p_invoice->>'attn',''),
    nullif(p_invoice->>'attn',''), nullif(p_invoice->>'tel',''), nullif(p_invoice->>'site',''),
    nullif(p_invoice->>'client_po',''), v_date, nullif(p_invoice->>'payment_terms',''),
    p_invoice->'lines',
    (p_invoice->>'amount')::numeric, (p_invoice->>'gst')::numeric, (p_invoice->>'total')::numeric,
    'issued',
    coalesce(nullif(p_invoice->>'description',''), 'Supply of material — WO ' || coalesce(w.wo_number, '')),
    nullif(p_invoice->>'remarks',''), now(), nullif(p_actor, '')
  ) returning id into v_id;

  v_run := nullif(substring(v_no from '^(\d+)'), '')::int;
  if v_run is not null and (v_next is null or v_run >= v_next) then
    update chase_settings set value = v_run + 1 where key = 'invoice_next_no';
  end if;

  return json_build_object('ok', true, 'invoice_id', v_id, 'invoice_number', v_no, 'invoice_date', v_date);
end $function$;

grant execute on function public.issue_material_invoice(uuid, jsonb, text) to anon, authenticated;
