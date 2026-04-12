import { supabase } from "./supabase"
import { createNotification } from "./notificationHelpers"

/**
 * Check if current user follows another user
 */
export const isUserFollowing = async (followerId, followingId) => {
  if (!followerId || !followingId) return false

  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .single()

  if (error && error.code !== "PGRST116") {
    console.error("[FollowsLib] Error checking follow status:", error)
    return false
  }

  return !!data?.id
}

/**
 * Follow a user
 */
export const followUser = async (followerId, followingId) => {
  if (!followerId || !followingId) {
    return { success: false, error: "Missing user IDs" }
  }

  if (followerId === followingId) {
    return { success: false, error: "Cannot follow yourself" }
  }

  try {
    const { error } = await supabase
      .from("follows")
      .insert({
        follower_id: followerId,
        following_id: followingId
      })

    if (error) {
      console.error("[FollowsLib] Error following user:", error)
      return { success: false, error: error.message }
    }

    // Best-effort notification: do not fail follow if notification insert fails.
    await createNotification({
      recipientId: followingId,
      actorId: followerId,
      type: "follow"
    })

    return { success: true }
  } catch (err) {
    console.error("[FollowsLib] Exception following user:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Unfollow a user
 */
export const unfollowUser = async (followerId, followingId) => {
  if (!followerId || !followingId) {
    return { success: false, error: "Missing user IDs" }
  }

  try {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId)

    if (error) {
      console.error("[FollowsLib] Error unfollowing user:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error("[FollowsLib] Exception unfollowing user:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Get follower count for a user
 */
export const getFollowerCount = async (userId) => {
  if (!userId) return 0

  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId)

  if (error) {
    console.error("[FollowsLib] Error getting follower count:", error)
    return 0
  }

  return count || 0
}

/**
 * Get following count for a user
 */
export const getFollowingCount = async (userId) => {
  if (!userId) return 0

  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId)

  if (error) {
    console.error("[FollowsLib] Error getting following count:", error)
    return 0
  }

  return count || 0
}

/**
 * Get list of followers for a user
 */
export const getFollowers = async (userId) => {
  if (!userId) return []

  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, profiles:follower_id(id, username, name, avatar_url)")
    .eq("following_id", userId)

  if (error) {
    console.error("[FollowsLib] Error getting followers:", error)
    return []
  }

  return data || []
}

/**
 * Get list of users that a user is following
 */
export const getFollowing = async (userId) => {
  if (!userId) return []

  const { data, error } = await supabase
    .from("follows")
    .select("following_id, profiles:following_id(id, username, name, avatar_url)")
    .eq("follower_id", userId)

  if (error) {
    console.error("[FollowsLib] Error getting following:", error)
    return []
  }

  return data || []
}
