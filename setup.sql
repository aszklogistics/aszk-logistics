-- =====================================================================
--  ASZK website admin: database setup for Supabase
--  Run this ONCE: Supabase Dashboard > SQL Editor > New query > paste > Run
--  It is safe to run again (it will not delete existing data).
-- =====================================================================

-- 1) Tables ------------------------------------------------------------
create table if not exists public.site_content (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery (
  id         bigint generated always as identity primary key,
  url        text not null,
  path       text,                       -- storage path (null for the built-in starter photos)
  caption    text default '',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- who is allowed to edit (filled in step 3 below)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- 2) Security: everyone may READ content, only admins may WRITE ----------
alter table public.site_content enable row level security;
alter table public.gallery      enable row level security;
alter table public.admins       enable row level security;   -- no policies = nobody can read it directly

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "content: public read"   on public.site_content;
drop policy if exists "content: admin insert"  on public.site_content;
drop policy if exists "content: admin update"  on public.site_content;
drop policy if exists "content: admin delete"  on public.site_content;
create policy "content: public read"  on public.site_content for select using (true);
create policy "content: admin insert" on public.site_content for insert to authenticated with check (public.is_admin());
create policy "content: admin update" on public.site_content for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "content: admin delete" on public.site_content for delete to authenticated using (public.is_admin());

drop policy if exists "gallery: public read"   on public.gallery;
drop policy if exists "gallery: admin insert"  on public.gallery;
drop policy if exists "gallery: admin update"  on public.gallery;
drop policy if exists "gallery: admin delete"  on public.gallery;
create policy "gallery: public read"  on public.gallery for select using (true);
create policy "gallery: admin insert" on public.gallery for insert to authenticated with check (public.is_admin());
create policy "gallery: admin update" on public.gallery for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gallery: admin delete" on public.gallery for delete to authenticated using (public.is_admin());

-- 3) Photo storage bucket (public to view, admin-only to change) ---------
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

drop policy if exists "images: public read"  on storage.objects;
drop policy if exists "images: admin insert" on storage.objects;
drop policy if exists "images: admin update" on storage.objects;
drop policy if exists "images: admin delete" on storage.objects;
create policy "images: public read"  on storage.objects for select using (bucket_id = 'site-images');
create policy "images: admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'site-images' and public.is_admin());
create policy "images: admin update" on storage.objects for update to authenticated using (bucket_id = 'site-images' and public.is_admin());
create policy "images: admin delete" on storage.objects for delete to authenticated using (bucket_id = 'site-images' and public.is_admin());

-- 4) Starter gallery photos (the ones already inside the website folder) --
insert into public.gallery (url, caption, sort)
select * from (values
  ('images/spx-truck.jpg',        'Lori penghantaran tiba di hab',           1),
  ('images/unloading.jpg',        'Pemunggahan bungkusan dari lori',         2),
  ('images/hub-front.jpg',        'Premis hab ASZK Logistics',               3),
  ('images/sorting.jpg',          'Pengasingan bungkusan di hab',            4),
  ('images/briefing-hub.jpg',     'Taklimat penghantar di dalam hab',        5),
  ('images/briefing-outside.jpg', 'Taklimat penghantar di luar hab',         6),
  ('images/team.jpg',             'Gambar berkumpulan pasukan ASZK Logistics', 7)
) as v(url, caption, sort)
where not exists (select 1 from public.gallery);

-- =====================================================================
-- 5) MAKE SOMEONE AN ADMIN  (run AFTER you created their user, see guide)
--    Replace the e-mail with the admin's real login e-mail, then run
--    just this one statement:
--
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict do nothing;
-- =====================================================================
