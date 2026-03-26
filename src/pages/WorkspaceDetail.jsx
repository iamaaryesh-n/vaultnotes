import { encrypt, decrypt, importKey } from "../utils/encryption"
import MemoryGrid from "../components/MemoryGrid"
import InviteUserModal from "../components/InviteUserModal"
import RemoveUserModal from "../components/RemoveUserModal"
import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { handleNavigationClick } from "../utils/navigation"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useToast } from "../hooks/useToast"
import { MemoryGridSkeleton } from "../components/SkeletonLoader"

export default function WorkspaceDetail() {

  const { id } = useParams()
  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  const searchInputRef = useRef(null)

  const [workspace, setWorkspace] = useState(null)
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [workspaceKey, setWorkspaceKey] = useState(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [sortOrder, setSortOrder] = useState("newest")
  const [deletingId, setDeletingId] = useState(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showRemoveUserModal, setShowRemoveUserModal] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)

  // Set up keyboard shortcuts (N for new memory, / for search, Esc to clear search)
  useKeyboardShortcuts({
    onSearchFocus: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    },
    onEscape: () => {
      if (searchTerm) {
        setSearchTerm("")
      }
    },
  })

  useEffect(() => {
    initialize()
  }, [])

  const validateSchema = async () => {
    const { error } = await supabase
      .from("memories")
      .select("encrypted_content, iv, is_favorite, workspace_id")
      .limit(1)

    if (error) {
      console.error("Database schema mismatch: missing column")
      console.error(JSON.stringify(error, null, 2))
    }
  }

  const initialize = async () => {
    // Get current user ID for owner checks
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (!userError && user) {
      setCurrentUserId(user.id)
    }

    await validateSchema()
    await fetchWorkspace()
    await loadWorkspaceKey()
    // Sort preference is now loaded via useEffect for proper dependency handling
  }

  const fetchWorkspace = async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, created_at, created_by")
      .eq("id", id)
      .single()

    if (error) {
      console.error(JSON.stringify(error, null, 2))
    }
    
    if (data) setWorkspace(data)
  }

  const loadWorkspaceKey = async () => {

    // 1️⃣ Try localStorage first
    let storedKey = localStorage.getItem(`workspace_key_${id}`)

    // 2️⃣ If not found, fetch from database
    if (!storedKey) {

      const {
        data: { user }
      } = await supabase.auth.getUser()

      const { data, error: keyError } = await supabase
        .from("workspace_keys")
        .select("encrypted_key")
        .eq("workspace_id", id)
        .eq("user_id", user.id)
        .single()

      if (keyError || !data?.encrypted_key) {
        console.error("Key fetch error:", JSON.stringify(keyError, null, 2))
        alert("No encryption key found for this workspace.")
        setLoading(false)
        return
      }

      storedKey = data.encrypted_key
      // Cache locally for fast future loads
      localStorage.setItem(`workspace_key_${id}`, storedKey)

    }

    const key = await importKey(storedKey)

    setWorkspaceKey(key)

    await fetchMemories(key)

  }

  const loadSortPreference = async () => {
    try {
      // Verify workspace ID
      console.log("[loadSortPreference] Starting. Workspace ID:", id)
      
      if (!id) {
        console.log("[loadSortPreference] No workspace ID, skipping")
        return
      }

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        console.log("[loadSortPreference] No user or auth error:", userError)
        return
      }

      console.log("[loadSortPreference] Fetching preference. User:", user.id, "Workspace:", id)

      // Step 1: Try to get user-specific preference
      const { data, error } = await supabase
        .from("user_workspace_preferences")
        .select("sort_order")
        .eq("user_id", user.id)
        .eq("workspace_id", id)
        .maybeSingle()

      console.log("[loadSortPreference] Preference query result:", { 
        dataExists: !!data, 
        sort_order: data?.sort_order, 
        errorCode: error?.code,
        errorMessage: error?.message,
        errorStatus: error?.status,
        fullError: error
      })

      if (error) {
        if (error.code === "PGRST204" || error.status === 404) {
          console.error("[loadSortPreference] TABLE NOT FOUND (404). Table 'user_workspace_preferences' may not exist in Supabase.")
          console.error("[loadSortPreference] Full error:", error)
        } else {
          console.error("[loadSortPreference] Unexpected error:", error)
        }
        return
      }

      // If user has a preference, use it
      if (data && data.sort_order) {
        console.log("[loadSortPreference] Using user preference:", data.sort_order)
        setSortOrder(data.sort_order)
        return
      }

      // Step 2: No user preference found, fetch workspace default_sort as fallback
      console.log("[loadSortPreference] No user preference found, fetching workspace default_sort as fallback")

      const { data: workspaceData, error: workspaceError } = await supabase
        .from("workspaces")
        .select("default_sort")
        .eq("id", id)
        .single()

      if (workspaceError) {
        console.warn("[loadSortPreference] Failed to fetch workspace default_sort:", workspaceError)
        console.log("[loadSortPreference] Falling back to default 'newest'")
        return
      }

      if (workspaceData && workspaceData.default_sort) {
        console.log("[loadSortPreference] Using workspace default_sort:", workspaceData.default_sort, "(FALLBACK TO WORKSPACE DEFAULT)")
        setSortOrder(workspaceData.default_sort)
      } else {
        console.log("[loadSortPreference] Workspace has no default_sort configured, keeping default 'newest'")
      }
    } catch (err) {
      console.error("[loadSortPreference] Exception:", err)
      // Silently fail - UI already has default "newest"
    }
  }

  // Load sort preference when workspace ID changes
  // This ensures preferences are loaded for each new workspace
  useEffect(() => {
    if (id) {
      console.log("[useEffect] Workspace changed, loading preferences for:", id)
      loadSortPreference()
    }
  }, [id])

  // Log whenever sortOrder state changes (for verification)
  useEffect(() => {
    console.log("[sortOrder changed] New value:", sortOrder)
  }, [sortOrder])

  const saveSortPreference = async (newSortOrder) => {
    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        console.error("[saveSortPreference] Auth error or no user:", userError)
        return
      }

      if (!id) {
        console.error("[saveSortPreference] No workspace ID")
        return
      }

      console.log("[saveSortPreference] Saving. SortOrder:", newSortOrder, "Workspace:", id, "User:", user.id)

      // Upsert the preference (insert if new, update if exists)
      const { error } = await supabase
        .from("user_workspace_preferences")
        .upsert(
          {
            user_id: user.id,
            workspace_id: id,
            sort_order: newSortOrder,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: "user_id,workspace_id"
          }
        )

      if (error) {
        if (error.code === "PGRST204" || error.status === 404) {
          console.error("[saveSortPreference] TABLE NOT FOUND (404). Table 'user_workspace_preferences' may not exist in Supabase.")
        }
        console.error("[saveSortPreference] Save failed:", {
          code: error.code,
          message: error.message,
          status: error.status,
          fullError: error
        })
      } else {
        console.log("[saveSortPreference] Saved successfully")
      }
    } catch (err) {
      console.error("[saveSortPreference] Exception:", err)
    }
  }

  const fetchMemories = async (key) => {
    console.log("Workspace ID:", id);

    const { data, error } = await supabase
      .from("memories")
      .select(`     id,
    title,
    encrypted_content,
    iv,
    created_at,
    updated_at,
    workspace_id,
    tags,
    is_favorite
  `)
      .eq("workspace_id", id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Full error:", JSON.stringify(error, null, 2));
    }

    if (data) {

      const decrypted = await Promise.all(
        data.map(async (memory) => {

          const text = await decrypt(
            memory.encrypted_content,
            memory.iv,
            key
          )

          return {
            ...memory,
            content: text
          }

        })
      )

      setMemories(decrypted)

    }

    setLoading(false)

  }

  const addMemory = async () => {

    if (!workspaceKey) return

    const content = prompt("Write memory:")
    if (!content) return

    const { ciphertext, iv } = await encrypt(content, workspaceKey)

    const {
      data: { user }
    } = await supabase.auth.getUser()

    await supabase.from("memories").insert([
      {
        workspace_id: id,
        title: "Untitled",
        encrypted_content: ciphertext,
        iv: iv,
        created_by: user.id
      }
    ])

    await fetchMemories(workspaceKey)

  }

  const handleDelete = async (memoryId) => {
    // Optimistic delete: remove from UI immediately
    const originalMemories = memories
    setMemories(prev => prev.filter(m => m.id !== memoryId))
    setDeletingId(memoryId)

    try {
      const { error } = await supabase
        .from("memories")
        .delete()
        .eq("id", memoryId)

      if (error) {
        console.error("Delete error:", error)
        // Rollback on error
        setMemories(originalMemories)
        showError("Failed to delete memory")
        setDeletingId(null)
        return
      }

      success("Deleted successfully")
      setDeletingId(null)
    } catch (err) {
      console.error("Delete failed:", err)
      // Rollback on error
      setMemories(originalMemories)
      showError("Something went wrong")
      setDeletingId(null)
    }
  }

  const handleFavoriteToggle = async (memoryId, currentStatus) => {
    // Optimistic UI Update
    setMemories(prev => prev.map(m => 
      m.id === memoryId ? { ...m, is_favorite: !currentStatus } : m
    ))

    // Background Database Sync
    const { error } = await supabase
      .from("memories")
      .update({ is_favorite: !currentStatus })
      .eq("id", memoryId)

    if (error) {
      console.error("Favorite toggle failed:", error)
      // Revert UI on failure
      setMemories(prev => prev.map(m => 
        m.id === memoryId ? { ...m, is_favorite: currentStatus } : m
      ))
    }
  }

  const filteredMemories = memories
    .filter((memory) => {
      if (showFavoritesOnly && !memory.is_favorite) return false
      const term = searchTerm.toLowerCase()
      if (!term) return true
      // Tag-specific search
      if (term.startsWith("#")) {
        const tagQuery = term.slice(1).trim()
        if (!tagQuery) return true
        return memory.tags?.some(tag => tag.toLowerCase().includes(tagQuery))
      }
      // Full text search (case-insensitive)
      const matchTitle = memory.title?.toLowerCase().includes(term)
      const matchContent = memory.content?.toLowerCase().replace(/<[^>]+>/g, ' ').includes(term)
      const matchTags = memory.tags?.some(tag => tag.toLowerCase().includes(term))
      return matchTitle || matchContent || matchTags
    })
    // Client-side sort: favorites on top, then by created_at based on sortOrder
    .sort((a, b) => {
      if (a.is_favorite === b.is_favorite) {
        const dateA = new Date(a.created_at)
        const dateB = new Date(b.created_at)
        return sortOrder === "newest" ? dateB - dateA : dateA - dateB
      }
      return a.is_favorite ? -1 : 1
    })

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
        <div style={{ maxWidth: '900px' }} className="mx-auto px-6 py-12">
          <div className="h-8 bg-slate-200 rounded mb-6 w-1/3 animate-pulse"></div>
          <div className="h-4 bg-slate-200 rounded mb-8 w-1/2 animate-pulse"></div>
          <MemoryGridSkeleton />
        </div>
      </div>
    )
  }

  return (

    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
      <div style={{ maxWidth: '900px' }} className="mx-auto px-6 py-12">

        <button
          onClick={(e) => handleNavigationClick(e, () => navigate("/"))}
          className="mb-6 text-yellow-500 hover:text-yellow-400 transition-colors font-medium"
        >
          ← Back to Workspaces
        </button>

        <div className="flex flex-col gap-3 mb-8">
          {/* Row 1: Title and Buttons */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">
                {workspace?.name}
              </h1>
              <p className="text-slate-500 text-sm mt-1">Encrypted memory vault</p>
            </div>
            <div className="flex gap-2">
              {workspace?.created_by === currentUserId && (
                <button
                  onClick={() => setShowRemoveUserModal(true)}
                  className="bg-slate-400 hover:bg-slate-300 active:scale-95 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  👥 Members
                </button>
              )}
              <button
                onClick={() => setShowInviteModal(true)}
                className="bg-slate-500 hover:bg-slate-400 active:scale-95 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md"
              >
                📤 Share
              </button>
              <button
                onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}/new`))}
                className="bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 px-5 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md"
              >
                + Add Memory
              </button>
            </div>
          </div>

          {/* Row 2: Filter and Sort Controls */}
          <div className="flex justify-between items-center">
            {/* Favorites Filter Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFavoritesOnly(false)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${!showFavoritesOnly ? 'bg-yellow-400 text-gray-900 shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
              >
                All
              </button>
              <button
                onClick={() => setShowFavoritesOnly(true)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${showFavoritesOnly ? 'bg-yellow-400 text-gray-900 shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                </svg>
                Favorites
              </button>
            </div>

            {/* Sort Control */}
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-500 font-medium">Sort:</span>
              <button
                onClick={() => {
                  setSortOrder("newest")
                  saveSortPreference("newest")
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${sortOrder === "newest" ? 'bg-slate-200 text-gray-900 shadow-sm border border-slate-300' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
              >
                Newest
              </button>
              <button
                onClick={() => {
                  setSortOrder("oldest")
                  saveSortPreference("oldest")
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${sortOrder === "oldest" ? 'bg-slate-200 text-gray-900 shadow-sm border border-slate-300' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
              >
                Oldest
              </button>
            </div>
          </div>
        </div>

        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search memories or #tags... (Press / to focus)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-3 mb-8 bg-white border border-slate-200 rounded-lg text-gray-900 placeholder-slate-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40 transition-all duration-200"
        />

        <MemoryGrid 
          memories={filteredMemories} 
          onDelete={handleDelete} 
          onFavoriteToggle={handleFavoriteToggle}
          onTagClick={(tag) => setSearchTerm(`#${tag}`)}
          onCreateMemory={() => navigate(`/workspace/${id}/new`)}
          searchTerm={searchTerm}
          deletingId={deletingId}
          emptyMessage={
            showFavoritesOnly 
              ? "No favorite memories yet ⭐\nStar a memory to pin it here"
              : (searchTerm ? "No results found 🔍" : "No memories yet ✨\nStart capturing your thoughts")
          }
        />

      </div>

      {showInviteModal && (
        <InviteUserModal
          onClose={() => setShowInviteModal(false)}
          workspaceId={id}
          onSuccess={() => {
            // Refresh members list if needed
            // For now, just close the modal
          }}
        />
      )}

      {showRemoveUserModal && (
        <RemoveUserModal
          onClose={() => setShowRemoveUserModal(false)}
          workspaceId={id}
          isOwner={workspace?.created_by === currentUserId}
          onUserRemoved={() => {
            // Optionally refresh memories if needed
          }}
        />
      )}
    </div>

  )

}