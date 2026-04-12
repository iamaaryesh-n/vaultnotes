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
      var(--chat-elev) 0%,
      var(--chat-hover) 50%,
      var(--chat-elev) 100%
    );
    background-size: 1000px 100%;
    animation: shimmer 2s infinite;
  }

  html.dark .skeleton-shimmer {
    background: linear-gradient(
      90deg,
      var(--chat-elev) 0%,
      var(--chat-hover) 50%,
      var(--chat-elev) 100%
    );
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
      <div className="h-80 rounded-[16px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4">
        <div className="mb-3 h-6 w-3/4 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
        <div className="mb-2 h-4 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
        <div className="mb-4 h-4 w-5/6 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
        <div className="flex gap-2 mb-4">
          <div className="h-5 w-16 rounded-full bg-[var(--chat-elev)] skeleton-shimmer"></div>
          <div className="h-5 w-16 rounded-full bg-[var(--chat-elev)] skeleton-shimmer"></div>
        </div>
        <div className="h-4 w-24 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
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
          <div key={i} className="rounded-[16px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4">
            <div className="mb-2 h-6 w-1/3 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
            <div className="h-4 w-1/4 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
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
      <div className="min-h-screen bg-[var(--chat-bg)] text-[var(--chat-text)]">
        <div style={{ maxWidth: '900px' }} className="mx-auto px-6 py-12">
          {/* Back button placeholder */}
          <div className="mb-8 h-5 w-24 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>

          {/* Title section */}
          <div className="mb-8">
            <div className="mb-2 h-10 w-2/3 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
            <div className="h-4 w-1/3 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
          </div>

          {/* Title input placeholder */}
          <div className="mb-6 h-12 rounded-lg bg-[var(--chat-elev)] skeleton-shimmer"></div>

          {/* Content area placeholder */}
          <div className="space-y-3 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] p-6">
            <div className="h-4 w-full rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
            <div className="h-4 w-5/6 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
            <div className="h-4 w-4/6 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
            <div className="mt-6 h-32 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
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
      <div className="min-h-screen bg-[var(--chat-bg)] text-[var(--chat-text)]">
        <div style={{ maxWidth: "760px" }} className="mx-auto rounded-[28px] border border-[var(--chat-border)] bg-[var(--chat-surface)] px-8 py-8 shadow-none">
          <div className="mb-8 flex items-start justify-between border-b border-[var(--chat-border)] pb-6">
            <div className="w-full">
              <div className="mb-4 h-10 w-1/2 rounded-full bg-[var(--chat-elev)] skeleton-shimmer" />
              <div className="h-4 w-1/4 rounded-full bg-[var(--chat-elev)] skeleton-shimmer" />
            </div>
            <div className="flex gap-2 ml-4">
              <div className="h-10 w-20 rounded-lg bg-[var(--chat-elev)] skeleton-shimmer" />
              <div className="h-10 w-20 rounded-lg bg-[var(--chat-elev)] skeleton-shimmer" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-4 w-full rounded-full bg-[var(--chat-elev)] skeleton-shimmer" />
            <div className="h-4 w-5/6 rounded-full bg-[var(--chat-elev)] skeleton-shimmer" />
            <div className="h-4 w-4/6 rounded-full bg-[var(--chat-elev)] skeleton-shimmer" />
            <div className="h-4 w-full rounded-full bg-[var(--chat-elev)] skeleton-shimmer" />
            <div className="h-4 w-3/4 rounded-full bg-[var(--chat-elev)] skeleton-shimmer" />
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
  return <div className={`${width} ${height} rounded bg-[var(--chat-elev)] animate-pulse`}></div>
}

/**
 * Shimmer animation effect
 */
export function withShimmer(Component) {
  return function ShimmerComponent(props) {
    return (
      <div className="relative overflow-hidden">
        <Component {...props} />
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-slate-200/10"></div>
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
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-full rounded-[14px] border border-[var(--chat-border)] bg-[var(--chat-surface)] px-4 py-4">
            <div className="flex gap-3">
              {/* Avatar skeleton */}
              <div className="h-12 w-12 flex-shrink-0 rounded-full bg-[var(--chat-elev)] skeleton-shimmer"></div>
              
              {/* Content skeleton */}
              <div className="min-w-0 flex-1">
                <div className="mb-2 h-4 w-3/4 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
                <div className="h-3 w-1/3 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
              </div>

              <div className="mt-[6px] h-[7px] w-[7px] flex-shrink-0 rounded-full bg-[var(--chat-text-muted)]"></div>
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
            className="flex items-center gap-3 rounded-[10px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3 transition-colors hover:border-[var(--chat-border-strong)] hover:bg-[var(--chat-elev)]"
          >
            {/* Avatar skeleton */}
            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-[var(--chat-elev)] skeleton-shimmer"></div>
            
            {/* Content skeleton */}
            <div className="flex-1 min-w-0">
              <div className="mb-2 h-4 w-2/3 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
              <div className="h-3 w-4/5 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
            </div>
            
            {/* Timestamp skeleton */}
            <div className="h-3 w-12 flex-shrink-0 rounded bg-[var(--chat-elev)] skeleton-shimmer"></div>
          </div>
        ))}
      </div>
    </>
  )
}

