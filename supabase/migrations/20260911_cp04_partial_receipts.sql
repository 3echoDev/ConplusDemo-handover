-- CP04 — per-line partial receipts against issued POs (2026-09-11)
-- Run in the Supabase SQL editor for project ethxxhlpmfpnuaxeyshy. Idempotent.

begin;

-- purchase_orders.status has TWO overlapping CHECK constraints; neither allows 'partial'.
alter table public.purchase_orders drop constraint if exists po_status_valid;
alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check
  check (status = any (array['draft','pending','approved','rejected','issued','partial','delivered','closed','cancelled']));

-- Balances start equal to the ordered qty; nothing has ever decremented them.
update public.po_line_items set qty_balance = qty where qty_balance is null;

create or replace function public.log_delivery_lines(
  p_po_id uuid,
  p_do_number text,
  p_lines jsonb,
  p_delivery_date date default current_date,
  p_received_by_name text default null,
  p_notes text default null
) returns table(do_id uuid, po_number text, po_status text, lines_received int, fully_delivered boolean)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_po_status text; v_po_number text; v_do_id uuid;
  v_line jsonb; v_line_id uuid; v_qty numeric; v_remaining numeric; v_n int := 0;
  v_outstanding numeric;
begin
  if p_do_number is null or trim(p_do_number) = '' then
    raise exception 'do_number is required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty JSON array of {line_id, qty_received}';
  end if;

  select po.status, po.po_number into v_po_status, v_po_number
    from purchase_orders po where po.id = p_po_id for update;
  if v_po_number is null then raise exception 'PO % does not exist', p_po_id; end if;
  if v_po_status not in ('issued','partial') then
    raise exception 'PO % is in status %, expected issued or partial', v_po_number, v_po_status;
  end if;

  insert into delivery_orders (do_number, po_id, delivery_date, status, notes)
  values (trim(p_do_number), p_po_id, p_delivery_date, 'received',
          case when p_received_by_name is not null
               then 'Received by: ' || p_received_by_name || coalesce(E'\n' || p_notes, '')
               else p_notes end)
  returning id into v_do_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := (v_line->>'line_id')::uuid;
    v_qty := nullif(v_line->>'qty_received','')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;

    select coalesce(li.qty_balance, li.qty) into v_remaining
      from po_line_items li where li.id = v_line_id and li.po_id = p_po_id for update;
    if v_remaining is null then
      raise exception 'line % does not belong to PO %', v_line_id, v_po_number;
    end if;
    if v_qty > v_remaining then
      raise exception 'line % : received % exceeds outstanding %', v_line_id, v_qty, v_remaining;
    end if;

    update po_line_items set qty_balance = v_remaining - v_qty where id = v_line_id;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then raise exception 'no line had a positive qty_received'; end if;

  select coalesce(sum(coalesce(li.qty_balance, li.qty)), 0) into v_outstanding
    from po_line_items li where li.po_id = p_po_id;

  if v_outstanding <= 0 then
    update purchase_orders po
       set status = 'closed',
           actual_delivery_date = coalesce(po.actual_delivery_date, p_delivery_date),
           updated_at = now()
     where po.id = p_po_id;
    v_po_status := 'closed';
  else
    update purchase_orders po set status = 'partial', updated_at = now() where po.id = p_po_id;
    v_po_status := 'partial';
  end if;

  do_id := v_do_id; po_number := v_po_number; po_status := v_po_status;
  lines_received := v_n; fully_delivered := (v_po_status = 'closed');
  return next;
end $$;
grant execute on function public.log_delivery_lines(uuid, text, jsonb, date, text, text) to anon, authenticated, service_role;

create or replace view public.po_delivery_status as
select po.id as po_id,
       po.po_number,
       po.status,
       count(li.id)::int as line_count,
       coalesce(sum(li.qty), 0) as qty_ordered,
       coalesce(sum(li.qty - coalesce(li.qty_balance, li.qty)), 0) as qty_received,
       coalesce(sum(coalesce(li.qty_balance, li.qty)), 0) as qty_outstanding,
       case
         when count(li.id) = 0 then 'Pending'
         when coalesce(sum(coalesce(li.qty_balance, li.qty)), 0) <= 0 then 'Fully Delivered'
         when coalesce(sum(li.qty - coalesce(li.qty_balance, li.qty)), 0) > 0 then 'Partially Delivered'
         else 'Pending'
       end as delivery_status
  from purchase_orders po
  left join po_line_items li on li.po_id = po.id
 group by po.id, po.po_number, po.status;
grant select on public.po_delivery_status to anon, authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Smoke test for gate CP04B (run manually, then the cleanup block). Expected:
--   after DO ZZ-1 (60 of 100 on line A): po_status = 'partial', qty_outstanding = 50
--   after DO ZZ-2 (40 on A + 10 on B): po_status = 'closed', fully_delivered = true
-- ---------------------------------------------------------------------------
-- insert into purchase_orders (id, po_number, supplier_name, status, total_amount, created_date)
--   values ('11111111-1111-1111-1111-111111111111','ZZTEST-PO-1','ZZ Test Supplier','issued',0,current_date);
-- insert into po_line_items (id, po_id, description, qty, unit, unit_price, total_price)
--   values ('22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111','Line A',100,'pc',0,0),
--          ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Line B',10,'pc',0,0);
-- select * from log_delivery_lines('11111111-1111-1111-1111-111111111111','ZZ-1',
--   '[{"line_id":"22222222-2222-2222-2222-222222222221","qty_received":60}]', current_date, 'SMOKE', null);
-- select delivery_status, qty_outstanding from po_delivery_status where po_id='11111111-1111-1111-1111-111111111111';
-- select * from log_delivery_lines('11111111-1111-1111-1111-111111111111','ZZ-2',
--   '[{"line_id":"22222222-2222-2222-2222-222222222221","qty_received":40},{"line_id":"22222222-2222-2222-2222-222222222222","qty_received":10}]');
-- select status, actual_delivery_date from purchase_orders where id='11111111-1111-1111-1111-111111111111';
-- -- over-receipt must throw:
-- select * from log_delivery_lines('11111111-1111-1111-1111-111111111111','ZZ-3','[{"line_id":"22222222-2222-2222-2222-222222222221","qty_received":1}]');
-- -- cleanup (audit_log rows are written by triggers on all three tables):
-- delete from delivery_orders where po_id='11111111-1111-1111-1111-111111111111';
-- delete from po_line_items where po_id='11111111-1111-1111-1111-111111111111';
-- delete from purchase_orders where id='11111111-1111-1111-1111-111111111111';
-- delete from audit_log where record_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221','22222222-2222-2222-2222-222222222222')
--    or (table_name='delivery_orders' and new_data->>'po_id'='11111111-1111-1111-1111-111111111111');
