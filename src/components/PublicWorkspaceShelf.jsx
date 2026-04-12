import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import PublicWorkspaceCard from "./PublicWorkspaceCard"
import { fetchPublicWorkspaceDiscoverCards } from "../lib/globalSearch"

export default function PublicWorkspaceShelf({ contextUserId }) {
  const [publicWorkspaces, setPublicWorkspaces] = useState([])
  const [publicWorkspacesLoading, setPublicWorkspacesLoading] = useState(false)

  useEffect(() => {
    if (!contextUserId) return

    const loadPublicWorkspaces = async () => {
      setPublicWorkspacesLoading(true)
      try {
        const { workspaces, error } = await fetchPublicWorkspaceDiscoverCards(8)
        if (error) {
          setPublicWorkspaces([])
          return
        }

        setPublicWorkspaces(workspaces || [])
      } catch {
        setPublicWorkspaces([])
      } finally {
        setPublicWorkspacesLoading(false)
      }
    }

    loadPublicWorkspaces()
  }, [contextUserId])

  return (
    <div className="mx-auto max-w-2xl px-4 pb-6 pt-4">
      <div className="mb-4 border-t border-[var(--profile-border)] pt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-['Sora'] text-[30px] font-bold text-[var(--profile-text)]">Public Vaults</h2>
          <p className="text-[12px] text-[var(--profile-text-muted)]">Discover community vaults</p>
        </div>
      </div>

      {publicWorkspacesLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[78px] w-full animate-pulse rounded-[14px] border border-[var(--profile-border)] bg-[var(--profile-surface)]" />
          ))}
        </div>
      ) : publicWorkspaces.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[14px] border border-[var(--profile-border)] bg-[var(--profile-surface)] p-6 text-center text-sm text-[var(--profile-text-subtle)]"
        >
          No public vaults to show right now.
        </motion.div>
      ) : (
        <div className="space-y-2">
          {publicWorkspaces.map((workspace) => (
            <PublicWorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      )}
    </div>
  )
}
