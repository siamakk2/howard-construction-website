const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set' }); return; }

  return new Promise(function(resolve) {
    let raw = '';
    req.on('data', function(chunk) { raw += chunk; });
    req.on('end', function() {
      let body = {};
      try { body = JSON.parse(raw); } catch(e) {}

      const payload = JSON.stringify({
        model: body.model || 'claude-sonnet-4-6',
        max_tokens: body.max_tokens || 1200,
        system: body.system || '',
        messages: body.messages || []
      });

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const request = https.request(options, function(response) {
        let data = '';
        response.on('data', function(chunk) { data += chunk; });
        response.on('end', function() {
          try {
            res.status(response.statusCode).json(JSON.parse(data));
          } catch(e) {
            res.status(500).json({ error: 'Parse error: ' + data.substring(0, 200) });
          }
          resolve();
        });
      });

      request.on('error', function(e) {
        res.status(500).json({ error: e.message });
        resolve();
      });

      request.write(payload);
      request.end();
    });
  });
};
