import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

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

export default function ComposeModal({ onClose, onSent }) {
  const [senders, setSenders] = useState([]);
  const [senderId, setSenderId] = useState('');
  const [fromName, setFromName] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [useHtml, setUseHtml] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.senders.list().then(data => {
      const active = (data || []).filter(s => s.active !== false);
      setSenders(active);
      if (active.length) {
        setSenderId(active[0].id);
        setFromName(active[0].name);
      }
    }).catch(() => {});
  }, []);

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
          <button className="btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
          {sending && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: '.25rem' }}>
              Sending…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
