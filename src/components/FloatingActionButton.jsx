import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

export default function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isDashboard, setIsDashboard] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const workspaceId = location.pathname.split('/')[2]

  useEffect(() => {
    // Determine if we're on dashboard or in a workspace
    setIsDashboard(location.pathname === '/')
  }, [location])

  useEffect(() => {
    // Close menu when clicking outside
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen])

  const handleNewMemory = () => {
    if (workspaceId) {
      navigate(`/workspace/${workspaceId}/new`)
      setIsOpen(false)
    }
  }

  const handleNewWorkspace = () => {
    window.dispatchEvent(new CustomEvent('createWorkspace'))
    setIsOpen(false)
  }

  const handleCreatePost = () => {
    window.dispatchEvent(new CustomEvent('openCreatePostModal'))
    setIsOpen(false)
  }

  return (
    <div ref={menuRef} className="fixed bottom-8 right-8 z-40">
      {/* Menu Items */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-20 right-0 mb-2 w-56 overflow-hidden rounded-2xl border border-[var(--overlay-border)] bg-[color:var(--overlay-surface)]/95 shadow-[var(--overlay-shadow)] backdrop-blur-xl"
          >
            <motion.button
              whileHover={{ backgroundColor: 'rgba(59, 130, 246, 0.05)' }}
              onClick={handleCreatePost}
              className="flex w-full items-center gap-3 border-b border-[var(--overlay-border)] px-5 py-4 text-left text-sm font-semibold text-[var(--overlay-text)] transition-colors hover:text-blue-600"
            >
              <span className="text-xl">✨</span>
              <span>Create Post</span>
              <span className="ml-auto text-xs text-[var(--overlay-text-muted)]">Ctrl+P</span>
            </motion.button>
            {!isDashboard && (
              <motion.button
                whileHover={{ backgroundColor: 'rgba(59, 130, 246, 0.05)' }}
                onClick={handleNewMemory}
                className="flex w-full items-center gap-3 border-b border-[var(--overlay-border)] px-5 py-4 text-left text-sm font-semibold text-[var(--overlay-text)] transition-colors hover:text-blue-600"
              >
                <span className="text-xl">📝</span>
                <span>New Memory</span>
              </motion.button>
            )}
            <motion.button
              whileHover={{ backgroundColor: 'rgba(59, 130, 246, 0.05)' }}
              onClick={handleNewWorkspace}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-[var(--overlay-text)] transition-colors hover:text-blue-600"
            >
              <span className="text-xl">🧠</span>
              <span>New Vault</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-3xl text-white shadow-[0_20px_50px_rgba(59,130,246,0.4)] transition-all duration-300 hover:shadow-[0_25px_60px_rgba(59,130,246,0.5)]"
        title="Quick actions"
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.3 }}
        >
          +
        </motion.div>
      </motion.button>
    </div>
  )
}
