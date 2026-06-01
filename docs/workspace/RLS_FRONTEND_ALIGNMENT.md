# RLS Policy Frontend Alignment for group_message_reads

## Current Status
✅ **Frontend payload is correctly aligned with RLS policy requirements**

## RLS Policy Requirements (Backend)

The `group_message_reads` INSERT policy checks:

```sql
CREATE POLICY "Users can mark messages as read" ON public.group_message_reads
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS(
      SELECT 1 FROM public.group_messages
      WHERE group_messages.id = group_message_reads.message_id
      AND EXISTS(
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = group_messages.group_id
        AND group_members.user_id = auth.uid()
      )
    )
  );
```

**Three conditions that must ALL pass:**
1. ✅ `auth.uid() = user_id` — The user_id field must equal the authenticated user
2. ⚠️ `group_messages exists` — The message_id must reference an existing message
3. ⚠️ `user in group_members` — The user must be a member of the group that contains the message

## Frontend Payload Alignment

### Code Location
**File**: `src/pages/Chat.jsx`  
**Function**: `markGroupMessagesAsRead(groupId, messageIds)`  

### Payload Structure
```javascript
const upsertData = messageIds.map(messageId => ({
  message_id: messageId,
  user_id: authUserId,  // ✅ Set to contextUser.id
  read_at: new Date().toISOString()
}))
```

### User ID Source
```javascript
const { user: contextUser } = useAuth()  // From AuthContext
// Which gets user from: supabase.auth.getUser()
// This returns the authenticated user with id = auth.uid()
```

**Verification**: `contextUser.id === auth.uid()` ✅

## Enhanced Debugging

### Pre-flight Validation
New function `validateGroupMembership(groupId)` performs a direct query to verify:
- User exists in `group_members` table for the given group
- This tests whether the nested RLS `EXISTS(group_members)` check will succeed

### Diagnostic Logging
When RLS rejects the insert with 403, console logs now show:

```javascript
[GroupChat] [RLS-ALIGNMENT] Pre-flight validation:
  - user_id: <authenticated user id>
  - group_id: <group being checked>
  - is_group_member: true/false
  - note: RLS policy requires nested EXISTS(group_members) to succeed

[GroupChat] [RLS-ALIGNMENT] RLS Policy rejection details:
  - error_code: "403"
  - error_message: "new row violates row-level security policy"
  - error_details: <database details>
  - error_hint: <database hint>
  - rls_checks:
    - auth.uid() = user_id: "Expected: policy user_id field matches authenticated session"
    - group_messages exists: "Verify message_id exists in group_messages table"
    - user in group_members: "Verify auth.uid() is member of group"
```

## What Frontend Has Verified
✅ `user_id` field is set to `contextUser.id` from authenticated session  
✅ `contextUser.id` comes from `supabase.auth.getUser()`  
✅ Payload structure matches schema requirements  
✅ Fire-and-forget implementation (doesn't block message display)  
✅ UPSERT prevents duplicate key constraint errors on retry  

## What Needs Backend Review

If 403 errors continue after these frontend changes:

1. **Check Condition 1**: Verify `auth.uid()` in RLS context matches the authenticated user
   - Frontend is sending correct `user_id`
   - If still failing: Check if RLS policy is using wrong session context

2. **Check Condition 2**: Verify `group_messages` table has the messages being marked
   - Messages are being sent successfully (confirmed earlier in session)
   - If still failing: Check if message_id references exist

3. **Check Condition 3**: Verify `group_members` nested EXISTS is working
   - Pre-flight `validateGroupMembership()` can confirm user is in group_members
   - If still failing: Check if nested EXISTS clause has timing issues or policies interfering

## Testing Checklist

After backend policy updates are applied:

- [ ] Send a group message → verify it appears immediately
- [ ] Switch to another user account → verify message appears (different user)
- [ ] Return to first account → check browser console for RLS-ALIGNMENT logs
- [ ] Verify no 403 errors appear for `group_message_reads` UPSERT
- [ ] Confirm "Seen by" avatars display correctly
- [ ] Check that unread badges clear when entering chat

## Console Logging Keywords

Search console for these prefixes to debug:
- `[GroupChat] [RLS-ALIGNMENT]` — Frontend validation and RLS alignment info
- `[GroupChat] Attempting to mark` — Initial attempt details
- `[GroupChat] Warning: Failed to mark` — RLS rejection details

## Related Files

- **Backend**: `supabase/migrations/20260405_create_group_message_reads.sql`
- **Frontend**: `src/pages/Chat.jsx` (markGroupMessagesAsRead, validateGroupMembership)
- **Auth**: `src/context/AuthContext.jsx` (provides authenticated user)
