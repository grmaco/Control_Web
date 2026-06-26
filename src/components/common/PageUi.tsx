import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="app-page-title">{title}</h2>
        {subtitle ? <p className="app-page-subtitle">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function PageState({
  message,
  variant = 'default',
}: {
  message: string
  variant?: 'default' | 'error'
}) {
  return (
    <div
      className={`app-state-box ${variant === 'error' ? 'app-state-box--error' : ''}`}
    >
      {message}
    </div>
  )
}

export function EmptyPanel({ message }: { message: string }) {
  return <div className="app-state-box app-state-box--empty">{message}</div>
}

export function AppCard({
  children,
  className = '',
  muted = false,
}: {
  children: ReactNode
  className?: string
  muted?: boolean
}) {
  return (
    <div className={`${muted ? 'app-card-muted' : 'app-card'} ${className}`.trim()}>
      {children}
    </div>
  )
}
