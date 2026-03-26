# Workspace Members Helper Functions - Implementation Guide

## Overview
Created a complete backend interaction layer for managing workspace members, with no UI changes yet.

## Files Created

### 1. **`src/lib/workspaceMembers.js`** - Main Implementation
Core helper functions for workspace member management.

#### Functions

##### `addUserToWorkspace(userId, workspaceId, role = "editor")`
Add a user to a workspace with a specified role.

**Parameters:**
- `userId` (string): User's UUID
- `workspaceId` (string): Workspace's UUID  
- `role` (string): Role to assign - "owner", "editor", or "viewer" (default: "editor")

**Returns:**
```javascript
{
  success: boolean,
  data?: { message?: string, ...record },
  error?: string
}
```

**Behavior:**
- Inserts user into `workspace_members` table
- **Handles duplicates gracefully**: If user already in workspace, returns `success: true` with message "User already exists in this workspace"
- Validates role is one of: owner, editor, viewer
- Logs all operations with `[addUserToWorkspace]` prefix

**Example:**
```javascript
const result = await addUserToWorkspace(
  "123e4567-e89b-12d3-a456-426614174000",
  "987f6543-a98b-12d3-a456-426614174999",
  "editor"
)

if (result.success) {
  console.log("User added:", result.data)
} else {
  console.error("Failed:", result.error)
}
```

---

##### `getWorkspaceMembers(workspaceId)`
Fetch all members of a workspace.

**Parameters:**
- `workspaceId` (string): Workspace's UUID

**Returns:**
```javascript
{
  success: boolean,
  data: [
    {
      id: string,
      workspace_id: string,
      user_id: string,
      role: string,
      created_at: string
    },
    ...
  ],
  error?: string
}
```

**Behavior:**
- Fetches all members for the workspace
- Results ordered by `created_at` ascending
- Returns empty array on error
- Logs operation with `[getWorkspaceMembers]` prefix

**Example:**
```javascript
const result = await getWorkspaceMembers("987f6543-a98b-12d3-a456-426614174999")

if (result.success) {
  result.data.forEach(member => {
    console.log(`${member.user_id} has role: ${member.role}`)
  })
} else {
  console.error("Failed:", result.error)
}
```

---

##### `isUserWorkspaceMember(userId, workspaceId)`
Check if a user is a member of a workspace and get their role.

**Parameters:**
- `userId` (string): User's UUID
- `workspaceId` (string): Workspace's UUID

**Returns:**
```javascript
{
  success: boolean,
  isMember: boolean,
  role?: string,
  error?: string
}
```

**Behavior:**
- Checks membership status in single query
- Returns role if member, undefined if not
- Logs operation with `[isUserWorkspaceMember]` prefix

**Example:**
```javascript
const result = await isUserWorkspaceMember(
  "123e4567-e89b-12d3-a456-426614174000",
  "987f6543-a98b-12d3-a456-426614174999"
)

if (result.success && result.isMember) {
  console.log(`User is ${result.role}`)
} else {
  console.log("User is not a member")
}
```

---

##### `removeUserFromWorkspace(userId, workspaceId)`
Remove a user from a workspace.

**Parameters:**
- `userId` (string): User's UUID
- `workspaceId` (string): Workspace's UUID

**Returns:**
```javascript
{
  success: boolean,
  data?: { ...deletedRecord },
  error?: string
}
```

**Example:**
```javascript
const result = await removeUserFromWorkspace(
  "123e4567-e89b-12d3-a456-426614174000",
  "987f6543-a98b-12d3-a456-426614174999"
)
```

---

##### `updateUserWorkspaceRole(userId, workspaceId, newRole)`
Update a user's role in a workspace.

**Parameters:**
- `userId` (string): User's UUID
- `workspaceId` (string): Workspace's UUID
- `newRole` (string): New role - "owner", "editor", or "viewer"

**Returns:**
```javascript
{
  success: boolean,
  data?: [{ role: string, ...record }],
  error?: string
}
```

**Example:**
```javascript
const result = await updateUserWorkspaceRole(
  "123e4567-e89b-12d3-a456-426614174000",
  "987f6543-a98b-12d3-a456-426614174999",
  "owner"
)

if (result.success) {
  console.log("New role:", result.data[0].role)
}
```

---

## Error Handling

All functions include comprehensive error handling:

| Error | Handled By |
|-------|-----------|
| Missing `user_id` | All functions validate and exit early |
| Missing `workspace_id` | All functions validate and exit early |
| Invalid role value | `addUserToWorkspace()`, `updateUserWorkspaceRole()` |
| Duplicate user in workspace | `addUserToWorkspace()` - returns success with message |
| Database error (PGRST*) | Logged and returned in error field |
| Unexpected exceptions | Try-catch block catches and logs |

**Error Codes:**
- `23505`: Unique constraint violation (workspace_id, user_id) - handled gracefully
- `PGRST116`: No rows found in .single() query - handled for isUserWorkspaceMember()
- All other errors logged with full error object

---

## Logging

All operations log to console with prefixed messages:

```
[addUserToWorkspace] Adding user 123e... to workspace 987f... with role editor
[addUserToWorkspace] Successfully added user to workspace: [...]
[getWorkspaceMembers] Fetching members for workspace 987f...
[getWorkspaceMembers] Successfully fetched 3 member(s): [...]
[isUserWorkspaceMember] Checking if user 123e... is member of workspace 987f...
```

---

## Testing

### Test File: `src/lib/workspaceMembersTest.js`

The test file includes a function `testWorkspaceMembersAPI()` that:
1. Gets current user session
2. Fetches first workspace
3. Tests `addUserToWorkspace()`
4. Tests `getWorkspaceMembers()`
5. Tests `isUserWorkspaceMember()`
6. Tests `updateUserWorkspaceRole()`
7. Verifies role was updated

### How to Run Tests

**In Browser Console (Recommended):**

1. Open the app in browser and **log in**
2. Open Developer Tools: **F12**
3. Go to **Console** tab
4. Import and run test:
   ```javascript
   import('./src/lib/workspaceMembersTest.js').then(m => m.testWorkspaceMembersAPI())
   ```

5. Watch console for output:
   ```
   ============================================================
   TESTING WORKSPACE MEMBERS API
   ============================================================

   Step 1: Getting current user session...
   ✅ Current user: user@example.com (ID: 123e4567-e89b-12d3-a456-426614174000)

   Step 2: Fetching workspaces...
   ✅ Found workspace: "My Workspace" (ID: 987f6543-a98b-12d3-a456-426614174999)

   Step 3: Testing addUserToWorkspace()...
   [addUserToWorkspace] Adding user 123e... to workspace 987f... with role editor
   ✅ User added to workspace!

   [... more steps ...]

   ✅ ALL TESTS COMPLETED SUCCESSFULLY!
   ============================================================
   ```

---

## Database Schema Reference

The implementation uses the `public.workspace_members` table:

```sql
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(workspace_id, user_id)  -- User can only be in workspace once
);

-- Indexes
CREATE INDEX idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id ON public.workspace_members(user_id);
```

---

## Usage in React Components (Coming Next)

Once UI is implemented, use these functions like:

```javascript
import { addUserToWorkspace, getWorkspaceMembers } from '../lib/workspaceMembers'
import { supabase } from '../lib/supabase'

export default function AddMemberForm({ workspaceId }) {
  const [email, setEmail] = useState('')
  
  const handleAddMember = async () => {
    // Get user by email
    const { data: userData } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', email)
      .single()
    
    if (!userData) {
      alert('User not found')
      return
    }
    
    // Add to workspace
    const result = await addUserToWorkspace(userData.id, workspaceId, 'editor')
    
    if (result.success) {
      alert('Member added!')
    } else {
      alert(`Error: ${result.error}`)
    }
  }
  
  return (
    <div>
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <button onClick={handleAddMember}>Add Member</button>
    </div>
  )
}
```

---

## Summary

✅ **Implemented:**
- 5 helper functions for complete workspace member management
- Comprehensive error handling for all edge cases
- Detailed logging for debugging
- Automatic duplicate handling
- Full input validation
- Test suite for manual verification
- Works with existing Supabase RLS policies

✅ **No UI changes** - Backend layer only, ready for UI implementation

✅ **Zero errors** - All files compile without syntax issues

Ready to proceed with UI implementation when needed!
