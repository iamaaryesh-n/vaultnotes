import { encrypt, decrypt, importKey } from "../utils/encryption"
import MemoryGrid from "../components/MemoryGrid"
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
  const [searchTerm, setSearchTerm] = useState("")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  useEffect(() => {
    initialize()
  }, [])

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
    await validateSchema()
    await fetchWorkspace()
    await loadWorkspaceKey()
  }

  const fetchWorkspace = async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, created_at, created_by")
      .eq("id", id)
      .single()

    if (error) {
      console.error(JSON.stringify(error, null, 2))
    }
    
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
    console.log("Workspace ID:", id);

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
      console.error("Full error:", JSON.stringify(error, null, 2));
    }

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

  const handleDelete = async (memoryId) => {
    
    console.log("Deleting memory:", memoryId)

    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", memoryId)

    if (error) {
      console.error("Delete error:", error)
      return
    }

    setMemories(prev => {
      console.log("Current memories:", prev)
      return prev.filter(m => m.id !== memoryId)
    })
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

    if (error) {
      console.error("Favorite toggle failed:", error)
      // Revert UI on failure
      setMemories(prev => prev.map(m => 
        m.id === memoryId ? { ...m, is_favorite: currentStatus } : m
      ))
    }
  }

  const filteredMemories = memories.filter((memory) => {
    if (showFavoritesOnly && !memory.is_favorite) {
      return false
    }

    const term = searchTerm.toLowerCase()
    if (!term) return true
    
    // Tag specific search
    if (term.startsWith("#")) {
      const tagQuery = term.slice(1).trim()
      if (!tagQuery) return true
      return memory.tags?.some(tag => tag.toLowerCase().includes(tagQuery))
    }
    
    // Full text search
    const matchTitle = memory.title?.toLowerCase().includes(term)
    const matchContent = memory.content?.toLowerCase().includes(term)
    const matchTags = memory.tags?.some(tag => tag.toLowerCase().includes(term))
    
    return matchTitle || matchContent || matchTags
  })

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

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-yellow-400">
          {workspace?.name}
        </h1>
        <div className="flex items-center gap-4">
          
          {/* Favorites Filter Toggle */}
          <div className="flex bg-zinc-900 border border-zinc-700 rounded p-1">
            <button
              onClick={() => setShowFavoritesOnly(false)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition ${!showFavoritesOnly ? 'bg-zinc-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              All
            </button>
            <button
              onClick={() => setShowFavoritesOnly(true)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition flex items-center gap-1.5 ${showFavoritesOnly ? 'bg-zinc-700 text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
              </svg>
              Favorites
            </button>
          </div>

          <button
            onClick={() => navigate(`/workspace/${id}/new`)}
            className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded font-medium transition"
          >
            Add Memory
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search memories or #tags..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full p-3 mb-6 bg-zinc-900 border border-zinc-700 rounded text-white focus:outline-none focus:border-yellow-400 transition-colors"
      />

      <MemoryGrid 
        memories={filteredMemories} 
        onDelete={handleDelete} 
        onFavoriteToggle={handleFavoriteToggle}
        onTagClick={(tag) => setSearchTerm(`#${tag}`)}
        emptyMessage={
          showFavoritesOnly 
            ? "You haven't favorited any memories yet." 
            : (searchTerm ? "No memories match your search." : "No memories yet. Create one!")
        }
      />

    </div>

  )

}