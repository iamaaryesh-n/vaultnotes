-- Function to automatically add workspace creator as owner
create or replace function public.add_workspace_owner()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

-- Trigger to call function after workspace is created
create trigger on_workspace_created
after insert on public.workspaces
for each row
execute function public.add_workspace_owner();