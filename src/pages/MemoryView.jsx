import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { decrypt, importKey, debugLogKey, validateKey } from "../utils/encryption"
import { canEdit, canDelete, getUserRole } from "../utils/rolePermissions"
import DOMPurify from "dompurify"
import { handleNavigationClick } from "../utils/navigation"
import { useToast } from "../hooks/useToast"

export default function MemoryView() {
  const { id, memoryId } = useParams()
  const navigate = useNavigate()
  const { success, error: showError } = useToast()

  const [memory, setMemory] = useState(null)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [userRole, setUserRole] = useState("viewer")

  // Track to prevent concurrent loads
  const loadControllerRef = useRef(null)
  const isLoadingMemoryRef = useRef(false)

  useEffect(() => {
    loadMemory()
    loadUserRole()

    return () => {
      // Cleanup: cancel pending load on unmount
      if (loadControllerRef.current) {
        loadControllerRef.current.abort()
      }
    }
  }, [memoryId, id])

  const loadMemory = async () => {
    // Prevent concurrent loads
    if (isLoadingMemoryRef.current) {
      console.log("[MemoryView] Memory load already in progress, skipping duplicate request")
      return
    }

    isLoadingMemoryRef.current = true
    loadControllerRef.current = new AbortController()
    const startTime = Date.now()

    setLoading(true)

    try {
      console.log("[MemoryView] Starting memory load for ID:", memoryId)

      // Step 1: Check session cache
      console.log("[MemoryView] Step 1: Checking session cache...")
      const cached = sessionStorage.getItem(`memory_${memoryId}`)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          if (parsed?.workspace_id === id) {
            console.log("[MemoryView] ✅ Found valid cached memory")
            setMemory(parsed)
            setContent(parsed.content || "")
            setLoading(false)
            const elapsedMs = Date.now() - startTime
            console.log(`[MemoryView] ✅ Memory load (from cache) completed in ${elapsedMs}ms`)
            return
          }
        } catch {
          console.warn("[MemoryView] Invalid cache, clearing...")
          sessionStorage.removeItem(`memory_${memoryId}`)
        }
      }

      console.log("[MemoryView] ℹ️ No valid cache, fetching from database")

      // Step 2: Get encryption key (from localStorage or database)
      console.log("[MemoryView] Step 2: Ensuring encryption key exists...")
      let storedKey = localStorage.getItem(`workspace_key_${id}`)
      
      if (!storedKey) {
        console.log("[MemoryView] Key not in localStorage, fetching from database...")
        const { data: authData, error: authError } = await supabase.auth.getUser()
        const user = authData?.user
        
        if (authError || !user) {
          console.error("[MemoryView] ❌ Authentication error:", authError)
          showError("Authentication required")
          navigate(`/workspace/${id}`)
          setLoading(false)
          return
        }

        const { data: keyData, error: keyError } = await supabase
          .from("workspace_keys")
          .select("encrypted_key")
          .eq("workspace_id", id)
          .eq("user_id", user.id)
          .maybeSingle()

        if (keyError) {
          console.error("[MemoryView] ❌ Error fetching key:", keyError)
        }

        if (!keyData?.encrypted_key) {
          console.error("[MemoryView] ❌ No encryption key found")
          showError("No encryption key found for this workspace")
          navigate(`/workspace/${id}`)
          setLoading(false)
          return
        }

        storedKey = keyData.encrypted_key
        localStorage.setItem(`workspace_key_${id}`, storedKey)
        console.log("[MemoryView] ✅ Key retrieved and cached")
      } else {
        console.log("[MemoryView] ✅ Using key from localStorage")
      }

      // Step 3: Validate key
      console.log("[MemoryView] Step 3: Validating encryption key...")
      const keyValidation = validateKey(storedKey)
      debugLogKey(storedKey, "MemoryView")
      
      if (!keyValidation.isValid) {
        console.error("[MemoryView] ❌ Invalid encryption key:", keyValidation.error)
        showError("Invalid encryption key")
        navigate(`/workspace/${id}`)
        setLoading(false)
        return
      }

      console.log("[MemoryView] ✅ Encryption key validated")

      // Step 4: Fetch memory from database
      console.log("[MemoryView] Step 4: Fetching memory from database...")
      const { data, error: fetchError } = await supabase
        .from("memories")
        .select("id, title, encrypted_content, iv, created_at, updated_at, workspace_id, tags, is_favorite")
        .eq("id", memoryId)
        .eq("workspace_id", id)
        .maybeSingle()

      if (fetchError) {
        console.error("[MemoryView] ❌ Database fetch error:", fetchError)
      }

      if (!data) {
        console.error("[MemoryView] ❌ Memory not found:", memoryId)
        showError("Memory not found or access denied")
        navigate(`/workspace/${id}`)
        setLoading(false)
        return
      }

      console.log("[MemoryView] ✅ Memory fetched from database")

      // Step 5: Decrypt memory content
      console.log("[MemoryView] Step 5: Decrypting memory content...")
      try {
        const cryptoKey = await importKey(storedKey)
        const decryptedText = await decrypt(data.encrypted_content, data.iv, cryptoKey)
        const memoryWithContent = { ...data, content: decryptedText }
        
        setMemory(memoryWithContent)
        setContent(decryptedText)
        sessionStorage.setItem(`memory_${memoryId}`, JSON.stringify(memoryWithContent))
        
        console.log("[MemoryView] ✅ Memory decrypted and cached")
      } catch (decryptErr) {
        console.error("[MemoryView] ❌ Decryption error:", decryptErr)
        showError("Could not decrypt this memory")
        navigate(`/workspace/${id}`)
        setLoading(false)
        return
      }

      const elapsedMs = Date.now() - startTime
      console.log(`[MemoryView] ✅ Memory load completed in ${elapsedMs}ms`)
    } catch (err) {
      console.error("[MemoryView] ❌ Unexpected error:", err)
      showError("An error occurred while loading memory")
      navigate(`/workspace/${id}`)
      setLoading(false)
    } finally {
      setLoading(false)
      isLoadingMemoryRef.current = false
    }
  }

  const loadUserRole = async () => {
    const role = await getUserRole(id)
    setUserRole(role)
  }

  const handleDelete = async () => {
    console.log("[MemoryView] Delete requested for memory:", memoryId)

    if (!canDelete(userRole)) {
      console.error("[MemoryView] ❌ Permission denied to delete")
      showError("You don't have permission to delete this memory")
      return
    }

    if (!confirm("Are you sure you want to delete this memory?")) {
      console.log("[MemoryView] Delete cancelled by user")
      return
    }

    setDeleting(true)
    try {
      console.log("[MemoryView] Deleting memory from database...")
      const { error } = await supabase
        .from("memories")
        .delete()
        .eq("id", memoryId)
        .eq("workspace_id", id)

      if (error) {
        console.error("[MemoryView] ❌ Delete failed:", error)
        showError("Failed to delete memory")
        setDeleting(false)
        return
      }

      console.log("[MemoryView] ✅ Memory deleted successfully")
      success("Deleted successfully")
      setDeleting(false)
      navigate(`/workspace/${id}`)
    } catch (err) {
      console.error("[MemoryView] ❌ Unexpected error during delete:", err)
      showError("Something went wrong")
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 p-10">
        <button
          onClick={() => navigate(`/workspace/${id}`)}
          className="mb-6 text-yellow-500 opacity-50 cursor-default"
        >
          Back to Workspace
        </button>

        <div style={{ maxWidth: "800px" }} className="mx-auto card p-8 animate-pulse">
          <div className="flex justify-between items-start mb-6 border-b border-slate-200 pb-6">
            <div className="w-full">
              <div className="h-8 bg-slate-200 rounded w-1/3 mb-4" />
              <div className="h-4 bg-slate-200 rounded w-1/4" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-4 bg-slate-200 rounded w-full" />
            <div className="h-4 bg-slate-200 rounded w-5/6" />
            <div className="h-4 bg-slate-200 rounded w-4/6" />
            <div className="h-4 bg-slate-200 rounded w-full" />
            <div className="h-4 bg-slate-200 rounded w-3/4" />
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
      <div style={{ maxWidth: "800px" }} className="mx-auto px-6 py-12">
        <button
          onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}`))}
          className="mb-8 text-yellow-500 hover:text-yellow-400 transition-colors font-medium"
        >
          Back to Workspace
        </button>

        <div className="card p-8">
          <div className="flex justify-between items-start mb-8 border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">{memory?.title || "Untitled"}</h1>
              <p className="text-sm text-slate-500">{formattedDate}</p>
            </div>

            <div className="flex gap-2">
              {canEdit(userRole) && (
                <button
                  onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}/memory/${memoryId}/edit`))}
                  className="bg-slate-100 text-gray-900 hover:text-yellow-500 active:scale-95 px-4 py-2 rounded-lg border border-slate-200 hover:bg-yellow-50 hover:border-yellow-300 transition-all duration-200"
                >
                  Edit
                </button>
              )}
              {canDelete(userRole) && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 px-4 py-2 rounded-lg border border-red-200 hover:border-red-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-50"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>

          {memory?.tags && memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {memory.tags.map((tag, idx) => (
                <span key={idx} className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1 rounded-full text-sm">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <style>{`
            .tiptap-content ul { list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
            .tiptap-content p { margin-bottom: 0.5rem; }
            .tiptap-content pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 0.5rem; font-family: monospace; overflow-x: auto; color: #111827; }
            .tiptap-content code { background: #f1f5f9; color: #92400e; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; }
            .tiptap-content pre code { background: transparent; padding: 0; color: #1f2937; }
          `}</style>

          <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {content ? (
              <div className="tiptap-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
            ) : (
              <span className="italic text-slate-400">No content</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
