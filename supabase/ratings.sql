-- Ratings -> testimonials. Run this once in the Supabase SQL editor (it is safe to re-run).
--
-- Visitors submit a rating (and optional comment); every submission is stored as 'pending'.
-- Only rows you set to status = 'approved' (Table Editor -> testimonials -> status) appear on the site.

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.testimonials enable row level security;

revoke all on public.testimonials from public, anon, authenticated;
grant usage on schema public to anon;
-- Visitors can add a row (they can never choose its status) and read only the public columns of approved rows.
grant insert (display_name, rating, comment) on public.testimonials to anon;
grant select (id, display_name, rating, comment, created_at) on public.testimonials to anon;

drop policy if exists "Allow validated rating submissions" on public.testimonials;
create policy "Allow validated rating submissions"
  on public.testimonials
  for insert
  to anon
  with check (
    char_length(trim(display_name)) between 1 and 60
    and rating between 1 and 5
    and (comment is null or char_length(comment) <= 500)
  );

drop policy if exists "Anyone can read approved testimonials" on public.testimonials;
create policy "Anyone can read approved testimonials"
  on public.testimonials
  for select
  to anon
  using (status = 'approved');
