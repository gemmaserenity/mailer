import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, stepIcon, fmtDate } from '../lib/api.js';

const STEP_COLORS = { email: '#e3f2fd', wait: '#fff8e1', branch: '#f3e5f5' };
const STEP_COLORS_BORDER = { email: '#90caf9', wait: '#ffe082', branch: '#ce93d8' };

// ---- Step Edit Modal ----
function StepModal({ step, templates, onSave, onClose }) {
  const isNew = !step.id;
  const [form, setForm] = useState({
    type: step.type || 'email',
    label: step.label || '',
    template_id: step.template_id || '',
    wait_duration_hours: step.wait_duration_hours || 24,
    branch_conditions: step.branch_conditions || { rules: [] },
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function addRule() {
    set('branch_conditions', {
      ...form.branch_conditions,
      rules: [...form.branch_conditions.rules, { id: crypto.randomUUID(), condition: 'opened', action: 'continue', label: '' }],
    });
  }

  function updateRule(idx, key, val) {
    const rules = [...form.branch_conditions.rules];
    rules[idx] = { ...rules[idx], [key]: val };
    set('branch_conditions', { ...form.branch_conditions, rules });
  }

  function removeRule(idx) {
    const rules = form.branch_conditions.rules.filter((_, i) => i !== idx);
    set('branch_conditions', { ...form.branch_conditions, rules });
  }

  async function handleSave() {
    setErr(null);
    setSaving(true);
    try { await onSave(form); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  const waitHours = form.wait_duration_hours || 0;
  const waitLabel = waitHours >= 24
    ? `${(waitHours / 24).toFixed(waitHours % 24 === 0 ? 0 : 1)} day${waitHours / 24 !== 1 ? 's' : ''}`
    : `${waitHours} hour${waitHours !== 1 ? 's' : ''}`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', margin: '1rem' }}>
        <div className="row-between mb-2">
          <h3 style={{ margin: 0 }}>{isNew ? 'Add Step' : 'Edit Step'}</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {err && <div className="error-msg mb-2">{err}</div>}

        <div className="field">
          <label>Step Type</label>
          <select value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="email">✉ Email — send an email</option>
            <option value="wait">⏱ Wait — pause before next step</option>
            <option value="branch">⑂ Branch — route based on behavior</option>
          </select>
        </div>

        <div className="field">
          <label>Label (optional)</label>
          <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Day 3 Follow-Up" />
        </div>

        {form.type === 'email' && (
          <div className="field">
            <label>Template</label>
            <select value={form.template_id} onChange={e => set('template_id', e.target.value)}>
              <option value="">— pick a template —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} — "{t.subject}"</option>
              ))}
            </select>
            <p className="text-sm text-muted mt-1">
              Templates are managed separately. <a href="/templates/new" target="_blank">Create a template →</a>
            </p>
          </div>
        )}

        {form.type === 'wait' && (
          <div className="field">
            <label>Wait Duration</label>
            <div className="row">
              <input
                type="number"
                value={form.wait_duration_hours}
                min={1}
                onChange={e => set('wait_duration_hours', parseInt(e.target.value, 10) || 1)}
                style={{ width: 90, flexShrink: 0 }}
              />
              <span style={{ color: 'var(--text-muted)' }}>hours = {waitLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
              {[[24,'1d'],[48,'2d'],[72,'3d'],[120,'5d'],[168,'1wk']].map(([h, l]) => (
                <button key={h} className="btn-ghost btn-sm" onClick={() => set('wait_duration_hours', h)}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {form.type === 'branch' && (
          <div className="field">
            <div className="row-between mb-1">
              <label style={{ marginBottom: 0 }}>Routing Rules</label>
              <button className="btn-ghost btn-sm" onClick={addRule}>+ Add Rule</button>
            </div>
            <p className="text-sm text-muted mb-1">Rules are evaluated top to bottom; first match wins.</p>
            {form.branch_conditions.rules.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '.5rem 0' }}>
                No rules — click "+ Add Rule" to define routing behavior.
              </div>
            )}
            {form.branch_conditions.rules.map((rule, idx) => (
              <div key={rule.id} className="card" style={{ marginBottom: '.5rem', padding: '.75rem' }}>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label>If recipient has…</label>
                      <select value={rule.condition} onChange={e => updateRule(idx, 'condition', e.target.value)}>
                        <option value="opened">Opened any email</option>
                        <option value="not_opened">NOT opened any email</option>
                        <option value="clicked">Clicked a link</option>
                        <option value="not_clicked">NOT clicked a link</option>
                        <option value="bounced">Bounced</option>
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label>Then…</label>
                      <select value={rule.action} onChange={e => updateRule(idx, 'action', e.target.value)}>
                        <option value="continue">Continue sequence</option>
                        <option value="exit">Exit sequence</option>
                        <option value="tag:hot-lead">Apply tag: hot-lead</option>
                        <option value="tag:not-engaged">Apply tag: not-engaged</option>
                        <option value="tag:custom">Apply custom tag…</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn-ghost btn-sm" style={{ marginTop: '1.45rem', flexShrink: 0 }} onClick={() => removeRule(idx)}>✕</button>
                </div>
                {rule.action === 'tag:custom' && (
                  <div className="field" style={{ marginTop: '.5rem', marginBottom: 0 }}>
                    <label>Custom tag name</label>
                    <input
                      value={rule.customTag || ''}
                      onChange={e => updateRule(idx, 'action', `tag:${e.target.value}`)}
                      placeholder="e.g. warm-lead"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <hr className="divider" />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add Step' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Enroll Modal ----
function EnrollModal({ sequenceId, onClose, onEnrolled }) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) return;
    setSaving(true);
    setErr(null);
    try {
      await api.enrollments.create({
        sequence_id: sequenceId,
        recipient_email: email,
        recipient_data: { first_name: firstName, last_name: lastName, company },
      });
      onEnrolled();
    } catch (e2) { setErr(e2.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 440, margin: '1rem' }}>
        <div className="row-between mb-2">
          <h3 style={{ margin: 0 }}>Enroll Recipient</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {err && <div className="error-msg mb-2">{err}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>First Name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Gemma" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Last Name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Serenity" />
            </div>
          </div>
          <div className="field">
            <label>Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="PRS" />
          </div>
          <hr className="divider" />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || !email}>
              {saving ? 'Enrolling…' : 'Enroll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Timeline Step Card ----
function TimelineStep({ step, index, total, onEdit, onDelete, onMoveUp, onMoveDown }) {
  const bg = STEP_COLORS[step.type] || '#f5f5f5';
  const border = STEP_COLORS_BORDER[step.type] || '#ccc';

  const hours = step.wait_duration_hours || 0;
  const waitLabel = hours >= 24
    ? `${hours / 24} day${hours / 24 !== 1 ? 's' : ''}`
    : `${hours} hour${hours !== 1 ? 's' : ''}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Connector line */}
      {index > 0 && (
        <div style={{ width: 2, height: 24, background: 'var(--border)', flexShrink: 0 }} />
      )}

      {/* Step card */}
      <div style={{
        width: '100%',
        maxWidth: 540,
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 'var(--radius-lg)',
        padding: '.85rem 1rem',
        position: 'relative',
      }}>
        {/* Type badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem' }}>
          <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>
            {stepIcon(step.type)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>
              {step.type === 'email' && (step.label || step.mailer_templates?.name || 'Email')}
              {step.type === 'wait' && (step.label || `Wait ${waitLabel}`)}
              {step.type === 'branch' && (step.label || 'Branch')}
            </div>
            {step.type === 'email' && step.mailer_templates && (
              <div className="text-sm text-muted" style={{ marginTop: '.2rem' }}>
                Subject: "{step.mailer_templates.subject}"
              </div>
            )}
            {step.type === 'email' && !step.mailer_templates && (
              <div className="text-sm" style={{ color: 'var(--danger)', marginTop: '.2rem' }}>
                ⚠ No template assigned
              </div>
            )}
            {step.type === 'wait' && step.label && (
              <div className="text-sm text-muted" style={{ marginTop: '.2rem' }}>
                Pause for {waitLabel}
              </div>
            )}
            {step.type === 'branch' && step.branch_conditions?.rules?.length > 0 && (
              <div style={{ marginTop: '.4rem', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                {step.branch_conditions.rules.map((r, i) => (
                  <div key={i} className="text-sm text-muted">
                    If {r.condition.replace(/_/g, ' ')} → {r.action.replace(/_/g, ' ')}
                  </div>
                ))}
              </div>
            )}
            {step.type === 'branch' && !step.branch_conditions?.rules?.length && (
              <div className="text-sm text-muted" style={{ marginTop: '.2rem' }}>No rules configured</div>
            )}
          </div>
          <div className="row" style={{ gap: '.35rem', flexShrink: 0 }}>
            {index > 0 && (
              <button className="btn-ghost btn-sm" onClick={onMoveUp} title="Move up">↑</button>
            )}
            {index < total - 1 && (
              <button className="btn-ghost btn-sm" onClick={onMoveDown} title="Move down">↓</button>
            )}
            <button className="btn-ghost btn-sm" onClick={onEdit}>Edit</button>
            <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>✕</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function SequenceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [seq, setSeq] = useState({ name: '', description: '', status: 'draft', from_name: 'Gemma Serenity', from_email: 'gemma@prs.gemmaserenity.com' });
  const [steps, setSteps] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [editingStep, setEditingStep] = useState(null); // null = closed, {} = new, step = edit
  const [enrollModal, setEnrollModal] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [seqData, tmplData] = await Promise.all([
        isNew ? null : api.sequences.get(id),
        api.templates.list(),
      ]);
      if (seqData) {
        setSeq({
          name: seqData.name,
          description: seqData.description || '',
          status: seqData.status,
          from_name: seqData.from_name,
          from_email: seqData.from_email,
        });
        setSteps(seqData.steps || []);
      }
      setTemplates(tmplData || []);
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSaveSeq(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await api.sequences.create(seq);
        navigate(`/sequences/${created.id}`, { replace: true });
      } else {
        await api.sequences.update(id, seq);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (e2) { setError(e2.message); }
    finally { setSaving(false); }
  }

  async function handleSaveStep(form) {
    if (editingStep.id) {
      // Update existing
      const updated = await api.steps.update(editingStep.id, form);
      setSteps(ss => ss.map(s => s.id === editingStep.id ? { ...s, ...updated } : s));
    } else {
      // Create new
      const created = await api.steps.create(id, form);
      // Reload full step with template join
      const all = await api.steps.list(id);
      setSteps(all);
    }
    setEditingStep(null);
  }

  async function handleDeleteStep(stepId) {
    if (!confirm('Delete this step?')) return;
    await api.steps.delete(stepId);
    setSteps(ss => ss.filter(s => s.id !== stepId));
  }

  async function moveStep(index, direction) {
    const newSteps = [...steps];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newSteps.length) return;
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    // Renumber orders
    const reordered = newSteps.map((s, i) => ({ ...s, step_order: i + 1 }));
    setSteps(reordered);
    await api.steps.reorder(id, reordered.map(s => ({ id: s.id, step_order: s.step_order })));
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Back */}
      <button className="btn-ghost btn-sm mb-2" onClick={() => navigate('/sequences')} style={{ marginBottom: '1rem' }}>
        ← All Sequences
      </button>

      {error && <div className="error-msg mb-2">{error}</div>}
      {saved && <div className="success-msg mb-2">Saved ✓</div>}

      {/* Sequence metadata */}
      <div className="card mb-2" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSaveSeq}>
          <div className="row-between mb-2">
            <h2 style={{ margin: 0 }}>{isNew ? 'New Sequence' : 'Sequence Settings'}</h2>
            <div className="row">
              {!isNew && (
                <select
                  value={seq.status}
                  onChange={e => setSeq(s => ({ ...s, status: e.target.value }))}
                  style={{ width: 'auto' }}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              )}
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Create Sequence' : 'Save'}
              </button>
            </div>
          </div>

          <div className="field">
            <label>Sequence Name *</label>
            <input value={seq.name} onChange={e => setSeq(s => ({ ...s, name: e.target.value }))} required placeholder="e.g. Revenue Audit Pre-Warm" />
          </div>

          <div className="field">
            <label>Description</label>
            <input value={seq.description || ''} onChange={e => setSeq(s => ({ ...s, description: e.target.value }))} placeholder="What does this sequence do?" />
          </div>

          <div className="row form-row">
            <div className="field" style={{ flex: 1 }}>
              <label>From Name</label>
              <input value={seq.from_name || ''} onChange={e => setSeq(s => ({ ...s, from_name: e.target.value }))} placeholder="Gemma Serenity" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>From Email</label>
              <input type="email" value={seq.from_email || ''} onChange={e => setSeq(s => ({ ...s, from_email: e.target.value }))} placeholder="gemma@prs.gemmaserenity.com" />
            </div>
          </div>
        </form>
      </div>

      {/* Steps — only show after sequence is created */}
      {!isNew && (
        <div>
          <div className="row-between mb-2">
            <h2 style={{ margin: 0 }}>Steps</h2>
            <div className="row">
              <button className="btn-ghost btn-sm" onClick={() => navigate(`/enrollments?sequence_id=${id}`)}>
                View Enrollments
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setEnrollModal(true)}>
                + Enroll Recipient
              </button>
              <button className="btn-primary btn-sm" onClick={() => setEditingStep({})}>
                + Add Step
              </button>
            </div>
          </div>

          {steps.length === 0 ? (
            <div className="empty">
              No steps yet — add an email, wait, or branch step to build your sequence.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {steps.map((step, i) => (
                <TimelineStep
                  key={step.id}
                  step={step}
                  index={i}
                  total={steps.length}
                  onEdit={() => setEditingStep(step)}
                  onDelete={() => handleDeleteStep(step.id)}
                  onMoveUp={() => moveStep(i, -1)}
                  onMoveDown={() => moveStep(i, 1)}
                />
              ))}
              {/* End cap */}
              <div style={{ width: 2, height: 24, background: 'var(--border)' }} />
              <div style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 99, padding: '.3rem .9rem', fontSize: '13px', color: 'var(--text-muted)' }}>
                ✓ Sequence Complete
              </div>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button className="btn-ghost" onClick={() => setEditingStep({})}>
              + Add Step
            </button>
          </div>
        </div>
      )}

      {/* Step edit modal */}
      {editingStep !== null && (
        <StepModal
          step={editingStep}
          templates={templates}
          onSave={handleSaveStep}
          onClose={() => setEditingStep(null)}
        />
      )}

      {/* Enroll modal */}
      {enrollModal && (
        <EnrollModal
          sequenceId={id}
          onClose={() => setEnrollModal(false)}
          onEnrolled={() => { setEnrollModal(false); navigate(`/enrollments?sequence_id=${id}`); }}
        />
      )}
    </div>
  );
}
