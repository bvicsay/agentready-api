const { test } = require('node:test');
const assert = require('node:assert/strict');
const { key, cryptoHash, bearer, sameOrigin, readBody, cookie, ApiError } = require('../lib/api-platform');
const { scanInput, scanCost } = require('../lib/scan-service');
const { createHandler } = require('../lib/scan-handler');
const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } });
test('API tokens contain 256 random bits, have unique hashes, and use Bearer only', () => {
  const a=key(), b=key();
  assert.match(a.token, /^amp_[A-Za-z0-9_-]{43}$/);
  assert.equal(a.hash, cryptoHash(a.token));
  assert.notEqual(a.hash,b.hash);
  assert.equal(bearer({headers:{authorization:'Bearer '+a.token}}),a.token);
  for (const authorization of ['', 'Basic '+a.token, 'Bearer invalid']) assert.throws(()=>bearer({headers:{authorization}}));
  assert.throws(()=>bearer({headers:{},query:{api_key:a.token}}));
});
test('rejects cross-site management requests and unsafe scan input', () => {
  assert.throws(()=>sameOrigin({headers:{origin:'https://evil.example'}}));
  assert.throws(()=>sameOrigin({headers:{}}));
  assert.doesNotThrow(()=>sameOrigin({headers:{origin:'https://www.adaptmypage.com'}}));
  for (const url of ['http://127.0.0.1','https://example.com/?token=secret','https://example.com/#secret','https://www.adaptmypage.com/api/v1/scan']) assert.throws(()=>scanInput({url}));
  assert.equal(scanInput({url:'example.com'}).target.href,'https://example.com/');
  assert.throws(()=>scanInput({url:'https://example.com',profile:'active'}));
});
test('request bounds and session cookie are explicit', () => {
  assert.throws(()=>readBody({body:'x'.repeat(4097)}));
  assert.throws(()=>readBody({body:'{'}));
  assert.throws(()=>readBody({body:[]}));
  assert.match(cookie('token'),/HttpOnly; SameSite=Lax/);
});
test('unauthenticated public API calls cannot invoke scanner or database', async () => {
  const res=response();
  await createHandler({rpc:async()=>{throw new Error('must not run');},scan:async()=>{throw new Error('must not run');}})({method:'POST',headers:{},body:{url:'https://example.com'}},res);
  assert.equal(res.code,401);
  assert.equal(res.body.error.code,'bearer_key_required');
});
test('reservations happen before scanning, finalization before response', async () => {
  const events=[], token=key().token, res=response();
  res.json=function(body){ events.push('response'); this.body=body; return this; };
  await createHandler({
    rpc:async(name)=>{events.push(name);return name==='amp_reserve'?{lease:'lease',remaining:9999,limit:10000}:null;},
    scan:async()=>{events.push('scan'); return {score:48,findings:[]};}
  })({method:'POST',headers:{authorization:'Bearer '+token},body:{url:'https://example.com'}},res);
  assert.deepEqual(events,['amp_reserve','scan','amp_finish','response']);
  assert.equal(res.code,200);
  assert.equal(res.headers['X-RateLimit-Remaining'],'9999');
});
test('quota and storage errors fail closed without scanning', async () => {
  for (const error of [new ApiError(429,'quota_exceeded',undefined,60),new ApiError(503,'storage_unavailable')]) {
    let scanned=false; const res=response();
    await createHandler({rpc:async()=>{throw error;},scan:async()=>{scanned=true;}})({method:'POST',headers:{authorization:'Bearer '+key().token},body:{url:'https://example.com'}},res);
    assert.equal(res.code,error.status); assert.equal(scanned,false);
  }
});
test('failed scan retains full cost reservation and gives structured error', async () => {
  let cost; const res=response();
  await createHandler({rpc:async(name,p)=>{if(name==='amp_finish')cost=p.p_cost;return {lease:'lease'};},scan:async()=>{throw new ApiError(504,'scan_timeout');}})({method:'POST',headers:{authorization:'Bearer '+key().token},body:{url:'https://example.com'}},res);
  assert.equal(cost,5000); assert.equal(res.code,504);
  assert.ok(scanCost({user:365000,system:0},14000,false)>=100);
  assert.equal(scanCost({user:0,system:0},0,true),5000);
});
