import CryptoJS from "crypto-js"

// Generate random Data Encryption Key (DEK)
export function generateDEK() {
  return CryptoJS.lib.WordArray.random(32).toString()
}

// Derive stable recovery key from user ID
export function deriveRecoveryKey(userId) {
  return CryptoJS.SHA256(userId + "vaultnotes-secret-salt").toString()
}