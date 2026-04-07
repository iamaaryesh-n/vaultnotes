-- Rename workspace_invites columns to use correct naming convention
-- invited_by → inviter_id
-- invited_user_id → invitee_id

-- Step 1: Add new columns with correct names
ALTER TABLE public.workspace_invites
ADD COLUMN inviter_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN invitee_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Copy data from old columns to new columns
UPDATE public.workspace_invites
SET inviter_id = invited_by, invitee_id = invited_user_id;

-- Step 3: Drop old constraints (if they exist as named constraints)
ALTER TABLE public.workspace_invites
DROP CONSTRAINT IF EXISTS "workspace_invites_invited_by_fkey",
DROP CONSTRAINT IF EXISTS "workspace_invites_invited_user_id_fkey";

-- Step 4: Drop old columns
ALTER TABLE public.workspace_invites
DROP COLUMN invited_by,
DROP COLUMN invited_user_id;

-- Step 5: Update indexes
DROP INDEX IF EXISTS idx_workspace_invites_invited_user_status;
CREATE INDEX idx_workspace_invites_invitee_status
  ON public.workspace_invites(invitee_id, status, created_at DESC);

-- Step 6: Update RLS policies
DROP POLICY IF EXISTS "workspace_invites_select" ON public.workspace_invites;
CREATE POLICY "workspace_invites_select"
  ON public.workspace_invites
  FOR SELECT
  USING (
    invitee_id = auth.uid()
    OR inviter_id = auth.uid()
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
    inviter_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "workspace_invites_update_invited_user" ON public.workspace_invites;
CREATE POLICY "workspace_invites_update_invitee"
  ON public.workspace_invites
  FOR UPDATE
  USING (invitee_id = auth.uid())
  WITH CHECK (invitee_id = auth.uid());

DROP POLICY IF EXISTS "workspace_invites_update_owner" ON public.workspace_invites;
CREATE POLICY "workspace_invites_update_owner"
  ON public.workspace_invites
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.workspace_invites TO authenticated;
