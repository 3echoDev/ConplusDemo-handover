-- Cancel a purchase order (Wendy, 27 Oct + 3 Nov 2026: six July POs left "pending approval").
-- The app runs as anon (SELECT only on purchase_orders), so a direct UPDATE from the UI is a
-- silent no-op; like po_approve / po_reject this runs as SECURITY DEFINER.
create or replace function public.po_cancel(p_po_id uuid, p_reason text default null)
returns table(po_number text, new_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po_number  text;
  v_new_status text;
  v_old_status text;
begin
  select po.status into v_old_status from purchase_orders po where po.id = p_po_id;
  if v_old_status is null then
    raise exception 'PO % does not exist', p_po_id;
  end if;
  if v_old_status not in ('draft', 'pending', 'approved') then
    raise exception 'PO % is % and cannot be cancelled (only draft, pending or approved)', p_po_id, v_old_status;
  end if;

  update purchase_orders po
     set status = 'cancelled',
         rejection_reason = coalesce(nullif(trim(p_reason), ''), po.rejection_reason),
         updated_at = now()
   where po.id = p_po_id
   returning po.po_number, po.status into v_po_number, v_new_status;

  insert into audit_log (table_name, record_id, action, old_data, new_data)
  values ('purchase_orders', p_po_id, 'cancel',
          jsonb_build_object('status', v_old_status),
          jsonb_build_object('status', 'cancelled', 'reason', p_reason));

  -- clear the pending-approval alert, if any
  update alerts a
     set is_resolved = true, resolved_at = now()
   where a.type = 'po_pending' and a.is_resolved = false and a.title ilike '%' || v_po_number || '%';

  po_number  := v_po_number;
  new_status := v_new_status;
  return next;
end $$;

grant execute on function public.po_cancel(uuid, text) to anon, authenticated;
