import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function Settings() {
  const [senders, setSenders] = useState([]);
  const [appName, setAppName] = useState(() => localStorage.getItem('mailer_app_name') || 'Email Sequence Engine');
  const [appLogoUrl, setAppLogoUrl] = useState(() => localStorage.getItem('mailer_app_logo_url') || '');
  const [showLogo, setShowLogo] = useState(() => localStorage.getItem('mailer_show_logo') !== '0');
  const [showName, setShowName] = useState(() => localStorage.getItem('mailer_show_name') !== '0');
  const [defaultSender, setDefaultSender] = useState(() => localStorage.getItem('mailer_default_sender') || '');
  const [signature, setSignature] = useState(() => localStorage.getItem('mailer_signature') || '');
  const [perPage, setPerPage] = useState(() => localStorage.getItem('mailer_per_page') || '50');
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.senders.list().then(setSenders).catch(() => {}); }, []);

  function save() {
    localStorage.setItem('mailer_app_name', appName.trim() || 'Email Sequence Engine');
    localStorage.setItem('mailer_app_logo_url', appLogoUrl.trim());
    localStorage.setItem('mailer_show_logo', showLogo ? '1' : '0');
    localStorage.setItem('mailer_show_name', showName ? '1' : '0');
    localStorage.setItem('mailer_default_sender', defaultSender);
    localStorage.setItem('mailer_signature', signature);
    localStorage.setItem('mailer_per_page', perPage);
    window.dispatchEvent(new CustomEvent('brandingUpdated'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ maxWidth: 580 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', fontWeight: 400, marginBottom: '2.5rem' }}>
        Settings
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

        <section>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-xmuted)', marginBottom: '1rem' }}>
            Branding
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            <div>
              <label>App name</label>
              <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Email Sequence Engine" />
            </div>

            <div>
              <label>Logo URL</label>
              <input value={appLogoUrl} onChange={e => setAppLogoUrl(e.target.value)} placeholder="https://mailer.gemmaserenity.com/logo.png" />
              {appLogoUrl.trim() && (
                <div style={{ marginTop: '.6rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <img src={appLogoUrl.trim()} alt="Logo preview" style={{ height: 48, maxWidth: 200, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 6, background: 'var(--surface)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-xmuted)' }}>Preview</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              <label style={{ marginBottom: 0 }}>Show in sidebar header</label>
              {[
                { state: showName, set: setShowName, label: 'App name' },
                { state: showLogo, set: setShowLogo, label: 'Logo' },
              ].map(({ state, set, label }) => (
                <label key={label} style={{
                  display: 'flex', alignItems: 'center', gap: '.6rem',
                  fontSize: 14, fontWeight: 400, textTransform: 'none',
                  letterSpacing: 0, color: 'var(--text)', cursor: 'pointer', marginBottom: 0,
                }}>
                  <input
                    type="checkbox"
                    checked={state}
                    onChange={e => set(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                  />
                  {label}
                </label>
              ))}
              <p style={{ fontSize: 13, color: 'var(--text-xmuted)', margin: '.1rem 0 0', lineHeight: 1.5 }}>
                Both can be shown together. Takes effect immediately after saving.
              </p>
            </div>

          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-xmuted)', marginBottom: '1rem' }}>
            Default Sender
          </h2>
          <select
            value={defaultSender}
            onChange={e => setDefaultSender(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">— None selected —</option>
            {senders.map(s => (
              <option key={s.id} value={s.id}>{s.name} · {s.email}</option>
            ))}
          </select>
          <p style={{ fontSize: 13, color: 'var(--text-xmuted)', marginTop: '.5rem', lineHeight: 1.5 }}>
            Used when composing new emails and forwarding messages.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-xmuted)', marginBottom: '1rem' }}>
            Reply Signature
          </h2>
          <textarea
            value={signature}
            onChange={e => setSignature(e.target.value)}
            placeholder={'Gemma Serenity\ngemmaserenity.com'}
            rows={5}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <p style={{ fontSize: 13, color: 'var(--text-xmuted)', marginTop: '.5rem', lineHeight: 1.5 }}>
            Automatically added when you open a reply or reply-all.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-xmuted)', marginBottom: '1rem' }}>
            Messages per page
          </h2>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            {['25', '50', '100'].map(n => (
              <button
                key={n}
                onClick={() => setPerPage(n)}
                style={{
                  padding: '.3rem .9rem', borderRadius: 'var(--radius)', fontSize: 14, cursor: 'pointer',
                  border: `1.5px solid ${perPage === n ? 'var(--accent)' : 'var(--border)'}`,
                  background: perPage === n ? 'var(--accent)' : 'transparent',
                  color: perPage === n ? 'var(--bg)' : 'var(--text)',
                  fontWeight: perPage === n ? 600 : 400,
                  transition: 'all .12s',
                }}
              >{n}</button>
            ))}
          </div>
        </section>

        <div style={{ paddingTop: '.5rem' }}>
          <button className="btn-primary" onClick={save} style={{ minWidth: 110 }}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>

      </div>
    </div>
  );
}
