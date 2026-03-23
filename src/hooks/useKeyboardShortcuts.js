import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

/**
 * Global keyboard shortcuts manager
 * Handles: N (new memory), W (new workspace), / (search), Esc (close)
 */
export function useKeyboardShortcuts(options = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    onNewMemory = null,
    onNewWorkspace = null,
    onSearchFocus = null,
    onEscape = null,
  } = options

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if user is typing in input/textarea/editor
      let isTyping = 
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.contentEditable === 'true'

      // Check if target is inside ProseMirror editor
      if (!isTyping && e.target.closest('.ProseMirror')) {
        isTyping = true
      }

      // Special case: "/" should focus search even in inputs
      if (e.key === '/' && !isTyping) {
        e.preventDefault()
        if (onSearchFocus) {
          onSearchFocus()
        }
        return
      }

      // Don't trigger shortcuts while typing
      if (isTyping) return

      // N: New memory (workspace detail pages only)
      if (e.key === 'n' || e.key === 'N') {
        const isWorkspaceDetail = /^\/workspace\/[^/]+$/.test(location.pathname)
        if (isWorkspaceDetail) {
          const workspaceId = location.pathname.split('/')[2]
          navigate(`/workspace/${workspaceId}/new`)
        } else if (onNewMemory) {
          onNewMemory()
        }
      }

      // W: New workspace (dashboard only)
      if (e.key === 'w' || e.key === 'W') {
        const isDashboard = location.pathname === '/'
        if (isDashboard && onNewWorkspace) {
          onNewWorkspace()
        }
      }

      // Esc: Close/exit
      if (e.key === 'Escape') {
        if (onEscape) {
          onEscape()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, location, onNewMemory, onNewWorkspace, onSearchFocus, onEscape])
}
