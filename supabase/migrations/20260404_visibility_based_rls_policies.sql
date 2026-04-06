-- Add visibility-based RLS policies
-- Maintains backward compatibility with is_public while supporting new visibility enum

-- Helper: Get workspace visibility (prefers visibility field, falls back to is_public)
-- Returns: 'public' | 'private' | 'group' 
-- SQL: CASE WHEN visibility IS NOT NULL THEN visibility 
--      ELSE CASE WHEN is_public THEN 'public' ELSE 'private' END END

-- ===== MEMORIES TABLE =====
-- Updated to support both visibility enum and legacy is_public boolean

DROP POLICY IF EXISTS "memories_select" ON public.memories;

-- SELECT: User can read memories if:
-- 1. They are a workspace member, OR
-- 2. The workspace is public (either via new visibility field or legacy is_public)
CREATE POLICY "memories_select"
ON public.memories
FOR SELECT
USING (
  -- Member can always read
  (
    SELECT COUNT(1) FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  ) > 0
  OR
  -- Non-member can read if workspace is public
  (
    SELECT CASE 
      WHEN visibility IS NOT NULL THEN visibility = 'public'
      ELSE is_public = true
    END
    FROM public.workspaces w
    WHERE w.id = memories.workspace_id
  )
);

-- INSERT: Only members can insert memories
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

-- UPDATE: Only members (with proper role) can update
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
);

-- DELETE: Only members (with proper role) can delete
DROP POLICY IF EXISTS "memories_delete" ON public.memories;
CREATE POLICY "memories_delete"
ON public.memories
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = memories.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- ===== WORKSPACE_KEYS TABLE =====
-- Updated to allow non-members to fetch keys from public workspaces

DROP POLICY IF EXISTS "workspace_keys_select" ON public.workspace_keys;

-- SELECT: User can read workspace key if:
-- 1. They are the owner of the key, AND either:
--    a. They are a member of the workspace, OR
--    b. The workspace is public
CREATE POLICY "workspace_keys_select"
ON public.workspace_keys
FOR SELECT
USING (
  user_id = auth.uid()
  AND (
    -- User is member
    (
      SELECT COUNT(1) FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_keys.workspace_id
        AND wm.user_id = auth.uid()
    ) > 0
    OR
    -- Workspace is public
    (
      SELECT CASE 
        WHEN visibility IS NOT NULL THEN visibility = 'public'
        ELSE is_public = true
      END
      FROM public.workspaces w
      WHERE w.id = workspace_keys.workspace_id
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
-- Updated to allow non-members to read public workspaces

DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;

-- SELECT: User can read workspace if:
-- 1. They are a member, OR
-- 2. The workspace is public
CREATE POLICY "workspaces_select"
ON public.workspaces
FOR SELECT
USING (
  -- Member can read
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspaces.id
      AND wm.user_id = auth.uid()
  )
  OR
  -- Public workspace readable by all
  (
    CASE 
      WHEN visibility IS NOT NULL THEN visibility = 'public'
      ELSE is_public = true
    END
  )
);
