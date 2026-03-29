-- Ensure DELETE realtime payloads include old row values (including post_id).
-- Without REPLICA IDENTITY FULL, Postgres may only send primary key fields on DELETE.
ALTER TABLE public.comments REPLICA IDENTITY FULL;
ALTER TABLE public.likes REPLICA IDENTITY FULL;