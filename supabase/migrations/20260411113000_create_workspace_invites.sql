CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_invited_user_status
  ON public.workspace_invites(invited_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace
  ON public.workspace_invites(workspace_id, created_at DESC);

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_invites_select" ON public.workspace_invites;
CREATE POLICY "workspace_invites_select"
  ON public.workspace_invites
  FOR SELECT
  USING (
    invited_user_id = auth.uid()
    OR invited_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "workspace_invites_insert" ON public.workspace_invites;
CREATE POLICY "workspace_invites_insert"
  ON public.workspace_invites
  FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "workspace_invites_update_invited_user" ON public.workspace_invites;
CREATE POLICY "workspace_invites_update_invited_user"
  ON public.workspace_invites
  FOR UPDATE
  USING (invited_user_id = auth.uid())
  WITH CHECK (invited_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.workspace_invites TO authenticated;
