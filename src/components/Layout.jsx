import { useState, useEffect, useCallback, createContext } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import ComposeModal from '../pages/ComposeModal.jsx';

export const ComposeContext = createContext(null);

const NAV = [
  { to: '/inbox',       label: 'Inbox',       icon: '✉' },
  { to: '/sent',        label: 'Sent',        icon: '↑' },
  { to: '/drafts',      label: 'Drafts',      icon: '✎' },
  { to: '/starred',     label: 'Starred',     icon: '★' },
  { to: '/sequences',   label: 'Sequences',   icon: '◈' },
  { to: '/templates',   label: 'Templates',   icon: '⊟' },
  { to: '/enrollments', label: 'Enrollments', icon: '◷' },
  { to: '/senders',     label: 'Senders',     icon: '⊙' },
  { to: '/settings',    label: 'Settings',    icon: '⚙' },
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

function readBranding() {
  return {
    appName: localStorage.getItem('mailer_app_name') || 'Email Sequence Engine',
    appLogoUrl: localStorage.getItem('mailer_app_logo_url') || '',
  };
}

function SidebarContent({ collapsed: sc, onNav, dark, setDark, onCollapse, onCompose, branding }) {
  function navStyle({ isActive }) {
    return {
      display: 'flex',
      alignItems: 'center',
      gap: sc ? 0 : '.6rem',
      padding: sc ? '.5rem 0' : '.5rem .75rem',
      justifyContent: sc ? 'center' : 'flex-start',
      borderRadius: 'var(--radius)',
      textDecoration: 'none',
      fontSize: '15px',
      fontWeight: isActive ? 600 : 400,
      color: isActive ? 'var(--text)' : 'var(--text-muted)',
      background: isActive ? 'var(--surface-2)' : 'transparent',
      transition: 'background .12s, color .12s',
    };
  }

  return (
    <>
      {/* Header: branding + controls */}
      <div style={{
        padding: sc ? '.75rem .5rem' : '0 1rem 1rem',
        borderBottom: '1.5px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: sc ? 'center' : 'space-between',
        gap: '.4rem',
        flexShrink: 0,
      }}>
        {!sc && (
          <div style={{ minWidth: 0, flex: 1 }}>
            {branding.appLogoUrl ? (
              <img
                src={branding.appLogoUrl}
                alt={branding.appName}
                style={{ height: 28, maxWidth: 140, objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '.95rem', fontWeight: 600, lineHeight: 1.25 }}>
                {branding.appName}
              </div>
            )}
          </div>
        )}
        {sc && branding.appLogoUrl && (
          <img src={branding.appLogoUrl} alt="" style={{ height: 26, width: 26, objectFit: 'contain', borderRadius: 4 }} />
        )}
        <div style={{ display: 'flex', gap: '.15rem', flexShrink: 0 }}>
          <button
            onClick={() => setDark(d => !d)}
            title={dark ? 'Light mode' : 'Dark mode'}
            style={{ background: 'none', border: 'none', padding: '.25rem', fontSize: 15, cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 'var(--radius)', lineHeight: 1 }}
          >{dark ? '☀' : '◐'}</button>
          <button
            onClick={onCollapse}
            title={sc ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ background: 'none', border: 'none', padding: '.25rem', fontSize: 15, cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 'var(--radius)', lineHeight: 1 }}
          >{sc ? '»' : '«'}</button>
        </div>
      </div>

      {/* New Email */}
      <div style={{ padding: sc ? '.65rem .25rem' : '.75rem .75rem', flexShrink: 0 }}>
        <button
          onClick={() => { onCompose?.(); onNav?.(); }}
          className="btn-primary"
          title="New Email"
          style={{
            width: '100%', fontSize: '13px',
            padding: sc ? '.45rem 0' : '.4rem .8rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem',
          }}
        >
          <span>✉</span>
          {!sc && <span>New Email</span>}
        </button>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1, padding: sc ? '.25rem .2rem' : '.25rem .5rem',
        display: 'flex', flexDirection: 'column', gap: '.1rem',
        overflowY: 'auto',
      }}>
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} onClick={onNav} title={sc ? label : undefined} style={navStyle}>
            <span style={{ fontSize: '16px', opacity: .8, flexShrink: 0 }}>{icon}</span>
            {!sc && label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export default function Layout() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState(null);
  const [onDraftSavedCb, setOnDraftSavedCb] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('mailer_sidebar_c') === '1');
  const [branding, setBranding] = useState(readBranding);
  const isMobile = useIsMobile();

  const openCompose = useCallback((draft = null, onDraftSaved = null) => {
    setComposeDraft(draft || null);
    setOnDraftSavedCb(() => onDraftSaved);
    setComposeOpen(true);
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const isInbox = location.pathname.startsWith('/inbox') || location.pathname.startsWith('/sent');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem('mailer_sidebar_c', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handler = () => setBranding(readBranding());
    window.addEventListener('brandingUpdated', handler);
    return () => window.removeEventListener('brandingUpdated', handler);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(c => !c), []);

  if (isMobile) {
    return (
      <ComposeContext.Provider value={openCompose}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <header style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 52,
          background: 'var(--surface)', borderBottom: '1.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1rem', zIndex: 50, flexShrink: 0,
        }}>
          {branding.appLogoUrl
            ? <img src={branding.appLogoUrl} alt={branding.appName} style={{ height: 26, objectFit: 'contain' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600 }}>{branding.appName}</span>}
          <button
            onClick={() => setDrawerOpen(o => !o)}
            style={{ background: 'none', border: 'none', fontSize: '22px', padding: '.25rem .4rem', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text)' }}
            aria-label="Menu"
          >{drawerOpen ? '✕' : '☰'}</button>
        </header>

        {drawerOpen && (
          <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 98 }} />
        )}

        <aside style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: '75%', maxWidth: 280,
          background: 'var(--surface)', borderRight: '1.5px solid var(--border)',
          display: 'flex', flexDirection: 'column', padding: '1.25rem 0',
          zIndex: 99,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .22s ease',
        }}>
          <SidebarContent
            collapsed={false}
            onNav={closeDrawer}
            dark={dark}
            setDark={setDark}
            onCollapse={closeDrawer}
            onCompose={() => openCompose()}
            branding={branding}
          />
        </aside>

        <main style={{
          flex: 1, overflowY: isInbox ? 'hidden' : 'auto',
          padding: isInbox ? 0 : '1rem',
          paddingTop: isInbox ? '52px' : 'calc(52px + 1rem)',
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <Outlet />
        </main>
        {composeOpen && <ComposeModal draft={composeDraft} onDraftSaved={onDraftSavedCb} onClose={() => { setComposeOpen(false); setComposeDraft(null); }} />}
      </div>
      </ComposeContext.Provider>
    );
  }

  // Desktop
  return (
    <ComposeContext.Provider value={openCompose}>
    <div style={{ display: 'flex', height: '100%' }}>
      <aside style={{
        width: sidebarCollapsed ? 52 : 220,
        transition: 'width 0.18s ease',
        background: 'var(--surface)', borderRight: '1.5px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0, padding: '1.25rem 0',
        overflow: 'hidden',
      }}>
        <SidebarContent
          collapsed={sidebarCollapsed}
          dark={dark}
          setDark={setDark}
          onCollapse={toggleSidebar}
          onCompose={() => openCompose()}
          branding={branding}
        />
      </aside>
      <main style={{
        flex: 1, overflow: isInbox ? 'hidden' : 'auto',
        padding: isInbox ? 0 : '2rem 2.5rem',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <Outlet />
      </main>
      {composeOpen && <ComposeModal draft={composeDraft} onDraftSaved={onDraftSavedCb} onClose={() => { setComposeOpen(false); setComposeDraft(null); }} />}
    </div>
    </ComposeContext.Provider>
  );
}
