import { useEffect, useRef } from "react"
import { useNavigationStore } from "../stores/navigationStore"

export function useRouteScrollRestoration(routeKey, enabled = true) {
  const saveScrollPosition = useNavigationStore((state) => state.setScrollPosition)
  const hydratedRouteKeyRef = useRef(null)

  useEffect(() => {
    if (!enabled || !routeKey) return

    const stored = useNavigationStore.getState().scrollPositions[routeKey] || 0

    if (hydratedRouteKeyRef.current !== routeKey) {
      hydratedRouteKeyRef.current = routeKey
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: stored, left: 0, behavior: "auto" })
      })
    }

    let rafId = null
    const handleScroll = () => {
      if (rafId !== null) {
        return
      }

      rafId = window.requestAnimationFrame(() => {
        saveScrollPosition(routeKey, window.scrollY || 0)
        rafId = null
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      saveScrollPosition(routeKey, window.scrollY || 0)
    }
  }, [enabled, routeKey, saveScrollPosition])
}
