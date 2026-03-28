# User Signup - Quick Start

## What's New

✅ **Unified Login/Signup Page**
- Single page for both login and account creation
- Easy toggle with "Sign Up" / "Login" link
- Professional UI with proper messaging

✅ **Automatic Profile Creation**
- User profiles automatically created when signing up
- Database trigger handles this instantly
- No manual API calls needed

✅ **Complete Authentication Flow**
- Email & password signup
- Email confirmation support
- Proper error handling
- Clear user feedback

✅ **Helper Functions**
- `signUpUser()` - Create new account
- `loginUser()` - Log in user
- `getCurrentUserProfile()` - Get current user's profile
- `updateUserProfile()` - Update user info
- `signOutUser()` - Log out

---

## How to Use

### For Users
1. **Sign Up**: Click "Sign Up" link on login page
2. **Enter Email & Password**: Fill in credentials
3. **Click Sign Up**: Submit the form
4. **Email Confirmation**: Check email for confirmation link (if required)
5. **Login**: Use email & password to log in

### For Developers

**Import the helpers:**
```javascript
import { 
  signUpUser, 
  loginUser, 
  getCurrentUserProfile,
  updateUserProfile 
} from '../lib/auth.js'
```

**Use in your code:**
```javascript
// Signup
const result = await signUpUser('user@example.com', 'password123')
if (result.success) {
  console.log('Account created!')
}

// Login
const result = await loginUser('user@example.com', 'password123')
if (result.success) {
  console.log('Logged in!')
}

// Get profile
const { profile } = await getCurrentUserProfile()
console.log(profile.name, profile.avatar_url)

// Update profile
await updateUserProfile({ name: 'John Doe' })
```

---

## Files & Changes

### New Files Created
- `src/lib/auth.js` - Authentication functions
- `supabase/migrations/20260328120000_add_user_profiles.sql` - Profiles table
- `supabase/migrations/20260328130000_add_auth_signup_trigger.sql` - Auto-profile creation
- `SIGNUP_IMPLEMENTATION.md` - Full documentation

### Updated Files
- `src/pages/Login.jsx` - Unified login/signup with toggle

---

## Deploy Migrations

```bash
cd d:\Projects\VaultNotes
npx supabase db push
```

This will create:
1. `profiles` table with: id, email, name, avatar_url, created_at, updated_at
2. Row Level Security (RLS) policies
3. Auto-update trigger for updated_at
4. Auth trigger for automatic profile creation

---

## Key Features

| Feature | Status | Details |
|---------|--------|---------|
| Email/Password Signup | ✅ Complete | Users can create new accounts |
| Profile Auto-Creation | ✅ Complete | Created via database trigger |
| Email Confirmation | ✅ Complete | Handles required/optional confirmation |
| Login Integration | ✅ Complete | Sign in with created account |
| Error Handling | ✅ Complete | Clear error messages |
| Profile Management | ✅ Complete | Update name, avatar, etc. |
| RLS Protection | ✅ Complete | Secure by default |
| Helper Functions | ✅ Complete | Easy to use in components |

---

## Architecture

```
User creates account
    ↓
Login.jsx handleSignup()
    ↓
signUpUser() in auth.js
    ↓
supabase.auth.signUp({email, password})
    ↓
Database: trigger on_auth_user_created
    ↓
Automatic profile row created in profiles table
    ↓
User receives confirmation email (if required)
    ↓
User confirms email
    ↓
User can now login
```

---

## Testing Signup

1. **Go to Login Page**: http://localhost:5173
2. **Click "Sign Up" Link**: Bottom of form
3. **Enter Test Credentials**:
   - Email: test@example.com
   - Password: testpass123
4. **Submit**: Click "Sign Up" button
5. **Check Message**: Should show confirmation message
6. **Verify Profile Created**: 
   ```javascript
   // In browser console
   import { getCurrentUserProfile } from './src/lib/auth.js'
   const result = await getCurrentUserProfile()
   console.log(result.profile)
   ```

---

## Database Schema

```sql
-- Profiles table structure
profiles (
  id uuid PRIMARY KEY,           -- Linked to auth.users.id
  email text,                    -- From auth.email
  name text,                     -- User can set later
  avatar_url text,               -- User can set later
  created_at timestamp,
  updated_at timestamp           -- Auto-updates
)

-- RLS Policies
- SELECT: All authenticated users can view profiles
- UPDATE: Users can only update their own profile
- INSERT: Users can only insert their own profile
```

---

## Troubleshooting

**Q: "Email already registered" error?**
A: Email is already in use. User should log in instead.

**Q: No confirmation email received?**
A: Check spam folder or resend from Supabase dashboard.

**Q: Can't log in after signup?**
A: Confirm email first if required. Or wait a moment for trigger to complete.

**Q: Profile not created?**
A: Make sure migrations are deployed: `npx supabase db push`

---

## Related Documentation

- **Full Implementation Guide**: See `SIGNUP_IMPLEMENTATION.md`
- **Loading UX**: See `LOADING_UX_IMPROVEMENTS.md`
- **Workspace Management**: See workspace-related docs

---

## Production Checklist

- [ ] Run migrations in production database
- [ ] Test signup with real email address
- [ ] Configure email provider in Supabase
- [ ] Enable email verification (recommended)
- [ ] Set up password reset (future enhancement)
- [ ] Add password strength requirements (future enhancement)
- [ ] Monitor signup errors in logs
- [ ] Set up email rate limiting

---

**Status**: Ready for testing ✅
**Deployment**: Pending migration push
**Documentation**: Complete ✅
