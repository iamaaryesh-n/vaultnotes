# Chat Encryption and Real-Time Message Fix

## Problem
Users were not able to see received messages, and chats were not updating in real-time in the UI. The console showed multiple decryption errors: "Invalid encryption key or corrupted data".

## Root Cause Analysis
The main issue was that encryption keys were stored only in localStorage on each user's device, but:
- When User A sent a message, they encrypted it with their local key
- When User B tried to decrypt the message, they didn't have User A's key
- Each user had a unique key, but a shared conversation needed a single key both could access

Additionally, the `conversations` and `messages` table migrations were missing from the repository.

## Solution Implemented

### 1. Database Schema - New Migrations Created

Two new migration files were created:

#### `20260402_create_chat_tables.sql`
- Creates `conversations` table to store user-to-user conversations
- Creates `messages` table with full encryption support:
  - `encrypted_content` and `iv` fields for AES-GCM encryption
  - All necessary metadata fields (type, media_url, is_read, etc.)
- Creates `message_reactions` table for emoji reactions
- Implements comprehensive Row Level Security (RLS) policies
- Creates necessary indexes for performance

#### `20260402_create_conversation_keys_v2.sql`
- Creates `conversation_keys` table to store shared encryption keys
- Both `encrypted_key_user1` and `encrypted_key_user2` fields store the same key
- Implements RLS policies so users can only access keys for their own conversations

### 2. Chat.jsx - Encryption Key Management Updates

#### Updated `getOrCreateConversationKey()`:
- Now fetches encryption keys from the database instead of localStorage
- Generates a new key if one doesn't exist
- Stores the key in the `conversation_keys` table so BOTH users can access it
- Falls back gracefully if the `conversation_keys` table doesn't exist yet
- Maintains in-memory cache for performance

#### Updated `getConversationKey()`:
- Fetches shared keys from the database for decryption
- Checks memory cache first for performance
- Provides helpful logging if keys are missing

#### Updated Message Fetching:
- `fetchMessages()` now ensures the encryption key is loaded before decrypting stored messages
- Real-time subscriptions (INSERT, UPDATE) now properly decrypt incoming messages using the shared key

### 3. Conversation Management

#### Updated `handleStartConversationWithUser()`:
- Now calls `getOrCreateConversationKey()` when creating or opening a conversation
- Ensures the shared encryption key exists before displaying messages

## How It Works Now

### Sending a Message:
1. User opens or creates a conversation
2. System fetches/creates a shared encryption key for that conversation
3. Message is encrypted using the shared key
4. `encrypted_content` and `iv` are stored in the database
5. Message appears immediately in sender's UI

### Receiving a Message:
1. Real-time subscription detects new message INSERT
2. System fetches the shared encryption key from `conversation_keys` table
3. Message is decrypted using the shared key
4. Decrypted message is displayed in the conversation
5. Message is automatically marked as read

### Key Access Control:
- RLS policies ensure users can only view/decrypt messages from their own conversations
- The `conversation_keys` table is protected so only conversation participants can access the key

## Migration Steps (Required to Apply)

### Option 1: Using Supabase Dashboard SQL Editor
1. Go to Supabase Dashboard → Project
2. Open SQL Editor
3. Copy the content of `supabase/migrations/20260402_create_chat_tables.sql`
4. Run the SQL
5. Copy the content of `supabase/migrations/20260402_create_conversation_keys_v2.sql`
6. Run the SQL

### Option 2: Using Supabase CLI
```bash
cd supabase
supabase db push
```

## Testing the Fix

### After Applying Migrations:

1. **Create a new conversation**:
   - Search for a user and start a conversation
   - Verify `conversation_keys` entry is created in the database

2. **Send a message**:
   - Type and send a message
   - Verify `encrypted_content` and `iv` are populated in the `messages` table
   - Verify message appears in sender's UI

3. **Receive a message**:
   - Have the other user send a message
   - Verify message appears in receiver's UI
   - Verify message decrypts properly (not showing "[Error decrypting message]")

4. **Conversation updates in real-time**:
   - Messages should appear instantly in both sender and receiver UIs
   - Conversation list should update with new, messages
   - Unread count should update

### Console Logs to Verify:
- `[Chat] ✅ Successfully loaded shared key for conversation ...`
- `[Chat] ✅ Successfully retrieved shared key for conversation ...`
- `[decrypt] ✅ Successfully decrypted to X characters`

## Fallback Behavior (Before Migration Applied)

If the migrations haven't been applied yet:
- System logs: `conversation_keys table does not exist yet. Using memory-only storage for encryption keys.`
- Keys are stored only in memory for the current session
- Messages may still be encrypted/decrypted, but keys won't persist across page refreshes
- Each user would have their own key, so cross-user decryption would still fail

**Note**: Apply the migrations as soon as possible for full functionality.

## Files Modified
- `src/pages/Chat.jsx` - Key management and decryption logic
- Created `supabase/migrations/20260402_create_chat_tables.sql`
- Created `supabase/migrations/20260402_create_conversation_keys_v2.sql`

## Related Documentation
- See `REALTIME_STABILITY_FIX.md` for more context on real-time chat architecture
- Encryption utilities in `src/utils/encryption.js`
