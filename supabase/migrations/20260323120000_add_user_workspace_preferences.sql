-- ============================================================
-- Add user_workspace_preferences table for per-workspace settings
-- Stores preferences like sort order for each user per workspace
-- ============================================================

-- 1. Create preferences table
CREATE TABLE IF NOT EXISTS public.user_workspace_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sort_order TEXT NOT NULL DEFAULT 'newest' CHECK (sort_order IN ('newest', 'oldest')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, workspace_id)
);

-- 2. Enable RLS
ALTER TABLE public.user_workspace_preferences ENABLE ROW LEVEL SECURITY;

-- 3. RLS: users can only read their own preferences
DROP POLICY IF EXISTS "user_workspace_preferences_select" ON public.user_workspace_preferences;
CREATE POLICY "user_workspace_preferences_select"
ON public.user_workspace_preferences
FOR SELECT
USING (user_id = auth.uid());

-- 4. RLS: users can insert their own preferences
DROP POLICY IF EXISTS "user_workspace_preferences_insert" ON public.user_workspace_preferences;
CREATE POLICY "user_workspace_preferences_insert"
ON public.user_workspace_preferences
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- 5. RLS: users can update their own preferences
DROP POLICY IF EXISTS "user_workspace_preferences_update" ON public.user_workspace_preferences;
CREATE POLICY "user_workspace_preferences_update"
ON public.user_workspace_preferences
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 6. RLS: users can delete their own preferences
DROP POLICY IF EXISTS "user_workspace_preferences_delete" ON public.user_workspace_preferences;
CREATE POLICY "user_workspace_preferences_delete"
ON public.user_workspace_preferences
FOR DELETE
USING (user_id = auth.uid());

-- 7. Create index for faster lookups
CREATE INDEX idx_user_workspace_preferences_user_workspace
ON public.user_workspace_preferences(user_id, workspace_id);

-- 8. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_workspace_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_workspace_preferences_timestamp
ON public.user_workspace_preferences;

CREATE TRIGGER trigger_user_workspace_preferences_timestamp
BEFORE UPDATE ON public.user_workspace_preferences
FOR EACH ROW
EXECUTE FUNCTION update_user_workspace_preferences_timestamp();
