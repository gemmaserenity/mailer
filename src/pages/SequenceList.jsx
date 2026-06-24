import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, sequenceColor, fmtDate } from '../lib/api.js';

export default function SequenceList() {
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      setSequences(await api.sequences.list());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleArchive(e, id) {
    e.stopPropagation();
    if (!confirm('Archive this sequence?')) return;
    await api.sequences.update(id, { status: 'archived' });
    load();
  }

  const visible = sequences.filter(s => s.status !== 'archived');
  const archived = sequences.filter(s => s.status === 'archived');

  if (loading) return <div className="loading">Loading sequences…</div>;

  return (
    <div>
      <div className="row-between mb-2">
        <h1 style={{ margin: 0 }}>Sequences</h1>
        <button className="btn-primary" onClick={() => navigate('/sequences/new')}>+ New Sequence</button>
      </div>

      {error && <div className="error-msg mb-2">{error}</div>}

      {visible.length === 0 && (
        <div className="empty">
          No sequences yet.<br />
          <button className="btn-primary mt-2" onClick={() => navigate('/sequences/new')}>Create your first sequence</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {visible.map((seq, i) => (
          <div
            key={seq.id}
            className="card"
            onClick={() => navigate(`/sequences/${seq.id}`)}
            style={{
              cursor: 'pointer',
              borderLeft: `4px solid ${sequenceColor(i)}`,
              transition: 'box-shadow .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
          >
            <div className="row-between">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ marginBottom: '.35rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{seq.name}</h3>
                  <span className={`badge badge-${seq.status}`}>{seq.status}</span>
                </div>
                {seq.description && (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px', marginBottom: '.5rem' }}>
                    {seq.description}
                  </p>
                )}
                <div className="row text-sm text-muted" style={{ gap: '1.25rem' }}>
                  <span>{seq.step_count ?? 0} step{seq.step_count !== 1 ? 's' : ''}</span>
                  <span>{seq.active_enrollments ?? 0} active</span>
                  <span>from: {seq.from_name}</span>
                  <span>created {fmtDate(seq.created_at)}</span>
                </div>
              </div>
              <div className="row" style={{ gap: '.5rem', flexShrink: 0, marginLeft: '1rem' }}>
                <button
                  className="btn-ghost btn-sm"
                  onClick={e => { e.stopPropagation(); navigate(`/enrollments?sequence_id=${seq.id}`); }}
                >
                  Enrollments
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={e => handleArchive(e, seq.id)}
                  title="Archive sequence"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <details style={{ marginTop: '2rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', userSelect: 'none' }}>
            {archived.length} archived sequence{archived.length !== 1 ? 's' : ''}
          </summary>
          <div style={{ marginTop: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {archived.map(seq => (
              <div key={seq.id} className="card" style={{ opacity: .65 }}>
                <div className="row-between">
                  <div>
                    <span style={{ fontWeight: 500 }}>{seq.name}</span>
                    <span className="badge badge-archived" style={{ marginLeft: '.5rem' }}>Archived</span>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={() => navigate(`/sequences/${seq.id}`)}>View</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
