const platform = require('./api-platform');
const service = require('./scan-service');
function createHandler({ demo = false, present = result => result, ...overrides } = {}) {
  const p = { ...platform, ...overrides };
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let lease; let failed = true; const started = Date.now(); const cpu = process.cpuUsage();
    const release = async () => {
      if (!lease) return;
      try { await p.rpc('amp_finish', { p_id: lease, p_cost: service.scanCost(process.cpuUsage(cpu), Date.now() - started, failed) }); } catch {}
      lease = null;
    };
    try {
      if (req.method !== 'POST') throw new p.ApiError(405, 'method_not_allowed', 'Use POST with a JSON body.');
      const token = demo ? null : p.bearer(req);
      if (demo) p.sameOrigin(req);
      const body = p.readBody(req);
      const input = service.scanInput(body);
      if (process.env.API_PAUSED === 'true') throw new p.ApiError(503, 'api_paused', 'Scanning is temporarily paused to protect service capacity.');
      const reservation = await p.rpc('amp_reserve', { p_key_hash: token ? p.cryptoHash(token) : null,
        p_subject: demo ? 'demo:' + p.ipHash(req) : null, p_origin: input.target.origin, p_demo: demo });
      lease = reservation.lease;
      res.setHeader('X-RateLimit-Limit', String(reservation.limit));
      res.setHeader('X-RateLimit-Remaining', String(reservation.remaining));
      const result = await (overrides.scan || service.scan)(input);
      failed = false;
      await release();
      return res.status(200).json(present(result, body.locale));
    } catch (error) { await release(); return p.fail(res, error); }
  };
}
module.exports = { createHandler };
