ALTER TABLE device_tokens
ADD COLUMN IF NOT EXISTS device_info text;
