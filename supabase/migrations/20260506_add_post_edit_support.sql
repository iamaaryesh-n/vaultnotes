-- Add edit support to posts table

-- Add updated_at and is_edited columns if they don't exist
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;

-- Update existing posts to have updated_at = created_at if null
UPDATE public.posts
  SET updated_at = created_at
  WHERE updated_at IS NULL;

-- Create index for efficient sorting by updated_at
CREATE INDEX IF NOT EXISTS idx_posts_user_updated_at
  ON public.posts (user_id, updated_at DESC);

-- Enable RLS if not already enabled
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Drop old policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "users_can_update_own_posts" ON public.posts;

-- Create RLS Policy: Users can UPDATE their own posts
CREATE POLICY "users_can_update_own_posts"
  ON public.posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

