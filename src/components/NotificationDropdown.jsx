import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"

export function NotificationDropdown({ notifications, loading, unreadCount, onMarkAsRead, isOpen, onClose }) {
  const navigate = useNavigate()
  const dropdownRef = useRef(null)
  const [markedIds, setMarkedIds] = useState([])
  const [actionLoadingById, setActionLoadingById] = useState({})

  const autoMarkUnreadIds = notifications
    .filter((n) => !n.is_read && n.type !== "workspace_invite")
    .map((n) => n.id)

  useEffect(() => {
    const handleMarkAsRead = async () => {
      if (!isOpen) return

      if (autoMarkUnreadIds.length > 0 && markedIds.length === 0) {
        const success = await onMarkAsRead(autoMarkUnreadIds)
        if (success) {
          setMarkedIds(autoMarkUnreadIds)
        }
      }
    }

    handleMarkAsRead()
  }, [isOpen, autoMarkUnreadIds, onMarkAsRead, markedIds.length])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setMarkedIds([])
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, onClose])

  const getNotificationIcon = (type) => {
    switch (type) {
      case "like":
        return "<3"
      case "comment":
        return ".."
      case "follow":
        return "@"
      case "workspace_invite":
        return "+"
      default:
        return "!"
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

  const formatTime = (created_at) => {
    const date = new Date(created_at)
    const now = new Date()
    const seconds = Math.floor((now - date) / 1000)

    if (seconds < 60) return "just now"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

    return date.toLocaleDateString()
  }

  const markNotificationRead = async (notificationId, recipientId) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("recipient_id", recipientId)

    if (!error) {
      setMarkedIds((prev) => (prev.includes(notificationId) ? prev : [...prev, notificationId]))
    }

    return error
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
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error("[NotificationDropdown] Invite action auth error:", authError)
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
        console.error("[NotificationDropdown] Invite fetch error:", inviteFetchError)
        return
      }

      if (!invite?.id) {
        await markNotificationRead(notif.id, user.id)
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
          console.error("[NotificationDropdown] Membership insert error:", insertMemberError)
          return
        }

        // Step 2: Setup encryption key for user
        const keyError = await ensureWorkspaceKeyForUser(notif.workspace_id, user.id)
        if (keyError) {
          console.error("[NotificationDropdown] Workspace key setup error:", keyError)
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
          console.error("[NotificationDropdown] Invite accept error:", acceptError)
          return
        }

        await markNotificationRead(notif.id, user.id)
        
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
        navigate(`/workspace/${notif.workspace_id}`)
        onClose()
        return
      }

      const { error: declineError } = await supabase
        .from("workspace_invites")
        .update({
          status: "declined",
          responded_at: new Date().toISOString(),
        })
        .eq("id", invite.id)

      if (declineError) {
        console.error("[NotificationDropdown] Invite decline error:", declineError)
        return
      }

      await markNotificationRead(notif.id, user.id)
      
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
    } catch (error) {
      console.error("[NotificationDropdown] Invite action failed:", error)
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

    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg animate-fadeIn z-50"
    >
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-slate-500">
            <svg className="m-auto h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500">
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notif) => {
              const isInvite = notif.type === "workspace_invite"
              const isRead = notif.is_read || markedIds.includes(notif.id)
              const actionLoading = actionLoadingById[notif.id]

              return (
                <div
                  key={notif.id}
                  className={`w-full px-4 py-3 text-left transition-colors duration-150 ${
                    isRead ? "bg-white" : "bg-yellow-50"
                  } ${!isInvite ? "hover:bg-gray-50" : ""}`}
                >
                  <div className="flex gap-3">
                    {notif.actor?.avatar_url ? (
                      <img
                        src={notif.actor.avatar_url}
                        alt={notif.actor.username}
                        className="h-8 w-8 flex-shrink-0 rounded-full border border-yellow-200 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-yellow-300 bg-gradient-to-br from-yellow-200 to-yellow-100 text-xs font-semibold text-yellow-700">
                        {notif.actor?.username?.charAt(0).toUpperCase() || getNotificationIcon(notif.type)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => !isInvite && handleNotificationClick(notif)}
                        disabled={isInvite}
                        className={`w-full text-left ${isInvite ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <p className="truncate text-xs text-gray-900">{getNotificationText(notif)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{formatTime(notif.created_at)}</p>
                      </button>

                      {isInvite && !isRead && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleInviteAction(notif, "accept")}
                            disabled={Boolean(actionLoading)}
                            className="min-h-9 rounded-md bg-yellow-500 px-3 text-xs font-semibold text-gray-900 hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoading === "accept" ? "Accepting..." : "Accept"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInviteAction(notif, "decline")}
                            disabled={Boolean(actionLoading)}
                            className="min-h-9 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoading === "decline" ? "Declining..." : "Decline"}
                          </button>
                        </div>
                      )}
                    </div>

                    {!isRead && <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500"></div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2">
          <button
            onClick={() => {
              navigate("/notifications")
              onClose()
            }}
            className="text-xs font-medium text-yellow-600 hover:text-yellow-700"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}
