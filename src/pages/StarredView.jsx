import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDateTime } from '../lib/api.js';

export default function StarredView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setItems(await api.starred.list());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function unstar(item, e) {
    e.stopPropagation();
    try {
      if (item._type === 'inbox') await api.starred.unstarInbox(item.id);
      else await api.compose.unstarSent(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch {}
  }

  function openItem(item) {
    if (item._type === 'inbox') navigate('/inbox');
    else navigate('/sent');
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Starred</h1>
        <button onClick={load} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)', padding: '.2rem .4rem', borderRadius: 'var(--radius)' }} title="Refresh">↺</button>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
      {loading && <div className="loading">Loading…</div>}

      {!loading && items.length === 0 && !error && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-xmuted)', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: '.5rem', opacity: .2 }}>★</div>
          No starred messages yet — star items from your Inbox or Sent folder
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {items.map(item => (
          <div key={`${item._type}-${item.id}`} onClick={() => openItem(item)} style={{
            padding: '.9rem 1.1rem', borderRadius: 'var(--radius)',
            border: '1.5px solid var(--border)', background: 'var(--surface)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem',
            transition: 'border-color .12s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              padding: '.15rem .45rem', borderRadius: 99, flexShrink: 0,
              background: item._type === 'inbox' ? 'var(--surface-2)' : '#e8f5e9',
              color: item._type === 'inbox' ? 'var(--text-muted)' : '#2e7d32',
              border: '1.5px solid var(--border)',
            }}>
              {item._type === 'inbox' ? 'Inbox' : 'Sent'}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: '.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.subject || '(no subject)'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item._type === 'inbox'
                  ? `From: ${item.from_name || item.from_email}`
                  : `To: ${(item.to_addresses || []).join(', ')}`}
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-xmuted)', flexShrink: 0 }}>
              {fmtDateTime(item.date)}
            </div>

            <button
              onClick={e => unstar(item, e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#f0a500', padding: '.1rem', flexShrink: 0 }}
              title="Unstar"
            >★</button>
          </div>
        ))}
      </div>
    </div>
  );
}
