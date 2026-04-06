-- Add metadata columns to workspaces table for public preview
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Create index for public workspace discovery
CREATE INDEX IF NOT EXISTS idx_workspaces_public_created ON public.workspaces (is_public, created_at DESC);
