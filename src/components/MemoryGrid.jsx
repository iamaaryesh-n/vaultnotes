import { memo } from "react"
import MemoryCard from "./MemoryCard"

function MemoryGrid({ memories, onDelete, onFavoriteToggle, onTagClick, emptyMessage = "No memories yet ✨\nStart capturing your thoughts", searchTerm = "", onCreateMemory = null, deletingId = null, userRole = "viewer" }) {

  if (!memories || memories.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="text-5xl mb-4">📝</div>
        <p className="text-gray-600 text-lg mb-2">{emptyMessage.split('\n')[0]}</p>
        {emptyMessage.split('\n')[1] && (
          <p className="text-gray-500 text-sm mb-6">{emptyMessage.split('\n')[1]}</p>
        )}
        {onCreateMemory && (
          <>
            <button
              onClick={onCreateMemory}
              className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg font-semibold transition-all duration-200 shadow-sm hover:shadow-md"
            >
              Create Your First Memory
            </button>
            <p className="text-xs text-slate-400 mt-4">💡 Tip: Press "N" to create a new memory</p>
          </>
        )}
      </div>
    )
  }

  return (

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
      {memories.map((memory) => (
        <MemoryCard 
          key={memory.id} 
          memory={memory} 
          onDelete={onDelete} 
          onFavoriteToggle={onFavoriteToggle} 
          onTagClick={onTagClick} 
          searchTerm={searchTerm}
          isDeleting={deletingId === memory.id}
          userRole={userRole}
          isEncrypted={memory.isEncrypted}
        />
      ))}
    </div>

  )

}

// Memoize to prevent expensive rerenders
export default memo(MemoryGrid, (prevProps, nextProps) => {
  return (
    prevProps.memories.length === nextProps.memories.length &&
    prevProps.memories.every((m, i) => m.id === nextProps.memories[i]?.id) &&
    prevProps.deletingId === nextProps.deletingId &&
    prevProps.searchTerm === nextProps.searchTerm
  )
})
