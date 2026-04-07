import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useNotifications } from "../hooks/useNotifications"
import { useToast } from "../hooks/useToast"
import { NotificationListSkeleton } from "../components/SkeletonLoader"
import { supabase } from "../lib/supabase"

export function Notifications() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const {
    notifications: dropdownNotifications,
    loading: dropdownLoading,
    markAsRead: hookMarkAsRead
  } = useNotifications()

  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [markingAsRead, setMarkingAsRead] = useState(false)
  const [actionLoadingById, setActionLoadingById] = useState({})

  useEffect(() => {
    if (dropdownNotifications && dropdownNotifications.length > 0) {
      setNotifications(dropdownNotifications)
      setLoading(false)
    } else if (!dropdownLoading) {
      fetchAllNotifications()
    }
  }, [dropdownNotifications, dropdownLoading])

  const fetchAllNotifications = async () => {
    try {
      setLoading(true)

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser()

      if (authError || !user) {
        navigate("/login")
        return
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(`
          id,
          recipient_id,
          actor_id,
          type,
          post_id,
          comment_id,
          workspace_id,
          is_read,
          created_at,
          profiles:actor_id (
            username,
            avatar_url,
            name
          )
        `)
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })

      if (error) {
        addToast("Failed to load notifications", "error")
        return
      }

      const transformed = (data || []).map((notif) => ({
        ...notif,
        actor: Array.isArray(notif.profiles) ? notif.profiles[0] : notif.profiles
      }))

      setNotifications(transformed)
    } catch (err) {
      addToast("Error loading notifications", "error")
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
      if (unreadIds.length === 0) {
        addToast("All notifications already read", "info")
        return
      }

      setMarkingAsRead(true)
      const success = await hookMarkAsRead(unreadIds)
      if (!success) {
        addToast("Failed to mark as read", "error")
        return
      }

      setNotifications((prev) =>
        prev.map((notif) => (unreadIds.includes(notif.id) ? { ...notif, is_read: true } : notif))
      )
      addToast("Marked all as read", "success")
    } catch (err) {
      addToast("Error marking as read", "error")
    } finally {
      setMarkingAsRead(false)
    }
  }, [notifications, hookMarkAsRead, addToast])

  const markNotificationRead = async (notificationId, recipientId) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("recipient_id", recipientId)

    return !error
  }

  const ensureWorkspaceKeyForUser = async (workspaceId, userId) => {
    const { data: sourceKey, error: sourceKeyError } = await supabase
      .from("workspace_keys")
      .select("encrypted_key")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (sourceKeyError || !sourceKey?.encrypted_key) {
      return sourceKeyError || new Error("Missing workspace key")
    }

    const { data: existingUserKey, error: existingUserKeyError } = await supabase
      .from("workspace_keys")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle()

    if (existingUserKeyError) {
      return existingUserKeyError
    }

    if (existingUserKey?.id) {
      const { error: updateKeyError } = await supabase
        .from("workspace_keys")
        .update({ encrypted_key: sourceKey.encrypted_key })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)

      return updateKeyError || null
    }

    const { error: insertKeyError } = await supabase
      .from("workspace_keys")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        encrypted_key: sourceKey.encrypted_key,
      })

    if (insertKeyError?.code === "23505") {
      const { error: recoverUpdateError } = await supabase
        .from("workspace_keys")
        .update({ encrypted_key: sourceKey.encrypted_key })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
      return recoverUpdateError || null
    }

    return insertKeyError || null
  }

  const handleInviteAction = async (notif, action) => {
    if (!notif.workspace_id || !notif.actor_id) return

    setActionLoadingById((prev) => ({ ...prev, [notif.id]: action }))

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error("[Notifications] Invite action auth error:", authError)
        addToast("Authentication error", "error")
        return
      }

      const { data: invite, error: inviteFetchError } = await supabase
        .from("workspace_invites")
        .select("id, inviter_id")
        .eq("workspace_id", notif.workspace_id)
        .eq("invitee_id", user.id)
        .eq("inviter_id", notif.actor_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (inviteFetchError) {
        console.error("[Notifications] Invite fetch error:", inviteFetchError)
        addToast("Failed to fetch invite", "error")
        return
      }

      if (!invite?.id) {
        await markNotificationRead(notif.id, user.id)
        addToast("Invite not found", "error")
        return
      }

      if (action === "accept") {
        // Step 1: Insert user into workspace_members FIRST
        const { error: insertMemberError } = await supabase
          .from("workspace_members")
          .insert({
            workspace_id: notif.workspace_id,
            user_id: user.id,
            role: "viewer"
          })

        if (insertMemberError && insertMemberError.code !== "23505") {
          console.error("[Notifications] Membership insert error:", insertMemberError)
          addToast("Failed to join workspace", "error")
          return
        }

        // Step 2: Setup encryption key for user
        const keyError = await ensureWorkspaceKeyForUser(notif.workspace_id, user.id)
        if (keyError) {
          console.error("[Notifications] Workspace key setup error:", keyError)
          addToast("Encryption key setup failed", "error")
          return
        }

        // Step 3: ONLY NOW update invite status to accepted
        const { error: acceptError } = await supabase
          .from("workspace_invites")
          .update({
            status: "accepted",
            responded_at: new Date().toISOString(),
          })
          .eq("id", invite.id)

        if (acceptError) {
          console.error("[Notifications] Invite accept error:", acceptError)
          addToast("Failed to accept invite", "error")
          return
        }

        await markNotificationRead(notif.id, user.id)
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        )
        
        // Broadcast to sender that invite was accepted
        const acceptEvent = new CustomEvent("inviteAccepted", {
          detail: {
            workspaceId: notif.workspace_id,
            userId: user.id,
            username: user.user_metadata?.username || "User",
            invitedBy: notif.actor_id
          }
        })
        window.dispatchEvent(acceptEvent)
        
        // Also dispatch membership changed for other listeners
        window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId: notif.workspace_id } }))
        addToast("Invite accepted!", "success")
        return
      }

      // Decline
      const { error: declineError } = await supabase
        .from("workspace_invites")
        .update({
          status: "declined",
          responded_at: new Date().toISOString(),
        })
        .eq("id", invite.id)

      if (declineError) {
        console.error("[Notifications] Invite decline error:", declineError)
        addToast("Failed to decline invite", "error")
        return
      }

      await markNotificationRead(notif.id, user.id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      )
      
      // Broadcast to sender that invite was declined
      const declineEvent = new CustomEvent("inviteDeclined", {
        detail: {
          workspaceId: notif.workspace_id,
          userId: user.id,
          username: user.user_metadata?.username || "User",
          invitedBy: notif.actor_id
        }
      })
      window.dispatchEvent(declineEvent)
      addToast("Invite declined", "success")
    } catch (error) {
      console.error("[Notifications] Invite action failed:", error)
      addToast("Action failed", "error")
    } finally {
      setActionLoadingById((prev) => {
        const next = { ...prev }
        delete next[notif.id]
        return next
      })
    }
  }

  const handleNotificationClick = (notif) => {
    switch (notif.type) {
      case "follow":
        navigate(`/profile/${notif.actor?.username}`)
        break
      case "workspace_invite":
        if (notif.workspace_id) {
          navigate(`/workspace/${notif.workspace_id}`)
        } else {
          navigate("/workspaces")
        }
        break
      case "like":
      case "comment":
        if (notif.post_id) {
          navigate(`/explore?postId=${notif.post_id}`)
          setTimeout(() => {
            const postElement = document.querySelector(`[data-post-id="${notif.post_id}"]`)
            if (postElement) {
              postElement.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          }, 100)
        }
        break
      default:
        break
    }
  }

  const formatTime = (created_at) => {
    const date = new Date(created_at)
    const now = new Date()
    const seconds = Math.floor((now - date) / 1000)

    if (seconds < 60) return "just now"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`
    return date.toLocaleDateString()
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case "like":
        return "❤️"
      case "comment":
        return "💬"
      case "follow":
        return "👤"
      case "workspace_invite":
        return "👥"
      default:
        return "📢"
    }
  }

  const getNotificationText = (notif) => {
    const actor = notif.actor?.username || "User"

    if (notif.type === "workspace_invite") {
      return `${actor} invited you to workspace`
    }

    switch (notif.type) {
      case "like":
        return `${actor} liked your post`
      case "comment":
        return `${actor} commented on your post`
      case "follow":
        return `${actor} started following you`
      default:
        return `${actor} interacted with you`
    }
  }

  const filteredNotifications = filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications
  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-gray-50">
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <button
              onClick={() => navigate(-1)}
              className="text-gray-600 transition-colors hover:text-gray-900"
              aria-label="Go back"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  filter === "all" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  filter === "unread"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-xs text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={markingAsRead}
                className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-yellow-600 disabled:bg-gray-300"
              >
                {markingAsRead ? "Marking..." : "Mark all as read"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {loading ? (
          <NotificationListSkeleton />
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center">
            <div className="mb-3 text-4xl">📭</div>
            <h3 className="mb-1 text-lg font-semibold text-gray-900">
              {filter === "unread" ? "All caught up!" : "No notifications yet"}
            </h3>
            <p className="text-gray-600">
              {filter === "unread" ? "You have read all your notifications." : "You will see activity here."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notif) => {
              const isInvite = notif.type === "workspace_invite"
              const actionLoading = actionLoadingById[notif.id]

              return (
                <div
                  key={notif.id}
                  className={`rounded-lg border-2 p-4 transition-all duration-200 ${
                    notif.is_read ? "border-gray-200 bg-white" : "border-yellow-200 bg-yellow-50"
                  }`}
                >
                  <button
                    onClick={() => !isInvite && handleNotificationClick(notif)}
                    disabled={isInvite}
                    className={`w-full text-left transition-colors ${isInvite ? "cursor-default" : "cursor-pointer hover:opacity-75"}`}
                  >
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        {notif.actor?.avatar_url ? (
                          <img
                            src={notif.actor.avatar_url}
                            alt={notif.actor.username}
                            loading="lazy"
                            className="h-12 w-12 rounded-full border-2 border-yellow-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-yellow-200 bg-gradient-to-br from-yellow-300 to-yellow-100 text-lg font-semibold text-yellow-700">
                            {notif.actor?.username?.charAt(0).toUpperCase() || "?"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className={`text-sm ${notif.is_read ? "text-gray-900" : "font-semibold text-gray-900"}`}>
                              {getNotificationText(notif)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">{formatTime(notif.created_at)}</p>
                          </div>
                          <div className="flex-shrink-0 text-lg">{getNotificationIcon(notif.type)}</div>
                        </div>
                      </div>

                      {!notif.is_read && <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />}
                    </div>
                  </button>

                  {isInvite && !notif.is_read && (
                    <div className="mt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleInviteAction(notif, "accept")}
                        disabled={Boolean(actionLoading)}
                        className="flex-1 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                      >
                        {actionLoading === "accept" ? "Accepting..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInviteAction(notif, "decline")}
                        disabled={Boolean(actionLoading)}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                      >
                        {actionLoading === "decline" ? "Declining..." : "Decline"}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
