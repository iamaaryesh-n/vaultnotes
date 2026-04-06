import { useState, useEffect, useCallback } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Modal from "../components/Modal"
import PostInteractions from "../components/PostInteractions"
import { useSmartFetchPosts } from "../hooks/useSmartFetchPosts"
import { PostListSkeleton } from "../components/PostSkeleton"
import { usePostsRealtime } from "../hooks/usePostsRealtime"
import { EditProfileModal } from "../components/EditProfileModal"
import { FollowersModal } from "../components/FollowersModal"
import { FollowingModal } from "../components/FollowingModal"
import { useToast } from "../hooks/useToast"
import { fetchUserPublicWorkspaces } from "../lib/globalSearch"
import VisibilityBadge from "../components/VisibilityBadge"
import WorkspaceVisibilityBadge from "../components/WorkspaceVisibilityBadge"

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
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false)
  const [followersModalOpen, setFollowersModalOpen] = useState(false)
  const [followingModalOpen, setFollowingModalOpen] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [activeTab, setActiveTab] = useState("posts")
  const [isFollowing, setIsFollowing] = useState(false)
  const [workspaces, setWorkspaces] = useState([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  
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

  useEffect(() => {
    if (profile) {
      fetchFollowCounts()
    }
  }, [profile?.id])

  useEffect(() => {
    if (profile) {
      fetchWorkspaces()
    }
  }, [profile?.id, user?.id])

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

  const fetchFollowCounts = async () => {
    if (!profile?.id) return

    try {
      // Fetch followers count
      const { count: followers, error: followersError } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profile.id)

      if (!followersError) {
        setFollowersCount(followers || 0)
      }

      // Fetch following count
      const { count: following, error: followingError } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profile.id)

      if (!followingError) {
        setFollowingCount(following || 0)
      }

      console.log("[Profile] Follow counts:", { followers, following })
    } catch (err) {
      console.error("[Profile] Error fetching follow counts:", err)
    }
  }

  const fetchWorkspaces = async () => {
    if (!profile?.id || !user?.id) return

    try {
      setWorkspacesLoading(true)
      const isOwnProfile = user.id === profile.id

      if (isOwnProfile) {
        // Own profile: fetch all workspaces (public + private)
        const { data: memberData, error: memberError } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", profile.id)

        if (memberError) {
          console.error("[Profile] Error fetching workspace memberships:", memberError)
          setWorkspaces([])
          return
        }

        const workspaceIds = (memberData || []).map(m => m.workspace_id)
        
        if (workspaceIds.length === 0) {
          setWorkspaces([])
          return
        }

        const { data: workspaceData, error: workspaceError } = await supabase
          .from("workspaces")
          .select("id, name, created_at, is_public")
          .in("id", workspaceIds)
          .order("created_at", { ascending: false })

        if (workspaceError) {
          console.error("[Profile] Error fetching workspaces:", workspaceError)
          setWorkspaces([])
          return
        }

        setWorkspaces(workspaceData || [])
      } else {
        // Other user's profile: fetch only their public workspaces
        console.log("[Profile] Fetching public workspaces for user:", profile.id, "name:", profile.name)
        const publicWorkspaces = await fetchUserPublicWorkspaces(profile.id)
        console.log("[Profile] Found", publicWorkspaces.length, "public workspaces for this user")
        if (publicWorkspaces.length > 0) {
          console.log("[Profile] Workspaces:", publicWorkspaces.map(w => ({ id: w.id, name: w.name, is_public: w.is_public })))
        } else {
          console.log("[Profile] This user has no public workspaces")
        }
        setWorkspaces(publicWorkspaces)
      }
    } catch (err) {
      console.error("[Profile] Exception fetching workspaces:", err)
      setWorkspaces([])
    } finally {
      setWorkspacesLoading(false)
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

    // Check format (lowercase letters, numbers, and underscore only)
    if (!/^[a-z0-9_]+$/.test(username)) {
      setUsernameError("Username can only contain lowercase letters, numbers, and underscore")
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

  const handleEditProfileSave = async (updateData) => {
    if (!user) return

    // Validate username if changed
    if (updateData.username !== profile?.username) {
      // Check if username is taken
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", updateData.username)
        .neq("id", user.id)
        .single()

      if (existingUser) {
        throw new Error("Username is already taken")
      }

      if (checkError && checkError.code !== "PGRST116") {
        throw new Error(checkError.message)
      }
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id)

      if (error) {
        throw new Error(error.message)
      }

      setProfile({ ...profile, ...updateData })
      setNameInput(updateData.name)
      setUsernameInput(updateData.username)
      setBioInput(updateData.bio)

      window.dispatchEvent(new CustomEvent("profileUpdated", { detail: updateData }))

      setModalConfig({
        open: true,
        title: "Success",
        message: "Profile updated!",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } catch (err) {
      throw err
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
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-12">
        <div className="animate-pulse space-y-6">
          <div className="text-center space-y-4">
            <div className="w-32 h-32 rounded-full bg-slate-200 mx-auto"></div>
            <div className="h-8 bg-slate-200 rounded w-3/4 mx-auto"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto"></div>
          </div>
          <div className="h-10 bg-slate-200 rounded"></div>
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-12 text-center">
        <p className="text-slate-600 mb-4">Unable to load profile data.</p>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
        >
          Back to Home
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-8">
      {/* ========== Premium Profile Header ========== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden mb-8"
      >
        {/* Cover / Header Area */}
        <div className="h-24 md:h-32 bg-gradient-to-r from-blue-500 to-cyan-500"></div>

        {/* Profile Content */}
        <div className="relative px-6 md:px-8 pb-6">
          {/* Avatar */}
          <div className="flex flex-col md:flex-row md:items-end md:gap-6 -mt-16 md:-mt-12 mb-6">
            <div className="relative mb-4 md:mb-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 border-4 border-white flex items-center justify-center text-4xl font-bold text-white shadow-lg">
                  {profile?.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
              )}
              <label className="absolute bottom-0 right-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 cursor-pointer transition-colors shadow-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            {/* Profile Info */}
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900">{profile?.name || "User"}</h1>
              <p className="text-lg text-slate-600">@{profile?.username || "username"}</p>
              {profile?.bio && (
                <p className="text-slate-700 mt-2 max-w-2xl">{profile.bio}</p>
              )}
            </div>

            {/* Edit Button */}
            <div className="md:ml-auto">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setEditProfileModalOpen(true)}
                className="w-full md:w-auto px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors shadow-sm"
              >
                Edit Profile
              </motion.button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4 pt-6 border-t border-slate-200">
            {[
              { label: "Posts", value: posts.length },
              { label: "Followers", value: followersCount, onClick: () => setFollowersModalOpen(true), clickable: true },
              { label: "Following", value: followingCount, onClick: () => setFollowingModalOpen(true), clickable: true },
              { label: "Notes", value: 0 },
              { label: "Workspaces", value: 0 }
            ].map((stat, i) => (
              <motion.button
                key={i}
                whileHover={stat.clickable ? { backgroundColor: "#f1f5f9" } : {}}
                onClick={stat.onClick}
                disabled={!stat.clickable}
                className={`text-center py-3 rounded-lg transition-colors ${stat.clickable ? "hover:bg-slate-100 cursor-pointer" : ""}`}
              >
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-600 mt-1">{stat.label}</p>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ========== Tabs ========== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-slate-200"
      >
        {["posts", "notes", "workspaces", "media"].map((tab) => (
          <motion.button
            key={tab}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === tab
                ? "bg-blue-500 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </motion.button>
        ))}
      </motion.div>

      {/* ========== Tab Content ========== */}
      <AnimatePresence mode="wait">
        {activeTab === "posts" && (
          <motion.div
            key="posts"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {postsLoading ? (
              <PostListSkeleton count={3} />
            ) : posts.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
                <svg className="w-12 h-12 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2z" />
                </svg>
                <p className="text-slate-500 font-medium">No posts yet</p>
                <p className="text-slate-400 text-sm">Share your first post with the community!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post, index) => (
                  <motion.article
                    key={post.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border border-slate-200/60 rounded-xl bg-white p-5 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            if (post.profiles?.username) {
                              navigate(`/profile/${post.profiles.username}`)
                            }
                          }}
                          className="text-sm font-medium text-blue-500 hover:text-blue-700 hover:underline text-left"
                        >
                          @{post.profiles?.username || "unknown"}
                        </button>
                        <p className="text-xs text-slate-500 flex items-center gap-2">
                          <span>{formatPostTime(post.created_at)}</span>
                          <span>·</span>
                          <VisibilityBadge visibility={post.visibility || 'public'} size="xs" />
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        disabled={deletingPostId === post.id}
                        className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        {deletingPostId === post.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>

                    {post.content && (
                      <p className="text-gray-800 whitespace-pre-wrap leading-relaxed mb-3">{post.content}</p>
                    )}

                    {post.image_url && (
                      <img
                        src={post.image_url}
                        alt="Post"
                        className="w-full rounded-lg border border-slate-200 object-cover max-h-96 mb-3"
                      />
                    )}

                    <PostInteractions
                      post={post}
                      initialComments={commentsByPost[post.id] || []}
                      initialLikes={likesByPost[post.id] || { count: 0, userLiked: false }}
                    />
                  </motion.article>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "notes" && (
          <motion.div
            key="notes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="text-center py-12 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50"
          >
            <svg className="w-12 h-12 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-slate-500 font-medium">Notes feature coming soon</p>
          </motion.div>
        )}

        {activeTab === "workspaces" && (
          <motion.div
            key="workspaces"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {workspacesLoading ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
                <p className="text-slate-500 font-medium">Loading workspaces...</p>
              </div>
            ) : workspaces.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
                <svg className="w-12 h-12 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 5a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h2zm0 0a2 2 0 012 2v12a2 2 0 01-2 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2zm6 0v2M7 9h2" />
                </svg>
                <p className="text-slate-500 font-medium">No workspaces yet</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const isOwnProfile = user?.id === profile?.id
                  const publicWorkspaces = workspaces.filter(ws => ws.is_public)
                  const privateWorkspaces = workspaces.filter(ws => !ws.is_public)

                  return (
                    <>
                      {/* Public Workspaces Section */}
                      {publicWorkspaces.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <span>🌍</span> Public Workspaces
                          </h3>
                          <div className="space-y-2">
                            {publicWorkspaces.map((workspace) => (
                              <motion.div
                                key={workspace.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="border border-slate-200 rounded-lg bg-white p-4 hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
                                onClick={() => navigate(`/workspace/${workspace.id}`)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-medium text-gray-900">{workspace.name}</p>
                                      <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="xs" />
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      Created {new Date(workspace.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </p>
                                  </div>
                                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Private Workspaces Section (Own profile only) */}
                      {isOwnProfile && privateWorkspaces.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <span>🔒</span> Private Workspaces
                          </h3>
                          <div className="space-y-2">
                            {privateWorkspaces.map((workspace) => (
                              <motion.div
                                key={workspace.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="border border-slate-200 rounded-lg bg-white p-4 hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
                                onClick={() => navigate(`/workspace/${workspace.id}`)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-medium text-gray-900">{workspace.name}</p>
                                      <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="xs" />
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      Created {new Date(workspace.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </p>
                                  </div>
                                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "media" && (
          <motion.div
            key="media"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="text-center py-12 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50"
          >
            <svg className="w-12 h-12 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-slate-500 font-medium">Media gallery coming soon</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== Modals ========== */}
      <EditProfileModal
        isOpen={editProfileModalOpen}
        onClose={() => setEditProfileModalOpen(false)}
        profile={profile}
        avatarUrl={avatarUrl}
        onSave={handleEditProfileSave}
        onAvatarUpload={handleAvatarUpload}
        uploading={uploading}
      />

      <FollowersModal
        isOpen={followersModalOpen}
        onClose={() => setFollowersModalOpen(false)}
        userId={profile?.id}
        currentUserId={user?.id}
      />

      <FollowingModal
        isOpen={followingModalOpen}
        onClose={() => setFollowingModalOpen(false)}
        userId={profile?.id}
        currentUserId={user?.id}
      />

      {/* Standard Modal */}
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
