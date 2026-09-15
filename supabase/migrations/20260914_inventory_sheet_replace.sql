-- Snapshot import of the Material_Inventory_Record (Sheet2) into material_movements.
--
-- Supersedes import_inventory_rows (upsert by S/No.) from earlier today: the
-- sheet's S/No. is a ROW() formula and renumbers whenever a line is inserted
-- or deleted, so it is not a key. Each upload now REPLACES every row with
-- source = 'inventory_record_sheet2'; rows from the Store form are untouched.
-- The AFTER trigger movements_recompute_balance recomputes qty_on_hand for
-- every material touched by the delete and the insert.
--
-- Material names are the catalog: p_rows carries material_id when the app
-- matched an existing row, otherwise material_name and the RPC creates the
-- material (unit / shelf life from the workbook's "Material" sheet when given).
-- Old materials left with no movement rows at all are deactivated when
-- p_deactivate_orphans is true, so the watchlist stops listing them as "out".
--
-- One transaction: any bad row rolls back everything, including the delete.

drop function if exists public.import_inventory_rows(jsonb, text, boolean);

create or replace function public.replace_inventory_sheet(
  p_rows jsonb,
  p_actor text default null,
  p_create_missing boolean default true,
  p_deactivate_orphans boolean default true
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_sno int;
  v_material_id uuid;
  v_material_name text;
  v_before uuid[];
  v_deleted int := 0;
  v_inserted int := 0;
  v_created_names text[] := '{}';
  v_touched uuid[] := '{}';
  v_deactivated text[] := '{}';
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'the sheet has no stock rows — refusing to wipe the ledger';
  end if;

  select coalesce(array_agg(distinct material_id), '{}') into v_before
    from material_movements where source = 'inventory_record_sheet2' and material_id is not null;

  delete from material_movements where source = 'inventory_record_sheet2';
  get diagnostics v_deleted = row_count;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_sno := (r->>'sno')::int;
    if v_sno is null or v_sno <= 0 then
      raise exception 'row without a positive S/No.: %', r;
    end if;

    v_material_id := nullif(r->>'material_id', '')::uuid;
    v_material_name := nullif(trim(r->>'material_name'), '');

    if v_material_id is null then
      if v_material_name is null then
        raise exception 'S/No. % has no material name', v_sno;
      end if;
      -- rows created earlier in this same call must be found, not duplicated
      select id into v_material_id
        from materials
       where lower(regexp_replace(name, '\s+', ' ', 'g')) = lower(regexp_replace(v_material_name, '\s+', ' ', 'g'))
       order by is_active desc, created_at
       limit 1;
      if v_material_id is null then
        if not p_create_missing then
          raise exception 'S/No. %: material "%" not found', v_sno, v_material_name;
        end if;
        insert into materials (item_code, name, unit, stock_unit, supplier_name, storage_location,
                               coating_type, expiry_date, shelf_life,
                               shelf_life_a, shelf_life_b, shelf_life_c, shelf_life_d, is_active)
        values (v_material_name, v_material_name,
                coalesce(nullif(r->>'uom',''), 'pails'), nullif(r->>'stock_unit',''),
                nullif(r->>'supplier_name',''), nullif(r->>'location',''),
                nullif(r->>'coating_type',''), nullif(r->>'expiry_date',''),
                coalesce(nullif(r->>'shelf_life',''), nullif(r->>'shelf_life_a','')),
                nullif(r->>'shelf_life_a',''), nullif(r->>'shelf_life_b',''),
                nullif(r->>'shelf_life_c',''), nullif(r->>'shelf_life_d',''), true)
        returning id into v_material_id;
        v_created_names := v_created_names || v_material_name;
      end if;
    elsif not exists (select 1 from materials where id = v_material_id) then
      raise exception 'S/No. %: material id % does not exist', v_sno, v_material_id;
    end if;

    -- a material the sheet references again must be active
    update materials set is_active = true where id = v_material_id and is_active is false;

    insert into material_movements (
      material_id, supplier_name, location, packing, uom, expiry_date, coating_type, shelf_life,
      qty_in, date_in, project_in, remarks_in,
      qty_out, date_out, project_out, remarks_out,
      sno, source, imported_at)
    values (
      v_material_id,
      nullif(r->>'supplier_name',''), nullif(r->>'location',''),
      nullif(r->>'packing','')::numeric, nullif(r->>'uom',''),
      nullif(r->>'expiry_date',''), nullif(r->>'coating_type',''), nullif(r->>'shelf_life',''),
      coalesce(nullif(r->>'qty_in','')::numeric, 0), nullif(r->>'date_in',''),
      nullif(r->>'project_in',''), nullif(r->>'remarks_in',''),
      coalesce(nullif(r->>'qty_out','')::numeric, 0), nullif(r->>'date_out',''),
      nullif(r->>'project_out',''), nullif(r->>'remarks_out',''),
      v_sno, 'inventory_record_sheet2', now());
    v_inserted := v_inserted + 1;

    if not (v_material_id = any(v_touched)) then
      v_touched := v_touched || v_material_id;
    end if;
  end loop;

  -- materials that had sheet rows, got none now, and have no other rows either
  if p_deactivate_orphans then
    select coalesce(array_agg(m.name order by m.name), '{}') into v_deactivated
      from materials m
     where m.id = any(v_before)
       and not (m.id = any(v_touched))
       and m.is_active is not false
       and not exists (select 1 from material_movements mm where mm.material_id = m.id);
    update materials m set is_active = false
     where m.id = any(v_before)
       and not (m.id = any(v_touched))
       and m.is_active is not false
       and not exists (select 1 from material_movements mm where mm.material_id = m.id);
  end if;

  -- audit_log.action is CHECK-constrained (insert/update/delete/…); one 'update'
  -- tagged kind = import_inventory_sheet records the whole upload.
  insert into audit_log (table_name, record_id, action, new_data)
  values ('material_movements', gen_random_uuid(), 'update',
          jsonb_build_object('kind', 'import_inventory_sheet', 'actor', p_actor,
                             'deleted', v_deleted, 'inserted', v_inserted,
                             'created_materials', to_jsonb(v_created_names),
                             'deactivated_materials', to_jsonb(v_deactivated),
                             'materials_touched', coalesce(array_length(v_touched, 1), 0)));

  return json_build_object(
    'ok', true,
    'deleted', v_deleted,
    'inserted', v_inserted,
    'created_materials', coalesce(array_length(v_created_names, 1), 0),
    'created_material_names', to_jsonb(v_created_names),
    'deactivated_materials', coalesce(array_length(v_deactivated, 1), 0),
    'deactivated_material_names', to_jsonb(v_deactivated),
    'materials_touched', coalesce(array_length(v_touched, 1), 0));
end;
$$;

grant execute on function public.replace_inventory_sheet(jsonb, text, boolean, boolean) to anon, authenticated;
