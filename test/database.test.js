const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('real PostgreSQL migration: ownership, revocation, shared budget, concurrency and privileges', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key, email_confirmed_at timestamptz, banned_until timestamptz);");
    await db.exec(fs.readFileSync('supabase/migrations/202609080001_public_api.sql','utf8'));
    const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())',[a,b]);
    const call = async(sql,args=[]) => (await db.query(sql,args)).rows[0].result;
    const make = async(owner,hash)=> call("select public.amp_keys('create',$1,$2,'amp_test','test') result",[owner,hash]);
    const first=await make(a,'a'.repeat(64)); await make(a,'b'.repeat(64));
    const reserve = async(hash,origin)=>call('select public.amp_reserve($1,null,$2,false) result',[hash,origin]);
    const one=await reserve('a'.repeat(64),'https://example.com');
    assert.equal(one.remaining,9999);
    assert.equal((await reserve('b'.repeat(64),'https://example.com')).error,'scanner_busy');
    const two=await reserve('b'.repeat(64),'https://other.example');
    assert.equal(two.remaining,9998);
    assert.equal((await reserve('b'.repeat(64),'https://third.example')).error,'concurrency_limit');
    await db.query('select public.amp_finish($1,100)',[one.lease]);
    await db.query('select public.amp_finish($1,100)',[one.lease]); // must not refund twice
    const ledger=(await db.query("select cost from amp_private.buckets where id like 'global:%'")).rows[0];
    assert.equal(Number(ledger.cost),5100);
    await db.query('select public.amp_finish($1,5000)',[two.lease]);
    await call("select public.amp_keys('revoke',$1,null,null,null,$2) result",[b,first.id]);
    assert.ok((await reserve('a'.repeat(64),'https://example.com')).lease, 'other owner cannot revoke');
    await call("select public.amp_keys('revoke',$1,null,null,null,$2) result",[a,first.id]);
    assert.equal((await reserve('a'.repeat(64),'https://example.com')).error,'invalid_api_key');
    await db.query("update amp_private.buckets set cost=35000000 where id like 'global:%'");
    assert.equal((await reserve('b'.repeat(64),'https://other.example')).error,'shared_capacity_reached');
    assert.equal((await call("select public.amp_keys('list',$1) result",[b])).keys.length,0);
    await db.exec('set role anon');
    await assert.rejects(db.query("select public.amp_reserve(null,null,'https://example.com',true)"),/permission denied/);
    await assert.rejects(db.query('select * from amp_private.api_keys'),/permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
