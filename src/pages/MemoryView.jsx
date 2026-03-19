import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { decrypt, importKey } from "../utils/encryption"

export default function MemoryView() {

  const { id, memoryId } = useParams()
  const navigate = useNavigate()

  const [memory, setMemory] = useState(null)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMemory()
  }, [memoryId])

  const loadMemory = async () => {

    setLoading(true)

    // 1️⃣ Try session cache first
    const cached = sessionStorage.getItem(`memory_${memoryId}`)
    if (cached) {
      const parsed = JSON.parse(cached)
      setMemory(parsed)
      setContent(parsed.content)
      setLoading(false)
      return
    }

    let storedKey = localStorage.getItem(`workspace_key_${id}`)
    if (!storedKey) {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: keyData, error: keyError } = await supabase
        .from("workspace_keys")
        .select("encrypted_key")
        .eq("workspace_id", id)
        .eq("user_id", user.id)
        .single()

      if (keyError || !keyData) {
        alert("No encryption key found for this workspace.")
        navigate(`/workspace/${id}`)
        return
      }

      storedKey = keyData.encrypted_key
      localStorage.setItem(`workspace_key_${id}`, storedKey)
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
      .eq("id", memoryId)
      .single()

    if (error || !data) {
      console.error("Failed to load memory:", error)
      navigate(`/workspace/${id}`)
      return
    }

    try {
      const cryptoKey = await importKey(storedKey)
      const decryptedText = await decrypt(data.encrypted_content, data.iv, cryptoKey)
      
      const memoryWithContent = { ...data, content: decryptedText }
      setMemory(memoryWithContent)
      setContent(decryptedText)
      
      // Save to cache
      sessionStorage.setItem(`memory_${memoryId}`, JSON.stringify(memoryWithContent))
    } catch (err) {
      console.error("Decryption failed:", err)
      alert("Could not decrypt this memory.")
      navigate(`/workspace/${id}`)
      return
    }

    setLoading(false)
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this memory?")) return

    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", memoryId)

    if (error) {
      console.error("Delete failed:", error)
      alert("Failed to delete memory.")
      return
    }

    navigate(`/workspace/${id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        <button
          onClick={() => navigate(`/workspace/${id}`)}
          className="mb-6 text-yellow-400 opacity-50 cursor-default"
        >
          ← Back to Workspace
        </button>

        <div className="max-w-3xl mx-auto bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-md animate-pulse">
          <div className="flex justify-between items-start mb-6 border-b border-gray-800 pb-6">
            <div className="w-full">
              <div className="h-8 bg-gray-800 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-800 rounded w-1/4"></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-800 rounded w-full"></div>
            <div className="h-4 bg-gray-800 rounded w-5/6"></div>
            <div className="h-4 bg-gray-800 rounded w-4/6"></div>
            <div className="h-4 bg-gray-800 rounded w-full"></div>
            <div className="h-4 bg-gray-800 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    )
  }

  const formattedDate = memory?.created_at
    ? new Date(memory.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      })
    : "Unknown date"

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <button
        onClick={() => navigate(`/workspace/${id}`)}
        className="mb-6 text-yellow-400 hover:text-yellow-300"
      >
        ← Back to Workspace
      </button>

      <div className="max-w-3xl mx-auto bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-md">
        
        <div className="flex justify-between items-start mb-6 border-b border-gray-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-yellow-400 mb-2">
              {memory?.title || "Untitled"}
            </h1>
            <p className="text-sm text-gray-500">
              {formattedDate}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/workspace/${id}/memory/${memoryId}/edit`)}
              className="bg-gray-800 text-gray-300 hover:text-white px-4 py-2 rounded border border-gray-700 hover:bg-gray-700 transition"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded border border-red-500/20 hover:border-red-500 transition"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Tags row if available */}
        {memory?.tags && memory.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {memory.tags.map((tag, idx) => (
              <span key={idx} className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 px-3 py-1 rounded-full text-sm">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
          {content || <span className="italic text-gray-500">No content</span>}
        </div>

      </div>

    </div>
  )
}
