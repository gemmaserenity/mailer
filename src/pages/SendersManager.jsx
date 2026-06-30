import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const EMPTY = { name: '', email: '', resend_api_key: '', domain: '', business_name: '', physical_address: '' };

function maskKey(key) {
  if (!key || key.length < 10) return key || '—';
  return key.slice(0, 7) + '••••••••••' + key.slice(-4);
}

export default function SendersManager() {
  const [senders, setSenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setSenders(await api.senders.list());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function field(key) { return e => setForm(f => ({ ...f, [key]: e.target.value })); }
  function editField(key) { return e => setEditForm(f => ({ ...f, [key]: e.target.value })); }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.resend_api_key) {
      setError('Name, email address, and Resend API key are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.senders.create(form);
      setForm(EMPTY);
      setShowForm(false);
      setSuccess('Sender added.');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function startEdit(sender) {
    setEditing(sender.id);
    setEditForm({
      name: sender.name || '',
      business_name: sender.business_name || '',
      physical_address: sender.physical_address || '',
    });
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    try {
      await api.senders.update(editing, editForm);
      setEditing(null);
      setSuccess('Sender updated.');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (e) { setError(e.message); }
    finally { setEditSaving(false); }
  }

  async function handleDelete(id, email) {
    if (!confirm(`Remove ${email}? Existing inbox messages will be preserved.`)) return;
    try {
      await api.senders.delete(id);
      setSenders(prev => prev.filter(s => s.id !== id));
    } catch (e) { setError(e.message); }
  }

  const LABEL = { fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-xmuted)', display: 'block', marginBottom: '.25rem' };

  return (
    <div>
      <div className="row-between mb-2">
        <h1 style={{ margin: 0 }}>Senders</h1>
        <button className="btn-primary" onClick={() => { setShowForm(s => !s); setError(null); }}>
          {showForm ? 'Cancel' : '+ Add Sender'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 1.5rem' }}>
        Each sender uses its own Resend API key. Physical address and business name appear in the CAN-SPAM footer of sequence emails.
      </p>

      {error && <div className="error-msg mb-2">{error}</div>}
      {success && <div className="success-msg mb-2">{success}</div>}

      {showForm && (
        <div className="card mb-2" style={{ borderLeft: '3px solid var(--accent)' }}>
          <h3 style={{ marginBottom: '1rem' }}>New Sender</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="form-row-grid">
              <div className="field">
                <label>Display Name</label>
                <input value={form.name} onChange={field('name')} placeholder="Gemma Serenity" />
              </div>
              <div className="field">
                <label>Email Address</label>
                <input type="email" value={form.email} onChange={field('email')} placeholder="hello@gemmaserenity.com" />
              </div>
              <div className="field">
                <label>Resend API Key</label>
                <input type="password" value={form.resend_api_key} onChange={field('resend_api_key')} placeholder="re_xxxxxxxxxxxxxxxxxxxx" autoComplete="new-password" />
              </div>
              <div className="field">
                <label>Receiving Domain</label>
                <input value={form.domain} onChange={field('domain')} placeholder="gemmaserenity.com" />
              </div>
              <div className="field">
                <label>Business Name <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>(CAN-SPAM footer)</span></label>
                <input value={form.business_name} onChange={field('business_name')} placeholder="Gemma Serenity LLC" />
              </div>
              <div className="field">
                <label>Physical Address <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>(required by CAN-SPAM)</span></label>
                <input value={form.physical_address} onChange={field('physical_address')} placeholder="123 Main St, City, State 00000" />
              </div>
            </div>
            <div className="row mt-1">
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add Sender'}</button>
              <button type="button" className="btn-ghost" onClick={() => { setShowForm(false); setForm(EMPTY); setError(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="loading">Loading senders…</div>}

      {!loading && senders.length === 0 && (
        <div className="empty">
          No senders configured yet.<br />
          <button className="btn-primary mt-2" onClick={() => setShowForm(true)}>Add your first sender</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {senders.map(sender => (
          <div key={sender.id} className="card">
            {editing === sender.id ? (
              <form onSubmit={handleEdit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }} className="form-row-grid">
                  <div>
                    <label style={LABEL}>Display Name</label>
                    <input value={editForm.name} onChange={editField('name')} />
                  </div>
                  <div>
                    <label style={LABEL}>Business Name</label>
                    <input value={editForm.business_name} onChange={editField('business_name')} placeholder="Gemma Serenity LLC" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={LABEL}>Physical Address <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>(shown in email footer — required by CAN-SPAM)</span></label>
                    <input value={editForm.physical_address} onChange={editField('physical_address')} placeholder="123 Main St, City, State 00000" />
                  </div>
                </div>
                <div className="row">
                  <button type="submit" className="btn-primary btn-sm" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save'}</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                  background: 'var(--surface-2)', border: '1.5px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--text)',
                }}>
                  {(sender.name || sender.email || '?')[0].toUpperCase()}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ marginBottom: '.2rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{sender.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{sender.email}</span>
                    {sender.active !== false && <span className="badge badge-active">Active</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: 12, color: 'var(--text-xmuted)', flexWrap: 'wrap' }}>
                    {sender.domain && <span>Domain: {sender.domain}</span>}
                    <span>
                      Key: {revealed[sender.id] ? sender.resend_api_key : maskKey(sender.resend_api_key)}
                      <button onClick={() => setRevealed(r => ({ ...r, [sender.id]: !r[sender.id] }))} style={{ background: 'none', border: 'none', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)', padding: '0 .3rem', marginLeft: '.2rem' }}>
                        {revealed[sender.id] ? 'hide' : 'reveal'}
                      </button>
                    </span>
                  </div>
                  {(sender.business_name || sender.physical_address) && (
                    <div style={{ marginTop: '.4rem', fontSize: 12, color: 'var(--text-xmuted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {sender.business_name && <span>🏢 {sender.business_name}</span>}
                      {sender.physical_address && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                          <span style={{ color: 'var(--success)', fontSize: 11, fontWeight: 700 }}>✓ CAN-SPAM</span>
                          {sender.physical_address}
                        </span>
                      )}
                    </div>
                  )}
                  {!sender.physical_address && (
                    <div style={{ marginTop: '.35rem', fontSize: 11, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                      ⚠ Physical address missing — required for CAN-SPAM compliance in sequence emails
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '.4rem', flexShrink: 0 }}>
                  <button className="btn-ghost btn-sm" onClick={() => startEdit(sender)}>Edit</button>
                  <button className="btn-ghost btn-sm" onClick={() => handleDelete(sender.id, sender.email)}>Remove</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {senders.length > 0 && (
        <div style={{ marginTop: '2rem', padding: '1rem 1.25rem', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>Webhook setup</strong><br />
          For each domain, point the Resend inbound webhook to:<br />
          <code style={{ fontFamily: 'Courier New, monospace', background: 'var(--surface)', padding: '.1rem .4rem', borderRadius: 4, fontSize: 12 }}>
            {import.meta.env.VITE_WORKER_URL || 'https://mailer-worker.gemma-serenity.workers.dev'}/inbox/webhook
          </code>
        </div>
      )}
    </div>
  );
}
