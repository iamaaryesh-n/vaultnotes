import { supabase } from "../lib/supabase"

/**
 * Generate a signed URL for a private storage image
 * @param {string} storagePath - Path to file in chat-media bucket
 * @param {number} expirySeconds - How long the URL is valid (default 3600 = 1 hour)
 * @returns {Promise<{url: string, expiresAt: number} | null>}
 */
export const getSignedImageUrl = async (storagePath, expirySeconds = 3600) => {
  if (!storagePath) {
    return null
  }

  try {
    const { data, error } = await supabase.storage
      .from("chat-media")
      .createSignedUrl(storagePath, expirySeconds)

    if (error) {
      console.error("[Images] Failed to generate signed URL:", error)
      return null
    }

    // Calculate when this signed URL expires
    const expiresAt = Date.now() + expirySeconds * 1000

    return {
      url: data.signedUrl,
      expiresAt
    }
  } catch (err) {
    console.error("[Images] Exception generating signed URL:", err)
    return null
  }
}

/**
 * Upload image to private chat-media bucket
 * @param {File} file - Image file to upload
 * @param {string} userId - Current user's ID
 * @param {string} conversationId - Conversation ID for organizing uploads
 * @returns {Promise<{storagePath: string} | null>}
 */
export const uploadImageToPrivateStorage = async (file, userId, conversationId) => {
  if (!file || !userId || !conversationId) {
    console.error("[Images] Missing required parameters for upload")
    return null
  }

  try {
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    
    // Create a unique, organized path structure
    const storagePath = `${userId}/${conversationId}/${timestamp}-${random}-${sanitizedName}`

    const { error: uploadError } = await supabase.storage
      .from("chat-media")
      .upload(storagePath, file, {
        cacheControl: "0", // Don't cache private signed URLs
        upsert: false,
        contentType: file.type
      })

    if (uploadError) {
      console.error("[Images] Storage upload failed:", uploadError)
      return null
    }

    console.log(`[Images] Successfully uploaded to private bucket: ${storagePath}`)

    return {
      storagePath
    }
  } catch (err) {
    console.error("[Images] Upload exception:", err)
    return null
  }
}

/**
 * Check if a signed URL is still valid
 * @param {number} expiresAt - Timestamp when URL expires
 * @returns {boolean}
 */
export const isSignedUrlValid = (expiresAt) => {
  if (!expiresAt || typeof expiresAt !== "number") {
    return false
  }

  // Allow 30 second buffer before expiry
  const bufferMs = 30 * 1000
  return Date.now() < expiresAt - bufferMs
}

/**
 * Delete an image from private storage
 * @param {string} storagePath - Path to file in chat-media bucket
 * @returns {Promise<boolean>}
 */
export const deletePrivateImage = async (storagePath) => {
  if (!storagePath) {
    return false
  }

  try {
    const { error } = await supabase.storage
      .from("chat-images")
      .remove([storagePath])

    if (error) {
      console.error("[Images] Failed to delete image:", error)
      return false
    }

    console.log(`[Images] Successfully deleted: ${storagePath}`)
    return true
  } catch (err) {
    console.error("[Images] Delete exception:", err)
    return false
  }
}
