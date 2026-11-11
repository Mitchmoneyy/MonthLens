-- MonthLens accounts: one row of JSON per user, readable and writable only by that user.
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.

create table if not exists public.workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

drop policy if exists "read own workspace" on public.workspaces;
create policy "read own workspace" on public.workspaces
  for select using (auth.uid() = user_id);

drop policy if exists "insert own workspace" on public.workspaces;
create policy "insert own workspace" on public.workspaces
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own workspace" on public.workspaces;
create policy "update own workspace" on public.workspaces
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own workspace" on public.workspaces;
create policy "delete own workspace" on public.workspaces
  for delete using (auth.uid() = user_id);

-- Let a signed-in person delete their own account (required by the App Store).
-- Deleting the auth user also deletes their workspace row (on delete cascade above).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Feedback from the in-app form. Anyone can send it; nobody can read it through the app.
-- Read it in the Supabase dashboard: Table Editor -> feedback.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  message text not null check (char_length(message) between 5 and 4000),
  contact text check (contact is null or char_length(contact) <= 200),
  page text check (page is null or char_length(page) <= 60)
);

alter table public.feedback enable row level security;

drop policy if exists "anyone can send feedback" on public.feedback;
create policy "anyone can send feedback" on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
