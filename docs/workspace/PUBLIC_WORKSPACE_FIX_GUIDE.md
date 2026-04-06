# 🔴 CRITICAL FIX: Public Workspaces Not Showing

## The Problem

Public workspaces are not visible in the Explore page because of an **RLS policy conflict**.

### Why This Happened:

1. **Old Policy** (created first): "Users can view their workspaces" 
   - Only allows you to see workspaces you're a MEMBER of
   - This is too restrictive

2. **New Policy** (tried to replace it): "users_can_view_workspace"
   - Should allow public workspaces for everyone
   - But the DROP statement failed because it used a different policy name (different capitalization and naming convention)
   - **Result**: Old restrictive policy is STILL ACTIVE, blocking public workspaces

### Policy Name Mismatch:
```
❌ Migration tries to DROP: "users_can_view_workspace"
✅ But the actual policy is: "Users can view their workspaces"  ← Different name!
```

---

## The Solution

### Option A: Apply Migration in Supabase (RECOMMENDED)

1. **Go to Supabase Dashboard**:
   - https://supabase.com → Select your project
   - Navigate to: **SQL Editor**

2. **Create New Query** and copy the entire content from:
   ```
   supabase/migrations/20260408_fix_rls_public_workspace_visibility.sql
   ```

3. **Run the Query** - This will:
   - ✅ DROP the old restrictive policy
   - ✅ CREATE new policy allowing public workspace visibility
   - ✅ Fix INSERT/UPDATE/DELETE policies
   - ✅ Verify policies are in place

4. **Test Immediately**:
   - Go to Dashboard and create a test workspace
   - Mark it as PUBLIC
   - Refresh Explore page
   - You should now see public workspaces!

---

### Option B: Manual Fix in Supabase Console

If you prefer to execute the SQL commands one by one:

```sql
-- Step 1: Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;

-- Step 2: Create the new policy that allows public workspace visibility
CREATE POLICY "workspaces_select_policy" ON public.workspaces
  FOR SELECT
  USING (
    (is_public = true)
    OR
    (is_public = false
      AND EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
      )
    )
  );
```

---

## What This Fix Does

### Before (Broken):
```
❌ Query: SELECT * FROM workspaces WHERE is_public = true
   → RLS Policy blocks: "Only members can view workspaces"
   → Result: EMPTY (no public workspaces visible)
```

### After (Fixed):
```
✅ Query: SELECT * FROM workspaces WHERE is_public = true
   → RLS Policy allows: "Public workspaces visible to all"
   → Result: Returns all public workspaces
```

---

## Step-by-Step Testing After Fix

### 1. Create a Test Workspace
- Go to Dashboard
- Click "Create new workspace"
- Name it: "Test Public Workspace"
- Click Create

### 2. Make it Public
- Go to Dashboard
- Find the test workspace
- Click the menu (⋯) button
- Click "Change Visibility"
- Toggle "Make public"
- Click "Make Public" button

### 3. Verify the Fix
- **Open Explore page**
- **Check Console** (F12 → Console tab)
- Look for: `[Explore] Loaded X public workspaces`
- **See Discover Section** with your test workspace

---

## Verification Checklist

After running the migration:

- [ ] Migration ran successfully (no errors)
- [ ] Create test workspace
- [ ] Toggle "Make public" in workspace settings
- [ ] Check Dashboard shows it as Public (badge visible)
- [ ] Open Explore page
- [ ] See console log: "[Explore] Loaded 1 public workspaces"
- [ ] See "Discover Public Workspaces" section
- [ ] See your test workspace in the grid
- [ ] Click workspace card navigates to preview
- [ ] Check other user's profile - see their public workspaces

---

## Debugging If Still Not Working

If public workspaces still don't show after applying the fix:

### Check 1: Verify RLS Policy
Run this in Supabase SQL Editor:
```sql
SELECT schemaname, tablename, policyname, qual 
FROM pg_policies
WHERE tablename = 'workspaces'
ORDER BY policyname;
```

Expected output should show: `workspaces_select_policy`

### Check 2: Verify Public Workspaces Exist
```sql
SELECT id, name, is_public 
FROM workspaces 
WHERE is_public = true 
LIMIT 5;
```

Should return workspaces you marked as public.

### Check 3: Test Direct Query (as authenticated user)
```sql
SELECT id, name, is_public 
FROM workspaces 
WHERE is_public = true;
```

If this returns results, RLS is working.

---

## Contact Support If:

- ❌ Migration won't run (SQL error)
- ❌ Policy verification shows different policy names
- ❌ Public workspaces still don't show after fix
- ❌ Getting auth errors in console

Provide:
1. Migration error message (if any)
2. RLS policy list (from Check 1 above)
3. Console logs from Explore page
4. Screenshot of Supabase dashboard
