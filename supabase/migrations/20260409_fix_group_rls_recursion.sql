-- Fix infinite recursion in group_conversations and group_members RLS policies

-- GROUP_CONVERSATIONS Policies

-- Drop old recursive policies
DROP POLICY IF EXISTS "group_conversations_select" ON public.group_conversations;
DROP POLICY IF EXISTS "group_conversations_update" ON public.group_conversations;

-- Users can view groups they created
CREATE POLICY "group_conversations_select" ON public.group_conversations
  FOR SELECT
  USING (created_by = auth.uid());

-- Users can also view groups they're members of
CREATE POLICY "group_conversations_select_member" ON public.group_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = group_conversations.id
        AND group_members.user_id = auth.uid()
    )
  );

-- Only group creators can update group details
CREATE POLICY "group_conversations_update" ON public.group_conversations
  FOR UPDATE
  USING (created_by = auth.uid());

-- GROUP_MEMBERS Policies

-- Drop old recursive policies
DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
DROP POLICY IF EXISTS "group_members_update" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;

-- Users can always see themselves
CREATE POLICY "group_members_select_self" ON public.group_members
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can see members of groups they created
CREATE POLICY "group_members_select_creator" ON public.group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
        AND created_by = auth.uid()
    )
  );

-- Only creators can add members
CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
        AND created_by = auth.uid()
    )
  );

-- Creators can update roles
CREATE POLICY "group_members_update" ON public.group_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
        AND created_by = auth.uid()
    )
  );

-- Creators can remove members
CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_conversations
      WHERE id = group_members.group_id
        AND created_by = auth.uid()
    )
  );
