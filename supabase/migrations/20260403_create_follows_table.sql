-- Create follows table for user following system
CREATE TABLE IF NOT EXISTS public.follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Each follower can only follow a user once
  UNIQUE(follower_id, following_id),
  
  -- Prevent self-follow
  CHECK (follower_id != following_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_follows_follower ON public.follows(follower_id);
CREATE INDEX idx_follows_following ON public.follows(following_id);

-- Enable Row Level Security
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view all follows (public social graph)
CREATE POLICY "Anyone can view follows" ON public.follows
  FOR SELECT
  USING (true);

-- Users can create follow relationships
CREATE POLICY "Users can create follows" ON public.follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Users can delete their own follows
CREATE POLICY "Users can delete their follows" ON public.follows
  FOR DELETE
  USING (auth.uid() = follower_id);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
