-- Site Reports: orders (phases) under a project, the seven-stage sequence,
-- and the manpower / equipment registers with per-day allocation.
--
-- Source: team feedback of 16 Nov 2026 against the SitePulse mockup, plus
-- TOOLS_R1.xlsx (equipment inventory) and Manpower.xlsx (roster).
--
--   site_workers      the roster (Manpower tab)
--   site_tools        the equipment register (Equipment tab)
--   site_orders       one order = one phase of a project; stage 1..7:
--                     1 Project Plan, 2 Kick Off, 3 Schedule Posting,
--                     4 Deployment & Execution, 5 Site Walk / Handover,
--                     6 Transfer / Movement, 7 Completion
--   site_order_days   the posted schedule of an order, one row per day
--   site_allocations  who and which tool is on which order on which DATE.
--                     Rows belong to a date, so the next day starts empty:
--                     nothing has to be reset.
--
-- Additive only. The daily report, weekly plan and their RPCs are untouched.
-- Reads are anon SELECT; every write goes through a SECURITY DEFINER RPC.

create table if not exists public.site_workers (
  id          uuid primary key default gen_random_uuid(),
  emp_code    text unique,
  name        text not null,
  designation text not null,
  contact     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.site_tools (
  id                uuid primary key default gen_random_uuid(),
  tool_no           text not null unique,
  item              text not null,
  category          text not null,
  code              text,
  purchase_date     date,
  last_service      date,
  efficiency_m2_day numeric check (efficiency_m2_day is null or efficiency_m2_day >= 0),
  condition         text not null default 'good' check (condition in ('good','spoiled')),
  remarks           text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        text
);

create table if not exists public.site_orders (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  order_no     integer not null,
  label        text not null,
  scope        jsonb not null default '[]'::jsonb,   -- [{scope, area}]
  remarks      text,
  stage        integer not null default 2 check (stage between 1 and 7),
  kickoff      jsonb,
  site_walk    jsonb,
  transfer     jsonb,
  completion   jsonb,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text,
  updated_at   timestamptz not null default now(),
  updated_by   text,
  unique (project_id, order_no)
);
create index if not exists site_orders_project_idx on public.site_orders(project_id, order_no);

create table if not exists public.site_order_days (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.site_orders(id) on delete cascade,
  work_date      date not null,
  scope          jsonb not null default '[]'::jsonb,  -- [{scope, area}]
  supervisor     text,
  workers_needed integer check (workers_needed is null or workers_needed >= 0),
  safety_officer boolean not null default false,
  remarks        text,
  updated_at     timestamptz not null default now(),
  updated_by     text,
  unique (order_id, work_date)
);

create table if not exists public.site_allocations (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.site_orders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  work_date  date not null,
  worker_id  uuid references public.site_workers(id) on delete cascade,
  tool_id    uuid references public.site_tools(id) on delete cascade,
  attendance text not null default 'Full Day' check (attendance in ('Full Day','Half AM','Half PM')),
  ot_hours   numeric check (ot_hours is null or (ot_hours > 0 and ot_hours <= 12)),
  created_at timestamptz not null default now(),
  created_by text,
  check ((worker_id is null) <> (tool_id is null))
);
create unique index if not exists site_alloc_worker_uniq on public.site_allocations(order_id, work_date, worker_id) where worker_id is not null;
-- a tool is in one place on a given day
create unique index if not exists site_alloc_tool_uniq on public.site_allocations(work_date, tool_id) where tool_id is not null;
create index if not exists site_alloc_date_idx on public.site_allocations(work_date);

alter table public.site_workers     enable row level security;
alter table public.site_tools       enable row level security;
alter table public.site_orders      enable row level security;
alter table public.site_order_days  enable row level security;
alter table public.site_allocations enable row level security;
do $$
declare t text;
begin
  foreach t in array array['site_workers','site_tools','site_orders','site_order_days','site_allocations'] loop
    begin
      execute format('create policy "%s anon read" on public.%I for select to anon, authenticated using (true)', t, t);
    exception when duplicate_object then null;
    end;
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Register rows: add or edit ---------------------------------------------------
create or replace function public.save_site_worker(p_row jsonb, p_actor text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_row->>'id', '')::uuid;
  v_code text := _sr_txt(p_row->>'emp_code');
begin
  if _sr_txt(p_row->>'name') is null then
    return json_build_object('ok', false, 'error', 'name is required');
  end if;
  if _sr_txt(p_row->>'designation') is null then
    return json_build_object('ok', false, 'error', 'designation is required');
  end if;
  if v_code is not null and exists (select 1 from site_workers where emp_code = v_code and id is distinct from v_id) then
    return json_build_object('ok', false, 'error', format('employee code %s is already on the roster', v_code));
  end if;
  if v_id is null then
    insert into site_workers (emp_code, name, designation, contact, updated_by)
    values (v_code, _sr_txt(p_row->>'name'), _sr_txt(p_row->>'designation'), _sr_txt(p_row->>'contact'), _sr_txt(p_actor))
    returning id into v_id;
  else
    update site_workers set
      emp_code = v_code, name = _sr_txt(p_row->>'name'), designation = _sr_txt(p_row->>'designation'),
      contact = _sr_txt(p_row->>'contact'),
      active = coalesce((p_row->>'active')::boolean, active),
      updated_at = now(), updated_by = _sr_txt(p_actor)
    where id = v_id;
    if not found then return json_build_object('ok', false, 'error', 'worker not found'); end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end; $$;

create or replace function public.save_site_tool(p_row jsonb, p_actor text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_row->>'id', '')::uuid;
  v_no text := upper(_sr_txt(p_row->>'tool_no'));
  v_cond text := coalesce(_sr_txt(p_row->>'condition'), 'good');
begin
  if v_no is null then return json_build_object('ok', false, 'error', 'tool number is required'); end if;
  if _sr_txt(p_row->>'item') is null then return json_build_object('ok', false, 'error', 'item name is required'); end if;
  if _sr_txt(p_row->>'category') is null then return json_build_object('ok', false, 'error', 'category is required'); end if;
  if v_cond not in ('good','spoiled') then return json_build_object('ok', false, 'error', 'condition must be good or spoiled'); end if;
  if exists (select 1 from site_tools where tool_no = v_no and id is distinct from v_id) then
    return json_build_object('ok', false, 'error', format('tool number %s is already in the register', v_no));
  end if;
  if v_id is null then
    insert into site_tools (tool_no, item, category, code, purchase_date, last_service, efficiency_m2_day, condition, remarks, updated_by)
    values (v_no, _sr_txt(p_row->>'item'), _sr_txt(p_row->>'category'), _sr_txt(p_row->>'code'),
            nullif(p_row->>'purchase_date', '')::date, nullif(p_row->>'last_service', '')::date,
            _sr_num(p_row->>'efficiency_m2_day'), v_cond, _sr_txt(p_row->>'remarks'), _sr_txt(p_actor))
    returning id into v_id;
  else
    update site_tools set
      tool_no = v_no, item = _sr_txt(p_row->>'item'), category = _sr_txt(p_row->>'category'), code = _sr_txt(p_row->>'code'),
      purchase_date = nullif(p_row->>'purchase_date', '')::date, last_service = nullif(p_row->>'last_service', '')::date,
      efficiency_m2_day = _sr_num(p_row->>'efficiency_m2_day'), condition = v_cond, remarks = _sr_txt(p_row->>'remarks'),
      active = coalesce((p_row->>'active')::boolean, active),
      updated_at = now(), updated_by = _sr_txt(p_actor)
    where id = v_id;
    if not found then return json_build_object('ok', false, 'error', 'tool not found'); end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end; $$;

-- Orders ------------------------------------------------------------------------
-- Creating an order IS stage 1 (Project Plan), so a new order opens at Kick Off.
create or replace function public.save_site_order(p_order jsonb, p_actor text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_order->>'id', '')::uuid;
  v_project projects%rowtype;
  v_scope jsonb := coalesce(p_order->'scope', '[]'::jsonb);
  v_no int;
begin
  if _sr_txt(p_order->>'label') is null then
    return json_build_object('ok', false, 'error', 'order name is required');
  end if;
  if jsonb_typeof(v_scope) <> 'array' then
    return json_build_object('ok', false, 'error', 'scope must be a list');
  end if;
  if v_id is null then
    select * into v_project from projects where id = nullif(p_order->>'project_id', '')::uuid;
    if not found then return json_build_object('ok', false, 'error', 'project not found'); end if;
    perform pg_advisory_xact_lock(hashtext(v_project.id::text));
    select coalesce(max(order_no), 0) + 1 into v_no from site_orders where project_id = v_project.id;
    insert into site_orders (project_id, project_code, order_no, label, scope, remarks, created_by, updated_by)
    values (v_project.id, v_project.project_code, v_no, _sr_txt(p_order->>'label'), v_scope,
            _sr_txt(p_order->>'remarks'), _sr_txt(p_actor), _sr_txt(p_actor))
    returning id into v_id;
  else
    update site_orders set label = _sr_txt(p_order->>'label'), scope = v_scope, remarks = _sr_txt(p_order->>'remarks'),
      updated_at = now(), updated_by = _sr_txt(p_actor)
    where id = v_id;
    if not found then return json_build_object('ok', false, 'error', 'order not found'); end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end; $$;

create or replace function public.delete_site_order(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if exists (select 1 from site_allocations where order_id = p_id) then
    return json_build_object('ok', false, 'error', 'this order has manpower or tools allocated; it cannot be deleted');
  end if;
  delete from site_orders where id = p_id;
  get diagnostics n = row_count;
  return json_build_object('ok', n > 0, 'error', case when n = 0 then 'order not found' end);
end; $$;

-- Save one stage's record; p_complete moves the order on when that stage is the current one.
-- Stages 2, 5, 6, 7 carry a record. Stages 3 and 4 hold their data in
-- site_order_days / site_allocations and are only completed here.
create or replace function public.save_site_order_stage(p_id uuid, p_stage integer, p_data jsonb default null,
                                                        p_complete boolean default false, p_actor text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v site_orders%rowtype;
  v_stage int;
begin
  select * into v from site_orders where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', 'order not found'); end if;
  if p_stage not between 2 and 7 then return json_build_object('ok', false, 'error', 'unknown stage'); end if;
  if p_stage > v.stage then
    return json_build_object('ok', false, 'error', 'finish the earlier stages first');
  end if;
  if p_complete and p_stage = 3 and not exists (select 1 from site_order_days where order_id = p_id) then
    return json_build_object('ok', false, 'error', 'post at least one schedule day first');
  end if;
  if p_complete and p_stage = 4 and not exists (select 1 from site_allocations where order_id = p_id) then
    return json_build_object('ok', false, 'error', 'allocate manpower or tools on at least one day first');
  end if;

  v_stage := v.stage;
  if p_complete and p_stage = v.stage and v.stage < 7 then v_stage := v.stage + 1; end if;

  update site_orders set
    kickoff    = case when p_stage = 2 and p_data is not null then p_data else kickoff end,
    site_walk  = case when p_stage = 5 and p_data is not null then p_data else site_walk end,
    transfer   = case when p_stage = 6 and p_data is not null then p_data else transfer end,
    completion = case when p_stage = 7 and p_data is not null then p_data else completion end,
    completed_at = case when p_stage = 7 then (case when p_complete then coalesce(completed_at, now()) else null end) else completed_at end,
    stage = v_stage,
    updated_at = now(), updated_by = _sr_txt(p_actor)
  where id = p_id;
  return json_build_object('ok', true, 'id', p_id, 'stage', v_stage);
end; $$;

-- Schedule Posting: upsert days by date ----------------------------------------
create or replace function public.save_site_order_days(p_order_id uuid, p_days jsonb, p_actor text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_day jsonb;
  v_date date;
  n int := 0;
begin
  if not exists (select 1 from site_orders where id = p_order_id) then
    return json_build_object('ok', false, 'error', 'order not found');
  end if;
  if jsonb_typeof(coalesce(p_days, '[]'::jsonb)) <> 'array' then
    return json_build_object('ok', false, 'error', 'days must be a list');
  end if;
  for v_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) loop
    v_date := nullif(v_day->>'work_date', '')::date;
    if v_date is null then return json_build_object('ok', false, 'error', 'every day needs a date'); end if;
    insert into site_order_days (order_id, work_date, scope, supervisor, workers_needed, safety_officer, remarks, updated_by)
    values (p_order_id, v_date, coalesce(v_day->'scope', '[]'::jsonb), _sr_txt(v_day->>'supervisor'),
            _sr_num(v_day->>'workers_needed')::integer, coalesce((v_day->>'safety_officer')::boolean, false),
            _sr_txt(v_day->>'remarks'), _sr_txt(p_actor))
    on conflict (order_id, work_date) do update set
      scope = excluded.scope, supervisor = excluded.supervisor, workers_needed = excluded.workers_needed,
      safety_officer = excluded.safety_officer, remarks = excluded.remarks,
      updated_at = now(), updated_by = excluded.updated_by;
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'days', n);
end; $$;

create or replace function public.delete_site_order_day(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare d site_order_days%rowtype;
begin
  select * into d from site_order_days where id = p_id;
  if not found then return json_build_object('ok', false, 'error', 'day not found'); end if;
  if exists (select 1 from site_allocations where order_id = d.order_id and work_date = d.work_date) then
    return json_build_object('ok', false, 'error', 'manpower or tools are allocated on this day; clear them first');
  end if;
  delete from site_order_days where id = p_id;
  return json_build_object('ok', true);
end; $$;

-- Allocation for one order on one date: replaces that day's set ----------------
-- p_workers: [{id, attendance, ot_hours}]   p_tools: [tool id, ...]
create or replace function public.set_site_allocation(p_order_id uuid, p_date date, p_workers jsonb, p_tools jsonb, p_actor text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v site_orders%rowtype;
  v_clash record;
  v_bad text;
  w jsonb;
  nw int := 0;
  nt int := 0;
begin
  select * into v from site_orders where id = p_order_id for update;
  if not found then return json_build_object('ok', false, 'error', 'order not found'); end if;
  if p_date is null then return json_build_object('ok', false, 'error', 'date is required'); end if;
  if v.completed_at is not null then
    return json_build_object('ok', false, 'error', 'this order is completed');
  end if;

  select t.tool_no into v_bad from site_tools t
   where t.id in (select value::uuid from jsonb_array_elements_text(coalesce(p_tools, '[]'::jsonb)))
     and (t.condition = 'spoiled' or not t.active) limit 1;
  if v_bad is not null then
    return json_build_object('ok', false, 'error', format('%s is marked spoiled or inactive and cannot be allocated', v_bad));
  end if;

  select t.tool_no, o.project_code, o.label into v_clash
    from site_allocations a
    join site_tools t on t.id = a.tool_id
    join site_orders o on o.id = a.order_id
   where a.work_date = p_date and a.order_id <> p_order_id
     and a.tool_id in (select value::uuid from jsonb_array_elements_text(coalesce(p_tools, '[]'::jsonb)))
   limit 1;
  if found then
    return json_build_object('ok', false, 'error',
      format('%s is already allocated to %s (%s) on %s', v_clash.tool_no, v_clash.project_code, v_clash.label, to_char(p_date, 'DD Mon')));
  end if;

  delete from site_allocations where order_id = p_order_id and work_date = p_date;

  for w in select * from jsonb_array_elements(coalesce(p_workers, '[]'::jsonb)) loop
    insert into site_allocations (order_id, project_id, work_date, worker_id, attendance, ot_hours, created_by)
    values (p_order_id, v.project_id, p_date, (w->>'id')::uuid,
            coalesce(_sr_txt(w->>'attendance'), 'Full Day'), nullif(_sr_num(w->>'ot_hours'), 0), _sr_txt(p_actor))
    on conflict do nothing;
    nw := nw + 1;
  end loop;

  insert into site_allocations (order_id, project_id, work_date, tool_id, created_by)
  select p_order_id, v.project_id, p_date, value::uuid, _sr_txt(p_actor)
    from (select distinct value from jsonb_array_elements_text(coalesce(p_tools, '[]'::jsonb))) x;
  get diagnostics nt = row_count;

  return json_build_object('ok', true, 'workers', nw, 'tools', nt);
end; $$;

grant execute on function public.save_site_worker(jsonb, text) to anon, authenticated;
grant execute on function public.save_site_tool(jsonb, text) to anon, authenticated;
grant execute on function public.save_site_order(jsonb, text) to anon, authenticated;
grant execute on function public.delete_site_order(uuid) to anon, authenticated;
grant execute on function public.save_site_order_stage(uuid, integer, jsonb, boolean, text) to anon, authenticated;
grant execute on function public.save_site_order_days(uuid, jsonb, text) to anon, authenticated;
grant execute on function public.delete_site_order_day(uuid) to anon, authenticated;
grant execute on function public.set_site_allocation(uuid, date, jsonb, jsonb, text) to anon, authenticated;
