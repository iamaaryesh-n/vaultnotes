-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure each pair of users has only one conversation
  UNIQUE(user1_id, user2_id),
  UNIQUE(user2_id, user1_id)
);

-- Create messages table with encryption support
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Message content - can be plain text (legacy) or encrypted
  content TEXT,
  encrypted_content TEXT,
  iv TEXT,
  
  -- Message metadata
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image')),
  media_url TEXT,
  image_url TEXT,
  
  -- Message state
  is_read BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_forwarded BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Relations
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  forwarded_from_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL
);

-- Create message_reactions table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Each user can only react with one emoji per message
  UNIQUE(message_id, user_id, emoji)
);

-- Create indexes for performance
CREATE INDEX idx_conversations_user1 ON public.conversations(user1_id);
CREATE INDEX idx_conversations_user2 ON public.conversations(user2_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_messages_is_read ON public.messages(is_read);
CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);
CREATE INDEX idx_message_reactions_user ON public.message_reactions(user_id);

-- Enable Row Level Security
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- CONVERSATIONS Policies
-- Users can view conversations they're part of
CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Users can create conversations
CREATE POLICY "Users can create conversations" ON public.conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- MESSAGES Policies
-- Users can view messages from their conversations
CREATE POLICY "Users can view messages from their conversations" ON public.messages
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
    )
  );

-- Users can insert messages to their conversations
CREATE POLICY "Users can insert messages to their conversations" ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS(
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
    )
  );

-- Users can update their own messages
CREATE POLICY "Users can update their own messages" ON public.messages
  FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- Users can delete their own messages
CREATE POLICY "Users can delete their own messages" ON public.messages
  FOR DELETE
  USING (auth.uid() = sender_id);

-- MESSAGE_REACTIONS Policies
-- Users can view reactions from their conversations
CREATE POLICY "Users can view reactions in their conversations" ON public.message_reactions
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.messages
      JOIN public.conversations ON conversations.id = messages.conversation_id
      WHERE message_reactions.message_id = messages.id
      AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
    )
  );

-- Users can insert reactions to messages in their conversations
CREATE POLICY "Users can add reactions to messages in their conversations" ON public.message_reactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS(
      SELECT 1 FROM public.messages
      JOIN public.conversations ON conversations.id = messages.conversation_id
      WHERE message_reactions.message_id = messages.id
      AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
    )
  );

-- Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions" ON public.message_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
