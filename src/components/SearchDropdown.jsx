import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { formatSearchTime } from "../lib/globalSearch"

export function SearchDropdown({
  searchOpen,
  searchLoading,
  searchResults,
  searchQuery,
  onClose,
  onResultClick
}) {
  const navigate = useNavigate()

  const containerVariants = {
    hidden: { opacity: 0, y: -8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, ease: "easeOut" }
    },
    exit: { opacity: 0, y: -8, transition: { duration: 0.15 } }
  }

  const itemVariants = {
    hidden: { opacity: 0, x: -4 },
    visible: (i) => ({
      opacity: 1,
      x: 0,
      transition: { delay: i * 0.03, duration: 0.2 }
    })
  }

  const handleResultClick = (result) => {
    if (result.type === "post") {
      // Navigate to Explore and open post modal
      navigate("/explore", { state: { openPostId: result.postId } })
    } else if (result.navigationPath) {
      navigate(result.navigationPath)
    }
    onResultClick?.()
  }

  return (
    <AnimatePresence>
      {searchOpen && (
        <motion.div
          className="absolute top-full left-0 right-0 mt-3 bg-[#0D0D0D] dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 dark:bg-slate-900 dark:border-slate-700"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {searchLoading ? (
            // Loading State
            <div className="px-6 py-12 text-center">
              <motion.svg
                className="animate-spin h-6 w-6 m-auto text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </motion.svg>
              <p className="mt-2 text-sm text-slate-500 dark:text-[#A09080]">Searching...</p>
            </div>
          ) : searchResults.isEmpty ? (
            // Empty State
            <div className="px-6 py-12 text-center">
              <svg
                className="w-12 h-12 mx-auto text-[#A09080] dark:text-slate-500 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="text-sm text-slate-600 dark:text-[#F5F0E8] font-medium">No results found</p>
              <p className="text-xs text-slate-500 dark:text-[#5C5248] mt-1">
                {searchQuery.trim() ? `"${searchQuery}" didn't match anything` : "Start typing to search"}
              </p>
            </div>
          ) : (
            // Results Sections
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
              {/* Users Section */}
              {searchResults.users.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
                  <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10 dark:bg-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-[#A09080] uppercase tracking-wide">Users</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {searchResults.users.map((user, i) => (
                      <motion.button
                        key={user.id}
                        custom={i}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ backgroundColor: "#f8fafc" }}
                        onClick={() => {
                          handleResultClick(user)
                          onClose?.()
                        }}
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                      >
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="w-9 h-9 rounded-full object-cover ring-2 ring-slate-100"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-xs font-bold text-white ring-2 ring-slate-100">
                            {user.title?.charAt(1) || "?"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-[#F5F0E8]">{user.title}</p>
                          <p className="text-xs text-slate-500 dark:text-[#5C5248] truncate">{user.subtitle}</p>
                        </div>
                        <svg
                          className="w-4 h-4 text-[#A09080] dark:text-slate-500 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Posts Section */}
              {searchResults.posts.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                  <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10 dark:bg-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-[#A09080] uppercase tracking-wide">Posts</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {searchResults.posts.map((post, i) => (
                      <motion.button
                        key={post.id}
                        custom={i}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ backgroundColor: "#f8fafc" }}
                        onClick={() => {
                          handleResultClick(post)
                          onClose?.()
                        }}
                        className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                      >
                        {post.image_url && (
                          <img
                            src={post.image_url}
                            alt="Post"
                            className="w-9 h-9 rounded object-cover flex-shrink-0 ring-1 ring-slate-200"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-[#F5F0E8] line-clamp-2">{post.title}</p>
                          <p className="text-xs text-slate-500 dark:text-[#5C5248] mt-0.5 flex items-center gap-1">
                            <span>{post.subtitle}</span>
                            <span>·</span>
                            <span>{formatSearchTime(post.created_at)}</span>
                          </p>
                        </div>
                        <svg
                          className="w-4 h-4 text-[#A09080] dark:text-slate-500 flex-shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Vaults Section */}
              {searchResults.workspaces.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                  <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10 dark:bg-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-[#A09080] uppercase tracking-wide">Vaults</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {searchResults.workspaces.map((workspace, i) => (
                      <motion.button
                        key={workspace.id}
                        custom={i}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ backgroundColor: "#f8fafc" }}
                        onClick={() => {
                          handleResultClick(workspace)
                          onClose?.()
                        }}
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                      >
                        <div className="w-9 h-9 rounded bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-[#F5F0E8]">{workspace.title}</p>
                          <p className="text-xs text-slate-500 dark:text-[#5C5248] truncate">{workspace.subtitle}</p>
                        </div>
                        <svg
                          className="w-4 h-4 text-[#A09080] dark:text-slate-500 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Notes Section */}
              {searchResults.notes.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                  <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10 dark:bg-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-[#A09080] uppercase tracking-wide">Notes</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {searchResults.notes.map((note, i) => (
                      <motion.button
                        key={note.id}
                        custom={i}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ backgroundColor: "#f8fafc" }}
                        onClick={() => {
                          handleResultClick(note)
                          onClose?.()
                        }}
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                      >
                        <div className="w-9 h-9 rounded bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V4h14v16z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-[#F5F0E8]">{note.title}</p>
                          <p className="text-xs text-slate-500 dark:text-[#5C5248] truncate flex items-center gap-1">
                            <span>{note.subtitle}</span>
                            <span>·</span>
                            <span>{formatSearchTime(note.created_at)}</span>
                          </p>
                        </div>
                        <svg
                          className="w-4 h-4 text-[#A09080] dark:text-slate-500 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
