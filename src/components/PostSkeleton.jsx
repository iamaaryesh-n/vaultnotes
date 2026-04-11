/**
 * Post card skeleton loader
 * Matches the MemoryCard structure for consistent loading UI
 */
export function PostCardSkeleton() {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(90deg, #111111 0%, #1a1a1a 50%, #111111 100%);
          background-size: 1000px 100%;
          animation: shimmer 2s infinite;
        }
        .dark .skeleton-shimmer {
          background: linear-gradient(90deg, #111111 0%, #1a1a1a 50%, #111111 100%);
        }
      `}</style>
      
      {/* Post card container */}
      <div className="mb-3 rounded-[16px] border border-[#1F1F1F] bg-[#0D0D0D] p-4">
        {/* Author info */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-[#141414] skeleton-shimmer"></div>
          <div className="flex-1">
            <div className="mb-1 h-4 w-32 rounded bg-[#141414] skeleton-shimmer"></div>
            <div className="h-3 w-24 rounded bg-[#141414] skeleton-shimmer"></div>
          </div>
        </div>
        
        {/* Content */}
        <div className="mb-4">
          <div className="mb-2 h-4 rounded bg-[#141414] skeleton-shimmer"></div>
          <div className="mb-2 h-4 w-5/6 rounded bg-[#141414] skeleton-shimmer"></div>
          <div className="h-4 w-4/5 rounded bg-[#141414] skeleton-shimmer"></div>
        </div>
        
        {/* Image placeholder */}
        <div className="mb-4 h-48 rounded-[12px] border border-[#1F1F1F] bg-[#141414] skeleton-shimmer"></div>
        
        {/* Interaction buttons */}
        <div className="flex gap-4 border-t border-[#1F1F1F] pt-3">
          <div className="h-8 w-20 rounded bg-[#141414] skeleton-shimmer"></div>
          <div className="h-8 w-20 rounded bg-[#141414] skeleton-shimmer"></div>
        </div>
      </div>
    </>
  )
}

/**
 * Multiple post skeleton loaders for grid/list
 */
export function PostListSkeleton({ count = 5 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  )
}
