import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { generateKey, exportKey, debugLogKey, validateKey } from "../utils/encryption"
import { leaveWorkspace, deleteWorkspaceCompletely } from "../lib/workspaceMembers"
import { handleNavigationClick } from "../utils/navigation"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useToast } from "../hooks/useToast"
import { WorkspaceListSkeleton } from "../components/SkeletonLoader"

export default function Dashboard({ session }) {

  const navigate = useNavigate()
  const { success, error: showError } = useToast()

  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [userRoles, setUserRoles] = useState({}) // {workspaceId: role}
  const [ownerCounts, setOwnerCounts] = useState({}) // {workspaceId: ownerCount}

  // Track fetch state to prevent duplicate calls
  const fetchControllerRef = useRef(null)
  const lastFetchTimeRef = useRef(0)
  const isFetchingRef = useRef(false)

  const fetchWorkspaces = useCallback(async () => {
    try {
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
        .select("id, name, created_at, created_by")
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
  }, [])

  const createWorkspace = useCallback(async () => {
    const name = prompt("Workspace name?")
    if (!name) return

    setCreating(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      showError("Not authenticated")
      setCreating(false)
      return
    }

    try {
      const key = await generateKey()
      const exportedKey = await exportKey(key)

      const keyValidation = validateKey(exportedKey)
      debugLogKey(exportedKey, "Dashboard/createWorkspace")
      if (!keyValidation.isValid) {
        console.error("[Dashboard/createWorkspace] exported key is invalid:", keyValidation.error)
        showError("Failed to generate valid encryption key")
        setCreating(false)
        return
      }

      const { data: workspace, error } = await supabase
        .from("workspaces")
        .insert({
          name,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        console.error("Workspace creation error:", error)
        showError("Failed to create workspace")
        setCreating(false)
        return
      }


      localStorage.setItem(`workspace_key_${workspace.id}`, exportedKey)

      const { data: memberRow } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .single()

      if (!memberRow) {
        console.warn("Owner trigger did not fire - inserting member row manually")
        const { error: memberError } = await supabase
          .from("workspace_members")
          .insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" })
        if (memberError) {
          console.error("Failed to add owner membership:", JSON.stringify(memberError, null, 2))
          showError("Workspace created but access could not be established")
          setCreating(false)
          return
        }
      }


      setWorkspaces((prev) => [workspace, ...prev])

      supabase
        .from("workspace_keys")
        .insert({
          workspace_id: workspace.id,
          user_id: user.id,
          encrypted_key: exportedKey,
        })
        .then(({ error: keyError }) => {
          if (keyError) {
            console.error("[Dashboard/createWorkspace] Key storage error:", keyError)
          }
        })

      success("Workspace created")
      await fetchWorkspaces()
      window.dispatchEvent(new CustomEvent("workspaceMembershipChanged", { detail: { workspaceId: workspace.id } }))
      setCreating(false)
    } catch (err) {
      console.error("Workspace creation failed:", err)
      showError("Something went wrong")
      setCreating(false)
    }
  }, [success, showError, fetchWorkspaces])

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
    return runWorkspaceAction(workspaceId, "delete")
  }, [runWorkspaceAction])

  const leaveWorkspaceAction = useCallback((workspaceId) => {
    return runWorkspaceAction(workspaceId, "leave")
  }, [runWorkspaceAction])

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
                <div className="text-lg font-semibold text-gray-900 group-hover:text-yellow-500 transition-colors">
                  {workspace.name}
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
      </div>
    </div>
  )
}


