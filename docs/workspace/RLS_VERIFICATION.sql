-- RLS Verification Script for Public Workspaces Discovery
-- Run this in supabase to verify RLS policies are correctly configured

-- 1. Check if RLS is enabled on workspaces table
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'workspaces';

-- 2. List all policies on workspaces table
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'workspaces'
ORDER BY policyname;

-- 3. Test public workspaces are readable by anyone (should return public workspaces)
SELECT id, name, is_public, created_by 
FROM workspaces 
WHERE is_public = true
LIMIT 5;

-- 4. Test that private workspaces are not returned to unauthorized users
-- (This should return 0 rows for a user who is not a member)
SELECT id, name, is_public, created_by 
FROM workspaces 
WHERE is_public = false AND created_by != auth.uid()
LIMIT 5;

-- 5. Check if user's own private workspaces are accessible
SELECT id, name, is_public, created_by 
FROM workspaces 
WHERE created_by = auth.uid()
LIMIT 5;

-- 6. Check workspace_members table for user's memberships
SELECT workspace_id, user_id, role 
FROM workspace_members 
WHERE user_id = auth.uid()
LIMIT 5;

-- 7. Verify workspace policies enforce member checks
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE tablename IN ('workspaces', 'workspace_members')
ORDER BY tablename, policyname;
