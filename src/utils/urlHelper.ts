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

/**
 * Builds a portable, self-contained student attendance URL.
 * Encodes all necessary session and teacher metadata into URL query parameters so that
 * when opened on any device, incognito tab, or mobile browser without local storage,
 * the student gateway will reconstruct the exact session and zoom link reliably.
 */
export function buildStudentAttendanceLink(
  session: ClassSession,
  teacher?: TeacherProfile
): string {
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  const baseUrl = `${origin}${pathname}`;

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
  return `${baseUrl}?${params.toString()}#attend/${encodeURIComponent(session.id)}`;
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
