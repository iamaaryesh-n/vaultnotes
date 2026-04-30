const THEME_STORAGE_KEY = "theme"
const LEGACY_THEME_STORAGE_KEY = "vaultnotes-theme"
const VALID_THEMES = ["light", "dark", "system"]

const getSystemTheme = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light"
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function getStoredTheme() {
  if (typeof window === "undefined") {
    return "system"
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  const legacyTheme = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
  const resolvedStoredTheme = storedTheme || legacyTheme
  if (!resolvedStoredTheme || !VALID_THEMES.includes(resolvedStoredTheme)) {
    return "system"
  }

  if (!storedTheme && legacyTheme) {
    // Migrate older key format so all theme reads use the current key.
    window.localStorage.setItem(THEME_STORAGE_KEY, legacyTheme)
  }

  return resolvedStoredTheme
}

export function applyTheme(theme) {
  if (typeof document === "undefined") {
    return
  }

  const root = document.documentElement
  const normalizedTheme = VALID_THEMES.includes(theme) ? theme : "system"
  let resolvedTheme = "light"

  if (normalizedTheme === "dark") {
    root.classList.add("dark")
    resolvedTheme = "dark"
  } else if (normalizedTheme === "light") {
    root.classList.remove("dark")
    resolvedTheme = "light"
  } else {
    const prefersDark = getSystemTheme() === "dark"
    root.classList.toggle("dark", prefersDark)
    resolvedTheme = prefersDark ? "dark" : "light"
  }

  root.setAttribute("data-theme", normalizedTheme)
  root.setAttribute("data-resolved-theme", resolvedTheme)
  root.style.colorScheme = resolvedTheme
  root.style.backgroundColor = resolvedTheme === "dark" ? "#0a0a0a" : "#f8fafc"
  document.body?.setAttribute("data-theme", normalizedTheme)
  document.body?.setAttribute("data-resolved-theme", resolvedTheme)
}

export function setStoredTheme(theme) {
  if (typeof window === "undefined") {
    return
  }

  const normalizedTheme = VALID_THEMES.includes(theme) ? theme : "system"
  window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme)
  window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
}

export function initializeTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {}
  }

  applyTheme(getStoredTheme())

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
  const handleSystemThemeChange = () => {
    if (getStoredTheme() === "system") {
      applyTheme("system")
    }
  }

  mediaQuery.addEventListener("change", handleSystemThemeChange)

  return () => mediaQuery.removeEventListener("change", handleSystemThemeChange)
}
