import { useNavigate } from "react-router-dom"

export default function MemoryCard({ memory, onDelete, onFavoriteToggle, onTagClick, searchTerm = "" }) {

  const navigate = useNavigate()

  const formattedDate = (memory.updated_at || memory.created_at)
    ? new Date(memory.updated_at || memory.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unknown date"

  // Strip HTML tags from TipTap content for plain-text preview
  const plainContent = memory.content ? memory.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ""

  // Highlight matching substring — returns array of {text, isMatch} segments
  const highlight = (text, term) => {
    if (!term || !text) return [{ text, isMatch: false }]
    const cleanTerm = term.startsWith('#') ? term.slice(1) : term
    if (!cleanTerm) return [{ text, isMatch: false }]
    const regex = new RegExp(`(${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return text.split(regex).map(seg => ({ text: seg, isMatch: regex.test(seg) }))
  }



  return (

    <div
      className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col gap-3 hover:shadow-md hover:border-yellow-400/50 hover:scale-[1.02] transition-all duration-200 ease-in-out cursor-pointer"
      onClick={() => navigate(`/workspace/${memory.workspace_id}/memory/${memory.id}`)}
    >

      {/* Title & Star */}
      <div className="flex justify-between items-start">
        <h2 className="text-lg font-semibold text-yellow-600 truncate pr-2">
          {searchTerm && !searchTerm.startsWith('#')
            ? highlight(memory.title || "Untitled", searchTerm).map((seg, i) =>
                seg.isMatch
                  ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{seg.text}</mark>
                  : <span key={i}>{seg.text}</span>
              )
            : (memory.title || "Untitled")
          }
        </h2>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onFavoriteToggle) onFavoriteToggle(memory.id, memory.is_favorite)
          }}
          className={`p-1 -mr-1 -mt-1 rounded-full hover:bg-gray-100 hover:scale-120 transition-all duration-200 ${
            memory.is_favorite ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"
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
      {memory.tags && memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {memory.tags.map((tag, index) => (
            <span
              key={index}
              onClick={(e) => {
                if (onTagClick) {
                  e.stopPropagation()
                  onTagClick(tag)
                }
              }}
              className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full hover:bg-yellow-100 hover:scale-105 z-10 transition-all duration-200 cursor-pointer"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Content Preview */}
      <p className="text-gray-700 text-sm leading-relaxed flex-1 line-clamp-3">
        {plainContent
          ? (searchTerm && !searchTerm.startsWith('#')
              ? highlight(plainContent, searchTerm).map((seg, i) =>
                  seg.isMatch
                    ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{seg.text}</mark>
                    : <span key={i}>{seg.text}</span>
                )
              : plainContent
            )
          : <span className="italic text-gray-400">No content.</span>
        }
      </p>

      {/* Footer: Date and Delete button */}
      <div className="flex justify-between items-center mt-auto pt-2 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          {formattedDate}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation() // Prevent card navigation
            if (confirm("Delete this memory?")) {
              if (onDelete) onDelete(memory.id)
            }
          }}
          className="text-xs text-red-500 hover:text-red-600 hover:scale-110 transition-all duration-200"
        >
          Delete
        </button>
      </div>

    </div>

  )
}
