import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Missing #root')
}

// Prerendered SEO copy lives in #root for crawlers. Strip it before React
// mounts so a refresh on /admin never flashes the marketing homepage.
if (rootEl.hasAttribute('data-prerender')) {
  rootEl.innerHTML = ''
  rootEl.removeAttribute('data-prerender')
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
