-- ============================================================
-- Idempotent Workspace Owner Trigger
-- Replaces the original phase1 trigger to be safe on re-run.
-- The trigger auto-inserts the creator as 'owner' in workspace_members
-- immediately after the workspace row is created (same transaction).
-- ============================================================

-- Re-create the function (CREATE OR REPLACE is idempotent)
CREATE OR REPLACE FUNCTION public.add_workspace_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as postgres, bypasses RLS on workspace_members
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;  -- safe on re-run

  RETURN NEW;
END;
$$;

-- Drop and recreate trigger to ensure it is current
DROP TRIGGER IF EXISTS on_workspace_created ON public.workspaces;

CREATE TRIGGER on_workspace_created
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.add_workspace_owner();
