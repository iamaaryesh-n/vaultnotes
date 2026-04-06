-- Add delivery and seen status tracking to messages table
-- Tracks message delivery lifecycle: sent -> delivered -> seen

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'seen')),
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for faster queries on delivery status
CREATE INDEX idx_messages_delivery_status ON public.messages(delivery_status) 
WHERE delivery_status IN ('sent', 'delivered');

CREATE INDEX idx_messages_receiver_delivery ON public.messages(receiver_id, delivery_status)
WHERE delivery_status IN ('sent', 'delivered');
