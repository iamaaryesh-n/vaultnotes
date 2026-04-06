-- Add storage_path column to messages table for private bucket image storage
-- This stores the path to the file in the private chat-images bucket
-- The signed URL is generated on-demand with short expiry (1 hour)

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Add indexes for storage path queries
CREATE INDEX idx_messages_storage_path ON public.messages(storage_path) 
WHERE storage_path IS NOT NULL;

-- Migration note: Existing public media_url references can coexist during transition
-- New image uploads will use storage_path exclusively from chat-images bucket
-- Old media_url field remains for backward compatibility with existing images
