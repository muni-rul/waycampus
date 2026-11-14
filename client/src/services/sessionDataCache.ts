import { Teacher, Department, CampusInfoData } from '../../../shared/types';

const KEY_TEACHERS = 'campnav_session_teachers_v1';
const KEY_DEPARTMENTS = 'campnav_session_departments_v1';
const KEY_CAMPUS_INFO = 'campnav_session_campus_info_v1';

export function getSessionTeachers(): Teacher[] | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY_TEACHERS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Teacher[]) : null;
  } catch {
    return null;
  }
}

export function setSessionTeachers(teachers: Teacher[]): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(KEY_TEACHERS, JSON.stringify(teachers));
  } catch {}
}

export function getSessionDepartments(): Department[] | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY_DEPARTMENTS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Department[]) : null;
  } catch {
    return null;
  }
}

export function setSessionDepartments(departments: Department[]): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(KEY_DEPARTMENTS, JSON.stringify(departments));
  } catch {}
}

export function getSessionCampusInfo(): CampusInfoData | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY_CAMPUS_INFO);
    if (!raw) return null;
    return JSON.parse(raw) as CampusInfoData;
  } catch {
    return null;
  }
}

export function setSessionCampusInfo(info: CampusInfoData): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(KEY_CAMPUS_INFO, JSON.stringify(info));
  } catch {}
}
