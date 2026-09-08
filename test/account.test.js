const { test } = require('node:test');
const assert = require('node:assert/strict');
const accountHandler = require('../account').createHandler;
const keyHandler = require('../keys').createHandler;
const { ApiError } = require('../lib/api-platform');
const res = () => ({ headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;} });
const req = body => ({method:'POST',headers:{origin:'https://www.adaptmypage.com'},body});
test('verification rejects an unverified Supabase user without setting a cookie', async()=>{
  const response=res();
  await accountHandler({rate:async()=>{},ipHash:()=> 'test',client:()=>({auth:{verifyOtp:async()=>({data:{user:{email:'test@example.com'},session:{access_token:'test'}}})}})})(req({action:'verify',token_hash:'a'.repeat(64)}),response);
  assert.equal(response.code,401); assert.equal(response.headers['Set-Cookie'],undefined);
});
test('verified Supabase login sets HttpOnly cookie and does not return tokens to JS',async()=>{
  const response=res();
  await accountHandler({rate:async()=>{},ipHash:()=> 'test',client:()=>({auth:{verifyOtp:async()=>({data:{user:{email:'test@example.com',email_confirmed_at:'2026-09-08'},session:{access_token:'fake-secret',expires_in:3600}}})}})})(req({action:'verify',token_hash:'a'.repeat(64)}),response);
  assert.equal(response.code,200); assert.match(response.headers['Set-Cookie'],/HttpOnly/);
  assert.deepEqual(response.data,{email:'test@example.com'});
  assert.doesNotMatch(JSON.stringify(response.data),/fake-secret/);
});
test('keys use server-verified owner, store a hash, show plaintext only at creation', async()=>{
  const calls=[],response=res();
  await keyHandler({account:async()=>({id:'verified-owner'}),rate:async()=>{},rpc:async(name,params)=>{calls.push(params);return {id:'new-key'};}})(req({action:'create',name:'My integration',owner:'attacker'}),response);
  assert.equal(response.code,201); assert.equal(calls[0].p_owner,'verified-owner');
  assert.match(calls[0].p_hash,/^[a-f0-9]{64}$/);
  assert.match(response.data.key,/^amp_/);
  assert.ok(!JSON.stringify(calls).includes(response.data.key));
});
test('a bearer API key alone cannot manage keys',async()=>{
  const response=res();
  await keyHandler({account:async()=>{throw new ApiError(401,'sign_in_required');}})({method:'GET',headers:{authorization:'Bearer amp_'+'a'.repeat(43)}},response);
  assert.equal(response.code,401);
});
test('cross-site mutations are rejected before account lookup',async()=>{
  let called=false;const response=res();
  await keyHandler({account:async()=>{called=true;return {id:'owner'};}})({method:'POST',headers:{origin:'https://evil.example'},body:{action:'create',name:'test'}},response);
  assert.equal(response.code,403);assert.equal(called,false);
});
