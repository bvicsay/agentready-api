const { runScan, builtInRules, scanContext, validateUrl } = require('./agentready-engine.cjs');
const { ApiError } = require('./api-platform');
const profiles = ['auto', 'website', 'merchant', 'api', 'marketplace', 'mcp-server', 'agent-service'];
function scanInput(body) {
  if (typeof body?.url !== 'string' || !body.url.trim() || body.url.length > 2048) throw new ApiError(400, 'invalid_url', 'Enter a public website URL.');
  let target;
  try { target = validateUrl(/^[a-z][a-z\d+.-]*:/i.test(body.url.trim()) ? body.url.trim() : 'https://' + body.url.trim()); }
  catch { throw new ApiError(400, 'invalid_url', 'Only public HTTP(S) URLs on standard ports are supported.'); }
  if (target.search || target.hash) throw new ApiError(400, 'url_parameters_not_supported', 'Remove query parameters and fragments. Do not submit private or token-bearing URLs.');
  if (target.hostname === 'adaptmypage.com' || target.hostname === 'www.adaptmypage.com') {
    if (target.pathname.startsWith('/api/')) throw new ApiError(400, 'recursive_scan_blocked');
  }
  const profile = body.profile || 'auto';
  if (!profiles.includes(profile)) throw new ApiError(400, 'invalid_profile');
  return { target, profile };
}
async function scan(input) {
  const controller = new AbortController();
  const context = { signal: controller.signal, requests: 0, rootError: null };
  let timer;
  try {
    const pending = scanContext.run(context, () => runScan({
      target: input.target.href, profile: input.profile, maxPages: 12, maxRequests: 50,
      timeoutMs: 4000, rateLimit: { requestsPerSecond: 3 }, respectRobots: true, active: false, browser: false
    }, builtInRules));
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort();
      reject(new ApiError(504, 'scan_timeout', 'Scan exceeded 45 seconds. Try again later.'));
    }, 45000); });
    const result = await Promise.race([pending, deadline]);
    if (context.rootError) throw new ApiError(422, 'target_unavailable', 'The public website could not be fetched. It may be blocked, unavailable, or exceed scan limits.');
    return result;
  } finally { clearTimeout(timer); controller.abort(); }
}
// Conservative estimated infrastructure cost in micro-USD, not a billing promise.
// Charge full instance memory and all observed process CPU; concurrent requests overcount rather than undercount.
function scanCost(cpu, wallMs, failed) {
  if (failed) return 5000;
  return Math.min(5000, Math.max(100, Math.ceil(((cpu.user + cpu.system) / 1e6 * 0.184 / 3600 + 2 * wallMs / 1000 * 0.0152 / 3600 + 0.00001) * 1.3e6)));
}
module.exports = { scanInput, scan, scanCost, profiles };
