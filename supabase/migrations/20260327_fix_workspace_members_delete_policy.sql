-- ============================================================
-- Fix workspace_members DELETE policy
-- Allow users to delete their OWN membership row + owners can delete any member
-- ============================================================

-- Replace the restrictive DELETE policy with one that allows users to leave
DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;

CREATE POLICY "workspace_members_delete"
ON public.workspace_members
FOR DELETE
USING (
  -- User can delete their own membership row
  user_id = auth.uid()
  OR
  -- OR: workspace owner can delete any member
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'owner'
  )
);
