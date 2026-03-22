-- ============================================================
-- Schema Stabilization Migration
-- Ensures all tables match the canonical frontend schema.
-- Safe to run on an already-correct database (uses IF NOT EXISTS
-- and DO $$ blocks to avoid errors on re-run).
-- ============================================================

-- 1. workspaces: verify required columns exist
--    (id, name, created_by, created_at are all present from phase1)
--    No changes needed — included here as documentation.

-- 2. workspace_members: verify FK + unique constraint
--    (workspace_id → workspaces.id, unique(workspace_id, user_id) from phase1)
--    No changes needed.

-- 3. memories: add any missing columns safely

-- tags column (added in add_tags_to_memories.sql, guard here)
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- is_favorite column (added in add_is_favorite_to_memories.sql, guard here)
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false NOT NULL;

-- 4. Auto-update updated_at on memories via trigger
--    (updated_at exists from phase1 but was never auto-maintained)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop and recreate trigger to make this migration idempotent
DROP TRIGGER IF EXISTS memories_set_updated_at ON public.memories;

CREATE TRIGGER memories_set_updated_at
  BEFORE UPDATE ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Ensure index on is_favorite for sort performance
CREATE INDEX IF NOT EXISTS idx_memories_is_favorite
  ON public.memories (workspace_id, is_favorite DESC, updated_at DESC);
