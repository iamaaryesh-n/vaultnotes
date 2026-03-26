-- Clean up workspace_keys rows with NULL encrypted_key
-- These rows were created with incorrect column usage

DELETE FROM public.workspace_keys 
WHERE encrypted_key IS NULL;

-- Verify the column structure is correct
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'workspace_keys' AND table_schema = 'public';
