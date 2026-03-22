import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { decrypt, importKey } from "../utils/encryption"
import DOMPurify from 'dompurify'

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

      if (keyError || !keyData?.encrypted_key) {
        console.error("Key fetch error:", JSON.stringify(keyError, null, 2))
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
      <div className="min-h-screen bg-gray-50 text-gray-900 p-10">
        <button
          onClick={() => navigate(`/workspace/${id}`)}
          className="mb-6 text-yellow-500 opacity-50 cursor-default"
        >
          ← Back to Workspace
        </button>

        <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl p-8 shadow-sm animate-pulse">
          <div className="flex justify-between items-start mb-6 border-b border-gray-200 pb-6">
            <div className="w-full">
              <div className="h-8 bg-gray-100 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-100 rounded w-1/4"></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-100 rounded w-full"></div>
            <div className="h-4 bg-gray-100 rounded w-5/6"></div>
            <div className="h-4 bg-gray-100 rounded w-4/6"></div>
            <div className="h-4 bg-gray-100 rounded w-full"></div>
            <div className="h-4 bg-gray-100 rounded w-3/4"></div>
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
    <div className="min-h-screen bg-gray-50 text-gray-900 fade-in">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 lg:px-16 py-10">

        <button
          onClick={() => navigate(`/workspace/${id}`)}
          className="mb-6 text-yellow-500 hover:text-yellow-400 transition-colors"
        >
          ← Back to Workspace
        </button>

        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          
          <div className="flex justify-between items-start mb-6 border-b border-gray-200 pb-6">
            <div>
              <h1 className="text-3xl font-bold text-yellow-500 mb-2">
                {memory?.title || "Untitled"}
              </h1>
              <p className="text-sm text-gray-500">
                {formattedDate}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/workspace/${id}/memory/${memoryId}/edit`)}
                className="bg-gray-100 text-gray-900 hover:text-yellow-500 hover:scale-105 active:scale-95 px-4 py-2 rounded-lg border border-gray-200 hover:bg-yellow-50 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-50 text-red-600 hover:bg-red-100 hover:scale-105 active:scale-95 px-4 py-2 rounded-lg border border-red-200 hover:border-red-300 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Tags row if available */}
          {memory?.tags && memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {memory.tags.map((tag, idx) => (
                <span key={idx} className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1 rounded-full text-sm">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Content */}
          <style>{`
            .tiptap-content ul { list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
            .tiptap-content p { margin-bottom: 0.5rem; }
            .tiptap-content pre { background: #f9fafb; border: 1px solid #e5e7eb; padding: 1rem; border-radius: 0.5rem; font-family: monospace; overflow-x: auto; color: #111827; }
            .tiptap-content code { background: #f3f4f6; color: #92400e; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; }
            .tiptap-content pre code { background: transparent; padding: 0; color: #1f2937; }
          `}</style>

          <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {content ? (
              <div className="tiptap-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
            ) : (
              <span className="italic text-gray-400">No content</span>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}
