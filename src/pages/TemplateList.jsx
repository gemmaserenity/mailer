import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../lib/api.js';

export default function TemplateList() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      setTemplates(await api.templates.list());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await api.templates.delete(id);
      load();
    } catch (e2) { alert(e2.message); }
  }

  if (loading) return <div className="loading">Loading templates…</div>;

  return (
    <div>
      <div className="row-between mb-2">
        <h1 style={{ margin: 0 }}>Templates</h1>
        <button className="btn-primary" onClick={() => navigate('/templates/new')}>+ New Template</button>
      </div>

      {error && <div className="error-msg mb-2">{error}</div>}

      {templates.length === 0 && (
        <div className="empty">
          No templates yet.<br />
          <button className="btn-primary mt-2" onClick={() => navigate('/templates/new')}>Create your first template</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {templates.map(t => (
          <div
            key={t.id}
            className="card"
            onClick={() => navigate(`/templates/${t.id}`)}
            style={{ cursor: 'pointer', transition: 'box-shadow .15s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
          >
            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '.35rem' }}>{t.name}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '.5rem', fontStyle: 'italic' }}>
              "{t.subject}"
            </div>
            <div className="row-between">
              <div className="text-sm text-muted">
                v{t.version} · updated {fmtDate(t.updated_at)}
              </div>
              <button
                className="btn-ghost btn-sm"
                style={{ color: 'var(--danger)' }}
                onClick={e => handleDelete(e, t.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
