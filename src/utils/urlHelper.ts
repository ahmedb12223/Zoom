/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassSession, TeacherProfile, SchoolClass } from '../types';

/**
 * Ensures any URL provided (e.g. "zoom.us/j/123", "https://...") is a valid absolute URL.
 * Prevents relative URL navigation that reloads the web application.
 */
export function ensureAbsoluteUrl(url?: string | null): string {
  if (!url) {
    return 'https://zoom.us';
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return 'https://zoom.us';
  }

  // If already starts with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Prepend https://
  return `https://${trimmed}`;
}

export const STORAGE_KEY_PUBLISHED_DOMAIN = 'zoom_attendance_published_domain';

/**
 * Dynamic getter for the active site origin without trailing slash.
 */
export function getActiveSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
}

// Deprecated constant kept for backward compatibility: defaults to the real open website URL
export const DEFAULT_PUBLISHED_DOMAIN = getActiveSiteOrigin();

/**
 * Ensures any domain or URL string is a valid absolute URL without trailing slashes.
 */
export function ensureAbsoluteDomain(domain?: string): string {
  const currentOrigin = getActiveSiteOrigin();
  let cleaned = (domain || '').trim().replace(/\/+$/, '');
  
  // Discard invalid dummy/dummy-like domain zoom123
  if (!cleaned || cleaned.includes('zoom123')) {
    return currentOrigin || 'https://zoom.us';
  }

  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned;
}

/**
 * Gets the configured or active public domain for student attendance links.
 * 1. Checks localStorage for an explicitly teacher-configured domain (ignoring any stale zoom123 value).
 * 2. Defaults directly to the actual open website's URL (window.location.origin) so every link and QR code works instantly.
 */
export function getPublishedDomain(): string {
  const currentOrigin = getActiveSiteOrigin();
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PUBLISHED_DOMAIN);
      if (saved) {
        const trimmed = saved.trim();
        // Automatically purge any stale dummy domains like zoom123.ai.studio
        if (trimmed.includes('zoom123') || !trimmed) {
          localStorage.removeItem(STORAGE_KEY_PUBLISHED_DOMAIN);
        } else {
          return ensureAbsoluteDomain(trimmed);
        }
      }
    } catch {
      // ignore
    }
  }
  return currentOrigin || '';
}

/**
 * Saves a new published domain to localStorage for all future student attendance links.
 * If empty or contains zoom123, it resets back to the current active website origin.
 */
export function setPublishedDomain(domain: string): void {
  if (typeof window === 'undefined') return;
  try {
    const cleaned = (domain || '').trim();
    if (!cleaned || cleaned.includes('zoom123')) {
      localStorage.removeItem(STORAGE_KEY_PUBLISHED_DOMAIN);
      return;
    }
    localStorage.setItem(STORAGE_KEY_PUBLISHED_DOMAIN, ensureAbsoluteDomain(cleaned));
  } catch {
    // ignore
  }
}

/**
 * Builds a portable, self-contained student attendance URL.
 * Always resolves to the reliable published platform domain (e.g. https://zoom123.ai.studio)
 * without requiring any Google/Gmail login on iPhones, Androids, or external browsers.
 * Encodes all necessary session and teacher metadata into URL query parameters so that
 * when opened on any device, incognito tab, or mobile browser without local storage,
 * the student gateway will reconstruct the exact session and zoom link reliably.
 */
export function buildStudentAttendanceLink(
  session: ClassSession,
  teacher?: TeacherProfile,
  customDomain?: string
): string {
  const rawBase = customDomain ? ensureAbsoluteDomain(customDomain) : getPublishedDomain();
  const baseDomain = (rawBase || getActiveSiteOrigin()).replace(/\/+$/, '');

  const cleanZoomUrl = ensureAbsoluteUrl(session.zoomUrl);

  const params = new URLSearchParams();
  params.set('attend', session.id);
  params.set('cid', session.classId || 'class_auto');
  params.set('cls', session.className || 'الفصل');
  params.set('title', session.sessionTitle || 'حصة دراسية');
  params.set('zoom', cleanZoomUrl);

  if (teacher) {
    params.set('t', teacher.name);
    params.set('sub', teacher.subject);
    params.set('tid', teacher.id);
  } else if (session.teacherId) {
    params.set('tid', session.teacherId);
  }

  // Both search params (?attend=...) and hash fragment (#attend/...) for maximum compatibility
  return `${baseDomain}/?${params.toString()}#attend/${encodeURIComponent(session.id)}`;
}

export interface ParsedAttendanceInfo {
  isAttendanceMode: boolean;
  sessionId: string | null;
  reconstructedSession: ClassSession | null;
  reconstructedTeacher: TeacherProfile | null;
}

/**
 * Inspects both window.location.search and window.location.hash to detect
 * if the user has navigated to or opened a student attendance link.
 */
export function parseAttendanceFromUrl(): ParsedAttendanceInfo {
  if (typeof window === 'undefined') {
    return {
      isAttendanceMode: false,
      sessionId: null,
      reconstructedSession: null,
      reconstructedTeacher: null,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash || '';

  // Check query params first (?attend=... or ?session=...)
  const queryAttend = searchParams.get('attend') || searchParams.get('session');

  // Check hash (#attend/... or #/attend/...)
  let hashAttend: string | null = null;
  if (hash.startsWith('#attend/')) {
    hashAttend = decodeURIComponent(hash.replace('#attend/', ''));
  } else if (hash.startsWith('#/attend/')) {
    hashAttend = decodeURIComponent(hash.replace('#/attend/', ''));
  }

  const sessionId = queryAttend || hashAttend;

  if (!sessionId) {
    return {
      isAttendanceMode: false,
      sessionId: null,
      reconstructedSession: null,
      reconstructedTeacher: null,
    };
  }

  // Extract metadata if available in search parameters
  const className = searchParams.get('cls') || 'الفصل';
  const sessionTitle = searchParams.get('title') || 'حصة دراسية';
  const classId = searchParams.get('cid') || 'class_auto';
  const zoomParam = searchParams.get('zoom');
  const zoomUrl = ensureAbsoluteUrl(zoomParam || 'https://zoom.us');
  const teacherName = searchParams.get('t') || 'معلم المادة';
  const teacherSub = searchParams.get('sub') || 'المادة الدراسية';
  const teacherId = searchParams.get('tid') || 'teacher_guest';

  const reconstructedSession: ClassSession = {
    id: sessionId,
    teacherId,
    classId,
    className,
    sessionTitle,
    zoomUrl,
    targetTrack: 'all',
    createdAt: new Date().toISOString(),
    scheduledTime: 'مباشر الآن',
    isActive: true,
    attendance: [],
  };

  const reconstructedTeacher: TeacherProfile = {
    id: teacherId,
    name: teacherName,
    subject: teacherSub,
    schoolName: 'مدرسة اللغات الحديثة',
    email: '',
    defaultZoomLink: zoomUrl,
    assignedClassIds: [classId],
  };

  return {
    isAttendanceMode: true,
    sessionId,
    reconstructedSession,
    reconstructedTeacher,
  };
}

/**
 * Clears student attendance parameters from URL and returns to main view cleanly.
 */
export function clearAttendanceUrl() {
  if (typeof window === 'undefined') return;
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState(null, '', baseUrl);
}
