// Vercel serverless function — shared data store for Howard Construction Site Manager.
// Uses Upstash Redis (REST API) so Phil and his managers all see the same live data.
// Requires two environment variables in Vercel:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

module.exports = async function handler(req, res) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(500).json({ error: 'Database not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.' });
    return;
  }

  const KEY = 'hci_site_data';

  try {
    if (req.method === 'GET') {
      // Load the data
      const r = await fetch(`${url}/get/${KEY}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const out = await r.json();
      let data = null;
      if (out && out.result) {
        try { data = JSON.parse(out.result); } catch (e) { data = null; }
      }
      res.status(200).json({ data: data });
      return;
    }

    if (req.method === 'POST') {
      // Save the data
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const payload = JSON.stringify(body.data || {});
      const r = await fetch(`${url}/set/${KEY}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: payload
      });
      const out = await r.json();
      res.status(200).json({ ok: true, result: out });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
};
