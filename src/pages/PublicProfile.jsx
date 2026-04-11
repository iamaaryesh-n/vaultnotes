import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate, useParams } from "react-router-dom"
import Modal from "../components/Modal"
import PostInteractions from "../components/PostInteractions"
import { useSmartFetchPosts } from "../hooks/useSmartFetchPosts"
import { PostListSkeleton } from "../components/PostSkeleton"
import { usePostsRealtime } from "../hooks/usePostsRealtime"
import { useToast } from "../hooks/useToast"
import { createNotification } from "../lib/notificationHelpers"
import VisibilityBadge from "../components/VisibilityBadge"

export default function PublicProfile() {
  const navigate = useNavigate()
  const { username } = useParams()
  const { success, error: showError } = useToast()

  const [profile, setProfile] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowLoading, setIsFollowLoading] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [modalConfig, setModalConfig] = useState({ open: false, title: "", message: "", onConfirm: null })
  
  // Smart fetch posts with caching
  const {
    posts,
    comments: commentsByPost,
    likes: likesByPost,
    loading: postsLoading,
    updateComment,
    removeComment,
    removeCommentById,
    updateLike
  } = useSmartFetchPosts(
    async () => {
      if (!profile?.id) return []
      
      const { data, error } = await supabase
        .from("posts")
        .select("id, user_id, content, image_url, created_at, visibility, profiles(username)")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[PublicProfile] Error fetching posts:", error)
        throw error
      }

      return data || []
    },
    `public_profile_${profile?.id || 'loading'}`,
    false
  )

  useEffect(() => {
    fetchCurrentUser()
  }, [])

  useEffect(() => {
    fetchProfileByUsername()
  }, [username])

  // Refetch follow status when currentUser or profile changes
  useEffect(() => {
    if (currentUser && profile) {
      fetchFollowStatus(profile.id)
    }
  }, [currentUser, profile?.id])

  const fetchCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) {
        console.error("[PublicProfile] Failed to fetch current user:", error)
        return
      }
      setCurrentUser(user)
    } catch (err) {
      console.error("[PublicProfile] Exception fetching current user:", err)
    }
  }

  const fetchProfileByUsername = async () => {
    if (!username) return

    try {
      setLoading(true)

      // Fetch user profile by username
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single()

      if (profileError) {
        if (profileError.code === "PGRST116") {
          console.warn("[PublicProfile] User not found with username:", username)
          setModalConfig({
            open: true,
            title: "Not Found",
            message: `User "@${username}" not found.`,
            onConfirm: () => {
              setModalConfig({ ...modalConfig, open: false })
              navigate(-1)
            }
          })
        } else {
          console.error("[PublicProfile] Error fetching profile:", profileError.message)
          setModalConfig({
            open: true,
            title: "Error",
            message: "Failed to load profile.",
            onConfirm: () => {
              setModalConfig({ ...modalConfig, open: false })
              navigate(-1)
            }
          })
        }
        return
      }

      if (profileData) {
        setProfile(profileData)
        console.log("[PublicProfile] Fetched profile:", profileData)
        
        // Load follow status and counts after profile is loaded
        if (currentUser) {
          await fetchFollowStatus(profileData.id)
          await fetchFollowersCounts(profileData.id)
        } else {
          // Just fetch counts if user is not logged in
          await fetchFollowersCounts(profileData.id)
        }
      }
    } catch (err) {
      console.error("[PublicProfile] Exception:", err.message)
      setModalConfig({
        open: true,
        title: "Error",
        message: "Failed to load profile. Please try again.",
        onConfirm: () => {
          setModalConfig({ ...modalConfig, open: false })
          navigate("/")
        }
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchFollowStatus = async (profileId) => {
    if (!currentUser) return

    try {
      const { data, error } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", currentUser.id)
        .eq("following_id", profileId)
        .maybeSingle()

      if (error) {
        console.error("[PublicProfile] Error fetching follow status:", error)
        return
      }

      setIsFollowing(!!data)
      console.log("[PublicProfile] Follow status:", !!data)
    } catch (err) {
      console.error("[PublicProfile] Exception fetching follow status:", err)
    }
  }

  const fetchFollowersCounts = async (profileId) => {
    try {
      // Fetch followers count
      const { count: followersCount, error: followersError } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profileId)

      if (!followersError) {
        setFollowersCount(followersCount || 0)
      }

      // Fetch following count
      const { count: followingCount, error: followingError } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profileId)

      if (!followingError) {
        setFollowingCount(followingCount || 0)
      }

      console.log("[PublicProfile] Followers:", followersCount, "Following:", followingCount)
    } catch (err) {
      console.error("[PublicProfile] Exception fetching counts:", err)
    }
  }

  const handleFollow = async () => {
    if (!currentUser || !profile) {
      showError("Please log in to follow users")
      return
    }

    if (currentUser.id === profile.id) {
      showError("You cannot follow yourself")
      return
    }

    try {
      setIsFollowLoading(true)

      // Optimistic UI update
      setIsFollowing(true)
      setFollowersCount(prev => prev + 1)

      const { error } = await supabase
        .from("follows")
        .insert({
          follower_id: currentUser.id,
          following_id: profile.id
        })

      if (error) {
        console.error("[PublicProfile] Error following user:", error)
        // Revert optimistic update
        setIsFollowing(false)
        setFollowersCount(prev => Math.max(0, prev - 1))
        showError("Failed to follow user")
        return
      }

      // Create notification for the followed user
      await createNotification({
        recipientId: profile.id,
        actorId: currentUser.id,
        type: "follow"
      })

      success("Following user")
      console.log("[PublicProfile] Successfully followed user:", profile.username)
    } catch (err) {
      console.error("[PublicProfile] Exception following user:", err)
      // Revert optimistic update
      setIsFollowing(false)
      setFollowersCount(prev => Math.max(0, prev - 1))
      showError("An error occurred")
    } finally {
      setIsFollowLoading(false)
    }
  }

  const handleUnfollow = async () => {
    if (!currentUser || !profile) {
      return
    }

    try {
      setIsFollowLoading(true)

      // Optimistic UI update
      setIsFollowing(false)
      setFollowersCount(prev => Math.max(0, prev - 1))

      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", profile.id)

      if (error) {
        console.error("[PublicProfile] Error unfollowing user:", error)
        // Revert optimistic update
        setIsFollowing(true)
        setFollowersCount(prev => prev + 1)
        showError("Failed to unfollow user")
        return
      }

      success("Unfollowed user")
      console.log("[PublicProfile] Successfully unfollowed user:", profile.username)
    } catch (err) {
      console.error("[PublicProfile] Exception unfollowing user:", err)
      // Revert optimistic update
      setIsFollowing(true)
      setFollowersCount(prev => prev + 1)
      showError("An error occurred")
    } finally {
      setIsFollowLoading(false)
    }
  }

  const handleStartChat = async () => {
    if (!currentUser || !profile?.id) {
      showError("Please log in to send messages")
      return
    }

    if (currentUser.id === profile.id) {
      showError("You cannot message yourself")
      return
    }

    try {
      setIsChatLoading(true)

      const currentUserId = currentUser.id
      const profileUserId = profile.id

      const { data: existingConversation, error: existingError } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id")
        .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${profileUserId}),and(user1_id.eq.${profileUserId},user2_id.eq.${currentUserId})`)
        .limit(1)
        .maybeSingle()

      if (existingError) {
        console.error("[PublicProfile] Error checking existing conversation:", existingError)
        showError("Failed to start chat")
        return
      }

      let conversationId = existingConversation?.id

      if (!conversationId) {
        const { data: newConversation, error: insertError } = await supabase
          .from("conversations")
          .insert({
            user1_id: currentUserId,
            user2_id: profileUserId
          })
          .select("id")
          .single()

        if (insertError) {
          console.error("[PublicProfile] Error creating conversation:", insertError)
          showError("Failed to start chat")
          return
        }

        conversationId = newConversation?.id
      }

      if (!conversationId) {
        showError("Failed to start chat")
        return
      }

      navigate(`/chat?conversation=${conversationId}`)
    } catch (err) {
      console.error("[PublicProfile] Exception starting chat:", err)
      showError("Failed to start chat")
    } finally {
      setIsChatLoading(false)
    }
  }
  const handleLikesRealtime = useCallback((payload) => {
    console.log("Realtime event:", payload)
    if (payload.eventType === "DELETE") {
      const postId = payload.old?.post_id
      if (!postId) return

      console.log("DELETE LIKE:", payload.old)
      console.log("Realtime like received for post_id", postId)
      console.log("Updating post:", postId)
      updateLike(postId, "DELETE", payload.old?.user_id)
      return
    }

    const postId = payload.new?.post_id
    if (!postId) return

    console.log("Realtime like received for post_id", postId)
    console.log("Updating post:", postId)
    updateLike(postId, payload.eventType, payload.new?.user_id)
  }, [updateLike])

  const handleCommentsRealtime = useCallback(async (payload) => {
    if (payload.eventType === "INSERT" && payload.new?.post_id) {
      console.log("Realtime event:", payload)
      console.log("Realtime comment received", payload.new)
      console.log("Updating post:", payload.new.post_id)

      const comment = {
        id: payload.new.id,
        user_id: payload.new.user_id,
        content: payload.new.content,
        created_at: payload.new.created_at,
        profiles: { username: "unknown", avatar_url: null }
      }

      updateComment(payload.new.post_id, comment)
      return
    }

    if (payload.eventType === "DELETE") {
      console.log("DELETE EVENT FULL:", payload)
      console.log("OLD DATA:", payload.old)

      const comment_id = payload.old?.id
      if (!comment_id) return

      let post_id = payload.old?.post_id

      if (!post_id) {
        const { data, error: fetchError } = await supabase
          .from("comments")
          .select("post_id")
          .eq("id", comment_id)
          .single()

        if (fetchError) {
          console.warn("[PublicProfile] Failed to resolve post_id for deleted comment:", fetchError)
        }

        post_id = data?.post_id
      }

      console.log("DELETE COMMENT:", payload.old)
      console.log("Realtime DELETE event:", payload)
      if (post_id) {
        console.log("Updating post:", post_id)
        removeComment(post_id, comment_id)
      } else {
        removeCommentById(comment_id)
      }
    }
  }, [updateComment, removeComment, removeCommentById])

  // Setup realtime subscriptions
  usePostsRealtime(
    posts.map((p) => p.id),
    handleLikesRealtime,
    handleCommentsRealtime
  )

  const formatPostTime = (value) => {
    if (!value) return ""
    const date = new Date(value)
    return date.toLocaleString()
  }

  // Filter posts based on visibility settings and follow status
  const visiblePosts = useMemo(() => {
    return posts.filter((post) => {
      // Show public posts to everyone
      if (post.visibility === 'public') {
        return true
      }

      // Private posts: visible to author and their followers
      if (post.visibility === 'private') {
        // Show to author (if viewing own profile through public page)
        if (currentUser?.id === profile?.id) {
          return true
        }
        // Show to followers of the profile owner
        return isFollowing
      }

      // Default: show public posts
      return post.visibility === 'public'
    })
  }, [posts, isFollowing, currentUser?.id, profile?.id])

  if (loading) {
    return (
      <div style={{ maxWidth: "900px" }} className="mx-auto px-6 py-12">
        <h1 className="text-4xl text-yellow-500 font-bold mb-8">Profile</h1>
        <div className="card p-8 animate-pulse">
          <div className="h-32 bg-slate-200 rounded-full mx-auto mb-6 w-32"></div>
          <div className="h-6 bg-slate-200 rounded mb-4 w-3/4 mx-auto"></div>
          <div className="h-4 bg-slate-200 rounded mb-4 w-1/2 mx-auto"></div>
          <div className="h-10 bg-slate-200 rounded mt-6"></div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: "900px" }} className="mx-auto px-6 py-12">
        <h1 className="text-4xl text-yellow-500 font-bold mb-8">Profile</h1>
        <div className="card p-8 text-center">
          <p className="text-gray-600">Unable to load profile data.</p>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-primary mt-4"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: "900px" }} className="mx-auto px-6 py-12">
      <h1 className="text-4xl text-yellow-500 font-bold mb-8">Profile</h1>

      {/* ============ SECTION 1: PROFILE HEADER ============ */}
      <div className="card p-8 mb-8">
        {/* Avatar Section */}
        <div className="text-center mb-8">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Avatar"
              className="w-32 h-32 rounded-full mx-auto object-cover border-4 border-yellow-200 mb-4"
            />
          ) : (
            <div className="w-32 h-32 rounded-full mx-auto bg-gradient-to-br from-yellow-100 to-yellow-50 border-4 border-yellow-200 flex items-center justify-center mb-4">
              <svg
                className="w-16 h-16 text-yellow-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          )}
        </div>

        {/* Profile Info Display */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{profile?.name || "User"}</h2>
          <p className="text-slate-500">@{profile?.username || "username"}</p>
          {profile?.bio ? (
            <p className="text-sm text-slate-600 mt-2 max-w-xl mx-auto">{profile.bio}</p>
          ) : (
            <p className="text-sm text-slate-400 mt-2">No bio added yet.</p>
          )}

          {/* Followers/Following Stats */}
          <div className="flex justify-center gap-8 mt-6">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{followersCount}</p>
              <p className="text-sm text-slate-500">
                {followersCount === 1 ? "Follower" : "Followers"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{followingCount}</p>
              <p className="text-sm text-slate-500">
                {followingCount === 1 ? "Following" : "Following"}
              </p>
            </div>
          </div>
        </div>

        {/* Buttons Section */}
        <div className="flex gap-3">
          {/* Show follow/unfollow button only if not viewing own profile */}
          {currentUser && currentUser.id !== profile?.id && (
            <>
              {isFollowing ? (
                <button
                  onClick={handleUnfollow}
                  disabled={isFollowLoading}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-900 dark:text-white font-semibold disabled:opacity-50 transition-colors duration-200"
                >
                  {isFollowLoading ? "Unfollowing..." : "Unfollow"}
                </button>
              ) : (
                <button
                  onClick={handleFollow}
                  disabled={isFollowLoading}
                  className="flex-1 px-4 py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 dark:text-white font-semibold disabled:opacity-50 transition-colors duration-200"
                >
                  {isFollowLoading ? "Following..." : "Follow"}
                </button>
              )}

              <button
                onClick={handleStartChat}
                disabled={isChatLoading}
                className="flex-1 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50 transition-colors duration-200"
              >
                {isChatLoading ? "Opening..." : "Message"}
              </button>
            </>
          )}
          
          <button
            onClick={() => navigate(-1)}
            className="flex-1 px-4 py-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-semibold hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </div>

      {/* ============ SECTION 2: POSTS LIST ============ */}
      <div className="card p-8">
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Posts</h3>
        </div>

        {postsLoading ? (
          <PostListSkeleton count={3} />
        ) : posts.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-slate-500">
            No posts yet
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-slate-500">
            No visible posts
          </div>
        ) : (
          <div className="space-y-4">
            {visiblePosts.map((post) => (
              <article
                key={post.id}
                className="border border-slate-200 rounded-xl p-5 bg-white dark:bg-slate-900 hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        if (post.profiles?.username) {
                          navigate(`/profile/${post.profiles.username}`)
                        }
                      }}
                      className="text-xs text-blue-500 hover:text-blue-700 hover:underline cursor-pointer font-medium text-left"
                    >
                      @{post.profiles?.username || "unknown"}
                    </button>
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      <span>{formatPostTime(post.created_at)}</span>
                      <span>·</span>
                      <VisibilityBadge visibility={post.visibility || 'public'} size="xs" />
                    </p>
                  </div>
                </div>

                {post.content && (
                  <p className="text-gray-800 whitespace-pre-wrap leading-relaxed mb-3">{post.content}</p>
                )}

                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt="Post"
                    className="w-full rounded-lg border border-slate-200 object-cover max-h-96"
                  />
                )}

                {/* Post Interactions */}
                <PostInteractions
                  post={post}
                  initialComments={commentsByPost[post.id] || []}
                  initialLikes={likesByPost[post.id] || { count: 0, userLiked: false }}
                />
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Modal for messages */}
      <Modal
        isOpen={modalConfig.open}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={() => {
          setModalConfig({ ...modalConfig, open: false })
          if (modalConfig.onConfirm) {
            modalConfig.onConfirm()
          }
        }}
      />
    </div>
  )
}
