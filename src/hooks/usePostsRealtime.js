import { useEffect, useRef, useCallback } from "react"
import { supabase } from "../lib/supabase"

/**
 * Stable realtime subscription hook for likes and comments
 * - Subscribes ONLY ONCE on mount
 * - Never resubscribes unless component unmounts
 * - Callbacks don't trigger resubscription
 * - Properly cleans up channels on unmount
 * 
 * @param {string[]} postIds - Array of post IDs to subscribe to
 * @param {Function} onLikesChange - Callback when likes change
 * @param {Function} onCommentsChange - Callback when comments change
 */
export function usePostsRealtime(postIds, onLikesChange, onCommentsChange) {
  const channelsRef = useRef(null)
  const postIdsRef = useRef(null)

  // Update callback refs WITHOUT triggering resubscription
  const onLikesChangeRef = useRef(onLikesChange)
  const onCommentsChangeRef = useRef(onCommentsChange)

  useEffect(() => {
    onLikesChangeRef.current = onLikesChange
  }, [onLikesChange])

  useEffect(() => {
    onCommentsChangeRef.current = onCommentsChange
  }, [onCommentsChange])

  // Single subscription on mount ONLY, never resubscribe
  useEffect(() => {
    if (!postIds || postIds.length === 0) {
      console.log("[usePostsRealtime] No post IDs provided")
      return
    }

    console.log("[usePostsRealtime] Subscribing to realtime for posts:", postIds)

    // Subscribe to likes table
    const likesChannel = supabase
      .channel(`likes-realtime-${postIdsString}`)
      .on(
        "postgres_changes",
        {
          event: "*", // All events: INSERT, UPDATE, DELETE
          schema: "public",
          table: "likes",
          filter: `post_id=in.(${postIds.join(",")})`
        },
        (payload) => {
          console.log("[usePostsRealtime] Likes event for post:", payload.new?.post_id || payload.old?.post_id)
          if (onLikesChangeRef.current) {
            onLikesChangeRef.current(payload)
          }
        }
      )
      .subscribe((status) => {
        console.log("[usePostsRealtime] Likes channel status:", status)
      })

    // Subscribe to comments table
    const commentsChannel = supabase
      .channel(`comments-realtime-${postIdsString}`)
      .on(
        "postgres_changes",
        {
          event: "*", // All events: INSERT, UPDATE, DELETE
          schema: "public",
          table: "comments",
          filter: `post_id=in.(${postIds.join(",")})`
        },
        (payload) => {
          console.log("[usePostsRealtime] Comments event for post:", payload.new?.post_id || payload.old?.post_id)
          if (onCommentsChangeRef.current) {
            onCommentsChangeRef.current(payload)
          }
        }
      )
      .subscribe((status) => {
        console.log("[usePostsRealtime] Comments channel status:", status)
      })

    // Store channel references
    channelsRef.current = {
      likes: likesChannel,
      comments: commentsChannel
    }

    // Cleanup on unmount only
    return () => {
      console.log("[usePostsRealtime] Cleaning up on unmount")
      if (channelsRef.current) {
        channelsRef.current.likes?.unsubscribe()
        channelsRef.current.comments?.unsubscribe()
        channelsRef.current = null
      }
    }
  }, []) // Only run ONCE on mount, never resubscribe
}
