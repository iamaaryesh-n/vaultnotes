-- Fix: Allow non-members to read memories from public workspaces
-- This enables users to view memory metadata in public workspaces they're not members of

DROP POLICY IF EXISTS "memories_select" ON public.memories;

-- SELECT: user can read memories if:
-- 1. They are a workspace member, OR
-- 2. The workspace is public
CREATE POLICY "memories_select"
ON public.memories
FOR SELECT
USING (
  -- Member can always read their workspace's memories
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
  OR
  -- Non-member can read memories from public workspaces
  EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = memories.workspace_id
      AND w.is_public = true
  )
);
