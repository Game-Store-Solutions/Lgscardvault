import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isDevBuild } from '../lib/runtimeEnv'

/**
 * Last-resort UI so a render crash cannot leave a blank white page.
 * Must not use react-router — it wraps the whole tree, including the router.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render crashed.', error, info.componentStack)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-16 text-fg">
        <div className="w-full max-w-md space-y-4 rounded-card border border-border bg-surface p-6 shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">LGS Card Vault</p>
          <h1 className="font-display text-2xl font-bold">This screen hit an error</h1>
          <p className="text-sm leading-6 text-fg-muted">
            The app is still here. Reload, or go home. If this keeps happening after a pull, open the browser
            console and send the stack to the team.
          </p>
          {isDevBuild ? (
            <pre className="overflow-auto rounded-btn bg-bg p-3 text-xs leading-5 text-danger-700">
              {this.state.error.message}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-btn bg-brand-600 px-4 py-2 text-sm font-bold text-white"
              onClick={() => window.location.assign('/')}
            >
              Go to home
            </button>
            <button
              type="button"
              className="rounded-btn border border-border bg-surface px-4 py-2 text-sm font-bold text-fg"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
