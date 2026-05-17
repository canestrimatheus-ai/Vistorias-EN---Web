create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  access_role text not null default 'driver',
  active boolean not null default true,
  avatar_url text,
  expo_push_token text,
  push_platform text,
  push_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null default 'Vistoria Agregados',
  driver_name text not null,
  truck_plate text not null,
  trailer_plate text not null,
  status text not null default 'completed',
  observations text,
  signature_name text,
  signature_data jsonb not null default '[]'::jsonb,
  applicable jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  label text not null,
  local_uri text,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_schedules (
  id uuid primary key default gen_random_uuid(),
  driver_user_id uuid references auth.users(id) on delete set null,
  assigned_inspector_id uuid references auth.users(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete set null,
  inspection_type text not null default 'Vistoria Agregados',
  driver_name text not null,
  truck_plate text not null,
  trailer_plate text not null,
  scheduled_date date not null,
  scheduled_time text,
  status text not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.inspection_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists expo_push_token text,
  add column if not exists push_platform text,
  add column if not exists push_updated_at timestamptz;

alter table public.inspection_schedules
  add column if not exists inspection_type text not null default 'Vistoria Agregados';

insert into public.inspection_types (name)
values ('Autocheck'), ('Agendamentos'), ('Vistoria Agregados')
on conflict (name) do nothing;

create index if not exists profiles_access_role_idx
on public.profiles(access_role, active);

create index if not exists inspections_user_created_idx
on public.inspections(user_id, created_at desc);

create index if not exists inspections_status_created_idx
on public.inspections(status, created_at desc);

create index if not exists inspection_photos_inspection_idx
on public.inspection_photos(inspection_id);

create index if not exists inspection_schedules_driver_idx
on public.inspection_schedules(driver_user_id, scheduled_date desc);

create index if not exists inspection_schedules_inspector_idx
on public.inspection_schedules(assigned_inspector_id, scheduled_date desc);

create index if not exists inspection_schedules_status_idx
on public.inspection_schedules(status, scheduled_date desc);

alter table public.profiles enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_photos enable row level security;
alter table public.inspection_schedules enable row level security;
alter table public.inspection_types enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can read own inspections" on public.inspections;
drop policy if exists "Users can insert own inspections" on public.inspections;
drop policy if exists "Users can update own inspections" on public.inspections;
drop policy if exists "Users can read own inspection photos" on public.inspection_photos;
drop policy if exists "Users can insert own inspection photos" on public.inspection_photos;
drop policy if exists "Users can read related schedules" on public.inspection_schedules;
drop policy if exists "Drivers can create own schedules" on public.inspection_schedules;
drop policy if exists "Drivers can update own schedules" on public.inspection_schedules;
drop policy if exists "Authenticated users can read inspection types" on public.inspection_types;

create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read own inspections"
on public.inspections for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own inspections"
on public.inspections for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own inspections"
on public.inspections for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own inspection photos"
on public.inspection_photos for select
to authenticated
using (
  exists (
    select 1
    from public.inspections
    where inspections.id = inspection_photos.inspection_id
      and inspections.user_id = auth.uid()
  )
);

create policy "Users can insert own inspection photos"
on public.inspection_photos for insert
to authenticated
with check (
  exists (
    select 1
    from public.inspections
    where inspections.id = inspection_photos.inspection_id
      and inspections.user_id = auth.uid()
  )
);

create policy "Users can read related schedules"
on public.inspection_schedules for select
to authenticated
using (
  auth.uid() = driver_user_id
  or auth.uid() = assigned_inspector_id
);

create policy "Drivers can create own schedules"
on public.inspection_schedules for insert
to authenticated
with check (auth.uid() = driver_user_id);

create policy "Drivers can update own schedules"
on public.inspection_schedules for update
to authenticated
using (auth.uid() = driver_user_id)
with check (auth.uid() = driver_user_id);

create policy "Authenticated users can read inspection types"
on public.inspection_types for select
to authenticated
using (true);
