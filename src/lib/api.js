const BASE = import.meta.env.VITE_WORKER_URL || '';
const SECRET = import.meta.env.VITE_ADMIN_SECRET || '';

async function call(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': SECRET,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

// --- Sequences ---
export const api = {
  sequences: {
    list: () => call('/sequences'),
    get: (id) => call(`/sequences/${id}`),
    create: (body) => call('/sequences', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => call(`/sequences/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => call(`/sequences/${id}`, { method: 'DELETE' }),
  },
  steps: {
    list: (sequenceId) => call(`/sequences/${sequenceId}/steps`),
    create: (sequenceId, body) => call(`/sequences/${sequenceId}/steps`, { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => call(`/steps/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => call(`/steps/${id}`, { method: 'DELETE' }),
    reorder: (sequenceId, steps) => call(`/sequences/${sequenceId}/steps/reorder`, { method: 'POST', body: JSON.stringify({ steps }) }),
  },
  templates: {
    list: () => call('/templates'),
    get: (id) => call(`/templates/${id}`),
    create: (body) => call('/templates', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => call(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => call(`/templates/${id}`, { method: 'DELETE' }),
  },
  enrollments: {
    list: (params = {}) => {
      const q = new URLSearchParams();
      if (params.sequence_id) q.set('sequence_id', params.sequence_id);
      if (params.status) q.set('status', params.status);
      if (params.limit) q.set('limit', params.limit);
      if (params.offset) q.set('offset', params.offset);
      return call(`/enrollments${q.toString() ? '?' + q : ''}`);
    },
    get: (id) => call(`/enrollments/${id}`),
    create: (body) => call('/enrollments', { method: 'POST', body: JSON.stringify(body) }),
    pause: (id) => call(`/enrollments/${id}/pause`, { method: 'PUT' }),
    resume: (id) => call(`/enrollments/${id}/resume`, { method: 'PUT' }),
    exit: (id) => call(`/enrollments/${id}/exit`, { method: 'PUT' }),
    events: (id) => call(`/enrollments/${id}/events`),
  },
  tags: {
    list: () => call('/tags'),
    create: (name) => call('/tags', { method: 'POST', body: JSON.stringify({ name }) }),
  },
  senders: {
    list: () => call('/senders'),
    get: (id) => call(`/senders/${id}`),
    create: (body) => call('/senders', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => call(`/senders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => call(`/senders/${id}`, { method: 'DELETE' }),
  },
  inbox: {
    list: (params = {}) => {
      const q = new URLSearchParams();
      if (params.sender_id) q.set('sender_id', params.sender_id);
      if (params.archived) q.set('archived', '1');
      if (params.unread) q.set('unread', '1');
      if (params.limit) q.set('limit', String(params.limit));
      if (params.offset) q.set('offset', String(params.offset));
      return call(`/inbox${q.toString() ? '?' + q : ''}`);
    },
    get: (id) => call(`/inbox/${id}`),
    markRead: (id) => call(`/inbox/${id}/read`, { method: 'PUT' }),
    reply: (id, body) => call(`/inbox/${id}/reply`, { method: 'POST', body: JSON.stringify(body) }),
    forward: (id, body) => call(`/inbox/${id}/forward`, { method: 'POST', body: JSON.stringify(body) }),
    archive: (id) => call(`/inbox/${id}/archive`, { method: 'PUT' }),
    unarchive: (id) => call(`/inbox/${id}/archive`, { method: 'DELETE' }),
    delete: (id) => call(`/inbox/${id}`, { method: 'DELETE' }),
  },
  compose: {
    send: (body) => call('/send-email', { method: 'POST', body: JSON.stringify(body) }),
    listSent: (params = {}) => {
      const q = new URLSearchParams();
      if (params.limit) q.set('limit', String(params.limit));
      if (params.offset) q.set('offset', String(params.offset));
      return call(`/sent-emails${q.toString() ? '?' + q : ''}`);
    },
    getSent: (id) => call(`/sent-emails/${id}`),
    starSent: (id) => call(`/sent-emails/${id}/star`, { method: 'PUT' }),
    unstarSent: (id) => call(`/sent-emails/${id}/star`, { method: 'DELETE' }),
  },
  drafts: {
    list: () => call('/drafts'),
    create: (body) => call('/drafts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => call(`/drafts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => call(`/drafts/${id}`, { method: 'DELETE' }),
  },
  starred: {
    list: () => call('/starred'),
    starInbox: (id) => call(`/inbox/${id}/star`, { method: 'PUT' }),
    unstarInbox: (id) => call(`/inbox/${id}/star`, { method: 'DELETE' }),
  },
  diag: () => call('/diag'),
};

// Sequence pastel colors — cycle by index
const PASTELS = ['#fde8e8', '#e8f5e9', '#e3f2fd', '#fff8e1', '#f3e5f5', '#e0f7fa'];
const PASTELS_DARK = ['#c0392b', '#27ae60', '#2980b9', '#f39c12', '#8e44ad', '#16a085'];
export function sequenceColor(index, dark = false) {
  const arr = dark ? PASTELS_DARK : PASTELS;
  return arr[index % arr.length];
}

export function stepIcon(type) {
  if (type === 'email') return '✉';
  if (type === 'wait') return '⏱';
  if (type === 'branch') return '⑂';
  return '•';
}

export function statusBadge(status) {
  const labels = {
    draft: 'Draft', active: 'Active', paused: 'Paused', archived: 'Archived',
    completed: 'Completed', exited: 'Exited', bounced: 'Bounced', unsubscribed: 'Unsubscribed',
    send_failed: 'Failed', sent: 'Sent', opened: 'Opened', clicked: 'Clicked',
    delivered: 'Delivered', complained: 'Complaint',
  };
  return labels[status] || status;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
