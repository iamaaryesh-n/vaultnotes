import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { generateKey, exportKey } from "../utils/encryption"

export default function Dashboard({ session }) {

  const navigate = useNavigate()

  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) {
      fetchWorkspaces()
    }
  }, [session])

  const fetchWorkspaces = async () => {

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
  }

  const createWorkspace = async () => {

    const name = prompt("Workspace name?")
    if (!name) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      alert("Not authenticated")
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
        return
      }

      // 3️⃣ Store locally BEFORE updating UI (prevents race condition)
      localStorage.setItem(`workspace_key_${workspace.id}`, exportedKey)

      // 4️⃣ Verify the DB trigger created the owner membership row
      //    (the trigger runs in the same transaction, so this should always exist)
      const { data: memberRow } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .single()

      if (!memberRow) {
        // Trigger may not have run — insert the owner row manually as a fallback
        console.warn("Owner trigger did not fire — inserting member row manually")
        const { error: memberError } = await supabase
          .from("workspace_members")
          .insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" })
        if (memberError) {
          console.error("Failed to add owner membership:", JSON.stringify(memberError, null, 2))
          alert("Workspace created but access could not be established. Please contact support.")
          return
        }
      }

      // 5️⃣ Update UI immediately
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

    } catch (err) {

      console.error("Workspace creation failed:", err)

    }
  }

  const deleteWorkspace = async (workspaceId) => {

    const { error } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", workspaceId)

    if (error) {
      console.error("Delete error:", error)
      return
    }

    localStorage.removeItem(`workspace_key_${workspaceId}`)

    fetchWorkspaces()
  }

  if (loading) {

    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center fade-in">
        Loading workspaces...
      </div>
    )

  }

  return (

    <div className="min-h-screen bg-gray-50 text-gray-900 fade-in">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-16 py-10">

        <h1 className="text-3xl text-yellow-500 font-bold mb-6">
          My Workspaces 🧠
        </h1>

        <button
          onClick={createWorkspace}
          className="bg-yellow-500 hover:bg-yellow-400 hover:scale-105 active:scale-95 text-gray-900 px-4 py-2 rounded-lg mb-6 font-semibold transition-all duration-200 shadow-sm hover:shadow-md"
        >
          Create Workspace
        </button>

        {workspaces.length === 0 ? (
          <p className="text-gray-500">No workspaces yet.</p>
        ) : (

          workspaces.map((workspace) => (

            <div
              key={workspace.id}
              className="flex justify-between bg-white p-3 rounded-lg mb-3 border border-gray-200 shadow-sm hover:shadow-md hover:border-yellow-400/50 hover:scale-[1.02] transition-all duration-200 cursor-pointer"
            >

              <button
                onClick={() => navigate(`/workspace/${workspace.id}`)}
                className="text-gray-900 hover:text-yellow-500 font-medium transition-colors"
              >
                {workspace.name}
              </button>

              <button
                onClick={() => deleteWorkspace(workspace.id)}
                className="text-red-500 hover:text-red-600 hover:scale-110 transition-all duration-200"
              >
                Delete
              </button>

            </div>

          ))

        )}

      </div>
    </div>

  )

}