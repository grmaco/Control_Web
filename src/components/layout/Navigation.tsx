import { NavLink } from 'react-router-dom'
import { useConveyorStore } from '../../store/useConveyorStore'

const navItems = [
  { to: '/', label: '주화면', end: true },
  { to: '/line-status', label: '라인 현황' },
  { to: '/builder', label: '라인 빌더' },
  { to: '/history', label: '이력' },
]

export function Navigation() {
  const logApplication = useConveyorStore((s) => s.logApplication)

  return (
    <nav className="flex gap-1">
      {navItems.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => {
            void logApplication({
              title: 'Button Click',
              comment: `Main: Menu-${label} Click`,
            })
          }}
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
