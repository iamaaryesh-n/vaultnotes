import { useEffect } from "react"

let lockCount = 0
let previousStyles = null

function captureStyles() {
  const html = document.documentElement
  const body = document.body
  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth)

  previousStyles = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
    htmlTouchAction: html.style.touchAction,
    bodyTouchAction: body.style.touchAction,
    htmlOverscrollBehavior: html.style.overscrollBehavior,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    htmlScrollbarGutter: html.style.scrollbarGutter,
  }

  html.style.overflow = "hidden"
  body.style.overflow = "hidden"
  html.style.touchAction = "none"
  body.style.touchAction = "none"
  html.style.overscrollBehavior = "none"
  body.style.overscrollBehavior = "none"
  html.style.scrollbarGutter = "stable"

  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`
  }
}

function restoreStyles() {
  if (!previousStyles) {
    return
  }

  const html = document.documentElement
  const body = document.body

  html.style.overflow = previousStyles.htmlOverflow
  body.style.overflow = previousStyles.bodyOverflow
  html.style.touchAction = previousStyles.htmlTouchAction
  body.style.touchAction = previousStyles.bodyTouchAction
  html.style.overscrollBehavior = previousStyles.htmlOverscrollBehavior
  body.style.overscrollBehavior = previousStyles.bodyOverscrollBehavior
  body.style.paddingRight = previousStyles.bodyPaddingRight
  html.style.scrollbarGutter = previousStyles.htmlScrollbarGutter
  previousStyles = null
}

export function useViewportScrollLock(locked) {
  useEffect(() => {
    if (!locked) {
      return
    }

    lockCount += 1

    if (lockCount === 1) {
      captureStyles()
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1)

      if (lockCount === 0) {
        restoreStyles()
      }
    }
  }, [locked])
}