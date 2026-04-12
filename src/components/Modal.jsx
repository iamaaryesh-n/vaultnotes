import { useEffect, useRef, useState } from "react"

export default function Modal({
  open,
  title,
  message,
  children,
  inputValue,
  onInputChange,
  inputPlaceholder = "",
  inputLabel = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "primary",
  confirmDisabled = false,
  showCancel = true,
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const [isVisible, setIsVisible] = useState(false)
  const inputRef = useRef(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setIsVisible(false)
      wasOpenRef.current = false
      return
    }

    let animationFrame = null

    if (!wasOpenRef.current) {
      animationFrame = requestAnimationFrame(() => {
        setIsVisible(true)
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      })
      wasOpenRef.current = true
    } else {
      setIsVisible(true)
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && onCancel) {
        onCancel()
      }

      if (event.key === "Enter" && onConfirm && !confirmDisabled && !isLoading) {
        event.preventDefault()
        onConfirm()
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onCancel, onConfirm, confirmDisabled, isLoading])

  if (!open) {
    return null
  }

  const confirmButtonClasses = confirmVariant === "danger"
    ? "bg-[#EF4444] text-white hover:bg-[#DC2626]"
    : "bg-[#F4B400] text-[var(--profile-on-accent)] hover:bg-[#C49000]"

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 backdrop-blur-[6px] transition-opacity duration-200 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      onClick={() => {
        if (onCancel) {
          onCancel()
        }
      }}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-[var(--overlay-border)] bg-[var(--overlay-surface)] p-6 shadow-[var(--overlay-shadow)] transition-all duration-200 ${
          isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--overlay-text)]">{title}</h2>
        {message ? (
          <p className="mt-3 text-sm leading-6 text-[var(--overlay-text-subtle)]">{message}</p>
        ) : null}

        {onInputChange ? (
          <div className="mt-5">
            {inputLabel ? (
              <label className="mb-2 block text-sm font-medium text-[var(--overlay-text)]">
                {inputLabel}
              </label>
            ) : null}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder={inputPlaceholder}
              className="w-full rounded-xl border border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-4 py-3 text-[var(--overlay-text)] placeholder-[var(--overlay-text-muted)] outline-none transition-all duration-200 focus:border-[#F4B400] focus:ring-2 focus:ring-[rgba(244,180,0,0.25)]"
            />
          </div>
        ) : null}

        {children ? <div className="mt-5">{children}</div> : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          {showCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-[var(--overlay-border)] bg-[var(--overlay-elev)] px-4 py-2.5 text-sm font-medium text-[var(--overlay-text-subtle)] transition-all duration-200 hover:border-[var(--overlay-border-strong)] hover:text-[var(--overlay-text)] active:scale-95"
            >
              {cancelText}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled || isLoading}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${confirmButtonClasses}`}
          >
            {isLoading ? "Please wait..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
