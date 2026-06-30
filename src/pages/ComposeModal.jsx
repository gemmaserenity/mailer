import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api.js';

function AiWritePanel({ subject, fromName, mode, onAccept, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState(null);
  const taRef = useRef(null);

  useEffect(() => { taRef.current?.focus(); }, []);

  async function generate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setPreview('');
    try {
      const res = await api.ai.write({ prompt: prompt.trim(), subject, from_name: fromName, mode });
      setPreview(res.body || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
  }

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1.5px solid var(--accent)',
      borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '.75rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', letterSpacing: '.04em' }}>✦ AI WRITING</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '.1rem .3rem', lineHeight: 1 }}>✕</button>
      </div>

      <textarea
        ref={taRef}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={handleKey}
        placeholder={'Describe what this email should say…\ne.g. "Follow-up on our coaching call last week, warm tone, remind her about the free resource I mentioned"'}
        rows={3}
        style={{ ...FIELD, resize: 'vertical', marginBottom: '.5rem', fontSize: 13 }}
      />

      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
        <button
          onClick={generate}
          disabled={generating || !prompt.trim()}
          className="btn-primary"
          style={{ fontSize: 13, padding: '.3rem .8rem' }}
        >
          {generating ? '✦ Generating…' : '✦ Generate'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-xmuted)' }}>⌘↵ to generate</span>
      </div>

      {error && (
        <div className="error-msg" style={{ marginTop: '.5rem', fontSize: 12 }}>{error}</div>
      )}

      {preview && (
        <div style={{ marginTop: '.75rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-xmuted)', letterSpacing: '.04em', marginBottom: '.35rem', textTransform: 'uppercase' }}>Preview</div>
          <textarea
            value={preview}
            onChange={e => setPreview(e.target.value)}
            rows={mode === 'html' ? 10 : 8}
            style={{ ...FIELD, resize: 'vertical', fontSize: mode === 'html' ? 12 : 13, fontFamily: mode === 'html' ? 'monospace' : 'inherit', marginBottom: '.5rem' }}
          />
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button
              className="btn-primary"
              onClick={() => { onAccept(preview); onClose(); }}
              style={{ fontSize: 13, padding: '.3rem .8rem' }}
            >
              ✓ Use this
            </button>
            <button
              onClick={() => setPreview('')}
              style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, padding: '.3rem .7rem', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              ↺ Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseEmailList(str) {
  if (!str?.trim()) return [];
  return str.split(/[,;\n]+/).map(s => s.trim()).filter(s => s.includes('@'));
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FIELD = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '.45rem .65rem',
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'inherit',
};

const LABEL = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'var(--text-xmuted)',
  marginBottom: '.25rem',
  display: 'block',
};

const ROW = { marginBottom: '.75rem' };

export default function ComposeModal({ onClose, onSent, draft = null, onDraftSaved }) {
  const [senders, setSenders] = useState([]);
  const [senderId, setSenderId] = useState(draft?.sender_id || '');
  const [fromName, setFromName] = useState(draft?.from_name || '');
  const [to, setTo] = useState((draft?.to_addresses || []).join(', '));
  const [cc, setCc] = useState((draft?.cc || []).join(', '));
  const [bcc, setBcc] = useState((draft?.bcc || []).join(', '));
  const [showCc, setShowCc] = useState(!!(draft?.cc?.length));
  const [showBcc, setShowBcc] = useState(!!(draft?.bcc?.length));
  const [subject, setSubject] = useState(draft?.subject || '');
  const [previewText, setPreviewText] = useState(draft?.preview_text || '');
  const [bodyText, setBodyText] = useState(draft?.body_text || '');
  const [bodyHtml, setBodyHtml] = useState(draft?.body_html || '');
  const [useHtml, setUseHtml] = useState(draft?.use_html || false);
  const [attachments, setAttachments] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState(draft?.id || null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.senders.list().then(data => {
      const active = (data || []).filter(s => s.active !== false);
      setSenders(active);
      if (!senderId && active.length) {
        setSenderId(active[0].id);
        if (!fromName) setFromName(active[0].name);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  function handleSenderChange(id) {
    setSenderId(id);
    const s = senders.find(s => s.id === id);
    if (s) setFromName(s.name);
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const content = await readFileAsBase64(file);
        setAttachments(prev => [...prev, {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          content,
          size: file.size,
        }]);
      } catch {}
    }
    e.target.value = '';
  }

  function removeAttachment(idx) {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  function draftPayload() {
    return {
      sender_id: senderId || null,
      from_name: fromName.trim(),
      to: parseEmailList(to),
      cc: parseEmailList(cc),
      bcc: parseEmailList(bcc),
      subject: subject.trim(),
      preview_text: previewText.trim(),
      body_text: bodyText,
      body_html: bodyHtml,
      use_html: useHtml,
      attachments: [],
    };
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    setError(null);
    try {
      if (draftId) {
        await api.drafts.update(draftId, draftPayload());
      } else {
        const saved = await api.drafts.create(draftPayload());
        setDraftId(saved?.id || null);
      }
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2500);
      onDraftSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleSend() {
    const toList = parseEmailList(to);
    if (!senderId) { setError('Select a sender'); return; }
    if (!toList.length) { setError('Add at least one recipient in To'); return; }
    if (!subject.trim()) { setError('Subject is required'); return; }

    setSending(true);
    setError(null);
    try {
      await api.compose.send({
        sender_id: senderId,
        from_name: fromName.trim(),
        to: toList,
        cc: parseEmailList(cc),
        bcc: parseEmailList(bcc),
        subject: subject.trim(),
        preview_text: previewText.trim() || undefined,
        body_text: useHtml ? undefined : bodyText,
        body_html: useHtml ? bodyHtml : undefined,
        attachments: attachments.map(({ filename, content_type, content, size }) => ({ filename, content_type, content, size })),
      });
      // Delete draft if it was opened from one
      if (draftId) {
        try { await api.drafts.delete(draftId); } catch {}
      }
      onSent?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const canSend = !sending && !!senderId && !!to.trim() && !!subject.trim();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />

      {/* Modal panel */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--surface)',
        border: '1.5px solid var(--border)',
        borderRadius: 'calc(var(--radius) * 2)',
        width: '100%', maxWidth: 680,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,.3)',
      }}>

        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem', borderBottom: '1.5px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>New Email</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)', padding: '.2rem .45rem', borderRadius: 'var(--radius)', lineHeight: 1 }}
            title="Close (Esc)"
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && (
            <div className="error-msg" style={{ marginBottom: '.75rem', fontSize: 13 }}>{error}</div>
          )}

          {/* From address + display name */}
          <div style={{ ...ROW, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
            <div>
              <label style={LABEL}>From Address</label>
              <select value={senderId} onChange={e => handleSenderChange(e.target.value)} style={{ ...FIELD, cursor: 'pointer' }}>
                {senders.length === 0 && <option value="">No senders configured</option>}
                {senders.map(s => (
                  <option key={s.id} value={s.id}>{s.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Sender Name</label>
              <input
                value={fromName}
                onChange={e => setFromName(e.target.value)}
                placeholder="Display name"
                style={FIELD}
              />
            </div>
          </div>

          {/* To */}
          <div style={ROW}>
            <label style={LABEL}>To</label>
            <textarea
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="recipient@example.com, another@example.com"
              rows={2}
              style={{ ...FIELD, resize: 'vertical' }}
              autoFocus
            />
          </div>

          {/* CC / BCC toggle buttons */}
          {(!showCc || !showBcc) && (
            <div style={{ marginBottom: '.75rem', display: 'flex', gap: '.4rem' }}>
              {!showCc && (
                <button onClick={() => setShowCc(true)} style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '.2rem .65rem', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}>
                  + CC
                </button>
              )}
              {!showBcc && (
                <button onClick={() => setShowBcc(true)} style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '.2rem .65rem', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}>
                  + BCC
                </button>
              )}
            </div>
          )}

          {showCc && (
            <div style={ROW}>
              <label style={LABEL}>CC</label>
              <input value={cc} onChange={e => setCc(e.target.value)} placeholder="cc@example.com" style={FIELD} />
            </div>
          )}

          {showBcc && (
            <div style={ROW}>
              <label style={LABEL}>BCC</label>
              <input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="bcc@example.com" style={FIELD} />
            </div>
          )}

          {/* Subject */}
          <div style={ROW}>
            <label style={LABEL}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" style={FIELD} />
          </div>

          {/* Preview text */}
          <div style={ROW}>
            <label style={{ ...LABEL, marginBottom: '.1rem' }}>Preview Text</label>
            <div style={{ fontSize: 11, color: 'var(--text-xmuted)', marginBottom: '.3rem' }}>
              Short snippet visible below the subject line in email clients
            </div>
            <input
              value={previewText}
              onChange={e => setPreviewText(e.target.value)}
              placeholder="A brief summary shown in the inbox preview…"
              style={FIELD}
            />
          </div>

          {/* Body */}
          <div style={ROW}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
              <label style={{ ...LABEL, marginBottom: 0 }}>
                {useHtml ? 'HTML Body' : 'Body (plain text)'}
              </label>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button
                  onClick={() => setAiOpen(o => !o)}
                  title="Write with AI"
                  style={{
                    fontSize: 11, cursor: 'pointer', padding: '.18rem .55rem',
                    borderRadius: 'var(--radius)',
                    border: '1.5px solid ' + (aiOpen ? 'var(--accent)' : 'var(--border)'),
                    background: aiOpen ? 'var(--accent)' : 'none',
                    color: aiOpen ? 'var(--bg)' : 'var(--text-muted)',
                    transition: 'all .12s',
                  }}
                >
                  ✦ AI
                </button>
                <button
                  onClick={() => setUseHtml(h => !h)}
                  style={{
                    fontSize: 11, cursor: 'pointer', padding: '.18rem .55rem',
                    borderRadius: 'var(--radius)',
                    border: '1.5px solid ' + (useHtml ? 'var(--accent)' : 'var(--border)'),
                    background: useHtml ? 'var(--accent)' : 'none',
                    color: useHtml ? 'var(--bg)' : 'var(--text-muted)',
                    transition: 'all .12s',
                  }}
                >
                  {useHtml ? '⊟ HTML mode on' : '⊕ Paste HTML'}
                </button>
              </div>
            </div>

            {aiOpen && (
              <AiWritePanel
                subject={subject}
                fromName={fromName}
                mode={useHtml ? 'html' : 'text'}
                onAccept={text => useHtml ? setBodyHtml(text) : setBodyText(text)}
                onClose={() => setAiOpen(false)}
              />
            )}

            {useHtml ? (
              <textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                placeholder="Paste your full HTML email here…"
                rows={14}
                style={{ ...FIELD, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
              />
            ) : (
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                placeholder="Type your message here…"
                rows={10}
                style={{ ...FIELD, resize: 'vertical' }}
              />
            )}
          </div>

          {/* Attachments */}
          <div style={ROW}>
            <label style={LABEL}>Attachments</label>
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.5rem' }}>
                {attachments.map((att, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '.35rem',
                    background: 'var(--surface-2)', border: '1.5px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '.25rem .6rem', fontSize: 12,
                  }}>
                    <span>⊙ {att.filename}{att.size ? ` · ${fmtSize(att.size)}` : ''}</span>
                    <button
                      onClick={() => removeAttachment(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-xmuted)', fontSize: 14, padding: '0 0 0 .15rem', lineHeight: 1 }}
                      title="Remove"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
            <button
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              style={{
                background: 'none', border: '1.5px dashed var(--border)',
                borderRadius: 'var(--radius)', padding: '.4rem 1rem',
                fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)',
                width: '100%', transition: 'border-color .12s, color .12s',
              }}
            >
              ⊕ Add Attachment
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '.9rem 1.5rem', borderTop: '1.5px solid var(--border)',
          display: 'flex', gap: '.5rem', alignItems: 'center', flexShrink: 0,
        }}>
          <button className="btn-primary" onClick={handleSend} disabled={!canSend}>
            {sending ? 'Sending…' : '↑ Send Email'}
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={savingDraft || sending}
            style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '.38rem .8rem', fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            {savingDraft ? 'Saving…' : '✎ Save Draft'}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
          {draftSaved && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: '.25rem' }}>Draft saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
