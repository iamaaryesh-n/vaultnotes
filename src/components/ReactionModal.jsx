import { useEffect, useState } from "react"

export default function ReactionModal({
  open,
  messageId,
  groups = [],
  onClose,
  onRemoveReaction
}) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!open) {
      setIsVisible(false)
      return
    }

    const frame = requestAnimationFrame(() => {
      setIsVisible(true)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[3px] transition-opacity duration-200 ease-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-[350px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.16)] transition-all duration-200 ease-out ${
          isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Reactions</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close reactions modal"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">No reactions yet</p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {groups.map((group) => (
              <div key={group.emoji} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                <p className="mb-2 text-sm font-semibold text-slate-800">
                  {group.emoji} {group.count}
                </p>

                <div className="space-y-1.5">
                  {group.users.map((user) => (
                    <div
                      key={user.reactionId}
                      className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm text-slate-700"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.name} className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600">
                            {(user.name || "?").charAt(0).toUpperCase()}
                          </div>
                        )}

                        {user.isCurrentUser ? (
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveReaction(messageId, group.emoji, user.userId, user.reactionId)
                            }
                            className="truncate text-left text-yellow-700 underline-offset-2 hover:underline"
                          >
                            You (tap to remove)
                          </button>
                        ) : (
                          <span className="truncate">{user.name}</span>
                        )}
                      </div>

                      <span className="text-sm">{group.emoji}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
