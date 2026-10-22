/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassSession, AttendanceRecord, Student, SchoolClass, TeacherProfile } from '../types/index.ts';

const SYNC_CHANNEL_NAME = 'zoom_attendance_sync_bus';

// BroadcastChannel for instant zero-latency cross-tab synchronization
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      return new BroadcastChannel(SYNC_CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return null;
}

export interface SyncMessage {
  type: 'ATTENDANCE_RECORDED' | 'SESSION_UPDATED' | 'SESSION_CREATED' | 'SESSION_DELETED' | 'DATA_RESET';
  sessionId?: string;
  record?: AttendanceRecord;
  session?: ClassSession;
}

/**
 * Broadcasts an event to all open tabs/windows
 */
export function broadcastSyncEvent(msg: SyncMessage): void {
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage(msg);
      channel.close();
    }
  } catch (err) {
    console.warn('BroadcastChannel error:', err);
  }
}

/**
 * Listens for cross-tab sync messages
 */
export function listenForSyncEvents(callback: (msg: SyncMessage) => void): () => void {
  try {
    const channel = getBroadcastChannel();
    if (!channel) return () => {};

    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type) {
        callback(e.data);
      }
    };
    channel.addEventListener('message', handler);
    return () => {
      channel.removeEventListener('message', handler);
      channel.close();
    };
  } catch {
    return () => {};
  }
}

/**
 * Fetch latest shared database from full-stack server
 */
export async function fetchServerData(): Promise<{
  teachers: TeacherProfile[];
  currentTeacherId: string;
  classes: SchoolClass[];
  students: Student[];
  sessions: ClassSession[];
} | null> {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Server fetch error (working offline):', err);
    return null;
  }
}

/**
 * Fetch latest sessions from server
 */
export async function fetchServerSessions(): Promise<ClassSession[] | null> {
  try {
    const res = await fetch('/api/sessions', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Server sessions fetch error:', err);
    return null;
  }
}

/**
 * Syncs full teacher state to the server with offline queue fallback
 */
export async function syncStateToServer(data: {
  teachers?: TeacherProfile[];
  currentTeacherId?: string;
  classes?: SchoolClass[];
  students?: Student[];
  sessions?: ClassSession[];
}): Promise<boolean> {
  const OFFLINE_QUEUE_KEY = 'zoom_attend_offline_queue_v1';
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      // Clear offline queue upon successful sync so stale states are never replayed
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
      }
      return true;
    }
    return false;
  } catch (err) {
    console.warn('State sync to server failed (storing in offline queue):', err);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const rawQueue = localStorage.getItem(OFFLINE_QUEUE_KEY);
        const queue = rawQueue ? JSON.parse(rawQueue) : [];
        queue.push(data);
        // Keep max last 10 items
        if (queue.length > 10) queue.shift();
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      } catch {
        // storage quota exceeded or private mode
      }
    }
    return false;
  }
}

/**
 * Records student attendance to the server AND broadcasts across local tabs
 */
export async function recordAttendanceViaServer(
  sessionId: string,
  studentName: string,
  matchedStudent?: Student,
  confidenceScore = 1.0,
  sessionDetails?: Partial<ClassSession>
): Promise<{ success: boolean; record?: AttendanceRecord; session?: ClassSession; isReentry?: boolean }> {
  try {
    const payload = {
      studentName: studentName.trim(),
      matchedStudent,
      confidenceScore,
      className: sessionDetails?.className,
      sessionTitle: sessionDetails?.sessionTitle,
      zoomUrl: sessionDetails?.zoomUrl,
      targetTrack: sessionDetails?.targetTrack,
      teacherId: sessionDetails?.teacherId,
    };

    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.record) {
        // Broadcast across all open browser windows immediately
        broadcastSyncEvent({
          type: 'ATTENDANCE_RECORDED',
          sessionId,
          record: data.record,
          session: data.session,
        });
      }
      return data;
    }
  } catch (err) {
    console.warn('Failed to record attendance to server, fallback to broadcast:', err);
  }

  // Fallback if server request fails: generate local record and broadcast
  const localRecord: AttendanceRecord = {
    id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sessionId,
    studentId: matchedStudent?.id,
    studentName: studentName.trim(),
    matchedRosterName: matchedStudent?.name,
    track: matchedStudent?.track,
    timestamp: new Date().toISOString(),
    status: matchedStudent ? 'present' : 'guest',
    confidenceScore,
  };

  broadcastSyncEvent({
    type: 'ATTENDANCE_RECORDED',
    sessionId,
    record: localRecord,
  });

  return { success: true, record: localRecord };
}

/**
 * Deletes a single class on the server
 */
export async function deleteClassOnServer(classId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/classes/${encodeURIComponent(classId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('Delete class failed on server:', err);
    return false;
  }
}

/**
 * Sends batch delete classes request to server
 */
export async function batchDeleteClassesOnServer(classIds: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/classes/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classIds }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Batch delete classes failed on server:', err);
    return false;
  }
}

/**
 * Deletes a single student on the server
 */
export async function deleteStudentOnServer(studentId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('Delete student failed on server:', err);
    return false;
  }
}

/**
 * Batch delete students on the server
 */
export async function batchDeleteStudentsOnServer(studentIds: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/students/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Batch delete students failed on server:', err);
    return false;
  }
}

/**
 * Batch update students on the server (e.g. transfer track or class)
 */
export async function batchUpdateStudentsOnServer(
  studentIds: string[],
  updates: { track?: 'english' | 'arabic'; classId?: string }
): Promise<boolean> {
  try {
    const res = await fetch('/api/students/batch-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds, ...updates }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Batch update students failed on server:', err);
    return false;
  }
}

/**
 * Deletes a single session on the server
 */
export async function deleteSessionOnServer(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('Delete session failed on server:', err);
    return false;
  }
}

/**
 * Sends batch delete request to server
 */
export async function batchDeleteSessionsOnServer(sessionIds: string[], teacherId?: string): Promise<boolean> {
  try {
    const res = await fetch('/api/sessions/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds, teacherId }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Batch delete failed on server:', err);
    return false;
  }
}

/**
 * Triggers manual attendance reset on server
 */
export async function resetAttendanceOnServer(teacherId?: string): Promise<boolean> {
  try {
    const res = await fetch('/api/attendance/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Attendance reset failed on server:', err);
    return false;
  }
}

/**
 * Saves or updates a session explicitly on the server
 */
export async function createOrUpdateSessionOnServer(session: ClassSession): Promise<boolean> {
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    return res.ok;
  } catch (err) {
    console.warn('Save session on server failed:', err);
    return false;
  }
}

/**
 * Listens for real-time Server-Sent Events (SSE) from server across all clients
 */
export function listenForServerEvents(callback: (event: any) => void): () => void {
  if (typeof window === 'undefined' || !('EventSource' in window)) {
    return () => {};
  }

  let eventSource: EventSource | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let isClosed = false;

  function connect() {
    if (isClosed) return;
    try {
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (e) => {
        try {
          if (!e.data || e.data.startsWith(':')) return; // keep-alive
          const parsed = JSON.parse(e.data);
          if (parsed) {
            callback(parsed);
          }
        } catch (err) {
          console.warn('Error parsing SSE event:', err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isClosed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    } catch (err) {
      console.warn('EventSource initialization error:', err);
    }
  }

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function hasPendingOfflineChanges(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const raw = localStorage.getItem('zoom_attend_offline_queue_v1');
    if (!raw) return false;
    const q = JSON.parse(raw);
    return Array.isArray(q) && q.length > 0;
  } catch {
    return false;
  }
}

/**
 * Request server to merge duplicate classes and return updated state
 */
export async function mergeDuplicateClassesOnServer(): Promise<{
  success: boolean;
  mergedCount: number;
  classes?: SchoolClass[];
  students?: Student[];
  sessions?: ClassSession[];
}> {
  try {
    const res = await fetch('/api/classes/merge-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to merge duplicate classes on server:', err);
  }
  return { success: false, mergedCount: 0 };
}

/**
 * Force bidirectional sync: clears stale offline queue, sends current state, and retrieves fresh server snapshot
 */
export async function forceSyncBidirectional(currentState: {
  teachers?: TeacherProfile[];
  currentTeacherId?: string;
  classes?: SchoolClass[];
  students?: Student[];
  sessions?: ClassSession[];
}): Promise<{
  success: boolean;
  data?: {
    teachers: TeacherProfile[];
    currentTeacherId: string;
    classes: SchoolClass[];
    students: Student[];
    sessions: ClassSession[];
  };
}> {
  const OFFLINE_QUEUE_KEY = 'zoom_attend_offline_queue_v1';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
    }
    // 1. Post latest state
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentState),
    });
    // 2. Fetch authoritative snapshot
    const serverData = await fetchServerData();
    if (serverData) {
      return { success: true, data: serverData };
    }
  } catch (err) {
    console.warn('Force bidirectional sync failed:', err);
  }
  return { success: false };
}

