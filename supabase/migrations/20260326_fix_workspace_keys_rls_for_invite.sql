-- Fix workspace_keys INSERT RLS policy to allow workspace owners to add keys for invited users
-- The current policy only allows users to insert their own keys
-- We need to allow workspace creators/owners to insert keys for other users during invite flow

DROP POLICY IF EXISTS "workspace_keys_insert" ON public.workspace_keys;

CREATE POLICY "workspace_keys_insert"
ON public.workspace_keys
FOR INSERT
WITH CHECK (
  -- Option 1: User can insert their own keys
  user_id = auth.uid()
  OR
  -- Option 2: User is a workspace owner (can invite others and add their keys)
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_keys.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'owner'
  )
  OR
  -- Option 3: User created the workspace
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_keys.workspace_id
      AND w.created_by = auth.uid()
  )
);
