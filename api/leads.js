/**
 * Lead recovery endpoint.
 *
 * Every submission is written to Upstash before the email is sent. When email
 * delivery failed, those leads were still stored — this reads them back.
 *
 * SECURITY: default-closed. Requires LEADS_ACCESS_TOKEN to be set in the
 * environment; without it the endpoint returns 503 and does nothing. The token
 * is compared with timingSafeEqual and is never read from the request body.
 * This deliberately does not repeat the mistake in the old accounts endpoint,
 * which trusted a role supplied by the caller.
 */

const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const expected = process.env.LEADS_ACCESS_TOKEN;
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: 'Lead access is not configured. Set LEADS_ACCESS_TOKEN in Vercel to enable it.',
    });
  }

  const supplied =
    req.headers['x-access-key'] ||
    (req.query && req.query.key) ||
    '';

  if (!supplied || !safeEqual(supplied, expected)) {
    // Same response whether the key is missing or wrong.
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return res.status(503).json({ ok: false, error: 'Lead storage is not configured.' });
  }

  // POST marks a lead contacted. Same token gate as reading.
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || body.action !== 'contacted' || !body.id) {
      return res.status(400).json({ ok: false, error: 'Bad request.' });
    }
    const id = String(body.id);
    if (!/^lead_[0-9]+_[a-z0-9]+$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Bad id.' });
    }
    const base2 = url.replace(/\/+$/, '');
    const auth2 = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    try {
      const r = await fetch(base2 + '/get/' + encodeURIComponent(id), { headers: auth2 });
      if (!r.ok) return res.status(404).json({ ok: false, error: 'Not found.' });
      const raw = (await r.json()).result;
      if (!raw) return res.status(404).json({ ok: false, error: 'Not found.' });
      const lead = typeof raw === 'string' ? JSON.parse(raw) : raw;
      lead.contacted = Boolean(body.value);
      lead.contactedAt = lead.contacted ? new Date().toISOString() : null;
      const w = await fetch(base2 + '/set/' + encodeURIComponent(id), {
        method: 'POST', headers: auth2, body: JSON.stringify(lead),
      });
      if (!w.ok) return res.status(502).json({ ok: false, error: 'Could not save.' });
      return res.status(200).json({ ok: true, id, contacted: lead.contacted });
    } catch (e) {
      console.error('lead update failed', e);
      return res.status(500).json({ ok: false, error: 'Could not save.' });
    }
  }

  const base = url.replace(/\/+$/, '');
  const auth = { Authorization: 'Bearer ' + token };
  const limit = Math.min(parseInt((req.query && req.query.limit) || '100', 10) || 100, 500);

  try {
    const listRes = await fetch(base + '/lrange/hci_leads/0/' + (limit - 1), { headers: auth });
    if (!listRes.ok) {
      return res.status(502).json({ ok: false, error: 'Could not read the lead index.' });
    }
    const ids = (await listRes.json()).result || [];

    const leads = [];
    for (const id of ids) {
      try {
        const r = await fetch(base + '/get/' + encodeURIComponent(id), { headers: auth });
        if (!r.ok) continue;
        const raw = (await r.json()).result;
        if (!raw) continue;
        const lead = typeof raw === 'string' ? JSON.parse(raw) : raw;
        lead.id = id;
        leads.push(lead);
      } catch (e) { /* skip unreadable records */ }
    }

    // lpush already prepends, so the index is normally newest-first — but sort
    // explicitly on the timestamp so ordering cannot drift if a record is ever
    // rewritten or the index rebuilt.
    leads.sort(function (a, b) {
      return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
    });

    if ((req.query && req.query.format) === 'json') {
      return res.status(200).json({ ok: true, count: leads.length, leads });
    }

    function ago(iso) {
      const t = Date.parse(iso || '');
      if (!t) return '';
      const m = Math.floor((Date.now() - t) / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + ' min ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
      const d = Math.floor(h / 24);
      return d + (d === 1 ? ' day ago' : ' days ago');
    }
    const NEW_MS = 24 * 60 * 60 * 1000;

    const rows = leads.map((l, i) => `
      <tr${Date.now() - Date.parse(l.submittedAt || 0) < NEW_MS ? ' class="fresh"' : ''}>
        <td>${i === 0 ? '<span class="badge">NEWEST</span><br>' : ''}${esc((l.submittedAt || '').replace('T', ' ').slice(0, 16))}<br><span class="ago">${esc(ago(l.submittedAt))}</span></td>
        <td><strong>${esc(l.firstName)} ${esc(l.lastName)}</strong></td>
        <td><a href="tel:${esc(String(l.phone || '').replace(/[^0-9+]/g, ''))}">${esc(l.phone)}</a></td>
        <td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td>
        <td>${esc(l.projectType)}</td>
        <td>${esc(l.projectAddress)}</td>
        <td>${esc(l.budget)}</td>
        <td style="max-width:340px;">${esc(l.details)}</td>
      </tr>`).join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Stored leads — Howard Construction</title>
<style>
 body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:#F0F7FF;color:#0A1628;}
 h1{font-size:20px;margin:0 0 4px;}
 p.sub{color:#4A5568;margin:0 0 20px;font-size:14px;}
 table{border-collapse:collapse;width:100%;background:#fff;font-size:13.5px;
       box-shadow:0 2px 12px rgba(10,22,40,.08);border-radius:8px;overflow:hidden;}
 th{background:#0A1628;color:#fff;text-align:left;padding:10px 12px;font-size:12px;
    text-transform:uppercase;letter-spacing:.05em;}
 td{padding:10px 12px;border-bottom:1px solid #E2E8F0;vertical-align:top;}
 tr:nth-child(even) td{background:#F7FAFC;}
 a{color:#1565C0;}
 tr.fresh td{background:#FFFBEA!important;}
 .badge{display:inline-block;background:#F9A825;color:#0A1628;font-size:10px;font-weight:800;
        letter-spacing:.06em;padding:2px 7px;border-radius:4px;}
 .ago{color:#8A97A6;font-size:11.5px;}
 @media(max-width:820px){table,thead,tbody,th,td,tr{display:block;}
  thead{display:none;} tr{margin-bottom:14px;background:#fff;border-radius:8px;padding:8px;}
  td{border:none;border-bottom:1px solid #EDF2F7;}}
</style></head><body>
<h1>Stored leads (${leads.length})</h1>
<p class="sub">Newest first. Every form submission, including any whose notification email failed to send.</p>
<table>
  <thead><tr><th>When</th><th>Name</th><th>Phone</th><th>Email</th><th>Type</th>
             <th>Address</th><th>Budget</th><th>Details</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="8">No stored leads.</td></tr>'}</tbody>
</table>
</body></html>`);
  } catch (err) {
    console.error('leads endpoint error', err);
    return res.status(500).json({ ok: false, error: 'Could not read leads.' });
  }
};
