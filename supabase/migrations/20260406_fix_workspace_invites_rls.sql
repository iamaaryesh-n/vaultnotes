-- Fix workspace_invites RLS policies to allow owners to read all workspace invites
-- This ensures the existing invite check works properly

DROP POLICY IF EXISTS "workspace_invites_select" ON public.workspace_invites;
CREATE POLICY "workspace_invites_select"
  ON public.workspace_invites
  FOR SELECT
  USING (
    -- Self: Can always see invites sent to me
    invited_user_id = auth.uid()
    -- Inviter: Can always see invites I sent
    OR invited_by = auth.uid()
    -- Workspace owner: Can see all invites for workspace they own
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

-- Add UPDATE policy for owners to update invite status if needed
DROP POLICY IF EXISTS "workspace_invites_update_owner" ON public.workspace_invites;
CREATE POLICY "workspace_invites_update_owner"
  ON public.workspace_invites
  FOR UPDATE
  USING (
    -- Owner can update to close out invites if needed
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  )
  WITH CHECK (
    -- Owner can update to close out invites if needed
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

-- Keep the invited user's update policy (for accept/decline)
DROP POLICY IF EXISTS "workspace_invites_update_invited_user" ON public.workspace_invites;
CREATE POLICY "workspace_invites_update_invited_user"
  ON public.workspace_invites
  FOR UPDATE
  USING (invited_user_id = auth.uid())
  WITH CHECK (invited_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.workspace_invites TO authenticated;
