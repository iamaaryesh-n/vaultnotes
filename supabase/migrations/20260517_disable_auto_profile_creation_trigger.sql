-- ============================================================
-- Disable Automatic Profile Creation Trigger
-- ============================================================
-- 
-- REASON: The trigger was creating profiles with NULL username,
-- causing newly created accounts to have no valid username.
-- 
-- The signup flow (frontend) now owns profile creation with
-- proper username generation. The trigger is no longer needed.
--
-- This migration removes the trigger to prevent duplicate profiles
-- with NULL usernames from being automatically created when auth users are created.
-- 
-- The frontend signup flow will handle all profile creation:
-- 1. User signs up via Login.jsx or auth.signUpUser()
-- 2. Auth user is created via supabase.auth.signUp()
-- 3. Frontend inserts profile with generated username
-- 4. No automatic profile creation via trigger
--

-- Drop the trigger that was creating profiles
drop trigger if exists on_auth_user_created on auth.users;

-- Drop the function (no longer needed)
drop function if exists public.handle_auth_user_signup();

comment on migration '20260517_disable_auto_profile_creation_trigger' is 'Removed automatic profile creation trigger to fix username=null issue. Frontend signup flows now own profile creation with proper username generation.';
