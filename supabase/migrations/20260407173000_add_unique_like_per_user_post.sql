-- Prevent duplicate likes from same user on same post
CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_post_user_unique
ON public.likes (post_id, user_id);
