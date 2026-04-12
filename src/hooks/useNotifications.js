import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Cache for notifications to prevent duplicate fetches
const notificationsCache = {
  data: null,
  timestamp: null,
  TTL: 5 * 60 * 1000 // 5 minutes
}

/**
 * Hook to fetch and subscribe to user's notifications
 * Returns notifications list and utilities
 * Uses caching to prevent duplicate fetches
 */
export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const isMountedRef = useRef(true)
  const fetchTimeoutRef = useRef(null)
  const activeSubscriptionRef = useRef(null)
  const subscriptionUserRef = useRef(null)

  useEffect(() => {
    isMountedRef.current = true
    if (user) {
      initializeNotifications()
    } else {
      setLoading(false)
    }

    return () => {
      isMountedRef.current = false
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
      // Cleanup realtime subscription on unmount
      if (activeSubscriptionRef.current) {
        activeSubscriptionRef.current.unsubscribe()
        activeSubscriptionRef.current = null
        subscriptionUserRef.current = null
      }
    }
  }, [user])

  const initializeNotifications = async () => {
    try {
      if (!user) {
        if (isMountedRef.current) setLoading(false)
        return
      }

      // Always fetch fresh data on initialization to ensure we have current state from DB
      // Don't trust cache on first load after refresh
      await fetchNotifications()

      // Subscribe after initial fetch
      subscribeToNotifications()
    } catch (err) {
      console.error('[useNotifications] Exception initializing notifications:', err)
      if (isMountedRef.current) setLoading(false)
    }
  }

  const fetchNotifications = useCallback(
    async () => {
      try {
        if (!isMountedRef.current || !user) return

        setLoading(true)

        // Fetch notifications with explicit field selection
        // IMPORTANT: Using actor:profiles(...) directly to avoid ID corruption
        const { data, error } = await supabase
          .from('notifications')
          .select(`
            id,
            recipient_id,
            actor_id,
            is_read,
            created_at,
            type,
            post_id,
            comment_id,
            workspace_id,
            actor:profiles!actor_id (
              id,
              username,
              avatar_url,
              name
            )
          `)
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) {
          console.error('[useNotifications] Error fetching notifications:', error)
          return
        }
        
        // Count unread
        const unreadCount = (data || []).filter(n => !n.is_read).length

        const notificationsData = data || []

        // Update cache
        notificationsCache.data = notificationsData
        notificationsCache.timestamp = Date.now()

        if (isMountedRef.current) {
          setNotifications(notificationsData)
          setUnreadCount(unreadCount)
          setLoading(false)
        }
      } catch (err) {
        console.error('[useNotifications] Exception fetching notifications:', err)
        if (isMountedRef.current) setLoading(false)
      }
    },
    [user]
  )

  const subscribeToNotifications = async () => {
    try {
      if (!user) {
        return
      }

      // Prevent duplicate subscriptions for same user
      if (activeSubscriptionRef.current && subscriptionUserRef.current === user.id) {
        return
      }

      // Clean up old subscription if user changed
      if (activeSubscriptionRef.current && subscriptionUserRef.current !== user.id) {
        await activeSubscriptionRef.current.unsubscribe()
        activeSubscriptionRef.current = null
      }

      // Subscribe to new notifications
      const channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`
          },
          (payload) => {
            if (isMountedRef.current) {
              handleNewNotification(payload.new)
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`
          },
          (payload) => {
            if (isMountedRef.current) {
              handleNotificationUpdate(payload.new)
            }
          }
        )
        .subscribe()

      activeSubscriptionRef.current = channel
      subscriptionUserRef.current = user.id
    } catch (err) {
      console.error('[useNotifications] Exception subscribing to notifications:', err)
    }
  }

  const handleNewNotification = async (newNotif) => {
    try {
      // Fetch actor profile
      const { data: actorProfile, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, name')
        .eq('id', newNotif.actor_id)
        .maybeSingle()

      if (!error) {
        const transformedNotif = {
          ...newNotif,
          actor: actorProfile || { username: 'unknown', avatar_url: null }
        }

        if (isMountedRef.current) {
          // Add to beginning of list
          setNotifications(prev => [transformedNotif, ...prev])

          // Update cache
          notificationsCache.data = [transformedNotif, ...(notificationsCache.data || [])]
          notificationsCache.timestamp = Date.now()

          // Update unread count
          if (!newNotif.is_read) {
            setUnreadCount(prev => prev + 1)
          }
        }
      }
    } catch (err) {
      console.error('[useNotifications] Exception handling new notification:', err)
    }
  }

  const handleNotificationUpdate = (updatedNotif) => {
    if (isMountedRef.current) {
      setNotifications(prev => {
        const updated = prev.map(notif =>
          notif.id === updatedNotif.id ? { ...notif, ...updatedNotif } : notif
        )

        if (notificationsCache.data) {
          notificationsCache.data = updated
          notificationsCache.timestamp = Date.now()
        }

        setUnreadCount(updated.filter(n => !n.is_read).length)
        return updated
      })
    }
  }

  const markAsRead = useCallback(async (notificationIds) => {
    try {
      if (!user) {
        console.error('[useNotifications] User not authenticated for marking as read')
        return false
      }

      // Update only requested notification IDs for current user
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', notificationIds)
        .eq('recipient_id', user.id)

      if (error) {
        console.error('[useNotifications] ❌ Error marking as read:', error)
        console.error('[useNotifications] Error details:', error.details || error.message)
        return false
      }

      const idSet = new Set(notificationIds)

      // Immediately update local state for the requested IDs only.
      if (isMountedRef.current) {
        setNotifications(prev => {
          const updated = prev.map(notif => (
            idSet.has(notif.id) ? { ...notif, is_read: true } : notif
          ))
          const unread = updated.filter(n => !n.is_read).length
          setUnreadCount(unread)
          return updated
        })

        // Update cache
        if (notificationsCache.data) {
          notificationsCache.data = notificationsCache.data.map(notif => (
            idSet.has(notif.id) ? { ...notif, is_read: true } : notif
          ))
          notificationsCache.timestamp = Date.now()
        }
      }
      return true
    } catch (err) {
      console.error('[useNotifications] ❌ Exception marking as read:', err)
      return false
    }
  }, [user])

  const refetch = useCallback(() => {
    // Invalidate cache
    notificationsCache.data = null
    notificationsCache.timestamp = null
    return fetchNotifications()
  }, [fetchNotifications])

  return {
    notifications,
    loading,
    unreadCount,
    refetch,
    markAsRead,
    fetchNotifications // Expose for full notifications page
  }
}
