import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { encrypt, decrypt, importKey } from "../utils/encryption"

export default function MemoryEditor() {

  const navigate = useNavigate()
  const { id, memoryId } = useParams()

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (memoryId) {
      loadMemory()
    }
  }, [memoryId])

  const loadMemory = async () => {
    
    setLoading(true)

    const storedKey = localStorage.getItem(`workspace_key_${id}`)
    if (!storedKey) {
      alert("Encryption key not found.")
      navigate(`/workspace/${id}`)
      return
    }

    const { data: memory, error } = await supabase
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

    if (error || !memory) {
      console.error("Failed to load memory:", error)
      setLoading(false)
      return
    }

    try {
      const cryptoKey = await importKey(storedKey)
      const decryptedText = await decrypt(memory.encrypted_content, memory.iv, cryptoKey)
      
      setTitle(memory.title)
      setContent(decryptedText)
    } catch (err) {
      console.error("Decryption failed:", err)
      alert("Could not decrypt this memory.")
    }

    setLoading(false)
  }

  const saveMemory = async () => {

    if (!content.trim()) return

    const storedKey = localStorage.getItem(`workspace_key_${id}`)

    if (!storedKey) {
      alert("Encryption key not found. Please go back and reopen the workspace.")
      return
    }

    setLoading(true)

    const cryptoKey = await importKey(storedKey)
    const { ciphertext, iv } = await encrypt(content, cryptoKey)

    const {
      data: { user }
    } = await supabase.auth.getUser()

    const payload = {
      workspace_id: id,
      title: title || "Untitled",
      encrypted_content: ciphertext,
      iv: iv,
      created_by: user.id
    }

    let error

    if (memoryId) {
      // Edit existing memory
      const { data: updatedData, error: updateError } = await supabase
        .from("memories")
        .update(payload)
        .eq("id", memoryId)
        .select()
        .single()
        
      error = updateError
      if (!error && updatedData) {
        sessionStorage.setItem(`memory_${memoryId}`, JSON.stringify({
          ...updatedData, 
          content: content
        }))
      }
    } else {
      // Create new memory
      const { error: insertError } = await supabase
        .from("memories")
        .insert(payload)
      error = insertError
    }

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
        className="w-full bg-gray-800 p-3 rounded mb-4 focus:outline-none focus:border-yellow-400 border border-transparent transition-colors"
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