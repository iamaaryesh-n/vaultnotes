// utils/encryption.js

// Convert ArrayBuffer to Base64
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

// Convert Base64 to ArrayBuffer
function base64ToBuffer(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
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
  const raw = await crypto.subtle.exportKey("raw", key)
  return bufferToBase64(raw)
}

// Import key from Base64
export async function importKey(base64Key) {
  const raw = base64ToBuffer(base64Key)
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  )
}

// Encrypt text
export async function encrypt(text, key) {
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

  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv),
  }
}

// Decrypt text
export async function decrypt(ciphertext, ivBase64, key) {
  const decoder = new TextDecoder()

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBuffer(ivBase64),
    },
    key,
    base64ToBuffer(ciphertext)
  )

  return decoder.decode(decrypted)
}