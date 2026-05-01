-- Add post sharing support to direct messages
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'image', 'post'));

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_post_id ON public.messages(post_id);

-- Add post sharing support to group messages
ALTER TABLE public.group_messages
  DROP CONSTRAINT IF EXISTS group_messages_type_check;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_type_check
  CHECK (type IN ('text', 'image', 'post'));

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_messages_post_id ON public.group_messages(post_id);
