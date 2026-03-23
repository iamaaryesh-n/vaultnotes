import { useContext } from 'react'
import { ToastContext } from '../context/ToastContext'

export default function ToastContainer() {
  const { toasts } = useContext(ToastContext)

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function Toast({ toast }) {
  const { removeToast } = useContext(ToastContext)

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  }[toast.type]

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  }[toast.type]

  return (
    <div
      className={`${bgColor} text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300`}
    >
      <span className="text-lg font-bold">{icon}</span>
      <span className="text-sm font-medium">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="ml-2 text-white/70 hover:text-white transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}
