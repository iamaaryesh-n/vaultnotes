-- Add is_public column to workspaces table for discoverability
ALTER TABLE public.workspaces
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient filtering of public workspaces
CREATE INDEX idx_workspaces_is_public ON public.workspaces (is_public);
