-- Add is_favorite column to memories table if it doesn't already exist
-- This is a safe, idempotent operation
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'memories' and column_name = 'is_favorite'
  ) then
    alter table memories add column is_favorite boolean default false not null;
  end if;
end $$;
