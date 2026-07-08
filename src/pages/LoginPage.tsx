import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  DEFAULT_LOGIN_PASSWORD,
  USER_ROLE_LABELS,
  USER_ROLES,
} from '../constants/auth'
import { useAuthStore } from '../store/useAuthStore'
import { useConveyorStore } from '../store/useConveyorStore'
import type { UserRole } from '../types/auth'

interface RoleCardTheme {
  tagline: string
  desc: string
  accent: string
  glow: string
  ring: string
  badge: string
  avatar: ReactNode
}

const ROLE_THEMES: Record<UserRole, RoleCardTheme> = {
  operator: {
    tagline: 'FIELD OPS',
    desc: '현장 모니터링',
    accent: 'from-cyan-500/20 via-teal-500/10 to-slate-900/80',
    glow: 'shadow-[0_0_28px_rgba(34,211,238,0.35)]',
    ring: 'ring-cyan-400/80',
    badge: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
    avatar: <OperatorAvatar />,
  },
  engineer: {
    tagline: 'SYS ENGINEER',
    desc: '설비 제어 · 관리',
    accent: 'from-amber-500/20 via-orange-500/10 to-slate-900/80',
    glow: 'shadow-[0_0_28px_rgba(251,191,36,0.35)]',
    ring: 'ring-amber-400/80',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    avatar: <EngineerAvatar />,
  },
  developer: {
    tagline: 'CORE DEV',
    desc: 'GUI · 시스템 개발',
    accent: 'from-violet-500/25 via-fuchsia-500/15 to-slate-900/80',
    glow: 'shadow-[0_0_28px_rgba(167,139,250,0.4)]',
    ring: 'ring-violet-400/80',
    badge: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
    avatar: <DeveloperAvatar />,
  },
}

function isDeveloperMasterKey(e: KeyboardEvent): boolean {
  return (
    e.shiftKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.metaKey &&
    (e.code === 'Digit1' || e.key === '!' || e.key === '1')
  )
}

function LoginBackground() {
  return (
    <div className="login-ai-bg pointer-events-none absolute inset-0 overflow-hidden">
      <div className="login-ai-orb login-ai-orb-a" />
      <div className="login-ai-orb login-ai-orb-b" />
      <div className="login-ai-orb login-ai-orb-c" />
      <svg className="login-ai-mesh absolute inset-0 h-full w-full opacity-40" aria-hidden>
        <defs>
          <pattern id="login-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="rgba(56,189,248,0.12)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-grid)" />
      </svg>
      <svg className="login-ai-network absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <g stroke="rgba(129,140,248,0.25)" strokeWidth="0.15" fill="none" vectorEffect="non-scaling-stroke">
          <path className="login-ai-line" d="M10 20 Q 30 35, 50 25 T 90 30" />
          <path className="login-ai-line login-ai-line-delay" d="M5 70 Q 40 50, 55 65 T 95 55" />
          <path className="login-ai-line login-ai-line-delay-2" d="M20 90 Q 50 75, 75 85 T 88 60" />
        </g>
        <circle className="login-ai-node" cx="10" cy="20" r="0.8" fill="rgba(34,211,238,0.8)" />
        <circle className="login-ai-node login-ai-line-delay" cx="50" cy="25" r="1" fill="rgba(167,139,250,0.9)" />
        <circle className="login-ai-node login-ai-line-delay-2" cx="90" cy="30" r="0.8" fill="rgba(34,211,238,0.7)" />
        <circle className="login-ai-node" cx="55" cy="65" r="0.8" fill="rgba(251,191,36,0.85)" />
        <circle className="login-ai-node login-ai-line-delay" cx="95" cy="55" r="0.8" fill="rgba(167,139,250,0.75)" />
      </svg>
      <div className="login-ai-scanline absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
    </div>
  )
}

function OperatorAvatar() {
  return (
    <svg viewBox="0 0 80 96" className="h-24 w-20" aria-hidden>
      <defs>
        <linearGradient id="op-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="88" rx="22" ry="6" fill="rgba(34,211,238,0.25)" />
      <rect x="22" y="50" width="36" height="34" rx="8" fill="url(#op-grad)" />
      <path d="M26 50 Q40 42 54 50" fill="#22d3ee" />
      <circle cx="40" cy="30" r="13" fill="#a5f3fc" />
      <path d="M27 30 Q40 18 53 30 Q40 24 27 30" fill="#22d3ee" opacity="0.85" />
    </svg>
  )
}

function EngineerAvatar() {
  return (
    <svg viewBox="0 0 80 96" className="h-24 w-20" aria-hidden>
      <defs>
        <linearGradient id="eng-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="88" rx="22" ry="6" fill="rgba(251,191,36,0.25)" />
      <rect x="24" y="50" width="32" height="34" rx="6" fill="url(#eng-grad)" />
      <circle cx="40" cy="31" r="13" fill="#fde68a" />
      <path d="M24 31 L56 31 L52 22 L28 22 Z" fill="#fbbf24" />
    </svg>
  )
}

function DeveloperAvatar() {
  return (
    <svg viewBox="0 0 80 96" className="h-24 w-20" aria-hidden>
      <defs>
        <linearGradient id="dev-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="88" rx="22" ry="6" fill="rgba(167,139,250,0.3)" />
      <path d="M22 52 L58 52 L52 84 L26 84 Z" fill="url(#dev-grad)" />
      <circle cx="40" cy="30" r="12" fill="#ddd6fe" />
      <path d="M28 30 Q40 14 52 30 L48 38 Q40 32 32 38 Z" fill="#a78bfa" opacity="0.9" />
    </svg>
  )
}

function CharacterCard({
  role,
  selected,
  onSelect,
}: {
  role: UserRole
  selected: boolean
  onSelect: () => void
}) {
  const theme = ROLE_THEMES[role]

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex min-h-[200px] flex-col items-center rounded-xl border bg-gradient-to-b p-3 text-center transition-all duration-300 ${
        theme.accent
      } ${
        selected
          ? `scale-[1.03] border-white/30 ring-2 ${theme.ring} ${theme.glow}`
          : 'scale-100 border-slate-700/80 opacity-75 hover:scale-[1.02] hover:border-slate-500 hover:opacity-100'
      }`}
    >
      {selected ? (
        <span className="login-char-selected absolute -top-2 left-1/2 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold tracking-widest text-slate-900">
          SELECT
        </span>
      ) : null}

      <span
        className={`mb-2 rounded border px-2 py-0.5 text-[9px] font-bold tracking-wider ${theme.badge}`}
      >
        {theme.tagline}
      </span>

      <div
        className={`mb-2 flex flex-1 items-end justify-center transition-transform duration-300 ${
          selected ? 'translate-y-0' : 'translate-y-1 group-hover:-translate-y-1'
        }`}
      >
        {theme.avatar}
      </div>

      <p className="text-sm font-bold text-white">{USER_ROLE_LABELS[role]}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">{theme.desc}</p>
    </button>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hydrate = useAuthStore((s) => s.hydrate)
  const login = useAuthStore((s) => s.login)
  const loginAsDeveloper = useAuthStore((s) => s.loginAsDeveloper)
  const logApplication = useConveyorStore((s) => s.logApplication)

  const [role, setRole] = useState<UserRole>('operator')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasHydrated) hydrate()
  }, [hasHydrated, hydrate])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isDeveloperMasterKey(e)) return
      e.preventDefault()
      loginAsDeveloper()
      void logApplication({
        title: 'Login',
        comment: 'Developer login (master key)',
      })
      navigate('/', { replace: true })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loginAsDeveloper, logApplication, navigate])

  if (!hasHydrated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-950 text-sm text-cyan-300/80">
        <LoginBackground />
        <span className="login-ai-pulse relative z-10 tracking-widest">SYSTEM BOOT...</span>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!login(role, password)) {
      setError('비밀번호가 올바르지 않습니다.')
      return
    }

    void logApplication({
      title: 'Login',
      comment: `${USER_ROLE_LABELS[role]} login`,
    })
    navigate('/', { replace: true })
  }

  const selectedTheme = ROLE_THEMES[role]

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10 text-slate-100">
      <LoginBackground />

      <div className="relative z-10 w-full max-w-3xl">
        <header className="mb-8 text-center">
          <p className="login-ai-pulse mb-2 text-[10px] font-semibold tracking-[0.35em] text-cyan-400/90">
            AI CONTROL GATEWAY
          </p>
          <h1 className="bg-gradient-to-r from-cyan-200 via-white to-violet-200 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
            Smart Control Platform
          </h1>
          <p className="mt-2 text-sm text-slate-400">신분을 선택하고 접속하세요</p>
        </header>

        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset>
              <legend className="mb-3 text-center text-xs font-medium tracking-widest text-slate-500">
                CHARACTER SELECT
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {USER_ROLES.map((item) => (
                  <CharacterCard
                    key={item}
                    role={item}
                    selected={role === item}
                    onSelect={() => setRole(item)}
                  />
                ))}
              </div>
            </fieldset>

            <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4">
              <p className="mb-3 text-center text-xs text-slate-400">
                선택:{' '}
                <span className="font-semibold text-white">{USER_ROLE_LABELS[role]}</span>
                <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] ${selectedTheme.badge}`}>
                  {selectedTheme.tagline}
                </span>
              </p>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500">ACCESS CODE</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder={`임시 코드 ${DEFAULT_LOGIN_PASSWORD}`}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                />
              </label>

              {error ? (
                <p className="mt-3 text-center text-sm text-red-400" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                className="login-start-btn mt-4 w-full rounded-lg py-3 text-sm font-bold tracking-wide text-white"
              >
                START SESSION
              </button>
            </div>
          </form>

          <p className="mt-4 text-center text-[10px] text-slate-600">
            임시 비밀번호 {DEFAULT_LOGIN_PASSWORD} · Shift+1 개발자 바로가기
          </p>
        </div>
      </div>
    </div>
  )
}
