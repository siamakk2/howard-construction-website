// Shared data store for Howard Construction Site Manager — Upstash Redis.
module.exports = async function handler(req, res) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(500).json({ error: 'Database not configured.' });
    return;
  }

  const KEY = 'hci_site_data';
  const auth = { Authorization: 'Bearer ' + token };

  try {
    if (req.method === 'POST') {
      let data = {};
      if (req.body && typeof req.body === 'object') {
        data = req.body.data || {};
      } else if (typeof req.body === 'string') {
        try { data = (JSON.parse(req.body)).data || {}; } catch (e) { data = {}; }
      }
      const payload = JSON.stringify(data);

      const r = await fetch(url + '/set/' + KEY, {
        method: 'POST',
        headers: auth,
        body: payload
      });
      const out = await r.json();
      if (out && out.error) {
        res.status(500).json({ error: 'Upstash rejected: ' + out.error });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    const r = await fetch(url + '/get/' + KEY, { headers: auth });
    const out = await r.json();
    let data = null;
    if (out && out.result) {
      try { data = JSON.parse(out.result); } catch (e) { data = null; }
    }
    res.status(200).json({ data: data });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
