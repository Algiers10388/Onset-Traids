import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express, { type Request, type Response, Router } from 'express';

export interface StoredAuthUser {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface PublicAuthUser {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string;
  provider: 'password';
}

const SESSION_COOKIE_NAME = 'onset_auth_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

function getOrCreateDefaultSecret(): string {
  const envSecret = (process.env.AUTH_SESSION_SECRET || '').trim();
  if (envSecret.length >= 16) return envSecret;

  const secretDir = path.resolve(process.cwd(), '.data');
  const secretPath = path.join(secretDir, 'auth-session-secret');
  try {
    if (fs.existsSync(secretPath)) {
      const saved = fs.readFileSync(secretPath, 'utf8').trim();
      if (saved.length >= 32) return saved;
    }
    fs.mkdirSync(secretDir, { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function toPublicUser(u: StoredAuthUser): PublicAuthUser {
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    provider: 'password',
  };
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function createAuthRouter(options?: {
  usersFilePath?: string;
  sessionSecret?: string;
}): Router {
  const router = express.Router();
  const usersFilePath =
    options?.usersFilePath || path.resolve(process.cwd(), '.data', 'auth-users.json');
  const sessionSecret = options?.sessionSecret || getOrCreateDefaultSecret();

  const usersByEmail = new Map<string, StoredAuthUser>();
  const usersByUid = new Map<string, StoredAuthUser>();

  const loadFromDisk = () => {
    try {
      if (!fs.existsSync(usersFilePath)) return;
      const raw = fs.readFileSync(usersFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const u of parsed) {
        if (u && typeof u.uid === 'string' && typeof u.email === 'string' && typeof u.passwordHash === 'string') {
          const email = normalizeEmail(u.email);
          const record: StoredAuthUser = {
            uid: u.uid,
            email,
            displayName: typeof u.displayName === 'string' && u.displayName.trim() ? u.displayName.trim() : email.split('@')[0],
            passwordHash: u.passwordHash,
            createdAt: u.createdAt || new Date().toISOString(),
            updatedAt: u.updatedAt || new Date().toISOString(),
            lastLoginAt: u.lastLoginAt || new Date().toISOString(),
          };
          usersByEmail.set(email, record);
          usersByUid.set(record.uid, record);
        }
      }
    } catch (err) {
      console.warn('Could not load auth users from disk:', err);
    }
  };

  const saveToDisk = () => {
    try {
      fs.mkdirSync(path.dirname(usersFilePath), { recursive: true });
      const list = Array.from(usersByUid.values());
      const tmp = `${usersFilePath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, usersFilePath);
    } catch (err) {
      console.warn('Could not persist auth users to disk:', err);
    }
  };

  loadFromDisk();

  const signSessionToken = (user: StoredAuthUser): string => {
    const payload = Buffer.from(
      JSON.stringify({
        uid: user.uid,
        email: user.email,
        exp: Date.now() + SESSION_TTL_MS,
      }),
      'utf8'
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', sessionSecret)
      .update(payload)
      .digest('base64url');
    return `${payload}.${sig}`;
  };

  const verifySessionToken = (token: string | undefined): StoredAuthUser | null => {
    if (!token) return null;
    const dotIdx = token.indexOf('.');
    if (dotIdx <= 0) return null;
    const payload = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const expectedSig = crypto
      .createHmac('sha256', sessionSecret)
      .update(payload)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!decoded?.uid || typeof decoded.exp !== 'number' || decoded.exp < Date.now()) {
        return null;
      }
      return usersByUid.get(decoded.uid) || null;
    } catch {
      return null;
    }
  };

  const setSessionCookie = (res: Response, token: string) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`
    );
  };

  const clearSessionCookie = (res: Response) => {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
  };

  router.post('/signup', (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const rawName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long.',
      });
    }
    if (password.length > 128) {
      return res.status(400).json({
        success: false,
        error: 'Password must be 128 characters or fewer.',
      });
    }
    if (usersByEmail.has(email)) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists. Please log in instead.',
      });
    }

    const now = new Date().toISOString();
    const uid = `usr_${crypto.randomBytes(12).toString('hex')}`;
    const displayName = rawName ? rawName.slice(0, 60) : email.split('@')[0];
    const passwordHash = hashPassword(password);

    const newUser: StoredAuthUser = {
      uid,
      email,
      displayName,
      passwordHash,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    usersByEmail.set(email, newUser);
    usersByUid.set(uid, newUser);
    saveToDisk();

    const token = signSessionToken(newUser);
    setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
      user: toPublicUser(newUser),
    });
  });

  router.post('/login', (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!isValidEmail(email) || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
    }

    const existing = usersByEmail.get(email);
    if (!existing || !verifyPassword(password, existing.passwordHash)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    existing.lastLoginAt = new Date().toISOString();
    existing.updatedAt = existing.lastLoginAt;
    saveToDisk();

    const token = signSessionToken(existing);
    setSessionCookie(res, token);

    return res.json({
      success: true,
      user: toPublicUser(existing),
    });
  });

  router.post('/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    return res.json({ success: true });
  });

  router.get('/me', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
    if (!user) {
      return res.json({
        success: true,
        authenticated: false,
        user: null,
      });
    }
    return res.json({
      success: true,
      authenticated: true,
      user: toPublicUser(user),
    });
  });

  return router;
}
