-- STEP 1: Add nullable group_message_id column to message_reactions
-- This allows the same table to serve both direct chat and group chat reactions
-- without breaking any existing direct chat reaction logic.

ALTER TABLE message_reactions
  ADD COLUMN IF NOT EXISTS group_message_id UUID NULL
    REFERENCES group_messages(id)
    ON DELETE CASCADE;

-- STEP 2: Add index for fast group reaction lookups
CREATE INDEX IF NOT EXISTS idx_message_reactions_group_message_id
  ON message_reactions(group_message_id);

-- STEP 3: RLS policy — allow group members to view group reactions
-- (Direct chat reactions already covered by existing policies keyed on message_id)
DO $$
BEGIN
  -- Only create if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_reactions'
      AND policyname = 'message_reactions_group_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY message_reactions_group_select ON message_reactions
        FOR SELECT
        USING (
          -- Allow if this is a group reaction and the user is a member of that group
          (group_message_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM group_messages gm
            JOIN group_conversations gc ON gm.group_id = gc.id
            JOIN group_members gm_check ON gc.id = gm_check.group_id
            WHERE gm.id = group_message_id
              AND gm_check.user_id = auth.uid()
          ))
          OR
          -- Allow if this is a direct chat reaction (existing logic, message_id is set)
          (message_id IS NOT NULL)
        )
    $policy$;
  END IF;
END $$;

-- STEP 4: RLS policy — allow group members to insert their own group reactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_reactions'
      AND policyname = 'message_reactions_group_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY message_reactions_group_insert ON message_reactions
        FOR INSERT
        WITH CHECK (
          user_id = auth.uid() AND (
            (group_message_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM group_messages gm
              JOIN group_conversations gc ON gm.group_id = gc.id
              JOIN group_members gm_check ON gc.id = gm_check.group_id
              WHERE gm.id = group_message_id
                AND gm_check.user_id = auth.uid()
            ))
            OR
            (message_id IS NOT NULL)
          )
        )
    $policy$;
  END IF;
END $$;

-- STEP 5: Unique constraint for group reactions (one emoji per user per group message)
-- Only add if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_reactions_group_message_id_user_id_emoji_key'
  ) THEN
    ALTER TABLE message_reactions
      ADD CONSTRAINT message_reactions_group_message_id_user_id_emoji_key
      UNIQUE NULLS NOT DISTINCT (group_message_id, user_id, emoji);
  END IF;
END $$;
