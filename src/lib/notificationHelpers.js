import { supabase } from "./supabase"
import { dispatchPushNotification } from "./pushNotifications"

function isValidUuid(value) {
  if (typeof value !== "string") {
    return false
  }

  const uuid = value.trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
}

/**
 * Create a notification for a user
 */
export async function createNotification({
  recipientId,
  actorId,
  type, // 'like', 'comment', 'follow'
  postId = null,
  commentId = null,
  workspaceId = null,
  message = null,
  route = null
}) {
  if (!recipientId || !actorId || !type) {
    console.error("[notificationHelpers] Missing required fields for notification")
    return false
  }

  if (recipientId === actorId) {
    return true
  }

  try {
    const payload = {
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      is_read: false
    }

    if (isValidUuid(postId)) {
      payload.post_id = postId
    }

    if (isValidUuid(commentId)) {
      payload.comment_id = commentId
    }

    if (isValidUuid(workspaceId)) {
      payload.workspace_id = workspaceId
    }

    if (typeof message === "string" && message.trim()) {
      payload.message = message
    }

    const { error } = await supabase
      .from("notifications")
      .insert(payload)

    if (error) {
      console.log(error.message, error.details, error.code)
      console.error("[notificationHelpers] Error creating notification:", error)
      return false
    }

    const pushTitles = {
      like: "New like",
      comment: "New comment",
      follow: "New follower",
    }

    const pushBodies = {
      like: "Someone liked your post",
      comment: "Someone commented on your post",
      follow: "Someone started following you",
    }

    await dispatchPushNotification({
      recipientId,
      actorId,
      title: pushTitles[type] || "New notification",
      body: message || pushBodies[type] || "You have a new notification",
      route: route || ((type === "like" || type === "comment") && postId ? `/explore?postId=${postId}` : null),
      data: {
        type,
        recipient_id: recipientId,
        actor_id: actorId,
        post_id: postId,
        comment_id: commentId,
        workspace_id: workspaceId,
      },
    })

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
