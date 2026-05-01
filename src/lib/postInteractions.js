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
export async function fetchLikesForPosts(postIds, userId = null) {
  if (!postIds || postIds.length === 0) {
    return {}
  }

  try {
    // Fetch all likes for these posts
    const { data: allLikes, error } = await supabase
      .from("likes")
      .select("post_id, user_id")
      .in("post_id", postIds)

    if (error) throw error

    // Build result object with counts and user like status
    const result = {}
    postIds.forEach((postId) => {
      result[postId] = {
        count: 0,
        userLiked: false
      }
    })

    // Count likes per post and check if user liked
    ;(allLikes || []).forEach((like) => {
      result[like.post_id].count++
      if (userId && like.user_id === userId) {
        result[like.post_id].userLiked = true
      }
    })

    console.log("[postInteractions] Fetched likes for", Object.keys(result).length, "posts")
    return result
  } catch (err) {
    console.error("[postInteractions] Error fetching batch likes:", err)
    // Return empty structure for all posts
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

    // Check if user has already liked (array query avoids maybeSingle multiple-row edge case)
    const { data: existingLikes, error: existingLikeError } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
    if (existingLikeError) throw existingLikeError

    if ((existingLikes || []).length > 0) {
      // Unlike: delete all matching likes for safety
      const { error: deleteError } = await supabase
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id)

      if (deleteError) throw deleteError
      return { success: true, liked: false }
    } else {
      // Like: insert new like
      const { error: insertError } = await supabase
        .from("likes")
        .insert({ post_id: postId, user_id: user.id })

      if (insertError) {
        // If unique constraint exists and a race inserts first, treat as liked success
        if (insertError.code === "23505") {
          return { success: true, liked: true }
        }
        throw insertError
      }

      let recipientId = postOwnerId

      // Fallback lookup if caller did not provide post owner
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
 * Returns object: { [postId]: [comments] }
 */
export async function fetchCommentsForPosts(postIds) {
  if (!postIds || postIds.length === 0) {
    return {}
  }

  try {
    const { data, error } = await supabase
      .from("comments")
      .select(
        `
        id,
        post_id,
        user_id,
        content,
        created_at,
        profiles:user_id (
          username,
          avatar_url
        )
        `
      )
      .in("post_id", postIds)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[postInteractions] Fetch batch comments error:", error)
      throw error
    }

    // Group comments by post_id
    const groupedComments = {}
    postIds.forEach((postId) => {
      groupedComments[postId] = []
    })

    ;(data || []).forEach((comment) => {
      // Transform profile data to handle both array and object responses
      const profile = Array.isArray(comment.profiles)
        ? comment.profiles[0]
        : comment.profiles

      const transformedComment = {
        ...comment,
        profiles: profile || { username: "unknown", avatar_url: null }
      }

      if (!groupedComments[comment.post_id]) {
        groupedComments[comment.post_id] = []
      }
      groupedComments[comment.post_id].push(transformedComment)
    })

    console.log("[postInteractions] Fetched comments for", Object.keys(groupedComments).length, "posts")
    return groupedComments
  } catch (err) {
    console.error("[postInteractions] Error fetching batch comments:", err)
    return {}
  }
}

/**
 * Fetch comments for a single post (used when needed)
 */
export async function fetchComments(postId) {
  try {
    const { data, error } = await supabase
      .from("comments")
      .select(
        `
        id,
        user_id,
        content,
        created_at,
        profiles:user_id (
          username,
          avatar_url
        )
        `
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[postInteractions] Fetch comments error:", error)
      throw error
    }

    // Transform response to flatten the nested profile data if needed
    const transformedData = (data || []).map((comment) => {
      // Supabase joins with ForeignKey can return profiles as: profiles (array) or profiles (object)
      // Handle both cases
      const profile = Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles

      return {
        ...comment,
        profiles: profile || { username: "unknown", avatar_url: null }
      }
    })

    return transformedData
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
      .select(
        `
        id,
        user_id,
        content,
        created_at,
        profiles:user_id (
          username,
          avatar_url
        )
        `
      )
      .single()

    if (insertError) {
      console.error("[postInteractions] Insert comment error:", insertError)
      throw insertError
    }

    // Transform response to handle nested profile
    const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles
    const transformedComment = {
      ...data,
      profiles: profile || { username: "unknown", avatar_url: null }
    }

    let recipientId = postOwnerId

    // Fallback lookup if caller did not provide post owner
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
 * Delete a comment (by comment author or post owner).
 * Authorization is enforced server-side via RLS — no client filter needed.
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
 * Get the link to share for a post
 */
export function getShareLink(username) {
  return `${window.location.origin}/profile/${username}`
}

/**
 * Copy text to clipboard
 */
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
 * Fetch ONLY comment counts for multiple posts (lightweight)
 * Returns: { [postId]: count }
 * Used for feed display to reduce payload
 */
export async function fetchCommentCountsForPosts(postIds) {
  if (!postIds || postIds.length === 0) {
    return {}
  }

  try {
    const { data, error } = await supabase
      .from("comments")
      .select("post_id")
      .in("post_id", postIds)

    if (error) {
      console.error("[postInteractions] Fetch comment counts error:", error)
      throw error
    }

    // Count comments by post_id
    const commentCounts = {}
    postIds.forEach((postId) => {
      commentCounts[postId] = 0
    })

    ;(data || []).forEach((comment) => {
      if (commentCounts[comment.post_id] !== undefined) {
        commentCounts[comment.post_id]++
      }
    })

    console.log("[postInteractions] Fetched comment counts for", postIds.length, "posts")
    return commentCounts
  } catch (err) {
    console.error("[postInteractions] Error fetching comment counts:", err)
    const result = {}
    postIds.forEach((postId) => {
      result[postId] = 0
    })
    return result
  }
}

/**
 * Fetch ONLY like counts for multiple posts (lightweight)
 * Returns: { [postId]: { count, userLiked } }
 * Used for feed display to reduce payload
 */
export async function fetchLikeCountsForPosts(postIds, userId = null) {
  if (!postIds || postIds.length === 0) {
    return {}
  }

  try {
    // Fetch only post_id and user_id (lightweight query)
    const { data: allLikes, error } = await supabase
      .from("likes")
      .select("post_id, user_id")
      .in("post_id", postIds)

    if (error) throw error

    // Build result object with counts and user like status
    const result = {}
    postIds.forEach((postId) => {
      result[postId] = {
        count: 0,
        userLiked: false
      }
    })

    // Count likes per post and check if user liked
    ;(allLikes || []).forEach((like) => {
      if (result[like.post_id]) {
        result[like.post_id].count++
        if (userId && like.user_id === userId) {
          result[like.post_id].userLiked = true
        }
      }
    })

    console.log("[postInteractions] Fetched like counts for", postIds.length, "posts")
    return result
  } catch (err) {
    console.error("[postInteractions] Error fetching like counts:", err)
    // Return empty structure for all posts
    const result = {}
    postIds.forEach((postId) => {
      result[postId] = { count: 0, userLiked: false }
    })
    return result
  }
}
