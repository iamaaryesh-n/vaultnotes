-- Keep conversation timestamps database-authored and UTC-safe.

CREATE OR REPLACE FUNCTION public.set_conversations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_set_updated_at ON public.conversations;
CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_conversations_updated_at();

CREATE OR REPLACE FUNCTION public.touch_conversation_updated_at(p_conversation_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_at_value timestamptz;
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = p_conversation_id
  RETURNING updated_at INTO updated_at_value;

  RETURN updated_at_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_deleted_for_user(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_at_value timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.conversations
  SET deleted_by = jsonb_set(
    COALESCE(deleted_by, '{}'::jsonb),
    ARRAY[p_user_id::text],
    to_jsonb(NOW()::text),
    true
  )
  WHERE id = p_conversation_id
    AND (user1_id = auth.uid() OR user2_id = auth.uid())
  RETURNING updated_at INTO updated_at_value;

  RETURN updated_at_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_bump_conversation_updated_at ON public.messages;
CREATE TRIGGER messages_bump_conversation_updated_at
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.bump_conversation_updated_at_on_message();
