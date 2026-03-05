create table public.workspace_keys (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,
  user_id uuid not null,

  encrypted_workspace_key text not null,

  created_at timestamptz default now(),

  constraint workspace_keys_workspace_fk
    foreign key (workspace_id)
    references workspaces(id)
    on delete cascade,

  constraint workspace_keys_user_fk
    foreign key (user_id)
    references auth.users(id)
    on delete cascade
);