import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { generateKey, exportKey, debugLogKey, validateKey } from "../utils/encryption"
import { leaveWorkspace, deleteWorkspaceCompletely } from "../lib/workspaceMembers"
import { handleNavigationClick } from "../utils/navigation"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useToast } from "../hooks/useToast"
import { useRouteScrollRestoration } from "../hooks/useRouteScrollRestoration"
import Modal from "../components/Modal"
import { useWorkspaceCacheStore } from "../stores/workspaceCacheStore"
import { useWorkspaceStore } from "../stores/workspaceStore"
import { useNavigationStore } from "../stores/navigationStore"

export default function Dashboard({ session }) {

  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  
  // Cache store access
  const getCachedWorkspaces = useWorkspaceCacheStore(state => state.getCachedWorkspaces)
  const setCachedWorkspaces = useWorkspaceCacheStore(state => state.setCachedWorkspaces)
  const clearCache = useWorkspaceCacheStore(state => state.clearCache)
  const workspaceListCache = useWorkspaceStore((state) => state.workspaceList)
  const shouldFetchWorkspaceList = useWorkspaceStore((state) => state.shouldFetchWorkspaceList)
  const setWorkspaceListStore = useWorkspaceStore((state) => state.setWorkspaceList)
  const setCurrentWorkspaceStore = useWorkspaceStore((state) => state.setCurrentWorkspace)
  const setLastOpenedWorkspaceId = useNavigationStore((state) => state.setLastOpenedWorkspaceId)

  useRouteScrollRestoration("workspaces-list")

  // Initialize state from cache if available
  const cachedData = getCachedWorkspaces()
  const initialWorkspaces = cachedData?.workspaces?.length ? cachedData.workspaces : workspaceListCache
  const [workspaces, setWorkspaces] = useState(initialWorkspaces || [])
  const [loading, setLoading] = useState(!initialWorkspaces?.length) // Only show loading if no cached data
  const [hasResolvedInitialFetch, setHasResolvedInitialFetch] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [userRoles, setUserRoles] = useState(cachedData?.userRoles || {}) // {workspaceId: role}
  const [ownerCounts, setOwnerCounts] = useState(cachedData?.ownerCounts || {}) // {workspaceId: ownerCount}
  const [memberCounts, setMemberCounts] = useState({}) // {workspaceId: totalMemberCount}
  const [activeFilter, setActiveFilter] = useState("all")
  const [vaultSearchTerm, setVaultSearchTerm] = useState("")
  const [workspaceAttributionById, setWorkspaceAttributionById] = useState({}) // {workspaceId: { invitedBy, invitedAt, invitedByUsername }}
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false)
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceIsPublic, setWorkspaceIsPublic] = useState(false)
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState(null)
  const [editVisibilityId, setEditVisibilityId] = useState(null)
  const [currentVisibilityState, setCurrentVisibilityState] = useState(false)
  const [editVisibilityValue, setEditVisibilityValue] = useState(false)
  const [updatingVisibility, setUpdatingVisibility] = useState(false)
  const [authReadyForWorkspaceCreate, setAuthReadyForWorkspaceCreate] = useState(false)
  const [authReadyUserId, setAuthReadyUserId] = useState(null)
  const [headerVisible, setHeaderVisible] = useState(true)
  const lastScrollY = useRef(0)

  // Track fetch state to prevent duplicate calls
  const fetchControllerRef = useRef(null)
  const lastFetchTimeRef = useRef(0)
  const isFetchingRef = useRef(false)

  const fetchWorkspaces = useCallback(async ({ force = false, silent = false } = {}) => {
    try {
      if (!force && !shouldFetchWorkspaceList()) {
        setHasResolvedInitialFetch(true)
        return
      }

      if (!silent) {
        setLoading(true)
      }
      
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
        .select("workspace_id, role, invited_by, invited_at")
        .eq("user_id", user.id)

      if (userMemberError) {
        console.error("[Dashboard] Failed to fetch user memberships:", userMemberError)
        setLoading(false)
        isFetchingRef.current = false
        return
      }

      const userRolesMap = {}
      const workspaceIds = []
      const attributionBaseMap = {}
      ;(userMemberData || []).forEach((m) => {
        userRolesMap[m.workspace_id] = m.role
        workspaceIds.push(m.workspace_id)
        attributionBaseMap[m.workspace_id] = {
          invitedBy: m.invited_by || null,
          invitedAt: m.invited_at || null,
          invitedByUsername: null
        }
      })

      setUserRoles(userRolesMap)

      const inviterIds = [
        ...new Set((userMemberData || []).map((m) => m.invited_by).filter(Boolean))
      ]

      if (inviterIds.length > 0) {
        const { data: inviterProfiles, error: inviterError } = await supabase
          .from("profiles")
          .select("id, username, name")
          .in("id", inviterIds)

        if (inviterError) {
          console.warn("[Dashboard] Failed to fetch inviter profiles:", inviterError)
        } else {
          const inviterNameById = {}
          ;(inviterProfiles || []).forEach((profile) => {
            inviterNameById[profile.id] = profile.username || profile.name || "unknown"
          })

          Object.keys(attributionBaseMap).forEach((workspaceId) => {
            const inviterId = attributionBaseMap[workspaceId]?.invitedBy
            attributionBaseMap[workspaceId].invitedByUsername = inviterId ? inviterNameById[inviterId] || "unknown" : null
          })
        }
      }

      setWorkspaceAttributionById(attributionBaseMap)

      // If no workspaces, done loading
      if (workspaceIds.length === 0) {
        console.log("[Dashboard] User has no workspace memberships")
        setWorkspaces([])
        setOwnerCounts({})
        setMemberCounts({})
        setWorkspaceAttributionById({})
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
      setWorkspaceListStore(workspaceData || [])

      console.log(`[Dashboard] Step 3: Counting owners for ${workspaceIds.length} workspace(s)...`)

      // Step 3: Count owners for each workspace
      const { data: memberData, error: memberError } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .in("workspace_id", workspaceIds)

      if (!memberError && memberData) {
        const ownerCountMap = {}
        const memberCountMap = {}
        memberData.forEach((m) => {
          memberCountMap[m.workspace_id] = (memberCountMap[m.workspace_id] || 0) + 1
          if (m.role === "owner") {
            ownerCountMap[m.workspace_id] = (ownerCountMap[m.workspace_id] || 0) + 1
          }
        })
        setOwnerCounts(ownerCountMap)
        setMemberCounts(memberCountMap)
        
        // Cache the fetched data for faster navigation
        setCachedWorkspaces(workspaceData || [], userRolesMap, ownerCountMap)
      }

      const elapsed = Date.now() - startTime
      console.log(`[Dashboard] ✅ Workspace fetch completed in ${elapsed}ms`)
      lastFetchTimeRef.current = Date.now()
    } catch (err) {
      console.error("[Dashboard] Error fetching workspaces:", err)
    } finally {
      if (!silent) {
        setLoading(false)
      }
      setHasResolvedInitialFetch(true)
      isFetchingRef.current = false
    }
  }, [setCachedWorkspaces, setWorkspaceListStore, shouldFetchWorkspaceList])

  useEffect(() => {
    let canceled = false

    const verifyAuthReadiness = async () => {
      try {
        const sessionUserId = session?.user?.id || null
        const { data: { user: freshUser }, error: freshUserError } = await supabase.auth.getUser()

        if (canceled) return

        if (freshUserError || !freshUser?.id) {
          console.warn("[Dashboard] Auth readiness check failed: fresh user unavailable", freshUserError)
          setAuthReadyForWorkspaceCreate(false)
          setAuthReadyUserId(null)
          return
        }

        if (sessionUserId && sessionUserId !== freshUser.id) {
          console.warn("[Dashboard] Auth readiness mismatch:", {
            sessionUserId,
            freshUserId: freshUser.id
          })
          setAuthReadyForWorkspaceCreate(false)
          setAuthReadyUserId(freshUser.id)
          return
        }

        setAuthReadyForWorkspaceCreate(true)
        setAuthReadyUserId(freshUser.id)
      } catch (err) {
        if (canceled) return
        console.error("[Dashboard] Auth readiness exception:", err)
        setAuthReadyForWorkspaceCreate(false)
        setAuthReadyUserId(null)
      }
    }

    verifyAuthReadiness()

    return () => {
      canceled = true
    }
  }, [session?.user?.id])

  const createWorkspace = useCallback(async () => {
    if (!authReadyForWorkspaceCreate) {
      showError("Authentication is still loading. Please try again.")
      return
    }

    setWorkspaceName("")
    setShowCreateWorkspaceModal(true)
  }, [authReadyForWorkspaceCreate, showError])

  const handleCreateWorkspaceConfirm = useCallback(async () => {
    const name = workspaceName.trim()
    if (!name) return

    setCreating(true)
    setShowCreateWorkspaceModal(false)

    try {
      if (!authReadyForWorkspaceCreate) {
        console.warn("[Dashboard/createWorkspace] Auth not ready; blocked create request")
        showError("Authentication is still loading. Please try again.")
        setCreating(false)
        return
      }

      // ===== STEP 0: AUTH CHECK =====
      console.log("[Dashboard/createWorkspace] Starting workspace creation flow...")
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      console.log("[Dashboard/createWorkspace] Auth check IDs:", {
        freshAuthUserId: user?.id || null,
        sessionUserId: session?.user?.id || null,
        authReadyUserId
      })

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
      const generatedWorkspaceId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`

      const createPayload = {
        id: generatedWorkspaceId,
        name,
        created_by: user.id,
        is_public: workspaceIsPublic,
      }
      console.log("[Dashboard/createWorkspace] Insert payload:", createPayload)

      const { error: workspaceError } = await supabase
        .from("workspaces")
        .insert(createPayload)
      

      if (workspaceError) {
        console.error("[Dashboard/createWorkspace] ❌ Workspace insert failed:", workspaceError)
        console.error("[Dashboard/createWorkspace]   Error code:", workspaceError.code)
        console.error("[Dashboard/createWorkspace]   Error message:", workspaceError.message)
        console.error("[Dashboard/createWorkspace]   Full error:", JSON.stringify(workspaceError, null, 2))
        showError(`Failed to create vault: ${workspaceError.message}`)
        setCreating(false)
        return
      }

      const workspace = {
        id: generatedWorkspaceId,
        name,
        created_by: user.id,
        is_public: workspaceIsPublic,
        created_at: new Date().toISOString()
      }

      if (!workspace?.id) {
        console.error("[Dashboard/createWorkspace] ❌ Workspace inserted but no ID returned")
        showError("Vault created but ID not returned. Please refresh.")
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
              showError("Failed to establish vault ownership")
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
      success(`Vault "${name}" created!`)
      
      await fetchWorkspaces()
      window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId: workspace.id } }))
      
      setCreating(false)
      
      // Navigate to the new workspace
      console.log(`[Dashboard/createWorkspace] ✅ Navigating to /workspace/${workspace.id}`)
      setTimeout(() => {
        setCurrentWorkspaceStore(workspace)
        setLastOpenedWorkspaceId(workspace.id)
        navigate(`/workspace/${workspace.id}`)
      }, 500)

    } catch (err) {
      console.error("[Dashboard/createWorkspace] ❌ Unexpected error during workspace creation:", err)
      console.error("[Dashboard/createWorkspace]   Error type:", err.constructor.name)
      console.error("[Dashboard/createWorkspace]   Error message:", err.message)
      console.error("[Dashboard/createWorkspace]   Stack:", err.stack)
      showError(`Failed to create vault: ${err.message}`)
      setCreating(false)
    }
  }, [workspaceName, workspaceIsPublic, success, showError, fetchWorkspaces, authReadyForWorkspaceCreate, session?.user?.id, authReadyUserId, navigate, setCurrentWorkspaceStore, setLastOpenedWorkspaceId])

  useKeyboardShortcuts({
    onNewWorkspace: createWorkspace,
  })

  useEffect(() => {
    if (session) {
      fetchWorkspaces({ silent: (workspaces?.length || 0) > 0 })
    }

    // Cleanup: cancel pending fetch requests on unmount
    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort()
        console.log("[Dashboard] Cancelled pending fetch on unmount")
      }
    }
  }, [session, fetchWorkspaces, workspaces?.length])

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY
      if (currentY < 10) {
        setHeaderVisible(true)
      } else if (currentY > lastScrollY.current + 6) {
        setHeaderVisible(false)
      } else if (currentY < lastScrollY.current - 6) {
        setHeaderVisible(true)
      }
      lastScrollY.current = currentY
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

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
        fetchWorkspaces({ force: true, silent: true })
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

  const openWorkspace = useCallback((workspace) => {
    if (!workspace?.id) return
    setCurrentWorkspaceStore(workspace)
    setLastOpenedWorkspaceId(workspace.id)
    navigate(`/workspace/${workspace.id}`)
  }, [navigate, setCurrentWorkspaceStore, setLastOpenedWorkspaceId])

  const runWorkspaceAction = useCallback(async (workspaceId, action) => {
    const userRole = userRoles[workspaceId]
    const ownerCount = ownerCounts[workspaceId] || 0

    if (!userRole) {
      showError("Role information not loaded. Please refresh and try again.")
      return
    }

    if (action === "delete" && userRole !== "owner") {
      showError("Only owners can delete a vault")
      return
    }

    if (action === "leave" && userRole === "owner" && ownerCount <= 1) {
      showError("Cannot leave vault: at least one owner must remain")
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
        showError(result.error || "Vault action failed")
        setDeletingId(null)
        return
      }

      localStorage.removeItem(`workspace_key_${workspaceId}`)
      success(action === "delete" ? "Vault deleted successfully" : "You've left the vault")

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
        showError("Failed to update vault visibility")
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
        success(editVisibilityValue ? "Vault is now public" : "Vault is now private")
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

  // Show skeleton if loading, or if initial fetch not resolved and no workspaces
  const shouldShowLoadingSkeleton = loading || (!hasResolvedInitialFetch && workspaces.length === 0)
  const filteredWorkspaces = workspaces.filter((workspace) => {
    if (activeFilter === "owned") return workspace.is_public === false
    if (activeFilter === "public") return workspace.is_public === true
    if (activeFilter === "shared") return (memberCounts[workspace.id] || 0) > 1
    return workspace.is_public === true || workspace.is_public === false
  }).filter((workspace) => {
    const query = vaultSearchTerm.trim().toLowerCase()
    if (!query) return true
    return (workspace.name || "").toLowerCase().includes(query)
  })

  if (shouldShowLoadingSkeleton) {
    return (
      <div className="min-h-screen bg-[var(--profile-bg)] text-[var(--profile-text)]">
        <div className={`fixed left-0 right-0 top-[56px] z-[95] border-b border-[var(--profile-border)] bg-[var(--profile-bg)] px-5 pb-0 pt-5 transition-transform duration-300 ease-in-out ${headerVisible ? "translate-y-0" : "-translate-y-full"}`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="font-['Sora'] text-[24px] font-[800] text-[var(--profile-text)]">My Vaults</h1>
              <p className="mt-1 text-[12px] text-[var(--profile-text-muted)]">Manage your encrypted knowledge spaces</p>
            </div>
            <div className="rounded-[12px] bg-[#F4B400] px-[18px] py-[10px] font-['Sora'] text-[13px] font-[700] text-[var(--profile-on-accent)] shadow-[0_3px_18px_rgba(244,180,0,0.4)]">+ Create Vault</div>
          </div>
          <div className="scrollbar-hide flex gap-[6px] overflow-x-auto pb-3">
            <div className="rounded-[20px] bg-[#F4B400] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-on-accent)]">All</div>
            <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-text-muted)]">Owned</div>
            <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-text-muted)]">Shared with me</div>
            <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-[14px] py-[6px] text-[12px] font-[600] text-[var(--profile-text-muted)]">Public</div>
          </div>
        </div>
        <div style={{ maxWidth: "900px" }} className={`mx-auto px-4 pb-[90px] ${headerVisible ? "pt-[170px]" : "pt-[70px]"}`}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-[10px] rounded-[18px] border border-[var(--profile-border)] bg-[var(--profile-surface)] p-4 shadow-none">
              <div className="mb-3 h-2 w-1/2 animate-pulse rounded-[8px] bg-[var(--profile-elev)]" />
              <div className="mb-2 h-4 w-full animate-pulse rounded-[8px] bg-[var(--profile-elev)]" />
              <div className="mb-2 h-4 w-4/5 animate-pulse rounded-[8px] bg-[var(--profile-elev)]" />
              <div className="h-4 w-2/3 animate-pulse rounded-[8px] bg-[var(--profile-elev)]" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--profile-bg)] text-[var(--profile-text)]">
      <div className={`fixed left-0 right-0 top-[56px] z-[95] border-b border-[var(--profile-border)] bg-[var(--profile-bg)] px-5 pb-0 pt-5 transition-transform duration-300 ease-in-out ${headerVisible ? "translate-y-0" : "-translate-y-full"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-['Sora'] text-[24px] font-[800] text-[var(--profile-text)]">My Vaults</h1>
            <p className="mt-1 text-[12px] text-[var(--profile-text-muted)]">Manage your encrypted knowledge spaces</p>
          </div>

          <button
            onClick={createWorkspace}
            disabled={creating || !authReadyForWorkspaceCreate}
            className="rounded-[12px] border-none bg-[#F4B400] px-[18px] py-[10px] font-['Sora'] text-[13px] font-[700] text-[var(--profile-on-accent)] shadow-[0_3px_18px_rgba(244,180,0,0.4)] transition-all duration-150 hover:translate-y-[-1px] hover:bg-[#C49000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "+ Create Vault"}
          </button>
        </div>

        <div className="scrollbar-hide flex gap-[6px] overflow-x-auto pb-3">
          <button
            onClick={() => setActiveFilter("all")}
            className={`rounded-[20px] px-[14px] py-[6px] text-[12px] font-[600] transition-all ${activeFilter === "all" ? "border-none bg-[#F4B400] text-[var(--profile-on-accent)]" : "border border-[var(--profile-border)] bg-[var(--profile-elev)] text-[var(--profile-text-muted)] hover:border-[var(--profile-border-strong)] hover:text-[var(--profile-text-subtle)]"}`}
          >
            All
          </button>
          <button
            onClick={() => setActiveFilter("owned")}
            className={`rounded-[20px] px-[14px] py-[6px] text-[12px] font-[600] transition-all ${activeFilter === "owned" ? "border-none bg-[#F4B400] text-[var(--profile-on-accent)]" : "border border-[var(--profile-border)] bg-[var(--profile-elev)] text-[var(--profile-text-muted)] hover:border-[var(--profile-border-strong)] hover:text-[var(--profile-text-subtle)]"}`}
          >
            Owned
          </button>
          <button
            onClick={() => setActiveFilter("shared")}
            className={`rounded-[20px] px-[14px] py-[6px] text-[12px] font-[600] transition-all ${activeFilter === "shared" ? "border-none bg-[#F4B400] text-[var(--profile-on-accent)]" : "border border-[var(--profile-border)] bg-[var(--profile-elev)] text-[var(--profile-text-muted)] hover:border-[var(--profile-border-strong)] hover:text-[var(--profile-text-subtle)]"}`}
          >
            Shared with me
          </button>
          <button
            onClick={() => setActiveFilter("public")}
            className={`rounded-[20px] px-[14px] py-[6px] text-[12px] font-[600] transition-all ${activeFilter === "public" ? "border-none bg-[#F4B400] text-[var(--profile-on-accent)]" : "border border-[var(--profile-border)] bg-[var(--profile-elev)] text-[var(--profile-text-muted)] hover:border-[var(--profile-border-strong)] hover:text-[var(--profile-text-subtle)]"}`}
          >
            Public
          </button>
        </div>

        <div className="mt-2">
          <input
            type="text"
            placeholder="Search vaults..."
            value={vaultSearchTerm}
            onChange={(e) => setVaultSearchTerm(e.target.value)}
            className="w-full rounded-[12px] border border-transparent bg-[var(--profile-surface)] p-3 text-[var(--profile-text)] placeholder:text-[var(--profile-text-muted)] transition-all duration-200 focus:border-[#F4B400] focus:outline-none focus:ring-2 focus:ring-[rgba(244,180,0,0.25)]"
          />
        </div>
      </div>

      <div style={{ maxWidth: "900px" }} className={`mx-auto px-4 pb-[90px] ${headerVisible ? "pt-[170px]" : "pt-[70px]"}`}>

        {/* Loader/Skeleton: show while loading */}
        {shouldShowLoadingSkeleton && null}
        {!shouldShowLoadingSkeleton && !loading && hasResolvedInitialFetch && filteredWorkspaces.length === 0 && (
          <div className="rounded-[18px] border border-[var(--profile-border)] bg-[var(--profile-surface)] p-12 text-center">
            <p className="mb-6 text-lg text-[var(--profile-text-subtle)]">No vaults found</p>
            <p className="mb-6 text-sm text-[var(--profile-text-muted)]">Try another filter or create a new vault</p>
            <button
              onClick={createWorkspace}
              disabled={creating || !authReadyForWorkspaceCreate}
              className="rounded-[12px] border-none bg-[#F4B400] px-[18px] py-[10px] font-['Sora'] text-[13px] font-[700] text-[var(--profile-on-accent)] shadow-[0_3px_18px_rgba(244,180,0,0.4)] transition-all duration-150 hover:translate-y-[-1px] hover:bg-[#C49000] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Your First Vault"}
            </button>
            <p className="mt-4 text-xs text-[var(--profile-text-muted)]">Tip: Press "W" to create a new vault</p>
          </div>
        )}
        {!shouldShowLoadingSkeleton && !( !loading && hasResolvedInitialFetch && filteredWorkspaces.length === 0 ) && (
          filteredWorkspaces.map((workspace) => (
            <div
              key={workspace.id}
              onClick={(e) => handleNavigationClick(e, () => openWorkspace(workspace))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  openWorkspace(workspace)
                }
              }}
              role="button"
              tabIndex={0}
              className="group mb-[16px] cursor-pointer overflow-visible rounded-[18px] border border-[var(--profile-border)] bg-[var(--profile-surface)] transition-all duration-200 hover:border-[var(--profile-border-strong)] hover:bg-[var(--profile-elev)] hover:shadow-[0_10px_26px_rgba(15,23,42,0.16)] dark:hover:shadow-[0_12px_30px_rgba(0,0,0,0.38)]"
            >
              {(() => {
                const role = userRoles[workspace.id]
                const isShared = role && role !== "owner"
                const visType = workspace.is_public ? "public" : isShared ? "shared" : "private"
                const accentClass = visType === "private"
                  ? "bg-gradient-to-r from-[#8B5CF6] via-[rgba(139,92,246,0.3)] to-transparent"
                  : visType === "shared"
                    ? "bg-gradient-to-r from-[#22C55E] via-[rgba(34,197,94,0.3)] to-transparent"
                    : "bg-gradient-to-r from-[#F4B400] via-[rgba(244,180,0,0.3)] to-transparent"
                const badgeClass = visType === "private"
                  ? "border border-[var(--visibility-private-border)] bg-[var(--visibility-private-bg)] text-[var(--visibility-private-text)]"
                  : visType === "shared"
                    ? "border border-[var(--profile-border)] bg-[var(--profile-elev)] text-[var(--profile-text-subtle)]"
                    : "border border-[var(--visibility-public-border)] bg-[var(--visibility-public-bg)] text-[var(--visibility-public-text)]"
                const badgeLabel = visType === "private" ? "Private" : visType === "shared" ? "Shared" : "Public"
                const isOwner = role === "owner"
                return (
                  <>
                    <div className={`h-[2px] w-full ${accentClass}`} />
                    <div className="px-5 pb-4 pt-4">
                      <div className="flex items-start justify-between gap-[10px]">
                        <div className="min-w-0 flex-1">
                          <div className="mb-[6px] flex items-center gap-2">
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-['Sora'] text-[18px] font-[700] text-[var(--profile-text)]">{workspace.name}</span>
                            <span className={`rounded-[8px] px-[7px] py-[2px] text-[10px] font-[700] ${badgeClass}`}>{badgeLabel}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-[12px] pb-1">
                            <span className="flex items-center gap-1 text-[12px] text-[var(--profile-text-muted)]">
                              <svg className="h-[11px] w-[11px] opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                              {(workspaceAttributionById[workspace.id]?.invitedByUsername && "Invited") || "Notes"}
                            </span>
                            <span className="flex items-center gap-1 text-[12px] text-[var(--profile-text-muted)]">
                              <svg className="h-[11px] w-[11px] opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                              {userRoles[workspace.id] || "viewer"}
                            </span>
                            <span className="text-[12px] text-[var(--profile-text-muted)]">Updated {new Date(workspace.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-[6px]">
                          <details className="relative" onClick={(e) => e.stopPropagation()}>
                            <summary className="flex h-[30px] w-[30px] cursor-pointer list-none items-center justify-center rounded-[8px] border border-transparent bg-transparent text-[var(--profile-text-muted)] transition-all hover:border-[var(--profile-border)] hover:bg-[var(--profile-hover)]">
                              <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                            </summary>
                            <div className="absolute right-0 top-full z-[320] mt-2 w-[185px] overflow-hidden rounded-[14px] border border-[var(--profile-border)] bg-[var(--profile-surface)] shadow-[0_12px_40px_rgba(0,0,0,0.85)]">
                              <button className="flex w-full items-center gap-[10px] px-[14px] py-[10px] text-left text-[13px] text-[var(--profile-text)] hover:bg-[var(--profile-elev)]">Rename</button>
                              {isOwner && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openEditVisibility(workspace.id, workspace.is_public)
                                  }}
                                  className="flex w-full items-center gap-[10px] px-[14px] py-[10px] text-left text-[13px] text-[var(--profile-text)] hover:bg-[var(--profile-elev)]"
                                >
                                  Settings
                                </button>
                              )}
                              <div className="my-[3px] h-[1px] bg-[var(--profile-border)]" />
                              {isOwner ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteWorkspace(workspace.id)
                                  }}
                                  className="flex w-full items-center gap-[10px] px-[14px] py-[10px] text-left text-[13px] text-[#EF4444] hover:bg-[var(--profile-elev)]"
                                >
                                  Delete Vault
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    leaveWorkspaceAction(workspace.id)
                                  }}
                                  className="flex w-full items-center gap-[10px] px-[14px] py-[10px] text-left text-[13px] text-[var(--profile-text)] hover:bg-[var(--profile-elev)]"
                                >
                                  Leave Vault
                                </button>
                              )}
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          ))
        )}
      </div>

      <Modal
        open={showCreateWorkspaceModal}
        title="Create Vault"
        message="Create a new encrypted vault for your memories."
        inputValue={workspaceName}
        onInputChange={setWorkspaceName}
        inputPlaceholder="Enter vault name"
        confirmText="Create"
        confirmVariant="primary"
        confirmDisabled={!workspaceName.trim() || creating || !authReadyForWorkspaceCreate}
        isLoading={creating}
        onConfirm={handleCreateWorkspaceConfirm}
        onCancel={() => {
          setShowCreateWorkspaceModal(false)
          setWorkspaceName("")
          setWorkspaceIsPublic(false)
        }}
      >
        <div className="mt-5 space-y-3 border-t border-[var(--profile-border)] pt-5">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => setWorkspaceIsPublic((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${workspaceIsPublic ? "border-[#F4B400] bg-[#F4B400]" : "border-[var(--profile-border-strong)] bg-[var(--profile-elev)]"}`}
              aria-label="Toggle public vault"
              aria-pressed={workspaceIsPublic}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[var(--profile-surface)] transition-transform ${workspaceIsPublic ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
            <span className="text-sm font-medium text-[var(--profile-text)] group-hover:text-[var(--profile-text-subtle)]">
              Public vault
            </span>
          </label>
          <p className="pl-8 text-xs text-[var(--profile-text-muted)]">
            Visible to everyone, editable only by owner and members
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(workspaceDeleteTarget)}
        title="Delete Vault"
        message="Are you sure you want to delete this vault? This action cannot be undone."
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
        title="Change Vault Visibility"
        message={currentVisibilityState ? "This vault is currently PUBLIC and visible to everyone." : "This vault is currently PRIVATE and only visible to members."}
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
        <div className="mt-5 space-y-3 border-t border-[var(--profile-border)] pt-5">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => {
                setEditVisibilityValue((prev) => !prev)
                console.log("[Dashboard] Visibility toggle changed to:", !editVisibilityValue)
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${editVisibilityValue ? "border-[#F4B400] bg-[#F4B400]" : "border-[var(--profile-border-strong)] bg-[var(--profile-elev)]"}`}
              aria-label="Toggle vault visibility"
              aria-pressed={editVisibilityValue}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[var(--profile-surface)] transition-transform ${editVisibilityValue ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
            <span className="text-sm font-medium text-[var(--profile-text)] group-hover:text-[var(--profile-text-subtle)]">
              Make public
            </span>
          </label>
          <p className="pl-8 text-xs text-[var(--profile-text-muted)]">
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




