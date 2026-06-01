# Secure Image Messages - Private Storage + Signed URLs Implementation

## Overview

Implemented secure image messaging with Supabase private storage and signed URLs. All image uploads now go to a private `chat-images` bucket, with access controlled through time-limited signed URLs (1-hour expiry).

## Architecture

### 1. Storage Flow

```
User selects image
    ↓
uploadImageToPrivateStorage() (new utility)
    ↓
Upload to private chat-images bucket
    ↓
Store storage_path in messages.storage_path
    ↓
Receiver gets message with storage_path
    ↓
generateSignedUrl on-demand
    ↓
Display image via signed URL
    ↓
URL expires after 1 hour
```

### 2. Key Components

#### New File: `src/lib/privateImageStorage.js`

**Functions:**

1. **`getSignedImageUrl(storagePath, expirySeconds = 3600)`**
   - Generate signed URL from storage path
   - Default 1-hour expiry
   - Returns: `{ url, expiresAt }` or null
   - Validates expiry before generation

2. **`uploadImageToPrivateStorage(file, userId, conversationId)`**
   - Upload to private `chat-images` bucket
   - Path format: `{userId}/{conversationId}/{timestamp}-{random}-{filename}`
   - Returns: `{ storagePath }` or null
   - No cache control (private URLs don't need caching)

3. **`isSignedUrlValid(expiresAt)`**
   - Check if URL is still valid
   - 30-second buffer before actual expiry
   - Returns: boolean

4. **`deletePrivateImage(storagePath)`**
   - Remove image from private storage
   - Used for message deletion (optional enhancement)
   - Returns: Promise<boolean>

#### Database Migration: `20260403_add_storage_path_to_messages.sql`

**Changes:**
- Add `storage_path TEXT` column to messages table
- Profile: Index on storage_path for queries
- Backward compatible: Old media_url still works

**Schema:**
```sql
messages.storage_path — Path to file in chat-images bucket
-- Existing media_url, image_url fields retained for backward compatibility
```

### 3. Chat.jsx Updates

#### State Changes
- Added `loadedImageUrls` state: `{ messageId -> signedUrl }`
- Stores loaded image URLs to avoid regenerating constantly

#### Ref Changes
- `signedImageUrlCacheRef`: Maps storage_path -> `{ url, expiresAt }`
- Prevents duplicate signed URL generation

#### Function Changes

1. **`handleSendImageMessage()`** - UPDATED
   - Upload to private bucket via `uploadImageToPrivateStorage()`
   - Store `storage_path` in messages table (NOT media_url)
   - Encrypt caption independently
   - Message payload uses `storage_path` field

2. **`getImageMessageUrl(message)`** - UPDATED TO ASYNC
   - Check cache first: if valid, return cached URL
   - Generate new signed URL if cache miss
   - Cache result with expiry timestamp
   - Fall back to old public URLs for backward compatibility
   - Returns: Promise<string | null>

3. **`loadedImageUrls` Effect** - NEW
   - Runs when messages change
   - Loads signed URLs for all image messages asynchronously
   - Stores results in state for rendering
   - Prevents blocking renders

4. **Signed URL Refresh Effect** - NEW
   - Runs every minute
   - Checks cached URLs for expiry
   - Clears expired URLs from cache
   - Lazy-loads fresh URLs on next access

5. **Conversation Load Effect** - UPDATED
   - Clears signed URL cache when switching conversations
   - Prevents stale URLs between conversations

6. **`handleForwardMessages()`** - UPDATED
   - Includes `storage_path` in forwarded messages
   - References same storage location

### 4. Real-time Support

**Message Insert Handler**
- Works with new storage_path field
- Loads signed URL in state effect
- Displays image via signed URL

**Message Update Handler**
- Supports editing captions
- Image URL remains valid

**Receiver Listener** 
- Detects new image messages
- Loads signed URL on receipt

### 5. Security Features

**Private Storage**
- ✅ `chat-images` bucket is PRIVATE
- ✅ No public URLs exposed
- ✅ Access only via signed URLs

**Signed URLs**
- ✅ 1-hour expiry (3600 seconds)
- ✅ Automatic refresh mechanism
- ✅ 30-second buffer before actual expiry
- ✅ Cache invalidation on conversation switch

**Path Organization**
- ✅ Path structure: `{userId}/{conversationId}/{timestamp}-{random}-{filename}`
- ✅ Only users in conversation can decrypt messages
- ✅ RLS policies on messages table control access

**Message Encryption**
- ✅ Image captions encrypted with conversation key
- ✅ Storage path NOT encrypted (needed for signed URL generation)
- ✅ Same encryption flow as text messages

### 6. Backward Compatibility

**Existing Images**
- ✅ Old `media_url` field still accessible
- ✅ Falls back to media_url if no storage_path
- ✅ No breaking changes to existing messages

**Dual Support**
- New messages: Use private storage + signed URLs
- Old messages: Use existing media_url (public)
- Can transition gradually

## Implementation Details

### Upload Flow (handleSendImageMessage)

```typescript
1. Validate image file
2. Call uploadImageToPrivateStorage()
   - Generates unique storage path
   - Uploads to private bucket
   - Returns storagePath
3. Get conversation encryption key
4. Encrypt caption if present
5. Create message payload:
   {
     storage_path: storagePath,  // NEW: Private storage path
     encrypted_content: encryptedCaption,
     iv: captionIv,
     type: "image",
     media_url: null,  // NEW: Don't store public URL
     image_url: null
   }
6. Insert message into DB
7. realtime subscription fires, updates UI
8. Image URL loaded asynchronously via effect
```

### Rendering Flow

```typescript
1. Message renders with isImageMessage = true
2. loadedImageUrls effect starts
3. For each image message:
   a. Check if loadedImageUrls[messageId] exists
   b. If not, call getImageMessageUrl(message)
   c. getImageMessageUrl generates signed URL
   d. Caches in signedImageUrlCacheRef
   e. Sets loadedImageUrls[messageId] = signedUrl
4. Component re-renders with signed URL
5. <img src={imageUrl} /> displays image
6. Background effect checks expiry every 60 seconds
7. On conversation switch, cache is cleared
```

### Expiry Validation

```typescript
// Every 60 seconds:
messages.forEach(msg => {
  if (msg.storage_path && cached[msg.storage_path]) {
    if NOT isSignedUrlValid(cached.expiresAt) {
      delete cached[msg.storage_path]
      // Will regenerate on next render
    }
  }
})
```

## Testing Checklist

- [ ] Upload image to private bucket
- [ ] Verify image renders with signed URL (not public URL)
- [ ] Open image message in different tab/device - loads fresh signed URL
- [ ] Wait 1 hour (or mock expiry) - URL refreshes automatically
- [ ] Forward image message - uses same storage path
- [ ] Edit image caption - signed URL still valid
- [ ] Switch conversations - image cache cleared
- [ ] Delete message - optional: cleanup storage
- [ ] Old messages with media_url - still display (fallback)
- [ ] Real-time INSERT event - image loads in realtime
- [ ] Real-time UPDATE event - caption update doesn't break image
- [ ] Console logs show signed URL generation, caching, expiry

## Console Logs

**Expected messages:**
```
[Images] Successfully uploaded to private bucket: {storagePath}
[Chat] Image uploaded to private storage: {storagePath}
[Chat] Image message sent successfully
[Chat] Using cached signed URL for: {storagePath}
[Chat] Generated new signed URL for: {storagePath}
[Chat] Signed URL expired for: {storagePath}, will refresh on next view
```

## Future Enhancements

1. **Image Path Encryption** (Optional)
   - Encrypt storage_path with conversation key
   - Add encrypted_storage_path, storage_path_iv fields
   - Decrypt before generating signed URL

2. **Image Deletion Cleanup**
   - Delete image from storage when message is deleted
   - Call deletePrivateImage() in handleUnsendMessage()

3. **Image Compression**
   - Resize images before upload
   - Generate thumbnails for previews
   - Store original URL for full resolution

4. **Image Metadata**
   - Extract dimensions before upload
   - Store width, height, file size in DB
   - Use for optimized rendering

5. **Ephemeral Images**
   - Short-lived URLs (5 minutes instead of 1 hour)
   - For sensitive images
   - Require fresh URL on every view

## Deployment Notes

**Requirements:**
- `chat-images` private storage bucket exists (pre-configured in Supabase)
- No public access policy on bucket (verify it's private)
- RLS policies allow bucket access only via signed URLs

**Migration:**
- Run `20260403_add_storage_path_to_messages.sql`
- No downtime required
- Existing media_url images still work

**Monitoring:**
- Track signed URL generation frequency in logs
- Monitor storage bucket size growth
- Check for orphaned images (optional cleanup job)

## Summary

✅ Secure private storage for images
✅ Time-limited signed URLs (1 hour)  
✅ Automatic expiry refresh mechanism
✅ Real-time message support
✅ Backward compatible with existing images
✅ Integrated with chat encryption
✅ No breaking changes
