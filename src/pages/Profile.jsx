import { useState, useEffect, useCallback, lazy, Suspense } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate, useParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import Modal from "../components/Modal"
import PostInteractions from "../components/PostInteractions"
import { useSmartFetchPosts } from "../hooks/useSmartFetchPosts"
import { usePostsRealtime } from "../hooks/usePostsRealtime"
import { EditProfileModal } from "../components/EditProfileModal"
import { fetchUserPublicWorkspaces } from "../lib/globalSearch"
import VisibilityBadge from "../components/VisibilityBadge"
import WorkspaceVisibilityBadge from "../components/WorkspaceVisibilityBadge"

const FollowersModal = lazy(() =>
  import("../components/FollowersModal").then((module) => ({ default: module.FollowersModal }))
)
const FollowingModal = lazy(() =>
  import("../components/FollowingModal").then((module) => ({ default: module.FollowingModal }))
)

export default function Profile() {
  const navigate = useNavigate()
  const { username } = useParams()

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
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
  const [isFollowLoading, setIsFollowLoading] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [workspaces, setWorkspaces] = useState([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [activePostMenuId, setActivePostMenuId] = useState(null)
  const [editingPostId, setEditingPostId] = useState(null)
  const [editingPostContent, setEditingPostContent] = useState("")
  const [postContentOverrides, setPostContentOverrides] = useState({})
  
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
  }, [username])

  useEffect(() => {
    if (profile) {
      fetchFollowCounts()
    }
  }, [profile?.id])

  useEffect(() => {
    if (user && profile && user.id !== profile.id) {
      fetchFollowStatus()
    }
  }, [user?.id, profile?.id])

  useEffect(() => {
    if (profile) {
      fetchWorkspaces()
    }
  }, [profile?.id, user?.id])

  useEffect(() => {
    const handlePostMenuOutside = (event) => {
      const menuNode = event.target?.closest?.("[data-post-menu='true']")
      const triggerNode = event.target?.closest?.("[data-post-menu-trigger='true']")

      if (menuNode || triggerNode) {
        return
      }

      setActivePostMenuId(null)
    }

    if (activePostMenuId) {
      document.addEventListener("mousedown", handlePostMenuOutside)
      return () => document.removeEventListener("mousedown", handlePostMenuOutside)
    }
  }, [activePostMenuId])

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

      const profileQuery = supabase.from("profiles").select("*")
      const { data: profileData, error: profileError } = username
        ? await profileQuery.eq("username", username).single()
        : await profileQuery.eq("id", user.id).single()

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

        if (!username && profileData.username) {
          navigate(`/profile/${profileData.username}`, { replace: true })
        }

        // Posts will be fetched via useSmartFetchPosts hook automatically
      } else {
        if (username) {
          setModalConfig({
            open: true,
            title: "Not Found",
            message: `User \"@${username}\" not found.`,
            onConfirm: () => {
              setModalConfig({ ...modalConfig, open: false })
              navigate(-1)
            }
          })
          return
        }

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

  const fetchFollowStatus = async () => {
    if (!user?.id || !profile?.id || user.id === profile.id) {
      setIsFollowing(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", profile.id)
        .maybeSingle()

      if (error) {
        console.error("[Profile] Error fetching follow status:", error)
        return
      }

      setIsFollowing(!!data)
    } catch (err) {
      console.error("[Profile] Exception fetching follow status:", err)
    }
  }

  const handleFollowToggle = async () => {
    if (!user || !profile || user.id === profile.id) return

    try {
      setIsFollowLoading(true)

      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", profile.id)

        if (error) {
          throw error
        }

        setIsFollowing(false)
        setFollowersCount((prev) => Math.max(0, prev - 1))
        return
      }

      const { error } = await supabase
        .from("follows")
        .insert({
          follower_id: user.id,
          following_id: profile.id
        })

      if (error) {
        throw error
      }

      setIsFollowing(true)
      setFollowersCount((prev) => prev + 1)
    } catch (err) {
      console.error("[Profile] Error updating follow state:", err)
      setModalConfig({
        open: true,
        title: "Error",
        message: "Could not update follow status. Please try again.",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } finally {
      setIsFollowLoading(false)
    }
  }

  const handleStartChat = async () => {
    if (!user || !profile?.id || user.id === profile.id) return

    try {
      setIsChatLoading(true)

      const { data: existingConversation, error: existingError } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id")
        .or(`and(user1_id.eq.${user.id},user2_id.eq.${profile.id}),and(user1_id.eq.${profile.id},user2_id.eq.${user.id})`)
        .limit(1)
        .maybeSingle()

      if (existingError) {
        throw existingError
      }

      let conversationId = existingConversation?.id

      if (!conversationId) {
        const { data: newConversation, error: insertError } = await supabase
          .from("conversations")
          .insert({
            user1_id: user.id,
            user2_id: profile.id
          })
          .select("id")
          .single()

        if (insertError) {
          throw insertError
        }

        conversationId = newConversation?.id
      }

      if (conversationId) {
        navigate(`/chat?conversation=${conversationId}`)
      }
    } catch (err) {
      console.error("[Profile] Error starting chat:", err)
      setModalConfig({
        open: true,
        title: "Error",
        message: "Could not start chat. Please try again.",
        onConfirm: () => setModalConfig({ ...modalConfig, open: false })
      })
    } finally {
      setIsChatLoading(false)
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

  const handleEditProfileSave = async (updateData, mediaChanges = {}) => {
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
      const payload = {
        name: updateData.name,
        username: updateData.username,
        bio: updateData.bio
      }

      const createCroppedAvatarBlob = async (file, positionX, positionY, zoom) => {
        const imageUrl = URL.createObjectURL(file)

        try {
          const image = await new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = reject
            img.src = imageUrl
          })

          const outputSize = 512
          const canvas = document.createElement("canvas")
          canvas.width = outputSize
          canvas.height = outputSize

          const ctx = canvas.getContext("2d")
          if (!ctx) {
            throw new Error("Could not initialize avatar crop canvas")
          }

          const baseScale = Math.max(outputSize / image.width, outputSize / image.height)
          const drawScale = baseScale * (zoom || 1)
          const drawWidth = image.width * drawScale
          const drawHeight = image.height * drawScale

          const posX = (typeof positionX === "number" ? positionX : 50) / 100
          const posY = (typeof positionY === "number" ? positionY : 50) / 100

          const offsetX = outputSize * posX - drawWidth * posX
          const offsetY = outputSize * posY - drawHeight * posY

          ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)

          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
          if (!blob) {
            throw new Error("Failed to generate cropped avatar")
          }

          return blob
        } finally {
          URL.revokeObjectURL(imageUrl)
        }
      }

      const uploadFileToBucket = async (file, bucketName, fileName) => {
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(fileName, file, { upsert: true })

        if (uploadError) {
          throw new Error(`Failed to upload ${bucketName}: ${uploadError.message}`)
        }

        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName)

        return publicUrlData.publicUrl
      }

      if (mediaChanges.pendingAvatarFile) {
        const croppedAvatar = await createCroppedAvatarBlob(
          mediaChanges.pendingAvatarFile,
          mediaChanges.avatarPositionX,
          mediaChanges.avatarPositionY,
          mediaChanges.avatarZoom
        )
        payload.avatar_url = await uploadFileToBucket(croppedAvatar, "avatars", `${user.id}/avatar.jpg`)
      }

      if (mediaChanges.pendingCoverFile) {
        const coverExt = mediaChanges.pendingCoverFile.name.split(".").pop() || "jpg"
        payload.cover_photo_url = await uploadFileToBucket(mediaChanges.pendingCoverFile, "cover-photos", `${user.id}/cover.${coverExt}`)
      }

      if (typeof mediaChanges.coverPositionX === "number") {
        payload.cover_position_x = mediaChanges.coverPositionX
      }

      if (typeof mediaChanges.coverPositionY === "number") {
        payload.cover_position_y = mediaChanges.coverPositionY
      }

      if (typeof mediaChanges.coverZoom === "number") {
        payload.cover_zoom = mediaChanges.coverZoom
      }

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id)

      if (error) {
        throw new Error(error.message)
      }

      setProfile({ ...profile, ...payload })
      setNameInput(payload.name)
      setUsernameInput(payload.username)
      setBioInput(payload.bio)
      if (payload.avatar_url) {
        setAvatarUrl(payload.avatar_url)
      }

      window.dispatchEvent(new CustomEvent("profileUpdated", { detail: payload }))

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

  const handleStartEditingPost = (post) => {
    setEditingPostId(post.id)
    setEditingPostContent(postContentOverrides[post.id] ?? post.content ?? "")
    setActivePostMenuId(null)
  }

  const handleCancelEditingPost = () => {
    setEditingPostId(null)
    setEditingPostContent("")
  }

  const handleSaveEditingPostFrontend = () => {
    if (!editingPostId) {
      return
    }

    setPostContentOverrides((prev) => ({
      ...prev,
      [editingPostId]: editingPostContent
    }))
    setEditingPostId(null)
    setEditingPostContent("")
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
      <div className="min-h-screen bg-[#000000]">
        <div className="mx-auto w-full max-w-4xl px-4 py-12 text-[#F5F0E8] md:px-6">
        <div className="animate-pulse space-y-6">
          <div className="text-center space-y-4">
            <div className="mx-auto h-32 w-32 rounded-full bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }}></div>
            <div className="mx-auto h-8 w-3/4 rounded-[8px] bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }}></div>
            <div className="mx-auto h-4 w-1/2 rounded-[8px] bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }}></div>
          </div>
          <div className="h-10 rounded-[8px] bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }}></div>
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-24 rounded-[8px] bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }}></div>
            ))}
          </div>
        </div>
        </div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-[#000000]">
        <div className="mx-auto w-full max-w-4xl px-4 py-12 text-center text-[#F5F0E8] md:px-6">
        <p className="mb-4 text-[#A09080]">Unable to load profile data.</p>
        <button
          onClick={() => navigate(-1)}
          className="rounded-[10px] bg-[#F4B400] px-6 py-2 font-semibold text-[#0D0D0D] transition-colors hover:bg-[#C49000]"
        >
          Back to Home
        </button>
        </div>
      </div>
    )
  }

  const isOwnProfile = user?.id === profile?.id

  return (
    <div className="-mt-[64px] min-h-screen bg-[#000000]">
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-3 text-[#F5F0E8] md:px-6">
      {/* ========== Premium Social Header ========== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 overflow-hidden rounded-3xl border border-[#1F1F1F] bg-[#0D0D0D] shadow-[0_20px_50px_-30px_rgba(0,0,0,0.7)]"
      >
        {/* Section 1: Cover only */}
        <div className="relative z-0 h-[280px] overflow-hidden rounded-t-3xl md:h-[320px]">
          {profile?.cover_photo_url ? (
            <img
              src={profile.cover_photo_url}
              alt="Cover"
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${profile?.cover_position_x ?? 50}% ${profile?.cover_position_y ?? 50}%`,
                transform: `scale(${profile?.cover_zoom ?? 1})`,
                transformOrigin: "center center",
              }}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#1A1200] via-[#2A2000] to-[#1A0A00]" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(244,180,0,0.03) 40px, rgba(244,180,0,0.03) 80px)" }} />
          )}
        </div>

        {/* Section 2: Profile info row */}
        <div className="relative z-20 border-b border-[#1F1F1F] bg-[#000000] px-5 pb-4">
          <div className="mb-6 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-end gap-[14px]">
              <div className="relative z-10 -mt-[38px] shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    loading="lazy"
                    className="h-[76px] w-[76px] shrink-0 rounded-full border-[3px] border-[#000000] object-cover"
                  />
                ) : (
                  <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-[3px] border-[#000000] bg-[#2A2000] font-['Sora'] text-[26px] font-bold text-[#F4B400]">
                    {profile?.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                )}
              </div>

              <div className="flex flex-col">
                <h1 className="font-['Sora'] text-[18px] font-bold text-[#F5F0E8]">
                  {profile?.name || "User"}
                </h1>

                <p className="mt-[2px] text-[13px] text-[#5C5248]">
                  @{profile?.username || "username"}
                </p>

                {profile?.bio && (
                  <p className="mt-[8px] max-w-[380px] text-[13px] leading-relaxed text-[#A09080]">
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>

            <div className="flex w-full items-center gap-2 md:ml-6 md:w-auto">
              {isOwnProfile ? (
                <motion.button
                  onClick={() => setEditProfileModalOpen(true)}
                  className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#141414] px-4 py-[7px] font-['DM_Sans'] text-[13px] font-semibold text-[#F5F0E8] transition-colors hover:border-[#F4B400] hover:bg-[#1C1C1C] md:w-auto"
                >
                  Edit Profile
                </motion.button>
              ) : (
                <>
                  <button
                    onClick={handleFollowToggle}
                    disabled={isFollowLoading}
                    className={`flex-1 rounded-[10px] px-5 py-[7px] font-['DM_Sans'] text-[13px] transition-all md:flex-none ${
                      isFollowing
                        ? "border border-[#2A2A2A] bg-[#141414] font-semibold text-[#F5F0E8] hover:border-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] hover:text-[#EF4444]"
                        : "bg-[#F4B400] font-bold text-[#0D0D0D] hover:scale-[1.03] hover:bg-[#C49000] active:scale-[0.96]"
                    }`}
                  >
                    {isFollowLoading ? "Please wait..." : isFollowing ? "Following" : "Follow"}
                  </button>
                  <button
                    onClick={handleStartChat}
                    disabled={isChatLoading}
                    className="flex-1 rounded-[10px] border border-[#2A2A2A] bg-[#141414] px-4 py-[7px] font-['DM_Sans'] text-[13px] font-semibold text-[#F5F0E8] transition-colors hover:border-[#A09080] hover:bg-[#1C1C1C] md:flex-none"
                  >
                    {isChatLoading ? "Opening..." : "Message"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 flex overflow-hidden rounded-[12px] border border-[#1F1F1F] bg-[#0D0D0D]">
            {[
              { label: "Posts", value: posts.length },
              { label: "Followers", value: followersCount, onClick: () => setFollowersModalOpen(true), clickable: true },
              { label: "Following", value: followingCount, onClick: () => setFollowingModalOpen(true), clickable: true },
              { label: "Notes", value: 0 },
              { label: "Vaults", value: 0 }
            ].map((stat, i) => (
              <motion.button
                key={i}
                whileHover={{ backgroundColor: "#141414" }}
                onClick={stat.onClick}
                disabled={!stat.clickable}
                className="flex-1 border-r border-[#1F1F1F] py-3 text-center transition-colors last:border-r-0"
              >
                <p className="font-['Sora'] text-[17px] font-bold text-[#F5F0E8]">{stat.value}</p>
                <p className="mt-[2px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#5C5248]">{stat.label}</p>
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
        className="sticky top-0 z-20 mb-6 flex gap-1 overflow-x-auto border-b border-[#1F1F1F] bg-[#000000] px-5"
      >
        {["posts", "workspaces", "saved"].map((tab) => (
          <motion.button
            key={tab}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap border-b-[2px] px-4 py-3 font-['DM_Sans'] text-[13px] font-semibold transition-colors ${
              activeTab === tab
                ? "border-b-[#F4B400] text-[#F4B400]"
                : "border-b-transparent text-[#5C5248] hover:text-[#A09080]"
            }`}
          >
            {tab === "workspaces" ? "Vaults" : tab.charAt(0).toUpperCase() + tab.slice(1)}
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
              <div className="space-y-3 px-5 py-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-[14px] border border-[#1F1F1F] bg-[#0D0D0D] p-4 animate-pulse">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                      <div className="flex-1">
                        <div className="mb-1 h-4 w-32 rounded bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                        <div className="h-3 w-24 rounded bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                      </div>
                    </div>
                    <div className="mb-2 h-4 rounded bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                    <div className="mb-2 h-4 w-5/6 rounded bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                    <div className="h-40 rounded-[10px] bg-[#141414]" style={{ background: "linear-gradient(90deg, #141414 25%, #1C1C1C 50%, #141414 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="mx-5 my-4 bg-transparent p-10 text-center border border-dashed border-[#2A2A2A] rounded-[14px]">
                <svg className="mx-auto mb-2 h-12 w-12 text-[#5C5248]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2z" />
                </svg>
                <p className="text-[14px] font-semibold text-[#A09080]">No posts yet</p>
                <p className="text-[12px] text-[#5C5248]">Share your first post with the community!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-5 py-4">
                {posts.map((post, index) => (
                  <motion.article
                    key={post.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="rounded-[14px] border border-[#1F1F1F] bg-[#0D0D0D] p-4 transition-colors hover:border-[#2A2A2A]"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            if (post.profiles?.username) {
                              navigate(`/profile/${post.profiles.username}`)
                            }
                          }}
                          className="text-left text-sm font-medium text-[#F4B400] hover:text-[#C49000] hover:underline"
                        >
                          @{post.profiles?.username || "unknown"}
                        </button>
                        <p className="flex items-center gap-2 text-[11px] text-[#5C5248]">
                          <span>{formatPostTime(post.created_at)}</span>
                          <span>·</span>
                          <VisibilityBadge visibility={post.visibility || 'public'} size="xs" />
                        </p>
                      </div>
                      {isOwnProfile && (
                        <div className="relative">
                          <button
                            type="button"
                            data-post-menu-trigger="true"
                            onClick={(event) => {
                              event.stopPropagation()
                              setActivePostMenuId((prev) => (prev === post.id ? null : post.id))
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#1F1F1F] bg-[#141414] text-[#A09080] transition-colors hover:border-[#2A2A2A] hover:bg-[#1C1C1C] hover:text-[#F5F0E8]"
                            aria-label="Open post actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>

                          {activePostMenuId === post.id && (
                            <div
                              data-post-menu="true"
                              className="absolute right-0 top-10 z-20 min-w-[170px] rounded-[12px] border border-[#1F1F1F] bg-[#111111] p-1.5 shadow-2xl"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleStartEditingPost(post)}
                                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12px] font-semibold text-[#F5F0E8] transition-colors hover:bg-[#141414]"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit post
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleDeletePost(post.id)
                                  setActivePostMenuId(null)
                                }}
                                disabled={deletingPostId === post.id}
                                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12px] font-semibold text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {deletingPostId === post.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {editingPostId === post.id ? (
                      <div className="mb-3 rounded-[10px] border border-[#2A2A2A] bg-[#141414] p-3">
                        <textarea
                          value={editingPostContent}
                          onChange={(event) => setEditingPostContent(event.target.value)}
                          placeholder="Edit your post..."
                          rows={4}
                          className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-[#F5F0E8] outline-none placeholder:text-[#5C5248]"
                        />
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleCancelEditingPost}
                            className="rounded-[8px] border border-[#2A2A2A] bg-[#141414] px-3 py-1.5 text-[12px] font-semibold text-[#F5F0E8] transition-colors hover:bg-[#1C1C1C]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEditingPostFrontend}
                            className="rounded-[8px] bg-[#F4B400] px-3 py-1.5 text-[12px] font-bold text-[#0D0D0D] transition-colors hover:bg-[#C49000]"
                          >
                            Save (UI only)
                          </button>
                        </div>
                      </div>
                    ) : (
                      (postContentOverrides[post.id] || post.content) && (
                        <p className="mb-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[#F5F0E8]">
                          {postContentOverrides[post.id] || post.content}
                        </p>
                      )
                    )}

                    {post.image_url && (
                      <img
                        src={post.image_url}
                        alt="Post"
                        className="mb-3 max-h-96 w-full rounded-[10px] border border-[#1F1F1F] object-cover"
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

        {activeTab === "workspaces" && (
          <motion.div
            key="workspaces"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {workspacesLoading ? (
              <div className="mx-5 my-4 rounded-[14px] border border-dashed border-[#2A2A2A] bg-transparent p-10 text-center">
                <p className="text-[14px] font-semibold text-[#A09080]">Loading vaults...</p>
              </div>
            ) : workspaces.length === 0 ? (
              <div className="mx-5 my-4 rounded-[14px] border border-dashed border-[#2A2A2A] bg-transparent p-10 text-center">
                <svg className="mx-auto mb-2 h-12 w-12 text-[#5C5248]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 5a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h2zm0 0a2 2 0 012 2v12a2 2 0 01-2 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2zm6 0v2M7 9h2" />
                </svg>
                <p className="text-[14px] font-semibold text-[#A09080]">No vaults yet</p>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-6">
                {(() => {
                  const isOwnProfile = user?.id === profile?.id
                  const publicWorkspaces = workspaces.filter(ws => ws.is_public)
                  const privateWorkspaces = workspaces.filter(ws => !ws.is_public)

                  return (
                    <>
                      {/* Public Vaults Section */}
                      {publicWorkspaces.length > 0 && (
                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5C5248]">
                            <span>🌍</span> Public Vaults
                          </h3>
                          <div className="space-y-2">
                            {publicWorkspaces.map((workspace) => (
                              <motion.div
                                key={workspace.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="mb-2 flex cursor-pointer items-center justify-between rounded-[12px] border border-[#1F1F1F] bg-[#0D0D0D] px-4 py-[14px] transition-colors hover:border-[#2A2A2A] hover:bg-[#141414]"
                                onClick={() => navigate(`/workspace/${workspace.id}`)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-['DM_Sans'] text-[14px] font-semibold text-[#F5F0E8]">{workspace.name}</p>
                                      <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="xs" />
                                    </div>
                                    <p className="mt-[3px] text-[11px] text-[#5C5248]">
                                      Created {new Date(workspace.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </p>
                                  </div>
                                  <svg className="h-5 w-5 text-[#5C5248]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Private Vaults Section (Own profile only) */}
                      {isOwnProfile && privateWorkspaces.length > 0 && (
                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5C5248]">
                            <span>🔒</span> Private Vaults
                          </h3>
                          <div className="space-y-2">
                            {privateWorkspaces.map((workspace) => (
                              <motion.div
                                key={workspace.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="mb-2 flex cursor-pointer items-center justify-between rounded-[12px] border border-[#1F1F1F] bg-[#0D0D0D] px-4 py-[14px] transition-colors hover:border-[#2A2A2A] hover:bg-[#141414]"
                                onClick={() => navigate(`/workspace/${workspace.id}`)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-['DM_Sans'] text-[14px] font-semibold text-[#F5F0E8]">{workspace.name}</p>
                                      <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="xs" />
                                    </div>
                                    <p className="mt-[3px] text-[11px] text-[#5C5248]">
                                      Created {new Date(workspace.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </p>
                                  </div>
                                  <svg className="h-5 w-5 text-[#5C5248]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {activeTab === "saved" && (
          <motion.div
            key="saved"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="mx-5 my-4 rounded-[14px] border border-dashed border-[#2A2A2A] bg-transparent p-10 text-center"
          >
            <svg className="mx-auto mb-2 h-12 w-12 text-[#5C5248]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5h14v14H5zM8 3v4M16 3v4M8 17h8" />
            </svg>
            <p className="text-[14px] font-semibold text-[#A09080]">Saved items coming soon</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== Modals ========== */}
      <EditProfileModal
        isOpen={editProfileModalOpen}
        onClose={() => setEditProfileModalOpen(false)}
        profile={profile}
        avatarUrl={avatarUrl}
        coverPhotoUrl={profile?.cover_photo_url || null}
        onSave={handleEditProfileSave}
      />

      <Suspense fallback={null}>
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
      </Suspense>

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
    </div>
  )
}
