import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, User, Lock, Mail, CheckCircle2, AlertCircle, LogOut,
  Clock, MapPin, KeyRound, ChevronDown, Check, Loader2, Sparkles, ShieldAlert
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { FacultyStatusType, PublicFacultyStatus } from '../../../../shared/types';

interface FacultyPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ClassroomOption {
  id: string;
  roomNumber: string;
  name: string;
  building: string | null;
  floor: any;
  nodeId: string;
}

const STATUS_CHOICES: Array<{
  type: FacultyStatusType;
  label: string;
  desc: string;
  dotColor: string;
  activeBorder: string;
  activeBg: string;
  textColor: string;
}> = [
  {
    type: 'AVAILABLE',
    label: 'Available',
    desc: 'In department / open for student consultation',
    dotColor: 'bg-emerald-500',
    activeBorder: 'border-emerald-500 ring-2 ring-emerald-400/30',
    activeBg: 'bg-emerald-50',
    textColor: 'text-emerald-800',
  },
  {
    type: 'IN_CLASS',
    label: 'In Class',
    desc: 'Currently lecturing or conducting lab session',
    dotColor: 'bg-blue-500',
    activeBorder: 'border-blue-500 ring-2 ring-blue-400/30',
    activeBg: 'bg-blue-50',
    textColor: 'text-blue-800',
  },
  {
    type: 'BUSY',
    label: 'Busy',
    desc: 'Engaged in meeting, examination, or administrative task',
    dotColor: 'bg-amber-500',
    activeBorder: 'border-amber-500 ring-2 ring-amber-400/30',
    activeBg: 'bg-amber-50',
    textColor: 'text-amber-800',
  },
  {
    type: 'NOT_AVAILABLE',
    label: 'Not Available',
    desc: 'Away from desk / office hours concluded',
    dotColor: 'bg-slate-400',
    activeBorder: 'border-slate-400 ring-2 ring-slate-300',
    activeBg: 'bg-slate-100',
    textColor: 'text-slate-700',
  },
  {
    type: 'ON_LEAVE',
    label: 'On Leave',
    desc: 'On approved official duty or personal leave',
    dotColor: 'bg-rose-500',
    activeBorder: 'border-rose-500 ring-2 ring-rose-400/30',
    activeBg: 'bg-rose-50',
    textColor: 'text-rose-800',
  },
];

const DURATION_OPTIONS = [
  { label: '30 Minutes', value: 30 },
  { label: '1 Hour', value: 60 },
  { label: '2 Hours (Default)', value: 120 },
  { label: '4 Hours', value: 240 },
  { label: 'Until End of Day (5 PM)', value: 480 },
];

export const FacultyPortalModal: React.FC<FacultyPortalModalProps> = ({ isOpen, onClose }) => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [facultyUser, setFacultyUser] = useState<any | null>(null);
  const [currentStatusRecord, setCurrentStatusRecord] = useState<PublicFacultyStatus | null>(null);

  const [welcomeBanner, setWelcomeBanner] = useState<string | null>(null);

  // Login form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  // Mandatory First-Login Password Change State
  const [isFirstLoginReset, setIsFirstLoginReset] = useState<boolean>(false);
  const [firstLoginTempPassword, setFirstLoginTempPassword] = useState<string>('');
  const [firstLoginNewPassword, setFirstLoginNewPassword] = useState<string>('');
  const [firstLoginConfirmPassword, setFirstLoginConfirmPassword] = useState<string>('');
  const [isSubmittingFirstLoginReset, setIsSubmittingFirstLoginReset] = useState<boolean>(false);
  const [firstLoginError, setFirstLoginError] = useState<string | null>(null);

  // Status update state
  const [selectedStatus, setSelectedStatus] = useState<FacultyStatusType>('AVAILABLE');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState<string | null>(null);
  const [updateErrorMessage, setUpdateErrorMessage] = useState<string | null>(null);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check existing session
  const checkSession = useCallback(async () => {
    const token = localStorage.getItem('waycampus_faculty_token');
    if (!token) {
      setIsAuthenticated(false);
      setAuthLoading(false);
      return;
    }

    try {
      const data = await ApiService.getFacultyMe();
      if (data.success && data.faculty) {
        setFacultyUser(data.faculty);
        setCurrentStatusRecord(data.status);
        if (data.status?.status) {
          setSelectedStatus(data.status.status);
          setSelectedClassroomId(data.status.locationPlaceId || '');
        }
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem('waycampus_faculty_token');
        setIsAuthenticated(false);
      }
    } catch {
      localStorage.removeItem('waycampus_faculty_token');
      setIsAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Fetch verified classrooms
  useEffect(() => {
    if (isOpen) {
      checkSession();
      ApiService.getVerifiedClassrooms().then((list) => {
        setClassrooms(list || []);
      });
    }
  }, [isOpen, checkSession]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setLoginError('Please enter your faculty ID or email and password.');
      return;
    }

    setIsSubmittingLogin(true);
    setLoginError(null);

    try {
      const res = await ApiService.facultyLogin(identifier.trim(), password);
      if (res.success) {
        if (res.mustChangePassword) {
          // Intercept temporary password: require mandatory password reset
          setFirstLoginTempPassword(password);
          setPassword('');
          setIsFirstLoginReset(true);
          return;
        }
        setPassword('');
        await checkSession();
      } else {
        setLoginError('Login failed. Please verify credentials.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleFirstLoginPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirstLoginError(null);

    if (!firstLoginNewPassword || firstLoginNewPassword.length < 6) {
      setFirstLoginError('New permanent password must be at least 6 characters long.');
      return;
    }
    if (firstLoginNewPassword === firstLoginTempPassword) {
      setFirstLoginError('Your new permanent password must be different from your temporary password.');
      return;
    }
    if (firstLoginNewPassword !== firstLoginConfirmPassword) {
      setFirstLoginError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmittingFirstLoginReset(true);
    try {
      const res = await ApiService.changeFacultyPassword(firstLoginTempPassword, firstLoginNewPassword);
      if (res.success) {
        setIsFirstLoginReset(false);
        setFirstLoginTempPassword('');
        setFirstLoginNewPassword('');
        setFirstLoginConfirmPassword('');
        setWelcomeBanner('Permanent password saved successfully! Welcome to your Faculty Portal.');
        await checkSession();
      } else {
        setFirstLoginError('Failed to update password. Please try again.');
      }
    } catch (err: any) {
      setFirstLoginError(err?.message || 'Failed to update password.');
    } finally {
      setIsSubmittingFirstLoginReset(false);
    }
  };

  const handleUpdateStatus = async () => {
    setIsUpdatingStatus(true);
    setUpdateSuccessMessage(null);
    setUpdateErrorMessage(null);

    try {
      const payload: {
        status: FacultyStatusType;
        locationPlaceId?: string;
        durationMinutes?: number;
      } = {
        status: selectedStatus,
        durationMinutes,
      };

      if (selectedStatus === 'IN_CLASS' && selectedClassroomId.trim()) {
        payload.locationPlaceId = selectedClassroomId.trim();
      }

      const res = await ApiService.updateFacultyStatus(payload);
      if (res.success) {
        setUpdateSuccessMessage('Availability status updated successfully! Changes are live to students.');
        await checkSession();
        window.dispatchEvent(new CustomEvent('campnav:faculty_status_updated'));
        setTimeout(() => setUpdateSuccessMessage(null), 4000);
      }
    } catch (err: any) {
      setUpdateErrorMessage(err?.message || 'Failed to update status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await ApiService.changeFacultyPassword(currentPassword, newPassword);
      if (res.success) {
        setPasswordMessage({ type: 'success', text: 'Password changed successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setShowPasswordChange(false), 2000);
      }
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err?.message || 'Failed to change password.' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = () => {
    ApiService.facultyLogout();
    setIsAuthenticated(false);
    setFacultyUser(null);
    setCurrentStatusRecord(null);
    window.dispatchEvent(new CustomEvent('campnav:faculty_status_updated'));
  };

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white border-t sm:border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88dvh] relative animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile top pull indicator */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-0.5 sm:hidden flex-shrink-0" />

        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between gap-2.5 bg-slate-50/90 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 flex-shrink-0">
              <User size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[#1e3a5f] font-black text-sm sm:text-base tracking-tight leading-snug truncate">
                WayCampus Faculty Portal
              </h2>
              <p className="text-[11px] text-blue-600 font-semibold truncate">
                {isAuthenticated ? 'Live Availability Management' : 'Faculty Member Authentication'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Faculty Portal"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all flex-shrink-0 active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-5 overflow-y-auto overscroll-contain flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {authLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 size={28} className="animate-spin text-blue-600" />
              <p className="text-slate-500 text-xs font-medium">Validating faculty session...</p>
            </div>
          ) : !isAuthenticated ? (
            /* ──────────────────────────────────────
                AUTHENTICATION VIEW (OFFICIAL SIGN IN & FIRST-LOGIN SETUP)
            ────────────────────────────────────── */
            <div className="space-y-3.5 sm:space-y-4">
              {isFirstLoginReset ? (
                /* ─── MANDATORY FIRST-TIME PASSWORD SETUP ─── */
                <form onSubmit={handleFirstLoginPasswordSubmit} className="space-y-3.5 sm:space-y-4">
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                    <p className="font-semibold flex items-center gap-1.5 text-amber-900">
                      <KeyRound size={14} className="text-amber-600 flex-shrink-0" />
                      <span>Mandatory Security Setup</span>
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      You are logging in with a temporary administration password. Please set your private, permanent password before continuing to your presence portal.
                    </p>
                  </div>

                  {firstLoginError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs">
                      <AlertCircle size={15} className="text-rose-600 flex-shrink-0 mt-0.5" />
                      <p>{firstLoginError}</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 sm:mb-1.5">
                      New Permanent Password
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        value={firstLoginNewPassword}
                        onChange={(e) => setFirstLoginNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full pl-10 pr-3 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-colors min-h-[44px]"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 sm:mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        value={firstLoginConfirmPassword}
                        onChange={(e) => setFirstLoginConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full pl-10 pr-3 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-colors min-h-[44px]"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingFirstLoginReset}
                    className="w-full min-h-[44px] py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-sm shadow-md shadow-amber-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isSubmittingFirstLoginReset ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Saving new password...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Save Password & Enter Portal</span>
                      </>
                    )}
                  </button>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFirstLoginReset(false);
                        setFirstLoginTempPassword('');
                        setFirstLoginNewPassword('');
                        setFirstLoginConfirmPassword('');
                        setFirstLoginError(null);
                        localStorage.removeItem('waycampus_faculty_token');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors py-1 px-2"
                    >
                      Cancel and back to Sign In
                    </button>
                  </div>
                </form>
              ) : (
                /* ─── SECURE SIGN IN FORM ─── */
                <form onSubmit={handleLogin} className="space-y-3.5 sm:space-y-4">
                  <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-100 text-xs text-blue-900">
                    <p className="font-bold flex items-center gap-1.5 text-blue-700">
                      <Sparkles size={14} className="text-blue-600 flex-shrink-0" />
                      <span>Faculty Presence Self-Service</span>
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      Sign in to broadcast your real-time availability and classroom location to students across campus.
                    </p>
                  </div>

                  {loginError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs">
                      <AlertCircle size={15} className="text-rose-600 flex-shrink-0 mt-0.5" />
                      <p>{loginError}</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 sm:mb-1.5">
                      Faculty Email or ID Code
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="e.g. yourname@christcollegeijk.edu.in"
                        className="w-full pl-10 pr-3 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-colors min-h-[44px]"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 sm:mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password or temporary code"
                        className="w-full pl-10 pr-3 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-colors min-h-[44px]"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingLogin}
                    className="w-full min-h-[44px] py-3 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-extrabold text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isSubmittingLogin ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <span>Sign In to Faculty Portal</span>
                    )}
                  </button>

                  {/* Security Notice */}
                  <div className="pt-2.5 border-t border-slate-100 text-center">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                      <div className="flex items-center justify-center gap-1.5 text-slate-700 font-semibold">
                        <ShieldAlert size={14} className="text-amber-500" />
                        <span>Authorized Faculty Access Only</span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Public self-registration is disabled for campus privacy. Initial accounts and temporary passwords are systematically provisioned by the College Administration Office.
                      </p>
                    </div>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* ──────────────────────────────────────
                AUTHENTICATED DASHBOARD VIEW
            ────────────────────────────────────── */
            <div className="space-y-4">
              {/* Welcome Alert */}
              {welcomeBanner && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-xs shadow-xs animate-fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={17} className="text-emerald-600 flex-shrink-0" />
                    <span className="font-semibold">{welcomeBanner}</span>
                  </div>
                  <button
                    onClick={() => setWelcomeBanner(null)}
                    className="text-emerald-600 hover:text-emerald-800 text-xs font-bold px-1.5 py-0.5"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Faculty Identity Card */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  {facultyUser?.profileImageUrl ? (
                    <img
                      src={facultyUser.profileImageUrl}
                      alt={facultyUser.name}
                      className="w-11 h-11 rounded-xl object-cover object-top border border-blue-200 flex-shrink-0 shadow-xs"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold flex-shrink-0 shadow-xs">
                      {facultyUser?.name?.charAt(0) || 'F'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-slate-900 font-extrabold text-sm truncate">{facultyUser?.name}</h3>
                    <p className="text-blue-600 font-medium text-xs truncate">
                      {facultyUser?.designation} • {facultyUser?.departmentName || facultyUser?.departmentCategory}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors flex-shrink-0 flex items-center justify-center shadow-xs"
                  title="Log Out"
                >
                  <LogOut size={16} />
                </button>
              </div>

              {/* Status Update Feedback Messages */}
              {updateSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs animate-fade-in">
                  <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                  <span>{updateSuccessMessage}</span>
                </div>
              )}

              {updateErrorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-xs animate-fade-in">
                  <AlertCircle size={16} className="text-rose-600 flex-shrink-0" />
                  <span>{updateErrorMessage}</span>
                </div>
              )}

              {/* Status Selector */}
              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Declare Availability Status
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {STATUS_CHOICES.map((choice) => {
                    const isSelected = selectedStatus === choice.type;
                    return (
                      <button
                        key={choice.type}
                        type="button"
                        onClick={() => setSelectedStatus(choice.type)}
                        className={`w-full min-h-[44px] p-2.5 rounded-xl border text-left transition-all flex items-center justify-between active:scale-[0.99] ${
                          isSelected
                            ? `${choice.activeBg} ${choice.activeBorder} shadow-sm`
                            : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${choice.dotColor} ${isSelected ? 'animate-pulse' : ''}`} />
                          <div>
                            <p className={`text-xs font-bold ${isSelected ? choice.textColor : 'text-slate-800'}`}>
                              {choice.label}
                            </p>
                            <p className="text-[10px] text-slate-500">{choice.desc}</p>
                          </div>
                        </div>
                        {isSelected && <Check size={15} className={choice.textColor} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* In-Class Verified Classroom Selection (Only if In Class selected) */}
              {selectedStatus === 'IN_CLASS' && (
                <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 space-y-2 animate-fade-in">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                    <MapPin size={13} className="text-blue-600" />
                    Select Verified Classroom (Optional)
                  </label>
                  <select
                    value={selectedClassroomId}
                    onChange={(e) => setSelectedClassroomId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-500 min-h-[44px] shadow-xs"
                  >
                    <option value="">No specific classroom (General In Class)</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.roomNumber}>
                        {c.roomNumber} - {c.name} {c.building ? `(${c.building})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500">
                    Selecting a verified classroom enables a direct 360° walking navigation path for students.
                  </p>
                </div>
              )}

              {/* Duration / Expiry Setting */}
              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock size={13} className="text-slate-500" />
                  Auto-Reset Expiration
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-500 min-h-[44px]"
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Status automatically reverts to Not Available once this duration expires to prevent stale information.
                </p>
              </div>

              {/* Submit Update Button */}
              <button
                type="button"
                onClick={handleUpdateStatus}
                disabled={isUpdatingStatus}
                className="w-full min-h-[44px] py-3 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-extrabold text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isUpdatingStatus ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Publishing Status...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Update Status Now</span>
                  </>
                )}
              </button>

              {/* Password Change Toggle */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className="w-full py-2 flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <KeyRound size={13} />
                    Change Account Password
                  </span>
                  <ChevronDown size={14} className={`transform transition-transform ${showPasswordChange ? 'rotate-180' : ''}`} />
                </button>

                {showPasswordChange && (
                  <form onSubmit={handleChangePassword} className="space-y-2.5 mt-2 bg-slate-50 p-3 rounded-xl border border-slate-200 animate-fade-in">
                    {passwordMessage && (
                      <p className={`text-xs ${passwordMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {passwordMessage.text}
                      </p>
                    )}
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current Password"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs focus:outline-none focus:border-blue-500"
                      required
                    />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New Password (min 6 characters)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs focus:outline-none focus:border-blue-500"
                      required
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm New Password"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs focus:outline-none focus:border-blue-500"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isChangingPassword ? <Loader2 size={13} className="animate-spin" /> : null}
                      <span>Save New Password</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
