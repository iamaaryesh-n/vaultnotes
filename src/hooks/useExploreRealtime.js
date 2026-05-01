import { useCallback, useEffect, useRef } from "react"
import { supabase } from "../lib/supabase"
import { usePostsRealtime } from "./usePostsRealtime"

export function useExploreRealtime({ posts, currentUserId, setLikesByPost, setCommentsByPost, addNewPost }, authReady = true) {
  const optimisticLikeActionsRef = useRef(new Map())
  const newPostIdsRef = useRef(new Set())

  useEffect(() => {
    const handleOptimisticLike = (event) => {
      const detail = event?.detail
      const postId = detail?.postId
      const userId = detail?.userId
      const action = detail?.action
      if (!postId || !userId || !action) return

      const key = `${postId}:${userId}`
      optimisticLikeActionsRef.current.set(key, {
        action,
        ts: Date.now()
      })
    }

    window.addEventListener("explore:optimistic-like", handleOptimisticLike)
    return () => {
      window.removeEventListener("explore:optimistic-like", handleOptimisticLike)
    }
  }, [])

  const handleLikesRealtime = useCallback(
    (payload) => {
      const isInsert = payload.eventType === "INSERT"
      const isDelete = payload.eventType === "DELETE"
      const eventPostId = isDelete ? payload.old?.post_id : payload.new?.post_id
      const actorUserId = isDelete ? payload.old?.user_id : payload.new?.user_id

      if (eventPostId && actorUserId) {
        const key = `${eventPostId}:${actorUserId}`
        const optimistic = optimisticLikeActionsRef.current.get(key)
        if (optimistic) {
          const ageMs = Date.now() - optimistic.ts
          const incomingAction = isDelete ? "unlike" : "like"

          // Skip matching self-action realtime event to avoid optimistic + realtime double-count
          if (optimistic.action === incomingAction && ageMs < 8000) {
            optimisticLikeActionsRef.current.delete(key)
            return
          }
        }
      }

      if (payload.eventType === "DELETE") {
        const postId = payload.old?.post_id
        if (!postId) return

        setLikesByPost((prev) => {
          const current = prev[postId] || { count: 0, userLiked: false }
          return {
            ...prev,
            [postId]: {
              ...current,
              count: Math.max(0, current.count - 1),
              userLiked: payload.old?.user_id === currentUserId ? false : current.userLiked
            }
          }
        })
        return
      }

      const postId = payload.new?.post_id
      if (!postId) return

      setLikesByPost((prev) => {
        const current = prev[postId] || { count: 0, userLiked: false }
        return {
          ...prev,
          [postId]: {
            ...current,
            count: current.count + 1,
            userLiked: payload.new?.user_id === currentUserId ? true : current.userLiked
          }
        }
      })
    },
    [currentUserId, setLikesByPost]
  )

  const handleCommentsRealtime = useCallback(
    async (payload) => {
      if (payload.eventType === "INSERT" && payload.new?.post_id) {
        let profile = { username: "unknown", avatar_url: null, name: null }

        if (payload.new.user_id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, username, avatar_url, name")
            .eq("id", payload.new.user_id)
            .maybeSingle()

          if (profileData) {
            profile = profileData
          }
        }

        const comment = {
          id: payload.new.id,
          user_id: payload.new.user_id,
          content: payload.new.content,
          created_at: payload.new.created_at,
          profiles: profile
        }

        setCommentsByPost((prev) => ({
          ...prev,
          [payload.new.post_id]: [...(prev[payload.new.post_id] || []), comment]
        }))
        return
      }

      if (payload.eventType === "DELETE") {
        const commentId = payload.old?.id
        if (!commentId) return

        let postId = payload.old?.post_id

        if (!postId) {
          const { data, error: fetchError } = await supabase
            .from("comments")
            .select("post_id")
            .eq("id", commentId)
            .single()

          if (!fetchError) {
            postId = data?.post_id
          }
        }

        if (postId) {
          setCommentsByPost((prev) => ({
            ...prev,
            [postId]: (prev[postId] || []).filter((comment) => comment.id !== commentId)
          }))
        }
      }
    },
    [setCommentsByPost]
  )

  // Subscribe to new posts
  useEffect(() => {
    if (!authReady || !addNewPost) return

    const postsChannel = supabase
      .channel("posts-realtime-new")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts"
        },
        async (payload) => {
          if (!payload.new || !payload.new.id) return

          // Avoid duplicate from optimistic update
          if (newPostIdsRef.current.has(payload.new.id)) {
            newPostIdsRef.current.delete(payload.new.id)
            return
          }

          // Fetch full post data with profile
          try {
            const { data: fullPost, error } = await supabase
              .from("posts")
              .select("id, user_id, content, image_url, created_at, visibility, profiles(id, username, name, avatar_url)")
              .eq("id", payload.new.id)
              .maybeSingle()

            if (error || !fullPost) return

            addNewPost(fullPost)
          } catch (err) {
            console.error("[useExploreRealtime] Error fetching new post:", err)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(postsChannel)
    }
  }, [authReady, addNewPost])

  usePostsRealtime(
    posts.map((post) => post.id),
    handleLikesRealtime,
    handleCommentsRealtime,
    authReady
  )
}
