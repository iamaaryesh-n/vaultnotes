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
      // OPTIMIZATION: Check localStorage first to avoid DB query if key is cached
      let storedKey = localStorage.getItem(`workspace_key_${id}`)
      
      if (storedKey) {
        console.log("[MemoryView] ✅ Using key from localStorage (cached)")
      } else {
        console.log("[MemoryView] Key not cached, fetching from database...")
        const { data: authData, error: authError } = await supabase.auth.getUser()
        const user = authData?.user

        if (authError || !user) {
          console.error("[MemoryView] Authentication error:", authError)
          showError("Authentication required")
          navigate(`/workspace/${id}`)
          setLoading(false)
          return
        }

        let memberKeyFound = false
        let publicKeyFound = false

        // OPTIMIZATION: Try member key first with specific key_scope
        const { data: memberKeyData, error: memberKeyError } = await supabase
          .from("workspace_keys")
          .select("encrypted_key")
          .eq("workspace_id", id)
          .eq("user_id", user.id)
          .eq("key_scope", "member")
          .maybeSingle()

        if (memberKeyData?.encrypted_key) {
          console.log("[MemoryView] ✅ Member key found")
          storedKey = memberKeyData.encrypted_key
          memberKeyFound = true
        } else if (memberKeyError) {
          console.log("[MemoryView] Member key fetch error:", memberKeyError)
        }

        // If no member key, try public_read key (for public workspace viewers)
        if (!storedKey) {
          console.log("[MemoryView] Checking for public_read key...")
          const { data: publicKeyData, error: publicKeyError } = await supabase
            .from("workspace_keys")
            .select("encrypted_key")
            .eq("workspace_id", id)
            .is("user_id", null)
            .eq("key_scope", "public_read")
            .maybeSingle()

          if (publicKeyData?.encrypted_key) {
            console.log("[MemoryView] ✅ Public_read key found")
            storedKey = publicKeyData.encrypted_key
            publicKeyFound = true
          } else if (publicKeyError) {
            console.log("[MemoryView] Public key fetch error:", publicKeyError)
          }
        }

        if (!storedKey) {
          console.error("[MemoryView] ❌ No encryption key found")
          showError("No encryption key found for this workspace")
          navigate(`/workspace/${id}`)
          setLoading(false)
          return
        }

        // Cache key for future loads in this session
        localStorage.setItem(`workspace_key_${id}`, storedKey)
        console.log("[MemoryView] Key cached in localStorage")
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
    <div className="min-h-screen bg-[var(--profile-bg)] text-[var(--profile-text)]">
      <div className="fixed left-0 right-0 top-[56px] z-[95] border-b border-[var(--profile-border)] bg-[var(--profile-bg)] px-5 pb-3 pt-5">
        <div style={{ maxWidth: "760px" }} className="mx-auto">
          <button
            onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}`))}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--profile-text-subtle)] transition-colors hover:text-[#F4B400]"
          >
            Back to Workspace
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "760px" }} className="mx-auto px-4 pb-[90px] pt-[72px]">
        <button
          onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}`))}
          className="mb-5 hidden"
        >
          Back to Workspace
        </button>

        <div
          className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-surface)] px-6 py-6 transition-shadow duration-200 hover:shadow-[0_20px_52px_rgba(15,23,42,0.24)] dark:hover:shadow-[0_24px_58px_rgba(0,0,0,0.52)]"
          style={{ boxShadow: "var(--memory-open-shadow)" }}
        >
          <div className="mb-6 flex flex-col gap-5 border-b border-[var(--profile-border)] pb-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h1 className="mb-2 font-['Sora'] text-[28px] font-[800] tracking-tight text-[var(--profile-text)] md:text-[34px]">{memory?.title || "Untitled"}</h1>
              <p className="text-sm font-medium text-[var(--profile-text-muted)]">{formattedDate}</p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {canEdit(userRole) && (
                <button
                  onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${id}/memory/${memoryId}/edit`))}
                  className="rounded-[10px] border border-[var(--profile-border)] bg-[var(--profile-elev)] px-4 py-2 text-sm font-medium text-[var(--profile-text-subtle)] transition-all duration-200 hover:border-[var(--profile-border-strong)] hover:text-[var(--profile-text)]"
                >
                  Edit
                </button>
              )}
              {canDelete(userRole) && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  disabled={deleting}
                  className="rounded-[10px] border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.12)] px-4 py-2 text-sm font-medium text-[#EF4444] transition-all duration-200 hover:bg-[rgba(239,68,68,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>

          {memory?.tags && memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {memory.tags.map((tag, idx) => (
                <span key={idx} className="rounded-full border border-[rgba(244,180,0,0.25)] bg-[#2A2000] px-3 py-1 text-sm text-[#F4B400]">
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
              color: var(--profile-text-subtle);
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
              background: var(--profile-elev);
              border: 1px solid var(--profile-border);
              padding: 1rem;
              border-radius: 0.75rem;
              font-family: monospace;
              overflow-x: auto;
              color: var(--profile-text);
            }
            .prose-memory code {
              background: #1C1C1C;
              color: #F4B400;
              padding: 0.2rem 0.4rem;
              border-radius: 0.25rem;
              font-size: 0.875em;
            }
            .prose-memory pre code {
              background: transparent;
              padding: 0;
              color: var(--profile-text);
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

          <div className="whitespace-pre-wrap text-[var(--profile-text-subtle)]">
            {!isTiptapContentEmpty(content) ? (
              <div className="prose-memory" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
            ) : (
              <div className="mx-auto max-w-[700px] rounded-2xl border border-dashed border-[var(--profile-border)] bg-[var(--profile-elev)] px-5 py-8 text-center italic text-[var(--profile-text-muted)]">
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
