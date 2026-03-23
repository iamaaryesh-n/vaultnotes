import { useEffect, useState, useCallback } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { generateKey, exportKey } from "../utils/encryption"
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

  const fetchWorkspaces = useCallback(async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, created_at, created_by")
      .order("created_at", { ascending: false })

    if (error) {
      console.error(JSON.stringify(error, null, 2))
    } else {
      setWorkspaces(data)
    }

    setLoading(false)
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
      // 1️⃣ Generate encryption key
      const key = await generateKey()
      const exportedKey = await exportKey(key)

      // 2️⃣ Create workspace
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

      // 3️⃣ Store locally BEFORE updating UI (prevents race condition)
      localStorage.setItem(`workspace_key_${workspace.id}`, exportedKey)

      // 4️⃣ Verify the DB trigger created the owner membership row
      const { data: memberRow } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .single()

      if (!memberRow) {
        console.warn("Owner trigger did not fire — inserting member row manually")
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

      // 5️⃣ Update UI immediately (optimistic update)
      setWorkspaces(prev => [workspace, ...prev])

      // 6️⃣ Save key in workspace_keys table (fire and forget)
      supabase
        .from("workspace_keys")
        .insert({
          workspace_id: workspace.id,
          user_id: user.id,
          encrypted_key: exportedKey
        })
        .then(({ error }) => {
          if (error) console.error("Key storage error:", error)
        })

      success("Workspace created")
      setCreating(false)

    } catch (err) {
      console.error("Workspace creation failed:", err)
      showError("Something went wrong")
      setCreating(false)
    }
  }, [success, showError])

  // Set up keyboard shortcuts (W for new workspace)
  useKeyboardShortcuts({
    onNewWorkspace: createWorkspace,
  })

  useEffect(() => {
    if (session) {
      fetchWorkspaces()
    }
  }, [session, fetchWorkspaces])

  // Listen for createWorkspace events from FloatingActionButton
  useEffect(() => {
    const handleCreateWorkspace = () => {
      createWorkspace()
    }
    window.addEventListener('createWorkspace', handleCreateWorkspace)
    return () => window.removeEventListener('createWorkspace', handleCreateWorkspace)
  }, [createWorkspace])

  const deleteWorkspace = useCallback(async (workspaceId) => {
    // Optimistic delete: remove from UI immediately
    const originalWorkspaces = workspaces
    setWorkspaces(prev => prev.filter(w => w.id !== workspaceId))
    setDeletingId(workspaceId)

    try {
      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId)

      if (error) {
        console.error("Delete error:", error)
        // Rollback if error
        setWorkspaces(originalWorkspaces)
        showError("Failed to delete workspace")
        setDeletingId(null)
        return
      }

      localStorage.removeItem(`workspace_key_${workspaceId}`)
      success("Deleted successfully")
      setDeletingId(null)
    } catch (err) {
      console.error("Delete failed:", err)
      // Rollback if error
      setWorkspaces(originalWorkspaces)
      showError("Something went wrong")
      setDeletingId(null)
    }
  }, [workspaces, success, showError])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
        <div style={{ maxWidth: '900px' }} className="mx-auto px-6 py-12">
          <h1 className="text-4xl text-yellow-500 font-bold mb-2">
            My Workspaces 🧠
          </h1>
          <p className="text-slate-600 mb-8">Manage your encrypted knowledge spaces</p>
          <WorkspaceListSkeleton />
        </div>
      </div>
    )
  }

  return (

    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
      <div style={{ maxWidth: '900px' }} className="mx-auto px-6 py-12">

        <h1 className="text-4xl text-yellow-500 font-bold mb-2">
          My Workspaces 🧠
        </h1>
        <p className="text-slate-600 mb-8">Manage your encrypted knowledge spaces</p>

        <button
          onClick={createWorkspace}
          disabled={creating}
          className="bg-yellow-500 hover:bg-yellow-400 hover:shadow-md active:scale-95 text-gray-900 px-6 py-3 rounded-lg mb-8 font-semibold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-yellow-500"
        >
          {creating ? '⏳ Creating...' : '+ Create Workspace'}
        </button>

        {workspaces.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-slate-600 text-lg mb-6">No workspaces yet 🚀</p>
            <p className="text-slate-500 text-sm mb-6">Start capturing your thoughts by creating your first workspace</p>
            <button
              onClick={createWorkspace}
              disabled={creating}
              className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg font-semibold transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? '⏳ Creating...' : 'Create Your First Workspace'}
            </button>
            <p className="text-xs text-slate-400 mt-4">💡 Tip: Press "W" to create a new workspace</p>
          </div>
        ) : (

          workspaces.map((workspace) => (

            <div
              key={workspace.id}
              onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${workspace.id}`))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
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

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteWorkspace(workspace.id)
                  }}
                  disabled={deletingId === workspace.id}
                  className="text-red-400 hover:text-red-600 opacity-60 group-hover:opacity-100 transition-all duration-200 px-3 py-1.5 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deletingId === workspace.id ? '⏳' : 'Delete'}
                </button>
              </div>
            </div>

          ))

        )}

      </div>
    </div>

  )

}