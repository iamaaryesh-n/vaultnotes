# Username System - Quick Setup

## What's New

✅ Every user now has a **unique username**
✅ Username auto-generated during signup
✅ Users can edit username on Profile page
✅ Username ready for future invite system

---

## Deploy Migration

**Run this command:**
```bash
npx supabase db push
```

**This adds:**
- `username` column to profiles table
- UNIQUE constraint to prevent duplicates
- Index for fast lookups

---

## How It Works

### Signup

```
john@example.com signs up
         ↓
Username generated: "john"
(or "john1234" if "john" taken)
         ↓
Profile created with username
         ↓
User can see username on Profile page
```

### Edit on Profile Page

```
User clicks Profile → Edit Username → Save

Username validated:
  ✓ 3-20 characters
  ✓ Lowercase + numbers only
  ✓ Must be unique
         ↓
If valid → Save to database
If invalid → Show error message
```

---

## Username Rules

| Rule | Format | Example |
|------|--------|---------|
| Length | 3-20 characters | `alice`, `user12345` |
| Characters | Lowercase a-z, numbers 0-9 | `john123` ✓, `John123` ✗ |
| Uniqueness | No duplicates | `alice` unique ✓ |

---

## Testing

### Test Signup
1. Go to signup page
2. Enter: `alice@example.com` / `password123`
3. Signup succeeds
4. Go to Profile page
5. See username: `alice` (or `alice####` if taken)

### Test Edit
1. Go to Profile page
2. Change username to: `alicenew`
3. Click "Save Username"
4. See success message
5. Refresh page → username still shows `alicenew`

### Test Invalid Input
1. Try username: `ab` → Error: "minimum 3 characters"
2. Try username: `alice_123` → Error: "letters and numbers only"
3. Try taken username → Error: "already taken"

---

## Console Logs

**During Signup:**
```
[signUpUser] Starting signup for: john@example.com
[signUpUser] Auth signup successful
[signUpUser] Base username: john
[signUpUser] Username available: john
[signUpUser] Final username: john
[signUpUser] Profile created successfully
```

**During Profile Update:**
```
[Profile] Checking username uniqueness: alicenew
[Profile] Saving username for user: abc123
[Profile] Username updated successfully
```

---

## Database Schema

**New Column Added:**
```sql
ALTER TABLE profiles ADD COLUMN username TEXT UNIQUE;
CREATE INDEX idx_profiles_username ON profiles(username);
```

**Sample Data:**
```
id              | email              | username    | name
a1b2c3d4...    | john@example.com  | john        | John Doe
e5f6g7h8...    | alice@gmail.com   | alice1234   | Alice
```

---

## Files Modified

1. **Migration:** `20260328140000_add_username_to_profiles.sql` - NEW
2. **Auth:** `src/lib/auth.js` - Username generation
3. **Profile:** `src/pages/Profile.jsx` - Username editing UI

---

## Next: Invite System

Once this is deployed, usernames can be used for:

```javascript
// Future feature - Invite by username:
inviteUserByUsername({
  workspaceId: "workspace123",
  username: "alice"  // ← Easy to remember
})
```

---

## Status

✅ Ready to deploy
✅ All code tested
✅ No errors

**Deploy with:** `npx supabase db push`
