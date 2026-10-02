-- Site Reports: Lynn's project planning & tracking workflow (18 Sep, R1 25 Sep).
--
-- Source: "Project planning and tracking workflow (R1).xlsx", sheets Workflow
-- and Dashboard Report. Replaces the WhatsApp chat-group posts:
--   stage 3  weekly schedule (whiteboard photo)      -> site_weekly_plan
--   stage 4  DAILY WORK REPORT + material PLANNED    -> site_daily_reports (+ lines)
--   stage 5  material ACTUAL at end of day           -> same record, then Submit
--
-- One daily report per project, date and site location. It is saved as a
-- draft before work (planned), reopened at the end of the day (actual), and
-- submitted. Submitted reports are read-only until reopened.
--
-- Each line is one DAILY MATERIAL REPORT card from the R1 "Proposed" template:
-- location + activity, PLANNED and ACTUAL (Area, Material, Qty In Set, Remark,
-- Coverage) and DEFECT (Area, Remark). material_id links the materials master
-- when the material was picked from stock, so ACTUAL can post to Site
-- inventory later (change log D3, after the Site/Store LOC change D1). Nothing
-- here touches inventory.

-- 1. Weekly plan ---------------------------------------------------------------
create table if not exists public.site_weekly_plan (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  date_from    date not null,
  date_to      date not null,
  location     text,
  activities   text not null,
  area_m2      numeric,
  manpower     integer,
  remarks      text,
  created_at   timestamptz not null default now(),
  created_by   text,
  updated_at   timestamptz not null default now(),
  updated_by   text,
  check (date_to >= date_from),
  check (area_m2 is null or area_m2 >= 0),
  check (manpower is null or manpower >= 0)
);
create index if not exists site_weekly_plan_project_idx on public.site_weekly_plan(project_id, date_from);

-- 2. Daily report header (DAILY WORK REPORT template, unchanged in R1) ---------
create table if not exists public.site_daily_reports (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  project_code         text not null,
  report_date          date not null,
  site_location        text not null default '',
  epoxy_system         text,
  time_text            text,
  supervisor           text,
  safety_personnel     text,
  men                  text,
  supply_men           text,
  total_men            integer check (total_men is null or total_men >= 0),
  days_to_complete     text,
  negative_days        integer,
  remark               text,
  additional_area_date text,
  status               text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at         timestamptz,
  submitted_by         text,
  created_at           timestamptz not null default now(),
  created_by           text,
  updated_at           timestamptz not null default now(),
  updated_by           text
);
create unique index if not exists site_daily_reports_uniq
  on public.site_daily_reports(project_id, report_date, lower(site_location));
create index if not exists site_daily_reports_project_idx on public.site_daily_reports(project_id, report_date desc);

-- 3. Daily material report lines (R1 "Proposed" template) ---------------------
create table if not exists public.site_report_lines (
  id                  uuid primary key default gen_random_uuid(),
  report_id           uuid not null references public.site_daily_reports(id) on delete cascade,
  line_no             integer not null,
  location            text,
  activity            text not null,
  manpower            integer check (manpower is null or manpower >= 0),
  planned_area        numeric check (planned_area is null or planned_area >= 0),
  planned_material    text,
  planned_material_id uuid references public.materials(id) on delete set null,
  planned_qty         numeric check (planned_qty is null or planned_qty >= 0),
  planned_coverage    text,
  planned_remark      text,
  actual_area         numeric check (actual_area is null or actual_area >= 0),
  actual_material     text,
  actual_material_id  uuid references public.materials(id) on delete set null,
  actual_qty          numeric check (actual_qty is null or actual_qty >= 0),
  actual_coverage     text,
  actual_remark       text,
  defect_area         text,
  defect_remark       text
);
create index if not exists site_report_lines_report_idx on public.site_report_lines(report_id, line_no);

-- 4. Read access (writes only through the RPCs below) -------------------------
alter table public.site_weekly_plan   enable row level security;
alter table public.site_daily_reports enable row level security;
alter table public.site_report_lines  enable row level security;
do $$ begin
  create policy "site_weekly_plan anon read" on public.site_weekly_plan for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "site_daily_reports anon read" on public.site_daily_reports for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "site_report_lines anon read" on public.site_report_lines for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
grant select on public.site_weekly_plan, public.site_daily_reports, public.site_report_lines to anon, authenticated;

-- helpers: empty string -> null, text -> numeric/int or null
create or replace function public._sr_txt(v text) returns text language sql immutable as $$
  select nullif(trim(v), '')
$$;
create or replace function public._sr_num(v text) returns numeric language sql immutable as $$
  select case when trim(coalesce(v, '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then trim(v)::numeric end
$$;

-- 5. Weekly plan: save (insert or update) and delete --------------------------
create or replace function public.save_weekly_plan_row(p_row jsonb, p_actor text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_row->>'id', '')::uuid;
  v_project projects%rowtype;
  v_from date;
  v_to date;
begin
  select * into v_project from projects where id = nullif(p_row->>'project_id', '')::uuid;
  if not found then
    return json_build_object('ok', false, 'error', 'project not found');
  end if;
  if _sr_txt(p_row->>'activities') is null then
    return json_build_object('ok', false, 'error', 'activities are required');
  end if;
  v_from := nullif(p_row->>'date_from', '')::date;
  v_to := coalesce(nullif(p_row->>'date_to', '')::date, v_from);
  if v_from is null then
    return json_build_object('ok', false, 'error', 'date is required');
  end if;
  if v_to < v_from then
    return json_build_object('ok', false, 'error', 'end date is before start date');
  end if;

  if v_id is null then
    insert into site_weekly_plan (project_id, project_code, date_from, date_to, location, activities,
                                  area_m2, manpower, remarks, created_by, updated_by)
    values (v_project.id, v_project.project_code, v_from, v_to, _sr_txt(p_row->>'location'),
            _sr_txt(p_row->>'activities'), _sr_num(p_row->>'area_m2'), _sr_num(p_row->>'manpower')::integer,
            _sr_txt(p_row->>'remarks'), _sr_txt(p_actor), _sr_txt(p_actor))
    returning id into v_id;
  else
    update site_weekly_plan set
      date_from = v_from, date_to = v_to,
      location = _sr_txt(p_row->>'location'),
      activities = _sr_txt(p_row->>'activities'),
      area_m2 = _sr_num(p_row->>'area_m2'),
      manpower = _sr_num(p_row->>'manpower')::integer,
      remarks = _sr_txt(p_row->>'remarks'),
      updated_at = now(), updated_by = _sr_txt(p_actor)
    where id = v_id and project_id = v_project.id;
    if not found then
      return json_build_object('ok', false, 'error', 'plan row not found');
    end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end; $$;

create or replace function public.delete_weekly_plan_row(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from site_weekly_plan where id = p_id;
  get diagnostics n = row_count;
  return json_build_object('ok', n > 0, 'error', case when n = 0 then 'plan row not found' end);
end; $$;

-- 6. Daily report: save draft (header + replace lines) ------------------------
create or replace function public.save_site_report(p_report jsonb, p_lines jsonb, p_actor text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_report->>'id', '')::uuid;
  v_project projects%rowtype;
  v_date date := nullif(p_report->>'report_date', '')::date;
  v_site text := coalesce(trim(p_report->>'site_location'), '');
  v_status text;
  v_line jsonb;
  v_no int := 0;
begin
  select * into v_project from projects where id = nullif(p_report->>'project_id', '')::uuid;
  if not found then
    return json_build_object('ok', false, 'error', 'project not found');
  end if;
  if v_date is null then
    return json_build_object('ok', false, 'error', 'report date is required');
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    return json_build_object('ok', false, 'error', 'lines must be a list');
  end if;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if _sr_txt(v_line->>'activity') is null then
      return json_build_object('ok', false, 'error', 'every activity line needs an activity');
    end if;
  end loop;

  if v_id is not null then
    select status into v_status from site_daily_reports where id = v_id and project_id = v_project.id for update;
    if not found then
      return json_build_object('ok', false, 'error', 'report not found');
    end if;
    if v_status = 'submitted' then
      return json_build_object('ok', false, 'error', 'report is submitted; reopen it to edit');
    end if;
  end if;

  if exists (select 1 from site_daily_reports
              where project_id = v_project.id and report_date = v_date and lower(site_location) = lower(v_site)
                and id is distinct from v_id) then
    return json_build_object('ok', false, 'error',
      format('a report for %s on %s%s already exists', v_project.project_code, v_date,
             case when v_site <> '' then ' at ' || v_site else '' end));
  end if;

  if v_id is null then
    insert into site_daily_reports (project_id, project_code, report_date, site_location, created_by)
    values (v_project.id, v_project.project_code, v_date, v_site, _sr_txt(p_actor))
    returning id into v_id;
  end if;

  update site_daily_reports set
    report_date          = v_date,
    site_location        = v_site,
    epoxy_system         = _sr_txt(p_report->>'epoxy_system'),
    time_text            = _sr_txt(p_report->>'time_text'),
    supervisor           = _sr_txt(p_report->>'supervisor'),
    safety_personnel     = _sr_txt(p_report->>'safety_personnel'),
    men                  = _sr_txt(p_report->>'men'),
    supply_men           = _sr_txt(p_report->>'supply_men'),
    total_men            = _sr_num(p_report->>'total_men')::integer,
    days_to_complete     = _sr_txt(p_report->>'days_to_complete'),
    negative_days        = _sr_num(p_report->>'negative_days')::integer,
    remark               = _sr_txt(p_report->>'remark'),
    additional_area_date = _sr_txt(p_report->>'additional_area_date'),
    updated_at = now(), updated_by = _sr_txt(p_actor)
  where id = v_id;

  delete from site_report_lines where report_id = v_id;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_no := v_no + 1;
    insert into site_report_lines (report_id, line_no, location, activity, manpower,
      planned_area, planned_material, planned_material_id, planned_qty, planned_coverage, planned_remark,
      actual_area, actual_material, actual_material_id, actual_qty, actual_coverage, actual_remark,
      defect_area, defect_remark)
    values (v_id, v_no, _sr_txt(v_line->>'location'), _sr_txt(v_line->>'activity'),
      _sr_num(v_line->>'manpower')::integer,
      _sr_num(v_line->>'planned_area'), _sr_txt(v_line->>'planned_material'),
      (select id from materials where id = nullif(v_line->>'planned_material_id', '')::uuid),
      _sr_num(v_line->>'planned_qty'), _sr_txt(v_line->>'planned_coverage'), _sr_txt(v_line->>'planned_remark'),
      _sr_num(v_line->>'actual_area'), _sr_txt(v_line->>'actual_material'),
      (select id from materials where id = nullif(v_line->>'actual_material_id', '')::uuid),
      _sr_num(v_line->>'actual_qty'), _sr_txt(v_line->>'actual_coverage'), _sr_txt(v_line->>'actual_remark'),
      _sr_txt(v_line->>'defect_area'), _sr_txt(v_line->>'defect_remark'));
  end loop;

  return json_build_object('ok', true, 'id', v_id, 'lines', v_no);
end; $$;

-- 7. Submit / reopen / delete draft --------------------------------------------
create or replace function public.submit_site_report(p_id uuid, p_actor text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from site_daily_reports where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'report not found');
  end if;
  if v_status = 'submitted' then
    return json_build_object('ok', false, 'error', 'report is already submitted');
  end if;
  if not exists (select 1 from site_report_lines where report_id = p_id) then
    return json_build_object('ok', false, 'error', 'add at least one activity before submitting');
  end if;
  update site_daily_reports
     set status = 'submitted', submitted_at = now(), submitted_by = _sr_txt(p_actor),
         updated_at = now(), updated_by = _sr_txt(p_actor)
   where id = p_id;
  return json_build_object('ok', true);
end; $$;

create or replace function public.reopen_site_report(p_id uuid, p_actor text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update site_daily_reports
     set status = 'draft', submitted_at = null, submitted_by = null,
         updated_at = now(), updated_by = _sr_txt(p_actor)
   where id = p_id and status = 'submitted';
  if not found then
    return json_build_object('ok', false, 'error', 'report not found or not submitted');
  end if;
  return json_build_object('ok', true);
end; $$;

create or replace function public.delete_site_report(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from site_daily_reports where id = p_id and status = 'draft';
  get diagnostics n = row_count;
  return json_build_object('ok', n > 0, 'error', case when n = 0 then 'only a draft report can be deleted' end);
end; $$;

grant execute on function public.save_weekly_plan_row(jsonb, text) to anon, authenticated;
grant execute on function public.delete_weekly_plan_row(uuid) to anon, authenticated;
grant execute on function public.save_site_report(jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.submit_site_report(uuid, text) to anon, authenticated;
grant execute on function public.reopen_site_report(uuid, text) to anon, authenticated;
grant execute on function public.delete_site_report(uuid) to anon, authenticated;
