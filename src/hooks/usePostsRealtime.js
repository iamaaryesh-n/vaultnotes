import { useEffect, useMemo, useRef } from "react"
import { supabase } from "../lib/supabase"

/**
 * Realtime subscription hook for likes, comments, and post updates
 * 
 * Features:
 * - Subscribes to INSERT events on likes table → increment like count
 * - Subscribes to DELETE events on likes table → decrement like count
 * - Subscribes to INSERT events on comments table → add new comment instantly
 * - Subscribes to UPDATE events on posts table → handle post edits
 * - Uses post_id filter to only get relevant updates
 * - Stable subscription: only subscribes once, never resubscribes unnecessarily
 * - Proper cleanup on unmount
 * 
 * @param {string[]} postIds - Array of post IDs to subscribe to
 * @param {Function} onLikesChange - Callback when likes change (INSERT/DELETE events)
 * @param {Function} onCommentsChange - Callback when comments change (INSERT events)
 * @param {Function} onPostsChange - Callback when posts change (UPDATE events)
 */
export function usePostsRealtime(postIds, onLikesChange, onCommentsChange, onPostsChange, authReady = true) {
  const channelsRef = useRef(null)
  const onLikesChangeRef = useRef(onLikesChange)
  const onCommentsChangeRef = useRef(onCommentsChange)
  const onPostsChangeRef = useRef(onPostsChange)

  const postIdsKey = useMemo(
    () => Array.from(new Set(postIds || [])).filter(Boolean).sort().join(","),
    [postIds]
  )

  // Update callback refs WITHOUT triggering resubscription
  useEffect(() => {
    onLikesChangeRef.current = onLikesChange
  }, [onLikesChange])

  useEffect(() => {
    onCommentsChangeRef.current = onCommentsChange
  }, [onCommentsChange])

  useEffect(() => {
    onPostsChangeRef.current = onPostsChange
  }, [onPostsChange])

  // Subscribe when post IDs actually change
  useEffect(() => {
    if (!authReady) return
    const uniquePostIds = postIdsKey ? postIdsKey.split(",") : []

    if (uniquePostIds.length === 0) return

    const nextKey = postIdsKey

    // ============================================
    // LIKES CHANNEL - Handle INSERT and DELETE
    // ============================================
    const likesChannel = supabase
      .channel(`likes-realtime-${nextKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "likes",
          filter: `post_id=in.(${uniquePostIds.join(",")})`
        },
        (payload) => {
          if (onLikesChangeRef.current) {
            onLikesChangeRef.current(payload)
          }
        }
      )
      .subscribe()

    // ============================================
    // COMMENTS CHANNEL - Handle INSERT and DELETE
    // ============================================
    const commentsChannel = supabase
      .channel(`comments-realtime-${nextKey}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `post_id=in.(${uniquePostIds.join(",")})`
        },
        (payload) => {
          if (onCommentsChangeRef.current) {
            onCommentsChangeRef.current(payload)
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "comments",
          filter: `post_id=in.(${uniquePostIds.join(",")})`
        },
        (payload) => {
          if (onCommentsChangeRef.current) {
            onCommentsChangeRef.current(payload)
          }
        }
      )
      .subscribe()

    // ============================================
    // POSTS CHANNEL - Handle UPDATE events
    // ============================================
    const postsChannel = supabase
      .channel(`posts-realtime-${nextKey}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "posts",
          filter: `id=in.(${uniquePostIds.join(",")})`
        },
        (payload) => {
          if (onPostsChangeRef.current) {
            onPostsChangeRef.current(payload)
          }
        }
      )
      .subscribe()

    // Store channel references for cleanup
    channelsRef.current = {
      likes: likesChannel,
      comments: commentsChannel,
      posts: postsChannel
    }

    // Cleanup for this specific subscription run
    return () => {
      if (likesChannel) supabase.removeChannel(likesChannel)
      if (commentsChannel) supabase.removeChannel(commentsChannel)
      if (postsChannel) supabase.removeChannel(postsChannel)
      channelsRef.current = null
    }
  }, [postIdsKey, authReady])
}
