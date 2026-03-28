-- Add bio column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text;

-- Create posts table
CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  image_url text,
  created_at timestamptz DEFAULT now(),
  
  -- Ensure at least content or image is provided
  CONSTRAINT posts_content_or_image CHECK (content IS NOT NULL OR image_url IS NOT NULL)
);

-- Create index for efficient fetching (user_id + created_at DESC)
CREATE INDEX IF NOT EXISTS idx_posts_user_created_at
  ON public.posts (user_id, created_at DESC);
