import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../hooks/useToast'
import Modal from '../components/Modal'
import WorkspaceVisibilityBadge from '../components/WorkspaceVisibilityBadge'

export default function PublicWorkspaceLanding() {
  const navigate = useNavigate()
  const { id: workspaceId } = useParams()
  const { success, error: showError } = useToast()

  const [workspace, setWorkspace] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMember, setIsMember] = useState(false)
  const [memberCount, setMemberCount] = useState(0)
  const [notesCount, setNotesCount] = useState(0)
  const [requestingAccess, setRequestingAccess] = useState(false)
  const [modalConfig, setModalConfig] = useState({ open: false, title: '', message: '', onConfirm: null })

  useEffect(() => {
    console.log('[PublicWorkspaceLanding] Route param workspaceId:', workspaceId)
    fetchWorkspaceData()
  }, [workspaceId])

  const fetchWorkspaceData = async () => {
    try {
      setIsLoading(true)

      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        showError('Please log in to view workspaces')
        return
      }
      setCurrentUser(user)

      // Fetch workspace details (direct table fetch by ID only)
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .single()

      console.log('[PublicWorkspaceLanding] Workspace fetch result:', {
        workspaceId,
        found: !!workspaceData,
        error: workspaceError,
      })

      if (workspaceError || !workspaceData) {
        console.error('[PublicWorkspaceLanding] Workspace lookup failed:', workspaceError)
        showError('Workspace not found')
        setIsLoading(false)
        return
      }

      // Fetch owner profile separately to avoid fragile relational joins in preview route
      let ownerProfile = null
      if (workspaceData.created_by) {
        const { data: ownerData, error: ownerError } = await supabase
          .from('profiles')
          .select('id, username, name, avatar_url')
          .eq('id', workspaceData.created_by)
          .maybeSingle()

        if (ownerError) {
          console.warn('[PublicWorkspaceLanding] Owner profile lookup failed:', ownerError)
        } else {
          ownerProfile = ownerData || null
        }
      }

      setWorkspace({ ...workspaceData, ownerProfile })

      // Check if user is member
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      setIsMember(!memberError && !!memberData)

      // Fetch member count
      const { count: members, error: membersError } = await supabase
        .from('workspace_members')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)

      if (!membersError) {
        setMemberCount(members || 0)
      }

      // Fetch notes count
      const { count: notes, error: notesError } = await supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)

      if (!notesError) {
        setNotesCount(notes || 0)
      }
    } catch (err) {
      console.error('[PublicWorkspaceLanding] Error:', err)
      showError('Failed to load workspace')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestAccess = async () => {
    if (!currentUser || !workspace) return

    setRequestingAccess(true)
    try {
      // For now, create a workspace_members entry with 'viewer' role for pending access
      // In production, this should create a separate access request table
      const { error } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: workspace.id,
          user_id: currentUser.id,
          role: 'viewer' // Read-only role for new members
        })

      if (error) {
        if (error.code === 'PGRST116') {
          // Already a member
          setIsMember(true)
          success('You are now a member of this workspace!')
        } else {
          showError('Failed to request access')
        }
      } else {
        success('Access requested! You can now view the workspace.')
        setIsMember(true)
      }
    } catch (err) {
      console.error('[PublicWorkspaceLanding] Error requesting access:', err)
      showError('Failed to request access')
    } finally {
      setRequestingAccess(false)
    }
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading workspace...</p>
        </div>
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Workspace not found</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Cover Image */}
      <div className="relative h-64 bg-gradient-to-r from-blue-400 to-cyan-400 overflow-hidden">
        {workspace.cover_image_url && (
          <img
            src={workspace.cover_image_url}
            alt={workspace.name}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 -mt-20 pb-20 relative z-10">
        {/* Workspace Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 mb-6"
        >
          <div className="flex items-start gap-6 mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-slate-900">{workspace.name}</h1>
                <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="sm" />
              </div>
              {workspace.description && (
                <p className="text-lg text-slate-600">{workspace.description}</p>
              )}
            </div>
            {!isMember && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRequestAccess}
                disabled={requestingAccess}
                className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
              >
                {requestingAccess ? 'Joining...' : 'Join Workspace'}
              </motion.button>
            )}
          </div>

          {/* Owner Info */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <p className="text-sm text-slate-600 mb-2">Workspace Owner</p>
            <div className="flex items-center gap-3">
              {workspace.ownerProfile?.avatar_url && (
                <img
                  src={workspace.ownerProfile.avatar_url}
                  alt={workspace.ownerProfile.name || workspace.ownerProfile.username}
                  className="w-10 h-10 rounded-full object-cover"
                />
              )}
              <div>
                <p className="font-semibold text-slate-900">
                  {workspace.ownerProfile?.name || workspace.ownerProfile?.username || 'Unknown'}
                </p>
                <p className="text-sm text-slate-500">@{workspace.ownerProfile?.username || 'unknown'}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <motion.div
              whileHover={{ y: -2 }}
              className="p-4 bg-blue-50 rounded-xl border border-blue-200"
            >
              <p className="text-sm text-slate-600 mb-1">Members</p>
              <p className="text-3xl font-bold text-blue-600">{memberCount}</p>
            </motion.div>
            <motion.div
              whileHover={{ y: -2 }}
              className="p-4 bg-purple-50 rounded-xl border border-purple-200"
            >
              <p className="text-sm text-slate-600 mb-1">Notes</p>
              <p className="text-3xl font-bold text-purple-600">{notesCount}</p>
            </motion.div>
            <motion.div
              whileHover={{ y: -2 }}
              className="p-4 bg-green-50 rounded-xl border border-green-200"
            >
              <p className="text-sm text-slate-600 mb-1">Created</p>
              <p className="text-lg font-bold text-green-600">{formatDate(workspace.created_at)}</p>
            </motion.div>
          </div>
        </motion.div>

        {/* Navigation */}
        {isMember && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex gap-4"
          >
            <button
              onClick={() => navigate(`/workspace/${workspace.id}`)}
              className="flex-1 px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
            >
              Open Workspace
            </button>
          </motion.div>
        )}

        {!isMember && !workspace.is_public && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-center"
          >
            <p className="text-yellow-800 font-medium">
              This is a private workspace. Please request access to view its contents.
            </p>
          </motion.div>
        )}
      </div>

      {/* Modal for messages */}
      <Modal
        isOpen={modalConfig.open}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={() => {
          setModalConfig({ ...modalConfig, open: false })
          if (modalConfig.onConfirm) {
            modalConfig.onConfirm()
          }
        }}
      />
    </div>
  )
}
