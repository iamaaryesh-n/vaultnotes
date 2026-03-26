-- Fix workspace_members INSERT policy to allow workspace creators to add members
-- Even if they don't have 'owner' role yet

DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;

CREATE POLICY "workspace_members_insert"
ON public.workspace_members
FOR INSERT
WITH CHECK (
  -- Option 1: User is already an owner in this workspace
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'owner'
  )
  OR
  -- Option 2: User is the workspace creator (founder)
  EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = workspace_members.workspace_id
      AND w.created_by = auth.uid()
  )
);
