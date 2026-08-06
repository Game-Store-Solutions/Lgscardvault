import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CartItem, InventoryItem, SealedInventoryLine } from '../api/types'

export const guestCartKey = (slug: string) => ['guest-cart', slug] as const

const storageKey = (slug: string) => `lgscv-guest-cart:${slug}`

function readGuestCart(slug: string): CartItem[] {
  if (!slug) return []
  try {
    const raw = localStorage.getItem(storageKey(slug))
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeGuestCart(slug: string, items: CartItem[]): void {
  localStorage.setItem(storageKey(slug), JSON.stringify(items))
}

function clampToStock(quantity: number, item: InventoryItem): number {
  return Math.max(1, Math.min(quantity, item.quantity))
}

/** Browser-local cart for shoppers who are not signed in. */
export function useGuestCart(slug: string, enabled = true) {
  const queryClient = useQueryClient()
  const key = guestCartKey(slug)

  const query = useQuery({
    queryKey: key,
    enabled: enabled && Boolean(slug),
    queryFn: () => readGuestCart(slug),
    staleTime: Infinity,
  })

  const persist = (items: CartItem[]) => {
    writeGuestCart(slug, items)
    queryClient.setQueryData(key, items)
  }

  const setItem = useMutation({
    mutationFn: async ({ item, quantity }: { item: InventoryItem; quantity: number }) => {
      const current = readGuestCart(slug)
      if (quantity <= 0) {
        persist(current.filter((entry) => entry.inventoryItem?.id !== item.id))
        return
      }
      const clamped = clampToStock(quantity, item)
      const existing = current.find((entry) => entry.inventoryItem?.id === item.id)
      if (existing) {
        persist(
          current.map((entry) =>
            entry.inventoryItem?.id === item.id ? { ...entry, quantity: clamped } : entry,
          ),
        )
        return
      }
      const optimistic: CartItem = {
        id: -item.id,
        quantity: clamped,
        inventoryItem: item,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      persist([optimistic, ...current])
    },
  })

  const removeItem = useMutation({
    mutationFn: async (item: InventoryItem) => {
      persist(readGuestCart(slug).filter((entry) => entry.inventoryItem?.id !== item.id))
    },
  })

  const setSealedItem = useMutation({
    mutationFn: async ({ item, quantity }: { item: SealedInventoryLine; quantity: number }) => {
      const current = readGuestCart(slug)
      if (quantity <= 0) {
        persist(current.filter((entry) => entry.sealedItem?.id !== item.id))
        return
      }
      const clamped = Math.max(1, Math.min(quantity, item.quantity))
      if (current.some((entry) => entry.sealedItem?.id === item.id)) {
        persist(
          current.map((entry) =>
            entry.sealedItem?.id === item.id ? { ...entry, quantity: clamped } : entry,
          ),
        )
        return
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
      persist([optimistic, ...current])
    },
  })

  const removeSealedItem = useMutation({
    mutationFn: async (item: SealedInventoryLine) => {
      persist(readGuestCart(slug).filter((entry) => entry.sealedItem?.id !== item.id))
    },
  })

  const clear = useMutation({
    mutationFn: async () => {
      persist([])
    },
  })

  return { query, setItem, removeItem, setSealedItem, removeSealedItem, clear }
}

export function resetGuestCart(slug: string): void {
  writeGuestCart(slug, [])
}

export function guestCartLines(cart: CartItem[]): Array<{
  inventoryItemId?: number
  sealedItemId?: number
  quantity: number
}> {
  const lines: Array<{ inventoryItemId?: number; sealedItemId?: number; quantity: number }> = []
  for (const entry of cart) {
    if (entry.sealedItem?.id) {
      lines.push({ sealedItemId: entry.sealedItem.id, quantity: entry.quantity })
    } else if (entry.inventoryItem?.id) {
      lines.push({ inventoryItemId: entry.inventoryItem.id, quantity: entry.quantity })
    }
  }
  return lines
}

export default useGuestCart
