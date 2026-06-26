import { create } from 'zustand'
import { getPasswordForRole } from '../constants/auth'
import { STORAGE_KEYS } from '../constants/storage'
import type { AuthSession, UserRole } from '../types/auth'

interface AuthState {
  role: UserRole | null
  isAuthenticated: boolean
  hasHydrated: boolean
  hydrate: () => void
  login: (role: UserRole, password: string) => boolean
  loginAsDeveloper: () => void
  logout: () => void
}

function readSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.authSession)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed.role || !parsed.loggedInAt) return null
    return parsed
  } catch {
    return null
  }
}

function writeSession(session: AuthSession): void {
  sessionStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify(session))
}

function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEYS.authSession)
}

function establishSession(role: UserRole): void {
  writeSession({ role, loggedInAt: new Date().toISOString() })
}

export const useAuthStore = create<AuthState>((set) => ({
  role: null,
  isAuthenticated: false,
  hasHydrated: false,

  hydrate: () => {
    const session = readSession()
    set({
      role: session?.role ?? null,
      isAuthenticated: session != null,
      hasHydrated: true,
    })
  },

  login: (role, password) => {
    if (password !== getPasswordForRole(role)) return false
    establishSession(role)
    set({ role, isAuthenticated: true })
    return true
  },

  loginAsDeveloper: () => {
    establishSession('developer')
    set({ role: 'developer', isAuthenticated: true })
  },

  logout: () => {
    clearSession()
    set({ role: null, isAuthenticated: false })
  },
}))
