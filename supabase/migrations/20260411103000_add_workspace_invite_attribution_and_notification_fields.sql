-- Workspace membership attribution fields
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP WITH TIME ZONE;

-- Backfill invited_at for existing rows to preserve ordering context.
UPDATE public.workspace_members
SET invited_at = COALESCE(invited_at, created_at)
WHERE invited_at IS NULL;

-- Notification payload fields for workspace invite navigation and text.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS message TEXT;

CREATE INDEX IF NOT EXISTS idx_workspace_members_invited_by
  ON public.workspace_members(invited_by);

CREATE INDEX IF NOT EXISTS idx_workspace_members_invited_at
  ON public.workspace_members(invited_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id
  ON public.notifications(workspace_id, created_at DESC);
