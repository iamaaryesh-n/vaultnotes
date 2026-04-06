-- Update workspaces RLS policies to support public visibility
-- SELECT: Allow everyone to read public workspaces + members to read private ones
-- UPDATE/DELETE/INSERT: Only workspace members with appropriate roles can modify

-- Drop existing SELECT policy if it exists
DROP POLICY IF EXISTS "users_can_view_workspace" ON public.workspaces;

-- New SELECT policy: public workspaces visible to all, private only to members
CREATE POLICY "users_can_view_workspace" ON public.workspaces
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

-- Keep existing INSERT policy: only users creating workspace (handled in trigger)
DROP POLICY IF EXISTS "users_can_create_workspace" ON public.workspaces;
CREATE POLICY "users_can_create_workspace" ON public.workspaces
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Keep existing UPDATE policy: only owner or admin members can update workspace settings
DROP POLICY IF EXISTS "users_can_update_workspace" ON public.workspaces;
CREATE POLICY "users_can_update_workspace" ON public.workspaces
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin')
    )
  );

-- Keep existing DELETE policy: only owner can delete workspace
DROP POLICY IF EXISTS "users_can_delete_workspace" ON public.workspaces;
CREATE POLICY "users_can_delete_workspace" ON public.workspaces
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role = 'owner'
    )
  );
