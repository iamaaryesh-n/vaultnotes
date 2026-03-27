-- ============================================================
-- Add DELETE policy for workspaces
-- Only workspace owner (created_by = auth.uid()) can delete
-- ============================================================

-- DELETE: only the workspace creator/owner can delete the workspace
CREATE POLICY "workspaces_delete"
ON public.workspaces
FOR DELETE
USING (created_by = auth.uid());
