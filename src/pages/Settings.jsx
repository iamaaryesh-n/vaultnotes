import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { applyTheme, getStoredTheme, setStoredTheme } from "../utils/theme"

export default function Settings() {
  const navigate = useNavigate()
  const [appearanceOpen, setAppearanceOpen] = useState(true)
  const [selectedTheme, setSelectedTheme] = useState(getStoredTheme())

  const handleThemeChange = (theme) => {
    setStoredTheme(theme)
    applyTheme(theme)
    setSelectedTheme(theme)
  }

  return (
    <div className="min-h-screen bg-[var(--profile-bg)] text-[var(--profile-text)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text-subtle)] hover:bg-[var(--chat-elev)]"
            aria-label="Go back"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-['Sora'] text-xl font-bold">Settings</h1>
        </div>

        <div className="space-y-3">
          <section className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3">
            <button
              onClick={() => setAppearanceOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
            >
              <div>
                <h2 className="text-sm font-semibold">Appearance</h2>
                <p className="text-xs text-[var(--chat-text-muted)]">Theme and visual preferences</p>
              </div>
              <svg
                className={`h-4 w-4 text-[var(--chat-text-muted)] transition-transform ${appearanceOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {appearanceOpen && (
              <div className="mt-2 space-y-1 border-t border-[var(--chat-border)] pt-2">
                {[
                  { key: "light", label: "Light Mode" },
                  { key: "dark", label: "Dark Mode" },
                  { key: "system", label: "System Default" },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handleThemeChange(item.key)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-[var(--chat-text-subtle)] hover:bg-[var(--chat-elev)]"
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

          {[
            { title: "Notifications", desc: "Push alerts, mentions, and activity updates" },
            { title: "Privacy", desc: "Profile visibility and data controls" },
            { title: "Account", desc: "Profile info and account preferences" },
            { title: "Help", desc: "Support, FAQs, and troubleshooting" },
          ].map((section) => (
            <section key={section.title} className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3">
              <h2 className="text-sm font-semibold">{section.title}</h2>
              <p className="mt-1 text-xs text-[var(--chat-text-muted)]">{section.desc}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
