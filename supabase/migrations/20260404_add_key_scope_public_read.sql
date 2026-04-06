-- Add key_scope column to support public_read keys for shared encryption
-- Allows public workspaces to have a shared read-only encryption key

ALTER TABLE public.workspace_keys
ADD COLUMN IF NOT EXISTS key_scope TEXT DEFAULT 'member';

-- Add comment explaining the values
COMMENT ON COLUMN public.workspace_keys.key_scope IS 
'Scope of key usage. Values: member (user-specific) or public_read (shared for public workspace viewing)';

-- Update RLS policy to allow fetching public_read keys
DROP POLICY IF EXISTS "workspace_keys_select" ON public.workspace_keys;

CREATE POLICY "workspace_keys_select"
ON public.workspace_keys
FOR SELECT
USING (
  -- User's personal key (member scope)
  (user_id = auth.uid() AND key_scope = 'member')
  OR
  -- Public read key for public workspaces (no user_id)
  (user_id IS NULL AND key_scope = 'public_read' AND 
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = workspace_keys.workspace_id
        AND w.is_public = true
    )
  )
);
