import { useState, useEffect, useCallback } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import Modal from "../components/Modal"
import PostInteractions from "../components/PostInteractions"
import { useSmartFetchPosts } from "../hooks/useSmartFetchPosts"
import { PostListSkeleton } from "../components/PostSkeleton"
import { usePostsRealtime } from "../hooks/usePostsRealtime"

export default function Profile() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingPostId, setDeletingPostId] = useState(null)
  const [nameInput, setNameInput] = useState("")
  const [usernameInput, setUsernameInput] = useState("")
  const [bioInput, setBioInput] = useState("")
  const [usernameError, setUsernameError] = useState("")
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [modalConfig, setModalConfig] = useState({ open: false, title: "", message: "", onConfirm: null })
  const [editMode, setEditMode] = useState(false)
  
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
        .select("id, user_id, content, image_url, created_at, profiles(username)")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[Profile] Error fetching posts:", error)
        throw error
      }

      return data || []
    },
    `profile_${profile?.id || 'loading'}`,
    false // Don't force fresh on initial mount
  )

  useEffect(() => {
    fetchUserAndProfile()
  }, [])

  const fetchUserAndProfile = async () => {
    try {
      setLoading(true)

      // Get current authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error("[Profile] Auth error:", authError)
        setModalConfig({
          open: true,
          title: "Error",
          message: "Unable to fetch user data. Please log in again.",
          onConfirm: () => {
            setModalConfig({ ...modalConfig, open: false })
            navigate("/")
          }
        })
        return
      }

      setUser(user)
      console.log("[Profile] Fetched user:", user)

      // Fetch user's profile from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError && profileError.code !== "PGRST116") {
        // PGRST116 = no rows returned, which is fine for new users
        console.error("[Profile] Error fetching profile:", profileError.message)
      }

      if (profileData) {
        setProfile(profileData)
        setNameInput(profileData.name || "")
        setUsernameInput(profileData.username || "")
        setBioInput(profileData.bio || "")
        if (profileData.avatar_url) {
          setAvatarUrl(profileData.avatar_url)
        }
        console.log("[Profile] Fetched profile:", profileData)
        // Posts will be fetched via useSmartFetchPosts hook automatically
      } else {
        // Create default profile if it doesn't exist
        console.log("[Profile] No profile found, creating default profile")
        const { data: newProfile, error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email,
            name: user.email.split("@")[0] || "",
            bio: "",
            avatar_url: null
          })
          .select()
          .single()

        if (!insertError && newProfile) {
          setProfile(newProfile)
          setNameInput(newProfile.name || "")
          setBioInput(newProfile.bio || "")
          console.log("[Profile] Created default profile:", newProfile)
          // Posts will be fetched via useSmartFetchPosts hook automatically
        } else {
          console.warn("[Profile] Could not create default profile:", insertError?.message)
          // Set basic profile structure anyway
          setProfile({
            id: user.id,
            email: user.email,
            name: user.email.split("@")[0] || "",
            bio: "",
            avatar_url: null
          })
          setNameInput(user.email.split("@")[0] || "")
          setBioInput("")
          // Posts will be fetched via useSmartFetchPosts hook automatically
        }
      }
    } catch (err) {
      console.error("[Profile] Exception:", err.message)
      setModalConfig({
        open: true,
        title: "Error",
        message: "Failed to load profile. Please try again.",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    try {
      setUploading(true)
      console.log("[Profile] Starting avatar upload for user:", user.id)

      // Create a unique filename using user ID and timestamp
      const fileExt = file.name.split(".").pop()
      const fileName = `${user.id}.${fileExt}`

      // Upload file to storage bucket
      const { data, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true })

      if (uploadError) {
        console.error("[Profile] Upload error:", uploadError.message)
        setModalConfig({
          open: true,
          title: "Upload Error",
          message: "Failed to upload avatar. " + uploadError.message,
          onConfirm: () => setModalConfig({ ...modalConfig, open: false })
        })
        setUploading(false)
        return
      }

      console.log("[Profile] File uploaded successfully:", data)

      // Get public URL for the uploaded file
      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)

      const publicUrl = publicUrlData.publicUrl
      console.log("[Profile] Public URL:", publicUrl)

      // Update profile with avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id)

      if (updateError) {
        console.error("[Profile] Error updating avatar URL:", updateError.message)
        setModalConfig({
          open: true,
          title: "Update Error",
          message: "Failed to save avatar URL. " + updateError.message,
          onConfirm: () => setModalConfig({ ...modalConfig, open: false })
        })
        setUploading(false)
        return
      }

      setAvatarUrl(publicUrl)
      setProfile({ ...profile, avatar_url: publicUrl })
      console.log("[Profile] Avatar updated successfully:", publicUrl)

      // Dispatch event for Navbar to update
      window.dispatchEvent(new CustomEvent("profileUpdated", { detail: { avatar_url: publicUrl } }))

      setModalConfig({
        open: true,
        title: "Success",
        message: "Avatar uploaded successfully!",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } catch (err) {
      console.error("[Profile] Exception during upload:", err.message)
      setModalConfig({
        open: true,
        title: "Error",
        message: "An error occurred while uploading. Please try again.",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } finally {
      setUploading(false)
    }
  }

  const validateUsername = (username) => {
    // Clear previous errors
    setUsernameError("")

    // Check length
    if (username.length < 3) {
      setUsernameError("Username must be at least 3 characters")
      return false
    }

    // Check length max
    if (username.length > 20) {
      setUsernameError("Username must be no more than 20 characters")
      return false
    }

    // Check format (lowercase letters and numbers only)
    if (!/^[a-z0-9]+$/.test(username)) {
      setUsernameError("Username can only contain lowercase letters and numbers")
      return false
    }

    return true
  }

  const handleUsernameChange = (e) => {
    const value = e.target.value.toLowerCase()
    setUsernameInput(value)
    // Validate as user types
    if (value) {
      validateUsername(value)
    } else {
      setUsernameError("")
    }
  }

  const handleSaveChanges = async () => {
    if (!user) return

    // Validate username if changed
    if (usernameInput !== profile?.username) {
      if (!validateUsername(usernameInput)) {
        return
      }

      // Check if username is taken
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", usernameInput)
        .neq("id", user.id)
        .single()

      if (existingUser) {
        setUsernameError("Username is already taken")
        return
      }

      if (checkError && checkError.code !== "PGRST116") {
        console.error("[Profile] Error checking username:", checkError.message)
      }
    }

    try {
      setSaving(true)
      const updateData = {
        name: nameInput.trim(),
        username: usernameInput.trim(),
        bio: bioInput.trim()
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id)

      if (error) {
        console.error("[Profile] Error saving changes:", error.message)
        setModalConfig({
          open: true,
          title: "Error",
          message: "Failed to save changes. " + error.message,
          onConfirm: () => setModalConfig({ ...modalConfig, open: false })
        })
        return
      }

      setProfile({ ...profile, ...updateData })
      setUsernameError("")
      setEditMode(false)

      window.dispatchEvent(new CustomEvent("profileUpdated", { 
        detail: { 
          name: updateData.name,
          username: updateData.username,
          bio: updateData.bio
        } 
      }))

      setModalConfig({
        open: true,
        title: "Success",
        message: "Profile updated!",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } catch (err) {
      console.error("[Profile] Exception saving changes:", err.message)
      setModalConfig({
        open: true,
        title: "Error",
        message: "An error occurred while saving. Please try again.",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
      await supabase.auth.signOut()
      navigate("/login")
    } catch (err) {
      console.error("[Profile] Logout error:", err.message)
      setModalConfig({
        open: true,
        title: "Error",
        message: "Failed to logout. Please try again.",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    }
  }

  const handleDeletePost = async (postId) => {
    if (!postId) return

    try {
      setDeletingPostId(postId)
      const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", user.id)

      if (error) {
        console.error("[Profile] Error deleting post:", error)
        setModalConfig({
          open: true,
          title: "Error",
          message: "Failed to delete post. " + error.message,
          onConfirm: () => setModalConfig({ ...modalConfig, open: false })
        })
        return
      }

      // Filter out deleted post from local cache
      // Note: In a production app, you might trigger a cache invalidation instead
      console.log("[Profile] Post deleted successfully")
    } catch (err) {
      console.error("[Profile] Exception deleting post:", err)
      setModalConfig({
        open: true,
        title: "Error",
        message: "An unexpected error occurred while deleting post.",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } finally {
      setDeletingPostId(null)
    }
  }

  // Memoized realtime handlers - stable across renders
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
          console.warn("[Profile] Failed to resolve post_id for deleted comment:", fetchError)
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

  if (loading) {
    return (
      <div style={{ maxWidth: "500px" }} className="mx-auto px-6 py-12">
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

  if (!user || !profile) {
    return (
      <div style={{ maxWidth: "500px" }} className="mx-auto px-6 py-12">
        <h1 className="text-4xl text-yellow-500 font-bold mb-8">Profile</h1>
        <div className="card p-8 text-center">
          <p className="text-gray-600">Unable to load profile data.</p>
          <button
            onClick={() => navigate("/")}
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
        {/* Avatar Section (always visible) */}
        <div className="text-center mb-8">
          {avatarUrl ? (
            <img
              src={avatarUrl}
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

          <label
            htmlFor="avatar-upload"
            className={`block w-full px-4 py-3 rounded-lg font-semibold transition-all duration-200 shadow-sm cursor-pointer text-center ${
              uploading
                ? "bg-gray-400 text-gray-700 cursor-not-allowed opacity-50"
                : "bg-yellow-500 hover:bg-yellow-400 text-gray-900 hover:shadow-md"
            }`}
          >
            {uploading ? "Uploading..." : avatarUrl ? "Change Avatar" : "Upload Avatar"}
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            disabled={uploading}
            className="hidden"
          />
        </div>

        {editMode ? (
          /* ===== EDIT MODE ===== */
          <>
            {/* Name Input */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
            </div>

            {/* Username Input */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
              <input
                type="text"
                value={usernameInput}
                onChange={handleUsernameChange}
                placeholder="Enter your username (lowercase, numbers only)"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${
                  usernameError
                    ? "border-red-300 focus:ring-red-400"
                    : "border-gray-300 focus:ring-yellow-400"
                }`}
              />
              {usernameError && (
                <p className="text-xs text-red-600 mt-1">{usernameError}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">3-20 characters, lowercase letters and numbers only</p>
            </div>

            {/* Bio Input */}
            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Bio</label>
              <textarea
                value={bioInput}
                onChange={(e) => setBioInput(e.target.value)}
                placeholder="Write a short bio..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
              />
            </div>

            {/* Edit Mode Buttons */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => {
                  setEditMode(false)
                  setNameInput(profile?.name || "")
                  setUsernameInput(profile?.username || "")
                  setBioInput(profile?.bio || "")
                  setUsernameError("")
                }}
                disabled={saving}
                className="flex-1 px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={saving || !nameInput.trim() || !usernameInput.trim()}
                className="flex-1 px-4 py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            <button
              onClick={() => navigate("/")}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
          </>
        ) : (
          /* ===== VIEW MODE ===== */
          <>
            {/* Profile Info Display */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">{profile?.name || "User"}</h2>
              <p className="text-slate-500">@{profile?.username || "username"}</p>
              {profile?.bio ? (
                <p className="text-sm text-slate-600 mt-2 max-w-xl mx-auto">{profile.bio}</p>
              ) : (
                <p className="text-sm text-slate-400 mt-2">No bio added yet.</p>
              )}
            </div>

            {/* View Mode Buttons */}
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => setEditMode(true)}
                className="flex-1 px-4 py-3 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-bold"
              >
                Edit Profile
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-3 rounded-lg bg-red-500 hover:bg-red-400 text-white font-bold"
              >
                Logout
              </button>
              <button
                onClick={() => navigate("/")}
                className="flex-1 px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>

      {/* ============ SECTION 2: POSTS LIST ============ */}
      <div className="card p-8">
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Posts</h3>
        </div>

        {postsLoading ? (
          <PostListSkeleton count={3} />
        ) : posts.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-slate-500">
            No posts yet
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const isOwner = user?.id === post.user_id

              return (
                <article
                  key={post.id}
                  className="border border-slate-200 rounded-xl p-5 bg-white hover:shadow-md transition-shadow duration-200"
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
                      <p className="text-xs text-slate-500">{formatPostTime(post.created_at)}</p>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        disabled={deletingPostId === post.id}
                        className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        {deletingPostId === post.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
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
              )
            })}
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
