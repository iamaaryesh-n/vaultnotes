# Decryption Error Handling & Cache Invalidation - Implementation Summary

## Issue Fixed

Old messages encrypted before the `conversation_keys` table existed could not be decrypted. They were showing `[Error decrypting message]` instead of gracefully falling back or being skipped.

Additionally, stale encryption keys stored in memory could cause key mismatches when switching between conversations.

## Changes Implemented

### 1. New Function: `getConversationKeyFresh()`
**Location**: `src/pages/Chat.jsx` lines 304-344

**Purpose**: Always fetch encryption key fresh from the database WITHOUT checking the memory cache first.

```javascript
const getConversationKeyFresh = useCallback(async (conversationId) => {
  // Always fetch fresh from DB - do not use cache
  const { data: keyData } = await supabase
    .from("conversation_keys")
    .select("encrypted_key_user1, encrypted_key_user2")
    .eq("conversation_id", conversationId)
    .maybeSingle()
  
  if (keyData) {
    const cryptoKey = await importKey(keyToUse)
    // Update cache with fresh key from DB
    conversationCryptoKeysRef.current[conversationId] = cryptoKey
    return cryptoKey
  }
  return null
}, [])
```

**Behavior**:
- Fetches key from `conversation_keys` table
- Validates and imports the key
- Updates in-memory cache with the fresh key
- Returns the crypto key or null

---

### 2. Updated Function: `getConversationKey()`
**Location**: `src/pages/Chat.jsx` lines 346-354

**Purpose**: Check memory cache first, fall back to fresh DB fetch if cache miss.

```javascript
const getConversationKey = useCallback(async (conversationId) => {
  if (conversationCryptoKeysRef.current[conversationId]) {
    return conversationCryptoKeysRef.current[conversationId]
  }
  // Cache miss - fetch fresh from DB
  return getConversationKeyFresh(conversationId)
}, [getConversationKeyFresh])
```

**Behavior**:
- Uses cache if key is already loaded
- Falls back to `getConversationKeyFresh()` on cache miss
- Always ensures cache is synchronized with DB

---

### 3. Cache Invalidation on Conversation Load
**Location**: `src/pages/Chat.jsx` lines 1248-1262

**Purpose**: Clear stale keys from memory when opening a new conversation.

```javascript
useEffect(() => {
  if (activeConversationId) {
    // Clear stale keys from memory cache for this conversation
    delete conversationCryptoKeysRef.current[activeConversationId]
    
    // Fetch fresh key from DB (overwrites any stale cache)
    getOrCreateConversationKey(activeConversationId)
      .then(() => {
        fetchMessages(activeConversationId)
      })
  }
}, [activeConversationId, fetchMessages, getOrCreateConversationKey])
```

**Behavior**:
- Deletes key from memory cache when conversation changes
- Forces fresh fetch from DB on every conversation open
- Prevents stale temporary keys from causing mismatches

---

### 4. Updated Error Handling in `fetchMessages()`
**Location**: `src/pages/Chat.jsx` lines 893-920

**Purpose**: Gracefully handle old corrupted messages with fallback

**Key Changes**:

```javascript
// Use getConversationKeyFresh() instead of getConversationKey()
const cryptoKey = await getConversationKeyFresh(conversationId)

// Decryption with graceful fallback
try {
  if (message.encrypted_content && message.iv && cryptoKey) {
    const decryptedContent = await decrypt(message.encrypted_content, message.iv, cryptoKey)
    decrypted.content = decryptedContent
  }
} catch (decryptError) {
  // Log warning instead of error
  console.warn(`[Chat] Could not decrypt old message ${message.id}:`, decryptError.message)
  
  // Fallback strategy:
  if (message.content) {
    // Use plaintext if available (shouldn't happen for new encrypted messages, but check anyway)
    decrypted.content = message.content
  } else {
    // Old message encrypted with invalid key - cannot recover
    decrypted.content = "[Older encrypted message unavailable]"
  }
}
```

**Behavior**:
1. Tries to decrypt with fresh key from DB
2. If decryption fails:
   - Logs warning to console (not error)
   - Falls back to plaintext `content` field if present
   - Otherwise shows `[Older encrypted message unavailable]`
3. **Never** shows `[Error decrypting message]`
4. **Never** breaks conversation rendering

---

### 5. Real-Time INSERT Handler (Active Conversation)
**Location**: `src/pages/Chat.jsx` lines 1390-1410

**Changes**:
- Uses `getConversationKeyFresh()` instead of `getConversationKey()`
- Error handling: `console.warn()` instead of `console.error()`
- Fallback: `nextMessage.content || "[Message content unavailable]"`

```javascript
if (nextMessage.encrypted_content && nextMessage.iv) {
  try {
    const cryptoKey = await getConversationKeyFresh(activeConversationId)
    if (cryptoKey) {
      decryptedContent = await decrypt(nextMessage.encrypted_content, nextMessage.iv, cryptoKey)
    } else {
      decryptedContent = nextMessage.content || "[Encrypted message]"
    }
  } catch (decryptError) {
    console.warn("[Chat] Could not decrypt incoming message:", decryptError.message)
    decryptedContent = nextMessage.content || "[Message content unavailable]"
  }
}
```

---

### 6. Real-Time UPDATE Handler (Active Conversation)
**Location**: `src/pages/Chat.jsx` lines 1455-1475

**Changes**: Same as INSERT handler - fresh key fetch + graceful fallback

---

### 7. Receiver Listener (Background Updates)
**Location**: `src/pages/Chat.jsx` lines 1820-1835

**Changes**: Uses `getConversationKeyFresh()` for sidebar updates

```javascript
const cryptoKey = await getConversationKeyFresh(nextMessage.conversation_id)
if (cryptoKey) {
  decryptedContent = await decrypt(nextMessage.encrypted_content, nextMessage.iv, cryptoKey)
} else {
  decryptedContent = nextMessage.content || "[Message]"
}
```

---

## Console Log Changes

### Before:
```
[Chat] Failed to decrypt message ABC123: OperationError
[Chat] Failed to decrypt incoming message: OperationError
```

### After:
```
[Chat] Could not decrypt old message ABC123: AES-GCM decryption failed
[Chat] Displaying plaintext fallback for message ABC123
[Chat] Message ABC123 has no plaintext fallback - was encrypted with invalid key
[Chat] ✅ Successfully loaded fresh key for conversation XYZ
```

---

## User Experience Changes

### Before:
- Old messages showed: `[Error decrypting message]`
- Could not distinguish between decryption failure and missing key
- Conversation rendering could break

### After:
- Old messages show: `[Older encrypted message unavailable]`
- Clear separation between recoverable (fallback to plaintext) and unrecoverable messages
- Conversation always renders without breaking
- Users see a message indicating the limitation, not an error

---

## Technical Benefits

1. **Stale Key Prevention**: Memory cache is cleared on every conversation open
2. **DB Synchronization**: Keys are always fetched fresh when needed
3. **Graceful Degradation**: Old corrupted messages don't crash the app
4. **User Clarity**: Different messages for different failure modes
5. **Debug-Friendly**: Console logs indicate the exact issue without user-visible errors

---

## Testing Checklist

- [ ] Open a new conversation - key is created in `conversation_keys` table
- [ ] Send a message - it encrypts and decrypts successfully
- [ ] Refresh page - key is fetched fresh from DB, not from stale cache
- [ ] Open old conversation with old corrupted messages - they show `[Older encrypted message unavailable]` instead of error
- [ ] Check browser console - logs show which messages failed and why (without error level)
- [ ] Send new message after old messages - new message encrypts/decrypts successfully
- [ ] Conversation doesn't freeze or break when displaying mixed old/new messages
