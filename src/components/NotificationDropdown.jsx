import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { motion } from "framer-motion"

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

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((notif) => !notif.is_read).map((notif) => notif.id)
    if (unreadIds.length === 0) return
    await onMarkAsRead(unreadIds)
  }

  if (!isOpen) {
    return null
  }

  return (
    <motion.div
      ref={dropdownRef}
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-[16px] border border-[var(--overlay-border)] bg-[var(--overlay-surface)] shadow-[var(--overlay-shadow)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--overlay-border)] px-4 pb-[10px] pt-[14px]">
        <h3 className="font-['Sora'] text-[14px] font-bold text-[var(--overlay-text)]">Notifications</h3>
        <button
          type="button"
          onClick={handleMarkAllRead}
          className="text-[11px] font-semibold text-[#F4B400]"
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-[var(--overlay-text-subtle)]">
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
          <div className="px-4 py-8 text-center text-[var(--overlay-text-subtle)]">
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div>
            {notifications.map((notif) => {
              const isInvite = notif.type === "workspace_invite"
              const isRead = notif.is_read || markedIds.includes(notif.id)
              const actionLoading = actionLoadingById[notif.id]

              return (
                <div
                  key={notif.id}
                  className={`w-full border-b border-[var(--overlay-border)] px-4 py-[11px] text-left transition-colors duration-150 ${
                    isRead ? "bg-transparent" : "bg-[rgba(244,180,0,0.08)]"
                  } ${!isInvite ? "hover:bg-[var(--overlay-hover)]" : ""}`}
                >
                  <div className="flex gap-3">
                    {notif.actor?.avatar_url ? (
                      <img
                        src={notif.actor.avatar_url}
                        alt={notif.actor.username}
                        className="h-[38px] w-[38px] flex-shrink-0 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] font-['Sora'] text-[13px] font-bold text-[var(--chat-accent)]">
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
                        <p className="truncate text-[12px] text-[var(--overlay-text-subtle)]"><span className="font-semibold text-[var(--overlay-text)]">{notif.actor?.username || "User"}</span> {getNotificationText(notif).replace(`${notif.actor?.username || "User"} `, "")}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--overlay-text-muted)]">{formatTime(notif.created_at)}</p>
                      </button>

                      {isInvite && !isRead && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleInviteAction(notif, "accept")}
                            disabled={Boolean(actionLoading)}
                            className="flex-1 rounded-[8px] bg-[#F4B400] py-[7px] text-[12px] font-bold text-[var(--profile-on-accent)] transition-colors hover:bg-[#C49000] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoading === "accept" ? "Accepting..." : "Accept"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInviteAction(notif, "decline")}
                            disabled={Boolean(actionLoading)}
                            className="flex-1 rounded-[8px] border border-[var(--overlay-border-strong)] bg-[var(--overlay-elev)] py-[7px] text-[12px] font-semibold text-[var(--overlay-text-subtle)] transition-colors hover:border-[#EF4444] hover:text-[#EF4444] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoading === "decline" ? "Declining..." : "Decline"}
                          </button>
                        </div>
                      )}
                    </div>

                    {!isRead && <div className="mt-[6px] h-[7px] w-[7px] flex-shrink-0 rounded-full bg-[#F4B400]" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="border-t border-[var(--overlay-border)] py-[10px] text-center">
          <button
            onClick={() => {
              navigate("/notifications")
              onClose()
            }}
            className="text-[12px] font-semibold text-[#F4B400]"
          >
            View all notifications
          </button>
        </div>
      )}
    </motion.div>
  )
}
