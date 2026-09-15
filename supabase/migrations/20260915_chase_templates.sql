-- Editable chase email templates (client ask 2026-09-14: "able to change the email contents").
--
-- chase_settings.value is an integer (cadence days), so wording gets its own
-- table. A row overrides the built-in default for that template key; no row =
-- default. Placeholders like {claim_no} are substituted by the app
-- (src/lib/chaseTemplates.ts) at draft time.

create table if not exists public.chase_templates (
  key         text primary key,           -- e.g. cert.overdue, pay.final.legal
  subject     text not null,
  body        text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.chase_templates enable row level security;

do $$ begin
  create policy "chase_templates anon read" on public.chase_templates for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on public.chase_templates to anon, authenticated;

create or replace function public.save_chase_template(p_key text, p_subject text, p_body text, p_actor text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or p_key !~ '^(cert|pay)\.[a-z0-9_.-]+$' then
    return json_build_object('ok', false, 'error', 'unknown template key');
  end if;
  if coalesce(trim(p_subject), '') = '' or coalesce(trim(p_body), '') = '' then
    return json_build_object('ok', false, 'error', 'subject and body are required');
  end if;
  insert into chase_templates (key, subject, body, updated_at, updated_by)
  values (p_key, p_subject, p_body, now(), nullif(trim(p_actor), ''))
  on conflict (key) do update
     set subject = excluded.subject, body = excluded.body, updated_at = now(), updated_by = excluded.updated_by;
  return json_build_object('ok', true, 'key', p_key);
end; $$;

create or replace function public.reset_chase_template(p_key text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from chase_templates where key = p_key;
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'key', p_key, 'reset', n > 0);
end; $$;

grant execute on function public.save_chase_template(text, text, text, text) to anon, authenticated;
grant execute on function public.reset_chase_template(text) to anon, authenticated;
