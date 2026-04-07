/**
 * Shimmer animation keyframes (injected via style tag)
 */
const shimmerStyle = `
  @keyframes shimmer {
    0% {
      background-position: -1000px 0;
    }
    100% {
      background-position: 1000px 0;
    }
  }
  
  .skeleton-shimmer {
    background: linear-gradient(
      90deg,
      #e2e8f0 0%,
      #f1f5f9 50%,
      #e2e8f0 100%
    );
    background-size: 1000px 100%;
    animation: shimmer 2s infinite;
  }
`

/**
 * Memory card skeleton loader
 * Matches the shape and size of real memory cards with shimmer effect
 */
export function MemoryCardSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="card p-4 h-80">
        <div className="h-6 bg-slate-200 rounded mb-3 w-3/4 skeleton-shimmer"></div>
        <div className="h-4 bg-slate-200 rounded mb-2 skeleton-shimmer"></div>
        <div className="h-4 bg-slate-200 rounded mb-4 w-5/6 skeleton-shimmer"></div>
        <div className="flex gap-2 mb-4">
          <div className="h-5 bg-slate-200 rounded-full w-16 skeleton-shimmer"></div>
          <div className="h-5 bg-slate-200 rounded-full w-16 skeleton-shimmer"></div>
        </div>
        <div className="h-4 bg-slate-200 rounded w-24 skeleton-shimmer"></div>
      </div>
    </>
  )
}

/**
 * Memory grid skeleton loader
 * Shows multiple skeleton cards in grid layout with shimmer
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
 * Shows placeholder rows with shimmer effect
 */
export function WorkspaceListSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-6 bg-slate-200 rounded mb-2 w-1/3 skeleton-shimmer"></div>
            <div className="h-4 bg-slate-200 rounded w-1/4 skeleton-shimmer"></div>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * Memory editor skeleton loader
 * Shows loading UI for the editor page
 */
export function EditorSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900">
        <div style={{ maxWidth: '900px' }} className="mx-auto px-6 py-12">
          {/* Back button placeholder */}
          <div className="mb-8 h-5 bg-slate-200 rounded w-24 skeleton-shimmer"></div>

          {/* Title section */}
          <div className="mb-8">
            <div className="h-10 bg-slate-200 rounded mb-2 w-2/3 skeleton-shimmer"></div>
            <div className="h-4 bg-slate-200 rounded w-1/3 skeleton-shimmer"></div>
          </div>

          {/* Title input placeholder */}
          <div className="mb-6 h-12 bg-slate-200 rounded-lg skeleton-shimmer"></div>

          {/* Content area placeholder */}
          <div className="space-y-3 bg-white border border-slate-200 rounded-lg p-6">
            <div className="h-4 bg-slate-200 rounded w-full skeleton-shimmer"></div>
            <div className="h-4 bg-slate-200 rounded w-5/6 skeleton-shimmer"></div>
            <div className="h-4 bg-slate-200 rounded w-4/6 skeleton-shimmer"></div>
            <div className="h-32 bg-slate-200 rounded mt-6 skeleton-shimmer"></div>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Memory view skeleton loader
 * Shows loading UI for individual memory view
 */
export function MemoryViewSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900 fade-in">
        <div style={{ maxWidth: "760px" }} className="mx-auto rounded-[28px] border border-slate-200/80 bg-white/90 px-8 py-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <div className="mb-8 flex justify-between items-start border-b border-slate-200 pb-6">
            <div className="w-full">
              <div className="mb-4 h-10 w-1/2 rounded-full bg-slate-200 skeleton-shimmer" />
              <div className="h-4 w-1/4 rounded-full bg-slate-200 skeleton-shimmer" />
            </div>
            <div className="flex gap-2 ml-4">
              <div className="h-10 w-20 rounded-lg bg-slate-200 skeleton-shimmer" />
              <div className="h-10 w-20 rounded-lg bg-slate-200 skeleton-shimmer" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-4 w-full rounded-full bg-slate-200 skeleton-shimmer" />
            <div className="h-4 w-5/6 rounded-full bg-slate-200 skeleton-shimmer" />
            <div className="h-4 w-4/6 rounded-full bg-slate-200 skeleton-shimmer" />
            <div className="h-4 w-full rounded-full bg-slate-200 skeleton-shimmer" />
            <div className="h-4 w-3/4 rounded-full bg-slate-200 skeleton-shimmer" />
          </div>
        </div>
      </div>
    </>
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

/**
 * Notification list skeleton loader
 * Shows placeholder notification items with shimmer effect
 */
export function NotificationListSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-full px-4 py-3 bg-white">
            <div className="flex gap-3">
              {/* Avatar skeleton */}
              <div className="h-8 w-8 flex-shrink-0 rounded-full bg-slate-200 skeleton-shimmer"></div>
              
              {/* Content skeleton */}
              <div className="min-w-0 flex-1">
                <div className="h-4 bg-slate-200 rounded mb-2 w-3/4 skeleton-shimmer"></div>
                <div className="h-3 bg-slate-200 rounded w-1/3 skeleton-shimmer"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * Chat list skeleton loader
 * Shows placeholder chat items with shimmer effect
 */
export function ChatListSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
          >
            {/* Avatar skeleton */}
            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-slate-200 skeleton-shimmer"></div>
            
            {/* Content skeleton */}
            <div className="flex-1 min-w-0">
              <div className="h-4 bg-slate-200 rounded mb-2 w-2/3 skeleton-shimmer"></div>
              <div className="h-3 bg-slate-200 rounded w-4/5 skeleton-shimmer"></div>
            </div>
            
            {/* Timestamp skeleton */}
            <div className="h-3 bg-slate-200 rounded w-12 skeleton-shimmer flex-shrink-0"></div>
          </div>
        ))}
      </div>
    </>
  )
}
