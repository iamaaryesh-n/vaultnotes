import { Component } from "react"

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught runtime error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
          <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-base font-medium text-slate-900 dark:text-slate-100">Something went wrong. Please refresh.</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
