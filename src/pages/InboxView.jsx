import { useState, useEffect } from 'react';
import { api, fmtDateTime } from '../lib/api.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || '';

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadAttachment(att) {
  const res = await fetch(`${WORKER_URL}/attachments?key=${encodeURIComponent(att.r2_key)}`, {
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.filename;
  a.click();
  URL.revokeObjectURL(url);
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

const BTN = {
  background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
  padding: '.25rem .65rem', fontSize: 12, cursor: 'pointer', color: 'var(--text)',
  transition: 'border-color .12s, color .12s', whiteSpace: 'nowrap',
};
const BTN_DANGER = { ...BTN, color: '#b04a3a', borderColor: 'transparent' };

export default function InboxView() {
  const [senders, setSenders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedSender, setSelectedSender] = useState('all');
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  // compose state
  const [composeMode, setComposeMode] = useState(null); // 'reply' | 'replyall' | 'forward'
  const [composeTo, setComposeTo] = useState('');
  const [composeCC, setComposeCC] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composing, setComposing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isMobile = useIsMobile();
  const perPage = parseInt(localStorage.getItem('mailer_per_page') || '50', 10);

  useEffect(() => { api.senders.list().then(setSenders).catch(() => {}); }, []);
  useEffect(() => { loadMessages(); }, [selectedSender]); // eslint-disable-line

  async function loadMessages() {
    setLoadingList(true);
    try {
      const params = selectedSender === 'archived'
        ? { archived: true, limit: perPage }
        : selectedSender !== 'all'
          ? { sender_id: selectedSender, limit: perPage }
          : { limit: perPage };
      setMessages(await api.inbox.list(params));
      setError(null);
    } catch (e) {
      setError(e.message);
      setMessages([]);
    } finally {
      setLoadingList(false);
    }
  }

  async function openMessage(msg) {
    setSelectedMsg(msg);
    setComposeMode(null);
    setConfirmDelete(false);
    setActionMsg(null);
    if (!msg.read) {
      try {
        await api.inbox.markRead(msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
      } catch {}
    }
    if (!msg.body_html && !msg.body_text) {
      setLoadingMsg(true);
      try {
        const full = await api.inbox.get(msg.id);
        setSelectedMsg(full);
      } catch {}
      finally { setLoadingMsg(false); }
    }
  }

  function openCompose(mode) {
    const sig = localStorage.getItem('mailer_signature') || '';
    const sigText = sig ? `\n\n--\n${sig}` : '';
    setComposeMode(mode);
    setComposeTo(mode === 'forward' ? '' : selectedMsg.from_email || '');
    setComposeCC(mode === 'replyall' ? (selectedMsg.cc || []).join(', ') : '');
    setComposeBody(sigText);
    setConfirmDelete(false);
  }

  function closeCompose() {
    setComposeMode(null);
    setComposeTo('');
    setComposeCC('');
    setComposeBody('');
  }

  function flash(msg) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  }

  async function sendCompose() {
    setComposing(true);
    try {
      if (composeMode === 'forward') {
        if (!composeTo.trim()) return;
        await api.inbox.forward(selectedMsg.id, { to: composeTo.trim(), note: composeBody });
      } else {
        const cc = composeMode === 'replyall'
          ? composeCC.split(',').map(e => e.trim()).filter(Boolean)
          : [];
        await api.inbox.reply(selectedMsg.id, { body: composeBody, cc });
      }
      flash('Sent');
      closeCompose();
    } catch (e) {
      setError(e.message);
    } finally {
      setComposing(false);
    }
  }

  async function handleArchive() {
    try {
      if (selectedMsg.archived) {
        await api.inbox.unarchive(selectedMsg.id);
        flash('Moved to inbox');
      } else {
        await api.inbox.archive(selectedMsg.id);
        flash('Archived');
      }
      setMessages(prev => prev.filter(m => m.id !== selectedMsg.id));
      setSelectedMsg(null);
    } catch (e) { setError(e.message); }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await api.inbox.delete(selectedMsg.id);
      setMessages(prev => prev.filter(m => m.id !== selectedMsg.id));
      setSelectedMsg(null);
      setConfirmDelete(false);
    } catch (e) {
      setError(e.message);
      setConfirmDelete(false);
    }
  }

  const unreadCount = messages.filter(m => !m.read).length;

  const pillStyle = (active) => ({
    flexShrink: 0, padding: '.2rem .6rem', borderRadius: 99, fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--text-muted)',
    border: '1.5px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
    cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap',
  });

  const MessageList = (
    <div style={{
      width: isMobile ? '100%' : 300, flexShrink: 0,
      borderRight: isMobile ? 'none' : '1.5px solid var(--border)',
      display: 'flex', flexDirection: 'column', background: 'var(--surface)',
      overflow: 'hidden', height: '100%',
    }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1.5px solid var(--border)', flexShrink: 0 }}>
        <div className="row-between" style={{ marginBottom: '.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Inbox</h2>
          <div className="row" style={{ gap: '.4rem' }}>
            {unreadCount > 0 && (
              <span style={{ background: 'var(--accent)', color: 'var(--bg)', borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '.1rem .5rem' }}>
                {unreadCount}
              </span>
            )}
            <button onClick={loadMessages} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)', padding: '.2rem .4rem', borderRadius: 'var(--radius)' }} title="Refresh">↺</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.35rem', overflowX: 'auto', paddingBottom: '.25rem', scrollbarWidth: 'none' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'archived', label: '⊟ Archived' },
            ...senders.map(s => ({ id: s.id, label: (s.email || '').split('@')[0] })),
          ].map(s => (
            <button key={s.id} onClick={() => setSelectedSender(s.id)} style={pillStyle(selectedSender === s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && <div className="error-msg" style={{ margin: '.75rem', fontSize: 13 }}>{error}</div>}
        {loadingList && <div className="loading">Loading…</div>}
        {!loadingList && messages.length === 0 && !error && (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--text-xmuted)', fontSize: 14 }}>
            No messages
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} onClick={() => openMessage(msg)} style={{
            padding: '.8rem 1.25rem', borderBottom: '1px solid var(--border)', cursor: 'pointer',
            background: selectedMsg?.id === msg.id ? 'var(--surface-2)' : 'transparent',
            borderLeft: `3px solid ${msg.read ? 'transparent' : 'var(--accent)'}`,
            transition: 'background .1s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.15rem' }}>
              <span style={{ fontWeight: msg.read ? 400 : 600, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {msg.from_name || msg.from_email}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-xmuted)', flexShrink: 0, marginLeft: '.5rem' }}>
                {fmtDateTime(msg.received_at)}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: msg.read ? 400 : 500, marginBottom: '.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {msg.subject || '(no subject)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-xmuted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              → {msg.to || msg.sender_email}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const MessageContent = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, height: '100%' }}>
      {!selectedMsg ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-xmuted)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: '.5rem', opacity: .25, fontFamily: 'var(--font-display)' }}>✉</div>
            <p style={{ margin: 0, fontSize: 14 }}>Select a message to read</p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isMobile && (
            <button className="btn-ghost btn-sm" onClick={() => setSelectedMsg(null)} style={{ alignSelf: 'flex-start' }}>← Back</button>
          )}

          <div>
            <h1 style={{ margin: '0 0 .6rem', fontSize: '1.65rem', lineHeight: 1.2 }}>
              {selectedMsg.subject || '(no subject)'}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem 1.5rem', fontSize: 13, color: 'var(--text-muted)' }}>
              <span>
                <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>From</span>
                {selectedMsg.from_name ? `${selectedMsg.from_name} <${selectedMsg.from_email}>` : selectedMsg.from_email}
              </span>
              <span>
                <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>To</span>
                {selectedMsg.to || selectedMsg.sender_email}
              </span>
              {selectedMsg.cc?.length > 0 && (
                <span>
                  <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>CC</span>
                  {selectedMsg.cc.join(', ')}
                </span>
              )}
              <span>
                <span style={{ color: 'var(--text-xmuted)', fontWeight: 500, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', marginRight: '.3rem' }}>Date</span>
                {fmtDateTime(selectedMsg.received_at)}
              </span>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: 0 }} />

          {loadingMsg ? (
            <div className="loading" style={{ padding: '1rem 0' }}>Loading message…</div>
          ) : selectedMsg.body_html ? (
            <div style={{ fontSize: 15, lineHeight: 1.65, flex: 1 }} dangerouslySetInnerHTML={{ __html: selectedMsg.body_html }} />
          ) : (
            <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, fontSize: 15, lineHeight: 1.65, flex: 1 }}>
              {selectedMsg.body_text || '(empty message)'}
            </pre>
          )}

          {selectedMsg.attachments?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--text-xmuted)', marginBottom: '.5rem', textTransform: 'uppercase' }}>
                Attachments
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {selectedMsg.attachments.map((att, i) => (
                  <button key={i} onClick={() => downloadAttachment(att)} style={BTN}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    ⊙ {att.filename}{att.size > 0 ? ` · ${fmtSize(att.size)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action bar */}
          <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: '1rem', flexShrink: 0 }}>
            {!composeMode ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
                <div style={{ display: 'flex', gap: '.4rem' }}>
                  <button style={BTN} onClick={() => openCompose('reply')}>↩ Reply</button>
                  <button style={BTN} onClick={() => openCompose('replyall')}>↩↩ Reply All</button>
                  <button style={BTN} onClick={() => openCompose('forward')}>→ Forward</button>
                </div>
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                  {actionMsg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{actionMsg}</span>}
                  <button style={BTN} onClick={handleArchive} title={selectedMsg.archived ? 'Move to inbox' : 'Archive'}>
                    {selectedMsg.archived ? '↩ Unarchive' : '⊟ Archive'}
                  </button>
                  {confirmDelete ? (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Delete forever?</span>
                      <button onClick={handleDelete} style={{ ...BTN, background: '#b04a3a', color: '#fff', borderColor: '#b04a3a' }}>Yes</button>
                      <button style={BTN} onClick={() => setConfirmDelete(false)}>No</button>
                    </>
                  ) : (
                    <button style={BTN_DANGER} onClick={handleDelete}>✕ Delete</button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                {composeMode === 'forward' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-xmuted)', marginBottom: '.25rem' }}>To</label>
                    <input value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="recipient@example.com" style={{ width: '100%', boxSizing: 'border-box' }} autoFocus />
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {composeMode === 'reply' ? 'Replying to' : 'Replying all to'}{' '}
                    <strong>{selectedMsg.from_name || selectedMsg.from_email}</strong>
                    {composeMode === 'replyall' && composeCC && (
                      <span style={{ color: 'var(--text-xmuted)' }}> · CC: {composeCC}</span>
                    )}
                  </div>
                )}
                <textarea
                  value={composeBody}
                  onChange={e => setComposeBody(e.target.value)}
                  placeholder={composeMode === 'forward' ? 'Add a note (optional)…' : 'Type your message…'}
                  rows={5}
                  style={{ resize: 'vertical' }}
                  autoFocus={composeMode !== 'forward'}
                />
                <div className="row" style={{ gap: '.5rem' }}>
                  <button className="btn-primary" onClick={sendCompose}
                    disabled={composing || (composeMode === 'forward' ? !composeTo.trim() : !composeBody.trim())}>
                    {composing ? 'Sending…' : composeMode === 'forward' ? 'Forward' : 'Send'}
                  </button>
                  <button className="btn-ghost" onClick={closeCompose}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {isMobile ? (selectedMsg ? MessageContent : MessageList) : <>{MessageList}{MessageContent}</>}
    </div>
  );
}
