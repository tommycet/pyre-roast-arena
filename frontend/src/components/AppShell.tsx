import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConnectWallet } from './ui/ConnectWallet'
import { MonospaceLabel } from './ui/MonospaceLabel'
import { networkLabel } from '../lib/format'
import { CHAIN_ID } from '../lib/genlayer'

const navItems = [
  { to: '/', label: 'HOME' },
  { to: '/arena', label: 'ARENA' },
  { to: '/flame', label: 'HALL OF FLAME' },
]

export function AppShell() {
  const location = useLocation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'oklch(0.10 0.005 270 / 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: 64,
          }}
        >
          <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 24,
                  height: 24,
                  background: 'var(--ember)',
                  borderRadius: 4,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  letterSpacing: '0.04em',
                  color: 'var(--ink)',
                }}
              >
                PYRE
              </span>
            </Link>
            <nav style={{ display: 'flex', gap: 4 }}>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  style={({ isActive }) => ({
                    padding: '8px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: isActive ? 'var(--ink)' : 'var(--muted)',
                    borderBottom: isActive ? '1px solid var(--ember)' : '1px solid transparent',
                    textDecoration: 'none',
                    transition: 'color var(--dur-fast) var(--ease)',
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <MonospaceLabel size="xs" style={{ color: 'var(--muted)' }}>
              {networkLabel(CHAIN_ID)}
            </MonospaceLabel>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="container" style={{ flex: 1, paddingTop: 24, paddingBottom: 64 }}>
        <Outlet />
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--line)',
          padding: '20px 0',
          marginTop: 'auto',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'var(--muted)',
          }}
        >
          <MonospaceLabel size="xs">PYRE · GENLAYER CONSENSUS · {new Date().getFullYear()}</MonospaceLabel>
          <MonospaceLabel size="xs">PATH {location.pathname}</MonospaceLabel>
        </div>
      </footer>
    </div>
  )
}