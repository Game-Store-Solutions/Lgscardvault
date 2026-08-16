import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import api, { ACCOUNT_PAGE_SIZE, CUSTOMER_ORDERS_PAGE_SIZE } from '../api/client'
import type {
  CartItem,
  CustomerFavorite,
  CustomerNotification,
  CustomerWantListEntry,
  PaginatedList,
  PaginatedOrders,
  SellSubmission,
  StoreCustomer,
} from '../api/types'

/**
 * Centralized React Query keys + fetchers for a customer's per-store data.
 * Shared by the storefront (CardDetailsPage) and the account page
 * (CustomerProfilePage) so the cache stays consistent across both.
 */
export const customerKeys = {
  profile: (slug: string) => ['customer-profile', slug] as const,
  favorites: (slug: string) => ['customer-favorites', slug] as const,
  wantList: (slug: string) => ['customer-want-list', slug] as const,
  cart: (slug: string) => ['customer-cart', slug] as const,
  /** @deprecated use storeOrders(slug, page) — invalidates all pages with prefix */
  ordersPrefix: (slug: string) => ['customer-orders', slug] as const,
  storeOrders: (slug: string, page: number) => ['customer-orders', slug, page] as const,
  myOrders: (page: number, store?: string) => ['my-orders', page, store ?? 'all'] as const,
  myWantList: (page: number, store?: string) => ['my-want-list', page, store ?? 'all'] as const,
  myFavorites: (page: number, store?: string) => ['my-favorites', page, store ?? 'all'] as const,
  myNotifications: (page: number, store?: string) => ['my-notifications', page, store ?? 'all'] as const,
  mySellSubmissions: (page: number, store?: string) => ['my-sell-submissions', page, store ?? 'all'] as const,
  myCredit: (page: number, store?: string) => ['my-credit', page, store ?? 'all'] as const,
  notifications: (slug: string) => ['customer-notifications', slug] as const,
}

/** Profile badge and storefront bell share these caches. */
export function invalidateCustomerNotifications(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['my-notifications'] })
  void queryClient.invalidateQueries({ queryKey: ['customer-notifications'] })
}

function markNotificationReadAt(
  notification: CustomerNotification,
  readAt: string,
  id?: number,
  types?: string[],
) {
  if (notification.readAt) return notification
  if (id !== undefined && notification.id !== id) return notification
  if (types?.length && !types.includes(notification.type)) return notification
  return { ...notification, readAt }
}

function markCachedNotificationsRead(
  queryClient: QueryClient,
  readAt: string,
  id?: number,
  types?: string[],
) {
  queryClient.setQueriesData<PaginatedList<CustomerNotification> | CustomerNotification[]>({ queryKey: ['my-notifications'] }, (data) => {
    if (!data) return data
    if (Array.isArray(data)) return data.map((notification) => markNotificationReadAt(notification, readAt, id, types))
    const newlyRead = data.items.filter((notification) => {
      if (notification.readAt) return false
      if (id !== undefined && notification.id !== id) return false
      if (types?.length && !types.includes(notification.type)) return false
      return true
    }).length
    return {
      ...data,
      unread: id === undefined && !types?.length ? 0 : Math.max(0, (data.unread ?? 0) - newlyRead),
      items: data.items.map((notification) => markNotificationReadAt(notification, readAt, id, types)),
    }
  })
  queryClient.setQueriesData<CustomerNotification[]>({ queryKey: ['customer-notifications'] }, (rows) =>
    rows?.map((notification) => markNotificationReadAt(notification, readAt, id, types)),
  )
}

export function useCustomerProfile(slug: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.profile(slug),
    queryFn: async () => {
      const { data } = await api.get<StoreCustomer>(`/stores/${slug}/customer`)
      return data
    },
    enabled: Boolean(slug) && enabled,
  })
}

export function useCustomerFavorites(slug: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.favorites(slug),
    queryFn: async () => {
      const { data } = await api.get<CustomerFavorite[]>(`/stores/${slug}/customer/favorites`)
      return data
    },
    enabled: Boolean(slug) && enabled,
  })
}

export function useCustomerWantList(slug: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.wantList(slug),
    queryFn: async () => {
      const { data } = await api.get<CustomerWantListEntry[]>(`/stores/${slug}/customer/want-list`)
      return data
    },
    enabled: Boolean(slug) && enabled,
  })
}

export function useCustomerCart(slug: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.cart(slug),
    queryFn: async () => {
      const { data } = await api.get<CartItem[]>(`/stores/${slug}/customer/cart`)
      return data
    },
    enabled: Boolean(slug) && enabled,
  })
}

export function useCustomerOrders(slug: string, page: number, enabled = true) {
  return useQuery({
    queryKey: customerKeys.storeOrders(slug, page),
    queryFn: async () => {
      const { data } = await api.get<PaginatedOrders>(`/stores/${slug}/customer/orders`, {
        params: { page, itemsPerPage: CUSTOMER_ORDERS_PAGE_SIZE },
      })
      return data
    },
    enabled: Boolean(slug) && enabled,
    placeholderData: keepPreviousData,
  })
}

export function useMyOrders(page: number, enabled = true, storeSlug?: string) {
  return useQuery({
    queryKey: customerKeys.myOrders(page, storeSlug),
    queryFn: async () => {
      const { data } = await api.get<PaginatedOrders>('/me/orders', {
        params: {
          page,
          itemsPerPage: CUSTOMER_ORDERS_PAGE_SIZE,
          ...(storeSlug ? { store: storeSlug } : {}),
        },
      })
      return data
    },
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useMyWantList(page = 1, storeSlug?: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.myWantList(page, storeSlug),
    queryFn: async () => {
      const { data } = await api.get<PaginatedList<CustomerWantListEntry>>('/me/want-list', {
        params: { page, itemsPerPage: ACCOUNT_PAGE_SIZE, ...(storeSlug ? { store: storeSlug } : {}) },
      })
      return data
    },
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useMyFavorites(page = 1, storeSlug?: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.myFavorites(page, storeSlug),
    queryFn: async () => {
      const { data } = await api.get<PaginatedList<CustomerFavorite>>('/me/favorites', {
        params: { page, itemsPerPage: ACCOUNT_PAGE_SIZE, ...(storeSlug ? { store: storeSlug } : {}) },
      })
      return data
    },
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useMyNotifications(page = 1, storeSlug?: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.myNotifications(page, storeSlug),
    queryFn: async () => {
      const { data } = await api.get<PaginatedList<CustomerNotification>>('/me/notifications', {
        params: { page, itemsPerPage: ACCOUNT_PAGE_SIZE, ...(storeSlug ? { store: storeSlug } : {}) },
      })
      return data
    },
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    placeholderData: keepPreviousData,
  })
}

export function useCustomerNotifications(slug: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.notifications(slug),
    queryFn: async () => {
      const { data } = await api.get<CustomerNotification[]>(`/stores/${slug}/customer/notifications`)
      return data
    },
    enabled: Boolean(slug) && enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  })
}

export function useMySellSubmissions(page = 1, storeSlug?: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.mySellSubmissions(page, storeSlug),
    queryFn: async () => {
      const { data } = await api.get<PaginatedList<SellSubmission>>('/me/sell-submissions', {
        params: { page, itemsPerPage: ACCOUNT_PAGE_SIZE, ...(storeSlug ? { store: storeSlug } : {}) },
      })
      return data
    },
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useMarkNotificationRead(storeSlug?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => {
      if (storeSlug) {
        await api.patch(`/stores/${storeSlug}/customer/notifications/${id}/read`)
        return
      }
      await api.patch(`/me/notifications/${id}/read`)
    },
    onMutate: (id) => {
      markCachedNotificationsRead(queryClient, new Date().toISOString(), id)
    },
    onSettled: () => invalidateCustomerNotifications(queryClient),
  })
}

export function useMarkAllNotificationsRead(storeSlug?: string, types?: string[]) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (storeSlug && !types?.length) {
        await api.patch(`/stores/${storeSlug}/customer/notifications/read-all`)
        return
      }
      await api.patch('/me/notifications/read-all', undefined, {
        params: {
          ...(storeSlug ? { store: storeSlug } : {}),
          ...(types?.length === 1 ? { type: types[0] } : types?.length ? { type: types } : {}),
        },
      })
    },
    onMutate: () => {
      markCachedNotificationsRead(queryClient, new Date().toISOString(), undefined, types)
    },
    onSettled: () => invalidateCustomerNotifications(queryClient),
  })
}
