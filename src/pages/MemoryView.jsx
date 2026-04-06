import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { decrypt, importKey, debugLogKey, validateKey } from "../utils/encryption"
import { canEdit, canDelete, getUserRole } from "../utils/rolePermissions"
import DOMPurify from "dompurify"
import { handleNavigationClick } from "../utils/navigation"
import { useToast } from "../hooks/useToast"
import { MemoryViewSkeleton } from "../components/SkeletonLoader"
import Modal from "../components/Modal"

const isTiptapContentEmpty = (value) => {
  if (value == null || value === "") return true
  if (value === "<p></p>" || value === "<p><br></p>") return true

  const container = document.createElement("div")
  container.innerHTML = value
  const text = (container.textContent || "").trim()
  const hasMedia = container.querySelector("img,video,iframe,embed,object")

  return text.length === 0 && !hasMedia
}

export default function MemoryView() {
  const { id, memoryId } = useParams()
  const navigate = useNavigate()
  const { success, error: showError } = useToast()

  const [memory, setMemory] = useState(null)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [userRole, setUserRole] = useState("viewer")
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const loadControllerRef = useRef(null)
  const isLoadingMemoryRef = useRef(false)

  useEffect(() => {
    loadMemory()
    loadUserRole()

    return () => {
      if (loadControllerRef.current) {
        loadControllerRef.current.abort()
      }
    }
  }, [memoryId, id])

  const loadMemory = async () => {
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
      console.log("[MemoryView] Step 1: Fetching fresh memory data...")

      console.log("[MemoryView] Step 2: Ensuring encryption key exists...")
      let storedKey = localStorage.getItem(`workspace_key_${id}`)
      let memberKeyFound = false
      let publicKeyFound = false

      if (!storedKey) {
        console.log("[MemoryView] Key not in localStorage, fetching from database...")
        const { data: authData, error: authError } = await supabase.auth.getUser()
        const user = authData?.user

        if (authError || !user) {
          console.error("[MemoryView] Authentication error:", authError)
          showError("Authentication required")
          navigate(`/workspace/${id}`)
          setLoading(false)
          return
        }

        // Try to fetch member key (for workspace members)
        const { data: memberKeyData, error: memberKeyError } = await supabase
          .from("workspace_keys")
          .select("encrypted_key")
          .eq("workspace_id", id)
          .eq("user_id", user.id)
          .maybeSingle()

        if (memberKeyError) {
          console.log("[MemoryView] Error fetching member key:", memberKeyError)
        }

        if (memberKeyData?.encrypted_key) {
          console.log("[MemoryView] Member key found")
          storedKey = memberKeyData.encrypted_key
          memberKeyFound = true
        } else {
          console.log("[MemoryView] Member key not found, checking for public_read key...")

          // Try to fetch public_read key (for public workspace viewers)
          const { data: publicKeyData, error: publicKeyError } = await supabase
            .from("workspace_keys")
            .select("encrypted_key")
            .eq("workspace_id", id)
            .is("user_id", null)
            .eq("key_scope", "public_read")
            .maybeSingle()

          if (publicKeyError) {
            console.log("[MemoryView] Error fetching public_read key:", publicKeyError)
          }

          if (publicKeyData?.encrypted_key) {
            console.log("[MemoryView] Public_read key found")
            storedKey = publicKeyData.encrypted_key
            publicKeyFound = true
          }
        }

        if (!storedKey) {
          console.error("[MemoryView] No encryption key found (tried: member key, public_read key)")
          showError("No encryption key found for this workspace")
          navigate(`/workspace/${id}`)
          setLoading(false)
          return
        }

        localStorage.setItem(`workspace_key_${id}`, storedKey)
        console.log("[MemoryView] Key retrieved and cached")
      } else {
        console.log("[MemoryView] Using key from localStorage")
      }

      console.log("[MemoryView] Step 3: Validating encryption key...")
      const keyValidation = validateKey(storedKey)
      debugLogKey(storedKey, "MemoryView")

      if (!keyValidation.isValid) {
        console.error("[MemoryView] Invalid encryption key:", keyValidation.error)
        showError("Invalid encryption key")
        navigate(`/workspace/${id}`)
        setLoading(false)
        return
      }

      console.log("[MemoryView] Encryption key validated")

      console.log("[MemoryView] Step 4: Fetching memory from database...")
      const { data, error: fetchError } = await supabase
        .from("memories")
        .select("id, title, encrypted_content, iv, created_at, updated_at, workspace_id, tags, is_favorite")
        .eq("id", memoryId)
        .eq("workspace_id", id)
        .maybeSingle()

      if (fetchError) {
        console.error("[MemoryView] Database fetch error:", fetchError)
      }

      if (!data) {
        console.error("[MemoryView] Memory not found:", memoryId)
        showError("Memory not found or access denied")
        navigate(`/workspace/${id}`)
        setLoading(false)
        return
      }

      console.log("[MemoryView] Memory fetched from database")

      console.log("[MemoryView] Step 5: Decrypting memory content...")
      try {
        const cryptoKey = await importKey(storedKey)
        const decryptedText = await decrypt(data.encrypted_content, data.iv, cryptoKey)
        const memoryWithContent = { ...data, content: decryptedText }

        setMemory(memoryWithContent)
        setContent(decryptedText)

        console.log("[MemoryView] Memory decrypted successfully")
      } catch (decryptErr) {
        console.error("[MemoryView] Decryption error:", decryptErr)
        showError("Could not decrypt this memory")
        navigate(`/workspace/${id}`)
        setLoading(false)
        return
      }

      const elapsedMs = Date.now() - startTime
      console.log(`[MemoryView] Memory load completed in ${elapsedMs}ms`)
    } catch (err) {
      console.error("[MemoryView] Unexpected error:", err)
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
      console.error("[MemoryView] Permission denied to delete")
      showError("You don't have permission to delete this memory")
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
        console.error("[MemoryView] Delete failed:", error)
        showError("Failed to delete memory")
        setDeleting(false)
        return
      }

      console.log("[MemoryView] Memory deleted successfully")
      success("Deleted successfully")
      setDeleting(false)
      navigate(`/workspace/${id}`)
    } catch (err) {
      console.error("[MemoryView] Unexpected error during delete:", err)
      showError("Something went wrong")
      setDeleting(false)
    }
  }

  if (loading) {
    return <MemoryViewSkeleton />
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
      <div style={{ maxWidth: "760px" }} className="mx-auto px-6 py-12">
        <button
          onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}`))}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-yellow-600 transition-colors hover:text-yellow-500"
        >
          Back to Workspace
        </button>

        <div className="rounded-[28px] border border-slate-200/80 bg-white/95 px-8 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.09)] backdrop-blur-sm">
          <div className="mb-8 flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h1 className="mb-2 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{memory?.title || "Untitled"}</h1>
              <p className="text-sm font-medium text-slate-500">{formattedDate}</p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {canEdit(userRole) && (
                <button
                  onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}/memory/${memoryId}/edit`))}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 transition-all duration-200 hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-600 active:scale-95"
                >
                  Edit
                </button>
              )}
              {canDelete(userRole) && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  disabled={deleting}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-all duration-200 hover:border-red-300 hover:bg-red-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-50"
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
            .prose-memory {
              max-width: 700px;
              margin: 0 auto;
              line-height: 1.6;
              word-break: break-word;
              color: #334155;
            }
            .prose-memory * {
              max-width: 100%;
            }
            .prose-memory > * + * {
              margin-top: 12px;
            }
            .prose-memory p,
            .prose-memory ul,
            .prose-memory ol,
            .prose-memory pre,
            .prose-memory blockquote,
            .prose-memory table {
              display: flow-root;
            }
            .prose-memory p {
              margin-bottom: 10px;
            }
            .prose-memory ul { list-style-type: disc; margin-left: 1.5rem; }
            .prose-memory ol { list-style-type: decimal; margin-left: 1.5rem; }
            .prose-memory pre {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              padding: 1rem;
              border-radius: 0.75rem;
              font-family: monospace;
              overflow-x: auto;
              color: #111827;
            }
            .prose-memory code {
              background: #f1f5f9;
              color: #92400e;
              padding: 0.2rem 0.4rem;
              border-radius: 0.25rem;
              font-size: 0.875em;
            }
            .prose-memory pre code {
              background: transparent;
              padding: 0;
              color: #1f2937;
            }
            .prose-memory img {
              max-width: 100%;
              height: auto;
              border-radius: 12px;
            }
            .prose-memory img[data-align="left"] {
              float: left;
              margin-right: 12px;
              margin-bottom: 8px;
            }
            .prose-memory img[data-align="right"] {
              float: right;
              margin-left: 12px;
              margin-bottom: 8px;
            }
            .prose-memory img[data-align="center"] {
              display: block;
              clear: both;
              float: none;
              margin: 0 auto 12px;
            }
            .prose-memory::after {
              content: "";
              display: block;
              clear: both;
            }
          `}</style>

          <div className="whitespace-pre-wrap text-gray-700">
            {!isTiptapContentEmpty(content) ? (
              <div className="prose-memory" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
            ) : (
              <div className="mx-auto max-w-[700px] rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center italic text-slate-400">
                No content
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={showDeleteModal}
        title="Delete Memory"
        message="Are you sure you want to delete this memory? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={deleting}
        onConfirm={() => {
          setShowDeleteModal(false)
          handleDelete()
        }}
        onCancel={() => {
          console.log("[MemoryView] Delete cancelled by user")
          setShowDeleteModal(false)
        }}
      />
    </div>
  )
}
