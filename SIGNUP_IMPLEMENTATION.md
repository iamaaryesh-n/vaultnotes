# User Signup Implementation Guide

## Overview

Users can now create new accounts using the unified login/signup interface. The signup flow includes:
1. Email & password registration
2. Automatic profile creation via database trigger
3. Email confirmation (if required by Supabase config)
4. Seamless transition to login

---

## Features Implemented

### ✅ Unified Authentication Interface
- **File**: `src/pages/Login.jsx`
- Single page for both login and signup
- Easy toggle between modes
- Clean, intuitive UI

### ✅ Automatic Profile Creation
- **Migration**: `20260328130000_add_auth_signup_trigger.sql`
- Database trigger automatically creates profile on auth signup
- Profile linked to auth.users.id
- Fields: id, email, name (nullable), avatar_url (nullable)

### ✅ Email Confirmation Flow
- Handles cases where email confirmation is required
- Shows appropriate messages to users
- Handles pre-confirmed accounts
- Handles duplicate account attempts

### ✅ Authentication Helper Functions
- **File**: `src/lib/auth.js`
- `signUpUser(email, password)` - Register new user
- `loginUser(email, password)` - Log in existing user
- `getCurrentUserProfile()` - Fetch current user's profile
- `updateUserProfile(updates)` - Update user profile fields
- `signOutUser()` - Log out and clear local data
- `checkEmailExists(email)` - Check if email is registered

---

## Database Schema

### Profiles Table
```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,                    -- User's display name (nullable)
  avatar_url text,              -- URL to user's avatar (nullable)
  created_at timestamp,
  updated_at timestamp
);
```

### Row Level Security (RLS)
- ✅ Users can view all profiles (for member lists)
- ✅ Users can update only their own profile
- ✅ Users can insert only their own profile

### Auto-Update Trigger
- `updated_at` field automatically updated on profile changes

---

## User Flow

### Signup Flow
```
1. User clicks "Sign Up" in Login page
2. Enters email & password
3. Clicks "Sign Up" button
   ↓
4. Backend: supabase.auth.signUp() called
5. Backend: Database trigger creates profile
   ↓
6. Depending on Supabase config:
   - If email confirmation required:
     → Show "Check your email" message
     → User clicks confirmation link in email
     → User can then login
   - If email auto-confirmed:
     → Show "Account created successfully" message
     → User can immediately login
```

### Login Flow
```
1. User clicks "Login" (or stays in login mode)
2. Enters email & password
3. Clicks "Login" button
   ↓
4. Backend: supabase.auth.signInWithPassword() called
   ↓
5. Success: Redirects to Dashboard
6. Error: Shows error message
```

### After Login
```
1. Dashboard page loads
2. Fetches user's workspaces
3. Shows workspace list with full app functionality
```

---

## API Usage Examples

### Basic Signup
```javascript
import { signUpUser } from './lib/auth.js'

// In your component
const result = await signUpUser(email, password)

if (result.success) {
  console.log("Signup successful!")
  if (result.data.requiresEmailConfirmation) {
    console.log("User needs to confirm email")
  }
} else {
  console.error("Error:", result.error)
}
```

### Login
```javascript
import { loginUser } from './lib/auth.js'

const result = await loginUser(email, password)

if (result.success) {
  console.log("Logged in!", result.data.user)
} else {
  console.error("Login failed:", result.error)
}
```

### Get User Profile
```javascript
import { getCurrentUserProfile } from './lib/auth.js'

const result = await getCurrentUserProfile()

if (result.success) {
  console.log("User profile:", result.profile)
  console.log("Name:", result.profile.name)
  console.log("Avatar:", result.profile.avatar_url)
} else {
  console.error("Error:", result.error)
}
```

### Update Profile
```javascript
import { updateUserProfile } from './lib/auth.js'

const result = await updateUserProfile({
  name: "John Doe",
  avatar_url: "https://example.com/avatar.jpg"
})

if (result.success) {
  console.log("Profile updated!")
} else {
  console.error("Error:", result.error)
}
```

---

## Key Points

1. **Profiles Created Automatically**
   - No need to manually call an API to create profiles
   - Database trigger handles this automatically
   - Happens in <500ms after auth.signUp()

2. **Email Confirmation**
   - Depends on Supabase project settings
   - Default: Email confirmation required
   - Can be disabled in Supabase dashboard if desired

3. **Profile Fields**
   - `id` - Auto-linked to auth user
   - `email` - Set from auth.email
   - `name` - User can set later (optional)
   - `avatar_url` - User can set later (optional)

4. **RLS Policies**
   - All users can view all profiles (needed for member lists)
   - Users can only update their own profile
   - Prevents unauthorized profile modifications

5. **Error Handling**
   - Duplicate email: "Email already registered" error
   - Weak password: Supabase returns password requirements
   - Network errors: Proper error messages shown

---

## Supabase Configuration

### Email Confirmation (Default)
- Enable: User must confirm email before account is active
- Disable: User can log in immediately (less secure but faster)

**To disable in Supabase:**
1. Go to Auth settings
2. Find "Email Confirmations"
3. Toggle off (not recommended for production)

### Password Requirements
- Minimum length: 6 characters (configurable)
- No special character requirements by default

---

## Testing

### Test Signup
1. Go to login page
2. Click "Sign Up" link
3. Enter test email and password
4. Click "Sign Up"
5. Check success/confirmation message
6. Confirm email if required
7. Try logging in with new account

### Test Profile Creation
```javascript
// In browser console after signup
import { getCurrentUserProfile } from './src/lib/auth.js'
const result = await getCurrentUserProfile()
console.log(result.profile)  // Should show profile with id, email
```

### Test Profile Update
```javascript
import { updateUserProfile } from './src/lib/auth.js'
const result = await updateUserProfile({ name: "Test User" })
console.log(result.data)  // Should show updated profile
```

---

## Migration Status

### Pending Migrations
- `20260328120000_add_user_profiles.sql` - Profiles table
- `20260328130000_add_auth_signup_trigger.sql` - Auto-profile creation

### To Deploy
```bash
cd d:\Projects\VaultNotes
npx supabase db push
```

---

## Troubleshooting

### Issue: Profile not created after signup
- **Check**: Is the trigger deployed? (`20260328130000_add_auth_signup_trigger.sql`)
- **Solution**: Run `npx supabase db push`

### Issue: Email already registered error on signup
- **Expected behavior**: User created account previously
- **Solution**: User should click "Login" and use password reset if needed

### Issue: Can't update profile
- **Check**: User's RLS policies - only own profile can be updated
- **Solution**: Make sure you're authenticated and updating own profile

### Issue: Can't see other users' profiles
- **Check**: RLS policy "profiles_select_all" should be enabled
- **Solution**: Run migrations again, ensure policy is created

---

## Files Modified/Created

### New Files
- `src/lib/auth.js` - Authentication helper functions
- `supabase/migrations/20260328120000_add_user_profiles.sql` - Profiles table
- `supabase/migrations/20260328130000_add_auth_signup_trigger.sql` - Auto-profile creation

### Updated Files
- `src/pages/Login.jsx` - Unified login/signup interface
- (Signup.jsx kept for backwards compatibility)

### Related Files (Not Changed)
- `src/App.jsx` - Already routing to Login component
- `src/context/ToastContext.jsx` - For future notifications
- `src/hooks/useToast.js` - For future notifications

---

## Future Enhancements

1. **Email Format Validation**
   - Add RFC 5822 validation
   - Better user feedback on invalid emails

2. **Password Strength Meter**
   - Show real-time password requirements
   - Visual feedback on password strength

3. **Social Login** (OAuth)
   - Google sign-in
   - GitHub sign-in
   - Supabase supports these with minimal changes

4. **Password Reset**
   - Forgot password link on login page
   - Email-based password reset flow

5. **Invite Links**
   - Workspace invite with pre-filled email
   - Users can sign up directly from invite link

6. **Avatar Upload**
   - Direct image upload to storage
   - Avatar display in profile and member lists

---

## Security Considerations

✅ **Already Implemented**
- Passwords sent securely via HTTPS
- Profiles protected by RLS
- Auth tokens managed by Supabase
- LocalStorage encryption keys cleared on logout
- Email verification prevents abuse

⚠️ **Important for Production**
- Enforce HTTPS everywhere
- Use strong password requirements
- Enable email verification (default)
- Monitor for suspicious activity
- Regular security audits

---

## API Documentation

See `src/lib/auth.js` for detailed JSDoc comments on each function.

Return format for all functions:
```javascript
// Success
{
  success: true,
  data: {...}  // Varies by function
}

// Error
{
  success: false,
  error: "Error message"
}
```
