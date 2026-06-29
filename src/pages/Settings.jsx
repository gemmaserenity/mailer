import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function Settings() {
  const [senders, setSenders] = useState([]);
  const [defaultSender, setDefaultSender] = useState(() => localStorage.getItem('mailer_default_sender') || '');
  const [signature, setSignature] = useState(() => localStorage.getItem('mailer_signature') || '');
  const [perPage, setPerPage] = useState(() => localStorage.getItem('mailer_per_page') || '50');
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.senders.list().then(setSenders).catch(() => {}); }, []);

  function save() {
    localStorage.setItem('mailer_default_sender', defaultSender);
    localStorage.setItem('mailer_signature', signature);
    localStorage.setItem('mailer_per_page', perPage);
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
