-- Add visibility column to posts table
ALTER TABLE public.posts
ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'));

-- Create index for filtering by visibility
CREATE INDEX idx_posts_visibility ON public.posts (visibility);

-- Create composite index for common queries
CREATE INDEX idx_posts_user_visibility_created ON public.posts (user_id, visibility, created_at DESC);
