import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Georgia, serif; font-size: 17px; line-height: 1.7; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #fafaf8; }
  h1 { font-size: 28px; margin-bottom: 16px; }
  p { margin: 0 0 18px; }
  a { color: #1a1a1a; }
  .signature { margin-top: 40px; font-style: italic; }
</style>
</head>
<body>
  <h1>Hello, {{first_name}}</h1>
  <p>Your message here.</p>
  <div class="signature">
    — Gemma
  </div>
</body>
</html>`;

function mergePreview(html, vars) {
  if (!html || !vars) return html || '';
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    vars[key] !== undefined ? String(vars[key]) : match
  );
}

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [form, setForm] = useState({
    name: '',
    subject: '',
    html_body: DEFAULT_HTML,
    plain_text_body: '',
    variables: { first_name: 'Gemma', last_name: 'Serenity', company: 'PRS' },
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [previewMode, setPreviewMode] = useState('desktop'); // desktop | mobile
  const [previewVars, setPreviewVars] = useState(true);
  const [tab, setTab] = useState('html'); // html | plain | vars
  const iframeRef = useRef(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function load() {
    if (isNew) return;
    setLoading(true);
    try {
      const t = await api.templates.get(id);
      setForm({
        name: t.name,
        subject: t.subject,
        html_body: t.html_body,
        plain_text_body: t.plain_text_body || '',
        variables: t.variables || { first_name: 'Gemma', last_name: 'Serenity', company: 'PRS' },
      });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  // Sync preview iframe whenever html or vars change
  const updatePreview = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const html = previewVars ? mergePreview(form.html_body, form.variables) : form.html_body;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [form.html_body, form.variables, previewVars]);

  useEffect(() => { updatePreview(); }, [updatePreview]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await api.templates.create(form);
        navigate(`/templates/${created.id}`, { replace: true });
      } else {
        await api.templates.update(id, form);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (e2) { setError(e2.message); }
    finally { setSaving(false); }
  }

  function updateVar(key, val) {
    setForm(f => ({ ...f, variables: { ...f.variables, [key]: val } }));
  }

  function addVar() {
    const key = prompt('Variable name (e.g. company):');
    if (!key) return;
    updateVar(key.trim(), '');
  }

  function removeVar(key) {
    const vars = { ...form.variables };
    delete vars[key];
    setForm(f => ({ ...f, variables: vars }));
  }

  if (loading) return <div className="loading">Loading template…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="row-between mb-2" style={{ flexShrink: 0 }}>
        <div className="row">
          <button className="btn-ghost btn-sm" onClick={() => navigate('/templates')}>← Templates</button>
          <h2 style={{ margin: 0 }}>{isNew ? 'New Template' : form.name || 'Edit Template'}</h2>
        </div>
        <div className="row">
          {saved && <span className="text-sm" style={{ color: 'var(--success)' }}>Saved ✓</span>}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create Template' : `Save (v${form.version ? form.version + 1 : 1})`}
          </button>
        </div>
      </div>

      {error && <div className="error-msg mb-2">{error}</div>}

      {/* Name + Subject */}
      <div className="card mb-2" style={{ flexShrink: 0, padding: '1rem' }}>
        <div className="row form-row">
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Template Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Day 3 Nurture" required />
          </div>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label>Subject Line</label>
            <input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="e.g. Your revenue audit is scheduled, {{first_name}}" required />
          </div>
        </div>
      </div>

      {/* Split editor */}
      <div className="split-pane" style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, alignItems: 'flex-start' }}>
        {/* Left: Editor */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '1rem' }}>
          {/* Tabs */}
          <div className="row" style={{ gap: '.25rem', marginBottom: '.75rem', borderBottom: '1.5px solid var(--border)', paddingBottom: '.5rem' }}>
            {[['html','HTML Body'],['plain','Plain Text'],['vars','Variables']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  background: tab === key ? 'var(--accent)' : 'transparent',
                  color: tab === key ? 'var(--bg)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  padding: '.3rem .75rem',
                  fontSize: '13px',
                  fontWeight: tab === key ? 600 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'html' && (
            <textarea
              className="html-editor"
              value={form.html_body}
              onChange={e => set('html_body', e.target.value)}
              style={{ flex: 1, resize: 'none', minHeight: 400 }}
              spellCheck={false}
            />
          )}

          {tab === 'plain' && (
            <div>
              <p className="text-sm text-muted mb-1">
                Plain-text fallback. Supports the same <code>{'{{variable}}'}</code> syntax.
              </p>
              <textarea
                value={form.plain_text_body}
                onChange={e => set('plain_text_body', e.target.value)}
                style={{ minHeight: 300, resize: 'vertical' }}
                placeholder="Plain text version of the email..."
              />
            </div>
          )}

          {tab === 'vars' && (
            <div>
              <div className="row-between mb-1">
                <p className="text-sm text-muted" style={{ margin: 0 }}>
                  Sample values substituted in the preview. Use <code>{'{{variable_name}}'}</code> in your HTML.
                </p>
                <button className="btn-ghost btn-sm" onClick={addVar}>+ Add Variable</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.5rem' }}>
                {Object.entries(form.variables).map(([key, val]) => (
                  <div key={key} className="row">
                    <code style={{ width: 120, flexShrink: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                      {'{{' + key + '}}'}
                    </code>
                    <input
                      value={val}
                      onChange={e => updateVar(key, e.target.value)}
                      placeholder={`Sample value for ${key}`}
                    />
                    <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)', flexShrink: 0 }} onClick={() => removeVar(key)}>✕</button>
                  </div>
                ))}
                {Object.keys(form.variables).length === 0 && (
                  <div className="empty" style={{ padding: '1rem' }}>No variables defined</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', minHeight: 0 }}>
          <div className="row-between mb-1" style={{ flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Preview</span>
            <div className="row" style={{ gap: '.4rem' }}>
              <button
                onClick={() => setPreviewVars(v => !v)}
                className="btn-ghost btn-sm"
                title="Toggle variable substitution"
              >
                {previewVars ? '{{·}}' : '{·}'}
              </button>
              <button
                onClick={() => setPreviewMode('desktop')}
                className={previewMode === 'desktop' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
              >
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={previewMode === 'mobile' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
              >
                Mobile
              </button>
            </div>
          </div>

          {/* Subject preview */}
          <div style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '.4rem .75rem', fontSize: '13px', marginBottom: '.75rem', flexShrink: 0 }}>
            <span style={{ color: 'var(--text-muted)', marginRight: '.4rem' }}>Subject:</span>
            {previewVars ? mergePreview(form.subject, form.variables) : form.subject}
          </div>

          {/* Email iframe */}
          <div style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            minHeight: 400,
          }}>
            <iframe
              ref={iframeRef}
              sandbox="allow-same-origin"
              style={{
                width: previewMode === 'mobile' ? 390 : '100%',
                height: '100%',
                border: 'none',
                background: '#fff',
                minHeight: 400,
              }}
              title="Email preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
