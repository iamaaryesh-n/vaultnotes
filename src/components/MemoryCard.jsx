import { useNavigate } from "react-router-dom"

export default function MemoryCard({ memory, onDelete, onFavoriteToggle, onTagClick }) {

  const navigate = useNavigate()

  const formattedDate = memory.created_at
    ? new Date(memory.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unknown date"



  return (

    <div
      className="bg-gray-900 border border-gray-700 rounded-xl shadow-md p-5 flex flex-col gap-3 hover:shadow-yellow-500/20 hover:border-yellow-500/40 hover:scale-[1.02] transition-all duration-200 cursor-pointer"
      onClick={() => navigate(`/workspace/${memory.workspace_id}/memory/${memory.id}`)}
    >

      {/* Title & Star */}
      <div className="flex justify-between items-start">
        <h2 className="text-lg font-semibold text-yellow-400 truncate pr-2">
          {memory.title || "Untitled"}
        </h2>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onFavoriteToggle) onFavoriteToggle(memory.id, memory.is_favorite)
          }}
          className={`p-1 -mr-1 -mt-1 rounded-full hover:bg-gray-800 transition-colors ${
            memory.is_favorite ? "text-yellow-500" : "text-gray-600 hover:text-yellow-500"
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
              className="text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 px-2 py-0.5 rounded-full hover:bg-yellow-500/20 z-10 transition-colors"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Content Preview */}
      <p className="text-gray-300 text-sm leading-relaxed flex-1 line-clamp-3">
        {memory.content ? memory.content.replace(/<[^>]+>/g, '') : "No content available."}
      </p>

      {/* Footer: Date and Delete button */}
      <div className="flex justify-between items-center mt-auto pt-2 border-t border-gray-800">
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
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Delete
        </button>
      </div>

    </div>

  )
}
