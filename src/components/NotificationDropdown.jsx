import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

export function NotificationDropdown({ notifications, loading, unreadCount, onMarkAsRead, isOpen, onClose }) {
  const navigate = useNavigate()
  const dropdownRef = useRef(null)
  const [markedIds, setMarkedIds] = useState([])

  // Get unread notification IDs
  const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)

  // Mark all as read when dropdown opens
  useEffect(() => {
    const handleMarkAsRead = async () => {
      if (isOpen) {
        console.log('[NotificationDropdown] ⏱️ Dropdown opened')
        console.log('[NotificationDropdown] Unread notifications count:', unreadIds.length)
        console.log('[NotificationDropdown] Unread notification IDs:', unreadIds)
        
        if (unreadIds.length > 0 && markedIds.length === 0) {
          console.log('[NotificationDropdown] 📤 Calling markAsRead function...')
          const success = await onMarkAsRead(unreadIds)
          if (success) {
            console.log('[NotificationDropdown] ✅ Successfully marked as read')
            setMarkedIds(unreadIds)
          } else {
            console.warn('[NotificationDropdown] ❌ Failed to mark as read')
          }
        } else {
          if (unreadIds.length === 0) {
            console.log('[NotificationDropdown] ℹ️ No unread notifications to mark')
          }
          if (markedIds.length > 0) {
            console.log('[NotificationDropdown] ℹ️ Already marked in this session')
          }
        }
      } else {
        console.log('[NotificationDropdown] Dropdown closed')
      }
    }
    handleMarkAsRead()
  }, [isOpen, unreadIds, onMarkAsRead, markedIds.length])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        console.log('[NotificationDropdown] Closing dropdown')
        setMarkedIds([]) // Reset marked IDs when closing
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
        return "❤️"
      case "comment":
        return "💬"
      case "follow":
        return "👤"
      default:
        return "📢"
    }
  }

  const getNotificationText = (notif) => {
    const actor = notif.actor?.username || "User"
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

  const handleNotificationClick = (notif) => {
    switch (notif.type) {
      case "follow":
        // Navigate to follower's profile
        navigate(`/profile/${notif.actor?.username}`)
        break
      case "like":
      case "comment":
        // Navigate to post
        if (notif.post_id) {
          navigate(`/explore?postId=${notif.post_id}`)
          // Add a small delay to allow navigation, then scroll to post
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
      className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-fadeIn z-50"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
      </div>

      {/* Notifications List */}
      <div className="overflow-y-auto max-h-96">
        {loading ? (
          <div className="px-4 py-8 text-center text-slate-500">
            <svg
              className="animate-spin h-5 w-5 m-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
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
            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors duration-150 ${
                  notif.is_read ? "bg-white" : "bg-yellow-50"
                }`}
              >
                <div className="flex gap-3">
                  {/* Actor Avatar */}
                  {notif.actor?.avatar_url ? (
                    <img
                      src={notif.actor.avatar_url}
                      alt={notif.actor.username}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-yellow-200"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-200 to-yellow-100 flex items-center justify-center text-xs font-semibold text-yellow-700 border border-yellow-300 flex-shrink-0">
                      {notif.actor?.username?.charAt(0).toUpperCase() || "?"}
                    </div>
                  )}

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-900 truncate">
                      {getNotificationText(notif)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatTime(notif.created_at)}
                    </p>
                  </div>

                  {/* Unread Indicator */}
                  {!notif.is_read && (
                    <div className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0 mt-2"></div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => {
              navigate('/notifications')
              onClose()
            }}
            className="text-xs text-yellow-600 hover:text-yellow-700 font-medium"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}
