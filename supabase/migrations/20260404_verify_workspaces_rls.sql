-- Verify and ensure RLS is properly enabled on workspaces table
-- This migration ensures all policies are in place and RLS is enabled

-- Enable RLS on workspaces if not already enabled
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "users_can_view_workspace" ON public.workspaces;
DROP POLICY IF EXISTS "users_can_create_workspace" ON public.workspaces;
DROP POLICY IF EXISTS "users_can_update_workspace" ON public.workspaces;
DROP POLICY IF EXISTS "users_can_delete_workspace" ON public.workspaces;

-- SELECT policy: public workspaces visible to all, private only to members
CREATE POLICY "users_can_view_workspace" ON public.workspaces
  FOR SELECT
  USING (
    is_public = true
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
    )
  );

-- INSERT policy: any authenticated user can create a workspace
CREATE POLICY "users_can_create_workspace" ON public.workspaces
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE policy: only workspace owner or admin can update
CREATE POLICY "users_can_update_workspace" ON public.workspaces
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin')
    )
  );

-- DELETE policy: only workspace owner can delete
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
