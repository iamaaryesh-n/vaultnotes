-- ============================================================
-- Add Trigger for Automatic Profile Creation on Auth Signup
-- ============================================================

-- Create or replace the function to handle new user signup
create or replace function public.handle_auth_user_signup()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if it exists
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger to call the function when a new user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_signup();

comment on function public.handle_auth_user_signup() is 'Automatically creates a profile row when a new auth user is created during signup';
