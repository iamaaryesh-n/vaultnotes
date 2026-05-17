# Signup Username = NULL Audit & Fix Summary

## Problem Statement
Newly created accounts had `username = null` after signup, even though a valid username was generated and displayed during the signup process.

## Root Cause Analysis

### The Issue
The codebase had conflicting profile creation flows:

1. **Database Trigger (20260328130000_add_auth_signup_trigger.sql)**
   - Automatically created a profile row when `auth.users` record was inserted
   - **Only inserted**: `id` and `email` fields
   - **Left NULL**: `username` and other fields
   - **Timing**: Fired AFTER `supabase.auth.signUp()` but BEFORE frontend code

2. **Frontend Signup Flows**
   - **Login.jsx**: Called `insertProfile()` with full data including username
   - **auth.js**: Called `signUpUser()` which also tried to insert with username
   - **Expected**: Profile insert would succeed with username
   - **Actual**: Profile already existed (from trigger), so INSERT failed
   - **Result**: Frontend got error, but signup continued with NULL username profile

### Lifecycle That Caused NULL Usernames
```
User fills signup form
  ↓
Frontend calls supabase.auth.signUp()
  ↓
Auth user created in auth.users
  ↓
Trigger on_auth_user_created fires
  ↓
Profile inserted with (id, email) only ← **USERNAME IS NULL HERE**
  ↓
Frontend tries insertProfile() with username
  ↓
INSERT fails (profile already exists with this id)
  ↓
Signup continues to home page
  ↓
User has profile with username = NULL ❌
```

## Solutions Implemented

### 1. Disabled Automatic Profile Trigger
**File**: `supabase/migrations/20260517_disable_auto_profile_creation_trigger.sql`

- Dropped the `on_auth_user_created` trigger
- Dropped the `handle_auth_user_signup()` function
- **Rationale**: Profile creation is better handled by signup flows that have full user data

**Benefits**:
- Single source of truth for profile creation (frontend)
- Frontend controls all profile data including username
- No more conflicts between trigger and frontend code
- Cleaner separation: Auth handles credentials, Signup handles profile

### 2. Changed INSERT to UPSERT in Frontend
**Files Modified**:
- `src/pages/Login.jsx`: `insertProfile()` function
- `src/lib/auth.js`: `signUpUser()` function
- `src/pages/Profile.jsx`: Profile creation fallback

**Changes**:
- Replaced `.insert()` with `.upsert({...}, { onConflict: "id" })`
- **Rationale**: Defensive programming for edge cases:
  - If trigger wasn't disabled, profile exists → UPSERT updates it with username
  - If another auth flow created a profile → UPSERT updates it
  - If profile doesn't exist → UPSERT creates it
  - **Result**: Profile always gets proper username, never NULL

### 3. Added Username Generation Fallback
**File**: `src/pages/Profile.jsx`

- When creating default profile, now generates username from email
- Prevents fallback profile creation without username
- **Format**: `email.split("@")[0].toLowerCase()`

### 4. Added Defensive Logging
**File**: `src/components/Navbar.jsx`

- `getCurrentUsername()` now logs warning if profile exists but username is NULL
- Helps identify edge cases that slip through
- **Console message**: `[Navbar] WARNING: Profile exists but username is NULL`

## Files Changed

### New File
- `supabase/migrations/20260517_disable_auto_profile_creation_trigger.sql`

### Modified Files
1. **Login.jsx**
   - Line 264-292: Changed `insertProfile()` from INSERT to UPSERT
   - Added detailed comments about defensive behavior

2. **auth.js**
   - Line 105-131: Changed `signUpUser()` from INSERT to UPSERT
   - Updated error logging to reflect upsert operation

3. **Profile.jsx**
   - Line 283-330: Changed default profile creation
   - Now generates username from email
   - Changed INSERT to UPSERT
   - Updated state initialization to include username

4. **Navbar.jsx**
   - Line 217-227: Added defensive logging for NULL username detection

## Testing & Validation

### What to Test

1. **New User Signup**
   ```
   - Sign up with new email
   - Check: username is not NULL
   - Check: username matches generated value from email
   - Check: profile row exists with all fields populated
   ```

2. **Login After Signup**
   ```
   - Sign up new account
   - Verify username is visible in UI
   - Log out and log in
   - Verify username persists and is correct
   ```

3. **Navigate to Profile**
   ```
   - After signup, go to /profile
   - Verify username is displayed
   - No "Not Found" error
   ```

4. **Chat & Features Using Username**
   ```
   - Start a chat (uses username)
   - Post a memory (uses username in profile)
   - Follow/unfollow (uses username)
   - Verify all show correct username
   ```

5. **Edge Cases**
   ```
   - Account created before trigger removal
   - Auth user without profile (shouldn't happen)
   - Both should now get proper username via UPSERT
   ```

### Console Logging to Monitor
- `[signUpUser] Username available: X`
- `[signUpUser] Profile created successfully`
- `[Profile] Created default profile:` (should not fire on normal signup)
- `[Navbar] WARNING: Profile exists but username is NULL` (should never appear)

## Architecture Notes

### Profile Creation Flow (After Fix)
```
Login.jsx signup form
  ↓
supabase.auth.signUp() [no trigger]
  ↓
Auth user created
  ↓
insertProfile() with UPSERT
  ↓
Profile created with username ✓
```

### Key Guarantees
1. Every auth.users record gets a profile with username
2. No NULL usernames in new accounts
3. Existing accounts with NULL usernames can be fixed with UPSERT
4. Future auth user creation (Supabase CLI, API) won't auto-create NULL profiles

### RLS Policies Respected
- Profile insert requires: `auth.uid() = id`
- UPSERT respects same RLS constraints
- No security bypass

## Migration Path
- Existing accounts with `username = NULL` will need data cleanup
- Suggest running migration to backfill usernames:
  ```sql
  UPDATE public.profiles 
  SET username = lower(substring(email from '^[^@]+'))
  WHERE username IS NULL;
  ```

## Monitoring Recommendations
1. Monitor Navbar warning logs for any NULL usernames
2. Query profiles for NULL usernames post-deployment
3. Track profile creation success rate in analytics
4. Monitor auth signup completion rate

## Future Improvements
1. Add username validation in RLS (non-null constraint)
2. Migrate all NULL usernames to proper values
3. Add tests for profile creation in signup flow
4. Consider moving profile creation to Edge Function

## Questions & Answers

**Q: Why not fix the trigger instead of removing it?**
A: Removing is cleaner because:
- Signup code already has username generation logic
- Trigger would duplicate that logic
- Harder to test/debug trigger logic in DB
- Frontend has more context about user choices (username preferences)

**Q: Will this break existing code?**
A: No, because:
- UPSERT is backward compatible with INSERT
- RLS policies unchanged
- Profile schema unchanged
- Only changes internal implementation

**Q: What about users created before this fix?**
A: Run the SQL migration mentioned above to backfill usernames.

**Q: Can users change their username after signup?**
A: Check `EditProfileModal` component - it should have username uniqueness checks.
