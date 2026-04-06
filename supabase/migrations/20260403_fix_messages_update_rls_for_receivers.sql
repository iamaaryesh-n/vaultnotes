-- Allow receivers to update is_read, delivery_status, and seen_at
CREATE POLICY "Receivers can update read status of messages they received" ON public.messages
  FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);
