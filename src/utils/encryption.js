// utils/encryption.js

// Convert ArrayBuffer to Base64
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

// Convert Base64 to ArrayBuffer
function base64ToBuffer(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

/**
 * Validate that a key string is valid base64 and correct length (256-bit = 32 bytes = 44 chars in base64)
 * @param {string} base64Key - The key to validate
 * @returns {object} - { isValid: boolean, error?: string, keyLength?: number }
 */
export function validateKey(base64Key) {
  if (!base64Key) {
    return { isValid: false, error: "Key is empty" }
  }

  if (typeof base64Key !== 'string') {
    return { isValid: false, error: `Key must be a string, got ${typeof base64Key}` }
  }

  try {
    // Try to decode the base64
    const decoded = atob(base64Key)
    const keyLength = decoded.length
    
    // 256-bit key = 32 bytes
    if (keyLength !== 32) {
      console.warn(`[validateKey] Key length mismatch: expected 32 bytes, got ${keyLength}`)
      return { isValid: false, error: `Invalid key length: ${keyLength} bytes (expected 32)`, keyLength }
    }

    console.log(`[validateKey] ✅ Key is valid (${keyLength} bytes, ${base64Key.length} base64 chars)`)
    return { isValid: true, keyLength }
  } catch (err) {
    return { isValid: false, error: `Key is not valid base64: ${err.message}` }
  }
}

/**
 * Debug log key information without exposing the actual key
 * @param {string} base64Key - The key to log info about
 * @param {string} context - Where this key is being used (e.g., "MemoryView")
 */
export function debugLogKey(base64Key, context = "unknown") {
  const validation = validateKey(base64Key)
  if (validation.isValid) {
    console.log(`[${context}] Key: format=base64, length=${validation.keyLength} bytes (${base64Key.length} chars)`)
  } else {
    console.error(`[${context}] Invalid key: ${validation.error}`)
  }
}

// Generate random 256-bit key
export async function generateKey() {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  )
}

// Export key to Base64 (for storing in localStorage temporarily)
export async function exportKey(key) {
  try {
    const raw = await crypto.subtle.exportKey("raw", key)
    const base64Key = bufferToBase64(raw)
    console.log(`[exportKey] Exported key: ${base64Key.length} base64 chars (32 bytes)`)
    return base64Key
  } catch (err) {
    console.error("[exportKey] Failed to export key:", err)
    throw new Error(`Failed to export encryption key: ${err.message}`)
  }
}

// Import key from Base64
export async function importKey(base64Key) {
  try {
    // Validate before importing
    const validation = validateKey(base64Key)
    if (!validation.isValid) {
      throw new Error(validation.error)
    }

    const raw = base64ToBuffer(base64Key)
    const importedKey = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    )
    console.log("[importKey] ✅ Successfully imported 256-bit AES-GCM key")
    return importedKey
  } catch (err) {
    console.error("[importKey] Failed to import key:", err)
    throw new Error(`Failed to import encryption key: ${err.message}`)
  }
}

// Encrypt text
export async function encrypt(text, key) {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)

    const iv = crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      data
    )

    const ciphertext = bufferToBase64(encrypted)
    const ivBase64 = bufferToBase64(iv)
    
    console.log(`[encrypt] Encrypted ${data.length} bytes -> ${ciphertext.length} chars, IV: ${ivBase64.length} chars`)
    return {
      ciphertext: ciphertext,
      iv: ivBase64,
    }
  } catch (err) {
    console.error("[encrypt] Encryption failed:", err)
    throw new Error(`Encryption failed: ${err.message}`)
  }
}

// Decrypt text
export async function decrypt(ciphertext, ivBase64, key) {
  try {
    if (!ciphertext || !ivBase64) {
      throw new Error("Missing ciphertext or IV")
    }

    const decoder = new TextDecoder()

    console.log(`[decrypt] Attempting to decrypt ${ciphertext.length} chars with IV ${ivBase64.length} chars`)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBuffer(ivBase64),
      },
      key,
      base64ToBuffer(ciphertext)
    )

    const decryptedText = decoder.decode(decrypted)
    console.log(`[decrypt] ✅ Successfully decrypted to ${decryptedText.length} characters`)
    return decryptedText
  } catch (err) {
    console.error("[decrypt] Decryption failed:", err)
    throw new Error(`Decryption failed - Invalid encryption key or corrupted data: ${err.message}`)
  }
}