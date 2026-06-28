import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';

const NAV = [
  { to: '/inbox',       label: 'Inbox',       icon: '✉' },
  { to: '/sequences',   label: 'Sequences',   icon: '◈' },
  { to: '/templates',   label: 'Templates',   icon: '⊟' },
  { to: '/enrollments', label: 'Enrollments', icon: '◷' },
  { to: '/senders',     label: 'Senders',     icon: '⊙' },
];

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

function SidebarContent({ onNav, dark, setDark, navigate }) {
  return (
    <>
      <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1.5px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.2 }}>
          Email Sequence<br />Engine
        </div>
      </div>

      <nav style={{ flex: 1, padding: '1rem .75rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNav}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '.6rem',
              padding: '.55rem .75rem',
              borderRadius: 'var(--radius)',
              textDecoration: 'none',
              fontSize: '15px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              background: isActive ? 'var(--surface-2)' : 'transparent',
              transition: 'background .12s, color .12s',
            })}
          >
            <span style={{ fontSize: '16px', opacity: .8 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '.75rem 1.25rem', borderTop: '1.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => { navigate('/sequences/new'); onNav?.(); }}
          className="btn-primary"
          style={{ fontSize: '13px', padding: '.35rem .8rem' }}
        >
          + New
        </button>
        <button
          onClick={() => setDark(d => !d)}
          style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '.3rem .6rem', fontSize: '15px' }}
          title="Toggle dark mode"
        >
          {dark ? '☀' : '◐'}
        </button>
      </div>
    </>
  );
}

export default function Layout() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const isInbox = location.pathname.startsWith('/inbox');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  if (isMobile) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Mobile top bar */}
        <header style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 52,
          background: 'var(--surface)', borderBottom: '1.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1rem', zIndex: 50, flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600 }}>
            Email Sequence Engine
          </span>
          <button
            onClick={() => setDrawerOpen(o => !o)}
            style={{ background: 'none', border: 'none', fontSize: '22px', padding: '.25rem .4rem', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text)' }}
            aria-label="Menu"
          >
            {drawerOpen ? '✕' : '☰'}
          </button>
        </header>

        {/* Drawer overlay */}
        {drawerOpen && (
          <div
            onClick={closeDrawer}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 98 }}
          />
        )}

        {/* Slide-in drawer */}
        <aside style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: '75%', maxWidth: 280,
          background: 'var(--surface)',
          borderRight: '1.5px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          padding: '1.5rem 0',
          zIndex: 99,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .22s ease',
        }}>
          <SidebarContent onNav={closeDrawer} dark={dark} setDark={setDark} navigate={navigate} />
        </aside>

        {/* Page content */}
        <main style={{
          flex: 1,
          overflowY: isInbox ? 'hidden' : 'auto',
          padding: isInbox ? 0 : '1rem',
          paddingTop: isInbox ? '52px' : 'calc(52px + 1rem)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <Outlet />
        </main>
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <aside style={{
        width: 'var(--sidebar-w)',
        background: 'var(--surface)',
        borderRight: '1.5px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0, padding: '1.5rem 0',
      }}>
        <SidebarContent dark={dark} setDark={setDark} navigate={navigate} />
      </aside>
      <main style={{
        flex: 1,
        overflow: isInbox ? 'hidden' : 'auto',
        padding: isInbox ? 0 : '2rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>
        <Outlet />
      </main>
    </div>
  );
}
