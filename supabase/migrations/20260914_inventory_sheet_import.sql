-- Excel re-upload of the Material_Inventory_Record (Sheet2) into material_movements.
--
-- material_movements already mirrors the sheet row-for-row: source =
-- 'inventory_record_sheet2', sno = the sheet's S/No. (rows 1..234 from the
-- 2026-08-26 bulk load). This RPC lets the Stock Import page (/store/import)
-- upsert by S/No. so the client can keep maintaining the workbook and drop it
-- on the app whenever it changes. The AFTER trigger movements_recompute_balance
-- recomputes materials.qty_on_hand for every touched material.
--
-- The whole call is one transaction: any bad row rolls back everything.

create unique index if not exists material_movements_sheet_sno_uniq
  on public.material_movements (sno)
  where source = 'inventory_record_sheet2';

create or replace function public.import_inventory_rows(
  p_rows jsonb,
  p_actor text default null,
  p_create_missing boolean default false
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
  v_inserted int := 0;
  v_updated int := 0;
  v_created_materials int := 0;
  v_created_names text[] := '{}';
  v_touched uuid[] := '{}';
  v_existing_id uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

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
      -- last-chance exact match before creating anything
      select id into v_material_id
        from materials
       where lower(regexp_replace(name, '\s+', ' ', 'g')) = lower(regexp_replace(v_material_name, '\s+', ' ', 'g'))
       limit 1;
      if v_material_id is null then
        if not p_create_missing then
          raise exception 'S/No. %: material "%" not found (create it first or tick "create missing materials")', v_sno, v_material_name;
        end if;
        insert into materials (item_code, name, unit, supplier_name, storage_location,
                               coating_type, expiry_date, shelf_life, is_active)
        values (v_material_name, v_material_name, coalesce(nullif(r->>'uom',''), 'pails'),
                nullif(r->>'supplier_name',''), nullif(r->>'location',''),
                nullif(r->>'coating_type',''), nullif(r->>'expiry_date',''),
                nullif(r->>'shelf_life',''), true)
        returning id into v_material_id;
        v_created_materials := v_created_materials + 1;
        v_created_names := v_created_names || v_material_name;
      end if;
    elsif not exists (select 1 from materials where id = v_material_id) then
      raise exception 'S/No. %: material id % does not exist', v_sno, v_material_id;
    end if;

    select id into v_existing_id
      from material_movements
     where source = 'inventory_record_sheet2' and sno = v_sno;

    if v_existing_id is null then
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
    else
      update material_movements set
        material_id  = v_material_id,
        supplier_name = nullif(r->>'supplier_name',''),
        location     = nullif(r->>'location',''),
        packing      = nullif(r->>'packing','')::numeric,
        uom          = nullif(r->>'uom',''),
        expiry_date  = nullif(r->>'expiry_date',''),
        coating_type = nullif(r->>'coating_type',''),
        shelf_life   = coalesce(nullif(r->>'shelf_life',''), shelf_life),  -- sheet column is a lookup formula; keep ours when blank
        qty_in       = coalesce(nullif(r->>'qty_in','')::numeric, 0),
        date_in      = nullif(r->>'date_in',''),
        project_in   = nullif(r->>'project_in',''),
        remarks_in   = nullif(r->>'remarks_in',''),
        qty_out      = coalesce(nullif(r->>'qty_out','')::numeric, 0),
        date_out     = nullif(r->>'date_out',''),
        project_out  = nullif(r->>'project_out',''),
        remarks_out  = nullif(r->>'remarks_out',''),
        imported_at  = now(),
        updated_at   = now()
      where id = v_existing_id;
      v_updated := v_updated + 1;
    end if;

    if not (v_material_id = any(v_touched)) then
      v_touched := v_touched || v_material_id;
    end if;
  end loop;

  insert into audit_log (table_name, record_id, action, new_data)
  -- audit_log.action is CHECK-constrained (insert/update/delete/submit/approve/reject/close);
  -- the import is recorded as one 'update' tagged kind = import_inventory_sheet.
  values ('material_movements', gen_random_uuid(), 'update',
          jsonb_build_object('kind', 'import_inventory_sheet', 'actor', p_actor, 'inserted', v_inserted, 'updated', v_updated,
                             'created_materials', v_created_names,
                             'materials_touched', coalesce(array_length(v_touched, 1), 0)));

  return json_build_object(
    'ok', true,
    'inserted', v_inserted,
    'updated', v_updated,
    'created_materials', v_created_materials,
    'created_material_names', to_jsonb(v_created_names),
    'materials_touched', coalesce(array_length(v_touched, 1), 0));
end;
$$;

grant execute on function public.import_inventory_rows(jsonb, text, boolean) to anon, authenticated;
