import { supabase } from "./supabase"
import { createNotification } from "./notificationHelpers"

/**
 * Fetch user profile by user_id
 */
export async function fetchUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", userId)
      .maybeSingle()

    if (error) throw error
    return data || { username: "unknown", avatar_url: null }
  } catch (err) {
    console.error("[postInteractions] Error fetching user profile:", err)
    return { username: "unknown", avatar_url: null }
  }
}

/**
 * Batch fetch likes for multiple posts in ONE query
 * Returns: { [postId]: { count, userLiked } }
 */
export async function fetchLikesForPosts(postIds, userId = null, signal = null) {
  if (!postIds || postIds.length === 0) {
    return {}
  }

  try {
    const query = supabase
      .from("likes")
      .select("post_id, user_id")
      .in("post_id", postIds)

    if (signal) {
      query.abortSignal(signal)
    }

    const { data: allLikes, error } = await query

    if (error) {
      if (error.message === 'Fetch is aborted' || signal?.aborted) {
        if (import.meta.env.DEV) console.log("[FetchCancelled] postInteractions.fetchLikesForPosts Supabase query")
        return {}
      }
      throw error
    }

    const result = {}
    postIds.forEach((postId) => {
      result[postId] = {
        count: 0,
        userLiked: false
      }
    })

    ;(allLikes || []).forEach((like) => {
      if (result[like.post_id]) {
        result[like.post_id].count++
        if (userId && like.user_id === userId) {
          result[like.post_id].userLiked = true
        }
      }
    })

    return result
  } catch (err) {
    const isAbort = err.name === 'AbortError' || err.message === 'Fetch is aborted' || err.message?.includes('signal is aborted')
    if (isAbort) {
      if (import.meta.env.DEV) console.log("[FetchCancelled] postInteractions.fetchLikesForPosts task")
      return {}
    }
    console.error("[postInteractions] Error fetching batch likes:", err)
    const result = {}
    postIds.forEach((postId) => {
      result[postId] = { count: 0, userLiked: false }
    })
    return result
  }
}

/**
 * Fetch likes count and check if current user has liked (legacy single post)
 */
export async function fetchLikeInfo(postId) {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    // Get total likes count
    const { count } = await supabase
      .from("likes")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId)

    // Check if current user has liked
    let userLiked = false
    if (user) {
      const { data: userLike } = await supabase
        .from("likes")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .maybeSingle()

      userLiked = !!userLike
    }

    return { count: count || 0, userLiked }
  } catch (err) {
    console.error("[postInteractions] Error fetching like info:", err)
    return { count: 0, userLiked: false }
  }
}

/**
 * Toggle like on a post (add or remove)
 */
export async function toggleLike(postId, postOwnerId = null) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new Error("User not authenticated")
    }

    // Check if user has already liked
    const { data: existingLikes, error: existingLikeError } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
    if (existingLikeError) throw existingLikeError

    if ((existingLikes || []).length > 0) {
      // Unlike
      const { error: deleteError } = await supabase
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id)

      if (deleteError) throw deleteError
      return { success: true, liked: false }
    } else {
      // Like
      const { error: insertError } = await supabase
        .from("likes")
        .insert({ post_id: postId, user_id: user.id })

      if (insertError) {
        if (insertError.code === "23505") {
          return { success: true, liked: true }
        }
        throw insertError
      }

      let recipientId = postOwnerId

      if (!recipientId) {
        const { data: post } = await supabase
          .from("posts")
          .select("user_id")
          .eq("id", postId)
          .maybeSingle()

        recipientId = post?.user_id || null
      }

      if (recipientId && recipientId !== user.id) {
        await createNotification({
          recipientId,
          actorId: user.id,
          type: "like",
          postId: postId
        })
      }

      return { success: true, liked: true }
    }
  } catch (err) {
    console.error("[postInteractions] Error toggling like:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Batch fetch comments for multiple posts in ONE query
 */
export async function fetchCommentsForPosts(postIds, signal = null) {
  if (!postIds || postIds.length === 0) return {}

  try {
    const query = supabase
      .from("comments")
      .select(`
        id,
        post_id,
        user_id,
        content,
        created_at,
        profiles(id, username, avatar_url, name)
      `)
      .in("post_id", postIds)
      .order("created_at", { ascending: true })

    if (signal) {
      query.abortSignal(signal)
    }

    const { data, error } = await query

    if (error) {
      if (error.message === 'Fetch is aborted' || signal?.aborted) {
        if (import.meta.env.DEV) console.log("[FetchCancelled] postInteractions.fetchCommentsForPosts Supabase query")
        return {}
      }
      console.error("[postInteractions] Fetch batch comments error:", error)
      return {}
    }

    const groupedComments = {}
    postIds.forEach((postId) => {
      groupedComments[postId] = []
    })

    ;(data || []).forEach((comment) => {
      const transformedComment = {
        ...comment,
        profiles: comment.profiles || { username: "unknown", avatar_url: null }
      }

      if (groupedComments[comment.post_id]) {
        groupedComments[comment.post_id].push(transformedComment)
      }
    })

    return groupedComments
  } catch (err) {
    const isAbort = err.name === 'AbortError' || err.message === 'Fetch is aborted' || err.message?.includes('signal is aborted')
    if (isAbort) {
      if (import.meta.env.DEV) console.log("[FetchCancelled] postInteractions.fetchCommentsForPosts task")
      return {}
    }
    console.error("[postInteractions] Error fetching batch comments:", err)
    return {}
  }
}

/**
 * Fetch comments for a single post
 */
export async function fetchComments(postId) {
  try {
    const { data, error } = await supabase
      .from("comments")
      .select(`
        id,
        user_id,
        content,
        created_at,
        profiles:user_id (
          username,
          avatar_url
        )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[postInteractions] Fetch comments error:", error)
      throw error
    }

    return (data || []).map((comment) => ({
      ...comment,
      profiles: comment.profiles || { username: "unknown", avatar_url: null }
    }))
  } catch (err) {
    console.error("[postInteractions] Error fetching comments:", err)
    return []
  }
}

/**
 * Add a comment to a post
 */
export async function addComment(postId, content, postOwnerId = null) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new Error("User not authenticated")
    }

    if (!content.trim()) {
      throw new Error("Comment cannot be empty")
    }

    const { data, error: insertError } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        user_id: user.id,
        content: content.trim()
      })
      .select(`
        id,
        user_id,
        content,
        created_at,
        profiles:user_id (
          username,
          avatar_url
        )
      `)
      .single()

    if (insertError) {
      console.error("[postInteractions] Insert comment error:", insertError)
      throw insertError
    }

    const transformedComment = {
      ...data,
      profiles: data.profiles || { username: "unknown", avatar_url: null }
    }

    let recipientId = postOwnerId

    if (!recipientId) {
      const { data: post } = await supabase
        .from("posts")
        .select("user_id")
        .eq("id", postId)
        .maybeSingle()

      recipientId = post?.user_id || null
    }

    if (recipientId && recipientId !== user.id) {
      await createNotification({
        recipientId,
        actorId: user.id,
        type: "comment",
        postId: postId,
        commentId: data.id
      })
    }

    return { success: true, comment: transformedComment }
  } catch (err) {
    console.error("[postInteractions] Error adding comment:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId) {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("User not authenticated")
    }

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)

    if (error) throw error

    return { success: true }
  } catch (err) {
    console.error("[postInteractions] Error deleting comment:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Share link helpers
 */
export function getShareLink(username) {
  return `${window.location.origin}/profile/${username}`
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return { success: true }
  } catch (err) {
    console.error("[postInteractions] Error copying to clipboard:", err)
    return { success: false, error: err.message }
  }
}

/**
 * Lightweight count fetchers
 */
export async function fetchCommentCountsForPosts(postIds, signal = null) {
  if (!postIds || postIds.length === 0) return {}

  try {
    const query = supabase
      .from("comments")
      .select("post_id")
      .in("post_id", postIds)

    if (signal) {
      query.abortSignal(signal)
    }

    const { data, error } = await query

    if (error) {
      if (error.message === 'Fetch is aborted' || signal?.aborted) {
        if (import.meta.env.DEV) console.log("[FetchCancelled] postInteractions.fetchCommentCountsForPosts Supabase query")
        return {}
      }
      throw error
    }

    const commentCounts = {}
    postIds.forEach((id) => (commentCounts[id] = 0))
    ;(data || []).forEach((c) => {
      if (commentCounts[c.post_id] !== undefined) commentCounts[c.post_id]++
    })

    return commentCounts
  } catch (err) {
    const isAbort = err.name === 'AbortError' || err.message === 'Fetch is aborted' || err.message?.includes('signal is aborted')
    if (isAbort) {
      if (import.meta.env.DEV) console.log("[FetchCancelled] postInteractions.fetchCommentCountsForPosts task")
      return {}
    }
    console.error("[postInteractions] Error fetching comment counts:", err)
    return {}
  }
}

export async function fetchLikeCountsForPosts(postIds, userId = null, signal = null) {
  if (!postIds || postIds.length === 0) return {}

  try {
    const query = supabase
      .from("likes")
      .select("post_id, user_id")
      .in("post_id", postIds)

    if (signal) {
      query.abortSignal(signal)
    }

    const { data, error } = await query

    if (error) {
      if (error.message === 'Fetch is aborted' || signal?.aborted) {
        if (import.meta.env.DEV) console.log("[FetchCancelled] postInteractions.fetchLikeCountsForPosts Supabase query")
        return {}
      }
      throw error
    }

    const result = {}
    postIds.forEach((id) => (result[id] = { count: 0, userLiked: false }))
    ;(data || []).forEach((l) => {
      if (result[l.post_id]) {
        result[l.post_id].count++
        if (userId && l.user_id === userId) result[l.post_id].userLiked = true
      }
    })

    return result
  } catch (err) {
    const isAbort = err.name === 'AbortError' || err.message === 'Fetch is aborted' || err.message?.includes('signal is aborted')
    if (isAbort) {
      if (import.meta.env.DEV) console.log("[FetchCancelled] postInteractions.fetchLikeCountsForPosts task")
      return {}
    }
    console.error("[postInteractions] Error fetching like counts:", err)
    return {}
  }
}
