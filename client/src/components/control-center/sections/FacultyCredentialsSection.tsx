import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
  Download,
  Search,
  Filter,
  RefreshCw,
  Plus,
  RotateCcw,
  UserX,
  UserCheck,
  ExternalLink,
  Edit2,
  Check,
  X,
  Sparkles,
  Lock,
  Globe,
  FileSpreadsheet,
  HelpCircle,
  CheckSquare,
  Square,
  MinusSquare,
  Info,
  LogIn,
  LogOut,
  Cloud,
  CloudOff,
  Database
} from 'lucide-react';
import { ApiService, getApiBaseUrl } from '../../../services/api';
import { Teacher } from '../../../../../shared/types';
import OFFICIAL_FACULTY_DATA from '../../../data/officialFaculty.json';
import OFFICIAL_DEPARTMENTS_DATA from '../../../data/officialDepartments.json';

interface FacultyAccountData {
  id: string;
  facultyId: string;
  facultyName: string;
  designation?: string;
  departmentName?: string;
  email: string;
  facultyCode: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  currentStatus?: string;
}

type EmailStatus = 'VERIFIED' | 'MISSING' | 'INVALID' | 'DUPLICATE' | 'SUGGESTION';
type AccountFilterStatus = 'ALL' | 'NO_ACCOUNT' | 'ACTIVE' | 'MUST_CHANGE_PASSWORD' | 'DISABLED';

interface GeneratedCredential {
  facultyId: string;
  name: string;
  designation?: string;
  department?: string;
  email: string;
  loginId: string;
  temporaryPassword: string;
}

export const FacultyCredentialsSection: React.FC = () => {
  // Authoritative Faculty & Accounts State
  const [teachers, setTeachers] = useState<Teacher[]>(() => OFFICIAL_FACULTY_DATA as unknown as Teacher[]);
  const [accounts, setAccounts] = useState<FacultyAccountData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<AccountFilterStatus>('ALL');
  const [emailStatusFilter, setEmailStatusFilter] = useState<'ALL' | EmailStatus>('ALL');

  // Row Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline Email Editing State
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [inlineEmailValue, setInlineEmailValue] = useState<string>('');
  const [inlineEmailError, setInlineEmailError] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Suggestions from public web scan
  const [suggestions, setSuggestions] = useState<Map<string, string>>(new Map());
  const [isScanningWeb, setIsScanningWeb] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Notification Banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Server Connection Configuration Modal
  const [showServerConfigModal, setShowServerConfigModal] = useState(false);
  const [customApiUrlInput, setCustomApiUrlInput] = useState('');

  // Persistence Status State
  const [persistenceStatus, setPersistenceStatus] = useState<{
    configured: boolean;
    dataRepo: string | null;
    branch: string;
    lastSyncTime: string | null;
    lastSyncSuccess: boolean | null;
    lastSyncMessage: string;
    lastCommitSha: string | null;
    isSyncing: boolean;
  } | null>(null);

  // Target Server Admin Authentication State
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return ApiService.hasAdminToken() || !ApiService.isRemoteTarget();
  });
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminLoginMode, setAdminLoginMode] = useState<'password' | 'pin'>('password');
  const [adminUsernameInput, setAdminUsernameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);
  const [isAdminLoggingIn, setIsAdminLoggingIn] = useState(false);

  // Confirmation Modals State
  const [singleCreateTarget, setSingleCreateTarget] = useState<Teacher | null>(null);
  const [showBulkCreateModal, setShowBulkCreateModal] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<{ teacher: Teacher; account: FacultyAccountData } | null>(null);
  const [toggleActiveTarget, setToggleActiveTarget] = useState<{ teacher: Teacher; account: FacultyAccountData } | null>(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  // Credential Disclosure Modal State (Plaintext lives ONLY here until dismissed)
  const [disclosedCredentials, setDisclosedCredentials] = useState<GeneratedCredential[] | null>(null);
  const [disclosureTitle, setDisclosureTitle] = useState('Faculty Credentials Generated');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Partial Failures Banner
  const [bulkSkippedList, setBulkSkippedList] = useState<{ facultyId: string; name?: string; reason: string }[] | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // Fetch persistence status from server
  const loadPersistenceStatus = useCallback(async () => {
    try {
      const res = await ApiService.getPersistenceStatus();
      if (res?.success && res.status) {
        setPersistenceStatus(res.status);
      }
    } catch {
      // Persistence status endpoint unreachable or unauthenticated
    }
  }, []);

  // 1. Fetch live data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setServerError(null);
    try {
      const health = await ApiService.checkHealth();
      if (health.status === 'offline') {
        setServerOnline(false);
        setServerError('Cannot connect to server. Control Center is in offline mode.');
      } else {
        setServerOnline(true);
      }

      const [tchs, accsRes] = await Promise.all([
        ApiService.getTeachers().catch(() => OFFICIAL_FACULTY_DATA as unknown as Teacher[]),
        ApiService.getAdminFacultyAccounts().catch((err: any) => {
          if (err?.message?.includes('401') || err?.message?.includes('Access denied') || err?.message?.includes('Unauthorized')) {
            setIsAdminAuthenticated(false);
          }
          return { success: false, accounts: [] };
        }),
      ]);

      if (Array.isArray(tchs) && tchs.length > 0) {
        setTeachers(tchs);
      }
      if (accsRes?.success && Array.isArray(accsRes.accounts)) {
        setAccounts(accsRes.accounts);
        setIsAdminAuthenticated(true);
      } else if (ApiService.isRemoteTarget() && !ApiService.hasAdminToken()) {
        setIsAdminAuthenticated(false);
      }

      loadPersistenceStatus();
    } catch (err: any) {
      setServerOnline(false);
      setServerError(err.message || 'Error connecting to backend API');
    } finally {
      setIsLoading(false);
    }
  }, [loadPersistenceStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Admin login submission handler
  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdminLoggingIn(true);
    setAdminLoginError(null);

    try {
      if (adminLoginMode === 'password') {
        if (!adminUsernameInput.trim() || !adminPasswordInput) {
          throw new Error('Please enter both username and password.');
        }
        await ApiService.adminLogin({
          username: adminUsernameInput.trim(),
          password: adminPasswordInput,
        });
      } else {
        if (!adminPinInput.trim()) {
          throw new Error('Please enter the emergency admin PIN.');
        }
        await ApiService.adminLogin({
          pin: adminPinInput.trim(),
        });
      }

      setIsAdminAuthenticated(true);
      setShowAdminLoginModal(false);
      setAdminUsernameInput('');
      setAdminPasswordInput('');
      setAdminPinInput('');
      showNotification('success', 'Admin session authenticated successfully.');
      loadData();
    } catch (err: any) {
      setAdminLoginError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsAdminLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    ApiService.adminLogout();
    setIsAdminAuthenticated(!ApiService.isRemoteTarget());
    setAccounts([]);
    showNotification('info', 'Admin logged out.');
    loadData();
  };

  // Map accounts by facultyId
  const accountsByFacultyId = useMemo(() => {
    const map = new Map<string, FacultyAccountData>();
    accounts.forEach((acc) => {
      map.set(acc.facultyId, acc);
    });
    return map;
  }, [accounts]);

  // Compute Email Statistics across all teachers
  const emailStats = useMemo(() => {
    const emailCounts = new Map<string, number>();
    teachers.forEach((t) => {
      const email = (t.officialEmail || '').trim().toLowerCase();
      if (email) {
        emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
      }
    });

    const emailRegex = /^[a-z0-9][a-z0-9._%+-]*@christcollegeijk\.edu\.in$/;

    let verified = 0;
    let missing = 0;
    let invalid = 0;
    let duplicate = 0;

    teachers.forEach((t) => {
      const email = (t.officialEmail || '').trim().toLowerCase();
      if (!email) {
        missing++;
      } else if ((emailCounts.get(email) || 0) > 1) {
        duplicate++;
      } else if (!emailRegex.test(email)) {
        invalid++;
      } else {
        verified++;
      }
    });

    return { verified, missing, invalid, duplicate, emailCounts };
  }, [teachers]);

  // Determine row email status
  const getRowEmailStatus = useCallback(
    (teacher: Teacher): { status: EmailStatus; label: string; tooltip?: string } => {
      const email = (teacher.officialEmail || '').trim().toLowerCase();
      const suggestion = suggestions.get(teacher.id);

      if (!email) {
        if (suggestion) {
          return {
            status: 'SUGGESTION',
            label: 'Unverified Suggestion',
            tooltip: `Found on public college website: ${suggestion}. Admin must confirm before creating account.`,
          };
        }
        return {
          status: 'MISSING',
          label: 'Missing Email',
          tooltip: 'No official email on record. Enter an official @christcollegeijk.edu.in address.',
        };
      }

      const count = emailStats.emailCounts.get(email) || 0;
      if (count > 1) {
        return {
          status: 'DUPLICATE',
          label: 'Duplicate Email',
          tooltip: `This email is shared by ${count} faculty members. Ambiguous login prevented: account creation blocked until resolved.`,
        };
      }

      const emailRegex = /^[a-z0-9][a-z0-9._%+-]*@christcollegeijk\.edu\.in$/;
      if (!emailRegex.test(email)) {
        return {
          status: 'INVALID',
          label: 'Invalid Domain',
          tooltip: 'Email must follow standard format and end with @christcollegeijk.edu.in.',
        };
      }

      return {
        status: 'VERIFIED',
        label: 'Verified Official',
        tooltip: 'Valid, unique @christcollegeijk.edu.in college email.',
      };
    },
    [emailStats, suggestions]
  );

  // Departments List for Filter
  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => {
      const d = t.departmentName || t.departmentCategory || t.department;
      if (d) set.add(d);
    });
    return Array.from(set).sort();
  }, [teachers]);

  // Filtered Faculty List
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const acc = accountsByFacultyId.get(t.id) || accountsByFacultyId.get(t.facultyId || '');
      const emailStatus = getRowEmailStatus(t).status;

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (t.name || '').toLowerCase().includes(q);
        const deptMatch = (t.departmentName || t.department || '').toLowerCase().includes(q);
        const emailMatch = (t.officialEmail || '').toLowerCase().includes(q);
        const idMatch = (t.facultyId || t.id || '').toLowerCase().includes(q);
        const desigMatch = (t.designation || '').toLowerCase().includes(q);
        if (!nameMatch && !deptMatch && !emailMatch && !idMatch && !desigMatch) {
          return false;
        }
      }

      // Department filter
      if (departmentFilter !== 'ALL') {
        const dept = t.departmentName || t.departmentCategory || t.department;
        if (dept !== departmentFilter) return false;
      }

      // Account status filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'NO_ACCOUNT' && acc) return false;
        if (statusFilter === 'ACTIVE' && (!acc || !acc.isActive || acc.mustChangePassword)) return false;
        if (statusFilter === 'MUST_CHANGE_PASSWORD' && (!acc || !acc.mustChangePassword || !acc.isActive)) return false;
        if (statusFilter === 'DISABLED' && (!acc || acc.isActive)) return false;
      }

      // Email status filter
      if (emailStatusFilter !== 'ALL') {
        if (emailStatus !== emailStatusFilter) return false;
      }

      return true;
    });
  }, [teachers, accountsByFacultyId, searchQuery, departmentFilter, statusFilter, emailStatusFilter, getRowEmailStatus]);

  // Eligible for Account Creation in Filtered Set
  const eligibleSelectedTeachers = useMemo(() => {
    return filteredTeachers.filter((t) => {
      if (!selectedIds.has(t.id)) return false;
      const acc = accountsByFacultyId.get(t.id) || accountsByFacultyId.get(t.facultyId || '');
      if (acc) return false;
      const { status } = getRowEmailStatus(t);
      return status === 'VERIFIED';
    });
  }, [filteredTeachers, selectedIds, accountsByFacultyId, getRowEmailStatus]);

  // Bulk Selection Handlers
  const isAllFilteredSelected = useMemo(() => {
    if (filteredTeachers.length === 0) return false;
    return filteredTeachers.every((t) => selectedIds.has(t.id));
  }, [filteredTeachers, selectedIds]);

  const isSomeFilteredSelected = useMemo(() => {
    return filteredTeachers.some((t) => selectedIds.has(t.id)) && !isAllFilteredSelected;
  }, [filteredTeachers, selectedIds, isAllFilteredSelected]);

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      // Unselect all filtered
      const next = new Set(selectedIds);
      filteredTeachers.forEach((t) => next.delete(t.id));
      setSelectedIds(next);
    } else {
      // Select all filtered
      const next = new Set(selectedIds);
      filteredTeachers.forEach((t) => next.add(t.id));
      setSelectedIds(next);
    }
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Inline Email Editing Handlers
  const handleStartEditEmail = (teacher: Teacher) => {
    setEditingEmailId(teacher.id);
    setInlineEmailValue(teacher.officialEmail || suggestions.get(teacher.id) || '');
    setInlineEmailError(null);
  };

  const handleCancelEditEmail = () => {
    setEditingEmailId(null);
    setInlineEmailValue('');
    setInlineEmailError(null);
  };

  const handleSaveInlineEmail = async (teacher: Teacher) => {
    const trimmed = inlineEmailValue.trim().toLowerCase();
    const emailRegex = /^[a-z0-9][a-z0-9._%+-]*@christcollegeijk\.edu\.in$/;

    if (trimmed && !emailRegex.test(trimmed)) {
      setInlineEmailError('Email must be in valid format and end with @christcollegeijk.edu.in');
      return;
    }

    // Check duplicate against other teachers
    if (trimmed) {
      const otherDuplicate = teachers.find(
        (t) => t.id !== teacher.id && (t.officialEmail || '').trim().toLowerCase() === trimmed
      );
      if (otherDuplicate) {
        setInlineEmailError(`Duplicate: already used by another faculty member.`);
        return;
      }
    }

    setIsSavingEmail(true);
    setInlineEmailError(null);
    try {
      await ApiService.updateTeacher(teacher.id, { officialEmail: trimmed });
      setTeachers((prev) =>
        prev.map((t) => (t.id === teacher.id ? { ...t, officialEmail: trimmed } : t))
      );
      // Remove from suggestions if applied
      if (suggestions.has(teacher.id)) {
        const next = new Map(suggestions);
        next.delete(teacher.id);
        setSuggestions(next);
      }
      showNotification('success', `Official email updated successfully.`);
      setEditingEmailId(null);
    } catch (err: any) {
      setInlineEmailError(err.message || 'Failed to update email');
    } finally {
      setIsSavingEmail(false);
    }
  };

  // Web Scan for Missing Faculty Emails
  const handleScanWebForEmails = async () => {
    setIsScanningWeb(true);
    setScanMessage(null);
    try {
      const res = await ApiService.scanPublicFacultyEmails();
      if (res.success && Array.isArray(res.suggestions) && res.suggestions.length > 0) {
        const newMap = new Map(suggestions);
        res.suggestions.forEach((s) => {
          newMap.set(s.facultyId, s.suggestedEmail);
        });
        setSuggestions(newMap);
        setScanMessage(
          `Scanned public faculty profiles: found ${res.suggestions.length} email suggestions. Review and confirm them below.`
        );
        showNotification('info', `Found ${res.suggestions.length} public profile suggestions.`);
      } else {
        setScanMessage('Scanned public faculty pages: no additional unverified emails found.');
      }
    } catch (err: any) {
      setScanMessage(`Scan error: ${err.message}`);
    } finally {
      setIsScanningWeb(false);
    }
  };

  // Single Account Creation
  const handleExecuteSingleCreate = async () => {
    if (!singleCreateTarget) return;
    const email = (singleCreateTarget.officialEmail || '').trim().toLowerCase();
    const { status } = getRowEmailStatus(singleCreateTarget);

    if (status !== 'VERIFIED') {
      showNotification('error', `Cannot create account: email is not verified.`);
      setSingleCreateTarget(null);
      return;
    }

    setIsActionSubmitting(true);
    try {
      const res = await ApiService.createAdminFacultyAccount({
        facultyId: singleCreateTarget.id,
        email,
        facultyCode: singleCreateTarget.facultyId || singleCreateTarget.id,
      });

      if (res.success && res.temporaryPassword) {
        setDisclosedCredentials([
          {
            facultyId: singleCreateTarget.id,
            name: singleCreateTarget.name,
            designation: singleCreateTarget.designation,
            department: singleCreateTarget.departmentName || singleCreateTarget.department,
            email,
            loginId: singleCreateTarget.facultyId || singleCreateTarget.id,
            temporaryPassword: res.temporaryPassword,
          },
        ]);
        setDisclosureTitle('Faculty Login Account Created');
        await loadData();
        showNotification('success', `Created account for ${singleCreateTarget.name}.`);
      }
      setSingleCreateTarget(null);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to create faculty account.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Bulk Account Creation
  const handleExecuteBulkCreate = async () => {
    if (eligibleSelectedTeachers.length === 0) return;
    setIsActionSubmitting(true);
    setBulkSkippedList(null);

    const facultyList = eligibleSelectedTeachers.map((t) => ({
      facultyId: t.id,
      email: (t.officialEmail || '').trim().toLowerCase(),
    }));

    try {
      const res = await ApiService.batchProvisionFacultyAccounts(facultyList);
      if (res.success) {
        if (Array.isArray(res.created) && res.created.length > 0) {
          setDisclosedCredentials(
            res.created.map((c) => ({
              facultyId: c.facultyId,
              name: c.name,
              designation: c.designation,
              department: c.department,
              email: c.email,
              loginId: c.loginId,
              temporaryPassword: c.temporaryPassword || '',
            }))
          );
          setDisclosureTitle(`Batch Provisioned ${res.created.length} Faculty Accounts`);
        }

        if (Array.isArray(res.skipped) && res.skipped.length > 0) {
          setBulkSkippedList(res.skipped);
        }

        showNotification(
          'success',
          `Provisioned ${res.created?.length || 0} accounts (${res.skipped?.length || 0} skipped).`
        );
        setSelectedIds(new Set());
        await loadData();
      }
      setShowBulkCreateModal(false);
    } catch (err: any) {
      showNotification('error', err.message || 'Batch provisioning failed.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Reset Password Action
  const handleExecuteResetPassword = async () => {
    if (!resetPasswordTarget) return;
    setIsActionSubmitting(true);
    try {
      const res = await ApiService.resetAdminFacultyAccountPassword(resetPasswordTarget.account.id);
      if (res.success && res.temporaryPassword) {
        setDisclosedCredentials([
          {
            facultyId: resetPasswordTarget.teacher.id,
            name: resetPasswordTarget.teacher.name,
            designation: resetPasswordTarget.teacher.designation,
            department: resetPasswordTarget.teacher.departmentName || resetPasswordTarget.teacher.department,
            email: resetPasswordTarget.account.email,
            loginId: resetPasswordTarget.account.facultyCode || resetPasswordTarget.account.facultyId,
            temporaryPassword: res.temporaryPassword,
          },
        ]);
        setDisclosureTitle('Faculty Password Reset');
        showNotification('success', `Password reset for ${resetPasswordTarget.teacher.name}.`);
        await loadData();
      }
      setResetPasswordTarget(null);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to reset password.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Toggle Active/Disabled Action
  const handleExecuteToggleActive = async () => {
    if (!toggleActiveTarget) return;
    const targetStatus = !toggleActiveTarget.account.isActive;
    setIsActionSubmitting(true);
    try {
      await ApiService.toggleAdminFacultyAccountActive(toggleActiveTarget.account.id, targetStatus);
      showNotification(
        'success',
        `Account ${targetStatus ? 'enabled' : 'disabled'} for ${toggleActiveTarget.teacher.name}.`
      );
      await loadData();
      setToggleActiveTarget(null);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to change account status.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Copy Clipboard Helpers
  const handleCopyText = (text: string, key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 3000);
    }
  };

  const getInviteMessage = (cred: GeneratedCredential): string => {
    const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://campnav-b3om.onrender.com/';
    return `Christ College CampusNav — Faculty Access
Dear ${cred.name},
Your faculty account is ready.
Portal: ${portalUrl}
Login: ${cred.email} (or Faculty ID: ${cred.loginId})
Temporary Password: ${cred.temporaryPassword}

Please log in and update your password immediately upon first access.`;
  };

  // Download CSV (Generated entirely in browser memory)
  const handleDownloadCSV = () => {
    if (!disclosedCredentials || disclosedCredentials.length === 0) return;
    const headers = [
      'Faculty Member',
      'Designation',
      'Department',
      'College Email',
      'Login ID',
      'Temporary Password',
      'Portal URL',
      'Generated At',
    ];
    const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://campnav-b3om.onrender.com/';
    const rows = disclosedCredentials.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${(c.designation || '').replace(/"/g, '""')}"`,
      `"${(c.department || '').replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.loginId}"`,
      `"${c.temporaryPassword}"`,
      `"${portalUrl}"`,
      `"${new Date().toISOString()}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `faculty_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Switch API Server Base URL
  const handleApplyCustomServerUrl = () => {
    const clean = customApiUrlInput.trim();
    if (clean) {
      ApiService.setBaseUrl(clean);
    } else {
      ApiService.setBaseUrl(null);
    }
    // Token is purged from sessionStorage by setBaseUrl
    setIsAdminAuthenticated(!ApiService.isRemoteTarget() && Boolean(ApiService.getAdminToken()));
    setAccounts([]);
    setShowServerConfigModal(false);
    loadData();
  };

  const currentApiBase = getApiBaseUrl();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Faculty Credentials & Access Control
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Issue college faculty login accounts, enforce verified @christcollegeijk.edu.in emails, and manage one-time temporary passwords.
              </p>
              {/* Persistence Status Line */}
              <div className="flex items-center gap-2 mt-2">
                {persistenceStatus?.configured && persistenceStatus.lastSyncSuccess ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Cloud className="w-3 h-3 text-emerald-600" />
                    <span>Saved to data repo: {persistenceStatus.lastSyncTime ? new Date(persistenceStatus.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Synchronized'}</span>
                  </span>
                ) : persistenceStatus?.configured && persistenceStatus.lastSyncSuccess === false ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200" title={persistenceStatus.lastSyncMessage}>
                    <CloudOff className="w-3 h-3 text-amber-600" />
                    <span>Not synced: {persistenceStatus.lastSyncMessage || 'Sync failed'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200" title="GITHUB_DATA_REPO / GITHUB_TOKEN not configured">
                    <Database className="w-3 h-3 text-slate-400" />
                    <span>Not synced: GitHub Data Sync not configured on this server</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Server & Actions Pill */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => {
              setCustomApiUrlInput(currentApiBase === '/api/v1' ? '' : currentApiBase);
              setShowServerConfigModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
            title="Configure target server API URL"
          >
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            <span>Target API: <span className="font-mono text-[11px] text-blue-700">{currentApiBase}</span></span>
          </button>

          {/* Admin Auth Status / Action Pill */}
          {isAdminAuthenticated ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Admin Session Active</span>
              <button
                onClick={handleAdminLogout}
                className="ml-1 px-1.5 py-0.5 rounded-md hover:bg-emerald-200 text-emerald-900 text-[10px] font-bold transition flex items-center gap-1"
                title="Sign out of admin session"
              >
                <LogOut className="w-2.5 h-2.5" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setShowAdminLoginModal(true);
                setAdminLoginError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300 transition"
              title="Authenticate with target server"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-600" />
              <span>Sign In as Admin</span>
            </button>
          )}

          <button
            onClick={handleScanWebForEmails}
            disabled={isScanningWeb}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition disabled:opacity-50"
            title="Check public faculty profile pages on college website for missing emails"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isScanningWeb ? 'animate-spin' : ''}`} />
            <span>{isScanningWeb ? 'Scanning Website...' : 'Scan Public Web Pages'}</span>
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
            title="Refresh accounts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Admin Authentication Card (Inline when unauthenticated or toggled) */}
      {(!isAdminAuthenticated || showAdminLoginModal) && (
        <div className="p-5 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-slate-50 border border-blue-200 rounded-3xl shadow-xs space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Admin Authentication Required for Target API</h3>
                <p className="text-xs text-slate-500">
                  Authenticate against <span className="font-mono text-blue-700 font-semibold">{currentApiBase}</span>. Tokens are held in <span className="font-mono text-slate-700 font-semibold">sessionStorage</span> only and cleared on logout or target change.
                </p>
              </div>
            </div>
            {showAdminLoginModal && isAdminAuthenticated && (
              <button
                onClick={() => setShowAdminLoginModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg self-end sm:self-auto"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {adminLoginError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>{adminLoginError}</div>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAdminLoginMode('password'); setAdminLoginError(null); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                adminLoginMode === 'password'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Username & Password
            </button>
            <button
              type="button"
              onClick={() => { setAdminLoginMode('pin'); setAdminLoginError(null); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                adminLoginMode === 'pin'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Emergency Admin PIN
            </button>
          </div>

          <form onSubmit={handleAdminLoginSubmit} className="space-y-3">
            {adminLoginMode === 'password' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Admin Username</label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={adminUsernameInput}
                    onChange={(e) => setAdminUsernameInput(e.target.value)}
                    placeholder="Enter admin username"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Admin Password</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="Enter admin password"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Emergency Admin PIN</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  placeholder="8-digit Emergency Admin PIN"
                  className="w-full sm:w-1/2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isAdminLoggingIn}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAdminLoggingIn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                <span>{isAdminLoggingIn ? 'Authenticating...' : 'Sign In to Server'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Offline Alert Banner */}
      {serverOnline === false && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>
              <strong>Server Offline:</strong> {serverError || 'Unable to connect to backend server. Account creation and password resets require an active server.'}
            </span>
          </div>
          <button
            onClick={loadData}
            className="px-2.5 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Notification Toast */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center justify-between transition animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : feedback.type === 'error'
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : feedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-75 transition">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Scan Feedback Message */}
      {scanMessage && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span>{scanMessage}</span>
          </div>
          <button onClick={() => setScanMessage(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bulk Partial Skipped Banner */}
      {bulkSkippedList && bulkSkippedList.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{bulkSkippedList.length} Accounts Skipped during Provisioning:</span>
            </span>
            <button onClick={() => setBulkSkippedList(null)} className="p-1 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ul className="list-disc list-inside space-y-1 text-amber-800 text-[11px] max-h-32 overflow-y-auto">
            {bulkSkippedList.map((sk, idx) => (
              <li key={idx}>
                Faculty ID <strong>{sk.facultyId}</strong>: {sk.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Duplicate Emails Warning Banner */}
      {emailStats.duplicate > 0 && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Duplicate College Emails Detected ({emailStats.duplicate} faculty members):</span>
            <p className="text-[11px] text-rose-700 mt-0.5">
              Because the login accepts either college email or faculty ID, sharing an email causes ambiguous authentication. Account creation is strictly blocked for these faculty records until their emails are edited inline.
            </p>
          </div>
        </div>
      )}

      {/* Metrics Row (Matching FacultyDetailsSection style) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Faculty / Accounts
            </span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {accounts.length} <span className="text-sm font-medium text-slate-400">/ {teachers.length}</span>
          </div>
          <span className="text-[11px] text-blue-600 font-semibold flex items-center gap-1 mt-0.5">
            <ShieldCheck className="w-3 h-3" />
            {accounts.filter((a) => a.isActive).length} Active Accounts
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Verified Emails
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {emailStats.verified}
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
            <Check className="w-3 h-3" /> @christcollegeijk.edu.in
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Missing Emails
            </span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {emailStats.missing}
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-0.5">
            Editable inline or via web scan
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Invalid & Duplicate
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600 mt-1">
            {emailStats.invalid + emailStats.duplicate}
          </div>
          <span className="text-[11px] text-rose-600 font-semibold flex items-center gap-1 mt-0.5">
            {emailStats.duplicate} duplicates, {emailStats.invalid} invalid
          </span>
        </div>
      </div>

      {/* Search, Filters, and Bulk Action Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Search Box */}
          <div className="relative flex-1 md:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search faculty name, department, email, or login ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Bulk Action Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkCreateModal(true)}
              disabled={eligibleSelectedTeachers.length === 0}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition ${
                eligibleSelectedTeachers.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/60'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Create Accounts for Selected ({eligibleSelectedTeachers.length})</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filters:
          </span>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-xs"
          >
            <option value="ALL">All Departments ({departmentsList.length})</option>
            {departmentsList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AccountFilterStatus)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-xs"
          >
            <option value="ALL">All Account Statuses</option>
            <option value="NO_ACCOUNT">No Account</option>
            <option value="ACTIVE">Active</option>
            <option value="MUST_CHANGE_PASSWORD">Must Change Password</option>
            <option value="DISABLED">Disabled</option>
          </select>

          <select
            value={emailStatusFilter}
            onChange={(e) => setEmailStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-xs"
          >
            <option value="ALL">All Email Statuses</option>
            <option value="VERIFIED">Verified ({emailStats.verified})</option>
            <option value="MISSING">Missing ({emailStats.missing})</option>
            <option value="INVALID">Invalid ({emailStats.invalid})</option>
            <option value="DUPLICATE">Duplicate ({emailStats.duplicate})</option>
            <option value="SUGGESTION">Unverified Suggestion ({suggestions.size})</option>
          </select>

          {(searchQuery || departmentFilter !== 'ALL' || statusFilter !== 'ALL' || emailStatusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setDepartmentFilter('ALL');
                setStatusFilter('ALL');
                setEmailStatusFilter('ALL');
              }}
              className="text-xs text-blue-600 hover:underline font-semibold ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Showing {filteredTeachers.length} of {teachers.length} Faculty Members
          </span>
          <span className="text-xs text-slate-400">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select rows to batch-create accounts'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/70 text-slate-500 font-bold tracking-wider uppercase text-[10px]">
                <th className="py-3 px-4 w-10 text-center">
                  <button
                    onClick={handleToggleSelectAll}
                    className="p-1 hover:text-blue-600 transition"
                    title={isAllFilteredSelected ? 'Deselect all' : 'Select all (filtered)'}
                  >
                    {isAllFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : isSomeFilteredSelected ? (
                      <MinusSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">Faculty Member</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">College Email</th>
                <th className="py-3 px-4">Login ID</th>
                <th className="py-3 px-4 text-center">Account Status</th>
                <th className="py-3 px-4 text-center">Last Login</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2 text-xs font-medium">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Loading faculty accounts & authoritative records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No faculty members match the current search or filters.
                  </td>
                </tr>
              ) : (
                filteredTeachers.map((t) => {
                  const acc = accountsByFacultyId.get(t.id) || accountsByFacultyId.get(t.facultyId || '');
                  const isSelected = selectedIds.has(t.id);
                  const emailInfo = getRowEmailStatus(t);
                  const deptName = t.departmentName || t.departmentCategory || t.department || 'General';
                  const loginId = acc?.facultyCode || t.facultyId || t.id;
                  const isEditingThisEmail = editingEmailId === t.id;

                  // Account status determination
                  let statusBadge = (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      No account
                    </span>
                  );
                  if (acc) {
                    if (!acc.isActive) {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <UserX className="w-3 h-3" /> Disabled
                        </span>
                      );
                    } else if (acc.mustChangePassword) {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Lock className="w-3 h-3" /> Must change password
                        </span>
                      );
                    } else {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      );
                    }
                  }

                  // Email status badge style
                  let emailBadge = null;
                  if (emailInfo.status === 'VERIFIED') {
                    emailBadge = (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                        title={emailInfo.tooltip}
                      >
                        <Check className="w-2.5 h-2.5" /> Verified
                      </span>
                    );
                  } else if (emailInfo.status === 'MISSING') {
                    emailBadge = (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60"
                        title={emailInfo.tooltip}
                      >
                        <AlertCircle className="w-2.5 h-2.5" /> Missing
                      </span>
                    );
                  } else if (emailInfo.status === 'DUPLICATE') {
                    emailBadge = (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60"
                        title={emailInfo.tooltip}
                      >
                        <Copy className="w-2.5 h-2.5" /> Duplicate
                      </span>
                    );
                  } else if (emailInfo.status === 'INVALID') {
                    emailBadge = (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60"
                        title={emailInfo.tooltip}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" /> Invalid
                      </span>
                    );
                  } else if (emailInfo.status === 'SUGGESTION') {
                    emailBadge = (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60"
                        title={emailInfo.tooltip}
                      >
                        <Sparkles className="w-2.5 h-2.5" /> Suggestion
                      </span>
                    );
                  }

                  const canCreate = !acc && emailInfo.status === 'VERIFIED';

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-blue-50/30 transition ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleRow(t.id)}
                          className="p-1 text-slate-400 hover:text-blue-600 transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Name & Designation */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div className="text-xs font-bold text-slate-900">{t.name}</div>
                        <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                          {t.designation || 'Faculty Member'}
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-semibold text-slate-800">{deptName}</div>
                      </td>

                      {/* College Email & Status Badge */}
                      <td className="py-3.5 px-4">
                        {isEditingThisEmail ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="email"
                                value={inlineEmailValue}
                                onChange={(e) => setInlineEmailValue(e.target.value)}
                                placeholder="username@christcollegeijk.edu.in"
                                className="px-2 py-1 text-xs bg-white border border-blue-400 rounded-lg w-56 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveInlineEmail(t)}
                                disabled={isSavingEmail}
                                className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                                title="Save email"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={handleCancelEditEmail}
                                className="p-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {inlineEmailError && (
                              <div className="text-[10px] text-rose-600 font-medium">
                                {inlineEmailError}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] text-slate-700">
                              {t.officialEmail || (
                                <span className="text-slate-400 italic">Not assigned</span>
                              )}
                            </span>
                            {emailBadge}
                            <button
                              onClick={() => handleStartEditEmail(t)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-md transition"
                              title="Edit official college email"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Login ID */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                        {loginId}
                      </td>

                      {/* Account Status Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {statusBadge}
                      </td>

                      {/* Last Login */}
                      <td className="py-3.5 px-4 text-center text-[11px] text-slate-500 font-mono">
                        {acc?.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleDateString() : 'Never'}
                      </td>

                      {/* Row Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {!acc ? (
                          <button
                            onClick={() => setSingleCreateTarget(t)}
                            disabled={!canCreate || serverOnline === false}
                            className={`inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                              canCreate && serverOnline !== false
                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/60'
                            }`}
                            title={
                              !canCreate
                                ? emailInfo.status === 'DUPLICATE'
                                  ? 'Creation blocked: duplicate email'
                                  : 'Creation requires verified @christcollegeijk.edu.in email'
                                : 'Create login account'
                            }
                          >
                            <Plus className="w-3 h-3" />
                            <span>Create account</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setResetPasswordTarget({ teacher: t, account: acc })}
                              disabled={serverOnline === false}
                              className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-amber-700 bg-slate-100 hover:bg-amber-50 rounded-lg border border-slate-200/60 transition disabled:opacity-50"
                              title="Generate new temporary password"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset password</span>
                            </button>

                            <button
                              onClick={() => setToggleActiveTarget({ teacher: t, account: acc })}
                              disabled={serverOnline === false}
                              className={`inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-semibold rounded-lg border transition disabled:opacity-50 ${
                                acc.isActive
                                  ? 'text-rose-700 hover:bg-rose-50 border-rose-200/60 bg-white'
                                  : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200/60 bg-white'
                              }`}
                              title={acc.isActive ? 'Disable account login' : 'Enable account login'}
                            >
                              {acc.isActive ? (
                                <>
                                  <UserX className="w-3 h-3 text-rose-600" />
                                  <span>Disable</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Enable</span>
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Single Account Creation Confirmation */}
      {singleCreateTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <KeyRound className="w-5 h-5" />
              </div>
              <button
                onClick={() => setSingleCreateTarget(null)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Create Faculty Login Account</h3>
              <p className="text-xs text-slate-500 mt-1">
                A login account will be provisioned on the server with a cryptographically secure 14-character temporary password.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Faculty:</span>
                <span className="font-bold text-slate-800">{singleCreateTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Department:</span>
                <span className="text-slate-800">{singleCreateTarget.departmentName || singleCreateTarget.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">College Email:</span>
                <span className="font-mono text-blue-700 font-semibold">{singleCreateTarget.officialEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Login ID:</span>
                <span className="font-mono text-slate-800">{singleCreateTarget.facultyId || singleCreateTarget.id}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/60 text-[11px] text-amber-800 flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>First-Login Enforcement:</strong> The temporary password will be shown once in the next dialog. The faculty member must change it on first login.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSingleCreateTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSingleCreate}
                disabled={isActionSubmitting}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isActionSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Create Account</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Bulk Create Confirmation */}
      {showBulkCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <button
                onClick={() => setShowBulkCreateModal(false)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                Batch Provision {eligibleSelectedTeachers.length} Faculty Accounts
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Accounts will be created only for selected faculty with verified, unique @christcollegeijk.edu.in emails.
              </p>
            </div>

            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl text-xs">
              {eligibleSelectedTeachers.map((t) => (
                <div key={t.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-900">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{t.departmentName || t.department}</div>
                  </div>
                  <span className="font-mono text-[11px] text-blue-700">{t.officialEmail}</span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/60 text-[11px] text-amber-800 flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                Unique 14-character passwords will be generated. You will be able to download the complete credentials CSV or copy invite messages immediately on the next screen.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowBulkCreateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteBulkCreate}
                disabled={isActionSubmitting}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isActionSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Provision {eligibleSelectedTeachers.length} Accounts</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Password Confirmation */}
      {resetPasswordTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <RotateCcw className="w-5 h-5" />
              </div>
              <button
                onClick={() => setResetPasswordTarget(null)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Reset Faculty Password</h3>
              <p className="text-xs text-slate-500 mt-1">
                Generate a new cryptographically random temporary password for <strong>{resetPasswordTarget.teacher.name}</strong>.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">College Email:</span>
                <span className="font-mono text-slate-800">{resetPasswordTarget.account.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Login ID:</span>
                <span className="font-mono text-slate-800">
                  {resetPasswordTarget.account.facultyCode || resetPasswordTarget.account.facultyId}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/60 text-[11px] text-amber-800">
              The existing password will be revoked immediately and mustChangePassword will be set to true.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setResetPasswordTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteResetPassword}
                disabled={isActionSubmitting}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isActionSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Reset Password</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Toggle Active/Disable Confirmation */}
      {toggleActiveTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                  toggleActiveTarget.account.isActive ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {toggleActiveTarget.account.isActive ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
              </div>
              <button
                onClick={() => setToggleActiveTarget(null)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                {toggleActiveTarget.account.isActive ? 'Disable Faculty Account' : 'Enable Faculty Account'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {toggleActiveTarget.account.isActive
                  ? `Prevent ${toggleActiveTarget.teacher.name} from logging in until re-enabled.`
                  : `Restore login access for ${toggleActiveTarget.teacher.name}.`}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setToggleActiveTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteToggleActive}
                disabled={isActionSubmitting}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5 ${
                  toggleActiveTarget.account.isActive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isActionSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{toggleActiveTarget.account.isActive ? 'Disable Account' : 'Enable Account'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: CRITICAL CREDENTIALS DISCLOSURE (Plaintext shown ONLY ONCE here) */}
      {disclosedCredentials && disclosedCredentials.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">{disclosureTitle}</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Showing credentials for {disclosedCredentials.length} faculty member(s).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDisclosedCredentials(null)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition"
                title="Dismiss and purge plaintext passwords"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Crucial Security Notice */}
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">One-Time Plaintext Disclosure Notice:</strong>
                <p className="text-[11px] text-rose-800 mt-0.5">
                  These temporary passwords are only held in memory right now and will be permanently cleared once this window is closed. Copy invite messages or download the credentials CSV now. The server stores only irreversible bcrypt hashes.
                </p>
              </div>
            </div>

            {/* Credentials Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Faculty</th>
                    <th className="py-2.5 px-3">Login Email / ID</th>
                    <th className="py-2.5 px-3">Temporary Password</th>
                    <th className="py-2.5 px-3 text-right">Invite Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {disclosedCredentials.map((c) => {
                    const isCopiedPass = copiedKey === `pass_${c.facultyId}`;
                    const isCopiedMsg = copiedKey === `msg_${c.facultyId}`;
                    return (
                      <tr key={c.facultyId} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{c.name}</div>
                          <div className="text-[11px] text-slate-400">{c.department}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-blue-700">{c.email}</div>
                          <div className="font-mono text-[10px] text-slate-400">ID: {c.loginId}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono font-bold text-slate-900 text-xs">
                            <span>{c.temporaryPassword}</span>
                            <button
                              onClick={() => handleCopyText(c.temporaryPassword, `pass_${c.facultyId}`)}
                              className="p-1 text-slate-400 hover:text-blue-600 transition"
                              title="Copy temporary password"
                            >
                              {isCopiedPass ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleCopyText(getInviteMessage(c), `msg_${c.facultyId}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                            title="Copy complete invite message to clipboard"
                          >
                            {isCopiedMsg ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Invite Message</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={handleDownloadCSV}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition w-full sm:w-auto justify-center"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Credentials CSV</span>
              </button>

              <button
                onClick={() => setDisclosedCredentials(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition w-full sm:w-auto"
              >
                Done & Clear Plaintext
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Target Server API URL Switcher */}
      {showServerConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Globe className="w-5 h-5" />
              </div>
              <button
                onClick={() => setShowServerConfigModal(false)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Control Center API Server Target</h3>
              <p className="text-xs text-slate-500 mt-1">
                Point the Control Center to either your local dev server or live Render instance. Accounts are created on whichever server is connected.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">API Base URL</label>
              <input
                type="text"
                placeholder="/api/v1 (default local) or https://campnav-b3om.onrender.com/api/v1"
                value={customApiUrlInput}
                onChange={(e) => setCustomApiUrlInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 font-mono"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCustomApiUrlInput('/api/v1')}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                >
                  Local (/api/v1)
                </button>
                <button
                  type="button"
                  onClick={() => setCustomApiUrlInput('https://campnav-b3om.onrender.com/api/v1')}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                >
                  Live Render Server
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowServerConfigModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCustomServerUrl}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs"
              >
                Apply & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
