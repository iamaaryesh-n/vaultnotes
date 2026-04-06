# Public Workspace Discovery - Debugging Guide

## Overview
This guide helps you test and verify that public workspace discovery is working correctly across the application. The feature includes:
1. **Dashboard Discover Section** - Shows other users' public workspaces (up to 6)
2. **Explore > Discover** - Shows all public workspaces in the system
3. **Profile > Workspaces Tab** - Shows a user's public workspaces on their public profile

## Step 1: Check Console Logs

### Browser Console Setup
1. Open your app in Chrome DevTools (F12)
2. Go to Console tab
3. Filter by: `Dashboard`, `Explore`, `Profile`, `fetchAllPublicWorkspaces`

### Expected Log Messages

#### When visiting Dashboard:
```
[Dashboard] Fetching public workspaces for discovery section...
[Dashboard] Fetched X total public workspaces
[Dashboard] User's own workspaces count: Y
[Dashboard] After filtering user's workspaces: Z public workspaces to discover
[Dashboard] Discover workspaces: [{id: '...', name: '...'}, ...]
```

#### When visiting Explore page:
```
[Explore] Loading public workspaces for discovery section...
[Explore] Loaded X public workspaces
[Explore] Public workspaces: [{id: '...', name: '...'}, ...]
```

#### When visiting another user's profile:
```
[Profile] Fetching public workspaces for user: <USER_ID> name: <NAME>
[Profile] Found X public workspaces for this user
[Profile] Workspaces: [{id: '...', name: '...', is_public: true}, ...]
```

---

## Step 2: Create Test Data

### Test Setup (Required if no public workspaces exist)
You need workspaces marked as public. Follow these steps:

#### User 1 (Your Main Account):
1. Create a workspace: "Public Test Workspace A"
2. Open workspace settings
3. Enable "Make this workspace public" toggle
4. Save changes
5. Create 2-3 more public workspaces for testing

#### User 2 (Another Account - Optional but recommended):
1. Log in with a different account
2. Create a workspace: "Public Test Workspace B"
3. Mark it as public
4. Log out

---

## Step 3: Test Discovery Visibility

### Test A: Dashboard Discover Section
1. **User 1 Login**: Log in to your main account
2. **Check Dashboard**: Visit the Dashboard page
3. **Check Console**: Look for logs showing discovered workspaces
4. **Expected Result**: 
   - Should NOT show "Public Test Workspace A" (your own)
   - SHOULD show "Public Test Workspace B" (if User 2 created one)
   - Should show count of discovered workspaces

### Test B: Explore > Discover Section
1. **Navigate to Explore**: Click Explore in navbar
2. **Check Console**: Look for "Explore" logs
3. **Expected Result**:
   - Should show ALL public workspaces in the system
   - SHOULD show "Public Test Workspace A" (your own public workspace)
   - SHOULD show "Public Test Workspace B" (if exists)

### Test C: Profile > Workspaces Tab
1. **Switch Users** (if Test User 2 exists):
   - Log out or use another device/browser
   - Log in as User 2
2. **Copy User 1's Profile URL** (from your User 1 account, click your profile, copy URL)
3. **View User 1's Profile** (as User 2):
   - Visit the URL
   - Go to "Workspaces" tab
4. **Expected Result**:
   - Should show "Public Test Workspace A" 
   - Should show "Public Test Workspace B" as User 2's public workspace
   - Should NOT show private workspaces

---

## Step 4: Test RLS Policies in Supabase

### Access Supabase Dashboard:
1. Go to supabase.com and log in
2. Select your project
3. Go to SQL Editor

### Query 1: Check Public Workspaces Exist
```sql
SELECT id, name, is_public, created_by, created_at
FROM workspaces
WHERE is_public = true
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**: Should return workspaces you marked as public

### Query 2: Verify RLS Policies
```sql
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE tablename = 'workspaces'
ORDER BY policyname;
```

**Expected**: Should show:
- `users_can_view_workspace` - Controls SELECT access
- `users_can_create_workspace` - Controls INSERT
- `users_can_update_workspace` - Controls UPDATE
- `users_can_delete_workspace` - Controls DELETE

### Query 3: Check Workspace is_public Column
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'workspaces' AND column_name = 'is_public';
```

**Expected**: Should show `is_public` column exists with boolean type

---

## Step 5: Test Data Flow

### Test Data Creation Flow:
1. **Create New Workspace**: Create a new workspace in the app
2. **Check Workspace Settings**: Should have a "Make this workspace public" toggle
3. **Toggle Public**: Enable the toggle and save
4. **Verify in DB**: Run SQL query to confirm `is_public = true`
5. **Wait & Refresh**: Give it 2-3 seconds, then refresh the discovery pages
6. **Check Metrics**: 
   - Dashboard: Should NOT show it (it's your workspace)
   - Explore: SHOULD show it
   - Profile: SHOULD show it in your workspaces

---

## Step 6: Common Issues & Fixes

### Issue: No public workspaces are showing
**Diagnosis**:
- Console shows "Fetched 0 public workspaces"

**Potential Causes**:
- [ ] No workspaces have been marked as public
- [ ] The `is_public` column doesn't exist in database
- [ ] RLS policy is blocking reads
- [ ] Workspaces are marked private

**Fix**:
1. Create test workspace
2. Go to workspace settings and enable "Make this workspace public"
3. Refresh discovery pages
4. Check Supabase dashboard for `is_public = true` records

### Issue: Discover shows your own workspaces (Dashboard)
**Diagnosis**:
- Dashboard shows "Public Test Workspace A" (your own)

**Root Cause**: 
- The filtering logic isn't working correctly

**Fix**:
- Check console: "After filtering user's workspaces: X public workspaces"
- Should be less than total fetched
- If not filtering, check Dashboard.jsx line with `.filter()` logic

### Issue: Profile tab shows no workspaces for other users
**Diagnosis**:
- Visiting another user's profile shows no public workspaces

**Potential Causes**:
- [ ] User is logged in as the wrong account
- [ ] Other user has no public workspaces
- [ ] `fetchUserPublicWorkspaces` is returning empty

**Fix**:
1. Ensure you're viewing a DIFFERENT user's profile
2. Ensure that user HAS public workspaces
3. Check console logs: "Found X public workspaces for this user"

---

## Step 7: Data Collection for Support

If the feature still isn't working, collect this information:

### From Console:
1. **Screenshot**: All logs from Dashboard, Explore, and Profile sections
2. **Network Tab**: Check XHR requests to `/workspaces` endpoint

### From Supabase:
1. **RLS Policy Output**: Run all 3 SQL queries above and screenshot results
2. **Row Count**: How many workspaces exist? How many are public?

### From App:
1. **Workspace Settings**: Screenshot showing "Make this workspace public" toggle
2. **Browser**: Chrome/Firefox version
3. **Error Messages**: Any error messages in console?

---

## Verification Checklist

- [ ] Test workspace created and marked as public
- [ ] Dashboard console shows fetching logs
- [ ] Explore console shows fetching logs
- [ ] Supabase shows workspaces with `is_public = true`
- [ ] RLS policy names are correct
- [ ] Dashboard discovers OTHER users' public workspaces
- [ ] Explore discovers ALL public workspaces (including own)
- [ ] Profile shows OTHER users' public workspaces
- [ ] Profile does NOT show private workspaces of other users

---

## Quick Test Command

To quickly verify the backend is working, run this in the browser console:

```javascript
// Test fetchAllPublicWorkspaces function
import { fetchAllPublicWorkspaces } from '@/lib/globalSearch.js'
const result = await fetchAllPublicWorkspaces(10, 0)
console.log('All public workspaces:', result)
```

---

## Next Steps

1. **Follow Step 2**: Create test data with public workspaces
2. **Follow Steps 3-4**: Test discovery and check Supabase
3. **Check Console Logs**: Look for error messages
4. **Share Results**: If still issues, collect data from Step 7
