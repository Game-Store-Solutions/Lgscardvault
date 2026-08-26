const DB = 'lgscv-training-audio'
const STORE = 'clips'

function hash(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  return `k${h >>> 0}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
  })
}

export async function readCachedAudio(text: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(hash(text))
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function writeCachedAudio(text: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(STORE).put(blob, hash(text))
    })
  } catch {
    /* ignore quota / private mode */
  }
}
