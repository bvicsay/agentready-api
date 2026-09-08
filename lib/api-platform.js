const { createClient } = require('@supabase/supabase-js');
const { createHash, createHmac, randomBytes } = require('node:crypto');
const cryptoHash = value => createHash('sha256').update(value).digest('hex');
class ApiError extends Error {
  constructor(status, code, message, retryAfter) { super(message || code.replaceAll('_', ' ')); Object.assign(this, { status, code, retryAfter }); }
}
function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !secret || !anon) throw new ApiError(503, 'setup_incomplete', 'API account setup is temporarily unavailable. Please try again later.');
  return { url, secret, anon };
}
function client(admin = true) {
  const c = config();
  return createClient(c.url, admin ? c.secret : c.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(8000) }) }
  });
}
async function rpc(name, params) {
  const { data, error } = await client().rpc(name, params);
  if (error) throw new ApiError(503, 'storage_unavailable', 'The API usage service is unavailable. No scan was started.');
  if (data?.error) throw new ApiError(data.status || 429, data.error, undefined, data.retry_after);
  return data;
}
function readBody(req, max = 4096) {
  let body = req.body;
  if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body || {})) > max) throw new ApiError(413, 'request_too_large');
  try { if (typeof body === 'string') body = JSON.parse(body); }
  catch { throw new ApiError(400, 'invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'invalid_request');
  return body;
}
function bearer(req) {
  const match = /^Bearer (amp_[A-Za-z0-9_-]{43})$/i.exec(req.headers?.authorization || '');
  if (!match) throw new ApiError(401, 'bearer_key_required', 'Use Authorization: Bearer YOUR_API_KEY. Create a key at /developers/.');
  return match[1];
}
function identityHash(value) {
  return createHmac('sha256', config().secret).update(value).digest('hex');
}
function ipHash(req) {
  // Vercel overwrites this header at its edge. Never trust user-supplied X-Forwarded-For.
  const ip = process.env.VERCEL ? req.headers?.['x-vercel-forwarded-for'] :
    process.env.TRUST_CADDY === 'true' ? req.headers?.['x-real-ip'] : req.socket?.remoteAddress;
  if (!ip) throw new ApiError(503, 'client_identity_unavailable');
  return identityHash(String(ip).split(',')[0].trim());
}
async function rate(bucket, limit, seconds) {
  if (!await rpc('amp_rate', { p_bucket: bucket, p_limit: limit, p_seconds: seconds }))
    throw new ApiError(429, 'rate_limit', 'Too many requests. Please try again later.', seconds);
}
function sameOrigin(req) {
  const allowed = ['https://www.adaptmypage.com', 'https://adaptmypage.com'];
  if (!production()) allowed.push('http://localhost:4174');
  if (!allowed.includes(req.headers?.origin)) throw new ApiError(403, 'origin_not_allowed');
}
function production() { return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'; }
const cookieName = production() ? '__Host-amp_session' : 'amp_session';
function cookie(value, maxAge = 3600) {
  return cookieName + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (production() || process.env.VERCEL ? '; Secure' : '');
}
async function account(req) {
  const raw = (req.headers?.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='));
  let token;
  try { token = raw && decodeURIComponent(raw.slice(cookieName.length + 1)); } catch {}
  if (!token || token.length > 6000) throw new ApiError(401, 'sign_in_required');
  const { data, error } = await client().auth.getUser(token);
  if (error || !data.user?.email_confirmed_at || data.user.is_anonymous) throw new ApiError(401, 'sign_in_required');
  return data.user;
}
function fail(res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="AdaptMyPage API"');
  if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
  return res.status(status).json({ error: { code: error instanceof ApiError ? error.code : 'internal_error', message: error instanceof ApiError ? error.message : 'The request could not be completed.' } });
}
function key() {
  const token = 'amp_' + randomBytes(32).toString('base64url');
  return { token, hash: cryptoHash(token), prefix: token.slice(0, 12) };
}
module.exports = { ApiError, config, client, rpc, readBody, bearer, ipHash, identityHash, rate, sameOrigin, cookie, account, fail, key, cryptoHash };
