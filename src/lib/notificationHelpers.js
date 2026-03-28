import { supabase } from "./supabase"

/**
 * Create a notification for a user
 */
export async function createNotification({
  recipientId,
  actorId,
  type, // 'like', 'comment', 'follow'
  postId = null,
  commentId = null
}) {
  if (!recipientId || !actorId || !type) {
    console.error("[notificationHelpers] Missing required fields for notification")
    return false
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .insert({
        recipient_id: recipientId,
        actor_id: actorId,
        type,
        post_id: postId,
        comment_id: commentId,
        is_read: false,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error("[notificationHelpers] Error creating notification:", error)
      return false
    }

    console.log("[notificationHelpers] Notification created:", type)
    return true
  } catch (err) {
    console.error("[notificationHelpers] Exception creating notification:", err)
    return false
  }
}

/**
 * Mark notifications as read
 */
export async function markNotificationsAsRead(notificationIds) {
  if (!notificationIds || notificationIds.length === 0) {
    return true
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", notificationIds)

    if (error) {
      console.error("[notificationHelpers] Error marking as read:", error)
      return false
    }

    return true
  } catch (err) {
    console.error("[notificationHelpers] Exception marking as read:", err)
    return false
  }
}
