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
    if (req.method === 'GET') {
      const r = await fetch(url + '/get/' + KEY, { headers: auth });
      const out = await r.json();
      let data = null;
      if (out && out.result) {
        try { data = JSON.parse(out.result); } catch (e) { data = null; }
      }
      res.status(200).json({ data: data });
      return;
    }

    if (req.method === 'POST') {
      let raw = '';
      if (req.body) {
        raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      } else {
        raw = await new Promise(function (resolve) {
          let d = '';
          req.on('data', function (c) { d += c; });
          req.on('end', function () { resolve(d); });
        });
      }

      let parsed = {};
      try { parsed = JSON.parse(raw); } catch (e) { parsed = {}; }
      const payload = JSON.stringify(parsed.data || {});

      const r = await fetch(url + '/set/' + KEY, {
        method: 'POST',
        headers: auth,
        body: payload
      });
      const out = await r.json();

      if (out && out.error) {
        res.status(500).json({ error: 'Upstash: ' + out.error });
        return;
      }
      res.status(200).json({ ok: true, result: out });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
};
