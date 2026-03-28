-- Add tags column to memories table if it doesn't already exist
-- This is a safe, idempotent operation
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'memories' and column_name = 'tags'
  ) then
    alter table memories add column tags text[] default '{}';
  end if;
end $$;
