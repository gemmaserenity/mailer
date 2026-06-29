import { useState, useEffect, useContext } from 'react';
import { api, fmtDateTime } from '../lib/api.js';
import { ComposeContext } from '../components/Layout.jsx';

export default function DraftsView() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const openCompose = useContext(ComposeContext);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setDrafts(await api.drafts.list());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function openDraft(draft) {
    openCompose(draft, () => {
      // Reload drafts after compose closes (draft may have been saved or deleted)
      load();
    });
  }

  async function deleteDraft(id, e) {
    e.stopPropagation();
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    try {
      await api.drafts.delete(id);
      setDrafts(prev => prev.filter(d => d.id !== id));
      setConfirmDelete(null);
    } catch (e) { setError(e.message); }
  }

  const BTN = {
    background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '.2rem .55rem', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)',
    transition: 'border-color .12s, color .12s', whiteSpace: 'nowrap',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Drafts</h1>
        <button onClick={load} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)', padding: '.2rem .4rem', borderRadius: 'var(--radius)' }} title="Refresh">↺</button>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
      {loading && <div className="loading">Loading…</div>}

      {!loading && drafts.length === 0 && !error && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-xmuted)', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: '.5rem', opacity: .2 }}>✎</div>
          No saved drafts
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {drafts.map(draft => (
          <div key={draft.id} onClick={() => openDraft(draft)} style={{
            padding: '.9rem 1.1rem', borderRadius: 'var(--radius)',
            border: '1.5px solid var(--border)', background: 'var(--surface)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem',
            transition: 'border-color .12s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: '.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {draft.subject || <span style={{ color: 'var(--text-xmuted)', fontStyle: 'italic' }}>No subject</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                To: {(draft.to_addresses || []).join(', ') || <span style={{ fontStyle: 'italic' }}>No recipients</span>}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-xmuted)', flexShrink: 0 }}>
              {fmtDateTime(draft.updated_at)}
            </div>
            <div style={{ display: 'flex', gap: '.35rem', flexShrink: 0 }}>
              {confirmDelete === draft.id ? (
                <>
                  <button onClick={e => deleteDraft(draft.id, e)} style={{ ...BTN, background: '#b04a3a', color: '#fff', borderColor: '#b04a3a' }}>Delete</button>
                  <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }} style={BTN}>Cancel</button>
                </>
              ) : (
                <button onClick={e => deleteDraft(draft.id, e)} style={{ ...BTN, color: '#b04a3a', borderColor: 'transparent' }}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
