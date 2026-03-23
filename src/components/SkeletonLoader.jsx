/**
 * Memory card skeleton loader
 * Matches the shape and size of real memory cards
 */
export function MemoryCardSkeleton() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="h-6 bg-slate-200 rounded mb-3 w-3/4"></div>
      <div className="h-4 bg-slate-200 rounded mb-2"></div>
      <div className="h-4 bg-slate-200 rounded mb-4 w-5/6"></div>
      <div className="flex gap-2 mb-4">
        <div className="h-5 bg-slate-200 rounded-full w-16"></div>
        <div className="h-5 bg-slate-200 rounded-full w-16"></div>
      </div>
      <div className="h-4 bg-slate-200 rounded w-24"></div>
    </div>
  )
}

/**
 * Memory grid skeleton loader
 * Shows multiple skeleton cards in grid layout
 */
export function MemoryGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <MemoryCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Workspace list skeleton loader
 * Shows placeholder rows
 */
export function WorkspaceListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="h-6 bg-slate-200 rounded mb-2 w-1/3"></div>
          <div className="h-4 bg-slate-200 rounded w-1/4"></div>
        </div>
      ))}
    </div>
  )
}

/**
 * Generic skeleton line (for text placeholders)
 */
export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-slate-200 rounded animate-pulse`}></div>
}

/**
 * Shimmer animation effect
 */
export function withShimmer(Component) {
  return function ShimmerComponent(props) {
    return (
      <div className="relative overflow-hidden">
        <Component {...props} />
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
      </div>
    )
  }
}
