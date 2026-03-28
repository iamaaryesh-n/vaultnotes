# Page Navigation Performance Optimization Guide

## Overview
This document explains the performance optimizations implemented to eliminate 1-2 second delays during page navigation and prevent unnecessary data refetching.

## Architecture

### 1. **Global Cache Store** (`src/stores/postCacheStore.js`)
- **Zustand-based state management** for posts, likes, and comments
- **5-minute cache duration** (configurable)
- Tracks cache validity with timestamps
- Supports cache invalidation and manual clearing

**Key Methods:**
- `hasCachedData()` - Check if data is cached and valid
- `getCachedPosts()` - Retrieve cached posts
- `setCachedPosts()` - Store posts in cache
- `setCachedComments()` / `setCachedLikes()` - Store interactions
- `addLike()` / `removeLike()` / `addComment()` - Update cache on user actions
- `clearCache()` - Clear all cache (on logout)

### 2. **Smart Fetch Hook** (`src/hooks/useSmartFetchPosts.js`)
- **Intelligent data fetching** with automatic cache checking
- Returns immediately if data is cached
- Only fetches data if cache is invalid or empty
- **Parallel fetching** of comments and likes for performance
- Caches all fetched data automatically

**Usage:**
```javascript
const {
  posts,
  comments,
  likes,
  loading,
  error,
  updateComment,
  updateLike
} = useSmartFetchPosts(
  fetchFunction,      // Async function to fetch posts
  "unique-cache-key", // Unique identifier for this data
  false              // Force fetch even if cached
)
```

### 3. **Prefetch Hook** (`src/hooks/usePrefetchData.js`)
- **Deferred loading** of non-critical data
- Prefetches data while user is viewing current page
- Reduces perceived load time on navigation
- `usePrefetchData()` - Strategic prefetching
- `useDeferredLoad()` - Load data after initial render

### 4. **Loading Skeletons** (`src/components/PostSkeleton.jsx`)
- **Shimmer animation** for better UX
- Matches actual card dimensions for smooth layout shift prevention (CLS)
- `PostCardSkeleton` - Single post skeleton
- `PostListSkeleton(count)` - Multiple skeletons for immediate feedback

## Performance Benefits

### Before Optimization
- ❌ 1-2 second delay when switching pages
- ❌ Data refetched every navigation
- ❌ Blank UI while loading
- ❌ No prefetching strategy

### After Optimization
- ✅ **Instant navigation** (from cache)
- ✅ **Smart refetch only** when cache expires (5 min)
- ✅ **Loading skeletons** show immediately
- ✅ **Parallel data fetching** reduces API calls
- ✅ **Prefetching strategy** ready for future use

## Implementation Details

### Cache Key Strategy
- **Explore**: `"explore"` - Global posts feed
- **Profile**: `"profile_{userId}"` - User-specific posts
- **PublicProfile**: `"public_profile_{userId}"` - Public user posts

### Data Flow
```
Navigation → useSmartFetchPosts Hook
                    ↓
            Check Cache (valid?)
                 /        \
               YES         NO
               ↓           ↓
           Return     Parallel Fetch
           Cached   ┌─────┬─────┐
           Data     Posts Likes Comments
                    └─────┴─────┘
                         ↓
                   Store in Cache
                         ↓
                    Return Data
```

### Cache Validation
```javascript
// 5-minute cache duration (configurable)
const CACHE_DURATION_MS = 5 * 60 * 1000

// Cache is valid if:
// 1. Data exists in cache
// 2. Current time - timestamp < CACHE_DURATION_MS
```

## Updated Page Components

All page components updated to use smart caching:

### Explore.jsx
- Uses global `"explore"` cache key
- Instant return if data cached
- Loading skeleton on first load
- Realtime updates integrated

### Profile.jsx
- Uses user-specific cache key
- Lazy loading based on profile availability
- Post deletion handled gracefully
- Avatar and profile edits separate from post cache

### PublicProfile.jsx
- Uses public profile cache key
- Independent user profile viewing
- Realtime interactions supported
- No user-specific actions

## State Updates

### PostInteractions Component Integration
All pages now use simplified handlers:

```javascript
// Before
onCommentAdded={(newComment) => {
  setCommentsByPost((prev) => ({
    ...prev,
    [post.id]: [newComment, ...(prev[post.id] || [])]
  }))
}}

// After
onCommentAdded={(newComment) => {
  updateComment(post.id, newComment)
}}
```

The `updateComment()` and `updateLike()` methods handle cache updates automatically through the Zustand store.

## Realtime Updates

Realtime subscriptions (`usePostsRealtime`) automatically sync with cache:

1. When user A posts a comment
2. Realtime event triggers `updateComment()`
3. Cache is updated immediately
4. UI re-renders with new data
5. All connected users see update instantly

## Monitoring & Debugging

### Console Logs
- `[useSmartFetchPosts] Returning cached data for {key}`
- `[useSmartFetchPosts] Fetched fresh data for {key}`
- `[prefetchPosts] Data already cached`
- `[prefetchPosts] Prefetched data for: {key}`

### Cache Inspection
```javascript
// In browser console
const store = usePostCacheStore();
store.getCachedPostIds()      // View all cached post IDs
store.posts                    // View all posts
store.cacheTimestamps         // View cache validity timestamps
store.clearCache()            // Clear all cache (on logout)
```

## Future Enhancements

### Ready to Implement
1. **Prefetch on route hover** - Load data before click
2. **Pagination** - Load more posts when scrolling
3. **Infinite scroll** - Auto-load next batch
4. **Search caching** - Cache search results
5. **User profile prefetching** - Load user data before navigation

### Example: Prefetch on Route Hover
```javascript
// In Navbar or links
const handleProfileHover = (username) => {
  prefetchPosts(
    async () => {
      const { data } = await supabase
        .from('posts')
        .select('...')
        .eq('profiles.username', username)
      return data
    },
    `profile_${username}`
  )
}
```

## Cache Invalidation

### Manual Invalidation (when needed)
```javascript
// After important action (post creation, deletion, etc.)
const store = usePostCacheStore()
store.clearCache()  // Full clear

// Or selective clear (future enhancement)
// store.invalidateCache('explore')
```

### Automatic Invalidation
- Happens after 5 minutes
- Next navigation to page triggers fresh fetch
- Cache checks occur before every fetch

## Configuration

### Adjust Cache Duration
In `src/stores/postCacheStore.js`:
```javascript
CACHE_DURATION_MS: 5 * 60 * 1000  // Change this value
// Examples:
// 1 min:  1 * 60 * 1000
// 10 min: 10 * 60 * 1000
// 30 min: 30 * 60 * 1000
```

### Adjust Skeleton Loading Count
In pages (Explore.jsx, Profile.jsx):
```javascript
<PostListSkeleton count={3} />  // Change count
```

## Testing Performance

### Measure Navigation Speed
1. Open DevTools Network tab
2. Throttle to "Slow 3G" or "Fast 3G"
3. Navigate between pages
4. Compare with/without cache

### Expected Results
- **First load**: 0.5-1.5s (API latency)
- **Subsequent navigation (cached)**: <100ms
- **Navigation after expiry**: 0.5-1.5s (fresh fetch)

## Browser Storage

### LocalStorage Usage
- Stores `postCacheKeys` to track loaded data
- Minimal footprint (~1KB)
- Used for prefetch tracking

### Session Persistence
- Cache persists during session
- Clears on logout (call `store.clearCache()`)
- Doesn't persist across page refreshes

## Troubleshooting

### Issue: Stale data after update
**Solution**: Manual cache invalidation or wait for TTL expiry

### Issue: Large memory usage
**Solution**: Reduce CACHE_DURATION_MS or implement selective cache clearing

### Issue: Realtime updates not showing
**Solution**: Check `usePostsRealtime` hook - ensure post IDs are subscribed

### Issue: Cache not being used
**Solution**: Check browser console for cache logs, verify cache key is consistent

## Summary

The optimization transforms page navigation from a 1-2 second delay to near-instant response by:
1. **Caching** posts, likes, and comments globally
2. **Smart fetching** only when cache expires
3. **Loading skeletons** for instant visual feedback
4. **Parallel data loading** to reduce request count
5. **Realtime integration** for live updates

This creates a smooth, responsive user experience while reducing server load and API calls.
