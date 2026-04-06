import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { useAuth } from "../hooks/useAuth"
import { fetchAllPublicWorkspaces } from "../lib/globalSearch"
import WorkspaceVisibilityBadge from "../components/WorkspaceVisibilityBadge"

export default function DiscoverWorkspaces() {
  const navigate = useNavigate()
  const { user, authLoading } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user?.id) return

    const loadWorkspaces = async () => {
      setLoading(true)
      try {
        console.log("[DiscoverWorkspaces] fetchAllPublicWorkspaces() called")
        const { workspaces: data, error } = await fetchAllPublicWorkspaces(24)

        if (error) {
          console.error("[DiscoverWorkspaces] Error fetching public workspaces:", error)
          setWorkspaces([])
          return
        }

        console.log("[DiscoverWorkspaces] Loaded", data?.length || 0, "public workspaces")
        setWorkspaces(data || [])
      } catch (err) {
        console.error("[DiscoverWorkspaces] Exception fetching public workspaces:", err)
        setWorkspaces([])
      } finally {
        setLoading(false)
      }
    }

    loadWorkspaces()
  }, [authLoading, user?.id])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 pb-20">
      <div className="border-b border-slate-200/50 bg-white/80 backdrop-blur-lg sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Discover</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">Public Workspaces</h1>
              <p className="mt-2 text-base text-slate-600">
                Explore workspaces created by other users and join the ones that fit your interests.
              </p>
            </div>
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Back to Explore
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {loading ? "Loading workspaces..." : `${workspaces.length} public workspace${workspaces.length === 1 ? "" : "s"}`}
            </h2>
            <p className="text-sm text-slate-500">Only public workspaces are shown here.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm animate-pulse">
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-1/2 rounded bg-slate-100" />
                <div className="mt-6 h-24 rounded-2xl bg-slate-100" />
                <div className="mt-6 h-10 rounded-lg bg-slate-200" />
              </div>
            ))}
          </div>
        ) : workspaces.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((workspace, index) => (
              <motion.div
                key={workspace.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="group rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-bold text-slate-900 group-hover:text-blue-600">
                      {workspace.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Created {new Date(workspace.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="xs" />
                </div>

                <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-blue-50/60 p-4">
                  <p className="text-sm font-medium text-slate-900">Public workspace</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Other users can discover and join this workspace.
                  </p>
                </div>

                <button
                  onClick={() => navigate(`/workspace-preview/${workspace.id}`)}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Open Workspace
                </button>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900">No public workspaces yet</p>
            <p className="mt-2 text-sm text-slate-600">
              As soon as someone creates a public workspace, it will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
