-- Drop old structure
drop table if exists public.pages cascade;
drop table if exists public.books cascade;

-- Create workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

-- Create workspace_members
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamp with time zone default now(),
  unique(workspace_id, user_id)
);

-- Create memories
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text,
  encrypted_content text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes for performance
create index idx_memories_workspace_id on public.memories(workspace_id);
create index idx_workspace_members_workspace_id on public.workspace_members(workspace_id);
create index idx_workspace_members_user_id on public.workspace_members(user_id);