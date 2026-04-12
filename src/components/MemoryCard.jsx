import { useState, memo } from "react"
import { useNavigate } from "react-router-dom"
import { canDelete } from "../utils/rolePermissions"
import { handleNavigationClick } from "../utils/navigation"
import Modal from "./Modal"

function MemoryCard({ memory, onDelete, onFavoriteToggle, onTagClick, searchTerm = "", isDeleting = false, userRole = "viewer", isEncrypted = false }) {

  const navigate = useNavigate()
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const safeTitle = typeof memory?.title === "string" ? memory.title : ""
  const safeContentHtml = typeof memory?.content === "string" ? memory.content : ""
  const safeTags = Array.isArray(memory?.tags)
    ? memory.tags
    : (typeof memory?.tags === "string" && memory.tags.trim()
        ? memory.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [])

  // Calculate relative time (e.g., "2 hours ago")
  const getRelativeTime = (dateString) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  // Determine if memory was edited (has different updated_at and created_at)
  const wasEdited = memory.updated_at && memory.created_at && 
    new Date(memory.updated_at).getTime() !== new Date(memory.created_at).getTime()
  const relevantDate = wasEdited ? memory.updated_at : memory.created_at
  const timeLabel = wasEdited ? "Edited" : "Created"
  const relativeTime = getRelativeTime(relevantDate)

  // Strip HTML tags from TipTap content for plain-text preview
  const plainContent = safeContentHtml ? safeContentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ""
  
  // Get first meaningful preview (skip empty lines)
  const getPreview = (text) => {
    if (!text) return "No content"
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    return lines[0] || "No content"
  }

  // Highlight matching substring — returns array of {text, isMatch} segments
  const highlight = (text, term) => {
    if (!term || !text) return [{ text, isMatch: false }]
    const cleanTerm = term.startsWith('#') ? term.slice(1) : term
    if (!cleanTerm) return [{ text, isMatch: false }]
    const regex = new RegExp(`(${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return text.split(regex).map(seg => ({ text: seg, isMatch: regex.test(seg) }))
  }

  // Check if recently updated (within 24 hours)
  const isRecent = relevantDate && (new Date() - new Date(relevantDate)) < 86400000

  return (

    <div
      data-post-id={memory.id}
      className={`cursor-pointer rounded-[16px] border bg-[var(--profile-surface)] p-4 text-[var(--profile-text)] transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-lg ${
        isRecent ? 'border-[rgba(244,180,0,0.4)] bg-[rgba(244,180,0,0.08)]' : 'border-[var(--profile-border)]'
      }`}
      onClick={(e) => handleNavigationClick(e, () => navigate(`/workspace/${memory.workspace_id}/memory/${memory.id}`))}
    >

      {/* Title & Star */}
      <div className="flex justify-between items-start gap-2">
        <h2 className="flex-1 leading-snug text-lg font-bold text-[var(--profile-text)]">
          {searchTerm && !searchTerm.startsWith('#')
            ? highlight(safeTitle || "Untitled memory", searchTerm).map((seg, i) =>
                seg.isMatch
                  ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{seg.text}</mark>
                  : <span key={i}>{seg.text}</span>
              )
            : (safeTitle || "Untitled memory")
          }
        </h2>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onFavoriteToggle) onFavoriteToggle(memory.id, memory.is_favorite)
          }}
          className={`-mr-1 -mt-1 flex-shrink-0 rounded-full p-1 transition-all duration-200 hover:bg-[var(--profile-hover)] ${
            memory.is_favorite ? "text-[#F4B400]" : "text-[var(--profile-text-muted)] hover:text-[#F4B400]"
          }`}
        >
          {memory.is_favorite ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          )}
        </button>
      </div>

      {/* Tags */}
      {safeTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {safeTags.map((tag, index) => (
            <span
              key={index}
              onClick={(e) => {
                if (onTagClick) {
                  e.stopPropagation()
                  onTagClick(tag)
                }
              }}
              className="cursor-pointer rounded-full border border-[rgba(244,180,0,0.25)] bg-[#2A2000] px-2 py-0.5 text-xs text-[#F4B400] transition-all duration-200 hover:bg-[#3A2A00]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Content Preview */}
      <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-[var(--profile-text-subtle)]">
        {isEncrypted || plainContent?.includes("Join workspace to view") ? (
          <span className="flex items-center gap-2 italic text-[var(--profile-text-muted)]">
            🔒 <span>Content encrypted • Join workspace to view</span>
          </span>
        ) : plainContent
          ? (searchTerm && !searchTerm.startsWith('#')
              ? highlight(getPreview(plainContent), searchTerm).map((seg, i) =>
                  seg.isMatch
                    ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{seg.text}</mark>
                    : <span key={i}>{seg.text}</span>
                )
              : getPreview(plainContent)
            )
          : <span className="text-[var(--profile-text-muted)]">No content.</span>
        }
      </p>

      {/* Footer: Date and Delete button */}
      <div className="mt-auto flex items-center justify-between border-t border-[var(--profile-border)] pt-3">
        <p className="text-xs font-medium text-[var(--profile-text-muted)]">
          {timeLabel} {relativeTime}
        </p>
        {canDelete(userRole) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowDeleteModal(true)
            }}
            disabled={isDeleting}
            className="text-xs text-[#EF4444] opacity-60 transition-all duration-200 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? '⏳' : 'Delete'}
          </button>
        )}
      </div>

      <Modal
        open={showDeleteModal}
        title="Delete Memory"
        message="Are you sure you want to delete this memory? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={() => {
          setShowDeleteModal(false)
          if (onDelete) onDelete(memory.id)
        }}
        onCancel={() => setShowDeleteModal(false)}
      />

    </div>

  )
}

// Memoize to prevent rerenders when parent rerenders but data hasn't changed
export default memo(MemoryCard, (prevProps, nextProps) => {
  // Return true if props are equal (skip rerender), false if different (rerender)
  return (
    prevProps.memory.id === nextProps.memory.id &&
    prevProps.memory.title === nextProps.memory.title &&
    prevProps.memory.is_favorite === nextProps.memory.is_favorite &&
    prevProps.memory.content === nextProps.memory.content &&
    prevProps.isDeleting === nextProps.isDeleting &&
    prevProps.userRole === nextProps.userRole &&
    prevProps.searchTerm === nextProps.searchTerm &&
    prevProps.isEncrypted === nextProps.isEncrypted
  )
})
