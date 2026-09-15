-- Available vs Reserved stock (requirements MM-02..MM-68, PR-07..PR-28).
--
-- A reservation is an ALLOCATION ONLY: the material stays in the store and
-- materials.qty_on_hand (physical) does not move. It only moves through
-- material_movements (Store form / Excel import). Per material:
--
--   physical  = materials.qty_on_hand
--   reserved  = Σ (allocated_qty − used_qty) over ACTIVE rows in material_allocations
--   available = physical − reserved
--
-- material_allocations already existed (5 rows imported from project-costing
-- spreadsheets on 2026-07-07 as WO budgets, not physical reservations). Those
-- are flagged status = 'legacy' so the client starts from a clean position.
--
-- log_material_movement is replaced with a reservation-aware version: an OUT
-- to a project first consumes that project's own reservation, and an OUT can
-- never take stock that is reserved for a different project.

alter table public.material_allocations
  add column if not exists status text not null default 'active',
  add column if not exists wo_number text,
  add column if not exists project_site text,
  add column if not exists created_by text,
  add column if not exists released_at timestamptz,
  add column if not exists released_by text;

do $$ begin
  alter table public.material_allocations
    add constraint material_allocations_status_check
    check (status in ('active','released','closed','legacy'));
exception when duplicate_object then null; end $$;

update public.material_allocations set status = 'legacy'
 where status = 'active' and created_by is null and notes like 'Imported from %';

create index if not exists material_allocations_active_idx
  on public.material_allocations (material_id) where status = 'active';

-- ---------------------------------------------------------------- views

create or replace view public.material_stock_position as
select m.id,
       m.name,
       m.item_code,
       m.supplier_name,
       m.unit,
       m.storage_location,
       m.qty_on_hand                                         as physical_qty,
       coalesce(r.reserved_qty, 0)                           as reserved_qty,
       m.qty_on_hand - coalesce(r.reserved_qty, 0)           as available_qty,
       coalesce(r.active_reservations, 0)                    as active_reservations,
       m.reorder_point,
       m.is_active
  from public.materials m
  left join (
    select material_id,
           sum(greatest(allocated_qty - coalesce(used_qty, 0), 0)) as reserved_qty,
           count(*) as active_reservations
      from public.material_allocations
     where status = 'active'
     group by material_id
  ) r on r.material_id = m.id
 where m.is_active is not false;

create or replace view public.project_reservations as
select a.id,
       a.material_id,
       m.name                                                 as material_name,
       m.unit,
       a.project_id,
       a.project_code,
       coalesce(p.name, a.project_name)                       as project_name,
       coalesce(a.project_site, p.location)                   as project_site,
       a.wo_number,
       a.allocated_qty,
       coalesce(a.used_qty, 0)                                as used_qty,
       greatest(a.allocated_qty - coalesce(a.used_qty, 0), 0) as remaining_qty,
       a.status,
       a.notes,
       a.created_by,
       a.created_at,
       a.released_at,
       a.released_by
  from public.material_allocations a
  join public.materials m on m.id = a.material_id
  left join public.projects p on p.id = a.project_id or (a.project_id is null and p.project_code = a.project_code);

-- stock_watchlist gains reserved / available (columns appended; existing readers unaffected)
create or replace view public.stock_watchlist as
select m.id,
       m.name,
       m.item_code,
       m.supplier_name,
       m.unit,
       m.storage_location,
       m.qty_on_hand,
       m.reorder_point,
       case
         when m.reorder_point is not null then
           case
             when m.qty_on_hand <= 0 then 'out'
             when m.qty_on_hand <= m.reorder_point then 'critical'
             when m.qty_on_hand <= (m.reorder_point * 1.5) then 'low'
             else 'ok'
           end
         else
           case
             when m.qty_on_hand <= 0 then 'out'
             when m.qty_on_hand <= 1 then 'critical'
             when m.qty_on_hand <= 3 then 'low'
             else 'ok'
           end
       end as stock_status,
       m.reorder_point is null as threshold_is_default,
       coalesce(r.reserved_qty, 0)                 as reserved_qty,
       m.qty_on_hand - coalesce(r.reserved_qty, 0) as available_qty
  from public.materials m
  left join (
    select material_id, sum(greatest(allocated_qty - coalesce(used_qty, 0), 0)) as reserved_qty
      from public.material_allocations where status = 'active' group by material_id
  ) r on r.material_id = m.id
 where m.is_active is not false;

grant select on public.material_stock_position, public.project_reservations to anon, authenticated;

-- ---------------------------------------------------------------- RPCs

-- Reserve stock for a project. Reserves min(requested, available) unless
-- p_allow_partial is false, in which case a shortfall is an error.
create or replace function public.reserve_material(
  p_material_id uuid,
  p_project_code text,
  p_qty numeric,
  p_wo_number text default null,
  p_notes text default null,
  p_actor text default null,
  p_allow_partial boolean default true
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mat materials%rowtype;
  v_proj projects%rowtype;
  v_reserved numeric;
  v_available numeric;
  v_take numeric;
  v_id uuid;
begin
  if p_qty is null or p_qty <= 0 then
    return json_build_object('ok', false, 'error', 'qty must be a positive number');
  end if;
  select * into v_mat from materials where id = p_material_id;
  if not found then
    return json_build_object('ok', false, 'error', 'material not found');
  end if;
  select * into v_proj from projects where project_code = p_project_code;
  if not found then
    return json_build_object('ok', false, 'error', 'unknown project code "' || coalesce(p_project_code, '') || '"');
  end if;

  select coalesce(sum(greatest(allocated_qty - coalesce(used_qty, 0), 0)), 0) into v_reserved
    from material_allocations where material_id = p_material_id and status = 'active';
  v_available := coalesce(v_mat.qty_on_hand, 0) - v_reserved;

  if v_available <= 0 then
    return json_build_object('ok', false, 'error',
      format('%s: nothing available (%s in store, %s already reserved)', v_mat.name, coalesce(v_mat.qty_on_hand, 0), v_reserved));
  end if;
  if p_qty > v_available and not p_allow_partial then
    return json_build_object('ok', false, 'error',
      format('%s: only %s available (%s in store, %s reserved)', v_mat.name, v_available, coalesce(v_mat.qty_on_hand, 0), v_reserved));
  end if;
  v_take := least(p_qty, v_available);

  insert into material_allocations (material_id, project_id, project_code, project_name, project_site,
                                    wo_number, allocated_qty, used_qty, notes, created_by, status)
  values (v_mat.id, v_proj.id, v_proj.project_code, v_proj.name, v_proj.location,
          nullif(trim(p_wo_number), ''), v_take, 0, nullif(trim(p_notes), ''), nullif(trim(p_actor), ''), 'active')
  returning id into v_id;

  return json_build_object('ok', true, 'reservation_id', v_id, 'material', v_mat.name,
    'project_code', v_proj.project_code, 'reserved', v_take, 'shortfall', p_qty - v_take,
    'available_after', v_available - v_take);
end; $$;

-- Release all (or part) of a reservation back to Available.
create or replace function public.release_reservation(
  p_reservation_id uuid,
  p_actor text default null,
  p_qty numeric default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row material_allocations%rowtype;
  v_remaining numeric;
begin
  select * into v_row from material_allocations where id = p_reservation_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'reservation not found');
  end if;
  if v_row.status <> 'active' then
    return json_build_object('ok', false, 'error', 'reservation is already ' || v_row.status);
  end if;
  v_remaining := greatest(v_row.allocated_qty - coalesce(v_row.used_qty, 0), 0);
  if p_qty is null or p_qty >= v_remaining then
    update material_allocations
       set status = 'released', released_at = now(), released_by = nullif(trim(p_actor), ''),
           allocated_qty = coalesce(used_qty, 0) + 0, updated_at = now()
     where id = p_reservation_id;
    -- allocated_qty is shrunk to what was actually used so history stays truthful
    return json_build_object('ok', true, 'released', v_remaining, 'remaining', 0, 'status', 'released');
  end if;
  if p_qty <= 0 then
    return json_build_object('ok', false, 'error', 'qty must be positive');
  end if;
  update material_allocations
     set allocated_qty = allocated_qty - p_qty, updated_at = now()
   where id = p_reservation_id;
  return json_build_object('ok', true, 'released', p_qty, 'remaining', v_remaining - p_qty, 'status', 'active');
end; $$;

-- Reservation-aware Store movement. Same signature and return shape as before,
-- plus reservation_consumed / available_after.
create or replace function public.log_material_movement(
  p_material_id uuid,
  p_direction text,
  p_qty numeric,
  p_project_ref text default 'Store',
  p_remarks text default null,
  p_doc_ref text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mat materials%rowtype;
  v_sno int;
  v_remarks text;
  v_new_balance numeric;
  v_id uuid;
  v_is_project boolean;
  v_reserved_total numeric := 0;
  v_reserved_own numeric := 0;
  v_available numeric;
  v_allowed numeric;
  v_consumed numeric := 0;
  v_left numeric;
  v_res record;
  v_take numeric;
begin
  if p_direction not in ('in','out') then
    return json_build_object('ok', false, 'error', 'direction must be in or out');
  end if;
  if p_qty is null or p_qty <= 0 then
    return json_build_object('ok', false, 'error', 'qty must be a positive number');
  end if;

  select * into v_mat from materials where id = p_material_id;
  if not found then
    return json_build_object('ok', false, 'error', 'material not found');
  end if;

  v_is_project := p_project_ref not in ('Store','Sample','-');
  if v_is_project and not exists (select 1 from projects where project_code = p_project_ref) then
    return json_build_object('ok', false, 'error',
      'unknown project ref "' || p_project_ref || '" — use a real project code (e.g. E25001), or Store/Sample');
  end if;

  if p_direction = 'out' then
    select coalesce(sum(greatest(allocated_qty - coalesce(used_qty, 0), 0)), 0) into v_reserved_total
      from material_allocations where material_id = p_material_id and status = 'active';
    if v_is_project then
      select coalesce(sum(greatest(allocated_qty - coalesce(used_qty, 0), 0)), 0) into v_reserved_own
        from material_allocations
       where material_id = p_material_id and status = 'active' and project_code = p_project_ref;
    end if;
    v_available := coalesce(v_mat.qty_on_hand, 0) - v_reserved_total;
    v_allowed := v_available + v_reserved_own;
    if p_qty > v_allowed then
      return json_build_object('ok', false, 'error',
        format('%s: only %s can go out for %s (%s in store, %s reserved for other projects%s)',
               v_mat.name, v_allowed, p_project_ref, coalesce(v_mat.qty_on_hand, 0),
               v_reserved_total - v_reserved_own,
               case when v_reserved_own > 0 then format(', %s reserved for this project', v_reserved_own) else '' end));
    end if;
  end if;

  select coalesce(max(sno),0) + 1 into v_sno from material_movements;
  v_remarks := trim(both ' ' from coalesce(p_doc_ref || ' ', '') || coalesce(p_remarks, ''));
  if v_remarks = '' then v_remarks := null; end if;

  if p_direction = 'in' then
    insert into material_movements (material_id, supplier_name, location, uom,
      coating_type, qty_in, date_in, project_in, remarks_in, sno, source)
    values (v_mat.id, v_mat.supplier_name, v_mat.storage_location, v_mat.unit,
      v_mat.coating_type, p_qty, to_char(current_date,'YYYY-MM-DD'), p_project_ref, v_remarks,
      v_sno, 'store_form')
    returning id into v_id;
  else
    insert into material_movements (material_id, supplier_name, location, uom,
      coating_type, qty_out, date_out, project_out, remarks_out, sno, source)
    values (v_mat.id, v_mat.supplier_name, v_mat.storage_location, v_mat.unit,
      v_mat.coating_type, p_qty, to_char(current_date,'YYYY-MM-DD'), p_project_ref, v_remarks,
      v_sno, 'store_form')
    returning id into v_id;

    -- issue against this project's reservations, oldest first
    if v_is_project and v_reserved_own > 0 then
      v_left := p_qty;
      for v_res in
        select id, allocated_qty - coalesce(used_qty, 0) as remaining
          from material_allocations
         where material_id = p_material_id and status = 'active' and project_code = p_project_ref
           and allocated_qty - coalesce(used_qty, 0) > 0
         order by created_at
         for update
      loop
        exit when v_left <= 0;
        v_take := least(v_left, v_res.remaining);
        update material_allocations
           set used_qty = coalesce(used_qty, 0) + v_take,
               status = case when coalesce(used_qty, 0) + v_take >= allocated_qty then 'closed' else status end,
               updated_at = now()
         where id = v_res.id;
        v_consumed := v_consumed + v_take;
        v_left := v_left - v_take;
      end loop;
    end if;
  end if;

  select qty_on_hand into v_new_balance from materials where id = p_material_id;
  select coalesce(sum(greatest(allocated_qty - coalesce(used_qty, 0), 0)), 0) into v_reserved_total
    from material_allocations where material_id = p_material_id and status = 'active';

  return json_build_object('ok', true, 'movement_id', v_id, 'sno', v_sno,
    'material', v_mat.name, 'direction', p_direction, 'qty', p_qty,
    'new_balance', v_new_balance,
    'reservation_consumed', v_consumed,
    'reserved_after', v_reserved_total,
    'available_after', v_new_balance - v_reserved_total);
end; $$;

grant execute on function public.reserve_material(uuid, text, numeric, text, text, text, boolean) to anon, authenticated;
grant execute on function public.release_reservation(uuid, text, numeric) to anon, authenticated;
