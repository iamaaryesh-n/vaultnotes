-- Create table to store conversation encryption keys
CREATE TABLE IF NOT EXISTS public.conversation_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  encrypted_key_user1 TEXT NOT NULL,
  encrypted_key_user2 TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE,
  UNIQUE(conversation_id)
);

-- Create index for faster lookups
CREATE INDEX idx_conversation_keys_conversation_id ON public.conversation_keys(conversation_id);

-- Enable RLS
ALTER TABLE public.conversation_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view keys for their conversations
CREATE POLICY "Users can view their conversation keys" ON public.conversation_keys
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.conversations 
      WHERE conversations.id = conversation_keys.conversation_id 
      AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
    )
  );

-- Policy: Anyone can insert keys (will be constrained by conversation access)
CREATE POLICY "Users can create keys for their conversations" ON public.conversation_keys
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.conversations 
      WHERE conversations.id = conversation_keys.conversation_id 
      AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
    )
  );

-- Policy: Users can update keys for their conversations  
CREATE POLICY "Users can update keys for their conversations" ON public.conversation_keys
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.conversations 
      WHERE conversations.id = conversation_keys.conversation_id 
      AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.conversation_keys TO authenticated;
