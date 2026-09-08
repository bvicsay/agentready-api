function createHandler(overrides = {}) {
const { ApiError, readBody, sameOrigin, account, rpc, key, fail, rate } = { ...require('./lib/api-platform'), ...overrides };
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!['GET', 'POST'].includes(req.method)) throw new ApiError(405, 'method_not_allowed');
    if (req.method === 'POST') sameOrigin(req);
    const user = await account(req);
    await rate('keys:' + user.id, 30, 60);
    const body = req.method === 'POST' ? readBody(req) : { action: 'list' };
    if (!['create', 'list', 'revoke'].includes(body.action)) throw new ApiError(400, 'invalid_action');
    if (body.action === 'create') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 60) throw new ApiError(400, 'invalid_key_name');
      const generated = key();
      const data = await rpc('amp_keys', { p_action: 'create', p_owner: user.id, p_hash: generated.hash, p_prefix: generated.prefix, p_name: name });
      return res.status(201).json({ ...data, key: generated.token });
    }
    if (body.action === 'revoke' && !/^[a-f0-9-]{36}$/i.test(body.id || '')) throw new ApiError(400, 'invalid_key_id');
    return res.status(200).json(await rpc('amp_keys', { p_action: body.action, p_owner: user.id, p_id: body.id || null }));
  } catch (error) { return fail(res, error); }
};
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
