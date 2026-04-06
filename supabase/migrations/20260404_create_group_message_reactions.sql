-- Create separate reactions table for group messages
CREATE TABLE IF NOT EXISTS group_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Create indexes for faster queries
CREATE INDEX idx_group_message_reactions_message_id ON group_message_reactions(message_id);
CREATE INDEX idx_group_message_reactions_user_id ON group_message_reactions(user_id);
CREATE INDEX idx_group_message_reactions_created_at ON group_message_reactions(created_at);

-- Enable RLS
ALTER TABLE group_message_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view reactions on messages in their groups
CREATE POLICY group_message_reactions_select ON group_message_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_messages gm
      JOIN group_conversations gc ON gm.group_id = gc.id
      JOIN group_members gm_check ON gc.id = gm_check.group_id
      WHERE gm.id = group_message_reactions.message_id
      AND gm_check.user_id = auth.uid()
    )
  );

-- Policy: Users can insert their own reactions
CREATE POLICY group_message_reactions_insert ON group_message_reactions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM group_messages gm
      JOIN group_conversations gc ON gm.group_id = gc.id
      JOIN group_members gm_check ON gc.id = gm_check.group_id
      WHERE gm.id = message_id
      AND gm_check.user_id = auth.uid()
    )
  );

-- Policy: Users can delete their own reactions
CREATE POLICY group_message_reactions_delete ON group_message_reactions
  FOR DELETE
  USING (user_id = auth.uid());
