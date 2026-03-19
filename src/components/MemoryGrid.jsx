import MemoryCard from "./MemoryCard"

export default function MemoryGrid({ memories, onDelete, onFavoriteToggle, onTagClick, emptyMessage = "No memories yet. Create one!" }) {

  if (!memories || memories.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-10">
        {emptyMessage}
      </p>
    )
  }

  return (

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {memories.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} onDelete={onDelete} onFavoriteToggle={onFavoriteToggle} onTagClick={onTagClick} />
      ))}
    </div>

  )

}
