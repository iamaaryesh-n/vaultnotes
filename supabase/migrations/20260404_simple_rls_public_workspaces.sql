-- SIMPLIFIED: Fix RLS policies for public workspace memory access
-- This version uses ONLY the existing is_public field (proven to work)
-- Will not use visibility enum until column is added

-- ===== MEMORIES TABLE =====
-- Allow non-members to read memories from public workspaces

DROP POLICY IF EXISTS "memories_select" ON public.memories;

CREATE POLICY "memories_select"
ON public.memories
FOR SELECT
USING (
  -- User is a workspace member
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
  OR
  -- Workspace is public
  EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = memories.workspace_id
      AND w.is_public = true
  )
);

-- INSERT: Only members can insert
DROP POLICY IF EXISTS "memories_insert" ON public.memories;

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

-- UPDATE: Only members can update
DROP POLICY IF EXISTS "memories_update" ON public.memories;

CREATE POLICY "memories_update"
ON public.memories
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
  AND created_by = auth.uid()
);

-- DELETE: Only members can delete
DROP POLICY IF EXISTS "memories_delete" ON public.memories;

CREATE POLICY "memories_delete"
ON public.memories
FOR DELETE
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- ===== WORKSPACE_KEYS TABLE =====
-- Allow non-members to fetch keys from public workspaces

DROP POLICY IF EXISTS "workspace_keys_select" ON public.workspace_keys;

CREATE POLICY "workspace_keys_select"
ON public.workspace_keys
FOR SELECT
USING (
  user_id = auth.uid()
  AND (
    -- User is member of workspace
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_keys.workspace_id
        AND wm.user_id = auth.uid()
    )
    OR
    -- Workspace is public
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = workspace_keys.workspace_id
        AND w.is_public = true
    )
  )
);

-- INSERT: Only members can insert keys
DROP POLICY IF EXISTS "workspace_keys_insert" ON public.workspace_keys;

CREATE POLICY "workspace_keys_insert"
ON public.workspace_keys
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_keys.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- DELETE: Only members can delete keys
DROP POLICY IF EXISTS "workspace_keys_delete" ON public.workspace_keys;

CREATE POLICY "workspace_keys_delete"
ON public.workspace_keys
FOR DELETE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_keys.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- ===== WORKSPACES TABLE =====
-- Allow non-members to read public workspaces

DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;

CREATE POLICY "workspaces_select"
ON public.workspaces
FOR SELECT
USING (
  -- User is member of workspace
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspaces.id
      AND wm.user_id = auth.uid()
  )
  OR
  -- Workspace is public
  is_public = true
);

-- UPDATE: Only workspace owner can update
DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;

CREATE POLICY "workspaces_update"
ON public.workspaces
FOR UPDATE
USING (
  created_by = auth.uid()
);

-- DELETE: Only workspace owner can delete
DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;

CREATE POLICY "workspaces_delete"
ON public.workspaces
FOR DELETE
USING (
  created_by = auth.uid()
);
