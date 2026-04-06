-- Update posts SELECT RLS policy to include followers visibility for private posts
-- Policy: users can see public posts OR private posts if they follow the author OR are the author

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "users_can_see_visible_posts" ON public.posts;

-- Create new policy that handles both visibility modes
CREATE POLICY "users_can_see_visible_posts" ON public.posts
  FOR SELECT
  USING (
    -- Case 1: Always allow access to own posts
    (auth.uid() = user_id)
    OR
    -- Case 2: Allow access to public posts
    (visibility = 'public')
    OR
    -- Case 3: Allow access to private posts if user follows the author
    (
      visibility = 'private'
      AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follows.following_id = posts.user_id
        AND follows.follower_id = auth.uid()
      )
    )
  );

-- Ensure other policies remain intact for INSERT/UPDATE/DELETE
-- Users can only insert/update/delete their own posts
DROP POLICY IF EXISTS "users_can_create_posts" ON public.posts;
CREATE POLICY "users_can_create_posts" ON public.posts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_can_update_posts" ON public.posts;
CREATE POLICY "users_can_update_posts" ON public.posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_can_delete_posts" ON public.posts;
CREATE POLICY "users_can_delete_posts" ON public.posts
  FOR DELETE
  USING (auth.uid() = user_id);
