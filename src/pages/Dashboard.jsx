import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useNavigate } from "react-router-dom"
import { generateKey, exportKey } from "../utils/encryption"

export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) fetchWorkspaces()
  }, [session])

  const fetchWorkspaces = async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) console.error(error)
    else setWorkspaces(data)

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

    const key = await generateKey()
    const exportedKey = await exportKey(key)

    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        name,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error(error)
      return
    }

    localStorage.setItem(`workspace_key_${data.id}`, exportedKey)
    fetchWorkspaces()
  }

  const deleteWorkspace = async (workspaceId) => {
    const { error } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", workspaceId)

    if (error) {
      console.error(error)
      return
    }

    localStorage.removeItem(`workspace_key_${workspaceId}`)
    fetchWorkspaces()
  }

  if (loading) {
    return <div className="min-h-screen bg-black text-white">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-3xl text-yellow-400 font-bold mb-6">
        My Workspaces 🧠
      </h1>

      <button
        onClick={createWorkspace}
        className="bg-yellow-500 text-black px-4 py-2 rounded mb-6"
      >
        Create Workspace
      </button>

      {workspaces.map((workspace) => (
        <div
          key={workspace.id}
          className="flex justify-between bg-gray-800 p-3 rounded mb-3"
        >
          <button
            onClick={() => navigate(`/workspace/${workspace.id}`)}
          >
            {workspace.name}
          </button>

          <button
            onClick={() => deleteWorkspace(workspace.id)}
            className="text-red-400"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}