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
    ? "bg-red-500 text-white hover:bg-red-400"
    : "bg-yellow-500 text-gray-900 hover:bg-yellow-400"

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[4px] transition-opacity duration-200 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      onClick={() => {
        if (onCancel) {
          onCancel()
        }
      }}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)] transition-all duration-200 ${
          isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        {message ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        ) : null}

        {onInputChange ? (
          <div className="mt-5">
            {inputLabel ? (
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {inputLabel}
              </label>
            ) : null}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder={inputPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-gray-900 placeholder-slate-400 outline-none transition-all duration-200 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40"
            />
          </div>
        ) : null}

        {children ? <div className="mt-5">{children}</div> : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          {showCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-200 active:scale-95"
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
