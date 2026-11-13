import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccessGuard, tokenMatches } from './accessGuard.ts';

function run(guard: any, o: { url?: string; ip?: string; headers?: Record<string, string> }) {
  let passed = false; let status = 0;
  const req = { originalUrl: o.url ?? '/api/exchange/execute-order', headers: o.headers ?? {}, socket: { remoteAddress: o.ip ?? '127.0.0.1' } };
  const res = { status(c: number) { status = c; return this; }, json() { return this; } };
  guard(req, res, () => { passed = true; });
  return { passed, status };
}

test('local request without proxy headers passes', () => {
  assert.equal(run(createAccessGuard({ env: {} }), {}).passed, true);
  assert.equal(run(createAccessGuard({ env: {} }), { ip: '::1' }).passed, true);
  assert.equal(run(createAccessGuard({ env: {} }), { ip: '::ffff:127.0.0.1' }).passed, true);
});
test('remote request without token is refused with 403', () => {
  const r = run(createAccessGuard({ env: {} }), { ip: '203.0.113.9' });
  assert.deepEqual(r, { passed: false, status: 403 });
});
test('behind a proxy, loopback is NOT trusted (x-forwarded-for / x-forwarded-host / K_SERVICE)', () => {
  assert.equal(run(createAccessGuard({ env: {} }), { headers: { 'x-forwarded-for': '198.51.100.4' } }).passed, false);
  assert.equal(run(createAccessGuard({ env: {} }), { headers: { 'x-forwarded-host': 'example.com' } }).passed, false);
  assert.equal(run(createAccessGuard({ env: { K_SERVICE: 'run' } }), {}).passed, false);
});
test('valid token lets remote and proxied requests through; wrong/empty tokens do not', () => {
  const g = createAccessGuard({ token: 's3cret-token', env: {} });
  assert.equal(run(g, { ip: '203.0.113.9', headers: { 'x-api-token': 's3cret-token' } }).passed, true);
  assert.equal(run(g, { headers: { 'x-forwarded-for': '1.2.3.4', 'x-api-token': 's3cret-token' } }).passed, true);
  assert.equal(run(g, { ip: '203.0.113.9', headers: { 'x-api-token': 's3cret-tokeX' } }).passed, false);
  assert.equal(run(g, { ip: '203.0.113.9', headers: { 'x-api-token': '' } }).passed, false);
});
test('no token configured: an empty header never matches', () => {
  assert.equal(tokenMatches('', ''), false);
  assert.equal(run(createAccessGuard({ token: '', env: {} }), { ip: '203.0.113.9', headers: { 'x-api-token': '' } }).passed, false);
});
test('non-ASCII token header is rejected cleanly (no exception)', () => {
  const g = createAccessGuard({ token: 'abcd', env: {} });
  assert.doesNotThrow(() => run(g, { ip: '203.0.113.9', headers: { 'x-api-token': 'ab\u00e9' } }));
  assert.equal(run(g, { ip: '203.0.113.9', headers: { 'x-api-token': 'ab\u00e9' } }).passed, false); // 3 chars / 4 bytes vs 4 chars / 4 bytes
});
test('open paths: health, webhooks and firebase-authed routes pass from anywhere; others do not', () => {
  const g = createAccessGuard({ env: {} });
  for (const url of ['/api/health', '/api/fiat/stripe/webhook', '/api/fiat/paypal/webhook', '/api/user/sync', '/api/portfolio/save', '/api/strategy']) {
    assert.equal(run(g, { url, ip: '203.0.113.9' }).passed, true, url);
  }
  for (const url of ['/api/flash-arb/agent/initialize-signer', '/api/exchange/execute-order', '/api/fiat/deposit/card', '/api/wallet/receive-address', '/api/health/../exchange/x', '/api/healthz']) {
    assert.equal(run(g, { url, ip: '203.0.113.9' }).passed, false, url);
  }
});
test('query string does not change the decision', () => {
  const g = createAccessGuard({ env: {} });
  assert.equal(run(g, { url: '/api/exchange/execute-order?x=/api/health', ip: '203.0.113.9' }).passed, false);
  assert.equal(run(g, { url: '/api/health?x=1', ip: '203.0.113.9' }).passed, true);
});
