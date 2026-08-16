import type { Store, UserProfile } from '../api/types'

export type ManageableStore = Pick<Store, 'id' | 'name' | 'slug'>

/** Owned stores plus stores this user administers as staff. */
export function manageableStores(user: UserProfile | null | undefined): ManageableStore[] {
  const bySlug = new Map<string, ManageableStore>()
  for (const store of user?.ownedStores ?? []) bySlug.set(store.slug, store)
  for (const store of user?.managedStores ?? []) bySlug.set(store.slug, store)
  return [...bySlug.values()]
}

export function canManageStore(user: UserProfile | null | undefined, slug?: string): boolean {
  if (!user || !slug) return false
  if (user.roles.includes('ROLE_SUPER_ADMIN')) return true
  return manageableStores(user).some((store) => store.slug === slug)
}

export function ownsStore(user: UserProfile | null | undefined, slug?: string): boolean {
  if (!user || !slug) return false
  if (user.roles.includes('ROLE_SUPER_ADMIN')) return true
  return user.ownedStores?.some((store) => store.slug === slug) ?? false
}
