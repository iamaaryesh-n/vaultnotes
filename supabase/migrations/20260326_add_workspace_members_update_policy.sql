-- ============================================================
-- Add UPDATE policy for workspace_members
-- Allows workspace owners to update member roles
-- ============================================================

-- UPDATE: only the workspace owner can change member roles
CREATE POLICY "workspace_members_update"
ON public.workspace_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'owner'
  )
);
