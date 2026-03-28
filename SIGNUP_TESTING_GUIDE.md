# Signup Feature - Visual Guide & Testing

## 🎯 What Users Will See

### Login Page (Initial View)
```
┌──────────────────────────────────────┐
│                                      │
│         Login                        │
│  Sign in to your VaultNotes account  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Email                          │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Password                       │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │         Login                  │  │
│  └────────────────────────────────┘  │
│                                      │
│  Don't have an account? [Sign Up]    │
│                                      │
└──────────────────────────────────────┘
```

### Sign Up Page (After Clicking Sign Up)
```
┌──────────────────────────────────────┐
│                                      │
│      Create Account                  │
│  Join VaultNotes and secure          │
│  your memories                       │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Email                          │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Password                       │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │       Sign Up                  │  │
│  └────────────────────────────────┘  │
│                                      │
│  Already have an account? [Login]    │
│                                      │
└──────────────────────────────────────┘
```

---

## 📋 Step-by-Step Testing

### Test 1: New Account Signup

**Steps:**
1. Go to http://localhost:5173
2. Click "Sign Up" link
3. Enter email: `test@example.com`
4. Enter password: `testpass123`
5. Click "Sign Up" button

**Expected Result:**
- ✅ Success modal appears with confirmation message
- ✅ Message says: "Check your email to confirm your account..."
- ✅ Click OK to close

**Verify Profile Created:**
```javascript
// Open browser console (F12)
import { getCurrentUserProfile } from './src/lib/auth.js'
const result = await getCurrentUserProfile()
console.log(result.profile)
// Should show: { id: "...", email: "test@example.com", name: null, avatar_url: null, ... }
```

---

### Test 2: Duplicate Email Signup

**Steps:**
1. Try signing up with same email again: `test@example.com`
2. Click "Sign Up" button

**Expected Result:**
- ✅ Error modal appears
- ✅ Shows "This email is already registered. Please log in instead."
- ✅ Form switches back to login mode when OK clicked

---

### Test 3: Login After Signup

**Steps:**
1. Click "Login" link (to switch modes or close confirmation modal)
2. Enter email: `test@example.com`
3. Enter password: `testpass123`
4. Click "Login" button

**Expected Result:**
- ✅ Dashboard loads
- ✅ User sees their workspaces (or empty state if first time)
- ✅ Top nav shows "Logout" button

---

### Test 4: Update User Profile

**Steps (in browser console):**
```javascript
import { updateUserProfile } from './src/lib/auth.js'

// Update user's name
const result = await updateUserProfile({ name: 'Test User' })
console.log(result)  // Should show success: true

// Get updated profile
const profile = await getCurrentUserProfile()
console.log(profile.profile.name)  // Should show: 'Test User'
```

---

### Test 5: Logout and Login Again

**Steps:**
1. Click "Logout" button in top right
2. You're back at login page
3. Enter email: `test@example.com`
4. Enter password: `testpass123`
5. Click "Login"

**Expected Result:**
- ✅ Dashboard loads again
- ✅ Session maintained
- ✅ All workspace data accessible

---

### Test 6: Invalid Credentials

**Steps:**
1. Try login with correct email but wrong password
2. Or try email that doesn't exist

**Expected Result:**
- ✅ Error modal shows: "Invalid login credentials"
- ✅ User stays on login page
- ✅ Can try again

---

## 🔄 User Journey Map

```
START
  │
  ├──→ FIRST TIME USER
  │      │
  │      ├──→ Click "Sign Up"
  │      ├──→ Enter email & password
  │      ├──→ Click "Sign Up" button
  │      │
  │      ├──→ Profile created automatically ✓
  │      │
  │      ├──→ Email confirmation required?
  │      │      ├─ YES → Check email → Click link → Confirmed
  │      │      └─ NO  → Account ready immediately
  │      │
  │      ├──→ Switch to Login mode
  │      ├──→ Enter credentials
  │      └──→ LOGGED IN → Dashboard
  │
  ├──→ RETURNING USER
  │      │
  │      ├──→ Login page shown
  │      ├──→ Enter email & password
  │      ├──→ Click "Login"
  │      └──→ LOGGED IN → Dashboard
  │
  └──→ IN APP
         │
         ├──→ Browse workspaces
         ├──→ Create memories
         ├──→ Manage workspace members
         └──→ Click "Logout" → Back to login
```

---

## ⚙️ Technical Details for Developers

### Database Trigger Verification

```sql
-- Run in Supabase SQL Editor to verify trigger is created:
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- View the function:
SELECT routine_definition FROM information_schema.routines 
WHERE routine_name = 'handle_auth_user_signup';

-- Check profiles table was created:
SELECT * FROM information_schema.tables 
WHERE table_name = 'profiles';

-- Check profiles have been created:
SELECT COUNT(*) as total_profiles FROM public.profiles;
```

### RLS Policy Verification

```sql
-- Check policies on profiles table:
SELECT * FROM pg_policies 
WHERE tablename = 'profiles';

-- Test SELECT (should work for all authenticated users):
SELECT * FROM public.profiles LIMIT 1;  -- Requires authentication

-- Test UPDATE (should only work on own profile):
UPDATE public.profiles SET name = 'Test' 
WHERE id = auth.uid();  -- Only works if id matches current user
```

---

## 📊 Success Indicators

### You'll Know It's Working When:

1. ✅ **Login page shows toggle**
   - See "Don't have an account? Sign Up" link

2. ✅ **Can switch to signup mode**
   - Click link and form title changes to "Create Account"

3. ✅ **Signup creates profile**
   - New user can be verified in database

4. ✅ **Email confirmation works**
   - User receives email with confirmation link

5. ✅ **Can login after signup**
   - User enters same credentials and logs in successfully

6. ✅ **Dashboard loads**
   - Workspace list or empty state shows after login

7. ✅ **Logout clears data**
   - Back at login page after logout

---

## 🐛 Troubleshooting

### "Migration pending" error?
```bash
cd d:\Projects\VaultNotes
npx supabase db push
```

### No profile created?
- Check migrations are deployed
- Wait 500ms after signup
- Check Supabase logs for trigger errors

### Email confirmation not received?
- Check spam folder
- Verify email provider configured in Supabase
- Check email address is correct

### Can't login after email confirmed?
- Try logging out completely
- Clear browser cache (Ctrl+F5)
- Make sure email is exactly correct (case-insensitive but typos matter)

### Form validation errors?
- Email: Must be valid email format
- Password: At least 6 characters (default)
- Both fields: Required

---

## 📱 Responsive Design

The signup/login page is fully responsive:

**Desktop** (1200px+)
- Centered card
- 320px width
- Full form visible

**Tablet** (768px - 1199px)
- Centered card
- 90% width (max 320px)
- Full form visible

**Mobile** (< 768px)
- Fills screen with padding
- Touch-friendly buttons
- Readable text size

---

## 🔐 Security Notes

✅ **Currently Secure:**
- Passwords encrypted in transit
- Never stored in localStorage
- Auth tokens managed by Supabase
- RLS protects profile data

⚠️ **Important for Production:**
- Disable HTTP (use HTTPS only)
- The app currently runs on HTTP locally (localhost)
- On production, enforce HTTPS redirect

---

## 📈 Analytics You Can Implement

```javascript
// Track signup from browser console:
console.log("User: test@example.com")
console.log("Signup time: " + new Date())
console.log("Profile created: true")

// In future, could integrate with analytics:
// - Track signup count
// - Track signup errors
// - Track email confirmation rate
// - Track conversion to first workspace creation
```

---

## ✨ Next Steps After Deployment

1. **Test thoroughly** with real email addresses
2. **Configure email provider** in Supabase (SendGrid, etc.)
3. **Set password policies** if needed
4. **Monitor signup metrics**
5. **Gather user feedback** on onboarding flow
6. **Plan future enhancements**:
   - Password reset
   - Social login (OAuth)
   - Avatar uploads
   - Workspace creation on signup

---

## 📞 Support & Resources

- **Supabase Docs**: https://supabase.com/docs
- **Auth Setup**: https://supabase.com/docs/guides/auth
- **RLS Policy Guide**: https://supabase.com/docs/guides/auth/row-level-security
- **Database Triggers**: https://supabase.com/docs/guides/database/functions

---

**Status**: ✅ Ready for Testing
**Version**: 1.0
**Last Updated**: March 28, 2026
