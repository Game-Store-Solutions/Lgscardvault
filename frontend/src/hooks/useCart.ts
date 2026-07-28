import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import type { CartItem, InventoryItem, SealedInventoryLine } from '../api/types'
import { customerKeys, useCustomerCart } from './useCustomer'

/** Copies wanted, clamped to what the listing has in stock (min 1). */
function clampToStock(quantity: number, item: InventoryItem): number {
  return Math.max(1, Math.min(quantity, item.quantity))
}

/**
 * useCart — the customer's per-store cart plus mutations to change it. Reads
 * share the `useCustomerCart` query cache; writes optimistically patch that
 * cache and reconcile against the server response, matching the favorites flow.
 */
export function useCart(slug: string, enabled = true) {
  const queryClient = useQueryClient()
  const key = customerKeys.cart(slug)
  const query = useCustomerCart(slug, enabled)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  /** Set the quantity for a listing (upsert). Quantity ≤ 0 removes the line. */
  const setItem = useMutation({
    mutationFn: async ({ item, quantity }: { item: InventoryItem; quantity: number }) => {
      await api.put(`/stores/${slug}/customer/cart/${item.id}`, { quantity })
    },
    onMutate: async ({ item, quantity }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CartItem[]>(key)
      queryClient.setQueryData<CartItem[]>(key, (current = []) => {
        if (quantity <= 0) {
          return current.filter((entry) => entry.inventoryItem?.id !== item.id)
        }
        const clamped = clampToStock(quantity, item)
        const existing = current.find((entry) => entry.inventoryItem?.id === item.id)
        if (existing) {
          return current.map((entry) =>
            entry.inventoryItem?.id === item.id ? { ...entry, quantity: clamped } : entry,
          )
        }
        const optimistic: CartItem = {
          id: -item.id,
          quantity: clamped,
          inventoryItem: item,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        return [optimistic, ...current]
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: invalidate,
  })

  const removeItem = useMutation({
    mutationFn: async (item: InventoryItem) => {
      await api.delete(`/stores/${slug}/customer/cart/${item.id}`)
    },
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CartItem[]>(key)
      queryClient.setQueryData<CartItem[]>(key, (current = []) =>
        current.filter((entry) => entry.inventoryItem?.id !== item.id),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: invalidate,
  })

  /** Set the quantity for a sealed listing (upsert). Quantity ≤ 0 removes it. */
  const setSealedItem = useMutation({
    mutationFn: async ({ item, quantity }: { item: SealedInventoryLine; quantity: number }) => {
      await api.put(`/stores/${slug}/customer/cart/sealed/${item.id}`, { quantity })
    },
    onMutate: async ({ item, quantity }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CartItem[]>(key)
      queryClient.setQueryData<CartItem[]>(key, (current = []) => {
        if (quantity <= 0) {
          return current.filter((entry) => entry.sealedItem?.id !== item.id)
        }
        const clamped = Math.max(1, Math.min(quantity, item.quantity))
        if (current.some((entry) => entry.sealedItem?.id === item.id)) {
          return current.map((entry) =>
            entry.sealedItem?.id === item.id ? { ...entry, quantity: clamped } : entry,
          )
        }
        const optimistic: CartItem = {
          id: -item.id,
          quantity: clamped,
          isSealed: true,
          inventoryItem: null,
          sealedItem: item,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        return [optimistic, ...current]
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: invalidate,
  })

  const removeSealedItem = useMutation({
    mutationFn: async (item: SealedInventoryLine) => {
      await api.delete(`/stores/${slug}/customer/cart/sealed/${item.id}`)
    },
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CartItem[]>(key)
      queryClient.setQueryData<CartItem[]>(key, (current = []) =>
        current.filter((entry) => entry.sealedItem?.id !== item.id),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: invalidate,
  })

  const clear = useMutation({
    mutationFn: async () => {
      await api.delete(`/stores/${slug}/customer/cart`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CartItem[]>(key)
      queryClient.setQueryData<CartItem[]>(key, [])
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: invalidate,
  })

  return { query, setItem, removeItem, setSealedItem, removeSealedItem, clear }
}

export default useCart
