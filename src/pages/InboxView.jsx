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

export default function InboxView() {
  const [senders, setSenders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedSender, setSelectedSender] = useState('all');
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    api.senders.list().then(setSenders).catch(() => {});
  }, []);

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSender]);

  async function loadMessages() {
    setLoadingList(true);
    try {
      const params = selectedSender !== 'all' ? { sender_id: selectedSender } : {};
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
    setReplyOpen(false);
    setReplyBody('');
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

  async function sendReply() {
    if (!replyBody.trim() || !selectedMsg) return;
    setReplying(true);
    try {
      await api.inbox.reply(selectedMsg.id, { body: replyBody });
      setReplyBody('');
      setReplyOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setReplying(false);
    }
  }

  const unreadCount = messages.filter(m => !m.read).length;

  const MessageList = (
    <div style={{
      width: isMobile ? '100%' : 300,
      flexShrink: 0,
      borderRight: isMobile ? 'none' : '1.5px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface)',
      overflow: 'hidden',
      height: '100%',
    }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1.5px solid var(--border)', flexShrink: 0 }}>
        <div className="row-between" style={{ marginBottom: '.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Inbox</h2>
          <div className="row" style={{ gap: '.4rem' }}>
            {unreadCount > 0 && (
              <span style={{
                background: 'var(--accent)', color: 'var(--bg)',
                borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '.1rem .5rem',
              }}>{unreadCount}</span>
            )}
            <button
              onClick={loadMessages}
              style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)', padding: '.2rem .4rem', borderRadius: 'var(--radius)' }}
              title="Refresh"
            >↺</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.35rem', overflowX: 'auto', paddingBottom: '.25rem', scrollbarWidth: 'none' }}>
          {[{ id: 'all', email: 'All' }, ...senders].map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedSender(s.id)}
              style={{
                flexShrink: 0,
                padding: '.2rem .6rem',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: selectedSender === s.id ? 600 : 400,
                background: selectedSender === s.id ? 'var(--accent)' : 'transparent',
                color: selectedSender === s.id ? 'var(--bg)' : 'var(--text-muted)',
                border: '1.5px solid ' + (selectedSender === s.id ? 'var(--accent)' : 'var(--border)'),
                cursor: 'pointer',
                transition: 'all .12s',
                whiteSpace: 'nowrap',
              }}
            >
              {s.id === 'all' ? 'All' : (s.email || '').split('@')[0]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && <div className="error-msg" style={{ margin: '.75rem', fontSize: 13 }}>{error}</div>}
        {loadingList && <div className="loading">Loading…</div>}
        {!loadingList && messages.length === 0 && !error && (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--text-xmuted)', fontSize: 14 }}>
            No messages yet
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            onClick={() => openMessage(msg)}
            style={{
              padding: '.8rem 1.25rem',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              background: selectedMsg?.id === msg.id ? 'var(--surface-2)' : 'transparent',
              borderLeft: `3px solid ${msg.read ? 'transparent' : 'var(--accent)'}`,
              transition: 'background .1s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.15rem' }}>
              <span style={{
                fontWeight: msg.read ? 400 : 600, fontSize: 13,
                flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {msg.from_name || msg.from_email}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-xmuted)', flexShrink: 0, marginLeft: '.5rem' }}>
                {fmtDateTime(msg.received_at)}
              </span>
            </div>
            <div style={{
              fontSize: 13, fontWeight: msg.read ? 400 : 500, marginBottom: '.1rem',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
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
            <button className="btn-ghost btn-sm" onClick={() => setSelectedMsg(null)} style={{ alignSelf: 'flex-start' }}>
              ← Back
            </button>
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
            <div
              style={{ fontSize: 15, lineHeight: 1.65, flex: 1 }}
              dangerouslySetInnerHTML={{ __html: selectedMsg.body_html }}
            />
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
                  <button
                    key={i}
                    onClick={() => downloadAttachment(att)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '.35rem',
                      padding: '.3rem .7rem', borderRadius: 'var(--radius)',
                      border: '1.5px solid var(--border)', background: 'var(--surface)',
                      cursor: 'pointer', fontSize: 12, color: 'var(--text)',
                      transition: 'border-color .12s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <span>⊙</span>
                    <span>{att.filename}</span>
                    {att.size > 0 && <span style={{ color: 'var(--text-xmuted)' }}>{fmtSize(att.size)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: '1rem', marginTop: 'auto' }}>
            {!replyOpen ? (
              <button className="btn-ghost" onClick={() => setReplyOpen(true)}>↩ Reply</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                <label style={{ marginBottom: 0 }}>
                  Reply to {selectedMsg.from_name || selectedMsg.from_email}
                </label>
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  placeholder="Type your reply…"
                  rows={5}
                  style={{ resize: 'vertical' }}
                  autoFocus
                />
                <div className="row" style={{ gap: '.5rem' }}>
                  <button className="btn-primary" onClick={sendReply} disabled={replying || !replyBody.trim()}>
                    {replying ? 'Sending…' : 'Send'}
                  </button>
                  <button className="btn-ghost" onClick={() => { setReplyOpen(false); setReplyBody(''); }}>
                    Cancel
                  </button>
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
      {isMobile
        ? (selectedMsg ? MessageContent : MessageList)
        : <>{MessageList}{MessageContent}</>
      }
    </div>
  );
}
