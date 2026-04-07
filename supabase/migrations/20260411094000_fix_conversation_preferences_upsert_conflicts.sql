-- Ensure ON CONFLICT targets used by frontend upsert() are backed by unique constraints.
-- Frontend uses:
--   private -> onConflict: "user_id,conversation_id"
--   group   -> onConflict: "user_id,group_id"

-- Cleanup duplicate private preference rows (keep newest).
WITH ranked_private AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, conversation_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_num
  FROM public.conversation_preferences
  WHERE conversation_id IS NOT NULL
)
DELETE FROM public.conversation_preferences p
USING ranked_private r
WHERE p.id = r.id
  AND r.row_num > 1;

-- Cleanup duplicate group preference rows (keep newest).
WITH ranked_group AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, group_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_num
  FROM public.conversation_preferences
  WHERE group_id IS NOT NULL
)
DELETE FROM public.conversation_preferences p
USING ranked_group r
WHERE p.id = r.id
  AND r.row_num > 1;

-- Add explicit unique constraints matching onConflict columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_preferences_user_conversation_unique'
      AND conrelid = 'public.conversation_preferences'::regclass
  ) THEN
    ALTER TABLE public.conversation_preferences
      ADD CONSTRAINT conversation_preferences_user_conversation_unique
      UNIQUE (user_id, conversation_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_preferences_user_group_unique'
      AND conrelid = 'public.conversation_preferences'::regclass
  ) THEN
    ALTER TABLE public.conversation_preferences
      ADD CONSTRAINT conversation_preferences_user_group_unique
      UNIQUE (user_id, group_id);
  END IF;
END $$;
