import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: '모니터링', end: true },
  { to: '/builder', label: '라인 빌더' },
  { to: '/history', label: '이력' },
]

export function Navigation() {
  return (
    <nav className="flex gap-1">
      {navItems.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-slate-800 text-white'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
