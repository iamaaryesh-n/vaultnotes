-- ============================================================
-- Strict RLS Policy Replacement
-- Drops all existing policies and replaces with tighter rules.
-- Uses EXISTS subqueries throughout for correctness and performance.
-- ============================================================

-- Ensure RLS is enabled on all target tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WORKSPACES
-- ============================================================

DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;

-- SELECT: user can see a workspace only if they are a member
CREATE POLICY "workspaces_select"
ON public.workspaces
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspaces.id
      AND wm.user_id = auth.uid()
  )
);

-- INSERT: user can only create a workspace as themselves
CREATE POLICY "workspaces_insert"
ON public.workspaces
FOR INSERT
WITH CHECK (created_by = auth.uid());

-- ============================================================
-- WORKSPACE MEMBERS
-- ============================================================

DROP POLICY IF EXISTS "Users can view their memberships" ON public.workspace_members;

-- SELECT: user can see only their own membership rows
CREATE POLICY "workspace_members_select"
ON public.workspace_members
FOR SELECT
USING (user_id = auth.uid());

-- INSERT: only the workspace owner (role = 'owner') can add members
CREATE POLICY "workspace_members_insert"
ON public.workspace_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'owner'
  )
);

-- DELETE: only the workspace owner can remove members
CREATE POLICY "workspace_members_delete"
ON public.workspace_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'owner'
  )
);

-- ============================================================
-- MEMORIES
-- ============================================================

DROP POLICY IF EXISTS "Users can view memories in their workspaces" ON public.memories;
DROP POLICY IF EXISTS "Users can insert memories in their workspace" ON public.memories;
DROP POLICY IF EXISTS "Users can update their own memories" ON public.memories;
DROP POLICY IF EXISTS "Users can delete their own memories" ON public.memories;

-- SELECT: user can read memories only if they are a workspace member
CREATE POLICY "memories_select"
ON public.memories
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- INSERT: user can add memories only if they are a workspace member
CREATE POLICY "memories_insert"
ON public.memories
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- UPDATE: allowed if user is the creator OR a member of the workspace
CREATE POLICY "memories_update"
ON public.memories
FOR UPDATE
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- DELETE: allowed if user is the creator OR the workspace owner
CREATE POLICY "memories_delete"
ON public.memories
FOR DELETE
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'owner'
  )
);
