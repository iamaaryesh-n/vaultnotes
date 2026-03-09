import { useNavigate } from "react-router-dom"

export default function MemoryCard({ memory, onDelete }) {

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

      {/* Title */}
      <h2 className="text-lg font-semibold text-yellow-400 truncate">
        {memory.title || "Untitled"}
      </h2>

      {/* Content Preview */}
      <p className="text-gray-300 text-sm leading-relaxed flex-1 line-clamp-3">
        {memory.content || "No content available."}
      </p>

      {/* Tags */}
      {memory.tags && memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {memory.tags.map((tag, index) => (
            <span
              key={index}
              className="text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 px-2 py-0.5 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

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
