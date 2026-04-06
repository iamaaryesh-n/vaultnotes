-- Fix RLS for group_message_reads so authenticated group members can upsert read receipts.
-- Upsert requires BOTH INSERT and UPDATE policies.

ALTER TABLE public.group_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view read receipts for their group messages" ON public.group_message_reads;
DROP POLICY IF EXISTS "Users can mark messages as read" ON public.group_message_reads;
DROP POLICY IF EXISTS "group_message_reads_select_member" ON public.group_message_reads;
DROP POLICY IF EXISTS "group_message_reads_insert_member" ON public.group_message_reads;
DROP POLICY IF EXISTS "group_message_reads_update_member" ON public.group_message_reads;

CREATE POLICY "group_message_reads_select_member"
ON public.group_message_reads
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.group_messages gm
    JOIN public.group_members gmem
      ON gmem.group_id = gm.group_id
    WHERE gm.id = group_message_reads.message_id
      AND gmem.user_id = auth.uid()
  )
);

CREATE POLICY "group_message_reads_insert_member"
ON public.group_message_reads
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.group_messages gm
    JOIN public.group_members gmem
      ON gmem.group_id = gm.group_id
    WHERE gm.id = group_message_reads.message_id
      AND gmem.user_id = auth.uid()
  )
);

CREATE POLICY "group_message_reads_update_member"
ON public.group_message_reads
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.group_messages gm
    JOIN public.group_members gmem
      ON gmem.group_id = gm.group_id
    WHERE gm.id = group_message_reads.message_id
      AND gmem.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.group_messages gm
    JOIN public.group_members gmem
      ON gmem.group_id = gm.group_id
    WHERE gm.id = group_message_reads.message_id
      AND gmem.user_id = auth.uid()
  )
);
