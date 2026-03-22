-- ============================================================
-- Align workspace_keys column name with frontend usage.
-- The DB column was `encrypted_workspace_key` but all frontend
-- queries use `encrypted_key`. Rename to match, and add the
-- missing unique constraint + RLS + index.
-- ============================================================

-- 1. Rename column to match frontend queries
ALTER TABLE public.workspace_keys
  RENAME COLUMN encrypted_workspace_key TO encrypted_key;

-- 2. Add unique constraint (one key per user per workspace)
ALTER TABLE public.workspace_keys
  DROP CONSTRAINT IF EXISTS workspace_keys_unique_user_workspace;

ALTER TABLE public.workspace_keys
  ADD CONSTRAINT workspace_keys_unique_user_workspace
  UNIQUE (workspace_id, user_id);

-- 3. Enable RLS
ALTER TABLE public.workspace_keys ENABLE ROW LEVEL SECURITY;

-- 4. RLS: users can only read their own keys
DROP POLICY IF EXISTS "workspace_keys_select" ON public.workspace_keys;
CREATE POLICY "workspace_keys_select"
ON public.workspace_keys
FOR SELECT
USING (user_id = auth.uid());

-- 5. RLS: users can insert their own keys
DROP POLICY IF EXISTS "workspace_keys_insert" ON public.workspace_keys;
CREATE POLICY "workspace_keys_insert"
ON public.workspace_keys
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- 6. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_workspace_keys_lookup
  ON public.workspace_keys (workspace_id, user_id);
