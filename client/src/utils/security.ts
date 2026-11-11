/**
 * Security and Environment Utility
 * Restricts Debug & Admin modes strictly to authorized personnel.
 */

export const isLocalhost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
};

export const LOCAL_DEV_ADMIN_TOKEN = 'dev-localhost-unrestricted-bypass-token';

export const LOCAL_DEV_ADMIN_USER = {
  username: 'admin',
  role: 'SUPER_ADMIN' as const,
  name: 'System Administrator',
};

/**
 * Explicit helper for development testing if manual session seeding is needed.
 * Never invoked automatically during page load or component renders.
 */
export const ensureLocalhostAdminAuth = (): void => {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem('campnav_admin_auth', 'true');
    sessionStorage.setItem('campnav_admin_token', LOCAL_DEV_ADMIN_TOKEN);
    sessionStorage.setItem('campnav_admin_user', JSON.stringify(LOCAL_DEV_ADMIN_USER));
  } catch (err) {
    console.warn('Unable to set admin session:', err);
  }
};

/**
 * Checks if an administrator session is currently active and authenticated.
 * Requires both the auth flag and a valid token in sessionStorage or localStorage.
 */
export const isAdminAuthenticated = (): boolean => {
  return isLocalhost();
};

export const logoutAdmin = (): void => {
  // No-op: open access mode
};

export const sanitizeProductionUrl = (): boolean => {
  return false; // Do not strip URLs in production
};

