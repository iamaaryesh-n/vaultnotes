# Workspace Keys Column Consistency Audit

## Issue Resolution Status

**Column Name:** `encrypted_key` (NOT `key`)

### Verified Locations

#### 1. InviteUserModal.jsx (src/components/)
```javascript
// Line 58-64: FETCH - Correct ✓
.select("encrypted_key")
.eq("workspace_id", workspaceId)
.eq("user_id", currentUserId)

// Line 138-143: INSERT - Correct ✓
.insert({
  user_id: invitedUserId,
  workspace_id: workspaceId,
  encrypted_key: workspaceKey  // ✓ CORRECT COLUMN
})

// Line 111: READ - Correct ✓
keyData.encrypted_key
```

#### 2. WorkspaceDetail.jsx (src/pages/)
```javascript
// Line 92-97: FETCH - Correct ✓
.select("encrypted_key")
.eq("workspace_id", id)
.eq("user_id", user.id)

// Line 103: READ - Correct ✓
data.encrypted_key
```

#### 3. MemoryView.jsx (src/pages/)
```javascript
// Line 43-48: FETCH - Correct ✓
.select("encrypted_key")
.eq("workspace_id", id)
.eq("user_id", user.id)

// Line 52: READ - Correct ✓
keyData.encrypted_key
```

#### 4. Dashboard.jsx (src/pages/)
```javascript
// Line 103-107: INSERT - Correct ✓
.insert({
  workspace_id: workspace.id,
  user_id: user.id,
  encrypted_key: exportedKey  // ✓ CORRECT COLUMN
})
```

## Database Cleanup Required

**File:** `supabase/migrations/20260326_cleanup_null_keys.sql`

This migration deletes any rows where `encrypted_key IS NULL` (rows created with old incorrect code).

## Next Steps

1. ✅ Run cleanup migration: `supabase db push`
2. ✅ Verify database has no NULL values: Use Supabase Dashboard → SQL Editor
3. ✅ Test invite feature fresh
4. ✅ Verify new rows are created with correct `encrypted_key` column

## Verification Query

```sql
-- Check for any problematic rows
SELECT id, workspace_id, user_id, encrypted_key 
FROM public.workspace_keys 
WHERE encrypted_key IS NULL;

-- This query should return 0 rows after cleanup
```
