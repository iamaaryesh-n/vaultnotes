import { useState } from "react"
import { motion } from "framer-motion"
import { applyTheme, getStoredTheme, setStoredTheme } from "../utils/theme"

const SHEET_TRANSITION = { type: "spring", damping: 30, stiffness: 300 }

export default function Settings({ onClose }) {
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState(getStoredTheme())

  const handleThemeChange = (theme) => {
    setStoredTheme(theme)
    applyTheme(theme)
    setSelectedTheme(theme)
  }

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={SHEET_TRANSITION}
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.aside
        className="absolute left-0 top-0 h-full w-full overflow-y-auto bg-[var(--profile-bg)] text-[var(--profile-text)] shadow-2xl md:left-4 md:top-4 md:bottom-4 md:h-auto md:w-[min(720px,calc(100vw-2rem))] md:rounded-3xl md:border md:border-[var(--chat-border)]"
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={SHEET_TRANSITION}
        style={{ willChange: "transform" }}
      >
        <div className="mx-auto flex min-h-full w-full flex-col px-4 py-5 md:px-6 md:py-6">
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] hover:bg-[var(--chat-elev)] transition-colors"
              aria-label="Close settings"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="font-['Sora'] text-xl font-bold">Settings</h1>
          </div>

          <div className="space-y-3 pb-6">
            <section className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4">
              <button
                onClick={() => setAppearanceOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left hover:opacity-80 transition-opacity"
                aria-expanded={appearanceOpen}
              >
                <div>
                  <h2 className="text-sm font-semibold">Appearance</h2>
                  <p className="text-xs text-[var(--chat-text-muted)]">Theme and visual preferences</p>
                </div>
                <svg
                  className={`h-4 w-4 shrink-0 text-[var(--chat-text-muted)] transition-transform duration-200 ${appearanceOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {appearanceOpen && (
                <div className="mt-3 space-y-1 border-t border-[var(--chat-border)] pt-3">
                  {[
                    { key: "light", label: "Light Mode" },
                    { key: "dark", label: "Dark Mode" },
                    { key: "system", label: "System Default" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleThemeChange(item.key)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-[var(--chat-text-subtle)] hover:bg-[var(--chat-elev)] transition-colors"
                    >
                      <span>{item.label}</span>
                      {selectedTheme === item.key && (
                        <svg className="h-4 w-4 text-[var(--chat-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4">
              <button
                onClick={() => setAccountOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left hover:opacity-80 transition-opacity"
                aria-expanded={accountOpen}
              >
                <div>
                  <h2 className="text-sm font-semibold">Account</h2>
                  <p className="text-xs text-[var(--chat-text-muted)]">Profile info and account preferences</p>
                </div>
                <svg
                  className={`h-4 w-4 shrink-0 text-[var(--chat-text-muted)] transition-transform duration-200 ${accountOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {accountOpen && (
                <div className="mt-3 space-y-1 border-t border-[var(--chat-border)] pt-3">
                  <button
                    onClick={() => window.__vn_openEditProfile?.()}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-[var(--chat-text-subtle)] hover:bg-[var(--chat-elev)] transition-colors"
                  >
                    <span>Edit Profile</span>
                    <svg className="h-4 w-4 text-[var(--chat-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => window.__vn_logout?.()}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] transition-colors"
                  >
                    <span>Logout</span>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              )}
            </section>

            {/* Other Sections */}
            {[
              { title: "Notifications", desc: "Push alerts, mentions, and activity updates" },
              { title: "Privacy", desc: "Profile visibility and data controls" },
              { title: "Help", desc: "Support, FAQs, and troubleshooting" },
            ].map((section) => (
              <section key={section.title} className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4">
                <h2 className="text-sm font-semibold">{section.title}</h2>
                <p className="mt-1 text-xs text-[var(--chat-text-muted)]">{section.desc}</p>
              </section>
            ))}
          </div>
        </div>
      </motion.aside>
    </div>
  )
}
