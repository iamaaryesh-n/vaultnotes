import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Small delay to allow page to render first
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 0)

    return () => clearTimeout(timer)
  }, [pathname])
}
