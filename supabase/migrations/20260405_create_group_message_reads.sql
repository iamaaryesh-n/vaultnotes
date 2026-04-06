-- Track who has read/seen each group message for "Seen by" indicator
CREATE TABLE IF NOT EXISTS public.group_message_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Each user can only mark a message as read once
  UNIQUE(message_id, user_id)
);

-- Create indexes for performance
CREATE INDEX idx_group_message_reads_message_id ON public.group_message_reads(message_id);
CREATE INDEX idx_group_message_reads_user_id ON public.group_message_reads(user_id);

-- Enable Row Level Security
ALTER TABLE public.group_message_reads ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view read receipts for messages in their groups
CREATE POLICY "Users can view read receipts for their group messages" ON public.group_message_reads
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.group_messages
      WHERE group_messages.id = group_message_reads.message_id
      AND EXISTS(
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = group_messages.group_id
        AND group_members.user_id = auth.uid()
      )
    )
  );

-- Policy: Users can insert their own read receipts
CREATE POLICY "Users can mark messages as read" ON public.group_message_reads
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS(
      SELECT 1 FROM public.group_messages
      WHERE group_messages.id = group_message_reads.message_id
      AND EXISTS(
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = group_messages.group_id
        AND group_members.user_id = auth.uid()
      )
    )
  );
