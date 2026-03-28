-- ============================================================
-- Add username field to profiles table
-- Supports unique username system for user identity
-- ============================================================

-- Add username column if not exists
alter table public.profiles
add column if not exists username text unique;

-- Create index for fast username lookups
create index if not exists idx_profiles_username on public.profiles(username);

-- Add comment
comment on column public.profiles.username is 'Unique username for user identity (lowercase, alphanumeric)';
