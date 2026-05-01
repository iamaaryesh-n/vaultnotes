-- Allow comment deletion by the comment author OR the post owner.
-- Previously there was no explicit DELETE policy on comments,
-- so only the client-side user_id filter in postInteractions.js
-- prevented unauthorized deletes.  This migration adds a proper
-- server-side RLS rule.

-- Drop any prior version of this policy so the migration is re-runnable
DROP POLICY IF EXISTS "comments_delete" ON public.comments;

CREATE POLICY "comments_delete" ON public.comments
  FOR DELETE
  USING (
    -- Comment author can always delete their own comment
    auth.uid() = user_id
    OR
    -- Post owner can delete any comment on their post
    auth.uid() = (
      SELECT user_id FROM public.posts WHERE id = comments.post_id LIMIT 1
    )
  );
