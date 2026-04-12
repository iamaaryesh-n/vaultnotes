import { Component } from "react"

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught runtime error:", error, errorInfo)
    this.setState({ error })
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
          <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-base font-medium text-slate-900 dark:text-slate-100">Something went wrong. Please refresh.</p>
            {import.meta.env.DEV && this.state.error?.message && (
              <p className="mt-3 break-words text-xs text-red-600">{this.state.error.message}</p>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
