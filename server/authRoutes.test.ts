import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import http from 'node:http';
import { createAuthRouter, hashPassword, verifyPassword } from './authRoutes.ts';

function startTestApp(usersFilePath: string): Promise<{ server: http.Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter({ usersFilePath, sessionSecret: 'test-secret-key-at-least-32-chars-long' }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test('hashPassword uses per-user random salt and scrypt verification rejects wrong passwords', () => {
  const h1 = hashPassword('MyStrongPassword!2026');
  const h2 = hashPassword('MyStrongPassword!2026');
  assert.notEqual(h1, h2);
  assert.ok(h1.startsWith('scrypt$'));
  assert.ok(!h1.includes('MyStrongPassword'));
  assert.equal(verifyPassword('MyStrongPassword!2026', h1), true);
  assert.equal(verifyPassword('WrongPassword!2026', h1), false);
});

test('auth routes support signup, duplicate prevention, hashed storage, login, session persistence, and logout', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onset-auth-test-'));
  const usersFile = path.join(tmpDir, 'users.json');
  const { server, baseUrl } = await startTestApp(usersFile);

  try {
    // 1. Signup
    const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'Trader@Example.com',
        password: 'SecurePassword123!',
        displayName: 'Quant Trader',
      }),
    });
    assert.equal(signupRes.status, 201);
    const signupJson = (await signupRes.json()) as any;
    assert.equal(signupJson.success, true);
    assert.equal(signupJson.user.email, 'trader@example.com');
    assert.equal(signupJson.user.displayName, 'Quant Trader');
    assert.equal(signupJson.user.passwordHash, undefined);
    const signupCookie = signupRes.headers.get('set-cookie');
    assert.ok(signupCookie && signupCookie.includes('onset_auth_session='));

    // Verify stored user file contains salted scrypt hash, never plaintext password
    const stored = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].email, 'trader@example.com');
    assert.ok(stored[0].passwordHash.startsWith('scrypt$'));
    assert.ok(!JSON.stringify(stored).includes('SecurePassword123!'));

    // 2. Duplicate email signup rejected
    const dupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'trader@example.com',
        password: 'AnotherPassword123!',
      }),
    });
    assert.equal(dupRes.status, 409);

    // 3. /api/auth/me with session cookie
    const cookieHeader = signupCookie!.split(';')[0];
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    const meJson = (await meRes.json()) as any;
    assert.equal(meJson.authenticated, true);
    assert.equal(meJson.user.email, 'trader@example.com');

    // 4. Logout clears session
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    assert.equal(logoutRes.status, 200);
    const logoutCookie = logoutRes.headers.get('set-cookie') || '';
    assert.ok(logoutCookie.includes('Max-Age=0'));

    // 5. Wrong password login rejected
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'trader@example.com',
        password: 'WrongPassword!',
      }),
    });
    assert.equal(badLoginRes.status, 401);

    // 6. Correct password login succeeds across fresh instance reading same file
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'TRADER@example.com',
        password: 'SecurePassword123!',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = (await loginRes.json()) as any;
    assert.equal(loginJson.success, true);
    assert.equal(loginJson.user.email, 'trader@example.com');
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
