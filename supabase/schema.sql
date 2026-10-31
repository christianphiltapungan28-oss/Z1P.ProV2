create table if not exists public.early_access_signups (
  id uuid primary key default gen_random_uuid(),
  full_name text check (full_name is null or char_length(trim(full_name)) between 1 and 120),
  email text not null check (
    char_length(email) <= 320
    and email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$'
  ),
  topic text check (topic is null or char_length(topic) <= 1000),
  created_at timestamptz not null default now()
);

-- Name is optional (existing databases: relax the old NOT NULL / policy below).
alter table public.early_access_signups alter column full_name drop not null;

-- One signup per email (case-insensitive). The API treats the resulting 409 as "already on the list".
-- If this fails, existing duplicate emails must be removed first.
create unique index if not exists early_access_signups_email_lower_uidx
  on public.early_access_signups (lower(email));

alter table public.early_access_signups enable row level security;

revoke all on public.early_access_signups from public, anon, authenticated;
grant usage on schema public to anon;
grant insert (full_name, email, topic) on public.early_access_signups to anon;

drop policy if exists "Allow validated early-access signups" on public.early_access_signups;
create policy "Allow validated early-access signups"
  on public.early_access_signups
  for insert
  to anon
  with check (
    (full_name is null or char_length(trim(full_name)) between 1 and 120)
    and char_length(email) <= 320
    and email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$'
    and (topic is null or char_length(topic) <= 1000)
  );
