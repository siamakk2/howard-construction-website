// Shared data store — Upstash Redis. Crash-proof version.
module.exports = async function handler(req, res) {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      return res.status(200).json({ error: 'Database not configured.' });
    }

    const KEY = 'hci_site_data';
    const base = url.replace(/\/+$/, '');

    if (req.method === 'POST') {
      let bodyObj = req.body;
      if (typeof bodyObj === 'string') {
        try { bodyObj = JSON.parse(bodyObj); } catch (e) { bodyObj = {}; }
      }
      if (!bodyObj || typeof bodyObj !== 'object') bodyObj = {};
      const value = JSON.stringify(bodyObj.data || {});

      const resp = await fetch(base + '/set/' + KEY, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: value
      });
      const text = await resp.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) {}

      if (!resp.ok) {
        return res.status(200).json({ error: 'Upstash status ' + resp.status + ': ' + text });
      }
      return res.status(200).json({ ok: true, upstash: parsed || text });
    }

    const resp = await fetch(base + '/get/' + KEY, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const out = await resp.json();
    let data = null;
    if (out && out.result) {
      try { data = JSON.parse(out.result); } catch (e) { data = null; }
    }
    return res.status(200).json({ data: data });

  } catch (err) {
    return res.status(200).json({ error: 'Caught: ' + (err && err.message ? err.message : String(err)) });
  }
};
