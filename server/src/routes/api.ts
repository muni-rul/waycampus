import { Router, Request, Response } from 'express';
import { store } from '../db/store';
import { SearchService } from '../services/searchService';
import { NavigationService } from '../services/navigationService';
import { PanoramaService } from '../services/panoramaService';
import rateLimit from 'express-rate-limit';
import {
  isAdminEnabled,
  requireAdminAuth,
  requireSuperAdminAuth,
  verifyAdminPin,
  isEmergencyPinConfigured,
  generateAdminToken,
  generateFacultyToken,
  requireFacultyAuth,
  verifyPassword,
  hashPassword,
  isValidCollegeEmail,
  generateSecureTempPassword,
} from '../middleware/auth';
import {
  VerificationStatus,
  CampusReport,
  CampusReportIssueType,
  CampusReportStatus,
  CampusReportPriority,
  FacultyStatusType,
  FacultyStatusSource,
} from '../../../shared/types';
import { VERIFIED_CLASSROOMS } from '../../../shared/academicData';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export const apiRouter = Router();

// Rate Limiter for Admin Authentication Endpoints (10 attempts / 15 minutes per IP)
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

// Rate Limiter for Faculty Authentication & Password Change (30 failed attempts / 15 minutes per IP)
const facultyAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

// Dummy bcrypt hash for constant-time comparison when faculty account is not found
const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMye.I9qL9rB8sZJgJbJ6Zl0Z8q7r6eY8yG';

// Admin Authentication Login Endpoint (Supports Username + Password OR Emergency PIN)
apiRouter.post('/admin/login', adminAuthLimiter, (req: Request, res: Response) => {
  // In production, admin login returns 404 unless admin is explicitly enabled
  if (!isAdminEnabled()) {
    return res.status(404).json({ error: 'Not Found' });
  }

  const { username, password, pin } = req.body;

  // 1. Username + Password Authentication
  if (username && password) {
    const adminUser = store.getAdminByUsername(String(username));
    if (!adminUser) {
      return res.status(401).json({ error: 'Invalid admin username or account not found.' });
    }

    const masterPass = process.env.ADMIN_PASSWORD?.trim();
    const isValid =
      verifyPassword(String(password), adminUser.passwordHash) ||
      (Boolean(masterPass && masterPass.length >= 16) && String(password) === masterPass);

    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password. Access denied.' });
    }

    // Auto-synchronize password hash if authenticated via master password
    if (masterPass && String(password) === masterPass && !verifyPassword(String(password), adminUser.passwordHash)) {
      adminUser.passwordHash = hashPassword(masterPass);
      store.persist(true);
    }

    const token = generateAdminToken(adminUser.username, adminUser.role, adminUser.name, Boolean(adminUser.isPrimaryOwner));
    return res.json({
      success: true,
      token,
      user: {
        id: adminUser.id,
        role: adminUser.role,
        username: adminUser.username,
        name: adminUser.name,
        email: adminUser.email,
        isPrimaryOwner: Boolean(adminUser.isPrimaryOwner),
        campusId: 'campus_christ_main',
        campusName: 'Christ College (Autonomous), Irinjalakuda',
      },
    });
  }

  // 2. Emergency PIN Authentication Fallback
  if (pin && typeof pin === 'string') {
    if (!verifyAdminPin(pin)) {
      return res.status(401).json({ error: 'Incorrect Admin PIN. Access denied.' });
    }

    const primaryOwner = store.getAdminUsers().find((u) => u.isPrimaryOwner) || store.getAdminUsers()[0];
    const username = primaryOwner?.username || 'admin';
    const name = primaryOwner?.name || 'College Super Admin';

    const token = generateAdminToken(username, 'SUPER_ADMIN', name, true);
    return res.json({
      success: true,
      token,
      user: {
        role: 'SUPER_ADMIN',
        username,
        name,
        isPrimaryOwner: true,
        campusId: 'campus_christ_main',
        campusName: 'Christ College (Autonomous), Irinjalakuda',
      },
    });
  }

  return res.status(400).json({ error: 'Username and password, or Admin PIN, are required.' });
});

// Admin User Management Endpoints
apiRouter.get('/admin/users', requireAdminAuth, (req: Request, res: Response) => {
  const users = store.getAdminUsers().map(({ passwordHash, ...safeUser }) => safeUser);
  res.json({ success: true, users });
});

apiRouter.post('/admin/users', requireSuperAdminAuth, (req: Request, res: Response) => {
  const { username, password, name, email, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const existing = store.getAdminByUsername(username);
  if (existing) {
    return res.status(409).json({ error: `Admin with username "${username}" already exists.` });
  }

  const newUser = store.createAdminUser({
    id: `admin_${Date.now()}`,
    username: username.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    role: role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'COLLEGE_ADMIN',
    name: name || username,
    email: email ? email.trim() : undefined,
    createdAt: new Date().toISOString(),
  });

  const { passwordHash, ...safe } = newUser;
  res.status(201).json({ success: true, user: safe });
});

apiRouter.patch('/admin/users/:id/credentials', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const caller = (req as any).user;
  const isSuperAdmin = caller && caller.role === 'SUPER_ADMIN';

  // Only super admin or user themselves can modify credentials
  const targetUser = store.getAdminUsers().find((u) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Admin user not found.' });
  }
  if (!isSuperAdmin && targetUser.username.toLowerCase() !== caller.username.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden: You cannot modify credentials for another administrator.' });
  }

  const updated = store.updateAdminCredentials(id, req.body, caller.username);
  if (!updated) {
    return res.status(400).json({ error: 'Could not update admin user.' });
  }

  const { passwordHash, ...safe } = updated;
  res.json({ success: true, user: safe, message: 'Admin credentials updated successfully.' });
});

apiRouter.post('/admin/transfer-ownership', requireSuperAdminAuth, (req: Request, res: Response) => {
  const { targetUsername, transferEmergencyPin, notes } = req.body;
  const caller = (req as any).user;

  if (!targetUsername || typeof targetUsername !== 'string') {
    return res.status(400).json({ error: 'Target username is required to transfer ownership.' });
  }

  const result = store.transferPrimaryOwnership(targetUsername.trim(), caller?.username || 'super_admin');
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  res.json({
    success: true,
    message: result.message,
    newOwner: targetUsername.trim(),
    handoverTimestamp: new Date().toISOString(),
  });
});

apiRouter.delete('/admin/users/:id', requireSuperAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const success = store.deleteAdminUser(id);
  if (!success) {
    return res.status(400).json({ error: 'Could not delete user. Primary super-admin cannot be deleted.' });
  }
  res.json({ success: true, message: 'User deleted.' });
});

// ─────────────────────────────────────────────────────────────
// SEARCH ALIASES MANAGEMENT (CONTROL CENTER)
// ─────────────────────────────────────────────────────────────
apiRouter.get('/admin/search/aliases', requireAdminAuth, (req: Request, res: Response) => {
  res.json({ success: true, aliases: store.getSearchAliases() });
});

apiRouter.post('/admin/search/aliases', requireAdminAuth, (req: Request, res: Response) => {
  const { alias, targetId, targetType, label } = req.body;
  const caller = (req as any).user;

  if (!alias || !targetId || !targetType) {
    return res.status(400).json({ error: 'Alias, targetId, and targetType are required.' });
  }

  const created = store.createSearchAlias({
    alias: alias.trim(),
    targetId: targetId.trim(),
    targetType,
    label: label || alias,
    createdBy: caller?.username || 'admin',
  });

  res.status(201).json({ success: true, alias: created });
});

apiRouter.delete('/admin/search/aliases/:id', requireAdminAuth, (req: Request, res: Response) => {
  const caller = (req as any).user;
  const success = store.deleteSearchAlias(req.params.id, caller?.username || 'admin');
  if (!success) {
    return res.status(404).json({ error: 'Search alias not found.' });
  }
  res.json({ success: true, message: 'Search alias removed.' });
});

// ─────────────────────────────────────────────────────────────
// DATA SNAPSHOTS & SAFE ROLLBACK (CONTROL CENTER)
// ─────────────────────────────────────────────────────────────
apiRouter.get('/admin/snapshots', requireAdminAuth, (req: Request, res: Response) => {
  res.json({ success: true, snapshots: store.getDataSnapshots() });
});

apiRouter.post('/admin/snapshots', requireAdminAuth, (req: Request, res: Response) => {
  const { name, description } = req.body;
  const caller = (req as any).user;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Snapshot name is required.' });
  }

  const snapshot = store.createDataSnapshot(name, description, caller?.username || 'admin');
  res.status(201).json({ success: true, snapshot });
});

apiRouter.post('/admin/snapshots/:id/rollback', requireSuperAdminAuth, (req: Request, res: Response) => {
  const caller = (req as any).user;
  const result = store.rollbackToSnapshot(req.params.id, caller?.username || 'admin');
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json({ success: true, message: result.message, restoredCounts: result.restoredCounts });
});

// ─────────────────────────────────────────────────────────────
// AUDIT LOGS (CONTROL CENTER)
// ─────────────────────────────────────────────────────────────
apiRouter.get('/admin/audit-actions', requireAdminAuth, (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit || '100'), 10);
  res.json({ success: true, actions: store.getAdminAuditActions(limit) });
});

// ─────────────────────────────────────────────────────────────
// COMPREHENSIVE SYSTEM VALIDATION (CONTROL CENTER)
// ─────────────────────────────────────────────────────────────
apiRouter.get('/admin/system/validate', requireAdminAuth, (req: Request, res: Response) => {
  const report = store.validateFullSystem();
  res.json({ success: true, report });
});

// ─────────────────────────────────────────────────────────────
// WAYCAMPUS — FACULTY AVAILABILITY / PRESENCE STATUS ENDPOINTS
// ─────────────────────────────────────────────────────────────

const ALLOWED_FACULTY_STATUSES: FacultyStatusType[] = [
  'AVAILABLE',
  'IN_CLASS',
  'BUSY',
  'NOT_AVAILABLE',
  'ON_LEAVE',
  'NOT_MARKED',
];

// 1. PUBLIC ENDPOINTS (Students & Public - Read-Only, No Auth Required)

apiRouter.get(['/faculty/statuses', '/faculty/status'], (req: Request, res: Response) => {
  try {
    const statuses = store.getFacultyStatuses();
    res.json({ success: true, statuses, data: Object.values(statuses) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve faculty statuses' });
  }
});

apiRouter.get('/faculty/:id/status', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const status = store.getFacultyStatus(id);
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve faculty status' });
  }
});

apiRouter.get('/faculty/verified-classrooms', (req: Request, res: Response) => {
  try {
    const blockFallbackMap: Record<string, string> = {
      AB: 'ab_044',
      SC: 'sc_205',
      MG: 'mg_259',
      SM: 'sm_241',
      SJ: 'sj_166',
      MT: 'mt_335',
      PO: 'node_mb_po_door',
      MB: 'node_mb_po_door',
    };
    const classrooms = (store.getClassrooms() || VERIFIED_CLASSROOMS)
      .map((c) => {
        const prefix = (c.roomNumber || '').replace(/\d+/g, '').toUpperCase();
        return {
          id: c.roomNumber,
          roomNumber: c.roomNumber,
          name: c.name,
          building: c.building || `${prefix} Block`,
          floor: c.floor,
          nodeId: c.nodeId || blockFallbackMap[prefix] || 'ab_044',
        };
      });
    res.json({ success: true, classrooms });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve verified classrooms' });
  }
});

// 2. FACULTY SELF-SERVICE ENDPOINTS (Requires Faculty Auth)

// Self-Activation / Account Claim is DISABLED to prevent unauthorized student activation
apiRouter.post('/faculty/activate', (req: Request, res: Response) => {
  return res.status(403).json({
    error: 'Faculty self-activation has been disabled for campus security. Please contact the College Administration Office to receive your official credentials.'
  });
});

// Returns list of faculty IDs that already have an active account
apiRouter.get('/faculty/registered-ids', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const accounts = (store as any).state.facultyAccounts || [];
    const registeredFacultyIds = accounts.map((a: any) => a.facultyId);
    res.json({ success: true, registeredFacultyIds });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch registered faculty IDs' });
  }
});

apiRouter.post('/faculty/login', facultyAuthLimiter, (req: Request, res: Response) => {
  try {
    const { identifier, email, facultyCode, password } = req.body;
    const term = String(identifier || email || facultyCode || '').trim().toLowerCase();

    if (!term || !password) {
      return res.status(400).json({ error: 'Faculty email/ID code and password are required.' });
    }

    const account = store.getFacultyAccountByEmailOrCode(term);
    if (!account) {
      // Execute dummy bcrypt compare to prevent timing side-channel user enumeration
      verifyPassword(String(password), DUMMY_BCRYPT_HASH);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (!account.isActive) {
      return res.status(403).json({ error: 'Your faculty account is disabled. Please contact the administrator.' });
    }

    const isValid = verifyPassword(String(password), account.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const teacher = store.getTeachers().find(
      (t) => t.id === account.facultyId || t.facultyId === account.facultyId
    );

    const token = generateFacultyToken(account, teacher?.name || 'Faculty Member');
    store.recordFacultyLogin(account.id);

    return res.json({
      success: true,
      token,
      mustChangePassword: Boolean(account.mustChangePassword),
      faculty: {
        accountId: account.id,
        facultyId: account.facultyId,
        name: teacher?.name || 'Faculty Member',
        designation: teacher?.designation,
        department: teacher?.departmentName || teacher?.departmentCategory,
        email: account.email,
        departmentPlaceId: teacher?.departmentPlaceId,
        departmentPlaceNodeId: teacher?.departmentPlaceNodeId,
        mustChangePassword: Boolean(account.mustChangePassword),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

apiRouter.get('/faculty/me', requireFacultyAuth, (req: Request, res: Response) => {
  try {
    const facultySession = (req as any).faculty;
    const teacher = store.getTeachers().find(
      (t) => t.id === facultySession.facultyId || t.facultyId === facultySession.facultyId
    );
    const account = store.getFacultyAccountById(facultySession.accountId);
    const status = store.getFacultyStatus(facultySession.facultyId);

    res.json({
      success: true,
      faculty: teacher,
      status,
      account: account
        ? {
            id: account.id,
            facultyId: account.facultyId,
            email: account.email,
            facultyCode: account.facultyCode,
            isActive: account.isActive,
            lastLoginAt: account.lastLoginAt,
          }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

apiRouter.patch('/faculty/me/status', requireFacultyAuth, (req: Request, res: Response) => {
  try {
    // STRICT SECURITY: Authoritative faculty identity is derived exclusively from the token
    const facultySession = (req as any).faculty;
    const facultyId = facultySession.facultyId;

    const { status, locationPlaceId, durationMinutes } = req.body;

    if (!status || !ALLOWED_FACULTY_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status "${status}". Allowed values: ${ALLOWED_FACULTY_STATUSES.join(', ')}`,
      });
    }

    const { record, log } = store.setFacultyStatus({
      facultyId,
      status,
      locationPlaceId,
      source: 'FACULTY',
      updatedBy: facultyId,
      durationMinutes: typeof durationMinutes === 'number' ? durationMinutes : undefined,
    });

    res.json({
      success: true,
      message: 'Status updated successfully.',
      status: record,
      log,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to update faculty status.' });
  }
});

apiRouter.post('/faculty/me/change-password', requireFacultyAuth, facultyAuthLimiter, (req: Request, res: Response) => {
  try {
    const facultySession = (req as any).faculty;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (String(newPassword).length < 10) {
      return res.status(400).json({ error: 'New password must be at least 10 characters.' });
    }

    if (String(currentPassword) === String(newPassword)) {
      return res.status(400).json({ error: 'New password cannot be the same as your current temporary password.' });
    }

    const account = store.getFacultyAccountById(facultySession.accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const isValid = verifyPassword(String(currentPassword), account.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    store.resetFacultyAccountPassword(account.id, String(newPassword), false, `Faculty:${account.facultyId}`);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to change password.' });
  }
});

// 3. ADMIN FACULTY MANAGEMENT & MONITOR ENDPOINTS (Requires Admin Auth)

apiRouter.get('/admin/faculty/accounts', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const teachers = store.getTeachers();
    const statuses = store.getFacultyStatuses();
    const accounts = store.getFacultyAccounts().map((a) => {
      const teacher = teachers.find((t) => t.id === a.facultyId || t.facultyId === a.facultyId);
      const curStatus = statuses[a.facultyId];
      return {
        id: a.id,
        facultyId: a.facultyId,
        facultyName: teacher?.name || 'Unknown',
        designation: teacher?.designation || '',
        departmentName: teacher?.departmentName || teacher?.departmentCategory || '',
        email: a.email,
        facultyCode: a.facultyCode,
        isActive: a.isActive,
        mustChangePassword: Boolean(a.mustChangePassword),
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        currentStatus: curStatus?.status || 'NOT_AVAILABLE',
        statusUpdatedAt: curStatus?.updatedAt,
        locationName: curStatus?.locationName,
      };
    });
    res.json({ success: true, accounts });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve faculty accounts' });
  }
});

apiRouter.post('/admin/faculty/accounts', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { facultyId, email, facultyCode, password } = req.body;
    if (!facultyId || !email) {
      return res.status(400).json({ error: 'facultyId and email are required.' });
    }

    const caller = (req as any).user?.username || 'Admin';

    if (!isValidCollegeEmail(email)) {
      return res.status(400).json({ error: 'Email must be a valid @christcollegeijk.edu.in address.' });
    }

    const account = store.createFacultyAccount({
      facultyId: String(facultyId).trim(),
      email: String(email).trim().toLowerCase(),
      facultyCode: facultyCode ? String(facultyCode).trim() : undefined,
      password: password ? String(password).trim() : undefined,
      mustChangePassword: true,
      performedBy: caller,
    });

    const teacher = store.getTeachers().find((t) => t.id === account.facultyId || t.facultyId === account.facultyId);

    res.status(201).json({
      success: true,
      temporaryPassword: account.temporaryPassword,
      account: {
        id: account.id,
        facultyId: account.facultyId,
        facultyName: teacher?.name || 'Faculty Member',
        email: account.email,
        facultyCode: account.facultyCode,
        isActive: account.isActive,
        mustChangePassword: account.mustChangePassword,
        createdAt: account.createdAt,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create faculty account.' });
  }
});

apiRouter.post('/admin/faculty/batch-provision', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { facultyList } = req.body;
    if (!Array.isArray(facultyList) || facultyList.length === 0) {
      return res.status(400).json({ error: 'facultyList array is required.' });
    }

    const caller = (req as any).user?.username || 'Admin';
    const created: any[] = [];
    const skipped: any[] = [];

    const batchEmails = new Map<string, string>();

    facultyList.forEach((item: { facultyId: string; email?: string; password?: string }) => {
      try {
        if (!item.facultyId) {
          skipped.push({ facultyId: 'unknown', reason: 'facultyId is required' });
          return;
        }

        const teacher = store.getTeachers().find(
          (t) => t.id === item.facultyId || t.facultyId === item.facultyId
        );
        if (!teacher) {
          skipped.push({ facultyId: item.facultyId, reason: 'Faculty record not found' });
          return;
        }

        const rawEmail = (item.email || teacher.officialEmail || '').trim().toLowerCase();
        if (!rawEmail) {
          skipped.push({ facultyId: item.facultyId, name: teacher.name, reason: 'Missing college email' });
          return;
        }

        if (!isValidCollegeEmail(rawEmail)) {
          skipped.push({
            facultyId: item.facultyId,
            name: teacher.name,
            reason: 'Invalid email domain or format (must be @christcollegeijk.edu.in)',
          });
          return;
        }

        if (batchEmails.has(rawEmail)) {
          skipped.push({
            facultyId: item.facultyId,
            name: teacher.name,
            reason: `Duplicate email "${rawEmail}" in request`,
          });
          return;
        }
        batchEmails.set(rawEmail, item.facultyId);

        const existingAcc = store.getFacultyAccountByFacultyId(item.facultyId);
        if (existingAcc) {
          skipped.push({ facultyId: item.facultyId, name: teacher.name, reason: 'Account already exists' });
          return;
        }

        const account = store.createFacultyAccount({
          facultyId: item.facultyId,
          email: rawEmail,
          password: item.password,
          mustChangePassword: true,
          performedBy: caller,
        });

        created.push({
          facultyId: account.facultyId,
          name: teacher.name,
          designation: teacher.designation || 'Faculty Member',
          department: teacher.departmentName || teacher.departmentCategory || '',
          email: account.email,
          loginId: account.facultyCode || account.facultyId,
          temporaryPassword: account.temporaryPassword,
        });
      } catch (e: any) {
        skipped.push({ facultyId: item.facultyId, reason: e.message });
      }
    });

    res.json({
      success: true,
      message: `Provisioned ${created.length} accounts (${skipped.length} skipped).`,
      created,
      skipped,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Batch provision failed' });
  }
});

apiRouter.patch('/admin/faculty/accounts/:id/toggle-active', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const caller = (req as any).user?.username || 'Admin';

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: '"isActive" boolean field is required.' });
    }

    const updated = store.toggleFacultyAccountActive(id, isActive, caller);
    if (!updated) {
      return res.status(404).json({ error: 'Faculty account not found.' });
    }

    res.json({
      success: true,
      message: `Faculty account ${isActive ? 'activated' : 'disabled'} successfully.`,
      account: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle account active status.' });
  }
});

apiRouter.post('/admin/faculty/accounts/:id/reset-password', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    const caller = (req as any).user?.username || 'Admin';

    if (newPassword && String(newPassword).length < 10) {
      return res.status(400).json({ error: 'newPassword must be at least 10 characters.' });
    }

    const result = store.resetFacultyAccountPassword(
      id,
      newPassword ? String(newPassword) : undefined,
      true,
      caller
    );
    if (!result) {
      return res.status(404).json({ error: 'Faculty account not found.' });
    }

    res.json({
      success: true,
      temporaryPassword: result.temporaryPassword,
      message: 'Faculty password reset successfully.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to reset password.' });
  }
});

/**
 * Validates that a target URL for public email scanning points strictly to an HTTPS
 * endpoint on christcollegeijk.edu.in (or subdomain) and blocks any internal or loopback SSRF attempts.
 */
export function isSafeChristCollegeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== 'christcollegeijk.edu.in' && !hostname.endsWith('.christcollegeijk.edu.in')) {
      return false;
    }
    // Block IP addresses, localhost, and non-FQDN hostnames (SSRF defense)
    if (
      hostname === 'localhost' ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
      hostname.includes(':') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely fetches a public Christ College faculty webpage with SSRF prevention,
 * strict HTTPS & domain boundary validation on all redirects (max 2), 5s timeout, and 1MB size cap.
 */
async function fetchSafePublicFacultyPage(url: string, maxRedirects: number = 2): Promise<string | null> {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    if (!isSafeChristCollegeUrl(currentUrl)) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const pageRes = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'CampusNav-Scan/1.0 (Christ College Faculty Verification)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeout);

      // Enforce domain check on redirects
      if ([301, 302, 303, 307, 308].includes(pageRes.status)) {
        const location = pageRes.headers.get('location');
        if (!location) return null;
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isSafeChristCollegeUrl(nextUrl)) return null;
        currentUrl = nextUrl;
        continue;
      }

      if (!pageRes.ok) return null;

      // Cap response size to 1MB (1,048,576 bytes)
      const reader = pageRes.body?.getReader();
      if (!reader) {
        const text = await pageRes.text();
        return text.slice(0, 1024 * 1024);
      }

      let receivedBytes = 0;
      const chunks: Uint8Array[] = [];
      const MAX_BYTES = 1024 * 1024;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.length;
          chunks.push(value);
          if (receivedBytes >= MAX_BYTES) {
            reader.cancel();
            break;
          }
        }
      }

      const totalBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      return totalBuffer.toString('utf-8', 0, MAX_BYTES);
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }
  return null;
}

apiRouter.post('/admin/faculty/scan-public-emails', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const teachers = store.getTeachers();
    const missing = teachers.filter((t) => !t.officialEmail && (t.profileLink || t.sourceUrl || (t as any).profileUrl));
    const suggestions: any[] = [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@christcollegeijk\.edu\.in/gi;

    // Scan up to 20 profiles at a time with concurrency capped at 5
    const batch = missing.slice(0, 20);
    const CONCURRENCY = 5;

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (item) => {
          const rawUrl = item.profileLink || item.sourceUrl || (item as any).profileUrl;
          if (!rawUrl || typeof rawUrl !== 'string') return;
          try {
            const html = await fetchSafePublicFacultyPage(rawUrl.trim());
            if (html) {
              const matches = html.match(emailRegex);
              if (matches && matches.length > 0) {
                const cleanEmail = matches[0].trim().toLowerCase();
                suggestions.push({
                  facultyId: item.id,
                  name: item.name,
                  department: item.departmentName || item.department || '',
                  suggestedEmail: cleanEmail,
                  sourceUrl: rawUrl,
                  isSuggestion: true,
                });
              }
            }
          } catch {}
        })
      );
    }

    res.json({
      success: true,
      scannedCount: batch.length,
      suggestions,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to scan public faculty pages.' });
  }
});

// Preview CSV Email Import
apiRouter.post('/admin/faculty/preview-email-import', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    const teachers = store.getTeachers();
    const valid: any[] = [];
    const invalid: any[] = [];
    const seenEmailsInFile = new Set<string>();

    for (const row of rows) {
      const rawFacultyId = String(row.facultyId || row.faculty_id || '').trim();
      const rawEmail = String(row.email || '').trim().toLowerCase();

      if (!rawFacultyId) {
        invalid.push({ facultyId: rawFacultyId || '(empty)', email: rawEmail, reason: 'Missing faculty ID' });
        continue;
      }

      const teacher = teachers.find(t => t.id === rawFacultyId || t.facultyId === rawFacultyId);
      if (!teacher) {
        invalid.push({ facultyId: rawFacultyId, email: rawEmail, reason: `Unknown faculty ID "${rawFacultyId}"` });
        continue;
      }

      if (!rawEmail) {
        invalid.push({ facultyId: rawFacultyId, email: '', reason: 'Empty email address' });
        continue;
      }

      if (!isValidCollegeEmail(rawEmail)) {
        invalid.push({ facultyId: rawFacultyId, email: rawEmail, reason: 'Invalid format; must belong to @christcollegeijk.edu.in' });
        continue;
      }

      if (seenEmailsInFile.has(rawEmail)) {
        invalid.push({ facultyId: rawFacultyId, email: rawEmail, reason: 'Duplicate email within uploaded CSV' });
        continue;
      }
      seenEmailsInFile.add(rawEmail);

      // Check collision with other teachers
      const otherTeacher = teachers.find(t =>
        (t.id !== teacher.id && t.facultyId !== teacher.id) &&
        (t.officialEmail || '').trim().toLowerCase() === rawEmail
      );
      if (otherTeacher) {
        invalid.push({ facultyId: rawFacultyId, email: rawEmail, reason: `Email is already assigned to ${otherTeacher.name} (${otherTeacher.id})` });
        continue;
      }

      valid.push({
        facultyId: teacher.id,
        name: teacher.name,
        department: teacher.departmentName || teacher.departmentCategory || '',
        oldEmail: teacher.officialEmail || '',
        newEmail: rawEmail,
      });
    }

    res.json({ success: true, valid, invalid });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to preview email import' });
  }
});

// Confirm CSV Email Import
apiRouter.post('/admin/faculty/confirm-email-import', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Non-empty rows array required' });
    }

    const caller = (req as any).user?.username || 'Admin';
    const teachers = store.getTeachers();
    let updatedCount = 0;

    for (const row of rows) {
      const fId = String(row.facultyId || row.faculty_id).trim();
      const email = String(row.email || row.newEmail).trim().toLowerCase();

      if (!fId || !email || !isValidCollegeEmail(email)) continue;
      const teacher = teachers.find(t => t.id === fId || t.facultyId === fId);
      if (!teacher) continue;

      store.updateTeacher(teacher.id, { officialEmail: email }, caller);
      updatedCount++;
    }

    res.json({
      success: true,
      message: `Successfully updated ${updatedCount} faculty email(s).`,
      updatedCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to confirm email import' });
  }
});

// Cloud Firestore Persistence Status (Control Center Header)
apiRouter.get('/admin/persistence/status', requireAdminAuth, (req: Request, res: Response) => {
  const health = store.getRepositoryHealth();
  res.json({
    success: true,
    status: {
      provider: health.provider === 'firestore' ? 'Google Cloud Firestore' : 'In-Memory (Development/Offline)',
      connected: health.connected,
      configured: health.connected,
      status: health.status,
      lastSyncMessage: health.status,
      projectId: health.projectId || 'not configured',
      lastSyncAt: health.lastSyncAt || null,
      error: health.error,
    },
  });
});

apiRouter.post('/admin/faculty/:facultyId/override-status', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { facultyId } = req.params;
    const { status, locationPlaceId, reason, durationMinutes } = req.body;

    if (!status || !ALLOWED_FACULTY_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status "${status}". Allowed values: ${ALLOWED_FACULTY_STATUSES.join(', ')}`,
      });
    }

    const adminUser = (req as any).user?.username || 'Admin';

    const { record, log } = store.setFacultyStatus({
      facultyId,
      status,
      locationPlaceId,
      source: 'ADMIN',
      updatedBy: adminUser,
      adminReason: reason?.trim() || 'Admin Override',
      durationMinutes: typeof durationMinutes === 'number' ? durationMinutes : undefined,
    });

    res.json({
      success: true,
      message: 'Faculty status overridden by admin.',
      status: record,
      log,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to override faculty status.' });
  }
});

apiRouter.get('/admin/faculty/status-logs', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const facultyId = typeof req.query.facultyId === 'string' ? req.query.facultyId : undefined;
    const logs = store.getFacultyStatusAuditLogs(facultyId);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve status audit logs' });
  }
});

// Health Check — reports database status (ok/degraded)
apiRouter.get('/health', (req: Request, res: Response) => {
  const dbHealth = store.getRepositoryHealth();
  const isHealthy = dbHealth.status === 'ok';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    database: dbHealth.status,
    platform: 'CampusNav',
    version: '1.0.0',
    currentTenant: 'Christ College (Autonomous), Irinjalakuda',
    totalBuildings: store.getBuildings().length,
    totalRooms: store.getRooms().length,
    totalNodes: store.getNavigationNodes().length,
    totalEdges: store.getNavigationEdges().length,
  });
});

// Campus Metadata & Virtual Tour info
apiRouter.get('/campus/info', (req: Request, res: Response) => {
  res.json({
    name: 'Christ College (Autonomous)',
    location: 'Irinjalakuda North P.O., Thrissur - 680125, Kerala, INDIA',
    gpsCenter: { lat: 10.354794, lng: 76.212791 },
    phone: '+91 480 2825258',
    mobile: '+91 7907129338',
    email: 'office@christcollegeijk.edu.in',
    website: 'https://christcollegeijk.edu.in/',
    virtualTourUrl: 'https://christcollegeijk.edu.in/virtual-tour/',
  });
});

// Real GPS to Campus 3D Local Coordinate Converter
apiRouter.post('/location/gps-to-local', (req: Request, res: Response) => {
  const { lat, lng, accuracy } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Valid numeric lat and lng are required' });
  }

  const LAT0 = 10.354794;
  const LNG0 = 76.212791;
  const METERS_PER_LAT = 110574;
  const METERS_PER_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

  const x = Math.round((lng - LNG0) * METERS_PER_LNG);
  const z = Math.round(-(lat - LAT0) * METERS_PER_LAT);
  const y = 0;

  const distFromCenter = Math.round(Math.sqrt(x * x + z * z));
  const isInsideCampus = distFromCenter <= 500;

  // Find nearest outdoor or entrance node
  const nodes = store.getNavigationNodes();
  let nearestNode = nodes[0];
  let minNodeDist = Infinity;

  for (const node of nodes) {
    if (node.floorNumber === 0) {
      const dx = node.x - x;
      const dz = node.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < minNodeDist) {
        minNodeDist = d;
        nearestNode = node;
      }
    }
  }

  res.json({
    gpsCoordinates: { lat, lng, accuracy: accuracy || 10 },
    local3DCoordinates: { x, y, z },
    distFromCampusCenterMeters: distFromCenter,
    isInsideCampus,
    nearestNodeId: nearestNode.id,
    nearestNodeLabel: nearestNode.label || 'Campus Walkway',
    nearestNodeDistanceMeters: Math.round(minNodeDist),
  });
});

// Search
apiRouter.get('/search', (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q : typeof req.query.query === 'string' ? req.query.query : '';
  if (!query) {
    return res.status(400).json({ error: 'Query string is required' });
  }
  const results = SearchService.search(query);
  res.json({ query, totalResults: results.length, results });
});

apiRouter.post('/search', (req: Request, res: Response) => {
  const { query, userLocation } = req.body;
  if (typeof query !== 'string') {
    return res.status(400).json({ error: 'Query string is required' });
  }
  const results = SearchService.search(query, userLocation);
  res.json({ query, totalResults: results.length, results });
});

// Navigation Route
apiRouter.post('/navigation/route', (req: Request, res: Response) => {
  const { fromNodeId, toNodeId, accessibleOnly, avoidClosed } = req.body;
  if (!fromNodeId || !toNodeId) {
    return res.status(400).json({ error: 'fromNodeId and toNodeId are required' });
  }

  const route = NavigationService.findRoute(fromNodeId, toNodeId, {
    accessibleOnly: Boolean(accessibleOnly),
    avoidClosed: avoidClosed !== false,
  });

  if (!route) {
    return res.status(404).json({
      error: 'No valid path found between the specified points.',
      suggestion: 'Try disabling accessibility filter or check if corridors are closed.',
    });
  }

  res.json(route);
});

function sendCachedJson<T>(
  req: Request,
  res: Response,
  cacheKey: string,
  computeFn: () => T,
  cacheControl: string = 'public, max-age=5, stale-while-revalidate=30'
) {
  const entry = store.getCachedResponse(cacheKey, computeFn);
  res.setHeader('ETag', entry.etag);
  res.setHeader('Cache-Control', cacheControl);
  if (req.headers['if-none-match'] === entry.etag) {
    return res.status(304).end();
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.send(entry.json);
}

function paginateOptional<T>(items: T[], req: Request): T[] {
  const limitRaw = req.query.limit;
  const offsetRaw = req.query.offset;
  if (limitRaw === undefined && offsetRaw === undefined) return items;
  const offset = Math.max(0, parseInt(String(offsetRaw || '0'), 10) || 0);
  const limit = Math.max(1, Math.min(2000, parseInt(String(limitRaw || items.length), 10) || items.length));
  return items.slice(offset, offset + limit);
}

// QR Checkpoints
apiRouter.get('/qr', (req: Request, res: Response) => {
  return sendCachedJson(req, res, 'qr_all', () => store.getQRCheckpoints());
});

apiRouter.get('/qr/:code', (req: Request, res: Response) => {
  const { code } = req.params;
  const checkpoint = store.getQRByCode(code);
  if (!checkpoint) {
    return res.status(404).json({ error: `QR Checkpoint '${code}' not found in campus registry.` });
  }
  const node = store.getNodeById(checkpoint.nodeId);
  const building = checkpoint.buildingId ? store.getBuildingById(checkpoint.buildingId) : undefined;
  res.json({ checkpoint, node, building });
});

// Campus Data Entities
apiRouter.get('/campuses', (req: Request, res: Response) => {
  return sendCachedJson(req, res, 'campuses_all', () => store.getCampuses());
});

apiRouter.get('/buildings', (req: Request, res: Response) => {
  const campusId = (req.query.campusId as string) || '';
  return sendCachedJson(req, res, `buildings_${campusId}`, () => store.getBuildings(campusId || undefined));
});

apiRouter.get('/buildings/:id', (req: Request, res: Response) => {
  const building = store.getBuildingById(req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });
  res.json(building);
});

apiRouter.get('/floors', (req: Request, res: Response) => {
  const buildingId = (req.query.buildingId as string) || '';
  return sendCachedJson(req, res, `floors_${buildingId}`, () => store.getFloors(buildingId || undefined));
});

apiRouter.get('/rooms', (req: Request, res: Response) => {
  const buildingId = (req.query.buildingId as string) || '';
  const floorId = (req.query.floorId as string) || '';
  const pageKey = `${req.query.limit || ''}_${req.query.offset || ''}`;
  return sendCachedJson(req, res, `rooms_${buildingId}_${floorId}_${pageKey}`, () =>
    paginateOptional(store.getRooms(buildingId || undefined, floorId || undefined), req)
  );
});

apiRouter.get('/departments', (req: Request, res: Response) => {
  return sendCachedJson(req, res, 'departments_all', () => store.getDepartments());
});

apiRouter.get('/teachers', (req: Request, res: Response) => {
  const pageKey = `${req.query.limit || ''}_${req.query.offset || ''}`;
  return sendCachedJson(req, res, `teachers_${pageKey}`, () => paginateOptional(store.getTeachers(), req));
});

apiRouter.get('/facilities', (req: Request, res: Response) => {
  return sendCachedJson(req, res, 'facilities_all', () => store.getFacilities());
});

apiRouter.get('/nodes', (req: Request, res: Response) => {
  return sendCachedJson(req, res, 'nodes_all', () => store.getNavigationNodes());
});

apiRouter.get('/edges', (req: Request, res: Response) => {
  return sendCachedJson(req, res, 'edges_all', () => store.getNavigationEdges());
});

// --- PANORAMA ENDPOINTS (STREET VIEW) ---
apiRouter.get('/panoramas', (req: Request, res: Response) => {
  const { buildingId, floorNumber, limit, offset } = req.query;
  const cacheKey = `panoramas_${buildingId || ''}_${floorNumber ?? ''}_${limit || ''}_${offset || ''}`;
  return sendCachedJson(req, res, cacheKey, () => {
    let panos = PanoramaService.getAll();
    if (buildingId && typeof buildingId === 'string') {
      panos = panos.filter((p) => p.buildingId === buildingId);
    }
    if (floorNumber !== undefined) {
      const fn = parseInt(floorNumber as string, 10);
      if (!isNaN(fn)) {
        panos = panos.filter((p) => p.floorNumber === fn);
      }
    }
    return paginateOptional(panos, req);
  });
});

apiRouter.get('/panoramas/uploaded/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename || '');
  if (!filename) return res.status(400).json({ error: 'Filename is required' });
  const asset = store.getUploadedPanoramaAssetBuffer(filename);
  if (!asset) {
    return res.status(404).json({ error: `Uploaded panorama asset "${filename}" not found.` });
  }
  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(asset.buffer);
});

apiRouter.get('/panoramas/:id', (req: Request, res: Response) => {
  const pano = PanoramaService.getById(req.params.id);
  if (!pano) return res.status(404).json({ error: 'Panorama node not found' });
  res.json(pano);
});

apiRouter.get('/panoramas/node/:nodeId', (req: Request, res: Response) => {
  const pano = PanoramaService.getByNodeId(req.params.nodeId);
  if (!pano) return res.status(404).json({ error: 'No panorama registered for this node' });
  res.json(pano);
});

apiRouter.get('/panoramas/:id/neighbors', (req: Request, res: Response) => {
  const neighbors = PanoramaService.getNeighbors(req.params.id);
  res.json(neighbors);
});

apiRouter.post('/panoramas/route-sequence', (req: Request, res: Response) => {
  const { pathNodeIds, instructions } = req.body;
  if (!Array.isArray(pathNodeIds) || pathNodeIds.length === 0) {
    return res.status(400).json({ error: 'pathNodeIds array is required' });
  }
  const sequence = PanoramaService.mapRouteToPanoramaSequence(pathNodeIds, instructions || []);
  res.json(sequence);
});

// --- ADMIN PANORAMA ENDPOINTS ---
apiRouter.post('/admin/panoramas', requireAdminAuth, (req: Request, res: Response) => {
  const pano = req.body;
  if (!pano.id || !pano.name || !pano.imageUrl) {
    return res.status(400).json({ error: 'Missing required panorama fields (id, name, imageUrl)' });
  }
  store.addPanorama(pano);
  res.status(201).json(pano);
});

apiRouter.put('/admin/panoramas/:id', requireAdminAuth, (req: Request, res: Response) => {
  const updated = store.updatePanorama(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Panorama not found' });
  res.json(updated);
});

apiRouter.delete('/admin/panoramas/:id', requireAdminAuth, (req: Request, res: Response) => {
  const ok = store.deletePanorama(req.params.id);
  res.json({ success: ok });
});

// --- ADMIN MUTATION ENDPOINTS ---
apiRouter.post('/admin/rooms', requireAdminAuth, (req: Request, res: Response) => {
  const room = req.body;
  if (!room.id || !room.name || !room.buildingId) {
    return res.status(400).json({ error: 'Missing required room fields' });
  }
  const created = store.addRoom(room);
  res.status(201).json(created);
});

apiRouter.put('/admin/rooms/:id', requireAdminAuth, (req: Request, res: Response) => {
  const updated = store.updateRoom(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Room not found' });
  res.json(updated);
});

apiRouter.delete('/admin/rooms/:id', requireAdminAuth, (req: Request, res: Response) => {
  const ok = store.deleteRoom(req.params.id);
  res.json({ success: ok });
});

apiRouter.post('/admin/teachers', requireAdminAuth, (req: Request, res: Response) => {
  const teacher = req.body;
  if (!teacher.id || !teacher.name) {
    return res.status(400).json({ error: 'Missing required teacher fields' });
  }
  const created = store.addTeacher(teacher);
  res.status(201).json(created);
});

apiRouter.post('/admin/teachers/bulk', requireAdminAuth, (req: Request, res: Response) => {
  const { teachers } = req.body;
  if (!Array.isArray(teachers) || teachers.length === 0) {
    return res.status(400).json({ error: 'Payload must include non-empty "teachers" array' });
  }

  const depts = store.getDepartments();
  const buildings = store.getBuildings();

  const validatedTeachers = teachers.map((item: any, idx: number) => {
    const dept = depts.find(
      (d) =>
        d.id === item.departmentId ||
        d.name.toLowerCase().includes((item.departmentName || item.department || '').toLowerCase())
    );
    const bld = buildings.find(
      (b) =>
        b.id === item.buildingId ||
        b.name.toLowerCase().includes((item.buildingName || item.building || '').toLowerCase())
    );

    const name = (item.name || '').trim();
    const honorific = item.honorific || (name.toLowerCase().startsWith('dr') ? 'Dr.' : 'Prof.');
    const cleanName = name.replace(/^(prof\.|dr\.|fr\.|mr\.|ms\.)\s+/i, '');

    return {
      id: item.id || `tch_bulk_${Date.now()}_${idx}`,
      campusId: 'campus_christ_main',
      name: cleanName || name,
      honorific: honorific,
      designation: item.designation || item.role || 'Assistant Professor',
      departmentId: dept?.id || item.departmentId || 'dept_cs',
      departmentName: dept?.name || item.departmentName || 'Department of Computer Science',
      buildingId: bld?.id || item.buildingId || 'bld_main',
      buildingName: bld?.name || item.buildingName || 'Administrative / Main Heritage Block',
      floorId: item.floorId || `flr_main_${item.floorNumber ?? 1}`,
      floorNumber: Number(item.floorNumber ?? 1),
      floorName: Number(item.floorNumber) === 0 ? 'Ground Floor' : `Floor ${item.floorNumber ?? 1}`,
      roomId: item.roomId || 'rm_101',
      roomNumber: String(item.roomNumber || item.cabin || '108'),
      email: item.email ? String(item.email).trim() : '',
      officialEmail: item.officialEmail ? String(item.officialEmail).trim() : (item.email ? String(item.email).trim() : undefined),
      phone: item.phone || '+91 480 2825258',
      officeHours: item.officeHours || 'Mon - Fri: 10:00 AM - 4:00 PM',
      searchAliases: [
        cleanName,
        `${cleanName} teacher`,
        `${cleanName} sir`,
        `${cleanName} ma'am`,
        `${honorific} ${cleanName}`,
        `${dept?.name || ''} ${cleanName}`,
      ],
      verifiedStatus: (item.officialEmail || item.email) ? ('VERIFIED' as VerificationStatus) : ('UNVERIFIED' as VerificationStatus),
      lastVerifiedDate: new Date().toISOString().split('T')[0],
    };
  });

  const updatedAll = store.bulkAddTeachers(validatedTeachers);
  res.status(201).json({
    success: true,
    addedCount: validatedTeachers.length,
    totalTeachers: updatedAll.length,
    teachers: validatedTeachers,
  });
});

apiRouter.put('/admin/teachers/:id', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user?.username || 'Campus Admin';
    const updated = store.updateTeacher(req.params.id, req.body, adminUser);
    if (!updated) return res.status(404).json({ error: 'Teacher not found' });
    store.logAdminAction({
      adminUsername: adminUser,
      action: 'UPDATE_TEACHER',
      entity: 'TEACHER',
      entityId: updated.id,
      after: {
        id: updated.id,
        name: updated.name,
        departmentId: updated.departmentId,
        departmentName: updated.departmentName,
        nodeId: updated.nodeId,
      },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to update faculty record.' });
  }
});

apiRouter.delete('/admin/teachers/:id', requireAdminAuth, (req: Request, res: Response) => {
  const ok = store.deleteTeacher(req.params.id);
  res.json({ success: ok });
});

apiRouter.post('/admin/departments', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user?.username || 'Campus Admin';
    const created = store.addDepartment(req.body, adminUser);
    store.logAdminAction({
      adminUsername: adminUser,
      action: 'CREATE_DEPARTMENT',
      entity: 'DEPARTMENT',
      entityId: created.id,
      after: created,
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create department.' });
  }
});

apiRouter.put('/admin/departments/:id', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user?.username || 'Campus Admin';
    const updated = store.updateDepartment(req.params.id, req.body, adminUser);
    if (!updated) return res.status(404).json({ error: 'Department not found' });
    store.logAdminAction({
      adminUsername: adminUser,
      action: 'UPDATE_DEPARTMENT',
      entity: 'DEPARTMENT',
      entityId: updated.id,
      after: updated,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to update department.' });
  }
});

apiRouter.post('/admin/departments/:id/assign-tag', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { tagId, tagName, nodeId, buildingName, floorName } = req.body;
    if (!tagId || !tagName || !nodeId) {
      return res.status(400).json({ error: 'tagId, tagName, and nodeId are required.' });
    }
    const result = store.assignDepartmentTag(req.params.id, { tagId, tagName, nodeId, buildingName, floorName });
    if (!result) return res.status(404).json({ error: 'Department not found' });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to assign department location tag.' });
  }
});

apiRouter.post('/admin/facilities', requireAdminAuth, (req: Request, res: Response) => {
  const facility = req.body;
  if (!facility.id || !facility.name || !facility.type) {
    return res.status(400).json({ error: 'Missing required facility fields' });
  }
  const created = store.addFacility(facility);
  res.status(201).json(created);
});

apiRouter.put('/admin/facilities/:id', requireAdminAuth, (req: Request, res: Response) => {
  const updated = store.updateFacility(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Facility not found' });
  res.json(updated);
});

apiRouter.delete('/admin/facilities/:id', requireAdminAuth, (req: Request, res: Response) => {
  const ok = store.deleteFacility(req.params.id);
  res.json({ success: ok });
});

apiRouter.post('/admin/nodes', requireAdminAuth, (req: Request, res: Response) => {
  const node = req.body;
  if (!node.id || typeof node.x !== 'number') {
    return res.status(400).json({ error: 'Invalid node payload' });
  }
  const created = store.addNode(node);
  res.status(201).json(created);
});

apiRouter.put('/admin/nodes/:id', requireAdminAuth, (req: Request, res: Response) => {
  const updated = store.updateNode(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Node not found' });
  res.json(updated);
});

apiRouter.delete('/admin/nodes/:id', requireAdminAuth, (req: Request, res: Response) => {
  const ok = store.deleteNode(req.params.id);
  res.json({ success: ok });
});

apiRouter.post('/admin/edges', requireAdminAuth, (req: Request, res: Response) => {
  const edge = req.body;
  if (!edge.id || !edge.sourceNodeId || !edge.targetNodeId) {
    return res.status(400).json({ error: 'Invalid edge payload' });
  }
  const created = store.addEdge(edge);
  res.status(201).json(created);
});

apiRouter.put('/admin/edges/:id', requireAdminAuth, (req: Request, res: Response) => {
  const updated = store.updateEdge(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Edge not found' });
  res.json(updated);
});

apiRouter.delete('/admin/edges/:id', requireAdminAuth, (req: Request, res: Response) => {
  const ok = store.deleteEdge(req.params.id);
  res.json({ success: ok });
});

apiRouter.post('/admin/verify', requireAdminAuth, (req: Request, res: Response) => {
  const { entityType, id, status, verifiedBy } = req.body;
  if (!entityType || !id || !status) {
    return res.status(400).json({ error: 'entityType, id, and status are required' });
  }
  const ok = store.updateVerificationStatus(entityType, id, status, verifiedBy);
  res.json({ success: ok, entityType, id, status });
});

apiRouter.post('/admin/reset', requireAdminAuth, (req: Request, res: Response) => {
  store.resetToSeed();
  res.json({ success: true, message: 'Campus database reset to official seed state.' });
});

apiRouter.get('/admin/analytics', requireAdminAuth, (req: Request, res: Response) => {
  const analytics = store.getAnalytics();
  const totalSearches = analytics.length;
  const successfulSearches = analytics.filter((a) => a.matched).length;
  const failedSearches = analytics.filter((a) => !a.matched).length;

  const topQueriesMap = new Map<string, number>();
  for (const item of analytics) {
    const q = item.query.toLowerCase();
    topQueriesMap.set(q, (topQueriesMap.get(q) || 0) + 1);
  }

  const topQueries = Array.from(topQueriesMap.entries())
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.json({
    totalSearches,
    successfulSearches,
    failedSearches,
    successRate: totalSearches > 0 ? Math.round((successfulSearches / totalSearches) * 100) : 100,
    topQueries,
    recentLog: analytics.slice(-20).reverse(),
  });
});

// Map Health & Data Integrity Audit
apiRouter.get('/admin/health-audit', requireAdminAuth, (req: Request, res: Response) => {
  const buildings = store.getBuildings();
  const rooms = store.getRooms();
  const teachers = store.getTeachers();
  const facilities = store.getFacilities();
  const nodes = store.getNavigationNodes();
  const edges = store.getNavigationEdges();

  const nodeMap = new Set(nodes.map((n) => n.id));
  const issues: string[] = [];

  // Check rooms have door nodes
  for (const r of rooms) {
    if (!r.doorNodeId || !nodeMap.has(r.doorNodeId)) {
      issues.push(`Room "${r.name}" (${r.roomNumber}) missing or invalid door node: ${r.doorNodeId}`);
    }
  }

  // Check facilities have door nodes
  for (const f of facilities) {
    if (f.doorNodeId && !nodeMap.has(f.doorNodeId)) {
      issues.push(`Facility "${f.name}" has invalid door node: ${f.doorNodeId}`);
    }
  }

  // Check edges connect valid nodes
  for (const e of edges) {
    if (!nodeMap.has(e.sourceNodeId)) {
      issues.push(`Edge "${e.id}" has invalid source node: ${e.sourceNodeId}`);
    }
    if (!nodeMap.has(e.targetNodeId)) {
      issues.push(`Edge "${e.id}" has invalid target node: ${e.targetNodeId}`);
    }
  }

  // Check teachers have rooms
  const roomMap = new Set(rooms.map((r) => r.id));
  for (const t of teachers) {
    if (!t.roomId || !roomMap.has(t.roomId)) {
      issues.push(`Teacher "${t.name}" assigned to unknown room: ${t.roomId}`);
    }
  }

  const isHealthy = issues.length === 0;

  res.json({
    healthy: isHealthy,
    status: isHealthy ? 'OPTIMAL' : 'ATTENTION_REQUIRED',
    stats: {
      buildings: buildings.length,
      rooms: rooms.length,
      teachers: teachers.length,
      facilities: facilities.length,
      navigationNodes: nodes.length,
      navigationEdges: edges.length,
    },
    totalIssues: issues.length,
    issues,
  });
});

// Full Campus Database Export (JSON Backup)
apiRouter.get('/admin/export', requireAdminAuth, (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="christ_college_campus_backup.json"');
  res.json({
    organization: store.getOrganizations()[0],
    campus: store.getCampuses()[0],
    buildings: store.getBuildings(),
    floors: store.getFloors(),
    departments: store.getDepartments(),
    rooms: store.getRooms(),
    teachers: store.getTeachers(),
    facilities: store.getFacilities(),
    qrCheckpoints: store.getQRCheckpoints(),
    navigationNodes: store.getNavigationNodes(),
    navigationEdges: store.getNavigationEdges(),
    places: store.getPlaces(),
    placeAuditLogs: store.getPlaceAuditLogs(),
    exportedAt: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// MASTER VERIFIED PLACE MAPPING ENDPOINTS
// ─────────────────────────────────────────────────────────────

// 1. Query Places (supports filtering by panorama, building, category, status)
apiRouter.get('/places', (req: Request, res: Response) => {
  const { panoramaId, nodeId, buildingId, floorNumber, category, status, verifiedOnly, limit, offset } = req.query;
  const cacheKey = `places_${panoramaId || ''}_${nodeId || ''}_${buildingId || ''}_${floorNumber ?? ''}_${category || ''}_${status || ''}_${verifiedOnly || ''}_${limit || ''}_${offset || ''}`;
  return sendCachedJson(req, res, cacheKey, () => {
    const places = store.getPlaces({
      panoramaId: panoramaId as string | undefined,
      nodeId: nodeId as string | undefined,
      buildingId: buildingId as string | undefined,
      floorNumber: floorNumber !== undefined ? Number(floorNumber) : undefined,
      category: category as any,
      status: status as string | undefined,
      verifiedOnly: verifiedOnly === 'true',
    });
    return paginateOptional(places, req);
  });
});

// 2. Get Places specifically anchored to a 360° Panorama
apiRouter.get('/places/panorama/:panoramaId', (req: Request, res: Response) => {
  const panoId = req.params.panoramaId;
  return sendCachedJson(req, res, `places_pano_${panoId}`, () => store.getPlacesForPanorama(panoId));
});

// 3. Get Single Place By ID
apiRouter.get('/places/:id', (req: Request, res: Response) => {
  const place = store.getPlaceById(req.params.id);
  if (!place) {
    return res.status(404).json({ error: 'Place not found' });
  }
  res.json(place);
});

// 4. Create Verified Place (Strict Validation, Duplicate Detection, Audit Logging)
apiRouter.post('/places', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const payload = { ...req.body };
    const verifiedBy = req.body.verifiedBy || (req as any).user?.username || 'Campus Mapper';

    if (!payload.name || !payload.name.trim()) {
      return res.status(400).json({ error: 'Place or tag name is required.' });
    }
    if (!payload.category) {
      payload.category = 'FACILITY';
    }
    const targetNode = (payload.nodeId || payload.panoramaId || '').trim();
    if (!targetNode) {
      return res.status(400).json({
        error: 'A physical campus graph location (nodeId or panoramaId) is required to register a navigable place or tag.',
      });
    }
    payload.nodeId = targetNode;
    payload.panoramaId = payload.panoramaId || targetNode;
    payload.buildingId = payload.buildingId || 'bld_main_admin';
    payload.floorId = payload.floorId || 'flr_admin_g';

    // Pre-check duplicates if allowDuplicate is not true and ID doesn't already exist
    if (!payload.allowDuplicate && !payload.id) {
      const duplicates = store.checkDuplicatePlace(
        payload.name,
        payload.roomNumber,
        payload.buildingId,
        payload.floorId
      );

      if (duplicates.length > 0) {
        return res.status(409).json({
          error: 'Potential duplicate place found at this location.',
          existingPlace: duplicates[0],
          message: `A place named "${duplicates[0].name}" already exists on ${duplicates[0].floorName || 'this floor'}. Would you like to update it instead?`,
        });
      }
    }

    const created = store.addPlace(payload, verifiedBy);
    res.status(201).json({
      success: true,
      place: created,
      message: `✓ Successfully verified and anchored "${created.name}" to panorama ${created.panoramaId || created.nodeId}.`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create place.' });
  }
});

// 5. Update Existing Verified Place (Audit Logged)
apiRouter.put('/places/:id', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const updates = req.body?.updates ? req.body.updates : req.body;
    const updatedBy = req.body?.updatedBy || (req as any).user?.username || 'Campus Mapper';
    const reason = req.body?.reason || 'Location details updated';

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Updates payload is required.' });
    }

    const updated = store.updatePlace(req.params.id, updates, updatedBy, reason);

    if (!updated) {
      return res.status(404).json({ error: 'Place not found.' });
    }

    res.json({
      success: true,
      place: updated,
      message: `✓ Location "${updated.name}" updated successfully.`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to update place.' });
  }
});

// 6. Delete/Archive Verified Place (Audit Logged)
apiRouter.delete('/places/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { deletedBy, reason } = req.body || {};
  const ok = store.deletePlace(
    req.params.id,
    deletedBy || 'Campus Mapper',
    reason || 'Place removed from active map'
  );

  if (!ok) {
    return res.status(404).json({ error: 'Place not found.' });
  }

  res.json({
    success: true,
    message: '✓ Place removed from active map with audit record.',
  });
});

// 7. Check Duplicate Place (Pre-validation check before saving)
apiRouter.post('/places/check-duplicate', (req: Request, res: Response) => {
  const { name, roomNumber, buildingId, floorId, currentPlaceId } = req.body;
  if (!name) {
    return res.json({ hasDuplicate: false, matches: [] });
  }
  const matches = store.checkDuplicatePlace(name, roomNumber, buildingId, floorId, currentPlaceId);
  res.json({
    hasDuplicate: matches.length > 0,
    matches,
  });
});

// 8. Place Mapping Audit Logs
apiRouter.get('/places/audit/log', requireAdminAuth, (req: Request, res: Response) => {
  const { placeId } = req.query;
  const logs = store.getPlaceAuditLogs(placeId as string | undefined);
  res.json(logs);
});

// 9. Natural Language Input Parser (Zero-AI-Hallucination Rule Engine)
apiRouter.post('/places/parse-natural', (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text string is required' });
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // Direction extraction
  let relativeDirection: string = 'FORWARD';
  let yawOffset = 0;

  if (lower.includes('right side') || lower.includes('on the right') || lower.includes('to the right') || lower.includes('turn right') || lower.includes('right corridor')) {
    relativeDirection = 'RIGHT';
    yawOffset = 270; // 90° to the Right in 360° space
  } else if (lower.includes('left side') || lower.includes('on the left') || lower.includes('to the left') || lower.includes('turn left') || lower.includes('left corridor')) {
    relativeDirection = 'LEFT';
    yawOffset = 90; // 90° to the Left in 360° space
  } else if (lower.includes('behind') || lower.includes('back') || lower.includes('behind us') || lower.includes('behind me')) {
    relativeDirection = 'BACKWARD';
    yawOffset = 180;
  } else if (lower.includes('forward-left') || lower.includes('front left') || lower.includes('slight left')) {
    relativeDirection = 'FORWARD_LEFT';
    yawOffset = 45; // 45° to the Left
  } else if (lower.includes('forward-right') || lower.includes('front right') || lower.includes('slight right')) {
    relativeDirection = 'FORWARD_RIGHT';
    yawOffset = 315; // 45° to the Right
  } else if (lower.includes('straight') || lower.includes('ahead') || lower.includes('forward') || lower.includes('front')) {
    relativeDirection = 'FORWARD';
    yawOffset = 0;
  }

  // Category & Subcategory extraction
  let category: string = 'OTHER';
  let subcategory: string | undefined = undefined;
  let proposedName = raw;
  let roomNumber: string | null = null;
  let isAmbiguous = false;
  let clarificationPrompt: string | null = null;

  // Toilet / Restrooms
  if (lower.includes('girls toilet') || lower.includes("girls' toilet") || lower.includes('women toilet') || lower.includes('ladies washroom') || lower.includes('ladies toilet') || lower.includes('female toilet')) {
    category = 'RESTROOM';
    subcategory = 'FEMALE';
    proposedName = "Girls' Toilet";
  } else if (lower.includes('boys toilet') || lower.includes("boys' toilet") || lower.includes('men toilet') || lower.includes('gents washroom') || lower.includes('gents toilet') || lower.includes('male toilet')) {
    category = 'RESTROOM';
    subcategory = 'MALE';
    proposedName = "Boys' Toilet";
  } else if (lower.includes('staff toilet') || lower.includes('faculty washroom')) {
    category = 'RESTROOM';
    subcategory = 'STAFF';
    proposedName = 'Staff Restroom';
  } else if (lower.includes('accessible toilet') || lower.includes('disabled washroom') || lower.includes('handicap toilet')) {
    category = 'RESTROOM';
    subcategory = 'ACCESSIBLE';
    proposedName = 'Accessible Restroom';
  } else if (lower.includes('toilet') || lower.includes('restroom') || lower.includes('washroom')) {
    category = 'RESTROOM';
    subcategory = 'GENERAL';
    proposedName = 'Campus Restroom';
    isAmbiguous = true;
    clarificationPrompt = 'Is this a Boys, Girls, Staff, or Accessible restroom?';
  }
  // CS Lab & Labs
  else if (lower.includes('cs lab') || lower.includes('computer science lab') || lower.includes('computer lab') || lower.includes('bca lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Computer Science Lab';
  } else if (lower.includes('physics lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Physics Laboratory';
  } else if (lower.includes('chemistry lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Chemistry Laboratory';
  } else if (lower.includes('zoology lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Zoology Laboratory';
  } else if (lower.includes('botany lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Botany Laboratory';
  } else if (lower.includes('psychology lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Psychology Laboratory';
  } else if (lower.includes('food tech') || lower.includes('food technology lab') || lower.includes('food processing lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Food Technology Laboratory';
  } else if (lower.includes('water lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Water Analysis Laboratory';
  } else if (lower.includes('incubation lab')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Incubation Center Lab';
  } else if (lower.includes(' lab') || lower === 'lab' || lower.includes('laboratory')) {
    category = 'LAB';
    subcategory = 'LABORATORY';
    proposedName = 'Laboratory';
    isAmbiguous = true;
    clarificationPrompt = 'Which laboratory? (e.g. CS Lab, Physics Lab, Chemistry Lab, Food Tech Lab)';
  }
  // Staircase & Lifts
  else if (lower.includes('staircase') || lower.includes('stairs') || lower.includes('steps')) {
    category = 'STAIRCASE';
    subcategory = 'STAIRWAY';
    proposedName = 'Staircase';
  } else if (lower.includes('lift') || lower.includes('elevator')) {
    category = 'LIFT';
    subcategory = 'ELEVATOR';
    proposedName = 'Elevator / Lift';
  }
  // Library
  else if (lower.includes('library') || lower.includes('reading room')) {
    category = 'LIBRARY';
    subcategory = 'OTHER';
    proposedName = 'Central Library';
  }
  // Entrances & Exits
  else if (lower.includes('entrance') || lower.includes('entry') || lower.includes('gate') || lower.includes('portico')) {
    category = 'ENTRANCE';
    subcategory = 'ENTRANCE';
    proposedName = 'Main Entrance';
  } else if (lower.includes('exit')) {
    category = 'EXIT';
    subcategory = 'EXIT';
    proposedName = 'Emergency Exit';
  }
  // Junctions & Corridors
  else if (lower.includes('junction') || lower.includes('intersection') || lower.includes('crossroad')) {
    category = 'JUNCTION';
    proposedName = 'Corridor Junction';
  } else if (lower.includes('corridor') || lower.includes('hallway') || lower.includes('veranda')) {
    category = 'CORRIDOR';
    proposedName = 'Main Corridor';
  }
  // Classrooms & Room codes (e.g. "Room MG204", "Room 108", "MG 204", "SM 163", "AB 59", "SC 482")
  const roomMatch = raw.match(/(?:room\s*)?([A-Za-z]{1,3}\s*\d{2,4}[A-Za-z]?|\d{3})/i);
  if (roomMatch && !category.match(/RESTROOM|LAB|STAIRCASE|LIFT|LIBRARY/)) {
    category = 'CLASSROOM';
    subcategory = 'THEORY_CLASSROOM';
    roomNumber = roomMatch[1].replace(/\s+/g, '').toUpperCase();
    proposedName = `Room ${roomNumber}`;
  } else if (lower.includes('classroom') || lower.includes('class room')) {
    category = 'CLASSROOM';
    subcategory = 'THEORY_CLASSROOM';
    proposedName = 'Classroom';
  }

  // Department check
  if (lower.includes('department') || lower.includes('dept')) {
    category = 'DEPARTMENT';
    subcategory = 'DEPARTMENT_OFFICE';
  }

  res.json({
    originalText: raw,
    proposedName,
    category,
    subcategory,
    relativeDirection,
    yawOffset,
    roomNumber,
    isAmbiguous,
    clarificationPrompt,
    confidence: isAmbiguous ? 0.6 : 0.95,
  });
});

// ─────────────────────────────────────────────────────────────
// PANORAMA ROUTE DEBUGGER & GRAPH REST ENDPOINTS
// ─────────────────────────────────────────────────────────────

// 10. Get Persisted Graph Overrides
apiRouter.get('/graph/overrides', (req: Request, res: Response) => {
  try {
    return sendCachedJson(req, res, 'graph_overrides', () => store.getGraphOverrides(), 'no-cache');
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve graph overrides' });
  }
});

// 11. Save & Persist Graph Overrides (Verified State - Local Draft Save)
apiRouter.post('/graph/overrides', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { overrides, savedBy } = req.body;
    if (!overrides || typeof overrides !== 'object') {
      return res.status(400).json({ error: 'Overrides object is required' });
    }

    const updated = await store.withWriteLock(() =>
      store.saveGraphOverrides(overrides, savedBy || (req as any).user?.username || 'Campus Mapper')
    );
    res.status(200).json({
      success: true,
      message: '✓ Changes saved to local development database.',
      overrides: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save graph overrides' });
  }
});

// 11B. Upload New Panorama Image (+ Add Image) or Replace Panorama Image (Replace Image)
apiRouter.post('/admin/panoramas/upload', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { mode, nodeId, filename, mimeType, base64Data, title, area, floor, manualNumber, uploadedBy } = req.body || {};
    if (mode !== 'ADD_NEW' && mode !== 'REPLACE') {
      return res.status(400).json({ error: 'Invalid upload mode. Must be "ADD_NEW" or "REPLACE".' });
    }

    const caller = (req as any).user?.username || uploadedBy || 'Campus Admin';
    const result = await store.withWriteLock(() =>
      store.uploadPanoramaImage({
        mode,
        nodeId,
        filename,
        mimeType,
        base64Data,
        title,
        area,
        floor,
        manualNumber,
        uploadedBy: caller,
      })
    );

    return res.status(200).json({
      success: true,
      message:
        mode === 'ADD_NEW'
          ? `✓ Added new panorama "${result.nodeId}" (#${result.manualNumber}) and saved image "${result.filename}".`
          : `✓ Replaced image for panorama "${result.nodeId}" (#${result.manualNumber}) with "${result.filename}".`,
      result: {
        nodeId: result.nodeId,
        manualNumber: result.manualNumber,
        filename: result.filename,
        storedFilename: result.storedFilename,
        imagePath: result.imagePath,
        area: result.area,
        floor: result.floor,
        mode: result.mode,
      },
      overrides: result.graphOverrides,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to upload panorama image.',
    });
  }
});

// 12. Run Full Graph Integrity Validation
apiRouter.post('/graph/validate', (req: Request, res: Response) => {
  try {
    const { nodes, overrides } = req.body;
    const report = store.validateGraphIntegrity(nodes || [], overrides);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: 'Graph validation failed' });
  }
});

// 13. Save Heading Calibration Offset for a Panorama Node
apiRouter.post('/admin/panoramas/:id/calibrate', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { northOffset, savedBy } = req.body;
    if (typeof northOffset !== 'number') {
      return res.status(400).json({ error: 'Valid numeric northOffset (0-360) is required' });
    }
    const updated = store.saveNodeHeadingCalibration(id, northOffset, savedBy || 'Admin');
    res.json({ success: true, message: `Node "${id}" calibrated to north offset ${northOffset}°`, overrides: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to calibrate node heading' });
  }
});

// 14. Save Edge Distance & Walking Cost Override
apiRouter.post('/admin/edges/cost', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { fromNodeId, toNodeId, distance, walkingCost, savedBy } = req.body;
    if (!fromNodeId || !toNodeId || typeof distance !== 'number' || typeof walkingCost !== 'number') {
      return res.status(400).json({ error: 'fromNodeId, toNodeId, distance, and walkingCost are required' });
    }
    const updated = store.saveEdgeCostOverride(fromNodeId, toNodeId, distance, walkingCost, savedBy || 'Admin');
    res.json({ success: true, message: `Edge ${fromNodeId} -> ${toNodeId} cost updated to ${walkingCost}`, overrides: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update edge cost' });
  }
});

// 15. Replace Node Image with Version History
apiRouter.post('/admin/panoramas/:id/image', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { imagePath, filename, savedBy } = req.body;
    if (!imagePath || !filename) {
      return res.status(400).json({ error: 'imagePath and filename are required' });
    }
    const updated = store.replaceNodeImageVersioned(id, imagePath, filename, savedBy || 'Admin');
    res.json({ success: true, message: `Node "${id}" image updated to ${filename}`, overrides: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to replace node image' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUBLISH & RENDER DEPLOYMENT ENDPOINTS
// ─────────────────────────────────────────────────────────────

// Helper to locate git root directory whether server is executed from repo root or server subdir
function getGitRepoRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    const parent = path.resolve(process.cwd(), '..');
    if (fs.existsSync(path.join(parent, '.git'))) {
      return parent;
    }
    return process.cwd();
  }
}

// 16. Get Publish & Firestore Database Status
apiRouter.get('/publish/status', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const health = store.getRepositoryHealth();
    const overrides = store.getGraphOverrides();
    const validation = store.validateForPublish();

    res.json({
      success: true,
      database: {
        provider: health.provider === 'firestore' ? 'Google Cloud Firestore' : 'In-Memory (Offline / Test)',
        connected: health.connected,
        status: health.status,
        projectId: health.projectId || 'not configured',
        lastSyncAt: health.lastSyncAt || overrides.lastSavedAt || null,
        error: health.error,
      },
      counts: {
        buildings: store.getBuildings().length,
        rooms: store.getRooms().length,
        classrooms: store.getClassrooms().length,
        laboratories: store.getLaboratories().length,
        teachers: store.getTeachers().length,
        facultyAccounts: store.getFacultyAccounts().length,
        facultyStatuses: Object.keys(store.getFacultyStatuses()).length,
        panoramas: store.getPanoramas().length,
        navigationNodes: store.getNavigationNodes().length,
        navigationEdges: store.getNavigationEdges().length,
        places: store.getPlaces().length,
      },
      lastSavedAt: overrides.lastSavedAt || health.lastSyncAt || null,
      savedBy: overrides.savedBy || null,
      version: validation.version,
      contentHash: validation.contentHash,
      publishStatus: 'PUBLISHED',
      message: 'All edits commit directly to Google Cloud Firestore and are live across all instances immediately in realtime.',
      validation,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve publish status' });
  }
});

// 16B. Pre-Publish Validation & Remote Conflict Check
apiRouter.post('/publish/validate', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { targetUrl } = req.body || {};
    const validation = store.validateForPublish();
    let remoteStatus: any = null;

    if (targetUrl && typeof targetUrl === 'string' && targetUrl.trim().startsWith('http')) {
      const cleanUrl = targetUrl.trim().replace(/\/+$/, '');
      try {
        const remoteRes = await fetch(`${cleanUrl}/api/v1/graph/overrides`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (remoteRes.ok) {
          const remoteOverrides = await remoteRes.json();
          const remoteHash =
            remoteOverrides?.contentHash || store.computeGraphContentHash(remoteOverrides || {});
          const remoteVersion = remoteOverrides?.version || 1;
          const isInSync = remoteHash === validation.contentHash;
          const hasConflict =
            Boolean(validation.lastPublishedHash) &&
            remoteHash !== validation.lastPublishedHash &&
            remoteHash !== validation.contentHash;
          remoteStatus = {
            reachable: true,
            targetUrl: cleanUrl,
            remoteVersion,
            remoteHash,
            remoteLastSavedAt: remoteOverrides?.lastSavedAt,
            isInSync,
            hasConflict,
          };
        } else {
          remoteStatus = {
            reachable: false,
            targetUrl: cleanUrl,
            error: `HTTP ${remoteRes.status}`,
          };
        }
      } catch (err: any) {
        remoteStatus = {
          reachable: false,
          targetUrl: cleanUrl,
          error: err?.message || 'Could not reach target URL',
        };
      }
    }

    return res.json({
      success: true,
      validation,
      remoteStatus,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to validate publish state' });
  }
});

// 16C. Atomic Local-to-Target Publish Synchronization (Superseded by Cloud Firestore)
apiRouter.post('/publish/sync', requireSuperAdminAuth, async (req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'Manual publish sync is obsolete. Google Cloud Firestore is the single source of truth; all edits are live immediately across all instances in real-time.',
  });
});

// 17. 1-Click Publish to Render (Superseded by Cloud Firestore)
apiRouter.post('/publish/deploy', requireSuperAdminAuth, async (req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'Render deployment sync is obsolete. Changes write directly to Cloud Firestore without requiring redeployment.',
  });
});

// 18. Export Database File (Browser JSON Download - Excludes Password Hashes)
apiRouter.get('/publish/export-db', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const rawState = JSON.parse(JSON.stringify(store.exportDatabasePayload()));
    // Strip all password hashes to ensure browser downloads never leak credentials
    if (rawState.facultyAccounts) {
      rawState.facultyAccounts = rawState.facultyAccounts.map((a: any) => {
        const { passwordHash, ...rest } = a;
        return rest;
      });
    }
    if (rawState.adminUsers) {
      rawState.adminUsers = rawState.adminUsers.map((u: any) => {
        const { passwordHash, ...rest } = u;
        return rest;
      });
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="campusnav_backup_nohashes.json"');
    res.send(JSON.stringify(rawState, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to export database' });
  }
});

// 19. Import Database JSON Payload (Superseded by Cloud Firestore & migration script)
apiRouter.post('/publish/import-db', requireSuperAdminAuth, async (req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'Direct JSON database import is disabled. Use scripts/migrateToFirestore.ts for initial database population.',
  });
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Valid JSON database payload required' });
    }

    const caller = payload.publishedBy || (req as any).user?.username || 'Database Import';

    const importResult = await store.withWriteLock(() => {
      if (payload.state && payload.state.buildings && payload.state.graphOverrides) {
        return store.importPublishedDatabase(payload.state, caller, {
          expectedPreviousHash: payload.expectedPreviousHash,
          force: payload.force,
        });
      }
      if (payload.buildings && payload.graphOverrides) {
        return store.importPublishedDatabase(payload, caller, {
          expectedPreviousHash: payload.expectedPreviousHash,
          force: payload.force,
        });
      }
      if (payload.graphOverrides) {
        store.saveGraphOverrides(payload.graphOverrides, caller);
      } else if (payload.manualNumbers || payload.customConnections || payload.nodeImageOverrides) {
        store.saveGraphOverrides(payload, caller);
      } else {
        throw new Error('Unrecognized database payload structure.');
      }
      store.materializeUploadedPanoramaAssetsToDisk();
      const published = store.markGraphPublished(caller);
      const val = store.validateForPublish();
      return {
        success: true,
        conflict: false,
        message: 'Database state imported, materialized, and persisted successfully.',
        version: published.version || 1,
        contentHash: published.contentHash || '',
        totalNodeCount: val.totalNodeCount,
        totalConnections: val.totalConnections,
        totalTags: val.totalTags,
      };
    });

    if (importResult.conflict) {
      return res.status(409).json(importResult);
    }

    return res.json(importResult);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to import database' });
  }
});

// ─────────────────────────────────────────────────────────────
// 20. BUG REPORTING & FEEDBACK SYSTEM ENDPOINTS
// ─────────────────────────────────────────────────────────────

// In-memory rate limiter: max 10 reports per 15 minutes per IP
const reportRateLimitMap = new Map<string, { count: number; resetTime: number }>();
function checkReportRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxReports = 10;

  const record = reportRateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    reportRateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= maxReports) {
    return false;
  }
  record.count += 1;
  return true;
}

// Input sanitizer to prevent script injection / XSS
function sanitizeReportString(str: any, maxLen: number = 2000): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

// 20A. Submit User Bug Report / Feedback (Public)
apiRouter.post('/reports', (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkReportRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'Too many report submissions. Please wait a few minutes before submitting another report.',
    });
  }

  const {
    issueType,
    category,
    description,
    reporterName,
    reporterContact,
    reporterType,
    currentPanoramaId,
    currentNodeId,
    currentBuildingId,
    currentFloorId,
    currentPlaceId,
    currentTagId,
    selectedDestinationId,
    routeId,
    routeStepIndex,
    originNodeId,
    destinationNodeId,
    reportedEntityType,
    reportedEntityId,
    blockId,
    blockName,
    currentURL,
    device,
    browser,
    screenSize,
    appVersion,
  } = req.body || {};

  if (!description || typeof description !== 'string' || description.trim().length < 5) {
    return res.status(400).json({ error: 'A descriptive report of at least 5 characters is required.' });
  }

  if (description.length > 2000) {
    return res.status(400).json({ error: 'Description exceeds maximum allowed length of 2000 characters.' });
  }

  const validIssueTypes: CampusReportIssueType[] = [
    'WRONG_LOCATION',
    'WRONG_DEPARTMENT',
    'WRONG_ROOM',
    'WRONG_BLOCK',
    'WRONG_NAVIGATION',
    'WRONG_ARROW',
    'MISSING_PLACE',
    'INCORRECT_TAG',
    'FACULTY_INFO',
    'PANORAMA_PROBLEM',
    'SEARCH_PROBLEM',
    'TECHNICAL_PROBLEM',
    'SUGGESTION',
    'OTHER',
  ];

  const safeType: CampusReportIssueType = validIssueTypes.includes(issueType) ? issueType : 'OTHER';

  const newReport = store.createReport({
    issueType: safeType,
    category: sanitizeReportString(category || safeType.replace(/_/g, ' '), 100),
    description: sanitizeReportString(description, 2000),
    reporterName: reporterName ? sanitizeReportString(reporterName, 100) : undefined,
    reporterContact: reporterContact ? sanitizeReportString(reporterContact, 150) : undefined,
    reporterType: ['student', 'faculty', 'admin', 'anonymous'].includes(reporterType) ? reporterType : 'anonymous',
    currentPanoramaId: currentPanoramaId ? sanitizeReportString(currentPanoramaId, 100) : undefined,
    currentNodeId: currentNodeId ? sanitizeReportString(currentNodeId, 100) : undefined,
    currentBuildingId: currentBuildingId ? sanitizeReportString(currentBuildingId, 100) : undefined,
    currentFloorId,
    currentPlaceId: currentPlaceId ? sanitizeReportString(currentPlaceId, 100) : undefined,
    currentTagId: currentTagId ? sanitizeReportString(currentTagId, 100) : undefined,
    selectedDestinationId: selectedDestinationId ? sanitizeReportString(selectedDestinationId, 100) : undefined,
    routeId: routeId ? sanitizeReportString(routeId, 100) : undefined,
    routeStepIndex: typeof routeStepIndex === 'number' ? routeStepIndex : undefined,
    originNodeId: originNodeId ? sanitizeReportString(originNodeId, 100) : undefined,
    destinationNodeId: destinationNodeId ? sanitizeReportString(destinationNodeId, 100) : undefined,
    reportedEntityType: reportedEntityType ? sanitizeReportString(reportedEntityType, 100) : undefined,
    reportedEntityId: reportedEntityId ? sanitizeReportString(reportedEntityId, 100) : undefined,
    blockId: blockId ? sanitizeReportString(blockId, 100) : undefined,
    blockName: blockName ? sanitizeReportString(blockName, 150) : undefined,
    currentURL: currentURL ? sanitizeReportString(currentURL, 300) : undefined,
    device: device ? sanitizeReportString(device, 100) : undefined,
    browser: browser ? sanitizeReportString(browser, 100) : undefined,
    screenSize: screenSize ? sanitizeReportString(screenSize, 50) : undefined,
    appVersion: appVersion ? sanitizeReportString(appVersion, 50) : undefined,
  });

  return res.status(201).json({
    success: true,
    message: 'Thanks — your report has been submitted.',
    report: {
      id: newReport.id,
      createdAt: newReport.createdAt,
      status: newReport.status,
      priority: newReport.priority,
      possibleDuplicateOf: newReport.possibleDuplicateOf,
    },
  });
});

// 20B. Get Reports List (Admin Only)
apiRouter.get('/admin/reports', requireAdminAuth, (req: Request, res: Response) => {
  const { status, priority, category, search, buildingId, limit, offset } = req.query;
  const result = store.getReports({
    status: status as string | undefined,
    priority: priority as string | undefined,
    category: category as string | undefined,
    search: search as string | undefined,
    buildingId: buildingId as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : 100,
    offset: offset ? parseInt(offset as string, 10) : 0,
  });
  res.json({
    success: true,
    total: result.total,
    reports: result.reports,
  });
});

// 20C. Get Report by ID (Admin Only)
apiRouter.get('/admin/reports/:id', requireAdminAuth, (req: Request, res: Response) => {
  const report = store.getReportById(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json({ success: true, report });
});

// 20D. Update Report Status / Priority / Notes (Admin Only)
apiRouter.patch('/admin/reports/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { status, priority, adminNotes } = req.body;
  const adminUser = (req as any).user?.username || (req as any).adminUser?.username || 'Admin';

  const validStatuses: CampusReportStatus[] = [
    'NEW',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'RESOLVED',
    'REJECTED',
    'DUPLICATE',
  ];
  const validPriorities: CampusReportPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  const updates: any = {};
  if (status) {
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    updates.status = status;
  }
  if (priority) {
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` });
    }
    updates.priority = priority;
  }
  if (adminNotes !== undefined) {
    updates.adminNotes = sanitizeReportString(adminNotes, 3000);
  }

  const updated = store.updateReport(req.params.id, updates, adminUser);
  if (!updated) {
    return res.status(404).json({ error: 'Report not found' });
  }

  res.json({
    success: true,
    message: `Report ${updated.id} updated successfully.`,
    report: updated,
  });
});

// 20E. Delete Report by ID (Admin Only)
apiRouter.delete('/admin/reports/:id', requireAdminAuth, (req: Request, res: Response) => {
  const success = store.deleteReport(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json({ success: true, message: `Report ${req.params.id} deleted successfully.` });
});

// 20F. Clear All Reports (Admin Only)
apiRouter.delete('/admin/reports', requireAdminAuth, (req: Request, res: Response) => {
  const count = store.clearAllReports();
  res.json({ success: true, message: `Successfully cleared ${count} reports.` });
});





