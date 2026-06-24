import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, statusBadge, fmtDateTime, fmtDate, stepIcon } from '../lib/api.js';

const STATUSES = ['', 'active', 'paused', 'completed', 'exited', 'bounced', 'unsubscribed'];

function EventTimeline({ enrollmentId, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.enrollments.events(enrollmentId)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enrollmentId]);

  const EVENT_ICONS = {
    sent: '✉', delivered: '✓', opened: '👁', clicked: '🔗',
    bounced: '✕', replied: '↩', unsubscribed: '🚫', complained: '⚑',
    send_failed: '⚠',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '75vh', overflowY: 'auto', margin: '1rem' }}>
        <div className="row-between mb-2">
          <h3 style={{ margin: 0 }}>Event History</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {loading && <div className="loading">Loading events…</div>}
        {!loading && events.length === 0 && <div className="empty">No events recorded yet</div>}
        {!loading && events.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {events.map((ev, i) => (
              <div key={ev.id} style={{ display: 'flex', gap: '.75rem', paddingBottom: '.75rem', position: 'relative' }}>
                {i < events.length - 1 && (
                  <div style={{ position: 'absolute', left: 15, top: 28, bottom: 0, width: 1, background: 'var(--border)' }} />
                )}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: ev.event_type === 'bounced' || ev.event_type === 'complained' ? 'var(--danger-bg)' :
                               ev.event_type === 'opened' || ev.event_type === 'clicked' ? 'var(--success-bg)' : 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', flexShrink: 0, border: '1.5px solid var(--border)',
                }}>
                  {EVENT_ICONS[ev.event_type] || '•'}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '14px' }}>{statusBadge(ev.event_type)}</div>
                  {ev.mailer_steps && (
                    <div className="text-sm text-muted">
                      {stepIcon(ev.mailer_steps.type)} Step {ev.mailer_steps.step_order}
                      {ev.mailer_steps.label ? ` — ${ev.mailer_steps.label}` : ''}
                    </div>
                  )}
                  <div className="text-sm text-muted">{fmtDateTime(ev.occurred_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EnrollmentMonitor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [enrollments, setEnrollments] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const seqFilter = searchParams.get('sequence_id') || '';
  const statusFilter = searchParams.get('status') || '';

  async function load() {
    setLoading(true);
    try {
      const [enrData, seqData] = await Promise.all([
        api.enrollments.list({ sequence_id: seqFilter || undefined, status: statusFilter || undefined }),
        api.sequences.list(),
      ]);
      setEnrollments(enrData || []);
      setSequences(seqData || []);
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [seqFilter, statusFilter]);

  function setFilter(key, val) {
    const p = new URLSearchParams(searchParams);
    if (val) p.set(key, val); else p.delete(key);
    setSearchParams(p);
  }

  async function doAction(id, action) {
    setActionLoading(id);
    try {
      if (action === 'pause') await api.enrollments.pause(id);
      else if (action === 'resume') await api.enrollments.resume(id);
      else if (action === 'exit') await api.enrollments.exit(id);
      load();
    } catch (e2) { alert(e2.message); }
    finally { setActionLoading(null); }
  }

  const STATUS_COLORS = {
    active: 'var(--success)', completed: 'var(--text-muted)', paused: 'var(--warning)',
    exited: 'var(--text-xmuted)', bounced: 'var(--danger)', unsubscribed: 'var(--danger)',
  };

  return (
    <div>
      <div className="row-between mb-2">
        <h1 style={{ margin: 0 }}>Enrollments</h1>
        <button className="btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {/* Filters */}
      <div className="card mb-2" style={{ padding: '.75rem 1rem' }}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Sequence</label>
            <select value={seqFilter} onChange={e => setFilter('sequence_id', e.target.value)}>
              <option value="">All sequences</option>
              {sequences.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={e => setFilter('status', e.target.value)}>
              {STATUSES.map(s => (
                <option key={s} value={s}>{s ? statusBadge(s) : 'All statuses'}</option>
              ))}
            </select>
          </div>
          {(seqFilter || statusFilter) && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn-ghost btn-sm" onClick={() => setSearchParams({})}>Clear filters</button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-msg mb-2">{error}</div>}

      {loading ? (
        <div className="loading">Loading enrollments…</div>
      ) : enrollments.length === 0 ? (
        <div className="empty">No enrollments found for these filters.</div>
      ) : (
        <div className="table-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                {['Recipient', 'Sequence', 'Current Step', 'Status', 'Enrolled', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '.5rem .75rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '12px', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enrollments.map(e => (
                <tr
                  key={e.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '.6rem .75rem' }}>
                    <div style={{ fontWeight: 500 }}>{e.recipient_email}</div>
                    {e.recipient_data?.first_name && (
                      <div className="text-sm text-muted">
                        {e.recipient_data.first_name} {e.recipient_data.last_name || ''}
                        {e.recipient_data.company ? ` · ${e.recipient_data.company}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '.6rem .75rem' }}>
                    {e.mailer_sequences?.name ? (
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => navigate(`/sequences/${e.sequence_id}`)}
                        style={{ fontSize: '13px' }}
                      >
                        {e.mailer_sequences.name}
                      </button>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '.6rem .75rem' }}>
                    {e.mailer_steps ? (
                      <span>
                        {stepIcon(e.mailer_steps.type)}{' '}
                        Step {e.mailer_steps.step_order}
                        {e.mailer_steps.label ? ` — ${e.mailer_steps.label}` : ''}
                      </span>
                    ) : e.status === 'completed' ? '✓ Done' : '—'}
                  </td>
                  <td style={{ padding: '.6rem .75rem' }}>
                    <span className={`badge badge-${e.status}`} style={{ color: STATUS_COLORS[e.status] }}>
                      {statusBadge(e.status)}
                    </span>
                  </td>
                  <td style={{ padding: '.6rem .75rem', color: 'var(--text-muted)' }}>
                    {fmtDate(e.enrolled_at)}
                  </td>
                  <td style={{ padding: '.6rem .75rem' }}>
                    <div className="row" style={{ gap: '.3rem', flexWrap: 'nowrap' }}>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setSelectedId(e.id)}
                      >
                        Events
                      </button>
                      {e.status === 'active' && (
                        <button
                          className="btn-ghost btn-sm"
                          disabled={actionLoading === e.id}
                          onClick={() => doAction(e.id, 'pause')}
                        >
                          Pause
                        </button>
                      )}
                      {e.status === 'paused' && (
                        <button
                          className="btn-ghost btn-sm"
                          disabled={actionLoading === e.id}
                          onClick={() => doAction(e.id, 'resume')}
                        >
                          Resume
                        </button>
                      )}
                      {(e.status === 'active' || e.status === 'paused') && (
                        <button
                          className="btn-ghost btn-sm"
                          style={{ color: 'var(--danger)' }}
                          disabled={actionLoading === e.id}
                          onClick={() => { if (confirm(`Exit ${e.recipient_email} from this sequence?`)) doAction(e.id, 'exit'); }}
                        >
                          Exit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {enrollments.length === 50 && (
        <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '13px' }}>
          Showing first 50 results — use filters to narrow down.
        </div>
      )}

      {selectedId && (
        <EventTimeline
          enrollmentId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
