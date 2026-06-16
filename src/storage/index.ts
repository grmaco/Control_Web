import { LocalStorageAdapter } from './LocalStorageAdapter'
import type { StorageAdapter } from './StorageAdapter'

export const storage: StorageAdapter = new LocalStorageAdapter()

export type { StorageAdapter }
