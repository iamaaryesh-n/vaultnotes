import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import WorkspaceVisibilityBadge from "./WorkspaceVisibilityBadge"

export default function PublicWorkspaceCard({ workspace }) {
  const navigate = useNavigate()

  const handleWorkspaceClick = () => {
    navigate(`/workspace/${workspace.id}`)
  }

  return (
    <motion.button
      type="button"
      onClick={handleWorkspaceClick}
      className="group w-[260px] flex-none snap-start rounded-2xl border border-slate-200/60 bg-white shadow-sm transition-all duration-300 hover:border-blue-300/60 hover:shadow-md overflow-hidden text-left"
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Content section */}
      <div className="p-5">
        {/* Badge and arrow */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <WorkspaceVisibilityBadge isPublic={workspace.is_public} size="xs" />
          <svg className="h-4 w-4 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:text-blue-600 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>

        {/* Workspace title - primary focus */}
        <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
          {workspace.name}
        </h3>

        {/* Owner username - small and muted */}
        <p className="mt-2 text-sm text-slate-500 group-hover:text-slate-600 transition-colors">
          by @{workspace.owner_username || "unknown"}
        </p>

        {/* CTA text */}
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-600 group-hover:text-blue-700">
          <span>Open</span>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </motion.button>
  )
}
