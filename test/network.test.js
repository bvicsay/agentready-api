const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { validateUrl, isPublicAddress } = require('../lib/public-fetch');
test('blocks private, loopback, mapped, reserved and non-HTTP destinations', () => {
  for (const url of ['http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://10.1.2.3', 'http://169.254.169.254', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://localhost', 'http://server.local', 'file:///etc/passwd', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com:8080']) assert.throws(() => validateUrl(url), url);
  assert.equal(validateUrl('https://example.com/page').hostname, 'example.com');
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('192.0.2.1'), false);
});
function transport(fetch, addresses = [{ address: '8.8.8.8', family: 4 }]) {
  let config;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('lib/public-fetch.js', 'utf8'), {
    require(name) {
      if (name === 'undici') return { fetch, Agent: class { constructor(value) { config = value; } } };
      if (name === 'node:dns') return { lookup(host, options, cb) { cb(null, addresses); } };
      return require(name);
    }, module, URL, AbortSignal, Buffer
  });
  return { ...module.exports, lookup: (...args) => config.connect.lookup(...args) };
}
test('actual socket DNS resolution rejects mixed public/private results', async () => {
  const client = transport(() => {}, [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]);
  await new Promise(resolve => client.lookup('example.com', { all: true }, error => { assert.match(error.message, /blocked/); resolve(); }));
});
test('private redirect is rejected before another request', async () => {
  let calls = 0;
  const client = transport(async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }); });
  await assert.rejects(client.fetch('https://example.com'), /Private/);
  assert.equal(calls, 1);
});
test('oversized streamed responses are rejected', async () => {
  const client = transport(async () => new Response('x'.repeat(750001)));
  await assert.rejects(client.fetch('https://example.com'), /size limit/);
});
test('aborted scans do not make a request', async () => {
  let calls = 0;
  const client = transport(async () => { calls++; return new Response('ok'); });
  await assert.rejects(client.scanContext.run({ requests: 0, signal: AbortSignal.abort() }, () => client.fetch('https://example.com')));
  assert.equal(calls, 0);
});
test('follow-up scans do not crawl unrelated sites', async () => {
  let calls = 0;
  const client = transport(async () => { calls++; return new Response('ok'); });
  await client.scanContext.run({ requests: 0, signal: new AbortController().signal }, async () => {
    await client.fetch('https://example.com');
    await assert.rejects(client.fetch('https://unrelated.com'), /Cross-site/);
  });
  assert.equal(calls, 1);
});
