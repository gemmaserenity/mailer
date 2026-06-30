import { WorkflowEntrypoint } from 'cloudflare:workers';
import PostalMime from 'postal-mime';

// ============================================================
// RESPONSE HELPERS
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret, X-Resend-Signature',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function corsOk() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ============================================================
// SUPABASE HELPER — safe, handles empty bodies, both header formats
// ============================================================

async function sb(env, path, opts = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const prefer = opts.prefer || (opts.method === 'POST' || opts.method === 'PATCH' ? 'return=representation' : undefined);
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
    ...(opts.headers || {}),
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status} at ${path}: ${body}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ============================================================
// RESEND HELPER
// ============================================================

async function sendViaResend(env, { to, cc, bcc, subject, html, fromName, fromEmail, idempotencyKey, replyTo, apiKey, attachments }) {
  const from = `${fromName || 'Gemma'} <${fromEmail}>`;
  const headers = {
    Authorization: `Bearer ${apiKey || env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const emailPayload = { from, to, subject, html };
  if (replyTo) emailPayload.reply_to = replyTo;
  if (cc && cc.length) emailPayload.cc = cc;
  if (bcc && bcc.length) emailPayload.bcc = bcc;
  if (attachments && attachments.length) emailPayload.attachments = attachments;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(emailPayload),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ============================================================
// CAN-SPAM FOOTER + UNSUBSCRIBE
// ============================================================

const WORKER_BASE = 'https://mailer-worker.gemma-serenity.workers.dev';

function buildFooterHtml(businessName, physicalAddress, unsubscribeToken) {
  if (!unsubscribeToken) return '';
  const url = `${WORKER_BASE}/unsubscribe?t=${unsubscribeToken}`;
  const year = new Date().getFullYear();
  const addr = physicalAddress ? ` &middot; ${physicalAddress}` : '';
  return [
    '<div style="margin-top:2.5rem;padding-top:1.25rem;border-top:1px solid #e0d8cc;',
    'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a8f84;text-align:center;line-height:1.75">',
    `<p style="margin:0 0 .35rem">&copy; ${year} ${businessName || ''}${addr}</p>`,
    '<p style="margin:0">You received this because you subscribed to our mailing list. &middot; ',
    `<a href="${url}" style="color:#9a8f84;text-decoration:underline">Unsubscribe</a></p>`,
    '</div>',
  ].join('');
}

function htmlPage(title, body) {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title><style>` +
    `*{box-sizing:border-box}body{margin:0;font-family:Georgia,serif;background:#f7f3ec;` +
    `color:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}` +
    `.card{background:#fff;border:1px solid #e2d9cc;border-radius:12px;padding:2.5rem 3rem;` +
    `max-width:480px;width:100%;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}` +
    `h1{font-size:1.6rem;font-weight:400;margin:0 0 .75rem}` +
    `p{color:#6b6456;font-size:15px;line-height:1.6;margin:0}` +
    `</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
  );
}

async function handleUnsubscribe(env, url) {
  const token = url.searchParams.get('t');
  if (!token) return htmlPage('Invalid link', 'This unsubscribe link is invalid or has expired.');

  let rows;
  try {
    rows = await sb(env, `mailer_enrollments?unsubscribe_token=eq.${token}&select=id,status,recipient_email&limit=1`);
  } catch {
    return htmlPage('Error', 'Something went wrong. Please try again later.');
  }

  if (!rows?.length) return htmlPage('Link not found', 'This unsubscribe link was not found or has already been used.');

  const enrollment = rows[0];
  if (enrollment.status === 'unsubscribed') {
    return htmlPage('Already unsubscribed', `${enrollment.recipient_email} is already unsubscribed from this mailing list.`);
  }

  try {
    await sb(env, `mailer_enrollments?id=eq.${enrollment.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ status: 'unsubscribed', updated_at: new Date().toISOString() }),
    });
  } catch {
    return htmlPage('Error', 'Something went wrong processing your request. Please try again.');
  }

  return htmlPage('You\'re unsubscribed', `${enrollment.recipient_email} has been successfully removed from this mailing list.`);
}

// ============================================================
// TEMPLATE VARIABLE MERGING
// ============================================================

function mergeVars(template, data) {
  if (!template) return '';
  if (!data) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    data[key] !== undefined ? String(data[key]) : match
  );
}

// ============================================================
// AUTH
// ============================================================

function requireAuth(request, env) {
  const secret = request.headers.get('X-Admin-Secret');
  if (!secret || secret !== env.ADMIN_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

// ============================================================
// HEALTH & DIAG
// ============================================================

async function handleHealth() {
  return json({ status: 'ok', ts: new Date().toISOString() });
}

async function handleDiag(env, request) {
  const authErr = requireAuth(request, env);
  if (authErr) return authErr;

  const result = {
    supabase_url_present: !!env.SUPABASE_URL,
    supabase_url_prefix: env.SUPABASE_URL?.substring(0, 35) || null,
    supabase_key_present: !!env.SUPABASE_SERVICE_ROLE_KEY,
    supabase_key_length: env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    resend_key_present: !!env.RESEND_API_KEY,
    admin_secret_present: !!env.ADMIN_SECRET,
    workflow_binding_present: !!env.MAILER_WORKFLOW,
    tables: [],
  };

  for (const table of [
    'mailer_sequences',
    'mailer_templates',
    'mailer_steps',
    'mailer_enrollments',
    'mailer_events',
    'mailer_tags',
  ]) {
    try {
      const rows = await sb(env, `${table}?select=id&limit=1`);
      result.tables.push({ table, status: 'ok', rows: rows?.length ?? 0 });
    } catch (e) {
      result.tables.push({ table, status: 'error', error: String(e) });
    }
  }

  return json(result);
}

// ============================================================
// SEQUENCES
// ============================================================

async function listSequences(env) {
  const data = await sb(env, 'mailer_sequences?select=*&order=created_at.desc');
  // Attach step count + active enrollment count for each sequence
  const sequences = data || [];
  const counts = await Promise.all(
    sequences.map(async (s) => {
      const [steps, active] = await Promise.all([
        sb(env, `mailer_steps?sequence_id=eq.${s.id}&select=id`).then(r => r?.length ?? 0),
        sb(env, `mailer_enrollments?sequence_id=eq.${s.id}&status=eq.active&select=id`).then(r => r?.length ?? 0),
      ]);
      return { ...s, step_count: steps, active_enrollments: active };
    })
  );
  return json(counts);
}

async function createSequence(env, request) {
  const body = await request.json();
  const data = await sb(env, 'mailer_sequences', {
    method: 'POST',
    body: JSON.stringify({
      name: body.name,
      description: body.description || null,
      status: body.status || 'draft',
      from_name: body.from_name || 'Gemma Serenity',
      from_email: body.from_email || 'gemma@prs.gemmaserenity.com',
    }),
  });
  return json(Array.isArray(data) ? data[0] : data, 201);
}

async function getSequence(env, id) {
  const rows = await sb(env, `mailer_sequences?id=eq.${id}&select=*&limit=1`);
  if (!rows?.length) return json({ error: 'not found' }, 404);
  const seq = rows[0];
  const steps = await sb(env, `mailer_steps?sequence_id=eq.${id}&order=step_order.asc&select=*,mailer_templates(id,name,subject,version,variables)`);
  return json({ ...seq, steps: steps || [] });
}

async function updateSequence(env, id, request) {
  const body = await request.json();
  delete body.id;
  delete body.created_at;
  const data = await sb(env, `mailer_sequences?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  return json(Array.isArray(data) ? data[0] : data);
}

async function deleteSequence(env, id) {
  const active = await sb(env, `mailer_enrollments?sequence_id=eq.${id}&status=eq.active&select=id&limit=1`);
  if (active?.length) return json({ error: 'Cannot delete sequence with active enrollments' }, 409);
  await sb(env, `mailer_sequences?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  return json({ deleted: true });
}

// ============================================================
// STEPS
// ============================================================

async function listSteps(env, sequenceId) {
  const data = await sb(env, `mailer_steps?sequence_id=eq.${sequenceId}&order=step_order.asc&select=*,mailer_templates(id,name,subject,version,variables)`);
  return json(data || []);
}

async function createStep(env, sequenceId, request) {
  const body = await request.json();
  const existing = await sb(env, `mailer_steps?sequence_id=eq.${sequenceId}&select=step_order&order=step_order.desc&limit=1`);
  const nextOrder = existing?.length ? existing[0].step_order + 1 : 1;
  const data = await sb(env, 'mailer_steps', {
    method: 'POST',
    body: JSON.stringify({
      sequence_id: sequenceId,
      step_order: body.step_order ?? nextOrder,
      type: body.type,
      label: body.label || null,
      template_id: body.template_id || null,
      wait_duration_hours: body.wait_duration_hours || null,
      branch_conditions: body.branch_conditions || null,
    }),
  });
  return json(Array.isArray(data) ? data[0] : data, 201);
}

async function updateStep(env, id, request) {
  const body = await request.json();
  delete body.id;
  delete body.sequence_id;
  delete body.created_at;
  const data = await sb(env, `mailer_steps?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  return json(Array.isArray(data) ? data[0] : data);
}

async function deleteStep(env, id) {
  await sb(env, `mailer_steps?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  return json({ deleted: true });
}

async function reorderSteps(env, sequenceId, request) {
  const { steps } = await request.json(); // [{ id, step_order }]
  await Promise.all(
    steps.map(s =>
      sb(env, `mailer_steps?id=eq.${s.id}&sequence_id=eq.${sequenceId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ step_order: s.step_order }),
      })
    )
  );
  return json({ reordered: true });
}

// ============================================================
// TEMPLATES
// ============================================================

async function listTemplates(env) {
  const data = await sb(env, 'mailer_templates?select=id,name,subject,version,variables,created_at,updated_at&order=updated_at.desc');
  return json(data || []);
}

async function createTemplate(env, request) {
  const body = await request.json();
  const data = await sb(env, 'mailer_templates', {
    method: 'POST',
    body: JSON.stringify({
      name: body.name,
      subject: body.subject,
      html_body: body.html_body || '',
      plain_text_body: body.plain_text_body || null,
      variables: body.variables || {},
      version: 1,
    }),
  });
  return json(Array.isArray(data) ? data[0] : data, 201);
}

async function getTemplate(env, id) {
  const rows = await sb(env, `mailer_templates?id=eq.${id}&limit=1`);
  if (!rows?.length) return json({ error: 'not found' }, 404);
  return json(rows[0]);
}

async function updateTemplate(env, id, request) {
  const body = await request.json();
  const current = await sb(env, `mailer_templates?id=eq.${id}&select=version&limit=1`);
  const newVersion = (current?.[0]?.version ?? 0) + 1;
  delete body.id;
  delete body.created_at;
  const data = await sb(env, `mailer_templates?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, version: newVersion, updated_at: new Date().toISOString() }),
  });
  return json(Array.isArray(data) ? data[0] : data);
}

async function deleteTemplate(env, id) {
  const inUse = await sb(env, `mailer_steps?template_id=eq.${id}&select=id&limit=1`);
  if (inUse?.length) return json({ error: 'Template is used by one or more steps' }, 409);
  await sb(env, `mailer_templates?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  return json({ deleted: true });
}

// ============================================================
// ENROLLMENTS
// ============================================================

async function listEnrollments(env, url) {
  const sequenceId = url.searchParams.get('sequence_id');
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let q = `mailer_enrollments?select=*,mailer_sequences(name),mailer_steps(step_order,type,label)&order=enrolled_at.desc&limit=${limit}&offset=${offset}`;
  if (sequenceId) q += `&sequence_id=eq.${sequenceId}`;
  if (status) q += `&status=eq.${status}`;

  const data = await sb(env, q);
  return json(data || []);
}

async function enrollRecipient(env, request) {
  const body = await request.json();
  if (!body.sequence_id || !body.recipient_email) {
    return json({ error: 'sequence_id and recipient_email are required' }, 400);
  }

  const email = body.recipient_email.toLowerCase().trim();

  // Prevent duplicate active enrollment
  const existing = await sb(env, `mailer_enrollments?sequence_id=eq.${body.sequence_id}&recipient_email=eq.${encodeURIComponent(email)}&status=eq.active&select=id&limit=1`);
  if (existing?.length) return json({ error: 'Already enrolled and active in this sequence' }, 409);

  // Get first step for initial current_step_id
  const steps = await sb(env, `mailer_steps?sequence_id=eq.${body.sequence_id}&order=step_order.asc&select=id&limit=1`);
  const firstStepId = steps?.[0]?.id || null;

  const enrollment = await sb(env, 'mailer_enrollments', {
    method: 'POST',
    body: JSON.stringify({
      sequence_id: body.sequence_id,
      recipient_email: email,
      recipient_data: body.recipient_data || {},
      current_step_id: firstStepId,
      status: 'active',
      enrolled_at: new Date().toISOString(),
    }),
  });

  const record = Array.isArray(enrollment) ? enrollment[0] : enrollment;

  // Start the Cloudflare Workflow for this enrollment
  try {
    const instance = await env.MAILER_WORKFLOW.create({
      id: record.id, // use enrollment id as stable workflow id
      params: {
        enrollmentId: record.id,
        sequenceId: body.sequence_id,
      },
    });
    await sb(env, `mailer_enrollments?id=eq.${record.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ workflow_instance_id: instance.id }),
    });
  } catch (workflowErr) {
    console.error('Workflow start failed (enrollment created):', workflowErr);
  }

  return json(record, 201);
}

async function getEnrollment(env, id) {
  const rows = await sb(env, `mailer_enrollments?id=eq.${id}&select=*,mailer_sequences(name,from_name,from_email),mailer_steps(step_order,type,label)&limit=1`);
  if (!rows?.length) return json({ error: 'not found' }, 404);
  return json(rows[0]);
}

async function pauseEnrollment(env, id) {
  const rows = await sb(env, `mailer_enrollments?id=eq.${id}&select=workflow_instance_id,status&limit=1`);
  const record = rows?.[0];
  if (!record) return json({ error: 'not found' }, 404);
  if (record.status !== 'active') return json({ error: 'Only active enrollments can be paused' }, 400);

  if (record.workflow_instance_id) {
    try {
      const instance = await env.MAILER_WORKFLOW.get(record.workflow_instance_id);
      await instance.terminate();
    } catch (e) { console.error('Workflow terminate failed:', e); }
  }

  const data = await sb(env, `mailer_enrollments?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'paused', updated_at: new Date().toISOString() }),
  });
  return json(Array.isArray(data) ? data[0] : data);
}

async function resumeEnrollment(env, id) {
  const rows = await sb(env, `mailer_enrollments?id=eq.${id}&select=*&limit=1`);
  const record = rows?.[0];
  if (!record) return json({ error: 'not found' }, 404);
  if (record.status !== 'paused') return json({ error: 'Only paused enrollments can be resumed' }, 400);

  await sb(env, `mailer_enrollments?id=eq.${id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ status: 'active', updated_at: new Date().toISOString() }),
  });

  try {
    const instance = await env.MAILER_WORKFLOW.create({
      id: `${id}-resume-${Date.now()}`,
      params: {
        enrollmentId: id,
        sequenceId: record.sequence_id,
        resumeFromStepId: record.current_step_id,
      },
    });
    await sb(env, `mailer_enrollments?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ workflow_instance_id: instance.id }),
    });
  } catch (workflowErr) {
    console.error('Workflow resume failed:', workflowErr);
  }

  return json({ resumed: true });
}

async function exitEnrollment(env, id) {
  const rows = await sb(env, `mailer_enrollments?id=eq.${id}&select=workflow_instance_id&limit=1`);
  const record = rows?.[0];
  if (!record) return json({ error: 'not found' }, 404);

  if (record.workflow_instance_id) {
    try {
      const instance = await env.MAILER_WORKFLOW.get(record.workflow_instance_id);
      await instance.terminate();
    } catch (e) { console.error('Workflow terminate failed:', e); }
  }

  const data = await sb(env, `mailer_enrollments?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'exited', updated_at: new Date().toISOString() }),
  });
  return json(Array.isArray(data) ? data[0] : data);
}

async function getEnrollmentEvents(env, id) {
  const data = await sb(env, `mailer_events?enrollment_id=eq.${id}&order=occurred_at.desc&select=*,mailer_steps(step_order,type,label)&limit=100`);
  return json(data || []);
}

// ============================================================
// TAGS
// ============================================================

async function listTags(env) {
  const data = await sb(env, 'mailer_tags?order=name.asc');
  return json(data || []);
}

async function createTag(env, request) {
  const body = await request.json();
  if (!body.name) return json({ error: 'name is required' }, 400);
  const data = await sb(env, 'mailer_tags', {
    method: 'POST',
    prefer: 'return=representation,resolution=ignore-duplicates',
    body: JSON.stringify({ name: body.name.trim() }),
  });
  return json(Array.isArray(data) ? data[0] : data, 201);
}

// ============================================================
// SENDERS
// ============================================================

async function listSenders(env) {
  const data = await sb(env, 'mailer_senders?select=*&order=created_at.asc');
  return json(data || []);
}

async function createSender(env, request) {
  const body = await request.json();
  if (!body.name || !body.email || !body.resend_api_key) {
    return json({ error: 'name, email, and resend_api_key are required' }, 400);
  }
  const data = await sb(env, 'mailer_senders', {
    method: 'POST',
    body: JSON.stringify({
      name: body.name.trim(),
      email: body.email.toLowerCase().trim(),
      resend_api_key: body.resend_api_key.trim(),
      domain: body.domain?.trim() || null,
      active: true,
    }),
  });
  return json(Array.isArray(data) ? data[0] : data, 201);
}

async function updateSender(env, id, request) {
  const body = await request.json();
  delete body.id;
  delete body.created_at;
  const data = await sb(env, `mailer_senders?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  return json(Array.isArray(data) ? data[0] : data);
}

async function deleteSender(env, id) {
  await sb(env, `mailer_senders?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  return json({ deleted: true });
}

// ============================================================
// INBOX
// ============================================================

async function listInbox(env, url) {
  const senderId = url.searchParams.get('sender_id');
  const unreadOnly = url.searchParams.get('unread') === '1';
  const showArchived = url.searchParams.get('archived') === '1';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let q = `mailer_inbox?select=id,sender_id,sender_email,from_email,from_name,to_address,subject,read,archived,cc,received_at&order=received_at.desc&limit=${limit}&offset=${offset}`;
  q += `&archived=eq.${showArchived ? 'true' : 'false'}`;
  if (senderId) q += `&sender_id=eq.${senderId}`;
  if (unreadOnly) q += `&read=eq.false`;

  const data = await sb(env, q);
  return json((data || []).map(m => ({ ...m, to: m.to_address })));
}

async function archiveInboxMessage(env, id, archived = true) {
  await sb(env, `mailer_inbox?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived }),
  });
  return json({ archived });
}

async function deleteInboxMessage(env, id) {
  const rows = await sb(env, `mailer_inbox?id=eq.${id}&select=attachments&limit=1`);
  const attachments = rows?.[0]?.attachments || [];
  for (const att of attachments) {
    try { await env.ATTACHMENTS.delete(att.r2_key); } catch {}
  }
  await sb(env, `mailer_inbox?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  return json({ deleted: true });
}

async function forwardInboxMessage(env, id, request) {
  const body = await request.json();
  if (!body.to) return json({ error: 'to is required' }, 400);

  const rows = await sb(env, `mailer_inbox?id=eq.${id}&select=*&limit=1`);
  if (!rows?.length) return json({ error: 'not found' }, 404);
  const original = rows[0];

  const toAddr = (original.to_address || '').toLowerCase();
  const senderRows = await sb(env, `mailer_senders?email=eq.${encodeURIComponent(toAddr)}&select=*&limit=1`);
  const sender = senderRows?.[0];
  if (!sender) return json({ error: `no sender for ${toAddr}` }, 400);

  const fwdBlock = [
    '<br><hr style="border:none;border-top:1px solid #e0d8cc;margin:1.5rem 0">',
    '<div style="color:#888;font-size:13px;line-height:1.6">',
    '<b>———— Forwarded message ————</b><br>',
    `<b>From:</b> ${original.from_name ? `${original.from_name} &lt;${original.from_email}&gt;` : original.from_email}<br>`,
    `<b>Date:</b> ${original.received_at}<br>`,
    `<b>Subject:</b> ${original.subject || ''}<br>`,
    `<b>To:</b> ${original.to_address}`,
    '</div><br>',
  ].join('');
  const fwdHtml = (body.note ? `<p>${body.note.replace(/\n/g, '<br>')}</p>` : '') +
                   fwdBlock + (original.body_html || `<pre>${original.body_text || ''}</pre>`);

  await sendViaResend(env, {
    to: body.to,
    subject: `Fwd: ${original.subject || ''}`,
    html: fwdHtml,
    fromName: sender.name,
    fromEmail: sender.email,
    apiKey: sender.resend_api_key,
  });
  return json({ sent: true });
}

async function getInboxMessage(env, id) {
  const rows = await sb(env, `mailer_inbox?id=eq.${id}&select=*&limit=1`);
  if (!rows?.length) return json({ error: 'not found' }, 404);
  return json({ ...rows[0], to: rows[0].to_address });
}

async function markInboxRead(env, id) {
  const data = await sb(env, `mailer_inbox?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ read: true }),
  });
  return json(Array.isArray(data) ? data[0] : data);
}

async function replyToInbox(env, id, request) {
  const body = await request.json();
  if (!body.body) return json({ error: 'body is required' }, 400);

  const rows = await sb(env, `mailer_inbox?id=eq.${id}&select=*&limit=1`);
  if (!rows?.length) return json({ error: 'message not found' }, 404);
  const original = rows[0];

  const toAddr = (original.to_address || original.sender_email || '').toLowerCase();
  const senderRows = await sb(env, `mailer_senders?email=eq.${encodeURIComponent(toAddr)}&select=*&limit=1`);
  const sender = senderRows?.[0];
  if (!sender) return json({ error: `no sender configured for ${toAddr}` }, 400);

  const replySubject = original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject || ''}`;
  const replyHtml = body.html || `<p>${body.body.replace(/\n/g, '<br>')}</p>`;

  await sendViaResend(env, {
    to: original.from_email,
    cc: body.cc || [],
    subject: replySubject,
    html: replyHtml,
    fromName: sender.name,
    fromEmail: sender.email,
    apiKey: sender.resend_api_key,
    replyTo: sender.email,
  });

  return json({ sent: true });
}

// ============================================================
// INBOUND RAW — relay from another CF account (e.g. Sascha's)
// Public route secured by INBOUND_SECRET header
// ============================================================

async function handleInboundRaw(env, request, ctx) {
  const secret = request.headers.get('X-Inbound-Secret');
  if (!secret || secret !== env.INBOUND_SECRET) return json({ error: 'unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const { raw, to, from: fromRaw } = body;
  if (!raw || !to) return json({ error: 'raw and to are required' }, 400);

  ctx.waitUntil(processRawInbound(env, { raw, to, fromRaw }));
  return json({ ok: true });
}

async function processRawInbound(env, { raw, to, fromRaw }) {
  try {
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const parsed = await new PostalMime().parse(bytes.buffer);

    const toAddress = (to || '').toLowerCase();
    // Same fix as email() handler: use PostalMime's parsed From, not the envelope sender
    const fromEmail = (parsed.from?.address || fromRaw || '').toLowerCase();
    const fromName = parsed.from?.name || null;

    const senderRows = await sb(env, `mailer_senders?email=eq.${encodeURIComponent(toAddress)}&select=id,email&limit=1`);
    const sender = senderRows?.[0] || null;

    const msgKey = (parsed.messageId || `${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const attachmentMeta = [];
    for (const att of (parsed.attachments || [])) {
      if (!att.content) continue;
      const filename = att.filename || `attachment_${attachmentMeta.length + 1}`;
      const r2Key = `inbox/${msgKey}/${filename}`;
      await env.ATTACHMENTS.put(r2Key, att.content, {
        httpMetadata: { contentType: att.mimeType || 'application/octet-stream' },
      });
      attachmentMeta.push({
        filename,
        content_type: att.mimeType || 'application/octet-stream',
        size: att.content.byteLength || 0,
        r2_key: r2Key,
      });
    }

    await sb(env, 'mailer_inbox', {
      method: 'POST',
      prefer: 'return=minimal,resolution=ignore-duplicates',
      body: JSON.stringify({
        sender_id: sender?.id || null,
        sender_email: sender?.email || toAddress,
        from_email: fromEmail,
        from_name: fromName,
        to_address: toAddress,
        subject: parsed.subject || null,
        body_html: parsed.html || null,
        body_text: parsed.text || null,
        attachments: attachmentMeta,
        cc: (parsed.cc || []).map(a => a.address).filter(Boolean),
        resend_message_id: parsed.messageId || null,
        read: false,
        received_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('processRawInbound error:', e);
  }
}

// ============================================================
// INBOUND EMAIL WEBHOOK — Resend POSTs here when email arrives
// Public route (no auth) — point Resend inbound webhook here
// ============================================================

async function handleInboundWebhook(env, request, ctx) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: true }); }

  if (body.type !== 'email.received' || !body.data) return json({ ok: true });
  ctx.waitUntil(processInboundEmail(env, body.data));
  return json({ ok: true });
}

async function processInboundEmail(env, data) {
  try {
    // received_for is the authoritative "delivered to" field in Resend inbound payloads
    const toAddress = ((Array.isArray(data.received_for) ? data.received_for[0] : null) ||
                       (Array.isArray(data.to) ? data.to[0] : data.to) || '').toLowerCase();

    let fromEmail = data.from || '';
    let fromName = null;
    const nameEmailMatch = fromEmail.match(/^(.+?)\s*<([^>]+)>$/);
    if (nameEmailMatch) {
      fromName = nameEmailMatch[1].trim();
      fromEmail = nameEmailMatch[2].trim();
    }

    // Find which of our senders this was delivered to (need their API key to fetch body)
    const senderRows = await sb(env, `mailer_senders?email=eq.${encodeURIComponent(toAddress)}&select=id,email,resend_api_key&limit=1`);
    const sender = senderRows?.[0] || null;

    // Resend inbound webhook does not include body — body will be null here.
    // Use Cloudflare Email Routing → email handler (below) for full body parsing.
    const bodyHtml = null;
    const bodyText = null;

    await sb(env, 'mailer_inbox', {
      method: 'POST',
      prefer: 'return=minimal,resolution=ignore-duplicates',
      body: JSON.stringify({
        sender_id: sender?.id || null,
        sender_email: sender?.email || toAddress,
        from_email: fromEmail,
        from_name: fromName,
        to_address: toAddress,
        subject: data.subject || null,
        body_html: bodyHtml,
        body_text: bodyText,
        resend_message_id: data.message_id || data.email_id || null,
        read: false,
        received_at: data.created_at || new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('processInboundEmail error:', e);
  }
}

// ============================================================
// RESEND WEBHOOK — outbound tracking (sent, opened, clicked…)
// ============================================================

async function handleResendWebhook(env, request, ctx) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: true }); }

  const eventType = body.type;
  if (!body.data) return json({ ok: true });

  const eventMap = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.unsubscribed': 'unsubscribed',
  };

  const ourType = eventMap[eventType];
  if (!ourType) return json({ ok: true });

  const resendId = body.data.email_id || body.data.id;
  ctx.waitUntil(processResendEvent(env, resendId, ourType, body.data));
  return json({ ok: true });
}

async function processResendEvent(env, resendId, eventType, data) {
  try {
    // Find the sent event record that has this resend_id in metadata
    const events = await sb(env, `mailer_events?metadata->>resend_id=eq.${resendId}&select=enrollment_id,step_id&limit=1`);
    if (!events?.length) return;
    const { enrollment_id, step_id } = events[0];

    await sb(env, 'mailer_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        enrollment_id,
        step_id,
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        metadata: { resend_id: resendId, ...data },
      }),
    });

    if (eventType === 'bounced') {
      await sb(env, `mailer_enrollments?id=eq.${enrollment_id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ status: 'bounced', updated_at: new Date().toISOString() }),
      });
    } else if (eventType === 'unsubscribed' || eventType === 'complained') {
      await sb(env, `mailer_enrollments?id=eq.${enrollment_id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ status: 'unsubscribed', updated_at: new Date().toISOString() }),
      });
    }
  } catch (e) {
    console.error('processResendEvent error:', e);
  }
}

// ============================================================
// BRANCH EVALUATION
// ============================================================

async function evaluateBranch(env, enrollmentId, seqStep) {
  const conditions = seqStep.branch_conditions;
  if (!conditions?.rules?.length) return true; // no rules → continue

  const events = await sb(env, `mailer_events?enrollment_id=eq.${enrollmentId}&order=occurred_at.desc&select=event_type&limit=100`);
  const seen = new Set((events || []).map(e => e.event_type));

  for (const rule of conditions.rules) {
    let matched = false;
    switch (rule.condition) {
      case 'opened':      matched = seen.has('opened'); break;
      case 'not_opened':  matched = !seen.has('opened'); break;
      case 'clicked':     matched = seen.has('clicked'); break;
      case 'not_clicked': matched = !seen.has('clicked'); break;
      case 'bounced':     matched = seen.has('bounced'); break;
      default: break;
    }

    if (!matched) continue;

    if (rule.action === 'exit') {
      await sb(env, `mailer_enrollments?id=eq.${enrollmentId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ status: 'exited', updated_at: new Date().toISOString() }),
      });
      return false; // stop workflow
    }

    if (rule.action?.startsWith('tag:')) {
      const tagName = rule.action.slice(4);
      let tagRows = await sb(env, `mailer_tags?name=eq.${encodeURIComponent(tagName)}&select=id&limit=1`);
      if (!tagRows?.length) {
        tagRows = await sb(env, 'mailer_tags', {
          method: 'POST',
          body: JSON.stringify({ name: tagName }),
        });
      }
      const tagId = Array.isArray(tagRows) ? tagRows[0]?.id : tagRows?.id;
      if (tagId) {
        await sb(env, 'mailer_enrollment_tags', {
          method: 'POST',
          prefer: 'return=minimal,resolution=ignore-duplicates',
          body: JSON.stringify({ enrollment_id: enrollmentId, tag_id: tagId }),
        });
      }
    }

    return true; // matched but action is continue (or tag + continue)
  }

  return true; // no rule matched → default continue
}

// ============================================================
// CLOUDFLARE WORKFLOW — durable enrollment runtime
// ============================================================

export class MailerWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { enrollmentId, sequenceId, resumeFromStepId } = event.payload;

    // Load enrollment once durably at start
    const enrollment = await step.do('load-enrollment', async () => {
      const rows = await sb(this.env, `mailer_enrollments?id=eq.${enrollmentId}&select=*&limit=1`);
      return rows?.[0] || null;
    });

    if (!enrollment || enrollment.status !== 'active') return;

    // Load all steps for this sequence
    const steps = await step.do('load-steps', async () => {
      return await sb(this.env, `mailer_steps?sequence_id=eq.${sequenceId}&order=step_order.asc&select=*,mailer_templates(*)`);
    });

    if (!steps?.length) return;

    // Load sequence from/name details + sender CAN-SPAM fields
    const seqMeta = await step.do('load-seq-meta', async () => {
      const rows = await sb(this.env, `mailer_sequences?id=eq.${sequenceId}&select=from_name,from_email&limit=1`);
      const seq = rows?.[0] || {};
      if (seq.from_email) {
        const sRows = await sb(this.env, `mailer_senders?email=eq.${encodeURIComponent(seq.from_email)}&select=name,business_name,physical_address&limit=1`);
        const s = sRows?.[0] || {};
        return { ...seq, business_name: s.business_name || s.name || '', physical_address: s.physical_address || '' };
      }
      return seq;
    });

    // Find starting index (resume support)
    let startIdx = 0;
    if (resumeFromStepId) {
      const idx = steps.findIndex(s => s.id === resumeFromStepId);
      if (idx >= 0) startIdx = idx;
    }

    for (let i = startIdx; i < steps.length; i++) {
      const seqStep = steps[i];

      // Check enrollment is still active before each step
      const isActive = await step.do(`check-${seqStep.id}`, async () => {
        const rows = await sb(this.env, `mailer_enrollments?id=eq.${enrollmentId}&select=status&limit=1`);
        return rows?.[0]?.status === 'active';
      });
      if (!isActive) return;

      if (seqStep.type === 'wait') {
        const hours = seqStep.wait_duration_hours || 24;
        await step.sleep(`wait-${seqStep.id}`, { hours });

      } else if (seqStep.type === 'email') {
        await step.do(`send-${seqStep.id}`, async () => {
          const template = seqStep.mailer_templates;
          if (!template) {
            console.error(`Step ${seqStep.id} has no template`);
            return;
          }

          const recipientData = enrollment.recipient_data || {};
          const subject = mergeVars(template.subject, recipientData);
          const baseHtml = mergeVars(template.html_body, recipientData);
          const footer = buildFooterHtml(
            seqMeta.business_name || seqMeta.from_name || '',
            seqMeta.physical_address || '',
            enrollment.unsubscribe_token,
          );
          const html = baseHtml + footer;
          const idempotencyKey = `enroll-${enrollmentId}-step-${seqStep.id}`;

          let resendId = null;
          let sendError = null;
          try {
            const result = await sendViaResend(this.env, {
              to: enrollment.recipient_email,
              subject,
              html,
              fromName: seqMeta.from_name || 'Gemma',
              fromEmail: seqMeta.from_email,
              replyTo: seqMeta.from_email || null,
              apiKey: sequenceId === this.env.TMQ_SEQUENCE_ID && this.env.TMQ_RESEND_API_KEY
                ? this.env.TMQ_RESEND_API_KEY
                : this.env.RESEND_API_KEY,
              idempotencyKey,
            });
            resendId = result?.id;
          } catch (e) {
            sendError = String(e);
            console.error('Email send failed:', e);
          }

          // Log sent event with resend_id in metadata (used by webhook handler to find enrollment)
          await sb(this.env, 'mailer_events', {
            method: 'POST',
            prefer: 'return=minimal',
            body: JSON.stringify({
              enrollment_id: enrollmentId,
              event_type: resendId ? 'sent' : 'send_failed',
              step_id: seqStep.id,
              occurred_at: new Date().toISOString(),
              metadata: {
                resend_id: resendId,
                template_id: template.id,
                template_version: template.version,
                ...(sendError ? { error: sendError } : {}),
              },
            }),
          });

          // Advance current_step_id in enrollment
          await sb(this.env, `mailer_enrollments?id=eq.${enrollmentId}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: JSON.stringify({
              current_step_id: seqStep.id,
              updated_at: new Date().toISOString(),
            }),
          });
        });

      } else if (seqStep.type === 'branch') {
        const shouldContinue = await step.do(`branch-${seqStep.id}`, async () => {
          return evaluateBranch(this.env, enrollmentId, seqStep);
        });
        if (!shouldContinue) return; // branch exited the sequence
      }
    }

    // All steps done — mark completed
    await step.do('complete', async () => {
      await sb(this.env, `mailer_enrollments?id=eq.${enrollmentId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ status: 'completed', updated_at: new Date().toISOString() }),
      });
    });
  }
}

// ============================================================
// COMPOSE — ad-hoc outbound email (no sequence)
// ============================================================

async function handleSendEmail(env, request) {
  const body = await request.json();
  const { sender_id, from_name, to, cc, bcc, subject, preview_text, body_text, body_html, attachments } = body;

  if (!sender_id) return json({ error: 'sender_id is required' }, 400);
  const toArr = Array.isArray(to) ? to : (to ? [to] : []);
  if (!toArr.length) return json({ error: 'at least one recipient is required' }, 400);
  if (!subject?.trim()) return json({ error: 'subject is required' }, 400);

  const senderRows = await sb(env, `mailer_senders?id=eq.${sender_id}&select=*&limit=1`);
  const sender = senderRows?.[0];
  if (!sender) return json({ error: 'sender not found' }, 404);

  const ccArr = Array.isArray(cc) ? cc : (cc ? [cc] : []);
  const bccArr = Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []);

  // Build HTML — if plain text only, convert newlines to <br>
  let html = body_html || (body_text ? `<p>${body_text.replace(/\n/g, '<br>')}</p>` : '<p></p>');
  if (preview_text?.trim()) {
    // Preheader hidden text — shows in email client snippet previews
    html = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:transparent;line-height:1px">${preview_text.trim()}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` + html;
  }

  // Attachments arrive as { filename, content_type, content (base64), size }
  const resendAttachments = (attachments || [])
    .filter(a => a.content)
    .map(a => ({ filename: a.filename, content: a.content }));

  let resendId = null;
  try {
    const result = await sendViaResend(env, {
      to: toArr,
      cc: ccArr,
      bcc: bccArr,
      subject: subject.trim(),
      html,
      fromName: from_name?.trim() || sender.name,
      fromEmail: sender.email,
      apiKey: sender.resend_api_key,
      attachments: resendAttachments,
    });
    resendId = result?.id;
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  // Persist record (non-fatal if it fails — email is already sent)
  try {
    await sb(env, 'mailer_sent_emails', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        sender_id,
        from_email: sender.email,
        from_name: from_name?.trim() || sender.name,
        to_addresses: toArr,
        cc: ccArr,
        bcc: bccArr,
        subject: subject.trim(),
        preview_text: preview_text?.trim() || null,
        body_html: html || null,
        body_text: body_text || null,
        attachments: (attachments || []).map(({ filename, content_type, size }) => ({ filename, content_type, size })),
        resend_id: resendId,
        sent_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('Failed to store sent email record:', e);
  }

  return json({ sent: true, resend_id: resendId });
}

async function listSentEmails(env, url) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const data = await sb(env, `mailer_sent_emails?select=id,from_email,from_name,to_addresses,cc,bcc,subject,preview_text,body_html,body_text,attachments,starred,sent_at,resend_id&order=sent_at.desc&limit=${limit}&offset=${offset}`);
  return json(data || []);
}

// ============================================================
// DRAFTS
// ============================================================

async function listDrafts(env) {
  const data = await sb(env, 'mailer_drafts?select=id,sender_id,from_name,to_addresses,subject,updated_at&order=updated_at.desc&limit=100');
  return json(data || []);
}

async function createDraft(env, request) {
  const body = await request.json();
  const data = await sb(env, 'mailer_drafts', {
    method: 'POST',
    body: JSON.stringify({
      sender_id: body.sender_id || null,
      from_name: body.from_name || null,
      to_addresses: body.to || [],
      cc: body.cc || [],
      bcc: body.bcc || [],
      subject: body.subject || null,
      preview_text: body.preview_text || null,
      body_text: body.body_text || null,
      body_html: body.body_html || null,
      use_html: body.use_html || false,
      attachments: body.attachments || [],
    }),
  });
  return json(Array.isArray(data) ? data[0] : data, 201);
}

async function updateDraft(env, id, request) {
  const body = await request.json();
  const data = await sb(env, `mailer_drafts?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      sender_id: body.sender_id || null,
      from_name: body.from_name || null,
      to_addresses: body.to || [],
      cc: body.cc || [],
      bcc: body.bcc || [],
      subject: body.subject || null,
      preview_text: body.preview_text || null,
      body_text: body.body_text || null,
      body_html: body.body_html || null,
      use_html: body.use_html || false,
      attachments: body.attachments || [],
      updated_at: new Date().toISOString(),
    }),
  });
  return json(Array.isArray(data) ? data[0] : data);
}

async function deleteDraft(env, id) {
  await sb(env, `mailer_drafts?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  return json({ deleted: true });
}

// ============================================================
// STAR / UNSTAR
// ============================================================

async function starInboxMessage(env, id, starred) {
  await sb(env, `mailer_inbox?id=eq.${id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ starred }),
  });
  return json({ starred });
}

async function starSentEmail(env, id, starred) {
  await sb(env, `mailer_sent_emails?id=eq.${id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ starred }),
  });
  return json({ starred });
}

// ============================================================
// STARRED — combined inbox + sent starred items
// ============================================================

async function listStarred(env) {
  const [inboxRows, sentRows] = await Promise.all([
    sb(env, 'mailer_inbox?starred=eq.true&select=id,from_email,from_name,subject,received_at,read,archived&order=received_at.desc&limit=100'),
    sb(env, 'mailer_sent_emails?starred=eq.true&select=id,from_email,from_name,to_addresses,subject,sent_at&order=sent_at.desc&limit=100'),
  ]);
  const inbox = (inboxRows || []).map(r => ({ ...r, _type: 'inbox', date: r.received_at }));
  const sent  = (sentRows  || []).map(r => ({ ...r, _type: 'sent',  date: r.sent_at }));
  const merged = [...inbox, ...sent].sort((a, b) => new Date(b.date) - new Date(a.date));
  return json(merged);
}

// ============================================================
// SENT EMAIL DETAIL
// ============================================================

async function getSentEmail(env, id) {
  const rows = await sb(env, `mailer_sent_emails?id=eq.${id}&limit=1`);
  if (!rows?.length) return json({ error: 'not found' }, 404);
  return json(rows[0]);
}

// ============================================================
// ROUTER
// ============================================================

// ============================================================
// PUBLIC SUBSCRIBE — front door for opt-in forms (no auth required)
// ============================================================

async function handlePublicSubscribe(env, request, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = (body.email || '').toLowerCase().trim();
  const firstName = (body.first_name || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Valid email is required' }, 400);
  }

  const sequenceId = env.TMQ_SEQUENCE_ID;
  if (!sequenceId) return json({ error: 'Sequence not configured' }, 500);

  // Silently succeed on duplicate — don't expose internal enrollment state publicly
  const existing = await sb(env, `mailer_enrollments?sequence_id=eq.${sequenceId}&recipient_email=eq.${encodeURIComponent(email)}&status=eq.active&select=id&limit=1`);
  if (existing?.length) return json({ success: true }, 200);

  const steps = await sb(env, `mailer_steps?sequence_id=eq.${sequenceId}&order=step_order.asc&select=id&limit=1`);
  const firstStepId = steps?.[0]?.id || null;

  const enrollment = await sb(env, 'mailer_enrollments', {
    method: 'POST',
    body: JSON.stringify({
      sequence_id: sequenceId,
      recipient_email: email,
      recipient_data: { first_name: firstName },
      current_step_id: firstStepId,
      status: 'active',
      enrolled_at: new Date().toISOString(),
    }),
  });

  const record = Array.isArray(enrollment) ? enrollment[0] : enrollment;

  ctx.waitUntil((async () => {
    try {
      const instance = await env.MAILER_WORKFLOW.create({
        id: record.id,
        params: { enrollmentId: record.id, sequenceId },
      });
      await sb(env, `mailer_enrollments?id=eq.${record.id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ workflow_instance_id: instance.id }),
      });
    } catch (e) {
      console.error('Workflow start failed:', e);
    }
  })());

  return json({ success: true }, 200);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsOk();

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Public routes (no auth)
    if (path === '/health') return handleHealth();
    if (path === '/subscribe' && method === 'POST') return handlePublicSubscribe(env, request, ctx);
    if (path === '/webhooks/resend' && method === 'POST') return handleResendWebhook(env, request, ctx);
    if (path === '/inbox/webhook' && method === 'POST') return handleInboundWebhook(env, request, ctx);
    if (path === '/inbound-raw' && method === 'POST') return handleInboundRaw(env, request, ctx);
    if (path === '/unsubscribe' && method === 'GET') return handleUnsubscribe(env, url);

    // All other routes require auth
    const authErr = requireAuth(request, env);
    if (authErr) return authErr;

    try {
      // --- Diag ---
      if (path === '/diag') return handleDiag(env, request);

      // --- Sequences ---
      if (path === '/sequences') {
        if (method === 'GET') return listSequences(env);
        if (method === 'POST') return createSequence(env, request);
      }

      const seqMatch = path.match(/^\/sequences\/([\w-]+)$/);
      if (seqMatch) {
        const id = seqMatch[1];
        if (method === 'GET') return getSequence(env, id);
        if (method === 'PUT' || method === 'PATCH') return updateSequence(env, id, request);
        if (method === 'DELETE') return deleteSequence(env, id);
      }

      // --- Steps ---
      const stepsMatch = path.match(/^\/sequences\/([\w-]+)\/steps$/);
      if (stepsMatch) {
        const seqId = stepsMatch[1];
        if (method === 'GET') return listSteps(env, seqId);
        if (method === 'POST') return createStep(env, seqId, request);
      }

      const reorderMatch = path.match(/^\/sequences\/([\w-]+)\/steps\/reorder$/);
      if (reorderMatch && method === 'POST') return reorderSteps(env, reorderMatch[1], request);

      const stepMatch = path.match(/^\/steps\/([\w-]+)$/);
      if (stepMatch) {
        const id = stepMatch[1];
        if (method === 'PUT' || method === 'PATCH') return updateStep(env, id, request);
        if (method === 'DELETE') return deleteStep(env, id);
      }

      // --- Templates ---
      if (path === '/templates') {
        if (method === 'GET') return listTemplates(env);
        if (method === 'POST') return createTemplate(env, request);
      }

      const tmplMatch = path.match(/^\/templates\/([\w-]+)$/);
      if (tmplMatch) {
        const id = tmplMatch[1];
        if (method === 'GET') return getTemplate(env, id);
        if (method === 'PUT' || method === 'PATCH') return updateTemplate(env, id, request);
        if (method === 'DELETE') return deleteTemplate(env, id);
      }

      // --- Enrollments ---
      if (path === '/enrollments') {
        if (method === 'GET') return listEnrollments(env, url);
        if (method === 'POST') return enrollRecipient(env, request);
      }

      const enrollMatch = path.match(/^\/enrollments\/([\w-]+)$/);
      if (enrollMatch && method === 'GET') return getEnrollment(env, enrollMatch[1]);

      const enrollActionMatch = path.match(/^\/enrollments\/([\w-]+)\/(pause|resume|exit)$/);
      if (enrollActionMatch && method === 'PUT') {
        const id = enrollActionMatch[1];
        const action = enrollActionMatch[2];
        if (action === 'pause') return pauseEnrollment(env, id);
        if (action === 'resume') return resumeEnrollment(env, id);
        if (action === 'exit') return exitEnrollment(env, id);
      }

      const enrollEventsMatch = path.match(/^\/enrollments\/([\w-]+)\/events$/);
      if (enrollEventsMatch && method === 'GET') return getEnrollmentEvents(env, enrollEventsMatch[1]);

      // --- Tags ---
      if (path === '/tags') {
        if (method === 'GET') return listTags(env);
        if (method === 'POST') return createTag(env, request);
      }

      // --- Senders ---
      if (path === '/senders') {
        if (method === 'GET') return listSenders(env);
        if (method === 'POST') return createSender(env, request);
      }
      const senderMatch = path.match(/^\/senders\/([\w-]+)$/);
      if (senderMatch) {
        const id = senderMatch[1];
        if (method === 'PATCH') return updateSender(env, id, request);
        if (method === 'DELETE') return deleteSender(env, id);
      }

      // --- Compose (ad-hoc send) ---
      if (path === '/send-email' && method === 'POST') return handleSendEmail(env, request);
      if (path === '/sent-emails' && method === 'GET') return listSentEmails(env, url);

      // --- Sent email detail + star ---
      const sentMatch = path.match(/^\/sent-emails\/([\w-]+)$/);
      if (sentMatch && method === 'GET') return getSentEmail(env, sentMatch[1]);
      const sentStarMatch = path.match(/^\/sent-emails\/([\w-]+)\/star$/);
      if (sentStarMatch && method === 'PUT') return starSentEmail(env, sentStarMatch[1], true);
      if (sentStarMatch && method === 'DELETE') return starSentEmail(env, sentStarMatch[1], false);

      // --- Drafts ---
      if (path === '/drafts' && method === 'GET') return listDrafts(env);
      if (path === '/drafts' && method === 'POST') return createDraft(env, request);
      const draftMatch = path.match(/^\/drafts\/([\w-]+)$/);
      if (draftMatch) {
        const id = draftMatch[1];
        if (method === 'PATCH') return updateDraft(env, id, request);
        if (method === 'DELETE') return deleteDraft(env, id);
      }

      // --- Starred ---
      if (path === '/starred' && method === 'GET') return listStarred(env);

      // --- Attachments ---
      if (path === '/attachments' && method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) return json({ error: 'key required' }, 400);
        const obj = await env.ATTACHMENTS.get(key);
        if (!obj) return json({ error: 'not found' }, 404);
        const filename = key.split('/').pop();
        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            ...CORS_HEADERS,
          },
        });
      }

      // --- Inbox ---
      if (path === '/inbox' && method === 'GET') return listInbox(env, url);
      const inboxReplyMatch = path.match(/^\/inbox\/([\w-]+)\/reply$/);
      if (inboxReplyMatch && method === 'POST') return replyToInbox(env, inboxReplyMatch[1], request);
      const inboxReadMatch = path.match(/^\/inbox\/([\w-]+)\/read$/);
      if (inboxReadMatch && method === 'PUT') return markInboxRead(env, inboxReadMatch[1]);
      const inboxStarMatch = path.match(/^\/inbox\/([\w-]+)\/star$/);
      if (inboxStarMatch && method === 'PUT') return starInboxMessage(env, inboxStarMatch[1], true);
      if (inboxStarMatch && method === 'DELETE') return starInboxMessage(env, inboxStarMatch[1], false);
      const inboxArchiveMatch = path.match(/^\/inbox\/([\w-]+)\/archive$/);
      if (inboxArchiveMatch && method === 'PUT') return archiveInboxMessage(env, inboxArchiveMatch[1], true);
      if (inboxArchiveMatch && method === 'DELETE') return archiveInboxMessage(env, inboxArchiveMatch[1], false);
      const inboxForwardMatch = path.match(/^\/inbox\/([\w-]+)\/forward$/);
      if (inboxForwardMatch && method === 'POST') return forwardInboxMessage(env, inboxForwardMatch[1], request);
      const inboxMatch = path.match(/^\/inbox\/([\w-]+)$/);
      if (inboxMatch && method === 'GET') return getInboxMessage(env, inboxMatch[1]);
      if (inboxMatch && method === 'DELETE') return deleteInboxMessage(env, inboxMatch[1]);

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error('Worker error:', e);
      return json({ error: String(e) }, 500);
    }
  },

  // ============================================================
  // CLOUDFLARE EMAIL ROUTING handler — receives raw inbound email
  // Set up: Cloudflare Email Routing → catch-all → this worker
  // ============================================================
  async email(message, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const rawEmail = await new Response(message.raw).arrayBuffer();
        const parsed = await new PostalMime().parse(rawEmail);

        const toAddress = (message.to || '').toLowerCase();
        // Use PostalMime's parsed From header — message.from is the envelope sender (Return-Path)
        // which Resend rewrites to a bounce-tracking address and must not be used as from_email
        const fromEmail = (parsed.from?.address || message.from || '').toLowerCase();
        const fromName = parsed.from?.name || null;

        const senderRows = await sb(env, `mailer_senders?email=eq.${encodeURIComponent(toAddress)}&select=id,email&limit=1`);
        const sender = senderRows?.[0] || null;

        // Upload attachments to R2, store metadata array
        const msgKey = (parsed.messageId || `${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const attachmentMeta = [];
        for (const att of (parsed.attachments || [])) {
          if (!att.content) continue;
          const filename = att.filename || `attachment_${attachmentMeta.length + 1}`;
          const r2Key = `inbox/${msgKey}/${filename}`;
          await env.ATTACHMENTS.put(r2Key, att.content, {
            httpMetadata: { contentType: att.mimeType || 'application/octet-stream' },
          });
          attachmentMeta.push({
            filename,
            content_type: att.mimeType || 'application/octet-stream',
            size: att.content.byteLength || 0,
            r2_key: r2Key,
          });
        }

        await sb(env, 'mailer_inbox', {
          method: 'POST',
          prefer: 'return=minimal,resolution=ignore-duplicates',
          body: JSON.stringify({
            sender_id: sender?.id || null,
            sender_email: sender?.email || toAddress,
            from_email: fromEmail,
            from_name: fromName,
            to_address: toAddress,
            subject: parsed.subject || null,
            body_html: parsed.html || null,
            body_text: parsed.text || null,
            attachments: attachmentMeta,
            cc: (parsed.cc || []).map(a => a.address).filter(Boolean),
            resend_message_id: parsed.messageId || null,
            read: false,
            received_at: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.error('email handler error:', e);
      }
    })());
  },
};
