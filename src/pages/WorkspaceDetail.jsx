import { encrypt, decrypt, importKey, validateKey, debugLogKey } from "../utils/encryption"
import MemoryGrid from "../components/MemoryGrid"
import RemoveUserModal from "../components/RemoveUserModal"
import { canCreate, canDelete, canShare, getUserRole, isViewer } from "../utils/rolePermissions"
import { verifyWorkspaceAccess } from "../lib/workspaceMembers"
import { isWorkspacePublic, getMemoryViewMode, debugAccessDecision } from "../lib/workspaceAccess"
import { useEffect, useState, useRef, useMemo, lazy, Suspense } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { handleNavigationClick } from "../utils/navigation"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useToast } from "../hooks/useToast"
import { MemoryGridSkeleton } from "../components/SkeletonLoader"
import Modal from "../components/Modal"

const InviteUserModal = lazy(() => import("../components/InviteUserModal"))

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
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [userRole, setUserRole] = useState(null) // "owner", "editor", or "viewer"
  const [showQuickMemoryModal, setShowQuickMemoryModal] = useState(false)
  const [quickMemoryContent, setQuickMemoryContent] = useState("")
  const [isMember, setIsMember] = useState(null) // Track if user is member (for read-only access UI)
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false)
  const [workspaceAttribution, setWorkspaceAttribution] = useState(null) // { invitedBy, invitedAt, invitedByUsername }
  const [members, setMembers] = useState([]) // Phase 1: Workspace members list
  const [recentActivity, setRecentActivity] = useState([]) // Phase 2: Recent activity feed

  // Track initialization to prevent duplicate loads
  const initializeControllerRef = useRef(null)
  const isInitializingRef = useRef(false)
  const isInitializedRef = useRef(false)

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
    // Prevent multiple initializations
    if (!isInitializedRef.current && !isInitializingRef.current) {
      initialize()
    }

    // Cleanup: cancel pending initialization on unmount
    return () => {
      if (initializeControllerRef.current) {
        initializeControllerRef.current.abort()
        initializeControllerRef.current = null
        console.log("[WorkspaceDetail] Cancelled pending initialization on unmount")
      }
      // Reset initialization refs to allow re-fetch when navigating back
      isInitializedRef.current = false
      isInitializingRef.current = false
      console.log("[WorkspaceDetail] Reset initialization refs for next visit")
    }
  }, [])

  // Fetch workspace members and listen for membership changes
  useEffect(() => {
    if (workspace?.id) {
      fetchMembers()
      fetchRecentActivity()
    }

    // Listen for membership changes from other components
    const handleMembershipChange = () => {
      if (workspace?.id) {
        fetchMembers()
        fetchRecentActivity()
      }
    }

    window.addEventListener("workspaceMembershipChanged", handleMembershipChange)
    
    return () => {
      window.removeEventListener("workspaceMembershipChanged", handleMembershipChange)
    }
  }, [workspace?.id])

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
    // Forcefully reset all refs to clean state at the start
    isInitializingRef.current = true
    isInitializedRef.current = false
    initializeControllerRef.current = new AbortController()

    const startTime = Date.now()
    
    // Set loading state immediately to show skeleton
    setLoading(true)

    try {
      console.log(`[WorkspaceDetail] Starting initialization for workspace ${id}`)

      // Step 1: Get current user
      console.log("[WorkspaceDetail] Step 1: Authenticating user...")
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        console.error("[WorkspaceDetail] ❌ Authentication error:", userError)
        showError("Authentication error. Please log in again.")
        setLoading(false)
        isInitializingRef.current = false
        return
      }

      // Abort check
      if (initializeControllerRef.current?.signal?.aborted) {
        console.log("[WorkspaceDetail] ⚠️  Initialization was aborted, exiting cleanly")
        return
      }

      // Step 2-4: Parallelize independent API calls
      // - Verify workspace access
      // - Load user role
      // - Fetch workspace details & validate schema
      // - Load sort preference from cache or database
      console.log("[WorkspaceDetail] Steps 2-4: Running parallel API calls...")

      const [accessVerification, role, workspaceData, cachedSortOrder, invitationAttribution] = await Promise.all([
        verifyWorkspaceAccess(user.id, id),
        getUserRole(id).catch(() => "viewer"), // Non-critical, default to viewer
        fetchWorkspaceWithCache(), // New function with caching
        loadSortPreferenceAsync(), // New async function for sort preference
        fetchWorkspaceAttribution(user.id, id),
      ])

      // Abort check
      if (initializeControllerRef.current?.signal?.aborted) {
        console.log("[WorkspaceDetail] ⚠️  Initialization was aborted during Steps 2-4, exiting cleanly")
        return
      }

      // Track if user is a member
      setIsMember(accessVerification.isMember)
      setUserRole(role)
      setWorkspaceAttribution(accessVerification.isMember ? invitationAttribution : null)

      // Apply cached sort order
      if (cachedSortOrder) {
        console.log("[WorkspaceDetail] Applied cached sort order:", cachedSortOrder)
        setSortOrder(cachedSortOrder)
      }

      // Check if user can access this workspace
      // Block ONLY non-members trying to access private workspaces
      const isPublicWorkspace = accessVerification.workspace?.is_public === true
      const isMemberOfWorkspace = accessVerification.isMember === true
      
      if (!isMemberOfWorkspace && !isPublicWorkspace) {
        console.error("[WorkspaceDetail] ❌ User cannot access this private workspace")
        showError("You are not a member of this vault")
        setLoading(false)
        isInitializingRef.current = false
        setTimeout(() => navigate(-1), 1500)
        return
      }

      console.log(`[WorkspaceDetail] ✅ Access verified - isMember: ${isMemberOfWorkspace}, is_public: ${isPublicWorkspace}`)

      if (!workspaceData) {
        console.error("[WorkspaceDetail] ❌ Workspace data not returned from fetch")
        setLoading(false)
        isInitializingRef.current = false
        return
      }

      // Step 5: Determine memory access and fetch based on workspace state
      console.log("[WorkspaceDetail] Step 5: Determining memory access based on workspace state...")
      
      // Single source of truth: workspace data from Step 4 (not state)
      const workspaceVisibility = workspaceData.visibility ?? (workspaceData.is_public ? "public" : "private")
      const canViewMemories = accessVerification.isMember || workspaceVisibility === "public"
      
      console.log("workspace fetched:", workspaceData)
      console.log("visibility resolved:", workspaceVisibility)
      console.log("canViewMemories:", canViewMemories)
      
      debugAccessDecision(workspaceData, accessVerification.isMember, "Step 5 - Memory Access Decision")
      
      // OPTIMIZATION: Defer memory loading to after initial render
      if (canViewMemories && accessVerification.isMember) {
        // Member: defer workspace key loading and memory decryption
        console.log(`[WorkspaceDetail]   → User is member, deferring key loading and memory decryption...`)
        setTimeout(() => {
          if (!initializeControllerRef.current?.signal?.aborted) {
            loadWorkspaceKeyDeferred()
          }
        }, 0)
      } else if (canViewMemories && !accessVerification.isMember) {
        // Non-member but public workspace: defer memory loading
        console.log(`[WorkspaceDetail]   → User is non-member viewing public workspace, deferring memory load...`)
        setTimeout(() => {
          if (!initializeControllerRef.current?.signal?.aborted) {
            fetchMemoriesPublic()
          }
        }, 0)
      } else {
        // No access
        console.log("[WorkspaceDetail] ❌ User has no memory access")
        setMemories([])
      }

      const elapsed = Date.now() - startTime
      console.log(`[WorkspaceDetail] ✅ Workspace UI initialized in ${elapsed}ms (memory loading deferred)`)
      isInitializedRef.current = true
      setLoading(false)
    } catch (err) {
      console.error("[WorkspaceDetail] ❌ Initialization error:", err)
      showError("Failed to load vault")
      setLoading(false)
      isInitializingRef.current = false
      return
    }

    isInitializingRef.current = false
  }

  const loadWorkspaceKeyDeferred = async () => {
    // Deferred key loading - runs AFTER initial render, doesn't block UI
    console.log(`[WorkspaceDetail/loadWorkspaceKeyDeferred] Starting deferred key/memory load (non-blocking)`)
    
    try {
      // Step 1: Try localStorage first (fastest)
      console.log(`[WorkspaceDetail/loadWorkspaceKeyDeferred] Step 1: Checking localStorage for cached key...`)
      let storedKey = localStorage.getItem(`workspace_key_${id}`)
      
      if (storedKey) {
        console.log(`[WorkspaceDetail/loadWorkspaceKeyDeferred] ✅ Key found in localStorage`)
        debugLogKey(storedKey, "WorkspaceDetail/loadWorkspaceKeyDeferred - localStorage")
      }

      // Step 2: If not in localStorage, fetch from database
      if (!storedKey) {
        console.log(`[WorkspaceDetail/loadWorkspaceKeyDeferred] Step 2: Key not cached, fetching from database...`)
        const {
          data: { user },
          error: authError
        } = await supabase.auth.getUser()

        if (authError || !user) {
          console.error("[WorkspaceDetail/loadWorkspaceKeyDeferred] Authentication error:", authError)
          showError("Authentication error. Please log in again.")
          return
        }

        let memberKeyFound = false
        let publicKeyFound = false

        // Try to fetch member key first
        const { data: memberKey, error: memberKeyError } = await supabase
          .from("workspace_keys")
          .select("encrypted_key")
          .eq("workspace_id", id)
          .eq("user_id", user.id)
          .eq("key_scope", "member")
          .maybeSingle()

        if (memberKey?.encrypted_key) {
          storedKey = memberKey.encrypted_key
          memberKeyFound = true
          console.log("[WorkspaceDetail/loadWorkspaceKeyDeferred] ✅ Fetched member key from database")
        } else if (memberKeyError) {
          console.error("[WorkspaceDetail/loadWorkspaceKeyDeferred] Database error:", JSON.stringify(memberKeyError, null, 2))
        }

        // If not a member, try public_read key for public workspaces
        if (!storedKey) {
          console.log("[WorkspaceDetail/loadWorkspaceKeyDeferred] Checking for public read key...")
          const { data: publicKey, error: publicKeyError } = await supabase
            .from("workspace_keys")
            .select("encrypted_key")
            .eq("workspace_id", id)
            .is("user_id", null)
            .eq("key_scope", "public_read")
            .maybeSingle()

          if (publicKey?.encrypted_key) {
            storedKey = publicKey.encrypted_key
            publicKeyFound = true
            console.log("[WorkspaceDetail/loadWorkspaceKeyDeferred] ✅ Fetched public read key from database")
          } else if (publicKeyError) {
            console.error("[WorkspaceDetail/loadWorkspaceKeyDeferred] Database error:", JSON.stringify(publicKeyError, null, 2))
          }
        }
        
        if (!memberKeyFound && !publicKeyFound) {
          console.error(`[WorkspaceDetail/loadWorkspaceKeyDeferred] ❌ No encryption key found for workspace ${id}`)
          showError("Cannot access this vault - encryption key not found.")
          return
        }

        debugLogKey(storedKey, "WorkspaceDetail/loadWorkspaceKeyDeferred - database")
        localStorage.setItem(`workspace_key_${id}`, storedKey)
      }

      // Step 3: Validate the key format
      console.log("[WorkspaceDetail/loadWorkspaceKeyDeferred] Step 3: Validating encryption key...")
      const keyValidation = validateKey(storedKey)
      if (!keyValidation.isValid) {
        console.error(`[WorkspaceDetail/loadWorkspaceKeyDeferred] ❌ Key validation failed: ${keyValidation.error}`)
        showError(`Invalid encryption key: ${keyValidation.error}`)
        return
      }

      console.log("[WorkspaceDetail/loadWorkspaceKeyDeferred] ✅ Key validation passed")

      // Step 4: Import key and fetch/decrypt memories
      try {
        console.log("[WorkspaceDetail/loadWorkspaceKeyDeferred] Step 4: Importing key and fetching memories...")
        const key = await importKey(storedKey)
        setWorkspaceKey(key)
        await fetchMemoriesOptimized(key)
      } catch (err) {
        console.error("[WorkspaceDetail/loadWorkspaceKeyDeferred] Failed to import key:", err)
        showError("Failed to process encryption key. Please try again.")
      }
    } catch (err) {
      console.error("[WorkspaceDetail/loadWorkspaceKeyDeferred] Unexpected error:", err)
      showError("Error loading memories")
    }
  }

  const fetchMemoriesOptimized = async (key) => {
    // OPTIMIZATION: Load first 15 memories initially, preserves sorting and filtering
    const INITIAL_BATCH_SIZE = 15
    
    console.log(`[WorkspaceDetail/fetchMemoriesOptimized] Starting optimized memory fetch...`)
    console.log(`[WorkspaceDetail/fetchMemoriesOptimized] Loading initial batch of ${INITIAL_BATCH_SIZE} memories`)

    if (!key) {
      console.error("[WorkspaceDetail/fetchMemoriesOptimized] ❌ No encryption key provided!")
      showError("Encryption key missing. Cannot load memories.")
      setMemories([])
      return
    }

    const { data, error } = await supabase
      .from("memories")
      .select(`
    id,
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
      .order("updated_at", { ascending: false })
      .limit(INITIAL_BATCH_SIZE)

    if (error) {
      console.error("[WorkspaceDetail/fetchMemoriesOptimized] ❌ Database error:", error)
      showError("Failed to load memories")
      setMemories([])
      return
    }

    console.log(`[WorkspaceDetail/fetchMemoriesOptimized] Retrieved ${data?.length || 0} memories`)

    if (data && data.length > 0) {
      try {
        // Decrypt all memories in the batch
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

        console.log(`[WorkspaceDetail/fetchMemoriesOptimized] ✅ Successfully decrypted ${decrypted.length} memories`)
        setMemories(decrypted)
      } catch (decryptErr) {
        console.error("[WorkspaceDetail/fetchMemoriesOptimized] ❌ Decryption failed:", decryptErr)
        showError("Failed to decrypt memories")
        setMemories([])
      }
    } else {
      console.log("[WorkspaceDetail/fetchMemoriesOptimized] ℹ️  No memories found in workspace")
      setMemories([])
    }
  }

  const fetchWorkspaceWithCache = async () => {
    // Try to get cached workspace data from sessionStorage
    const cacheKey = `workspace_cache_${id}`
    const cachedData = sessionStorage.getItem(cacheKey)
    
    if (cachedData) {
      try {
        const cached = JSON.parse(cachedData)
        const cacheAge = Date.now() - cached.timestamp
        // Use cache if less than 5 minutes old
        if (cacheAge < 5 * 60 * 1000) {
          console.log("[WorkspaceDetail/fetchWorkspaceWithCache] Using cached workspace data")
          setWorkspace(cached.data)
          return cached.data
        }
      } catch (err) {
        console.error("[WorkspaceDetail/fetchWorkspaceWithCache] Failed to parse cache:", err)
      }
    }

    // Cache miss or expired, fetch from database
    console.log("[WorkspaceDetail/fetchWorkspaceWithCache] Fetching fresh workspace data from database")
    const { data } = await supabase
      .from("workspaces")
      .select("id, name, created_at, created_by, is_public")
      .eq("id", id)
      .maybeSingle()

    if (!data) {
      showError("Vault not found or access denied")
      navigate(-1)
      return null
    }

    // Cache the data
    sessionStorage.setItem(cacheKey, JSON.stringify({
      data,
      timestamp: Date.now()
    }))

    setWorkspace(data)
    return data
  }

  const loadSortPreferenceAsync = async () => {
    try {
      // Try to get from window sessionStorage first (faster than DB)
      const cacheKey = `sort_preference_${id}`
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        console.log("[loadSortPreferenceAsync] Using cached sort preference:", cached)
        return cached
      }

      // Verify workspace ID
      if (!id) return null

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        return null
      }

      // Step 1: Try to get user-specific preference
      const { data, error } = await supabase
        .from("user_workspace_preferences")
        .select("sort_order")
        .eq("user_id", user.id)
        .eq("workspace_id", id)
        .maybeSingle()

      if (error) {
        // Silently fail - table may not exist or other issue
        return null
      }

      // If user has a preference, cache and return it
      if (data && data.sort_order) {
        sessionStorage.setItem(cacheKey, data.sort_order)
        return data.sort_order
      }

      // Step 2: No user preference found, fetch workspace default_sort as fallback
      const { data: workspaceData, error: workspaceError } = await supabase
        .from("workspaces")
        .select("default_sort")
        .eq("id", id)
        .maybeSingle()

      if (workspaceError || !workspaceData?.default_sort) {
        return null
      }

      sessionStorage.setItem(cacheKey, workspaceData.default_sort)
      return workspaceData.default_sort
    } catch (err) {
      console.error("[loadSortPreferenceAsync] Exception:", err)
      return null
    }
  }

  const loadUserRole = async () => {
    try {
      const role = await getUserRole(id)
      setUserRole(role)
    } catch {
      setUserRole("viewer")
    }
  }

  const fetchWorkspaceAttribution = async (userId, workspaceId) => {
    if (!userId || !workspaceId) return null

    try {
      const { data: membership, error: memberError } = await supabase
        .from("workspace_members")
        .select("invited_by, invited_at")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle()

      if (memberError || !membership?.invited_by) {
        return null
      }

      const { data: inviterProfile, error: inviterError } = await supabase
        .from("profiles")
        .select("username, name")
        .eq("id", membership.invited_by)
        .maybeSingle()

      if (inviterError) {
        return {
          invitedBy: membership.invited_by,
          invitedAt: membership.invited_at || null,
          invitedByUsername: "unknown"
        }
      }

      return {
        invitedBy: membership.invited_by,
        invitedAt: membership.invited_at || null,
        invitedByUsername: inviterProfile?.username || inviterProfile?.name || "unknown"
      }
    } catch (err) {
      console.error("[WorkspaceDetail] Failed to fetch workspace attribution:", err)
      return null
    }
  }

  const loadWorkspaceKey = async () => {

    // 1️⃣ Try localStorage first
    console.log(`[WorkspaceDetail/loadWorkspaceKey] Attempting to read key from localStorage with key: workspace_key_${id}`)
    let storedKey = localStorage.getItem(`workspace_key_${id}`)
    console.log(`[WorkspaceDetail/loadWorkspaceKey] Retrieved from localStorage: ${storedKey ? 'KEY FOUND' : 'NO KEY FOUND'}`, storedKey)
    
    if (storedKey) {
      debugLogKey(storedKey, "WorkspaceDetail/loadWorkspaceKey - localStorage")
    }

    // 2️⃣ If not found in localStorage, fetch from database
    if (!storedKey) {

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error("[WorkspaceDetail/loadWorkspaceKey] Authentication error:", authError)
        showError("Authentication error. Please log in again.")
        setLoading(false)
        return
      }

      let memberKeyFound = false
      let publicKeyFound = false

      // Try to fetch member key first
      const { data: memberKey, error: memberKeyError } = await supabase
        .from("workspace_keys")
        .select("encrypted_key")
        .eq("workspace_id", id)
        .eq("user_id", user.id)
        .eq("key_scope", "member")
        .maybeSingle()

      if (memberKey?.encrypted_key) {
        storedKey = memberKey.encrypted_key
        memberKeyFound = true
        console.log("[WorkspaceDetail/loadWorkspaceKey] ✅ Fetched member key from database")
      } else if (memberKeyError) {
        console.error("[WorkspaceDetail/loadWorkspaceKey] Database error fetching member key:", JSON.stringify(memberKeyError, null, 2))
      }

      // If not a member, try public_read key for public workspaces
      if (!storedKey) {
        console.log("[WorkspaceDetail/loadWorkspaceKey] Not a member, attempting public read key...")
        const { data: publicKey, error: publicKeyError } = await supabase
          .from("workspace_keys")
          .select("encrypted_key")
          .eq("workspace_id", id)
          .is("user_id", null)
          .eq("key_scope", "public_read")
          .maybeSingle()

        if (publicKey?.encrypted_key) {
          storedKey = publicKey.encrypted_key
          publicKeyFound = true
          console.log("[WorkspaceDetail/loadWorkspaceKey] ✅ Fetched public read key from database")
        } else if (publicKeyError) {
          console.error("[WorkspaceDetail/loadWorkspaceKey] Database error fetching public key:", JSON.stringify(publicKeyError, null, 2))
        }
      }
      
      // Only show error if BOTH member and public keys failed
      if (!memberKeyFound && !publicKeyFound) {
        console.error(`[WorkspaceDetail/loadWorkspaceKey] ❌ No encryption key found for workspace ${id} (user: ${user.id})`)
        console.error("[WorkspaceDetail/loadWorkspaceKey]   Tried: member key (failed), public_read key (failed)")
        console.error("[WorkspaceDetail/loadWorkspaceKey] This workspace is inaccessible without a key. Redirecting back...")
        showError("Cannot access this vault - encryption key not found. Please ensure you have been granted access.")
        setLoading(false)
        
        // Redirect back after a short delay to allow user to see the error message
        setTimeout(() => {
          navigate(-1)
        }, 2000)
        return
      }

      debugLogKey(storedKey, "WorkspaceDetail/loadWorkspaceKey - database")
      
      // Cache locally for fast future loads
      localStorage.setItem(`workspace_key_${id}`, storedKey)
    }

    // 3️⃣ Validate the key format
    const keyValidation = validateKey(storedKey)
    if (!keyValidation.isValid) {
      console.error(`[WorkspaceDetail/loadWorkspaceKey] ❌ Key validation failed: ${keyValidation.error}`)
      showError(`Invalid encryption key: ${keyValidation.error}`)
      setLoading(false)
      
      // Redirect to dashboard
      setTimeout(() => {
        navigate("/")
      }, 2000)
      return
    }


    try {
      const key = await importKey(storedKey)
      setWorkspaceKey(key)
      await fetchMemories(key)
    } catch (err) {
      console.error("[WorkspaceDetail/loadWorkspaceKey] Failed to import key:", err)
      showError("Failed to process encryption key. Please try again.")
      setLoading(false)
      
      setTimeout(() => {
        navigate(-1)
      }, 2000)
    }
  }

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
      }
    } catch (err) {
      console.error("[saveSortPreference] Exception:", err)
    }
  }

  const fetchMemories = async (key) => {
    console.log("[WorkspaceDetail/fetchMemories] Starting memory fetch...")
    console.log(`[WorkspaceDetail/fetchMemories] Encryption key received:`, key ? 'KEY PRESENT' : 'KEY IS NULL')

    if (!key) {
      console.error("[WorkspaceDetail/fetchMemories] ❌ No encryption key provided! Cannot decrypt memories.")
      showError("Encryption key missing. Cannot load memories.")
      setMemories([])
      setLoading(false)
      return
    }

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
      console.error("[WorkspaceDetail/fetchMemories] ❌ Database error:", error)
      console.error("[WorkspaceDetail/fetchMemories]   Error code:", error.code)
      console.error("[WorkspaceDetail/fetchMemories]   Error message:", error.message)
      showError("Failed to load memories")
      setMemories([])
      setLoading(false)
      return
    }

    console.log(`[WorkspaceDetail/fetchMemories] Retrieved ${data?.length || 0} memories from database`)

    if (data && data.length > 0) {

      try {
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

        console.log(`[WorkspaceDetail/fetchMemories] ✅ Successfully decrypted ${decrypted.length} memories`)
        setMemories(decrypted)
      } catch (decryptErr) {
        console.error("[WorkspaceDetail/fetchMemories] ❌ Decryption failed:", decryptErr)
        showError("Failed to decrypt memories")
        setMemories([])
      }

    } else {
      console.log("[WorkspaceDetail/fetchMemories] ℹ️  No memories found in workspace")
      setMemories([])
    }

    setLoading(false)

  }

  const fetchMemoriesPublic = async () => {
    // For public workspace viewers: fetch and decrypt using public_read key
    console.log("[WorkspaceDetail/fetchMemoriesPublic] Fetching full content for public workspace viewer...")
    console.log("[WorkspaceDetail/fetchMemoriesPublic]   Workspace ID:", id)

    // 1️⃣ Fetch the public read key
    console.log("[WorkspaceDetail/fetchMemoriesPublic] Step 1: Fetching public read encryption key...")
    const { data: keyData, error: keyError } = await supabase
      .from("workspace_keys")
      .select("encrypted_key")
      .eq("workspace_id", id)
      .is("user_id", null)
      .eq("key_scope", "public_read")
      .maybeSingle()

    if (keyError || !keyData?.encrypted_key) {
      console.warn("[WorkspaceDetail/fetchMemoriesPublic] ⚠️  No public key available - showing metadata only")
      // Fallback to metadata-only view
      await fetchMemoriesPublicMetadataOnly()
      return
    }

    console.log("[WorkspaceDetail/fetchMemoriesPublic] ✅ Public read key fetched")

    // 2️⃣ Validate the key
    const keyValidation = validateKey(keyData.encrypted_key)
    if (!keyValidation.isValid) {
      console.error("[WorkspaceDetail/fetchMemoriesPublic] ❌ Public key validation failed:", keyValidation.error)
      await fetchMemoriesPublicMetadataOnly()
      return
    }

    try {
      // 3️⃣ Import the key
      const publicKey = await importKey(keyData.encrypted_key)
      console.log("[WorkspaceDetail/fetchMemoriesPublic] ✅ Public key imported successfully")

      // 4️⃣ Fetch memories
      const { data, error } = await supabase
        .from("memories")
        .select(`
          id,
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
        .order("updated_at", { ascending: false })

      if (error) {
        console.error("[WorkspaceDetail/fetchMemoriesPublic] ❌ Error fetching memories:", error)
        await fetchMemoriesPublicMetadataOnly()
        setLoading(false)
        return
      }

      // 5️⃣ Decrypt memories
      if (data && data.length > 0) {
        console.log("[WorkspaceDetail/fetchMemoriesPublic] Decrypting " + data.length + " memories...")
        
        const decrypted = await Promise.all(
          data.map(async (memory) => {
            try {
              const text = await decrypt(
                memory.encrypted_content,
                memory.iv,
                publicKey
              )
              return {
                ...memory,
                content: text,
                isEncrypted: false
              }
            } catch (err) {
              console.error("[WorkspaceDetail/fetchMemoriesPublic] Decryption failed for memory " + memory.id, err)
              return {
                ...memory,
                content: "[Unable to decrypt]",
                isEncrypted: true
              }
            }
          })
        )

        console.log(`[WorkspaceDetail/fetchMemoriesPublic] ✅ Successfully decrypted ${decrypted.length} memories for public viewer`)
        setMemories(decrypted)
      } else {
        console.log("[WorkspaceDetail/fetchMemoriesPublic] No memories found in this workspace")
        setMemories([])
      }

    } catch (err) {
      console.error("[WorkspaceDetail/fetchMemoriesPublic] ❌ Decryption error:", err)
      await fetchMemoriesPublicMetadataOnly()
    }

    setLoading(false)
  }

  const fetchMemoriesPublicMetadataOnly = async () => {
    // Fallback: fetch metadata only when key not available
    console.log("[WorkspaceDetail/fetchMemoriesPublicMetadataOnly] Fetching memory metadata (no decryption)...")

    const { data, error } = await supabase
      .from("memories")
      .select(`
        id,
        title,
        created_at,
        updated_at,
        workspace_id,
        tags,
        is_favorite
      `)
      .eq("workspace_id", id)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("[WorkspaceDetail/fetchMemoriesPublicMetadataOnly] ❌ Error:", error)
      setMemories([])
      return
    }

    if (data && data.length > 0) {
      const memories = data.map((memory) => ({
        ...memory,
        content: "[Content encrypted - not available]",
        isEncrypted: true,
      }))

      console.log(`[WorkspaceDetail/fetchMemoriesPublicMetadataOnly] ✅ Loaded ${memories.length} memory titles (encrypted)`)
      setMemories(memories)
    } else {
      console.log("[WorkspaceDetail/fetchMemoriesPublicMetadataOnly] No memories found")
      setMemories([])
    }
  }

  const addMemory = async () => {
    if (!workspaceKey) return
    setQuickMemoryContent("")
    setShowQuickMemoryModal(true)
  }

  const handleQuickMemoryCreate = async () => {
    if (!workspaceKey) return

    const content = quickMemoryContent.trim()
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
    setShowQuickMemoryModal(false)
    setQuickMemoryContent("")
  }

  const handleDelete = async (memoryId) => {
    // Check role permission
    if (!canDelete(userRole)) {
      showError("You don't have permission to delete memories")
      return
    }

    // Optimistic delete: remove from UI immediately
    const originalMemories = memories
    setMemories(prev => prev.filter(m => m.id !== memoryId))
    setDeletingId(memoryId)

    try {
      const { error } = await supabase
        .from("memories")
        .delete()
        .eq("id", memoryId)
        .eq("workspace_id", id)

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
      .eq("workspace_id", id)

    if (error) {
      console.error("Favorite toggle failed:", error)
      // Revert UI on failure
      setMemories(prev => prev.map(m => 
        m.id === memoryId ? { ...m, is_favorite: currentStatus } : m
      ))
    }
  }

  const fetchMembers = async () => {
    if (!id) return
    try {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id, role, invited_at, profiles(username, avatar_url, name)")
        .eq("workspace_id", id)
        .order("invited_at", { ascending: true })

      if (error) {
        console.error("[WorkspaceDetail/fetchMembers] ❌ Error:", error)
        return
      }

      setMembers(data || [])
    } catch (err) {
      console.error("[WorkspaceDetail/fetchMembers] ❌ Unexpected error:", err)
    }
  }

  const fetchRecentActivity = async () => {
    if (!id) return
    try {
      const { data, error } = await supabase
        .from("workspace_invites")
        .select("id, status, created_at, responded_at, inviter_id, invitee_id, profiles!workspace_invites_invitee_id_fkey(username, avatar_url)")
        .eq("workspace_id", id)
        .eq("status", "accepted")
        .order("responded_at", { ascending: false, nullsLast: true })
        .limit(10)

      if (error) {
        console.error("[WorkspaceDetail/fetchRecentActivity] ❌ Error:", error)
        return
      }

      setRecentActivity(data || [])
    } catch (err) {
      console.error("[WorkspaceDetail/fetchRecentActivity] ❌ Unexpected error:", err)
    }
  }

  const handleToggleVisibility = async () => {
    if (!workspace || !canShare(userRole)) {
      showError("Only vault owner can change visibility")
      return
    }

    setIsTogglingVisibility(true)
    try {
      const newIsPublic = !workspace.is_public
      console.log(`[WorkspaceDetail/toggleVisibility] Toggling workspace visibility from ${workspace.is_public} to ${newIsPublic}`)

      // Update workspace visibility in database
      const { error: updateError } = await supabase
        .from("workspaces")
        .update({ is_public: newIsPublic })
        .eq("id", id)

      if (updateError) {
        console.error("[WorkspaceDetail/toggleVisibility] ❌ Failed to update workspace:", updateError)
        showError("Failed to update vault visibility")
        setIsTogglingVisibility(false)
        return
      }

      // Handle key scope changes
      if (!workspace.is_public && newIsPublic) {
        // Switching to public: create public_read key
        console.log("[WorkspaceDetail/toggleVisibility] Creating public_read key...")
        
        // Get the member key to use as the foundation
        const { data: memberKeyData, error: memberKeyError } = await supabase
          .from("workspace_keys")
          .select("encrypted_key")
          .eq("workspace_id", id)
          .eq("key_scope", "member")
          .maybeSingle()

        if (memberKeyError || !memberKeyData) {
          console.error("[WorkspaceDetail/toggleVisibility] ❌ Could not fetch member key:", memberKeyError)
          showError("Warning: Could not create public access key")
        } else {
          // Insert public_read key
          const { error: publicKeyError } = await supabase
            .from("workspace_keys")
            .insert({
              workspace_id: id,
              user_id: null,
              encrypted_key: memberKeyData.encrypted_key,
              key_scope: 'public_read'
            })

          if (publicKeyError) {
            console.error("[WorkspaceDetail/toggleVisibility] ⚠️  Failed to create public key:", publicKeyError)
            showError("Warning: Could not create public access key")
          } else {
            console.log("[WorkspaceDetail/toggleVisibility] ✅ Public read key created")
          }
        }
      } else if (workspace.is_public && !newIsPublic) {
        // Switching to private: remove public_read key
        console.log("[WorkspaceDetail/toggleVisibility] Deleting public_read key...")
        
        const { error: deleteError } = await supabase
          .from("workspace_keys")
          .delete()
          .eq("workspace_id", id)
          .is("user_id", null)
          .eq("key_scope", "public_read")

        if (deleteError) {
          console.error("[WorkspaceDetail/toggleVisibility] ⚠️  Failed to delete public key:", deleteError)
          console.warn("[WorkspaceDetail/toggleVisibility] This is non-critical - public viewers simply won't have access")
        } else {
          console.log("[WorkspaceDetail/toggleVisibility] ✅ Public read key deleted")
        }
      }

      // Update local state
      setWorkspace({ ...workspace, is_public: newIsPublic })
      success(`Workspace is now ${newIsPublic ? 'public' : 'private'}`)
      setShowSettingsModal(false)

    } catch (err) {
      console.error("[WorkspaceDetail/toggleVisibility] ❌ Unexpected error:", err)
      showError("Failed to toggle visibility")
    } finally {
      setIsTogglingVisibility(false)
    }
  }

  const filteredMemories = useMemo(() => {
    return memories
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
  }, [memories, searchTerm, showFavoritesOnly, sortOrder])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#F5F0E8]">
        <div style={{ maxWidth: '900px' }} className="mx-auto px-4 pb-[90px] pt-6">
          <div className="mb-6 h-8 w-1/3 animate-pulse rounded bg-[#141414]"></div>
          <div className="mb-8 h-4 w-1/2 animate-pulse rounded bg-[#141414]"></div>
          <MemoryGridSkeleton />
        </div>
      </div>
    )
  }

  return (

    <div className="min-h-screen bg-[#000000] text-[#F5F0E8]">
      <div className="fixed left-0 right-0 top-[56px] z-[95] border-b border-[#1F1F1F] bg-[#000000] px-5 pb-3 pt-5">
        <div style={{ maxWidth: '900px' }} className="mx-auto">
          <button
            onClick={(e) => handleNavigationClick(e, () => navigate("/workspaces"))}
            className="mb-3 text-[13px] font-medium text-[#A09080] transition-colors hover:text-[#F4B400]"
          >
            ← Back to Vaults
          </button>

          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="font-['Sora'] text-[24px] font-[800] text-[#F5F0E8]">{workspace?.name}</h1>
              <p className="mt-1 text-[12px] text-[#5C5248]">Encrypted memory workspace</p>
              {workspaceAttribution?.invitedByUsername && (
                <p className="mt-1 text-[11px] text-[#5C5248]">Added by {workspaceAttribution.invitedByUsername}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {canShare(userRole) && (
                <button
                  onClick={() => setShowRemoveUserModal(true)}
                  className="rounded-[10px] border border-[#1F1F1F] bg-[#141414] px-4 py-2 text-[13px] font-medium text-[#A09080] transition-all hover:border-[#2A2A2A] hover:text-[#F5F0E8]"
                  title="Manage vault members - Owner only"
                >
                  Members
                </button>
              )}

              {canShare(userRole) && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="rounded-[10px] border border-[#1F1F1F] bg-[#141414] px-4 py-2 text-[13px] font-medium text-[#A09080] transition-all hover:border-[#2A2A2A] hover:text-[#F5F0E8]"
                  title="Invite users to vault - Owner only"
                >
                  Share
                </button>
              )}

              {canShare(userRole) && (
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="rounded-[10px] border border-[#1F1F1F] bg-[#141414] px-4 py-2 text-[13px] font-medium text-[#A09080] transition-all hover:border-[#2A2A2A] hover:text-[#F5F0E8]"
                  title="Vault settings - Owner only"
                >
                  Settings
                </button>
              )}

              {canCreate(userRole) && (
                <button
                  onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}/new`))}
                  className="rounded-[12px] border-none bg-[#F4B400] px-[18px] py-[10px] text-[13px] font-[700] text-[#0D0D0D] shadow-[0_3px_18px_rgba(244,180,0,0.4)] transition-all hover:bg-[#C49000]"
                  title="Create a new memory"
                >
                  + Add Memory
                </button>
              )}

              {isViewer(userRole) && (
                <div className="rounded-[10px] border border-[#1F1F1F] bg-[#141414] px-4 py-2 text-[12px] font-medium text-[#5C5248]" title="You have read-only access to this vault">
                  Viewer
                </div>
              )}
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFavoritesOnly(false)}
                className={`rounded-[20px] px-[14px] py-[6px] text-[12px] font-[600] transition-all ${!showFavoritesOnly ? 'bg-[#F4B400] text-[#0D0D0D]' : 'border border-[#1F1F1F] bg-[#141414] text-[#A09080] hover:border-[#2A2A2A] hover:text-[#F5F0E8]'}`}
              >
                All
              </button>
              <button
                onClick={() => setShowFavoritesOnly(true)}
                className={`flex items-center gap-1.5 rounded-[20px] px-[14px] py-[6px] text-[12px] font-[600] transition-all ${showFavoritesOnly ? 'bg-[#F4B400] text-[#0D0D0D]' : 'border border-[#1F1F1F] bg-[#141414] text-[#A09080] hover:border-[#2A2A2A] hover:text-[#F5F0E8]'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                </svg>
                Favorites
              </button>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[#5C5248]">Sort:</span>
              <button
                onClick={() => {
                  setSortOrder("newest")
                  saveSortPreference("newest")
                }}
                className={`rounded-[20px] px-[14px] py-[6px] text-[12px] font-[600] transition-all ${sortOrder === "newest" ? 'bg-[#F4B400] text-[#0D0D0D]' : 'border border-[#1F1F1F] bg-[#141414] text-[#A09080] hover:border-[#2A2A2A] hover:text-[#F5F0E8]'}`}
              >
                Newest
              </button>
              <button
                onClick={() => {
                  setSortOrder("oldest")
                  saveSortPreference("oldest")
                }}
                className={`rounded-[20px] px-[14px] py-[6px] text-[12px] font-[600] transition-all ${sortOrder === "oldest" ? 'bg-[#F4B400] text-[#0D0D0D]' : 'border border-[#1F1F1F] bg-[#141414] text-[#A09080] hover:border-[#2A2A2A] hover:text-[#F5F0E8]'}`}
              >
                Oldest
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px' }} className="mx-auto px-4 pb-[90px] pt-[188px]">

        {/* Non-Member Viewing Public Workspace Banner */}
        {!isMember && workspace && isWorkspacePublic(workspace) && (
          <div className="mb-6 flex items-start gap-3 rounded-[14px] border border-[#1F1F1F] bg-[#141414] p-4">
            <div className="text-xl text-[#F4B400]">👁️</div>
            <div className="flex-1">
              <p className="font-semibold text-[#F5F0E8]">Viewing as Guest</p>
              <p className="mt-1 text-sm text-[#A09080]">You're viewing this public vault with read-only access. Join to create and edit memories.</p>
            </div>
          </div>
        )}

        {/* Members Section - Phase 1 */}
        {members.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-[#F5F0E8]">
              Vault Members ({members.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 rounded-[14px] border border-[#1F1F1F] bg-[#0D0D0D] p-3 transition-colors duration-200 hover:border-[#2A2A2A]"
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {member.profiles?.[0]?.avatar_url ? (
                      <img
                        src={member.profiles[0].avatar_url}
                        alt={member.profiles[0].username || "User"}
                        className="h-10 w-10 rounded-full border border-[#1F1F1F] object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1C1C1C] font-semibold text-[#F4B400]">
                        {(member.profiles?.[0]?.username?.[0] || "U").toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Username and Role */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-[#F5F0E8]">
                      {member.profiles?.[0]?.username || "Unknown User"}
                    </p>
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mt-1 ${
                      member.role === "owner"
                        ? "bg-[#1E1528] text-[#8B5CF6] border border-[rgba(139,92,246,0.25)]"
                        : member.role === "editor"
                        ? "bg-[#2A2000] text-[#F4B400] border border-[rgba(244,180,0,0.25)]"
                        : "bg-[#141414] text-[#A09080] border border-[#1F1F1F]"
                    }`}>
                      {member.role === "owner" ? "👑 Owner" : member.role === "editor" ? "✏️ Editor" : "👁️ Viewer"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity Section - Phase 2 */}
        {recentActivity.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-[#F5F0E8]">
              Recent Activity
            </h2>
            <div className="space-y-2 overflow-hidden rounded-[14px] border border-[#1F1F1F] bg-[#0D0D0D]">
              {recentActivity.map((activity, index) => (
                <div
                  key={activity.id}
                  className={`flex items-center gap-3 p-4 ${
                    index !== recentActivity.length - 1 ? "border-b border-[#1F1F1F]" : ""
                  } transition-colors duration-200 hover:bg-[#141414]`}
                >
                  {/* Timeline Dot */}
                  <div className="flex-shrink-0 relative w-8 h-8 flex items-center justify-center">
                    <div className="h-3 w-3 rounded-full border-2 border-[#0D0D0D] bg-[#F4B400] shadow-sm"></div>
                  </div>

                  {/* Activity Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#A09080]">
                      <span className="font-medium text-[#F5F0E8]">
                        {activity.profiles?.[0]?.username || "Unknown User"}
                      </span>
                      <span className="text-[#5C5248]"> joined this vault</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#5C5248]">
                      {activity.responded_at
                        ? new Date(activity.responded_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : new Date(activity.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                    </p>
                  </div>

                  {/* Join Badge */}
                  <div className="flex-shrink-0">
                    <span className="rounded border border-[rgba(34,197,94,0.25)] bg-[#162116] px-2 py-1 text-xs font-semibold text-[#22C55E]">
                      ✓ Joined
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <MemoryGrid 
          memories={filteredMemories} 
          onDelete={handleDelete} 
          onFavoriteToggle={handleFavoriteToggle}
          onTagClick={(tag) => setSearchTerm(`#${tag}`)}
          onCreateMemory={() => navigate(`/workspace/${id}/new`)}
          searchTerm={searchTerm}
          deletingId={deletingId}
          userRole={userRole}
          emptyMessage={
            showFavoritesOnly 
              ? "No favorite memories yet ⭐\nStar a memory to pin it here"
              : (searchTerm 
                  ? "No results found 🔍" 
                  : (!isMember && workspace && isWorkspacePublic(workspace)
                      ? "No memories shared yet 📝\nJoin vault to create memories"
                      : "No memories yet ✨\nStart capturing your thoughts"
                    )
                )
          }
        />

      </div>

      {showInviteModal && (
        <Suspense fallback={null}>
          <InviteUserModal
            onClose={() => setShowInviteModal(false)}
            workspaceId={id}
            onSuccess={() => {
              window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId: id } }))
              loadUserRole()
            }}
          />
        </Suspense>
      )}

      {showRemoveUserModal && (
        <RemoveUserModal
          onClose={() => setShowRemoveUserModal(false)}
          workspaceId={id}
          isOwner={userRole === "owner"}
          onUserRemoved={() => {
            window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId: id } }))
            loadUserRole()
          }}
        />
      )}

      {/* Workspace Settings Modal */}
      {showSettingsModal && (
        <Modal
          open={true}
          title="Vault Settings"
          onCancel={() => setShowSettingsModal(false)}
        >
          <div className="p-6 space-y-6">
            <div>
              <h3 className="mb-4 text-lg font-semibold text-[#F5F0E8]">Visibility</h3>
              <div className="flex items-center justify-between rounded-lg border border-[#1F1F1F] bg-[#0D0D0D] p-4">
                <div>
                  <p className="font-medium text-[#F5F0E8]">
                    {workspace?.is_public ? '🌐 Public' : '🔒 Private'}
                  </p>
                  <p className="mt-1 text-sm text-[#5C5248]">
                    {workspace?.is_public 
                      ? 'Anyone can view memories in this vault' 
                      : 'Only members can access this vault'}
                  </p>
                </div>
                <button
                  onClick={handleToggleVisibility}
                  disabled={isTogglingVisibility}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    workspace?.is_public
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isTogglingVisibility ? 'Updating...' : workspace?.is_public ? 'Make Private' : 'Make Public'}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="rounded-lg border border-[#1F1F1F] bg-[#141414] px-4 py-2 font-medium text-[#A09080] transition-all hover:border-[#2A2A2A] hover:text-[#F5F0E8]"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        open={showQuickMemoryModal}
        title="Write Memory"
        inputValue={quickMemoryContent}
        onInputChange={setQuickMemoryContent}
        inputPlaceholder="Write memory"
        confirmText="Create"
        confirmDisabled={!quickMemoryContent.trim()}
        onConfirm={handleQuickMemoryCreate}
        onCancel={() => {
          setShowQuickMemoryModal(false)
          setQuickMemoryContent("")
        }}
      />
    </div>

  )

}





