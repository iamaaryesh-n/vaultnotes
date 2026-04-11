-- Add cover adjustment fields for profile cover image positioning and zoom
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cover_position_x DOUBLE PRECISION DEFAULT 50,
ADD COLUMN IF NOT EXISTS cover_position_y DOUBLE PRECISION DEFAULT 50,
ADD COLUMN IF NOT EXISTS cover_zoom DOUBLE PRECISION DEFAULT 1;

-- Keep values in safe UI bounds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_cover_position_x_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_cover_position_x_check
    CHECK (cover_position_x >= 0 AND cover_position_x <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_cover_position_y_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_cover_position_y_check
    CHECK (cover_position_y >= 0 AND cover_position_y <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_cover_zoom_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_cover_zoom_check
    CHECK (cover_zoom >= 1 AND cover_zoom <= 2);
  END IF;
END $$;
