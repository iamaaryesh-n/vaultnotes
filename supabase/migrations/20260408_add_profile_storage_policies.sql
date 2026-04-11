-- Ensure profile media buckets exist and allow users to manage files in their own folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('cover-photos', 'cover-photos', true)
on conflict (id) do nothing;

-- Avatars bucket policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatars_select_public'
  ) THEN
    CREATE POLICY "avatars_select_public"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatars_insert_own_folder'
  ) THEN
    CREATE POLICY "avatars_insert_own_folder"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatars_update_own_folder'
  ) THEN
    CREATE POLICY "avatars_update_own_folder"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatars_delete_own_folder'
  ) THEN
    CREATE POLICY "avatars_delete_own_folder"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Cover photos bucket policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'cover_photos_select_public'
  ) THEN
    CREATE POLICY "cover_photos_select_public"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'cover-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'cover_photos_insert_own_folder'
  ) THEN
    CREATE POLICY "cover_photos_insert_own_folder"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'cover-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'cover_photos_update_own_folder'
  ) THEN
    CREATE POLICY "cover_photos_update_own_folder"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'cover-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'cover-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'cover_photos_delete_own_folder'
  ) THEN
    CREATE POLICY "cover_photos_delete_own_folder"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'cover-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
