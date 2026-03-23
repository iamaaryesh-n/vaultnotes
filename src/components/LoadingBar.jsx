import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function LoadingBar() {
  const [isVisible, setIsVisible] = useState(false)
  const location = useLocation()

  useEffect(() => {
    // Show loading bar only after 150ms delay (avoid flicker on fast loads)
    const showTimer = setTimeout(() => {
      setIsVisible(true)
    }, 150)

    // Hide immediately on route change
    return () => clearTimeout(showTimer)
  }, [location])

  if (!isVisible) return null

  return (
    <div className="loading-bar fixed top-0 left-0 h-1 w-full z-50" />
  )
}
