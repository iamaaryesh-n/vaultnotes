import { memo } from "react"
import MemoryCard from "./MemoryCard"

function MemoryGrid({ memories, onDelete, onFavoriteToggle, onTagClick, emptyMessage = "No memories yet ✨\nStart capturing your thoughts", searchTerm = "", onCreateMemory = null, deletingId = null, userRole = "viewer" }) {

  if (!memories || memories.length === 0) {
    return (
      <div className="rounded-[18px] border border-[var(--profile-border)] bg-[var(--profile-surface)] p-12 text-center">
        <div className="text-5xl mb-4">📝</div>
        <p className="mb-2 text-lg text-[var(--profile-text-subtle)]">{emptyMessage.split('\n')[0]}</p>
        {emptyMessage.split('\n')[1] && (
          <p className="mb-6 text-sm text-[var(--profile-text-muted)]">{emptyMessage.split('\n')[1]}</p>
        )}
        {onCreateMemory && (
          <>
            <button
              onClick={onCreateMemory}
              className="rounded-[12px] border-none bg-[#F4B400] px-[18px] py-[10px] text-[13px] font-[700] text-[var(--profile-on-accent)] shadow-[0_3px_18px_rgba(244,180,0,0.4)] transition-all duration-150 hover:bg-[#C49000]"
            >
              Create Your First Memory
            </button>
            <p className="mt-4 text-xs text-[var(--profile-text-muted)]">💡 Tip: Press "N" to create a new memory</p>
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
