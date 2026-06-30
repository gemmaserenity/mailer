import { useState, useEffect } from 'react';
import { api, fmtDateTime } from '../lib/api.js';

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

const BTN = {
  background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
  padding: '.25rem .65rem', fontSize: 12, cursor: 'pointer', color: 'var(--text)',
  transition: 'border-color .12s', whiteSpace: 'nowrap',
};

export default function SentView() {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [error, setError] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setMessages(await api.compose.listSent({ limit: 100 }));
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function openMessage(msg) {
    setSelected(msg);
    if (!msg.body_html && !msg.body_text) {
      setLoadingMsg(true);
      try {
        const full = await api.compose.getSent(msg.id);
        setSelected(full);
      } catch {}
      finally { setLoadingMsg(false); }
    }
  }

  async function toggleStar(msg, e) {
    e.stopPropagation();
    try {
      if (msg.starred) await api.compose.unstarSent(msg.id);
      else await api.compose.starSent(msg.id);
      const update = m => m.id === msg.id ? { ...m, starred: !m.starred } : m;
      setMessages(prev => prev.map(update));
      if (selected?.id === msg.id) setSelected(prev => ({ ...prev, starred: !prev.starred }));
    } catch {}
  }

  const MessageList = (
    <div style={{
      width: isMobile ? '100%' : 300, flexShrink: 0,
      borderRight: isMobile ? 'none' : '1.5px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', overflow: 'hidden', height: '100%',
    }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1.5px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Sent</h2>
          <button onClick={load} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)', padding: '.2rem .4rem', borderRadius: 'var(--radius)' }} title="Refresh">↺</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && <div className="error-msg" style={{ margin: '.75rem', fontSize: 13 }}>{error}</div>}
        {loading && <div className="loading">Loading…</div>}
        {!loading && messages.length === 0 && !error && (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--text-xmuted)', fontSize: 14 }}>No sent emails</div>
        )}
        {messages.map(msg => (
          <div key={msg.id} onClick={() => openMessage(msg)} style={{
            padding: '.8rem 1.25rem', borderBottom: '1px solid var(--border)', cursor: 'pointer',
            background: selected?.id === msg.id ? 'var(--surface-2)' : 'transparent',
            transition: 'background .1s', display: 'flex', alignItems: 'flex-start', gap: '.5rem',
          }}>
            <button
              onClick={e => toggleStar(msg, e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '.1rem', color: msg.starred ? '#f0a500' : 'var(--border)', flexShrink: 0, marginTop: '.1rem' }}
              title={msg.starred ? 'Unstar' : 'Star'}
            >{msg.starred ? '★' : '☆'}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.15rem' }}>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  To: {(msg.to_addresses || []).join(', ')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-xmuted)', flexShrink: 0, marginLeft: '.5rem' }}>
                  {fmtDateTime(msg.sent_at)}
                </span>
              </div>
              <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {msg.subject || '(no subject)'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-xmuted)' }}>From: {msg.from_name || msg.from_email}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const MessageContent = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, height: '100%' }}>
      {!selected ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-xmuted)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: '.5rem', opacity: .25 }}>↑</div>
            <p style={{ margin: 0, fontSize: 14 }}>Select a sent email to view</p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isMobile && (
            <button className="btn-ghost btn-sm" onClick={() => setSelected(null)} style={{ alignSelf: 'flex-start' }}>← Back</button>
          )}
          <div>
            <h1 style={{ margin: '0 0 .6rem', fontSize: '1.65rem', lineHeight: 1.2 }}>
              {selected.subject || '(no subject)'}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem 1.5rem', fontSize: 13, color: 'var(--text-muted)' }}>
              <span>
                <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>From</span>
                {selected.from_name ? `${selected.from_name} <${selected.from_email}>` : selected.from_email}
              </span>
              <span>
                <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>To</span>
                {(selected.to_addresses || []).join(', ')}
              </span>
              {selected.cc?.length > 0 && (
                <span>
                  <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>CC</span>
                  {selected.cc.join(', ')}
                </span>
              )}
              {selected.bcc?.length > 0 && (
                <span>
                  <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>BCC</span>
                  {selected.bcc.join(', ')}
                </span>
              )}
              <span>
                <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>Sent</span>
                {fmtDateTime(selected.sent_at)}
              </span>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: 0 }} />

          {loadingMsg ? (
            <div className="loading">Loading…</div>
          ) : selected.body_html ? (
            <div style={{ fontSize: 15, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: selected.body_html }} />
          ) : (
            <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, fontSize: 15, lineHeight: 1.65 }}>
              {selected.body_text || '(empty)'}
            </pre>
          )}

          {selected.attachments?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--text-xmuted)', marginBottom: '.5rem', textTransform: 'uppercase' }}>Attachments</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {selected.attachments.map((att, i) => (
                  <span key={i} style={{ ...BTN, cursor: 'default' }}>
                    ⊙ {att.filename}{att.size ? ` · ${fmtSize(att.size)}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: '1rem', display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <button style={BTN} onClick={e => toggleStar(selected, e)}>
              {selected.starred ? '★ Unstar' : '☆ Star'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {isMobile ? (selected ? MessageContent : MessageList) : <>{MessageList}{MessageContent}</>}
    </div>
  );
}
