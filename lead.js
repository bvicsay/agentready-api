const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function reportEmail(input) {
  if (!input || typeof input !== 'object') return null;
  const host = typeof input.host === 'string' ? input.host.trim().replace(/[^a-z0-9.-]/gi, '') : '';
  const score = Number(input.score);
  if (!host || !Number.isFinite(score) || score < 0 || score > 100) return null;
  const german = input.locale === 'de';
  const names = german ? { pass: 'Erfüllt', fail: 'Nicht erfüllt', warn: 'Warnung', unknown: 'Unbekannt', info: 'Hinweis', not_applicable: 'Nicht anwendbar' } : { pass: 'Passed', fail: 'Failed', warn: 'Warning', unknown: 'Unknown', info: 'Information', not_applicable: 'Not applicable' };
  const checks = Array.isArray(input.checks) ? input.checks.slice(0, 150).map(check => ({
    label: String(check?.label || '').slice(0, 300),
    status: Object.hasOwn(names, check?.status) ? check.status : 'unknown',
    recommendation: String(check?.recommendation || '').slice(0, 2000),
    evidence: Array.isArray(check?.evidence) ? check.evidence.slice(0, 10).map(item => String(item?.message || '').slice(0, 1000)) : []
  })).filter(check => check.label) : [];
  const engine = String(input.engine || 'AgentReady').slice(0, 80);
  const profile = String(input.profile || 'website').slice(0, 40);
  const limitations = german ? 'AgentReady-Alpha-Score aus passiven HTTP-Prüfungen; kein Branchenstandard oder Nachweis erfolgreicher Agentenaktionen oder KI-Sichtbarkeit. Unbekannte Befunde sind keine fehlgeschlagenen Prüfungen. Originalbefunde sind auf Englisch.' : 'AgentReady alpha score from passive HTTP checks; not an industry benchmark or proof of successful agent actions or AI visibility. Unknown findings are not failed checks.';
  const details = check => [check.recommendation, ...check.evidence].filter(Boolean);
  const rows = checks.map(check => `<tr><td style="padding:14px 0;border-top:1px solid #d7ddd6"><strong style="color:${check.status === 'pass' ? '#224c2f' : check.status === 'fail' ? '#9a3131' : '#536057'}">${escapeHtml(names[check.status])} · ${escapeHtml(check.label)}</strong>${details(check).map(item => '<p style="margin:8px 0;font-size:13px;line-height:1.5">' + escapeHtml(item) + '</p>').join('')}</td></tr>`).join('');
  const scores = Array.isArray(input.scores) ? input.scores.slice(0, 20).map(item => `${String(item.label || '').slice(0,100)}: ${Number.isFinite(item.score) && Number.isFinite(item.weight) ? item.score + '/' + item.weight : '—'}`).join(' · ') : '';
  const heading = german ? 'Ihr Agent-Ready-Scan' : 'Your Agent-Ready Scan';
  return {
    subject: `${heading}: ${host}`,
    text: `${heading}\n\n${host}: ${Math.round(score)}/100\n${engine} · ${profile}\n${scores}\n\n${limitations}\n\n${checks.map(check => names[check.status] + ' · ' + check.label + '\n' + details(check).join('\n')).join('\n\n')}\n\nPowered by AgentReady: https://github.com/swarmclawai/agentready\nAdapt My Page`,
    html: `<!doctype html><html><body style="margin:0;background:#f1f0eb;color:#172019;font-family:Arial,sans-serif"><main style="max-width:680px;margin:0 auto;padding:42px 24px"><p>ADAPT MY PAGE · AGENT-READY SCAN</p><h1>${heading}</h1><h2>${escapeHtml(host)} · ${Math.round(score)}/100</h2><p>${escapeHtml(engine)} · ${escapeHtml(profile)}</p><p>${escapeHtml(scores)}</p><p style="font-size:13px;line-height:1.6">${escapeHtml(limitations)}</p><table style="width:100%;border-collapse:collapse">${rows}</table><p><a href="https://github.com/swarmclawai/agentready">Powered by AgentReady</a></p></main></body></html>`
  };
}

async function defaultGuard(req) {
  const { sameOrigin, rate, ipHash } = require('./lib/api-platform');
  sameOrigin(req);
  await rate('report-email:' + ipHash(req), 3, 3600);
  await rate('email-global-day', 90, 86400);
  await rate('email-global-month', 2700, 2592000);
}
function createHandler(guard = defaultGuard) { return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST to request a report.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
  catch { return res.status(400).json({ error: 'Invalid request.' }); }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!emailPattern.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const report = reportEmail(body.report);
  if (!report) return res.status(400).json({ error: 'Please run a scan before requesting a report.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Report delivery is temporarily unavailable. Please try again shortly.' });
  const headers = { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json', 'user-agent': 'adapt-my-page/1.0' };
  try {
    await guard(req);
    // Transactional delivery does not require or create a marketing contact.
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers,
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'Adapt My Page <reports@adaptmypage.com>', to: [email], reply_to: 'vicsay.barnabas@gmail.com', subject: report.subject, html: report.html, text: report.text })
    });
    if (!emailResponse.ok) throw new Error('The report email could not be sent.');
    let newsletter = 'not_requested';
    if (body.newsletter === true) {
      // Never update an existing contact or overwrite a prior unsubscribe.
      // Marketing failure must not turn successful report delivery into failure.
      try {
        const existing = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, { headers });
        if (existing.ok) newsletter = 'existing';
        else if (existing.status === 404) {
          const contactResponse = await fetch('https://api.resend.com/contacts', {
            method: 'POST', headers, body: JSON.stringify({ email, unsubscribed: false })
          });
          newsletter = contactResponse.status === 409 ? 'existing' : contactResponse.ok ? 'subscribed' : 'failed';
        } else newsletter = 'failed';
      } catch { newsletter = 'failed'; }
    }
    return res.status(200).json({ ok: true, emailed: true, newsletter });
  } catch (error) { return res.status(error.status || 502).json({ error: error.message || 'The report could not be sent.' }); }
};
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
