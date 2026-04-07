-- Per-user conversation UI preferences (archive/delete state)
CREATE TABLE IF NOT EXISTS public.conversation_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.group_conversations(id) ON DELETE CASCADE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_preferences_target_check
    CHECK (((conversation_id IS NOT NULL)::INT + (group_id IS NOT NULL)::INT) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_preferences_user_conversation_unique
  ON public.conversation_preferences(user_id, conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_preferences_user_group_unique
  ON public.conversation_preferences(user_id, group_id)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_preferences_user_lookup
  ON public.conversation_preferences(user_id, is_deleted, is_archived);

ALTER TABLE public.conversation_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_preferences_select_own" ON public.conversation_preferences;
CREATE POLICY "conversation_preferences_select_own"
  ON public.conversation_preferences
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "conversation_preferences_insert_own" ON public.conversation_preferences;
CREATE POLICY "conversation_preferences_insert_own"
  ON public.conversation_preferences
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conversation_preferences_update_own" ON public.conversation_preferences;
CREATE POLICY "conversation_preferences_update_own"
  ON public.conversation_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conversation_preferences_delete_own" ON public.conversation_preferences;
CREATE POLICY "conversation_preferences_delete_own"
  ON public.conversation_preferences
  FOR DELETE
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_preferences TO authenticated;
