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
          background: linear-gradient(90deg, #e2e8f0 0%, #f1f5f9 50%, #e2e8f0 100%);
          background-size: 1000px 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>
      
      {/* Post card container */}
      <div className="card p-4 mb-4">
        {/* Author info */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-slate-200 skeleton-shimmer flex-shrink-0"></div>
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-32 skeleton-shimmer mb-1"></div>
            <div className="h-3 bg-slate-200 rounded w-24 skeleton-shimmer"></div>
          </div>
        </div>
        
        {/* Content */}
        <div className="mb-4">
          <div className="h-4 bg-slate-200 rounded mb-2 skeleton-shimmer"></div>
          <div className="h-4 bg-slate-200 rounded mb-2 w-5/6 skeleton-shimmer"></div>
          <div className="h-4 bg-slate-200 rounded w-4/5 skeleton-shimmer"></div>
        </div>
        
        {/* Image placeholder */}
        <div className="h-48 bg-slate-200 rounded mb-4 skeleton-shimmer"></div>
        
        {/* Interaction buttons */}
        <div className="flex gap-4 pt-2">
          <div className="h-8 bg-slate-200 rounded w-20 skeleton-shimmer"></div>
          <div className="h-8 bg-slate-200 rounded w-20 skeleton-shimmer"></div>
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
