const dns = require('node:dns');
const { AsyncLocalStorage } = require('node:async_hooks');
const ipaddr = require('ipaddr.js');
const { fetch: request, Agent } = require('undici');
const scanContext = new AsyncLocalStorage();
function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
function validateUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Only public HTTP(S) URLs on standard ports can be scanned.');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || !hostname.includes('.') && !ipaddr.isValid(hostname)) throw new Error('Local network addresses cannot be scanned.');
  if (ipaddr.isValid(hostname) && !isPublicAddress(hostname)) throw new Error('Private or reserved network addresses cannot be scanned.');
  return url;
}
const dispatcher = new Agent({ connect: {
  // Validate the actual DNS results used by the socket, not a separate preflight.
  lookup(hostname, options, callback) {
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error);
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) return callback(new Error('Private or reserved DNS destination blocked.'));
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  }
} });
async function fetch(value, options = {}) {
  const context = scanContext.getStore();
  const first = context && context.requests++ === 0;
  try {
    let url = validateUrl(value);
    if (context?.rootError) throw new Error(context.rootError);
    if (first) context.origins = new Set([url.origin]);
    if (context?.origins && !context.origins.has(url.origin)) throw new Error('Cross-site scan requests are not allowed.');
    const signal = context ? AbortSignal.any([context.signal, options.signal].filter(Boolean)) : options.signal;
    for (let redirect = 0; redirect <= 4; redirect++) {
      signal?.throwIfAborted();
      const response = await request(url, { ...options, signal, redirect: 'manual', dispatcher });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirect === 4) throw new Error('Invalid or excessive redirects.');
        url = validateUrl(new URL(location, url));
        if (first) context.origins.add(url.origin);
        else if (context?.origins && !context.origins.has(url.origin)) throw new Error('Cross-site scan redirect blocked.');
        continue;
      }
      if (first && !response.ok) context.rootError = `The website returned HTTP ${response.status}.`;
      const chunks = []; let size = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            size += chunk.byteLength;
            if (size > 750000) { await reader.cancel(); throw new Error('Response exceeds the scan size limit.'); }
            chunks.push(Buffer.from(chunk));
          }
        } finally { reader.releaseLock(); }
      }
      const body = Buffer.concat(chunks);
      return { url: url.href, redirected: redirect > 0, headers: response.headers, status: response.status, ok: response.ok, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
    }
  } catch (error) {
    if (first) context.rootError = error.message;
    throw error;
  }
}
module.exports = { fetch, scanContext, validateUrl, isPublicAddress };
