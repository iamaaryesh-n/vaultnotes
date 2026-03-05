-- Enable RLS on all tables
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.memories enable row level security;

-- ===============================
-- WORKSPACES POLICIES
-- ===============================

-- A user can view a workspace only if they are a member
create policy "Users can view their workspaces"
on public.workspaces
for select
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
    and wm.user_id = auth.uid()
  )
);

-- A user can create a workspace (they become owner later in app logic)
create policy "Users can create workspaces"
on public.workspaces
for insert
with check (auth.uid() = created_by);

-- ===============================
-- WORKSPACE MEMBERS POLICIES
-- ===============================

-- A user can see membership rows where they belong
create policy "Users can view their memberships"
on public.workspace_members
for select
using (user_id = auth.uid());

-- ===============================
-- MEMORIES POLICIES
-- ===============================

-- A user can view memories only in workspaces they belong to
create policy "Users can view memories in their workspaces"
on public.memories
for select
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = memories.workspace_id
    and wm.user_id = auth.uid()
  )
);

-- A user can insert memory only if they belong to that workspace
create policy "Users can insert memories in their workspace"
on public.memories
for insert
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = memories.workspace_id
    and wm.user_id = auth.uid()
  )
);

-- A user can update their own memories
create policy "Users can update their own memories"
on public.memories
for update
using (created_by = auth.uid());

-- A user can delete their own memories
create policy "Users can delete their own memories"
on public.memories
for delete
using (created_by = auth.uid());