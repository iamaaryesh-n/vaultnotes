import { memo } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"

function PublicWorkspaceCard({ workspace }) {
  const navigate = useNavigate()

  const handleWorkspaceClick = () => {
    navigate(`/workspace/${workspace.id}`)
  }

  return (
    <motion.button
      type="button"
      onClick={handleWorkspaceClick}
      className="group w-full overflow-hidden rounded-[14px] border border-[#1F1F1F] bg-[#0D0D0D] px-4 py-[14px] text-left transition-all duration-150 hover:border-[#2A2A2A] hover:bg-[#141414]"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#2A2000] font-['Sora'] text-[17px] font-bold text-[#F4B400]">
            {(workspace.name || "V").charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0">
            <h3 className="truncate font-['Sora'] text-[18px] font-bold text-[#F5F0E8]">
              {workspace.name}
            </h3>

            <p className="mt-[2px] truncate text-[11px] text-[#5C5248]">
              By @{workspace.owner_username || "unknown"} · {workspace.member_count || 0} members · Public
            </p>
          </div>
        </div>

        <span className="rounded-[8px] border border-[#2A2A2A] bg-[#141414] px-[14px] py-[5px] text-[12px] font-semibold text-[#A09080] transition-all group-hover:border-[#F4B400] group-hover:text-[#F4B400]">
          Open
        </span>
      </div>
    </motion.button>
  )
}

// Memoize presentational component to prevent rerenders during list refresh
export default memo(PublicWorkspaceCard, (prevProps, nextProps) => {
  return (
    prevProps.workspace.id === nextProps.workspace.id &&
    prevProps.workspace.name === nextProps.workspace.name &&
    prevProps.workspace.is_public === nextProps.workspace.is_public &&
    prevProps.workspace.owner_username === nextProps.workspace.owner_username
  )
})
