import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { MotionRoot } from './components/motion'
import AppLayout from './components/layout/AppLayout'
import { ScrollToTop } from './components/layout/ScrollToTop'
import AuthLayout from './components/layout/AuthLayout'
import AdminLayout from './components/layout/AdminLayout'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import StoreDirectoryPage from './pages/StoreDirectoryPage'
import AccountPage from './pages/AccountPage'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import VerifyEmailSentPage from './pages/VerifyEmailSentPage'
import RegisterPage from './pages/RegisterPage'
import OwnerOnboardingWizard from './pages/OwnerOnboardingWizard'
import SsoCallbackPage from './pages/SsoCallbackPage'
import StorePage from './pages/StorePage'
import SealedBrowsePage from './pages/SealedBrowsePage'
import MassSearchPage from './pages/MassSearchPage'
import CommanderSynergyPage from './pages/CommanderSynergyPage'
import CartPage from './pages/CartPage'
import CardDetailsPage from './pages/CardDetailsPage'
import SetBrowsePage from './pages/SetBrowsePage'
import ArtistBrowsePage from './pages/ArtistBrowsePage'
import ArtistLegacyRedirect from './pages/ArtistLegacyRedirect'
import CaseCardsPage from './pages/CaseCardsPage'
import CustomerProfilePage from './pages/CustomerProfilePage'
import StoreEventsPage from './pages/StoreEventsPage'
import StoreAdminPage from './pages/StoreAdminPage'
import ImportRunDetailsPage from './pages/store-admin/ImportRunDetailsPage'
import FixFailedCardsPage from './pages/store-admin/recovery/FixFailedCardsPage'
import PlatformAdminPage from './pages/PlatformAdminPage'
import PlatformUsersPage from './pages/platform-admin/PlatformUsersPage'
import SyncJobsPage from './pages/platform-admin/SyncJobsPage'
import PlatformReportsPage from './pages/platform-admin/PlatformReportsPage'
import PatchNotesTab from './pages/store-admin/PatchNotesTab'
import SellTradePage from './pages/SellTradePage'
import PlatformStoreImportsPage from './pages/PlatformStoreImportsPage'
import LegalPage from './pages/LegalPage'
import { CookieConsentBanner } from './components/CookieConsentBanner'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
       * Without a stale time every query refetched on each mount, and since the
       * admin tabs are separate routes, switching tabs threw away perfectly good
       * data and showed a loading panel while it came back. Half a minute is
       * short enough that operational screens stay current (mutations still
       * invalidate explicitly, and stale data refetches in the background) while
       * making tab-to-tab navigation instant.
       */
      staleTime: 30_000,
      // Three retries tripled the wait before a failure surfaced.
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MotionRoot>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            {/* Full-screen auth flow (no app navbar) */}
            <Route element={<AuthLayout />}>
              <Route path="login" element={<LoginPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
              <Route path="verify-email/sent" element={<VerifyEmailSentPage />} />
              <Route path="verify-email" element={<VerifyEmailPage />} />
              <Route path="register" element={<Navigate to="/register/customer" replace />} />
              <Route path="register/owner" element={<OwnerOnboardingWizard />} />
              <Route path="register/customer" element={<RegisterPage accountType="customer" />} />
              <Route path="auth/sso/callback" element={<SsoCallbackPage />} />
            </Route>

            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="stores" element={<StoreDirectoryPage />} />
              {/* Global identity settings + "your stores". One account across the marketplace */}
              <Route
                path="account"
                element={
                  <ProtectedRoute>
                    <AccountPage />
                  </ProtectedRoute>
                }
              />
              <Route path="privacy" element={<LegalPage />} />
              <Route path="privacy-request" element={<LegalPage />} />
              <Route path="terms" element={<LegalPage />} />
              <Route path="pickup" element={<LegalPage />} />
              <Route path="merchant-terms" element={<LegalPage />} />
              <Route path="fan-content" element={<LegalPage />} />
              <Route path="s/:slug" element={<StorePage />} />
              <Route path="s/:slug/sealed" element={<SealedBrowsePage />} />
              <Route path="s/:slug/mass-search" element={<MassSearchPage />} />
              <Route path="s/:slug/deck-builder" element={<CommanderSynergyPage />} />
              <Route path="s/:slug/sell" element={<SellTradePage />} />
              <Route path="s/:slug/cart" element={<CartPage />} />
              <Route path="s/:slug/sets/:setCode" element={<SetBrowsePage />} />
              <Route path="s/:slug/artists" element={<ArtistBrowsePage />} />
              <Route path="s/:slug/artists/:artist" element={<ArtistLegacyRedirect />} />
              <Route path="s/:slug/cards/:id" element={<CardDetailsPage />} />
              <Route path="s/:slug/case-cards" element={<CaseCardsPage />} />
              <Route path="s/:slug/events" element={<StoreEventsPage />} />
              <Route
                path="s/:slug/account"
                element={
                  <ProtectedRoute>
                    <CustomerProfilePage />
                  </ProtectedRoute>
                }
              />
            </Route>
            {/* Store admin. Slug lives on the layout route so the sidebar can build section links */}
            <Route
              path="s/:slug/admin"
              element={
                <ProtectedRoute requireStoreManage>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<StoreAdminPage />} />
              <Route path="imports/:importId" element={<ImportRunDetailsPage />} />
              <Route path="imports/:importId/fix" element={<FixFailedCardsPage />} />
              <Route path=":section" element={<StoreAdminPage />} />
            </Route>
            {/* Platform admin */}
            <Route
              path="platform/admin"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<PlatformAdminPage />} />
              <Route path="users" element={<PlatformUsersPage />} />
              <Route path="reports" element={<PlatformReportsPage />} />
              <Route path="patch-notes" element={<PatchNotesTab />} />
              <Route path="sync-jobs" element={<SyncJobsPage />} />
              <Route path="stores/:slug/imports" element={<PlatformStoreImportsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {/* Must stay inside BrowserRouter — the banner uses <Link>. */}
          <CookieConsentBanner />
        </BrowserRouter>
        </MotionRoot>
      </AuthProvider>
    </QueryClientProvider>
  )
}
