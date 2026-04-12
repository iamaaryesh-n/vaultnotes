/* Firebase messaging service worker for VaultNotes PWA background notifications */

const APP_BASE_URL = self.location.origin

function buildTargetUrl(data = {}) {
  if (data.route) {
    return data.route
  }

  if (data.deep_link) {
    return data.deep_link
  }

  const type = data.type || ""

  if ((type === "like" || type === "comment") && data.post_id) {
    return `/explore?postId=${encodeURIComponent(data.post_id)}`
  }

  if (type === "follow" && data.actor_username) {
    return `/profile/${encodeURIComponent(data.actor_username)}`
  }

  if (type === "message") {
    if (data.conversation_id) {
      return `/chat/direct/${encodeURIComponent(data.conversation_id)}`
    }
    return "/chat"
  }

  return "/notifications"
}

function toAbsoluteUrl(pathOrUrl) {
  try {
    return new URL(pathOrUrl, APP_BASE_URL).toString()
  } catch (_error) {
    return APP_BASE_URL
  }
}

self.addEventListener("push", (event) => {
  let payload = {}

  try {
    payload = event.data ? event.data.json() : {}
  } catch (_error) {
    payload = {}
  }

  const data = payload.data || {}
  const conversationId = data.conversationId || data.conversation_id || null
  const notificationId = data.notificationId || data.notification_id || null
  const title = data.senderName || data.sender_name || payload.notification?.title || data.title || "New message"
  const body = data.messageText || data.message_text || payload.notification?.body || data.body || "You received a new message"
  const targetPath = buildTargetUrl(data)
  const notificationData = {
    ...data,
    conversationId,
    notificationId,
    targetPath,
  }

  const notificationOptions = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag:
      data.conversationId ||
      data.notificationId ||
      data.conversation_id ||
      data.notification_id ||
      "vaultnotes-message",
    renotify: true,
    actions: [
      { action: "open_chat", title: "Open" },
      { action: "mark_read", title: "Mark as read" },
    ],
    data: notificationData,
  }

  event.waitUntil(self.registration.showNotification(title, notificationOptions))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const data = event.notification?.data || {}

  const conversationId =
    data.conversationId ||
    data.conversation_id ||
    null

  const recipientId =
    data.recipientId ||
    data.recipient_id ||
    data.receiver_id ||
    null

  const markReadEndpoint =
    data.markReadEndpoint ||
    data.mark_read_endpoint ||
    null

  const targetPath = data.targetPath || "/chat"

  // MARK AS READ
  if (event.action === "mark_read") {
    event.waitUntil(
      (async () => {
        try {
          if (markReadEndpoint && conversationId && recipientId) {
            await fetch(markReadEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                conversationId,
                recipientId,
              }),
            })
          }

          const clientList = await clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          })

          clientList.forEach((client) => {
            client.postMessage({
              type: "MESSAGE_MARKED_READ",
              conversationId,
            })
          })
        } catch (error) {
          console.error("[SW] mark_read failed", error)
        }
      })()
    )

    return
  }

  // VIEW / BODY CLICK
  const destination = toAbsoluteUrl(
    conversationId
      ? `/chat/direct/${encodeURIComponent(conversationId)}`
      : targetPath
  )

  event.waitUntil(
    clients.openWindow(destination)
  )
  return
})
