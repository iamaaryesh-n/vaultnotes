import { useEffect, useMemo, useRef } from "react"
import { supabase } from "../lib/supabase"

/**
 * Realtime subscription hook for likes and comments on posts
 * 
 * Features:
 * - Subscribes to INSERT events on likes table → increment like count
 * - Subscribes to DELETE events on likes table → decrement like count
 * - Subscribes to INSERT events on comments table → add new comment instantly
 * - Uses post_id filter to only get relevant updates
 * - Stable subscription: only subscribes once, never resubscribes unnecessarily
 * - Proper cleanup on unmount
 * 
 * @param {string[]} postIds - Array of post IDs to subscribe to
 * @param {Function} onLikesChange - Callback when likes change (INSERT/DELETE events)
 * @param {Function} onCommentsChange - Callback when comments change (INSERT events)
 */
export function usePostsRealtime(postIds, onLikesChange, onCommentsChange) {
  const channelsRef = useRef(null)
  const onLikesChangeRef = useRef(onLikesChange)
  const onCommentsChangeRef = useRef(onCommentsChange)

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

  // Subscribe when post IDs actually change
  useEffect(() => {
    const uniquePostIds = postIdsKey ? postIdsKey.split(",") : []

    if (uniquePostIds.length === 0) {
      console.log("[usePostsRealtime] No post IDs provided")
      if (channelsRef.current) {
        supabase.removeChannel(channelsRef.current.likes)
        supabase.removeChannel(channelsRef.current.comments)
        channelsRef.current = null
      }
      return
    }

    const nextKey = postIdsKey

    if (channelsRef.current) {
      supabase.removeChannel(channelsRef.current.likes)
      supabase.removeChannel(channelsRef.current.comments)
      channelsRef.current = null
    }

    console.log("[usePostsRealtime] ✅ Subscribing to realtime for posts:", uniquePostIds)

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
          console.log("LIKE EVENT:", payload)
          const postId = payload.eventType === "DELETE" ? payload.old?.post_id : payload.new?.post_id
          if (postId) {
            console.log("Updating post:", postId)
          }
          if (onLikesChangeRef.current) {
            onLikesChangeRef.current(payload)
          }
        }
      )
      .subscribe((status) => {
        console.log("LIKE CHANNEL STATUS:", status)
      })

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
          console.log("Realtime event:", payload)
          console.log("Updating post:", payload.new?.post_id)
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
          console.log("DELETE EVENT FULL:", payload)
          console.log("OLD DATA:", payload.old)
          console.log("DELETE COMMENT:", payload.old)
          console.log("Realtime DELETE event:", payload)
          console.log("Realtime event:", payload)
          console.log("Updating post:", payload.old?.post_id)
          if (onCommentsChangeRef.current) {
            onCommentsChangeRef.current(payload)
          }
        }
      )
      .subscribe((status) => {
        console.log("[usePostsRealtime] Comments channel status:", status)
      })

    // Store channel references for cleanup
    channelsRef.current = {
      likes: likesChannel,
      comments: commentsChannel
    }

    // Cleanup on unmount
    return () => {
      console.log("[usePostsRealtime] Cleaning up realtime subscriptions on unmount")
      if (channelsRef.current) {
        supabase.removeChannel(channelsRef.current.likes)
        supabase.removeChannel(channelsRef.current.comments)
        channelsRef.current = null
      }
    }
  }, [postIdsKey])
}
