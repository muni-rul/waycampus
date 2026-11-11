import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 16) {
      console.error(
        '[CampusNav Security Error] Fatal: JWT_SECRET environment variable is missing or shorter than 16 characters in production. Failing closed.'
      );
      process.exit(1);
    }
    return secret;
  }
  if (secret && secret.length >= 16) {
    return secret;
  }
  return 'campnav-dev-local-signing-key-christ-college';
}

const JWT_SECRET = resolveJwtSecret();

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'COLLEGE_ADMIN';
  name: string;
  email?: string;
  isPrimaryOwner?: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminTokenPayload {
  role: 'SUPER_ADMIN' | 'COLLEGE_ADMIN';
  username: string;
  campusId: string;
  name?: string;
  isPrimaryOwner?: boolean;
  iat?: number;
  exp?: number;
}

export interface FacultyTokenPayload {
  role: 'FACULTY';
  accountId: string;
  facultyId: string;
  name: string;
  email: string;
  campusId?: string;
  iat?: number;
  exp?: number;
}

export function generateFacultyToken(
  account: { id: string; facultyId: string; email: string },
  facultyName: string
): string {
  const payload: FacultyTokenPayload = {
    role: 'FACULTY',
    accountId: account.id,
    facultyId: account.facultyId,
    name: facultyName,
    email: account.email,
    campusId: 'campus_christ_main',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '14d' });
}

/**
 * Validates whether an email has a correct format and belongs to @christcollegeijk.edu.in
 */
export function isValidCollegeEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-z0-9][a-z0-9._%+-]*@christcollegeijk\.edu\.in$/;
  return emailRegex.test(trimmed);
}

/**
 * Generates a cryptographically secure 14-character temporary password.
 * - Exactly 14 characters
 * - Mixed case (uppercase and lowercase) and digits
 * - NO ambiguous characters: excludes '0', 'O', '1', 'l', 'I', 'o'
 * - Uses crypto.randomInt
 */
export function generateSecureTempPassword(): string {
  const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // excludes 'I', 'O' (24 chars)
  const LOWERCASE_CHARS = 'abcdefghjkmnpqrstuvwxyz'; // excludes 'l', 'o' (24 chars)
  const DIGIT_CHARS = '23456789'; // excludes '0', '1' (8 chars)
  const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + DIGIT_CHARS; // 56 chars

  // Guarantee mixed case and digits: at least 2 uppercase, 2 lowercase, 2 digits
  const chars: string[] = [
    UPPERCASE_CHARS[crypto.randomInt(0, UPPERCASE_CHARS.length)],
    UPPERCASE_CHARS[crypto.randomInt(0, UPPERCASE_CHARS.length)],
    LOWERCASE_CHARS[crypto.randomInt(0, LOWERCASE_CHARS.length)],
    LOWERCASE_CHARS[crypto.randomInt(0, LOWERCASE_CHARS.length)],
    DIGIT_CHARS[crypto.randomInt(0, DIGIT_CHARS.length)],
    DIGIT_CHARS[crypto.randomInt(0, DIGIT_CHARS.length)],
  ];

  // Fill remaining 8 characters from ALL_CHARS to total 14
  for (let i = 6; i < 14; i++) {
    chars.push(ALL_CHARS[crypto.randomInt(0, ALL_CHARS.length)]);
  }

  // Cryptographically shuffle array using Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join('');
}

export function generateAdminToken(
  username: string = 'admin',
  role: 'SUPER_ADMIN' | 'COLLEGE_ADMIN' = 'COLLEGE_ADMIN',
  name: string = 'Admin',
  isPrimaryOwner: boolean = false
): string {
  const payload: AdminTokenPayload = {
    role,
    username,
    name,
    isPrimaryOwner,
    campusId: 'campus_christ_main',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * In production, Admin features are DISABLED by default unless BOTH
 * ADMIN_PASSWORD and ADMIN_EMERGENCY_PIN are set with at least 16 characters.
 */
export function isAdminEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  const pass = process.env.ADMIN_PASSWORD?.trim();
  const pin = process.env.ADMIN_EMERGENCY_PIN?.trim();
  return Boolean(pass && pass.length >= 16 && pin && pin.length >= 16);
}

export function isEmergencyPinConfigured(): boolean {
  const pin = process.env.ADMIN_EMERGENCY_PIN?.trim();
  if (process.env.NODE_ENV === 'production') {
    return Boolean(pin && pin.length >= 16);
  }
  return Boolean(pin && pin.length > 0);
}

/**
 * Timing-safe PIN verification against ADMIN_EMERGENCY_PIN environment variable.
 */
export function verifyAdminPin(pin: string): boolean {
  if (!pin || typeof pin !== 'string') return false;
  if (!isAdminEnabled()) return false;

  const configuredPin = process.env.ADMIN_EMERGENCY_PIN?.trim();
  if (!configuredPin) {
    return false;
  }

  const pinBuf = Buffer.from(pin.trim(), 'utf8');
  const confBuf = Buffer.from(configuredPin, 'utf8');

  if (pinBuf.length !== confBuf.length) {
    // Constant-time dummy comparison to mitigate length-based timing leaks
    crypto.timingSafeEqual(pinBuf, pinBuf);
    return false;
  }

  return crypto.timingSafeEqual(pinBuf, confBuf);
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

/**
 * Evaluates whether a request originates strictly from loopback.
 * Only enabled in development mode (NODE_ENV !== 'production').
 * Does NOT rely on Host or X-Forwarded-* headers to prevent header spoofing.
 */
export function isLocalhostRequest(req: Request): boolean {
  if (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RENDER) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT)
  ) {
    return false;
  }

  // Allow test simulations in dev environment
  if (req.headers['x-simulate-remote'] === 'true') {
    return false;
  }

  // Check direct TCP socket remote address only
  const socketIp = (req.socket?.remoteAddress || '').toLowerCase();
  return (
    socketIp === '127.0.0.1' ||
    socketIp === '::1' ||
    socketIp === '::ffff:127.0.0.1'
  );
}

const LOCAL_DEV_ADMIN_USER: AdminTokenPayload = {
  role: 'SUPER_ADMIN',
  username: 'local_admin',
  campusId: 'campus_christ_main',
  name: 'Christ College Local Admin',
};

export const LOCAL_DEV_ADMIN_TOKEN = 'dev-localhost-unrestricted-bypass-token';

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  // 1. Fail closed: in production, if admin is disabled, return 404 Not Found
  if (!isAdminEnabled()) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  // 2. Local dev bypass: strictly non-production
  if (process.env.NODE_ENV !== 'production') {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token === LOCAL_DEV_ADMIN_TOKEN) {
        (req as any).user = LOCAL_DEV_ADMIN_USER;
        next();
        return;
      }
    }
    if (isLocalhostRequest(req)) {
      (req as any).user = LOCAL_DEV_ADMIN_USER;
      next();
      return;
    }
  }

  // 3. Token verification for production or remote admin access
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Admin authentication token required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (token === LOCAL_DEV_ADMIN_TOKEN) {
    res.status(403).json({ error: 'Forbidden: Dev bypass token rejected in production' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminTokenPayload;
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid admin credentials' });
    return;
  }
}

export function requireSuperAdminAuth(req: Request, res: Response, next: NextFunction): void {
  // 1. Fail closed: in production, if admin is disabled, return 404 Not Found
  if (!isAdminEnabled()) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  // 2. Local dev bypass: strictly non-production
  if (process.env.NODE_ENV !== 'production') {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token === LOCAL_DEV_ADMIN_TOKEN) {
        (req as any).user = LOCAL_DEV_ADMIN_USER;
        next();
        return;
      }
    }
    if (isLocalhostRequest(req)) {
      (req as any).user = LOCAL_DEV_ADMIN_USER;
      next();
      return;
    }
  }

  // 3. Token verification
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Admin authentication token required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (token === LOCAL_DEV_ADMIN_TOKEN) {
    res.status(403).json({ error: 'Forbidden: Dev bypass token rejected in production' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminTokenPayload;
    if (decoded.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required' });
      return;
    }
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid admin credentials' });
    return;
  }
}

export function requireFacultyAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as FacultyTokenPayload;

      // Enforce mustChangePassword on the server:
      // While true, reject every faculty route except change-password with 403 PASSWORD_CHANGE_REQUIRED.
      const isChangePasswordRoute =
        req.path.endsWith('/change-password') ||
        req.path.endsWith('/me/change-password');

      if (!isChangePasswordRoute) {
        // Late require to avoid circular initialization
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { store } = require('../db/store');
        const account = store.getFacultyAccountById(decoded.accountId);
        if (account?.mustChangePassword) {
          res.status(403).json({
            error: 'PASSWORD_CHANGE_REQUIRED',
            message: 'You must change your temporary password before accessing faculty portal resources.',
          });
          return;
        }
      }

      (req as any).faculty = decoded;
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Unauthorized: Invalid faculty credentials' });
      return;
    }
  }

  if (process.env.NODE_ENV !== 'production' && isLocalhostRequest(req)) {
    (req as any).faculty = {
      facultyId: 'fac_general',
      email: 'admin@christcollegeijk.edu.in',
      role: 'FACULTY',
      facultyCode: 'fac_general',
    };
    (req as any).user = LOCAL_DEV_ADMIN_USER;
    next();
    return;
  }

  res.status(401).json({ error: 'Faculty authorization token required' });
  return;
}
