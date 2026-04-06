-- CRITICAL FIX: Replace restrictive RLS policy with public workspace visibility
-- The old policy "Users can view their workspaces" only allows workspace members to view workspaces
-- This migration properly drops the old policy and creates new one that allows public workspace visibility

-- Step 1: Drop the OLD policy that restricts to members only
DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;

-- Step 2: Drop any conflicting policies we may have created
DROP POLICY IF EXISTS "users_can_view_workspace" ON public.workspaces;
DROP POLICY IF EXISTS "users_can_create_workspace" ON public.workspaces;
DROP POLICY IF EXISTS "users_can_update_workspace" ON public.workspaces;
DROP POLICY IF EXISTS "users_can_delete_workspace" ON public.workspaces;

-- Step 3: Create the CORRECT SELECT policy: public workspaces visible to all, private only to members
CREATE POLICY "workspaces_select_policy" ON public.workspaces
  FOR SELECT
  USING (
    -- Case 1: Public workspace - visible to all authenticated users
    (is_public = true)
    OR
    -- Case 2: Private workspace - visible only to members
    (
      is_public = false
      AND EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
      )
    )
  );

-- Step 4: CREATE INSERT policy - users can create their own workspaces
CREATE POLICY "workspaces_insert_policy" ON public.workspaces
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Step 5: CREATE UPDATE policy - only owner or admin members can update
CREATE POLICY "workspaces_update_policy" ON public.workspaces
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin')
    )
  );

-- Step 6: CREATE DELETE policy - only owner can delete
CREATE POLICY "workspaces_delete_policy" ON public.workspaces
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role = 'owner'
    )
  );

-- Verify the policy is in place
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'workspaces'
ORDER BY policyname;
