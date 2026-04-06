-- Create group chat tables for Chat.jsx group functionality

-- Group Conversations Table
CREATE TABLE IF NOT EXISTS public.group_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encryption_key TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group Members Table (join table)
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate memberships
  UNIQUE(group_id, user_id)
);

-- Group Messages Table
CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  encrypted_content TEXT,
  iv TEXT,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image')),
  media_url TEXT,
  image_url TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Message state
  reply_to_id UUID REFERENCES public.group_messages(id) ON DELETE SET NULL,
  forwarded_from_id UUID REFERENCES public.group_messages(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_group_conversations_created_by ON public.group_conversations(created_by);
CREATE INDEX idx_group_conversations_created_at ON public.group_conversations(created_at);
CREATE INDEX idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX idx_group_messages_sender_id ON public.group_messages(sender_id);
CREATE INDEX idx_group_messages_created_at ON public.group_messages(created_at);

-- Enable Row Level Security
ALTER TABLE public.group_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- GROUP_CONVERSATIONS Policies

-- Users can view groups they created
DROP POLICY IF EXISTS "group_conversations_select" ON public.group_conversations;
CREATE POLICY "group_conversations_select" ON public.group_conversations
  FOR SELECT
  USING (created_by = auth.uid());

-- Users can also view groups they're members of
DROP POLICY IF EXISTS "group_conversations_select_member" ON public.group_conversations;
CREATE POLICY "group_conversations_select_member" ON public.group_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = group_conversations.id
        AND group_members.user_id = auth.uid()
    )
  );

-- Users can create groups
DROP POLICY IF EXISTS "group_conversations_insert" ON public.group_conversations;
CREATE POLICY "group_conversations_insert" ON public.group_conversations
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Only group creators can update group details
DROP POLICY IF EXISTS "group_conversations_update" ON public.group_conversations;
CREATE POLICY "group_conversations_update" ON public.group_conversations
  FOR UPDATE
  USING (created_by = auth.uid());

-- GROUP_MEMBERS Policies

-- Users can view members of groups they created or are part of (simplified to avoid recursion)
DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT
  USING (auth.uid() = user_id);  -- Users can always see themselves

-- Alternate: View members of groups you're part of
DROP POLICY IF EXISTS "group_members_select_all" ON public.group_members;
CREATE POLICY "group_members_select_all" ON public.group_members
  FOR SELECT
  USING (
    -- Creator can see all members of their groups
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
        AND created_by = auth.uid()
    )
  );

-- Only creators can add the first member (themselves)
DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT
  WITH CHECK (
    -- Creator adding themselves or others
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
        AND created_by = auth.uid()
    )
  );

-- Admins can update roles
DROP POLICY IF EXISTS "group_members_update" ON public.group_members;
CREATE POLICY "group_members_update" ON public.group_members
  FOR UPDATE
  USING (
    -- Creator/admin can update
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
        AND created_by = auth.uid()
    )
  );

-- Creators/admins can remove members
DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;
CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
        AND created_by = auth.uid()
    )
  );

-- GROUP_MESSAGES Policies

-- Users can view messages in groups they're members of
DROP POLICY IF EXISTS "group_messages_select" ON public.group_messages;
CREATE POLICY "group_messages_select" ON public.group_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = group_messages.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- Users can insert messages to groups they're members of
DROP POLICY IF EXISTS "group_messages_insert" ON public.group_messages;
CREATE POLICY "group_messages_insert" ON public.group_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = group_messages.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- Users can update their own messages
DROP POLICY IF EXISTS "group_messages_update" ON public.group_messages;
CREATE POLICY "group_messages_update" ON public.group_messages
  FOR UPDATE
  USING (auth.uid() = sender_id);

-- Users can delete their own messages
DROP POLICY IF EXISTS "group_messages_delete" ON public.group_messages;
CREATE POLICY "group_messages_delete" ON public.group_messages
  FOR DELETE
  USING (auth.uid() = sender_id);
