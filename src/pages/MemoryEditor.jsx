import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { encrypt } from "../utils/encryption"

export default function MemoryEditor({ workspaceKey }) {

  const navigate = useNavigate()
  const { id } = useParams()

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)

  const saveMemory = async () => {

    if (!content.trim()) return

    setLoading(true)

    const { ciphertext, iv } = await encrypt(content, workspaceKey)

    const {
      data: { user }
    } = await supabase.auth.getUser()

    const { error } = await supabase.from("memories").insert({
      workspace_id: id,
      title: title || "Untitled",
      encrypted_content: ciphertext,
      iv: iv,
      created_by: user.id
    })

    setLoading(false)

    if (error) {
      console.error(error)
      return
    }

    navigate(`/workspace/${id}`)
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <button
        onClick={() => navigate(-1)}
        className="mb-6 text-yellow-400"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold text-yellow-400 mb-6">
        New Memory
      </h1>

      <input
        type="text"
        placeholder="Title"
        className="w-full bg-gray-800 p-3 rounded mb-4"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        placeholder="Write your thoughts..."
        className="w-full bg-gray-800 p-3 rounded h-60"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <button
        onClick={saveMemory}
        disabled={loading}
        className="mt-6 bg-yellow-500 text-black px-4 py-2 rounded"
      >
        {loading ? "Saving..." : "Save Memory"}
      </button>

    </div>

  )
}