import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { useToast } from '../hooks/useToast'
import { supabase } from '../lib/supabase'

/**
 * Full-page notifications view
 * Shows all user's notifications with filtering and navigation
 */
export function Notifications() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { notifications: dropdownNotifications, loading: dropdownLoading, refetch, markAsRead: hookMarkAsRead } = useNotifications()
  
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'unread'
  const [markingAsRead, setMarkingAsRead] = useState(false)

  // Use dropdown notifications if available, otherwise fetch separately
  useEffect(() => {
    if (dropdownNotifications && dropdownNotifications.length > 0) {
      console.log('[Notifications page] Using dropdown notifications')
      setNotifications(dropdownNotifications)
      setLoading(false)
    } else if (!dropdownLoading) {
      // If no dropdown notifications and not loading, fetch all
      fetchAllNotifications()
    }
  }, [dropdownNotifications, dropdownLoading])

  const fetchAllNotifications = async () => {
    try {
      setLoading(true)

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        navigate('/login')
        return
      }

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          recipient_id,
          actor_id,
          type,
          post_id,
          comment_id,
          is_read,
          created_at,
          profiles:actor_id (
            username,
            avatar_url,
            name
          )
        `)
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching notifications:', error)
        addToast('Failed to load notifications', 'error')
        return
      }

      // Transform data
      const transformed = (data || []).map(notif => ({
        ...notif,
        actor: Array.isArray(notif.profiles) ? notif.profiles[0] : notif.profiles,
      }))

      setNotifications(transformed)
    } catch (err) {
      console.error('Exception fetching notifications:', err)
      addToast('Error loading notifications', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Mark all unread as read
  const handleMarkAllAsRead = useCallback(async () => {
    try {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
      
      if (unreadIds.length === 0) {
        addToast('All notifications already read', 'info')
        return
      }

      setMarkingAsRead(true)

      // Use hook's markAsRead function
      const success = await hookMarkAsRead(unreadIds)

      if (!success) {
        addToast('Failed to mark as read', 'error')
        return
      }

      // Update local state
      setNotifications(prev =>
        prev.map(notif =>
          unreadIds.includes(notif.id) ? { ...notif, is_read: true } : notif
        )
      )

      addToast('Marked all as read', 'success')
    } catch (err) {
      console.error('Exception marking all as read:', err)
      addToast('Error marking as read', 'error')
    } finally {
      setMarkingAsRead(false)
    }
  }, [notifications, hookMarkAsRead, addToast])

  // Filter notifications
  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications

  // Navigation helper
  const handleNotificationClick = (notif) => {
    switch (notif.type) {
      case "follow":
        navigate(`/profile/${notif.actor?.username}`)
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

  // Format time relative to now
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

  // Get notification icon
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

  // Get notification text
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

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <button
              onClick={() => navigate(-1)}
              className="text-gray-600 hover:text-gray-900 transition-colors"
              aria-label="Go back"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Filter and Actions */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  filter === 'unread'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={markingAsRead}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {markingAsRead ? 'Marking...' : 'Mark all as read'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white rounded-lg p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="flex-1">
                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-2 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <div className="text-4xl mb-3">📭</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
            </h3>
            <p className="text-gray-600">
              {filter === 'unread'
                ? 'You have read all your notifications.'
                : 'You will see activity from other users here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md ${
                  notif.is_read
                    ? 'bg-white border-gray-200 hover:border-yellow-300'
                    : 'bg-yellow-50 border-yellow-200 hover:border-yellow-400'
                }`}
              >
                <div className="flex gap-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {notif.actor?.avatar_url ? (
                      <img
                        src={notif.actor.avatar_url}
                        alt={notif.actor.username}
                        className="w-12 h-12 rounded-full object-cover border-2 border-yellow-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-100 flex items-center justify-center text-lg font-semibold text-yellow-700 border-2 border-yellow-200">
                        {notif.actor?.username?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className={`text-sm ${notif.is_read ? 'text-gray-900' : 'font-semibold text-gray-900'}`}>
                          {getNotificationText(notif)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTime(notif.created_at)}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-lg">
                        {getNotificationIcon(notif.type)}
                      </div>
                    </div>
                  </div>

                  {/* Unread Indicator */}
                  {!notif.is_read && (
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-yellow-500 mt-2" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
