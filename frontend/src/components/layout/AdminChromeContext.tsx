import { createContext, useContext, type ReactNode } from 'react'

const AdminChromeContext = createContext(false)

export function AdminChromeProvider({ children }: { children: ReactNode }) {
  return <AdminChromeContext.Provider value={true}>{children}</AdminChromeContext.Provider>
}

export function useAdminChrome() {
  return useContext(AdminChromeContext)
}
