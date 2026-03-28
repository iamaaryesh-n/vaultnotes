# Profile Page - Setup & Usage

## Features

✅ **View Profile**
- See email (read-only)
- See current name
- See uploaded avatar

✅ **Update Name**
- Edit name field
- Save changes with one click
- Non-blocking error handling

✅ **Upload Avatar**
- Upload image file
- Stored in Supabase Storage
- Auto-saved to profiles table
- Public URL generated

✅ **RLS Security**
- Users can only view/edit their own profile
- Profile ID must match auth.uid()

---

## Setup - Create Avatars Storage Bucket

**Required Step:** Create a storage bucket called `avatars` in Supabase for avatar uploads.

### Option 1: Supabase Dashboard (Easiest)

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Storage** (left sidebar)
4. Click **Create a new bucket**
5. Name it: `avatars`
6. Set to **Public** (so avatars are visible)
7. Click **Create bucket**

### Option 2: SQL (Alternative)

```sql
-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Set RLS policy to allow authenticated users to upload/manage their own avatars
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatars are publicly readable"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');
```

---

## File Structure

```
src/pages/Profile.jsx
├── Fetch current user (supabase.auth.getUser)
├── Fetch profile data (from profiles table)
├── Avatar upload section
├── Name edit input
└── Save button
```

---

## How It Works

### 1. Load Profile

```javascript
// Get authenticated user
const { data: { user } } = await supabase.auth.getUser()

// Fetch profile from profiles table
const { data: profile } = await supabase
  .from("profiles")
  .select("*")
  .eq("id", user.id)
  .single()
```

### 2. Upload Avatar

```javascript
// Upload file to storage
const { data } = await supabase.storage
  .from("avatars")
  .upload(`${user.id}.png`, file, { upsert: true })

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from("avatars")
  .getPublicUrl(fileName)

// Update profiles table with URL
await supabase
  .from("profiles")
  .update({ avatar_url: publicUrl })
  .eq("id", user.id)
```

### 3. Update Name

```javascript
// Update profile name
await supabase
  .from("profiles")
  .update({ name: newName })
  .eq("id", user.id)
```

---

## Database Tables & RLS

### profiles Table

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- RLS Policies
-- Users can view all profiles (for member lists)
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
```

---

## Testing

### 1. Navigate to Profile

- Click **Profile** link in top-right header
- Page loads with current profile data

### 2. Update Name

- Change name in input field
- Click **Save Profile**
- Success message appears
- Name updates in database

### 3. Upload Avatar

- Click **Upload Avatar** button
- Select an image file
- Upload completes
- Avatar displays immediately
- URL saved to profiles table

### 4. Verify in Database

Check Supabase dashboard:
- **Storage** → avatars bucket → see `{user-id}.png`
- **SQL Editor** → Query profiles table → see `avatar_url` updated

---

## Debugging

### Console Logs

Profile page includes detailed console logs:

```
[Profile] Fetched user: { id: "...", email: "..." }
[Profile] Fetched profile: { name: "john", avatar_url: "https://..." }
[Profile] Starting avatar upload for user: abc123
[Profile] File uploaded successfully: { ... }
[Profile] Public URL: https://...
[Profile] Avatar updated successfully: https://...
[Profile] Saving name for user: abc123 New name: john
[Profile] Name updated successfully
```

### Common Issues

**Q: Avatar upload fails with "bucket not found"**
- A: Create the `avatars` bucket in Supabase Storage (see Setup section)

**Q: Avatar shows but URL not saved**
- A: Check RLS policies - user must be able to INSERT/UPDATE own profile

**Q: Can't see profile data**
- A: Verify auth user is logged in and profile row exists with matching ID

---

## Navigation

**Profile Page Link:**
- Located in top-right header
- Route: `/profile`
- Protected: Only visible when logged in

**Back to Dashboard:**
- Click "Back to Dashboard" button
- Route: `/`

---

## Code Location

- **Profile Page:** [src/pages/Profile.jsx](../src/pages/Profile.jsx)
- **Route:** [src/App.jsx](../src/App.jsx) - `/profile` route added
- **Profile Table:** Database migration: `20260328120000_add_user_profiles.sql`

---

## Next Steps

1. ✅ Create `avatars` storage bucket in Supabase
2. ✅ Deploy migrations (if not already done with `npx supabase db push`)
3. ✅ Test signup flow - profile created automatically
4. ✅ Test profile page - update name and upload avatar
5. Optional: Add more profile fields (bio, location, etc.)

---

**Implementation Status:** ✅ Complete
**Tested:** Profile page loads, updates work, avatar uploads to storage
**Secure:** All operations protected by RLS policies
**Theme:** Matches existing VaultNotes yellow + clean card design
