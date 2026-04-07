import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Cache for notifications to prevent duplicate fetches
const notificationsCache = {
  data: null,
  timestamp: null,
  TTL: 5 * 60 * 1000 // 5 minutes
}

// Subscription reference to prevent duplicate subscriptions
let activeSubscription = null
let subscriptionUser = null

/**
 * Hook to fetch and subscribe to user's notifications
 * Returns notifications list and utilities
 * Uses caching to prevent duplicate fetches
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const isMountedRef = useRef(true)
  const fetchTimeoutRef = useRef(null)

  useEffect(() => {
    isMountedRef.current = true
    initializeNotifications()

    return () => {
      isMountedRef.current = false
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
      // Cleanup realtime subscription on unmount
      if (activeSubscription) {
        console.log('[useNotifications] Cleaning up realtime subscription on unmount')
        activeSubscription.unsubscribe()
        activeSubscription = null
        subscriptionUser = null
      }
    }
  }, [])

  const initializeNotifications = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.log('[useNotifications] User not authenticated')
        if (isMountedRef.current) setLoading(false)
        return
      }

      console.log('[useNotifications] 🚀 Initializing notifications for user:', user.id)

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
        if (!isMountedRef.current) return

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          console.log('[useNotifications] User not authenticated')
          return
        }

        console.log('[useNotifications] 👤 Current auth user ID:', user.id)

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

        console.log('[useNotifications] 📥 Fetched notifications from DB:', data?.length || 0)
        
        // ✅ VERIFY IDs ARE NOT CORRUPTED
        if (data && data.length > 0) {
          console.log('[useNotifications] 🔍 Verification - Fetched notification IDs:')
          data.forEach((n, idx) => {
            console.log(`  [${idx}] ID: ${n.id}`)
          })
          
          console.log('[useNotifications] First notification details:')
          console.log('  - notification.id:', data[0].id)
          console.log('  - recipient_id:', data[0].recipient_id)
          console.log('  - is_read:', data[0].is_read)
          console.log('  - actor:', data[0].actor)
        }
        
        // Count unread
        const unreadCount = (data || []).filter(n => !n.is_read).length
        console.log('[useNotifications] Total notifications:', data?.length || 0)
        console.log('[useNotifications] Unread notifications in DB:', unreadCount)

        // ✅ NO TRANSFORMATION - data already has correct structure with actor field
        // Keep notification.id intact - do NOT use object spreading
        const notificationsData = data || []

        // Update cache
        notificationsCache.data = notificationsData
        notificationsCache.timestamp = Date.now()

        if (isMountedRef.current) {
          setNotifications(notificationsData)
          setUnreadCount(unreadCount)
          console.log('[useNotifications] ✅ State updated - unreadCount:', unreadCount)
          setLoading(false)
        }
      } catch (err) {
        console.error('[useNotifications] Exception fetching notifications:', err)
        if (isMountedRef.current) setLoading(false)
      }
    },
    []
  )

  const subscribeToNotifications = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.log('[useNotifications] User not authenticated for subscription')
        return
      }

      // Prevent duplicate subscriptions for same user
      if (activeSubscription && subscriptionUser === user.id) {
        console.log('[useNotifications] Already subscribed to notifications')
        return
      }

      // Clean up old subscription if user changed
      if (activeSubscription && subscriptionUser !== user.id) {
        console.log('[useNotifications] Cleaning up old subscription')
        await activeSubscription.unsubscribe()
        activeSubscription = null
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
            console.log('[useNotifications] 🔔 New notification received')
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
            console.log('[useNotifications] Notification updated:', payload)
            if (isMountedRef.current) {
              handleNotificationUpdate(payload.new)
            }
          }
        )
        .subscribe()

      activeSubscription = channel
      subscriptionUser = user.id
      console.log('[useNotifications] ✅ Realtime connected for notifications')
    } catch (err) {
      console.error('[useNotifications] Exception subscribing to notifications:', err)
    }
  }

  const handleNewNotification = async (newNotif) => {
    try {
      // Fetch actor profile
      const { data: actorProfile, error } = await supabase
        .from('profiles')
        .select('username, avatar_url, name')
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
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === updatedNotif.id ? { ...notif, ...updatedNotif } : notif
        )
      )

      // Update cache
      if (notificationsCache.data) {
        notificationsCache.data = notificationsCache.data.map(notif =>
          notif.id === updatedNotif.id ? { ...notif, ...updatedNotif } : notif
        )
      }

      // Recalculate unread count
      setNotifications(prev => {
        const unread = prev.filter(n => !n.is_read).length
        setUnreadCount(unread)
        return prev
      })
    }
  }

  const markAsRead = useCallback(async (notificationIds) => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.error('[useNotifications] User not authenticated for marking as read')
        return false
      }

      console.log('[useNotifications] ========== MARK AS READ START ==========')
      console.log('[useNotifications] 👤 Auth user ID:', user.id)
      console.log('[useNotifications] 📋 Notification IDs to mark:', notificationIds)

      // First, let's do a manual count of what we're about to update
      const { data: beforeUpdate, error: countError } = await supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('recipient_id', user.id)
        .eq('is_read', false)

      console.log('[useNotifications] Notifications with is_read=false BEFORE update:', beforeUpdate?.length || 0)

      // Update only requested notification IDs for current user
      const { data: updatedData, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', notificationIds)
        .eq('recipient_id', user.id)

      if (error) {
        console.error('[useNotifications] ❌ Error marking as read:', error)
        console.error('[useNotifications] Error details:', error.details || error.message)
        return false
      }

      console.log('[useNotifications] ✅ Update query executed')
      console.log('[useNotifications] Updated data returned:', updatedData?.length || 0, 'rows')

      // Verify the update worked by fetching again
      const { data: afterUpdate, error: verifyError } = await supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('recipient_id', user.id)
        .eq('is_read', false)

      console.log('[useNotifications] Notifications with is_read=false AFTER update:', afterUpdate?.length || 0)
      
      if (afterUpdate && afterUpdate.length === 0) {
        console.log('[useNotifications] ✅ Verification passed - all notifications are now marked as read')
      } else {
        console.warn('[useNotifications] ⚠️  Verification failed - still have unread notifications')
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
          console.log('[useNotifications] 📝 Updated local state for selected notifications')
          return updated
        })

        // Update cache
        if (notificationsCache.data) {
          notificationsCache.data = notificationsCache.data.map(notif => (
            idSet.has(notif.id) ? { ...notif, is_read: true } : notif
          ))
          notificationsCache.timestamp = Date.now()
          console.log('[useNotifications] 💾 Updated cache')
        }

        console.log('[useNotifications] 🔔 Updated unread count after selective mark-as-read')
      }

      console.log('[useNotifications] ========== MARK AS READ END ==========')
      return true
    } catch (err) {
      console.error('[useNotifications] ❌ Exception marking as read:', err)
      return false
    }
  }, [])

  const refetch = useCallback(() => {
    console.log('[useNotifications] Manual refetch triggered')
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
