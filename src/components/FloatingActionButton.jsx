import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

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
    const name = prompt('Workspace name?')
    if (name) {
      // Dispatch custom event that Dashboard listens to
      window.dispatchEvent(new CustomEvent('createWorkspace'))
      setIsOpen(false)
    }
  }

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-40">
      {/* Menu Items */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden mb-2 w-48 animate-in fade-in zoom-in duration-150">
          {!isDashboard && (
            <button
              onClick={handleNewMemory}
              className="w-full px-4 py-3 text-left hover:bg-yellow-50 transition-colors text-sm font-medium text-gray-900 flex items-center gap-2 border-b border-slate-100"
            >
              <span className="text-lg">📝</span>
              New Memory
            </button>
          )}
          <button
            onClick={handleNewWorkspace}
            className="w-full px-4 py-3 text-left hover:bg-yellow-50 transition-colors text-sm font-medium text-gray-900 flex items-center gap-2"
          >
            <span className="text-lg">🧠</span>
            New Workspace
          </button>
        </div>
      )}

      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full bg-yellow-500 hover:bg-yellow-400 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-2xl ${
          isOpen ? 'scale-110' : 'hover:scale-110'
        }`}
        title="Quick actions"
      >
        +
      </button>
    </div>
  )
}
