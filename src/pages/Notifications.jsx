import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useNotifications } from "../hooks/useNotifications"
import { useToast } from "../hooks/useToast"
import { useRouteScrollRestoration } from "../hooks/useRouteScrollRestoration"
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

  useRouteScrollRestoration("notifications")

  useEffect(() => {
    if (dropdownLoading) {
      return
    }

    if (dropdownNotifications && dropdownNotifications.length > 0) {
      setNotifications(dropdownNotifications)
      setLoading(false)
    } else {
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
          addToast("Failed to join vault", "error")
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
      return `${actor} invited you to vault`
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
    <div className="profile-theme min-h-screen bg-[var(--profile-bg)]">
      <div className="sticky top-[56px] z-40 border-b border-[var(--profile-border)] bg-[color:var(--profile-bg)]/85 backdrop-blur-[16px]">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="font-['Sora'] text-2xl font-bold text-[var(--profile-text)]">Notifications</h1>
            <button
              onClick={() => navigate(-1)}
              className="text-[var(--profile-text-subtle)] transition-colors hover:text-[var(--profile-text)]"
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
                className={`rounded-[20px] px-4 py-[7px] text-[13px] font-semibold transition-all ${
                  filter === "all"
                    ? "bg-[#F4B400] text-[var(--profile-on-accent)] shadow-[0_2px_12px_rgba(244,180,0,0.25)]"
                    : "border border-[var(--profile-border)] bg-[var(--profile-elev)] text-[var(--profile-text-subtle)] hover:border-[var(--profile-border-strong)] hover:text-[var(--profile-text)]"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`flex items-center gap-2 rounded-[20px] px-4 py-[7px] text-[13px] font-semibold transition-all ${
                  filter === "unread"
                    ? "bg-[#F4B400] text-[var(--profile-on-accent)] shadow-[0_2px_12px_rgba(244,180,0,0.25)]"
                    : "border border-[var(--profile-border)] bg-[var(--profile-elev)] text-[var(--profile-text-subtle)] hover:border-[var(--profile-border-strong)] hover:text-[var(--profile-text)]"
                }`}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--profile-surface)] text-[11px] font-bold text-[#F4B400]">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={markingAsRead}
                className="rounded-[10px] bg-[#F4B400] px-4 py-2 text-sm font-semibold text-[var(--profile-on-accent)] transition-colors hover:bg-[#FFD24A] disabled:bg-[var(--profile-text-muted)] disabled:text-[var(--profile-on-accent)]"
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
          <div className="rounded-[14px] border border-[var(--profile-border)] bg-[var(--profile-surface)] p-8 text-center">
            <div className="mb-3 text-4xl">📭</div>
            <h3 className="mb-1 text-lg font-semibold text-[var(--profile-text)]">
              {filter === "unread" ? "All caught up!" : "No notifications yet"}
            </h3>
            <p className="text-[var(--profile-text-subtle)]">
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
                  className={`rounded-[14px] border p-4 transition-all duration-200 ${
                    notif.is_read
                      ? "border-[var(--profile-border)] bg-[var(--profile-surface)]"
                      : "border-[rgba(244,180,0,0.35)] bg-[rgba(244,180,0,0.07)]"
                  }`}
                >
                  <button
                    onClick={() => !isInvite && handleNotificationClick(notif)}
                    disabled={isInvite}
                    className={`w-full text-left transition-colors ${isInvite ? "cursor-default" : "cursor-pointer hover:opacity-85"}`}
                  >
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        {notif.actor?.avatar_url ? (
                          <img
                            src={notif.actor.avatar_url}
                            alt={notif.actor.username}
                            loading="lazy"
                            className="h-12 w-12 rounded-full border border-[var(--profile-border-strong)] object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--profile-border-strong)] bg-[var(--chat-accent-soft)] text-lg font-semibold text-[var(--chat-accent)]">
                            {notif.actor?.username?.charAt(0).toUpperCase() || "?"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className={`text-sm ${notif.is_read ? "text-[var(--profile-text-subtle)]" : "font-semibold text-[var(--profile-text)]"}`}>
                              {getNotificationText(notif)}
                            </p>
                            <p className="mt-1 text-xs text-[var(--profile-text-muted)]">{formatTime(notif.created_at)}</p>
                          </div>
                          <div className="flex-shrink-0 text-lg">{getNotificationIcon(notif.type)}</div>
                        </div>
                      </div>

                      {!notif.is_read && <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-[#F4B400]" />}
                    </div>
                  </button>

                  {isInvite && !notif.is_read && (
                    <div className="mt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleInviteAction(notif, "accept")}
                        disabled={Boolean(actionLoading)}
                        className="flex-1 rounded-[10px] bg-[#F4B400] px-4 py-2 text-sm font-semibold text-[var(--profile-on-accent)] transition-colors hover:bg-[#FFD24A] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading === "accept" ? "Accepting..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInviteAction(notif, "decline")}
                        disabled={Boolean(actionLoading)}
                        className="flex-1 rounded-[10px] border border-[var(--profile-border-strong)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--profile-text-subtle)] transition-colors hover:border-[#F4B400] hover:text-[#F4B400] disabled:cursor-not-allowed disabled:opacity-60"
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
