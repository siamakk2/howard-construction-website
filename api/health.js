/**
 * Configuration health check.
 *
 * Reports ONLY whether each required environment variable is present, plus a
 * short fingerprint (length and first two characters) so a truncated or
 * pasted-wrong value can be spotted. Never returns a value.
 *
 * Deliberately unauthenticated: it exposes no secret, and if it required a
 * token it could not diagnose a missing token — the exact situation it exists
 * to diagnose. Marked noindex, no-store.
 */

function fingerprint(v) {
  if (!v) return null;
  const s = String(v);
  return { length: s.length, startsWith: s.slice(0, 2) + '…' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const vars = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    LEADS_ACCESS_TOKEN: process.env.LEADS_ACCESS_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };

  // Optional overrides — shown so the effective sender/recipient is visible.
  const effective = {
    sendingFrom: process.env.LEAD_FROM_EMAIL || 'website@howardconstructioninc.com (default)',
    deliveringTo: process.env.LEAD_TO_EMAIL || 'info@howardconstructioninc.com (default)',
  };

  const config = {};
  for (const [k, v] of Object.entries(vars)) {
    config[k] = { present: Boolean(v), ...(v ? fingerprint(v) : {}) };
  }

  // A Resend key always begins "re_". Flag an obviously wrong paste.
  const rk = vars.RESEND_API_KEY;
  if (rk && !String(rk).startsWith('re_')) {
    config.RESEND_API_KEY.warning =
      'Does not begin with "re_" — this may not be a Resend API key.';
  }

  const canEmail = Boolean(vars.RESEND_API_KEY);
  const canStore = Boolean(vars.UPSTASH_REDIS_REST_URL && vars.UPSTASH_REDIS_REST_TOKEN);

  return res.status(200).json({
    ok: true,
    deployedAt: new Date().toISOString(),
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'unknown',
    config,
    effective,
    summary: {
      leadEmailWillSend: canEmail,
      leadsAreStored: canStore,
      leadViewerEnabled: Boolean(vars.LEADS_ACCESS_TOKEN),
    },
    note: canEmail
      ? 'Email is configured. If sends still fail, verify the sending domain in Resend.'
      : 'RESEND_API_KEY is missing from THIS deployment. Confirm it is saved with the Production environment ticked, then redeploy.',
  });
};
