-- Per-claim edited chase drafts (client, 16 Sep: "can we edit the text there?").
--
-- The reminder preview on the Chase card is editable in place. An edit is
-- stored here per (claim, clock) so it survives a refresh and is what
-- "Proceed & send" / "Log as Sent" use. Sending or skipping clears it; a claim
-- with no row shows the template wording.

create table if not exists public.chase_drafts (
  claim_id    uuid not null references public.claims(id) on delete cascade,
  clock       text not null check (clock in ('certificate','payment')),
  subject     text not null,
  body        text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (claim_id, clock)
);

alter table public.chase_drafts enable row level security;
do $$ begin
  create policy "chase_drafts anon read" on public.chase_drafts for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
grant select on public.chase_drafts to anon, authenticated;

create or replace function public.save_chase_draft(p_claim_id uuid, p_clock text, p_subject text, p_body text, p_actor text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_clock not in ('certificate','payment') then
    return json_build_object('ok', false, 'error', 'clock must be certificate or payment');
  end if;
  if not exists (select 1 from claims where id = p_claim_id) then
    return json_build_object('ok', false, 'error', 'claim not found');
  end if;
  if coalesce(trim(p_subject), '') = '' or coalesce(trim(p_body), '') = '' then
    return json_build_object('ok', false, 'error', 'subject and body are required');
  end if;
  insert into chase_drafts (claim_id, clock, subject, body, updated_at, updated_by)
  values (p_claim_id, p_clock, p_subject, p_body, now(), nullif(trim(p_actor), ''))
  on conflict (claim_id, clock) do update
     set subject = excluded.subject, body = excluded.body, updated_at = now(), updated_by = excluded.updated_by;
  return json_build_object('ok', true);
end; $$;

create or replace function public.clear_chase_draft(p_claim_id uuid, p_clock text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from chase_drafts where claim_id = p_claim_id and clock = p_clock;
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'cleared', n > 0);
end; $$;

grant execute on function public.save_chase_draft(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.clear_chase_draft(uuid, text) to anon, authenticated;
