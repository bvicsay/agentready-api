const http = require('node:http');
const { ApiError, fail } = require('./lib/api-platform');
const routes = { '/api/v1/scan': require('../v1/scan') };
function createServer() {
  return http.createServer({ requestTimeout: 65000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/healthz' && req.method === 'GET') return res.json({ ok: true });
      if (!pathname.startsWith('/api/')) throw new ApiError(404, 'not_found');
      const handler = routes[pathname];
      if (!handler) throw new ApiError(404, 'not_found');
      const max = 4096;
      if (Number(req.headers['content-length']) > max) throw new ApiError(413, 'request_too_large');
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > max) throw new ApiError(413, 'request_too_large'); chunks.push(chunk); }
      req.body = Buffer.concat(chunks).toString('utf8') || '{}';
      return await handler(req, res);
    } catch (error) {
      if (error instanceof URIError) error = new ApiError(400, 'invalid_path');
      if (!res.headersSent && !res.destroyed) fail(res, error);
    }
  });
}
if (require.main === module) {
  const server = createServer();
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('AgentReady API server ready'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 65000).unref(); });
}
module.exports = { createServer };
