-- ============================================================
-- Add User Profiles Table
-- Supports user identity and profile features (name, avatar)
-- ============================================================

-- Create profiles table if it doesn't exist
create table if not exists public.profiles (
  -- Primary key linked to auth.users(id)
  id uuid primary key references auth.users(id) on delete cascade,
  
  -- Email reference (for fallback/reference purposes)
  email text,
  
  -- User profile fields
  name text,                    -- User's display name (nullable)
  avatar_url text,              -- URL to user's avatar image (nullable)
  
  -- Timestamps
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- RLS Policies for profiles
-- Users can view all profiles (for member lists, etc.)
create policy "profiles_select_all"
on public.profiles
for select
to authenticated
using (true);

-- Users can update their own profile
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Users can insert their own profile
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

-- Index for performance
create index if not exists idx_profiles_email on public.profiles(email);

-- ============================================================
-- Add trigger to automatically update updated_at timestamp
-- ============================================================

-- Drop existing trigger if it exists
drop trigger if exists update_profiles_timestamp on public.profiles;

-- Create or replace the trigger function
create or replace function update_profiles_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger
create trigger update_profiles_timestamp
before update on public.profiles
for each row
execute function update_profiles_timestamp();

comment on table public.profiles is 'User profiles with identity information (name, avatar)';
comment on column public.profiles.id is 'Primary key - linked to auth.users(id)';
comment on column public.profiles.email is 'Email address (reference)';
comment on column public.profiles.name is 'User display name';
comment on column public.profiles.avatar_url is 'URL to user avatar image';
