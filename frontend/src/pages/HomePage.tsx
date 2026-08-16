import MarketplaceLanding from '../components/MarketplaceLanding'
import { useAuth } from '../context/AuthContext'
import StoreDirectoryPage, { StoreDirectorySkeleton } from './StoreDirectoryPage'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()

  if (authLoading) {
    return <StoreDirectorySkeleton />
  }

  // Logged-out visitors always see the marketing landing — separates guest vs app.
  if (!user) {
    return <MarketplaceLanding />
  }

  return <StoreDirectoryPage />
}
