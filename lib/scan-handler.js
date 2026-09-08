const platform = require('./api-platform');
const service = require('./scan-service');
function createHandler({ present = result => result } = {}) { return async (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); try { if (req.method !== 'POST') throw new platform.ApiError(405, 'method_not_allowed', 'Use POST with a JSON body.'); platform.bearer(req); const body = platform.readBody(req); const input = service.scanInput(body); const result = await service.scan(input); return res.status(200).json(present(result, body.locale)); } catch (error) { return platform.fail(res, error); } }; }
module.exports = { createHandler };
