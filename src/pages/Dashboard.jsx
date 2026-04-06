import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { generateKey, exportKey, debugLogKey, validateKey } from "../utils/encryption"
import { leaveWorkspace, deleteWorkspaceCompletely } from "../lib/workspaceMembers"
import { handleNavigationClick } from "../utils/navigation"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useToast } from "../hooks/useToast"
import { WorkspaceListSkeleton } from "../components/SkeletonLoader"
import Modal from "../components/Modal"
import WorkspaceVisibilityBadge from "../components/WorkspaceVisibilityBadge"
import { useWorkspaceCacheStore } from "../stores/workspaceCacheStore"
import { fetchAllPublicWorkspaces } from "../lib/globalSearch"
import { motion } from "framer-motion"

export default function Dashboard({ session }) {

  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  
  // Cache store access
  const getCachedWorkspaces = useWorkspaceCacheStore(state => state.getCachedWorkspaces)
  const setCachedWorkspaces = useWorkspaceCacheStore(state => state.setCachedWorkspaces)
  const clearCache = useWorkspaceCacheStore(state => state.clearCache)

  // Initialize state from cache if available
  const cachedData = getCachedWorkspaces()
  const [workspaces, setWorkspaces] = useState(cachedData?.workspaces || [])
  const [loading, setLoading] = useState(!cachedData) // Only show loading if no cached data
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [userRoles, setUserRoles] = useState(cachedData?.userRoles || {}) // {workspaceId: role}
  const [ownerCounts, setOwnerCounts] = useState(cachedData?.ownerCounts || {}) // {workspaceId: ownerCount}
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false)
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceIsPublic, setWorkspaceIsPublic] = useState(false)
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState(null)
  const [editVisibilityId, setEditVisibilityId] = useState(null)
  const [currentVisibilityState, setCurrentVisibilityState] = useState(false)
  const [editVisibilityValue, setEditVisibilityValue] = useState(false)
  const [updatingVisibility, setUpdatingVisibility] = useState(false)
  const [publicWorkspaces, setPublicWorkspaces] = useState([])
  const [publicWorkspacesLoading, setPublicWorkspacesLoading] = useState(false)

  // Track fetch state to prevent duplicate calls
  const fetchControllerRef = useRef(null)
  const lastFetchTimeRef = useRef(0)
  const isFetchingRef = useRef(false)

  const fetchWorkspaces = useCallback(async () => {
    try {
      // Set loading to true at the start of the fetch
      setLoading(true)
      
      // Prevent multiple concurrent fetches
      if (isFetchingRef.current) {
        console.log("[Dashboard] Fetch already in progress, skipping duplicate request")
        return
      }

      // Cancel any pending fetch request
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort()
      }

      // Create new abort controller for this fetch
      fetchControllerRef.current = new AbortController()
      isFetchingRef.current = true

      const startTime = Date.now()
      console.log("[Dashboard] Starting workspace fetch at", startTime)

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.error("[Dashboard] Auth error:", authError)
        setLoading(false)
        isFetchingRef.current = false
        return
      }

      console.log("[Dashboard] Step 1: Fetching user's workspace memberships...")

      // Step 1: Fetch user's workspace memberships
      const { data: userMemberData, error: userMemberError } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", user.id)

      if (userMemberError) {
        console.error("[Dashboard] Failed to fetch user memberships:", userMemberError)
        setLoading(false)
        isFetchingRef.current = false
        return
      }

      const userRolesMap = {}
      const workspaceIds = []
      ;(userMemberData || []).forEach((m) => {
        userRolesMap[m.workspace_id] = m.role
        workspaceIds.push(m.workspace_id)
      })

      setUserRoles(userRolesMap)

      // If no workspaces, done loading
      if (workspaceIds.length === 0) {
        console.log("[Dashboard] User has no workspace memberships")
        setWorkspaces([])
        setOwnerCounts({})
        setLoading(false)
        isFetchingRef.current = false
        return
      }

      console.log(`[Dashboard] Step 2: Fetching ${workspaceIds.length} workspace(s)...`)

      // Step 2: Fetch workspace details
      const { data: workspaceData, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id, name, created_at, created_by, is_public")
        .in("id", workspaceIds)
        .order("created_at", { ascending: false })

      if (workspaceError) {
        console.error("[Dashboard] Failed to fetch workspaces:", workspaceError)
        setLoading(false)
        isFetchingRef.current = false
        return
      }

      setWorkspaces(workspaceData || [])

      console.log(`[Dashboard] Step 3: Counting owners for ${workspaceIds.length} workspace(s)...`)

      // Step 3: Count owners for each workspace
      const { data: memberData, error: memberError } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .in("workspace_id", workspaceIds)

      if (!memberError && memberData) {
        const ownerCountMap = {}
        memberData.forEach((m) => {
          if (m.role === "owner") {
            ownerCountMap[m.workspace_id] = (ownerCountMap[m.workspace_id] || 0) + 1
          }
        })
        setOwnerCounts(ownerCountMap)
        
        // Cache the fetched data for faster navigation
        setCachedWorkspaces(workspaceData || [], userRolesMap, ownerCountMap)
      }

      const elapsed = Date.now() - startTime
      console.log(`[Dashboard] ✅ Workspace fetch completed in ${elapsed}ms`)
      lastFetchTimeRef.current = Date.now()
    } catch (err) {
      console.error("[Dashboard] Error fetching workspaces:", err)
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [setCachedWorkspaces])

  const createWorkspace = useCallback(async () => {
    setWorkspaceName("")
    setShowCreateWorkspaceModal(true)
  }, [])

  const handleCreateWorkspaceConfirm = useCallback(async () => {
    const name = workspaceName.trim()
    if (!name) return

    setCreating(true)
    setShowCreateWorkspaceModal(false)

    try {
      // ===== STEP 0: AUTH CHECK =====
      console.log("[Dashboard/createWorkspace] Starting workspace creation flow...")
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError) {
        console.error("[Dashboard/createWorkspace] Auth error:", userError)
        showError(`Authentication error: ${userError.message}`)
        setCreating(false)
        return
      }

      if (!user) {
        console.error("[Dashboard/createWorkspace] No authenticated user")
        showError("Not authenticated. Please log in again.")
        setCreating(false)
        return
      }

      console.log(`[Dashboard/createWorkspace] User authenticated: ${user.id}`)

      // ===== STEP 1: GENERATE ENCRYPTION KEY =====
      console.log("[Dashboard/createWorkspace] Step 1: Generating encryption key...")
      let key, exportedKey
      try {
        key = await generateKey()
        exportedKey = await exportKey(key)
        
        const keyValidation = validateKey(exportedKey)
        debugLogKey(exportedKey, "Dashboard/createWorkspace")
        
        if (!keyValidation.isValid) {
          console.error("[Dashboard/createWorkspace] Key validation failed:", keyValidation.error)
          showError(`Encryption key generation failed: ${keyValidation.error}`)
          setCreating(false)
          return
        }
        console.log("[Dashboard/createWorkspace] ✅ Encryption key generated and validated")
      } catch (keyErr) {
        console.error("[Dashboard/createWorkspace] Key generation exception:", keyErr)
        showError(`Failed to generate encryption key: ${keyErr.message}`)
        setCreating(false)
        return
      }

      // ===== STEP 2: INSERT WORKSPACE =====
      console.log("[Dashboard/createWorkspace] Step 2: Inserting workspace row...")
      const createPayload = {
        name,
        created_by: user.id,
        is_public: workspaceIsPublic,
      }
      console.log("[Dashboard/createWorkspace]   Payload:", createPayload)

      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .insert(createPayload)
        .select()
        .single()

      if (workspaceError) {
        console.error("[Dashboard/createWorkspace] ❌ Workspace insert failed:", workspaceError)
        console.error("[Dashboard/createWorkspace]   Error code:", workspaceError.code)
        console.error("[Dashboard/createWorkspace]   Error message:", workspaceError.message)
        console.error("[Dashboard/createWorkspace]   Full error:", JSON.stringify(workspaceError, null, 2))
        showError(`Failed to create workspace: ${workspaceError.message}`)
        setCreating(false)
        return
      }

      if (!workspace?.id) {
        console.error("[Dashboard/createWorkspace] ❌ Workspace inserted but no ID returned")
        showError("Workspace created but ID not returned. Please refresh.")
        setCreating(false)
        return
      }

      console.log(`[Dashboard/createWorkspace] ✅ Workspace created: ${workspace.id}`)
      console.log(`[Dashboard/createWorkspace]   is_public in DB: ${workspace.is_public}`)

      // Cache key in localStorage immediately
      localStorage.setItem(`workspace_key_${workspace.id}`, exportedKey)
      console.log(`[Dashboard/createWorkspace] ✅ Encryption key cached in localStorage`)

      // ===== STEP 3: INSERT OWNER MEMBERSHIP =====
      console.log(`[Dashboard/createWorkspace] Step 3: Establishing owner membership (workspace: ${workspace.id}, user: ${user.id})...`)
      
      // First, check if membership already exists (might have been created by a trigger)
      const { data: existingMember, error: checkError } = await supabase
        .from("workspace_members")
        .select("id, role")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (checkError) {
        console.warn("[Dashboard/createWorkspace] ⚠️  Error checking membership:", checkError)
        // Don't fail here - will try insert anyway
      }

      if (existingMember) {
        console.log(`[Dashboard/createWorkspace] ✅ Membership already exists (role: ${existingMember.role}) - likely created by database trigger`)
      } else {
        // Membership doesn't exist, insert it
        console.log("[Dashboard/createWorkspace]   Membership not found, inserting...")
        const { error: memberError } = await supabase
          .from("workspace_members")
          .insert({
            workspace_id: workspace.id,
            user_id: user.id,
            role: "owner"
          })

        if (memberError) {
          // Check if it's a duplicate key error (race condition - trigger beat us)
          if (memberError.code === '23505' || memberError.message?.includes('duplicate key')) {
            console.warn("[Dashboard/createWorkspace] ⚠️  Duplicate key error (trigger likely created the row) - this is normal")
            console.log("[Dashboard/createWorkspace]   Verifying membership was created...")
            
            // Verify it was created
            const { data: verifyMember, error: verifyError } = await supabase
              .from("workspace_members")
              .select("id, role")
              .eq("workspace_id", workspace.id)
              .eq("user_id", user.id)
              .maybeSingle()
            
            if (verifyError) {
              console.error("[Dashboard/createWorkspace] ❌ Could not verify membership after duplicate key error:", verifyError)
              showError(`Membership verification failed: ${verifyError.message}`)
              setCreating(false)
              return
            }

            if (verifyMember) {
              console.log("[Dashboard/createWorkspace] ✅ Membership verified (role: " + verifyMember.role + ")")
            } else {
              console.error("[Dashboard/createWorkspace] ❌ Membership not found after insert attempt")
              showError("Failed to establish workspace ownership")
              setCreating(false)
              return
            }
          } else {
            // Unknown error
            console.error("[Dashboard/createWorkspace] ❌ Membership insert failed:", memberError)
            console.error("[Dashboard/createWorkspace]   Error code:", memberError.code)
            console.error("[Dashboard/createWorkspace]   Error message:", memberError.message)
            console.error("[Dashboard/createWorkspace]   Full error:", JSON.stringify(memberError, null, 2))
            showError(`Failed to establish ownership: ${memberError.message}`)
            setCreating(false)
            return
          }
        } else {
          console.log("[Dashboard/createWorkspace] ✅ Owner membership inserted successfully")
        }
      }

      // ===== STEP 4: INSERT WORKSPACE KEY =====
      console.log("[Dashboard/createWorkspace] Step 4: Storing encryption key in database...")
      
      // Insert member key (user-specific)
      const { error: keyError } = await supabase
        .from("workspace_keys")
        .insert({
          workspace_id: workspace.id,
          user_id: user.id,
          encrypted_key: exportedKey,
          key_scope: 'member'
        })

      if (keyError) {
        console.error("[Dashboard/createWorkspace] ⚠️  Workspace key storage failed:", keyError)
        console.error("[Dashboard/createWorkspace]   Error code:", keyError.code)
        console.error("[Dashboard/createWorkspace]   Error message:", keyError.message)
        console.error("[Dashboard/createWorkspace]   Full error:", JSON.stringify(keyError, null, 2))
        // Don't fail the whole flow - key is cached in localStorage anyway
        console.warn("[Dashboard/createWorkspace] Continuing despite key storage issue (localStorage backup available)")
      } else {
        console.log("[Dashboard/createWorkspace] ✅ Member encryption key stored in database")
      }

      // If public workspace, also insert a public read key (shared, no user_id)
      if (workspaceIsPublic) {
        console.log("[Dashboard/createWorkspace] Step 4b: Storing public read key for shared access...")
        const { error: publicKeyError } = await supabase
          .from("workspace_keys")
          .insert({
            workspace_id: workspace.id,
            user_id: null,  // No user - shared for all public viewers
            encrypted_key: exportedKey,
            key_scope: 'public_read'
          })

        if (publicKeyError) {
          console.error("[Dashboard/createWorkspace] ⚠️  Public read key storage failed:", publicKeyError)
          console.error("[Dashboard/createWorkspace]   Error code:", publicKeyError.code)
          console.error("[Dashboard/createWorkspace]   Error message:", publicKeyError.message)
          console.warn("[Dashboard/createWorkspace] Continuing - public read key optional")
        } else {
          console.log("[Dashboard/createWorkspace] ✅ Public read key stored for shared access")
        }
      }

      // ===== STEP 5: UPDATE LOCAL STATE AND NAVIGATE =====
      console.log("[Dashboard/createWorkspace] Step 5: Updating UI and navigating...")
      
      setWorkspaces((prev) => [workspace, ...prev])
      success(`Workspace "${name}" created!`)
      
      await fetchWorkspaces()
      window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId: workspace.id } }))
      
      setCreating(false)
      
      // Navigate to the new workspace
      console.log(`[Dashboard/createWorkspace] ✅ Navigating to /workspace/${workspace.id}`)
      setTimeout(() => {
        navigate(`/workspace/${workspace.id}`)
      }, 500)

    } catch (err) {
      console.error("[Dashboard/createWorkspace] ❌ Unexpected error during workspace creation:", err)
      console.error("[Dashboard/createWorkspace]   Error type:", err.constructor.name)
      console.error("[Dashboard/createWorkspace]   Error message:", err.message)
      console.error("[Dashboard/createWorkspace]   Stack:", err.stack)
      showError(`Failed to create workspace: ${err.message}`)
      setCreating(false)
    }
  }, [workspaceName, workspaceIsPublic, success, showError, fetchWorkspaces, navigate])

  useKeyboardShortcuts({
    onNewWorkspace: createWorkspace,
  })

  useEffect(() => {
    if (session) {
      fetchWorkspaces()
    }

    // Cleanup: cancel pending fetch requests on unmount
    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort()
        console.log("[Dashboard] Cancelled pending fetch on unmount")
      }
    }
  }, [session, fetchWorkspaces])

  useEffect(() => {
    const handleCreateWorkspace = () => {
      createWorkspace()
    }
    window.addEventListener("createWorkspace", handleCreateWorkspace)
    return () => window.removeEventListener("createWorkspace", handleCreateWorkspace)
  }, [createWorkspace])

  // Debounce membership change events to prevent excessive refetches
  const membershipChangeTimeoutRef = useRef(null)
  useEffect(() => {
    const handleMembershipChange = () => {
      // Debounce: only refetch if at least 1 second has passed since last fetch
      const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current

      if (membershipChangeTimeoutRef.current) {
        clearTimeout(membershipChangeTimeoutRef.current)
      }

      const delayMs = Math.max(0, 1000 - timeSinceLastFetch)
      console.log(`[Dashboard] Membership changed, refetching in ${delayMs}ms`)

      membershipChangeTimeoutRef.current = setTimeout(() => {
        fetchWorkspaces()
      }, delayMs)
    }

    window.addEventListener("workspaceMembershipChanged", handleMembershipChange)
    return () => {
      window.removeEventListener("workspaceMembershipChanged", handleMembershipChange)
      if (membershipChangeTimeoutRef.current) {
        clearTimeout(membershipChangeTimeoutRef.current)
      }
    }
  }, [fetchWorkspaces])

  const runWorkspaceAction = useCallback(async (workspaceId, action) => {
    const userRole = userRoles[workspaceId]
    const ownerCount = ownerCounts[workspaceId] || 0

    if (!userRole) {
      showError("Role information not loaded. Please refresh and try again.")
      return
    }

    if (action === "delete" && userRole !== "owner") {
      showError("Only owners can delete a workspace")
      return
    }

    if (action === "leave" && userRole === "owner" && ownerCount <= 1) {
      showError("Cannot leave workspace: at least one owner must remain")
      return
    }

    const originalWorkspaces = workspaces
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId))
    setDeletingId(workspaceId)

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.error("[Dashboard/runWorkspaceAction] Auth error:", authError)
        setWorkspaces(originalWorkspaces)
        showError("Authentication error")
        setDeletingId(null)
        return
      }


      const result = action === "delete"
        ? await deleteWorkspaceCompletely(user.id, workspaceId)
        : await leaveWorkspace(user.id, workspaceId)

      if (!result.success) {
        console.error("[Dashboard/runWorkspaceAction] Operation failed:", result.error)
        setWorkspaces(originalWorkspaces)
        showError(result.error || "Workspace action failed")
        setDeletingId(null)
        return
      }

      localStorage.removeItem(`workspace_key_${workspaceId}`)
      success(action === "delete" ? "Workspace deleted successfully" : "You've left the workspace")

      console.log(`[Dashboard] ${action === "delete" ? "Delete" : "Leave"} operation completed, scheduling refetch in 500ms...`)

      // Debounce refetch to avoid auth lock conflicts
      // The workspace has already been removed from UI optimistically, so no rush
      setTimeout(() => {
        console.log("[Dashboard] Executing debounced refetch after workspace action")
        fetchWorkspaces()
      }, 500)

      // Don't emit event since we're already refetching
      setDeletingId(null)
    } catch (err) {
      console.error("[Dashboard/runWorkspaceAction] Exception:", err)
      setWorkspaces(originalWorkspaces)
      showError("Something went wrong")
      setDeletingId(null)
    }
  }, [workspaces, userRoles, ownerCounts, success, showError, fetchWorkspaces])

  const deleteWorkspace = useCallback((workspaceId) => {
    setWorkspaceDeleteTarget(workspaceId)
  }, [])

  const leaveWorkspaceAction = useCallback((workspaceId) => {
    return runWorkspaceAction(workspaceId, "leave")
  }, [runWorkspaceAction])

  const openEditVisibility = useCallback((workspaceId, currentIsPublic) => {
    console.log("[Dashboard] Opening visibility editor. Current is_public:", currentIsPublic)
    setEditVisibilityId(workspaceId)
    setCurrentVisibilityState(currentIsPublic) // Store current state for display
    setEditVisibilityValue(currentIsPublic) // Initialize desired state to current state
  }, [])

  const handleUpdateVisibility = useCallback(async () => {
    if (!editVisibilityId) return

    console.log("[Dashboard] Starting visibility update...")
    console.log("[Dashboard] Workspace ID:", editVisibilityId)
    console.log("[Dashboard] New visibility value:", editVisibilityValue, "type:", typeof editVisibilityValue)

    setUpdatingVisibility(true)
    try {
      // Prepare update payload
      const updatePayload = { is_public: editVisibilityValue }
      console.log("[Dashboard] Update payload:", updatePayload)
      console.log("[Dashboard] Executing update query with condition: id = ", editVisibilityId)

      const { data: updatedData, error } = await supabase
        .from("workspaces")
        .update(updatePayload)
        .eq("id", editVisibilityId)
        .select("id, is_public, name")

      console.log("[Dashboard] Update response - data:", updatedData, "error:", error)

      if (error) {
        console.error("[Dashboard] Error updating visibility:", error)
        console.error("[Dashboard] Error details:", error.message, error.code, error.status)
        showError("Failed to update workspace visibility")
      } else {
        console.log("[Dashboard] ✅ Update executed. Response:", updatedData)
        
        // Verify the change by querying the workspace directly
        const { data: verifyData } = await supabase
          .from("workspaces")
          .select("id, is_public, name")
          .eq("id", editVisibilityId)
          .single()
        
        if (verifyData) {
          console.log("[Dashboard] 🔍 VERIFICATION: Workspace", verifyData.id, "now has is_public =", verifyData.is_public)
        }

        // Update the workspace in the state
        setWorkspaces(prev =>
          prev.map(ws =>
            ws.id === editVisibilityId ? { ...ws, is_public: editVisibilityValue } : ws
          )
        )
        success(editVisibilityValue ? "Workspace is now public" : "Workspace is now private")
        setEditVisibilityId(null)
        setCurrentVisibilityState(false)
        setEditVisibilityValue(false)
      }
    } catch (err) {
      console.error("[Dashboard] Exception updating visibility:", err)
      showError("Something went wrong")
    } finally {
      setUpdatingVisibility(false)
    }
  }, [editVisibilityId, editVisibilityValue, success, showError, workspaces, currentVisibilityState])

  const fetchPublicWorkspaces = useCallback(async () => {
    setPublicWorkspacesLoading(true)
    try {
      console.log("[Dashboard] Fetching public workspaces for discovery section...")
      const { workspaces: data, error } = await fetchAllPublicWorkspaces(6)
      if (error) {
        console.error("[Dashboard] Error fetching public workspaces:", error)
        setPublicWorkspaces([])
      } else {
        console.log("[Dashboard] Fetched", data?.length || 0, "total public workspaces")
        console.log("[Dashboard] User's own workspaces count:", workspaces.length)
        // Filter out workspaces user is already a member of
        const filtered = (data || []).filter(ws => !workspaces.find(uw => uw.id === ws.id))
        console.log("[Dashboard] After filtering user's workspaces:", filtered.length, "public workspaces to discover")
        if (filtered.length > 0) {
          console.log("[Dashboard] Discover workspaces:", filtered.map(w => ({ id: w.id, name: w.name })))
        }
        setPublicWorkspaces(filtered)
      }
    } catch (err) {
      console.error("[Dashboard] Exception fetching public workspaces:", err)
      setPublicWorkspaces([])
    } finally {
      setPublicWorkspacesLoading(false)
    }
  }, [workspaces])

  useEffect(() => {
    fetchPublicWorkspaces()
  }, [fetchPublicWorkspaces])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
        <div style={{ maxWidth: "900px" }} className="mx-auto px-6 py-12">
          <h1 className="text-4xl text-yellow-500 font-bold mb-2">My Workspaces</h1>
          <p className="text-slate-600 mb-8">Manage your encrypted knowledge spaces</p>
          <WorkspaceListSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
      <div style={{ maxWidth: "900px" }} className="mx-auto px-6 py-12">
        <h1 className="text-4xl text-yellow-500 font-bold mb-2">My Workspaces</h1>
        <p className="text-slate-600 mb-8">Manage your encrypted knowledge spaces</p>

        <button
          onClick={createWorkspace}
          disabled={creating}
          className="bg-yellow-500 hover:bg-yellow-400 hover:shadow-md active:scale-95 text-gray-900 px-6 py-3 rounded-lg mb-8 font-semibold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-yellow-500"
        >
          {creating ? "Creating..." : "+ Create Workspace"}
        </button>

        {workspaces.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-slate-600 text-lg mb-6">No workspaces yet</p>
            <p className="text-slate-500 text-sm mb-6">Start capturing your thoughts by creating your first workspace</p>
            <button
              onClick={createWorkspace}
              disabled={creating}
              className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg font-semibold transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create Your First Workspace"}
            </button>
            <p className="text-xs text-slate-400 mt-4">Tip: Press "W" to create a new workspace</p>
          </div>
        ) : (
          workspaces.map((workspace) => (
            <div
              key={workspace.id}
              onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${workspace.id}`))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  navigate(`/workspace/${workspace.id}`)
                }
              }}
              role="button"
              tabIndex={0}
              className="card p-6 mb-4 hover:shadow-lg hover:-translate-y-1 cursor-pointer group transition-all duration-200 bg-white border border-slate-200"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-lg font-semibold text-gray-900 group-hover:text-yellow-500 transition-colors">
                    {workspace.name}
                  </div>
                  <div className="mt-2">
                    <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="sm" />
                  </div>
                </div>

                {(() => {
                  const role = userRoles[workspace.id]
                  const isOwner = role === "owner"
                  const hasMultipleOwners = (ownerCounts[workspace.id] || 0) > 1
                  const isDeleting = deletingId === workspace.id

                  return (
                    <div className="flex items-center gap-2">
                      {isOwner && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditVisibility(workspace.id, workspace.is_public)
                          }}
                          className="opacity-60 group-hover:opacity-100 transition-all duration-200 px-3 py-1.5 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Change workspace visibility"
                        >
                          Settings
                        </button>
                      )}

                      {isOwner && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteWorkspace(workspace.id)
                          }}
                          disabled={isDeleting}
                          className="opacity-60 group-hover:opacity-100 transition-all duration-200 px-3 py-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Delete this workspace permanently"
                        >
                          {isDeleting ? "..." : "Delete Workspace"}
                        </button>
                      )}

                      {((isOwner && hasMultipleOwners) || role === "editor" || role === "viewer") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            leaveWorkspaceAction(workspace.id)
                          }}
                          disabled={isDeleting}
                          className="opacity-60 group-hover:opacity-100 transition-all duration-200 px-3 py-1.5 rounded text-orange-400 hover:text-orange-600 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Leave this workspace"
                        >
                          {isDeleting ? "..." : "Leave Workspace"}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          ))
        )}

        {/* Discover Public Workspaces Section */}
        {publicWorkspaces.length > 0 && (
          <div className="mt-16 pt-8 border-t border-slate-200">
            <h2 className="text-2xl text-slate-700 font-bold mb-2">🌍 Discover Public Workspaces</h2>
            <p className="text-slate-500 text-sm mb-6">Join public workspaces from the community</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {publicWorkspaces.map((workspace) => (
                <motion.div
                  key={workspace.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card p-5 border border-slate-200 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                  onClick={() => navigate(`/workspace-preview/${workspace.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate group-hover:text-yellow-500 transition-colors">
                        {workspace.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Created {new Date(workspace.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-2">
                      <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="xs" />
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/workspace-preview/${workspace.id}`)
                    }}
                    className="w-full mt-3 px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 text-sm font-medium rounded-lg transition-colors"
                  >
                    View Workspace
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showCreateWorkspaceModal}
        title="Create Workspace"
        message="Create a new encrypted workspace for your memories."
        inputValue={workspaceName}
        onInputChange={setWorkspaceName}
        inputPlaceholder="Enter workspace name"
        confirmText="Create"
        confirmVariant="primary"
        confirmDisabled={!workspaceName.trim() || creating}
        isLoading={creating}
        onConfirm={handleCreateWorkspaceConfirm}
        onCancel={() => {
          setShowCreateWorkspaceModal(false)
          setWorkspaceName("")
          setWorkspaceIsPublic(false)
        }}
      >
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={workspaceIsPublic}
                onChange={(e) => setWorkspaceIsPublic(e.target.checked)}
                className="h-5 w-5 rounded cursor-pointer accent-yellow-500"
              />
            </div>
            <span className="text-sm font-medium text-slate-900 group-hover:text-slate-700">
              Public workspace
            </span>
          </label>
          <p className="text-xs text-slate-500 pl-8">
            Visible to everyone, editable only by owner and members
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(workspaceDeleteTarget)}
        title="Delete Workspace"
        message="Are you sure you want to delete this workspace? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (!workspaceDeleteTarget) return
          runWorkspaceAction(workspaceDeleteTarget, "delete")
          setWorkspaceDeleteTarget(null)
        }}
        onCancel={() => {
          console.log("[Dashboard] Workspace delete cancelled by user")
          setWorkspaceDeleteTarget(null)
        }}
      />

      <Modal
        open={Boolean(editVisibilityId)}
        title="Change Workspace Visibility"
        message={currentVisibilityState ? "This workspace is currently PUBLIC and visible to everyone." : "This workspace is currently PRIVATE and only visible to members."}
        confirmText={editVisibilityValue ? "Make Public" : "Make Private"}
        confirmVariant="primary"
        isLoading={updatingVisibility}
        onConfirm={handleUpdateVisibility}
        onCancel={() => {
          setEditVisibilityId(null)
          setCurrentVisibilityState(false)
          setEditVisibilityValue(false)
        }}
      >
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={editVisibilityValue}
                onChange={(e) => {
                  setEditVisibilityValue(e.target.checked)
                  console.log("[Dashboard] Visibility toggle changed to:", e.target.checked)
                }}
                className="h-5 w-5 rounded cursor-pointer accent-yellow-500"
              />
            </div>
            <span className="text-sm font-medium text-slate-900 group-hover:text-slate-700">
              Make public
            </span>
          </label>
          <p className="text-xs text-slate-500 pl-8">
            {editVisibilityValue 
              ? "✓ Will be visible to everyone, editable only by owner and members"
              : "✓ Only visible to members, editable only by owner and members"
            }
          </p>
        </div>
      </Modal>
    </div>
  )
}


