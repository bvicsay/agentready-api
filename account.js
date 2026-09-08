function createHandler(overrides = {}) {
const { ApiError, client, readBody, sameOrigin, ipHash, identityHash, rate, account, cookie, fail } = { ...require('./lib/api-platform'), ...overrides };
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const user = await account(req);
      return res.status(200).json({ email: user.email });
    }
    if (req.method !== 'POST') throw new ApiError(405, 'method_not_allowed');
    sameOrigin(req);
    const body = readBody(req);
    if (body.action === 'logout') {
      res.setHeader('Set-Cookie', cookie('', 0));
      return res.status(200).json({ ok: true });
    }
    await rate('account-ip:' + ipHash(req), 10, 60);
    if (body.action === 'login') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'invalid_email');
      if (!process.env.RESEND_API_KEY) throw new ApiError(503, 'email_unavailable');
      await rate('login-email:' + identityHash(email), 3, 3600);
      await rate('login-global-day', 80, 86400);
      await rate('login-global-month', 2400, 2592000);
      await rate('email-global-day', 90, 86400);
      await rate('email-global-month', 2700, 2592000);
      const { data, error } = await client().auth.admin.generateLink({ type: 'magiclink', email });
      if (error || !data.properties?.hashed_token) throw new ApiError(503, 'login_unavailable');
      const path = body.locale === 'de' ? '/de/developers/' : '/developers/';
      const verificationType = data.properties.verification_type === 'signup' ? 'signup' : 'magiclink';
      const link = 'https://www.adaptmypage.com' + path + '#token_hash=' + encodeURIComponent(data.properties.hashed_token) + '&type=' + verificationType;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Adapt My Page <reports@adaptmypage.com>', to: [email],
          subject: body.locale === 'de' ? 'Ihr Login für die AdaptMyPage API' : 'Sign in to your AdaptMyPage API account',
          text: 'Sign in securely to manage your free Agent Readiness API keys:\n\n' + link + '\n\nThis single-use link verifies your email address. If you did not request it, ignore this email. No newsletter subscription is created.'
        })
      });
      if (!response.ok) throw new ApiError(503, 'email_unavailable');
      return res.status(200).json({ ok: true, message: 'Check your email for your sign-in link. No newsletter signup is required.' });
    }
    if (body.action === 'verify') {
      if (typeof body.token_hash !== 'string' || !/^[a-f0-9]{40,128}$/i.test(body.token_hash)) throw new ApiError(400, 'invalid_login_link');
      const type = body.verification_type === 'signup' ? 'signup' : 'magiclink';
      const { data, error } = await client(false).auth.verifyOtp({ type, token_hash: body.token_hash });
      if (error || !data.user?.email_confirmed_at || !data.session) throw new ApiError(401, 'expired_login_link', 'This link is invalid or expired. Request a new sign-in email.');
      res.setHeader('Set-Cookie', cookie(data.session.access_token, Math.min(3600, data.session.expires_in)));
      return res.status(200).json({ email: data.user.email });
    }
    throw new ApiError(400, 'invalid_action');
  } catch (error) { return fail(res, error); }
};
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
