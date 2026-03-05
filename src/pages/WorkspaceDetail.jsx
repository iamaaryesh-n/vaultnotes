import { encrypt, decrypt, importKey } from "../utils/encryption"
import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"

export default function WorkspaceDetail() {

  const { id } = useParams()
  const navigate = useNavigate()

  const [workspace, setWorkspace] = useState(null)
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [workspaceKey, setWorkspaceKey] = useState(null)

  useEffect(() => {
    initialize()
  }, [])

  const initialize = async () => {

    await fetchWorkspace()
    await loadWorkspaceKey()

  }

  const fetchWorkspace = async () => {

    const { data } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", id)
      .single()

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

      const { data, error } = await supabase
        .from("workspace_keys")
        .select("encrypted_key")
        .eq("workspace_id", id)
        .eq("user_id", user.id)
        .single()

      if (error || !data) {
        alert("No encryption key found for this workspace.")
        setLoading(false)
        return
      }

      storedKey = data.encrypted_key

      // Save locally for future sessions
      localStorage.setItem(`workspace_key_${id}`, storedKey)

    }

    const key = await importKey(storedKey)

    setWorkspaceKey(key)

    await fetchMemories(key)

  }

  const fetchMemories = async (key) => {

    const { data } = await supabase
      .from("memories")
      .select("*")
      .eq("workspace_id", id)
      .order("created_at", { ascending: true })

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

  if (loading) {

    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        Loading workspace...
      </div>
    )

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <button
        onClick={() => navigate("/")}
        className="mb-6 text-yellow-400"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold text-yellow-400 mb-6">
        {workspace?.name}
      </h1>

      <button
        onClick={() => navigate(`/workspace/${id}/new`)}
        className="bg-yellow-500 text-black px-4 py-2 rounded mb-6"
      >
        Add Memory
      </button>

      <ul className="space-y-4">

        {memories.map((memory) => (

          <li
            key={memory.id}
            className="bg-gray-800 p-4 rounded"
          >
            {memory.content}
          </li>

        ))}

      </ul>

    </div>

  )

}