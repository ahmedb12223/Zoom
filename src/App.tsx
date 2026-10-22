/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  School,
  Users,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  GraduationCap
} from 'lucide-react';
import { SimpleNavbar } from './components/SimpleNavbar';
import { SessionHubHome } from './components/SessionHubHome';
import { SessionDetailView } from './components/SessionDetailView';
import { ClassRosterTab } from './components/ClassRosterTab';
import { SimpleRosterModal } from './components/SimpleRosterModal';
import { StudentGateway } from './components/StudentGateway';
import { ConfirmModal } from './components/ConfirmModal';
import { MobileFloatingNav } from './components/MobileFloatingNav';
import { TeacherAuthModal } from './components/TeacherAuthModal';
import { MasterSyncModal } from './components/MasterSyncModal';
import { normalizeText } from './utils/arabicFuzzy';
import { mergeDuplicateClasses } from './utils/excelParser';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { storage } from './utils/storage';
import { ClassSession, SchoolClass, Student, TeacherProfile, LanguageTrack, AttendanceRecord } from './types/index.ts';
import {
  parseAttendanceFromUrl,
  clearAttendanceUrl,
  buildStudentAttendanceLink,
  ParsedAttendanceInfo,
} from './utils/urlHelper';
import {
  fetchServerData,
  fetchServerSessions,
  syncStateToServer,
  listenForSyncEvents,
  listenForServerEvents,
  recordAttendanceViaServer,
  deleteSessionOnServer,
  batchDeleteSessionsOnServer,
  resetAttendanceOnServer,
  createOrUpdateSessionOnServer,
  deleteClassOnServer,
  deleteStudentOnServer,
  batchDeleteStudentsOnServer,
  batchUpdateStudentsOnServer,
  mergeDuplicateClassesOnServer,
  forceSyncBidirectional,
} from './utils/apiSync';

export default function App() {
  const isReceivingRemoteSyncRef = useRef(false);

  // Persistent data
  const [teachers, setTeachers] = useState<TeacherProfile[]>(() => storage.getTeachers());
  const [currentTeacherId, setCurrentTeacherId] = useState<string>(() => storage.getCurrentTeacherId());
  const [classes, setClasses] = useState<SchoolClass[]>(() => storage.getClasses());
  const [students, setStudents] = useState<Student[]>(() => storage.getStudents());
  const [sessions, setSessions] = useState<ClassSession[]>(() => storage.getSessions());

  // Dashboard Tabs: 'sessions' | 'classes'
  const [activeTab, setActiveTab] = useState<'sessions' | 'classes'>('sessions');

  // Navigation State: null = Hub view, string = Session Detail View
  const [selectedSessionIdForDetail, setSelectedSessionIdForDetail] = useState<string | null>(null);

  // Teacher Authentication Lock state (protects dashboard from unauthorized students)
  const [isTeacherUnlocked, setIsTeacherUnlocked] = useState<boolean>(() => storage.isTeacherAuthenticated());

  // URL Attendance routing (supports query parameters ?attend=... as well as #attend/...)
  const [urlAttendance, setUrlAttendance] = useState<ParsedAttendanceInfo>(() => parseAttendanceFromUrl());
  const [attendSessionId, setAttendSessionId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      // If opened at base URL without ?attend= or ?session=, default directly to Teacher Dashboard
      if (!searchParams.has('attend') && !searchParams.has('session')) {
        if (window.location.hash.includes('attend')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        return null;
      }
    }
    return urlAttendance.sessionId;
  });

  // Listen to both hashchange and popstate events
  useEffect(() => {
    const handleUrlChange = () => {
      const parsed = parseAttendanceFromUrl();
      setUrlAttendance(parsed);
      setAttendSessionId(parsed.sessionId);
    };
    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  // Modals state
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showMasterSyncModal, setShowMasterSyncModal] = useState(false);

  // Sync state to local storage
  useEffect(() => {
    storage.saveTeachers(teachers);
  }, [teachers]);

  useEffect(() => {
    storage.setCurrentTeacherId(currentTeacherId);
  }, [currentTeacherId]);

  useEffect(() => {
    storage.saveClasses(classes);
  }, [classes]);

  useEffect(() => {
    storage.saveStudents(students);
  }, [students]);

  useEffect(() => {
    storage.saveSessions(sessions);
  }, [sessions]);

  // Auto-resync when connection is restored
  useEffect(() => {
    const handleOnline = () => {
      forceSyncBidirectional({ teachers, currentTeacherId, classes, students, sessions }).then((res) => {
        if (res.success && res.data) {
          if (Array.isArray(res.data.classes)) {
            setClasses(res.data.classes);
            storage.saveClasses(res.data.classes);
          }
          if (Array.isArray(res.data.students)) {
            setStudents(res.data.students);
            storage.saveStudents(res.data.students);
          }
          if (Array.isArray(res.data.sessions)) {
            setSessions(res.data.sessions);
            storage.saveSessions(res.data.sessions);
          }
        }
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [teachers, currentTeacherId, classes, students, sessions]);

  // 1. Initial Load from Full-Stack Server (Server is authoritative source of truth)
  useEffect(() => {
    fetchServerData().then((data) => {
      if (data) {
        if (Array.isArray(data.sessions)) {
          setSessions(data.sessions);
          storage.saveSessions(data.sessions);
        }
        if (Array.isArray(data.classes)) {
          setClasses(data.classes);
          storage.saveClasses(data.classes);
        }
        if (Array.isArray(data.students)) {
          setStudents(data.students);
          storage.saveStudents(data.students);
        }
        if (Array.isArray(data.teachers) && data.teachers.length > 0) {
          setTeachers(data.teachers);
          storage.saveTeachers(data.teachers);
        }
      }
    });
  }, []);

  // 2. Real-time Cross-Tab BroadcastChannel Listener (Zero-latency instant sync)
  useEffect(() => {
    const unsubscribe = listenForSyncEvents((msg) => {
      if (msg.type === 'ATTENDANCE_RECORDED' && msg.sessionId && msg.record) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== msg.sessionId) return s;
            const existingIdx = s.attendance.findIndex(
              (a) =>
                a.id === msg.record?.id ||
                (msg.record?.studentId && a.studentId === msg.record.studentId) ||
                normalizeText(a.studentName || '') === normalizeText(msg.record?.studentName || '') ||
                (a.matchedRosterName && msg.record?.matchedRosterName && normalizeText(a.matchedRosterName) === normalizeText(msg.record.matchedRosterName))
            );
            if (existingIdx >= 0) {
              const updatedList = [...s.attendance];
              updatedList[existingIdx] = msg.record!;
              // Move to top
              const rec = updatedList.splice(existingIdx, 1)[0];
              updatedList.unshift(rec);
              return { ...s, attendance: updatedList };
            }
            return {
              ...s,
              attendance: [msg.record!, ...s.attendance],
            };
          })
        );
      }
    });
    return () => unsubscribe();
  }, []);

  // 3. Real-time Server-Sent Events (SSE) Live Stream Listener across all browsers & devices
  useEffect(() => {
    const unsubscribe = listenForServerEvents((msg) => {
      if (!msg || !msg.type) return;

      if (msg.type === 'ATTENDANCE_RECORDED' && msg.sessionId && msg.record) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== msg.sessionId) return s;
            const existingIdx = s.attendance.findIndex(
              (a) =>
                a.id === msg.record?.id ||
                (msg.record?.studentId && a.studentId === msg.record.studentId) ||
                normalizeText(a.studentName || '') === normalizeText(msg.record?.studentName || '') ||
                (a.matchedRosterName && msg.record?.matchedRosterName && normalizeText(a.matchedRosterName) === normalizeText(msg.record.matchedRosterName))
            );
            if (existingIdx >= 0) {
              const updatedList = [...s.attendance];
              updatedList[existingIdx] = msg.record!;
              const rec = updatedList.splice(existingIdx, 1)[0];
              updatedList.unshift(rec);
              return { ...s, attendance: updatedList };
            }
            return {
              ...s,
              attendance: [msg.record!, ...s.attendance],
            };
          })
        );
      } else if (msg.type === 'SESSION_CREATED_OR_UPDATED' && msg.session) {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === msg.session.id);
          if (idx >= 0) {
            return prev.map((s, i) => (i === idx ? { ...s, ...msg.session } : s));
          }
          return [msg.session, ...prev];
        });
      } else if (msg.type === 'SESSION_DELETED' && msg.sessionId) {
        setSessions((prev) => prev.filter((s) => s.id !== msg.sessionId));
      } else if (msg.type === 'CLASS_DELETED' && msg.classId) {
        setClasses((prev) => prev.filter((c) => c.id !== msg.classId));
        setStudents((prev) => prev.filter((s) => s.classId !== msg.classId));
        setSessions((prev) => prev.filter((s) => s.classId !== msg.classId));
      } else if (msg.type === 'CLASSES_BATCH_DELETED' && Array.isArray(msg.classIds)) {
        const idSet = new Set(msg.classIds);
        setClasses((prev) => prev.filter((c) => !idSet.has(c.id)));
        setStudents((prev) => prev.filter((s) => !idSet.has(s.classId)));
        setSessions((prev) => prev.filter((s) => !idSet.has(s.classId)));
      } else if (msg.type === 'STUDENT_DELETED' && msg.studentId) {
        setStudents((prev) => prev.filter((s) => s.id !== msg.studentId));
      } else if (msg.type === 'STUDENTS_BATCH_DELETED' && Array.isArray(msg.studentIds)) {
        const idSet = new Set(msg.studentIds);
        setStudents((prev) => prev.filter((s) => !idSet.has(s.id)));
      } else if (msg.type === 'STUDENTS_BATCH_UPDATED' && Array.isArray(msg.studentIds)) {
        const idSet = new Set(msg.studentIds);
        setStudents((prev) =>
          prev.map((s) => {
            if (idSet.has(s.id)) {
              return {
                ...s,
                track: msg.track !== undefined ? msg.track : s.track,
                classId: msg.classId !== undefined ? msg.classId : s.classId,
              };
            }
            return s;
          })
        );
      } else if (msg.type === 'CLASSES_MERGED') {
        isReceivingRemoteSyncRef.current = true;
        if (Array.isArray(msg.classes)) {
          setClasses(msg.classes);
          storage.saveClasses(msg.classes);
        }
        if (Array.isArray(msg.students)) {
          setStudents(msg.students);
          storage.saveStudents(msg.students);
        }
        if (Array.isArray(msg.sessions)) {
          setSessions(msg.sessions);
          storage.saveSessions(msg.sessions);
        }
      } else if ((msg.type === 'STATE_MUTATED' || msg.type === 'STATE_RESET') && msg.db) {
        isReceivingRemoteSyncRef.current = true;
        if (Array.isArray(msg.db.classes)) {
          setClasses(msg.db.classes);
          storage.saveClasses(msg.db.classes);
        }
        if (Array.isArray(msg.db.students)) {
          setStudents(msg.db.students);
          storage.saveStudents(msg.db.students);
        }
        if (Array.isArray(msg.db.teachers) && msg.db.teachers.length > 0) {
          setTeachers(msg.db.teachers);
          storage.saveTeachers(msg.db.teachers);
        }

        if (Array.isArray(msg.db.sessions)) {
          setSessions((prev) => {
            // If mutation originated from a different teacher, merge without wiping current teacher's sessions
            if (msg.originTeacherId && msg.originTeacherId !== currentTeacherId) {
              const remoteMap = new Map(msg.db.sessions.map((s: ClassSession) => [s.id, s]));
              const updated = prev.map((local) => {
                const remoteS = remoteMap.get(local.id);
                return remoteS ? { ...local, ...remoteS } : local;
              });
              msg.db.sessions.forEach((remoteS: ClassSession) => {
                if (!updated.some((s) => s.id === remoteS.id)) {
                  updated.unshift(remoteS);
                }
              });
              storage.saveSessions(updated);
              return updated;
            }
            storage.saveSessions(msg.db.sessions);
            return msg.db.sessions;
          });
        }
      }
    });

    return () => unsubscribe();
  }, [currentTeacherId]);

  // 3. (Polling Disabled) Real-time updates now rely exclusively on SSE above.
  // This prevents deleted sessions from reappearing due to polling hardcoded server defaults.
  useEffect(() => {
    // Background polling removed per user request for pure event-driven sync.
  }, []);

  // 4. Sync state changes to server (bypasses re-sync if change was received via SSE)
  useEffect(() => {
    if (isReceivingRemoteSyncRef.current) {
      isReceivingRemoteSyncRef.current = false;
      return;
    }
    syncStateToServer({ sessions, classes, students, currentTeacherId });
  }, [sessions, classes, students, currentTeacherId]);

  // Current Teacher Profile
  const currentTeacher =
    teachers.find((t) => t.id === currentTeacherId) || teachers[0];

  // Strictly filter sessions for current teacher ONLY to avoid cross-teacher leakage
  const teacherSessions = sessions.filter((s) => s.teacherId === currentTeacher.id);

  // -------------------------------------------------------------
  // Session Handlers (Add, Update, Delete)
  // -------------------------------------------------------------
  const handleCreateSession = (
    classId: string,
    className: string,
    title: string,
    zoomUrl: string,
    targetTrack: LanguageTrack = 'all'
  ) => {
    const newSessionId = `ses_${Date.now()}`;
    const newSession: ClassSession = {
      id: newSessionId,
      teacherId: currentTeacher.id,
      classId,
      className,
      sessionTitle: title,
      zoomUrl,
      targetTrack,
      createdAt: new Date().toISOString(),
      scheduledTime: 'مباشر الآن',
      isActive: true,
      attendance: [],
    };

    setSessions((prev) => {
      const updated = [newSession, ...prev];
      storage.saveSessions(updated);
      createOrUpdateSessionOnServer(newSession);
      syncStateToServer({ sessions: updated, classes, students, currentTeacherId });
      return updated;
    });
  };

  const handleUpdateSession = (updated: {
    id: string;
    sessionTitle: string;
    classId: string;
    className: string;
    zoomUrl: string;
    targetTrack?: LanguageTrack;
  }) => {
    setSessions((prev) => {
      const newSessions = prev.map((s) =>
        s.id === updated.id
          ? {
              ...s,
              sessionTitle: updated.sessionTitle,
              classId: updated.classId,
              className: updated.className,
              zoomUrl: updated.zoomUrl,
              targetTrack: updated.targetTrack ?? s.targetTrack,
            }
          : s
      );
      const targetSession = newSessions.find((s) => s.id === updated.id);
      if (targetSession) {
        createOrUpdateSessionOnServer(targetSession);
      }
      storage.saveSessions(newSessions);
      syncStateToServer({ sessions: newSessions, currentTeacherId });
      return newSessions;
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionOnServer(sessionId);
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      storage.saveSessions(updated);
      syncStateToServer({ sessions: updated, currentTeacherId });
      return updated;
    });
    if (selectedSessionIdForDetail === sessionId) {
      setSelectedSessionIdForDetail(null);
    }
  };

  const handleBatchDeleteSessions = (sessionIds: string[]) => {
    const idSet = new Set(sessionIds);
    batchDeleteSessionsOnServer(sessionIds);
    setSessions((prev) => {
      const updated = prev.filter((s) => !idSet.has(s.id));
      storage.saveSessions(updated);
      syncStateToServer({ sessions: updated, currentTeacherId });
      return updated;
    });
    if (selectedSessionIdForDetail && idSet.has(selectedSessionIdForDetail)) {
      setSelectedSessionIdForDetail(null);
    }
  };

  const handleResetAttendance = (teacherIdOnly?: string) => {
    const targetTeacherId = teacherIdOnly || currentTeacher.id;
    setSessions((prev) => {
      const updated = prev.map((s) => (s.teacherId === targetTeacherId ? { ...s, attendance: [] } : s));
      storage.saveSessions(updated);
      return updated;
    });
    resetAttendanceOnServer(targetTeacherId);
  };

  const handleUpdateSessionZoom = (sessionId: string, newZoomUrl: string) => {
    setSessions((prev) => {
      const updated = prev.map((s) => (s.id === sessionId ? { ...s, zoomUrl: newZoomUrl } : s));
      storage.saveSessions(updated);
      const target = updated.find((s) => s.id === sessionId);
      if (target) createOrUpdateSessionOnServer(target);
      return updated;
    });
  };

  const handleUpdateSessionAttendance = (updatedSession: ClassSession) => {
    setSessions((prev) => {
      const updated = prev.map((s) => (s.id === updatedSession.id ? updatedSession : s));
      storage.saveSessions(updated);
      createOrUpdateSessionOnServer(updatedSession);
      return updated;
    });
  };

  // -------------------------------------------------------------
  // Class & Student Handlers (Add, Update, Delete)
  // -------------------------------------------------------------
  const handleAddClass = (name: string, gradeLevel: string, zoomUrl?: string) => {
    const newClass: SchoolClass = {
      id: `class_${Date.now()}`,
      name,
      gradeLevel,
      zoomUrl,
      createdAt: new Date().toISOString(),
    };
    setClasses((prev) => {
      const updated = [...prev, newClass];
      storage.saveClasses(updated);
      syncStateToServer({ classes: updated, students, sessions, currentTeacherId });
      return updated;
    });
  };

  const handleUpdateClass = (id: string, name: string, gradeLevel: string, zoomUrl?: string) => {
    setClasses((prev) => {
      const updatedClasses = prev.map((c) =>
        c.id === id ? { ...c, name, gradeLevel, zoomUrl: zoomUrl ?? c.zoomUrl } : c
      );
      storage.saveClasses(updatedClasses);
      syncStateToServer({ classes: updatedClasses, students, sessions, currentTeacherId });
      return updatedClasses;
    });
    // Sync class name in sessions
    setSessions((prev) => {
      const updatedSessions = prev.map((s) => (s.classId === id ? { ...s, className: name } : s));
      storage.saveSessions(updatedSessions);
      return updatedSessions;
    });
  };

  const handleDeleteClass = (classId: string) => {
    deleteClassOnServer(classId);
    const updatedClasses = classes.filter((c) => c.id !== classId);
    const updatedStudents = students.filter((s) => s.classId !== classId);
    const updatedSessions = sessions.filter((s) => s.classId !== classId);

    setClasses(updatedClasses);
    setStudents(updatedStudents);
    setSessions(updatedSessions);

    storage.saveClasses(updatedClasses);
    storage.saveStudents(updatedStudents);
    storage.saveSessions(updatedSessions);

    syncStateToServer({
      classes: updatedClasses,
      students: updatedStudents,
      sessions: updatedSessions,
      currentTeacherId,
    });
  };

  const handleSaveFullRoster = (newClasses: SchoolClass[], newStudents: Student[]) => {
    // Run auto merge to prevent duplicate classes (e.g. Grade 8 عربي & Grade 8 لغات)
    const mergeRes = mergeDuplicateClasses(newClasses, newStudents, sessions);
    setClasses(mergeRes.classes);
    setStudents(mergeRes.students);
    setSessions(mergeRes.sessions);

    storage.saveClasses(mergeRes.classes);
    storage.saveStudents(mergeRes.students);
    storage.saveSessions(mergeRes.sessions);

    syncStateToServer({
      classes: mergeRes.classes,
      students: mergeRes.students,
      sessions: mergeRes.sessions,
      currentTeacherId,
    });
  };

  const handleMergeDuplicateClasses = async (): Promise<number> => {
    // 1. Local merge
    const localRes = mergeDuplicateClasses(classes, students, sessions);
    setClasses(localRes.classes);
    setStudents(localRes.students);
    setSessions(localRes.sessions);

    storage.saveClasses(localRes.classes);
    storage.saveStudents(localRes.students);
    storage.saveSessions(localRes.sessions);

    // 2. Server merge
    const serverRes = await mergeDuplicateClassesOnServer();
    if (serverRes.success && serverRes.classes && serverRes.students) {
      setClasses(serverRes.classes);
      setStudents(serverRes.students);
      if (serverRes.sessions) setSessions(serverRes.sessions);

      storage.saveClasses(serverRes.classes);
      storage.saveStudents(serverRes.students);
      if (serverRes.sessions) storage.saveSessions(serverRes.sessions);
      return serverRes.mergedCount || localRes.mergedCount;
    }

    syncStateToServer({
      classes: localRes.classes,
      students: localRes.students,
      sessions: localRes.sessions,
      currentTeacherId,
    });
    return localRes.mergedCount;
  };

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    try {
      const result = await forceSyncBidirectional({
        teachers,
        currentTeacherId,
        classes,
        students,
        sessions,
      });
      if (result.success && result.data) {
        if (Array.isArray(result.data.classes)) {
          setClasses(result.data.classes);
          storage.saveClasses(result.data.classes);
        }
        if (Array.isArray(result.data.students)) {
          setStudents(result.data.students);
          storage.saveStudents(result.data.students);
        }
        if (Array.isArray(result.data.sessions)) {
          setSessions(result.data.sessions);
          storage.saveSessions(result.data.sessions);
        }
        if (Array.isArray(result.data.teachers) && result.data.teachers.length > 0) {
          setTeachers(result.data.teachers);
          storage.saveTeachers(result.data.teachers);
        }
        setSyncStatus('synced');
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        setSyncStatus('error');
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  const handleExecuteMasterSync = async (options: {
    syncClasses: boolean;
    syncStudents: boolean;
    syncSessions: boolean;
    syncTeachers: boolean;
  }) => {
    const payload: any = { currentTeacherId };
    if (options.syncClasses) payload.classes = classes;
    if (options.syncStudents) payload.students = students;
    if (options.syncSessions) payload.sessions = sessions;
    if (options.syncTeachers) payload.teachers = teachers;

    const res = await forceSyncBidirectional(payload);
    if (res.success && res.data) {
      if (options.syncClasses && Array.isArray(res.data.classes)) {
        setClasses(res.data.classes);
        storage.saveClasses(res.data.classes);
      }
      if (options.syncStudents && Array.isArray(res.data.students)) {
        setStudents(res.data.students);
        storage.saveStudents(res.data.students);
      }
      if (options.syncSessions && Array.isArray(res.data.sessions)) {
        setSessions(res.data.sessions);
        storage.saveSessions(res.data.sessions);
      }
      if (options.syncTeachers && Array.isArray(res.data.teachers) && res.data.teachers.length > 0) {
        setTeachers(res.data.teachers);
        storage.saveTeachers(res.data.teachers);
      }
    }

    return {
      success: !!res.success,
      syncedCounts: {
        classes: options.syncClasses ? classes.length : 0,
        students: options.syncStudents ? students.length : 0,
        sessions: options.syncSessions ? sessions.length : 0,
        teachers: options.syncTeachers ? teachers.length : 0,
      },
    };
  };

  const handleAddStudent = (studentData: Omit<Student, 'id'>) => {
    const newStudent: Student = {
      ...studentData,
      id: `st_${Date.now()}`,
    };
    setStudents((prev) => {
      const updated = [...prev, newStudent];
      storage.saveStudents(updated);
      syncStateToServer({ students: updated, classes, sessions, currentTeacherId });
      return updated;
    });
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    setStudents((prev) => {
      const updated = prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s));
      storage.saveStudents(updated);
      syncStateToServer({ students: updated, classes, sessions, currentTeacherId });
      return updated;
    });
  };

  const handleDeleteStudent = (studentId: string) => {
    deleteStudentOnServer(studentId);
    setStudents((prev) => {
      const updated = prev.filter((s) => s.id !== studentId);
      storage.saveStudents(updated);
      syncStateToServer({ students: updated, classes, sessions, currentTeacherId });
      return updated;
    });
  };

  const handleBatchUpdateStudents = (
    studentIds: string[],
    updates: { track?: 'english' | 'arabic'; classId?: string }
  ) => {
    batchUpdateStudentsOnServer(studentIds, updates);
    const idSet = new Set(studentIds);
    setStudents((prev) => {
      const updated = prev.map((s) => {
        if (idSet.has(s.id)) {
          return {
            ...s,
            track: updates.track !== undefined ? updates.track : s.track,
            classId: updates.classId !== undefined ? updates.classId : s.classId,
          };
        }
        return s;
      });
      storage.saveStudents(updated);
      syncStateToServer({ students: updated, classes, sessions, currentTeacherId });
      return updated;
    });
  };

  const handleBatchDeleteStudents = (studentIds: string[]) => {
    batchDeleteStudentsOnServer(studentIds);
    const idSet = new Set(studentIds);
    setStudents((prev) => {
      const updated = prev.filter((s) => !idSet.has(s.id));
      storage.saveStudents(updated);
      syncStateToServer({ students: updated, classes, sessions, currentTeacherId });
      return updated;
    });
  };

  // -------------------------------------------------------------
  // Student Gateway Attendance Recording
  // -------------------------------------------------------------
  const handleRecordAttendanceFromGateway = (
    sessionId: string,
    studentName: string,
    matchedStudent?: Student,
    confidenceScore = 1.0,
    serverRecord?: AttendanceRecord
  ) => {
    const finalRecord: AttendanceRecord = serverRecord || {
      id: `att_${Date.now()}`,
      sessionId,
      studentId: matchedStudent?.id,
      studentName,
      matchedRosterName: matchedStudent?.name,
      track: matchedStudent?.track,
      timestamp: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      joinCount: 1,
      status: matchedStudent ? ('present' as const) : ('guest' as const),
      confidenceScore,
    };

    if (!serverRecord) {
      recordAttendanceViaServer(sessionId, studentName, matchedStudent, confidenceScore, {
        className: urlAttendance.reconstructedSession?.className,
        sessionTitle: urlAttendance.reconstructedSession?.sessionTitle,
        zoomUrl: urlAttendance.reconstructedSession?.zoomUrl,
        targetTrack: urlAttendance.reconstructedSession?.targetTrack,
        teacherId: urlAttendance.reconstructedSession?.teacherId,
      });
    }

    setSessions((prev) => {
      const exists = prev.some((s) => s.id === sessionId);
      if (exists) {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;

          const existingIdx = s.attendance.findIndex(
            (a) =>
              (finalRecord.id && a.id === finalRecord.id) ||
              (finalRecord.studentId && a.studentId === finalRecord.studentId) ||
              (matchedStudent?.id && a.studentId === matchedStudent.id) ||
              normalizeText(a.studentName || '') === normalizeText(studentName) ||
              (a.matchedRosterName && matchedStudent?.name && normalizeText(a.matchedRosterName) === normalizeText(matchedStudent.name))
          );

          if (existingIdx >= 0) {
            const list = [...s.attendance];
            const existing = list[existingIdx];
            const updatedRec: AttendanceRecord = serverRecord || {
              ...existing,
              studentId: finalRecord.studentId || existing.studentId,
              matchedRosterName: finalRecord.matchedRosterName || existing.matchedRosterName,
              track: finalRecord.track || existing.track,
              lastJoinedAt: new Date().toISOString(),
              joinCount: (existing.joinCount || 1) + 1,
            };
            list.splice(existingIdx, 1);
            list.unshift(updatedRec);
            return { ...s, attendance: list };
          }

          return { ...s, attendance: [finalRecord, ...s.attendance] };
        });
        storage.saveSessions(updated);
        return updated;
      }

      if (urlAttendance.reconstructedSession) {
        const updated = [
          {
            ...urlAttendance.reconstructedSession,
            attendance: [finalRecord],
          },
          ...prev,
        ];
        storage.saveSessions(updated);
        return updated;
      }
      return prev;
    });
  };

  // Switch to Student Gateway view with URL sync
  const handleOpenStudentGateway = (sessionId: string) => {
    let session = sessions.find((s) => s.id === sessionId);
    if (!session && sessionId.startsWith('class_')) {
      const clsId = sessionId.replace('class_', '');
      session = sessions.find((s) => s.classId === clsId);
    }
    if (!session) return;

    const sessionTeacher = teachers.find((t) => t.id === session.teacherId) || currentTeacher;
    const link = buildStudentAttendanceLink(session, sessionTeacher);

    try {
      window.history.pushState(null, '', link);
    } catch {
      window.location.hash = `attend/${sessionId}`;
    }

    setAttendSessionId(sessionId);
    setUrlAttendance({
      isAttendanceMode: true,
      sessionId,
      reconstructedSession: session,
      reconstructedTeacher: sessionTeacher,
    });
  };

  const handleExitStudentGateway = () => {
    clearAttendanceUrl();
    setAttendSessionId(null);
    setUrlAttendance({
      isAttendanceMode: false,
      sessionId: null,
      reconstructedSession: null,
      reconstructedTeacher: null,
    });
    setIsTeacherUnlocked(storage.isTeacherAuthenticated());
  };

  // Quick Action: Add Session from floating button or header
  const handleQuickAddClick = () => {
    setSelectedSessionIdForDetail(null);
    setActiveTab('sessions');
    setTimeout(() => {
      const el = document.getElementById('quick-add-session-card');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Auto-expand if collapsed
        const clickable = el.querySelector('[role="button"]') as HTMLElement | null;
        if (clickable && !el.querySelector('form')) {
          clickable.click();
        }
        const input = el.querySelector('input');
        input?.focus();
      }
    }, 120);
  };

  // Reset demo data
  const handleResetData = () => {
    storage.resetToDefault();
    setTeachers(storage.getTeachers());
    setCurrentTeacherId(storage.getCurrentTeacherId());
    setClasses(storage.getClasses());
    setStudents(storage.getStudents());
    setSessions(storage.getSessions());
    setSelectedSessionIdForDetail(null);
    setActiveTab('sessions');
    setShowResetConfirmModal(false);
  };

  // -----------------------------------------------------------------
  // Student Gateway Screen (When opened via public link or preview)
  // -----------------------------------------------------------------
  if (attendSessionId || urlAttendance.isAttendanceMode) {
    const activeId = attendSessionId || urlAttendance.sessionId;
    let targetSession = sessions.find((s) => s.id === activeId);
    if (!targetSession && activeId?.startsWith('class_')) {
      const clsId = activeId.replace('class_', '');
      targetSession = sessions.find((s) => s.classId === clsId);
    }
    // Reconstruct directly from URL parameters if not in local storage (cross-device/tab support)
    if (!targetSession && urlAttendance.reconstructedSession) {
      targetSession = urlAttendance.reconstructedSession;
    }
    if (!targetSession) {
      targetSession = sessions[0];
    }

    const targetTeacher =
      teachers.find((t) => t.id === targetSession?.teacherId) ||
      urlAttendance.reconstructedTeacher ||
      currentTeacher;

    if (!targetSession) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 dir-rtl text-center">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-2">رابط الحصة غير متاح</h2>
            <p className="text-xs text-slate-500 mb-4">
              تأكد من صحة الرابط المرسل من المعلم المشرف.
            </p>
            <button
              onClick={handleExitStudentGateway}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              العودة للرئيسية
            </button>
          </div>
        </div>
      );
    }

    return (
      <StudentGateway
        session={targetSession}
        allStudents={students}
        teacher={targetTeacher}
        onRecordAttendance={handleRecordAttendanceFromGateway}
        onBackToDashboard={handleExitStudentGateway}
      />
    );
  }

  // -----------------------------------------------------------------
  // Teacher Access Guard (Requires PIN to enter Dashboard)
  // -----------------------------------------------------------------
  if (!isTeacherUnlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-850 to-slate-950 flex items-center justify-center p-4 dir-rtl text-center font-sans">
        <TeacherAuthModal
          isOpen={true}
          onSuccess={() => setIsTeacherUnlocked(true)}
          onStudentRedirect={
            sessions.length > 0
              ? () => setAttendSessionId(sessions[0].id)
              : undefined
          }
          title="لوحة تحكم المعلم المشرف"
          description="هذه المنطقة مخصصة للمعلمين المشرفين فقط ومحمية برمز مرور سري لمنع دخول الطلاب."
        />
      </div>
    );
  }

  // Active session for detail view
  const currentDetailSession = sessions.find((s) => s.id === selectedSessionIdForDetail);

  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col dir-rtl text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 font-sans">
      {/* Navbar with Teacher Dropdown and Tab Navigation */}
      <SimpleNavbar
        currentTeacher={currentTeacher}
        allTeachers={teachers}
        onSwitchTeacher={(id) => setCurrentTeacherId(id)}
        onOpenRosterModal={() => setShowRosterModal(true)}
        onResetData={() => setShowResetConfirmModal(true)}
        onOpenPasswordModal={() => setShowPasswordModal(true)}
        onLockDashboard={() => {
          storage.setTeacherAuthenticated(false);
          setIsTeacherUnlocked(false);
        }}
        onGoHome={() => {
          setSelectedSessionIdForDetail(null);
          setActiveTab('sessions');
        }}
        currentClassName={currentDetailSession?.className}
        activeMainTab={activeTab}
        onTabChange={(tab) => {
          setSelectedSessionIdForDetail(null);
          setActiveTab(tab);
        }}
        onManualSync={handleManualSync}
        syncStatus={syncStatus}
        onOpenMasterSyncModal={() => setShowMasterSyncModal(true)}
      />

      {/* Main Viewport (Streamlined padding to reduce empty space) */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-2.5 sm:p-4 lg:p-5 pb-28 sm:pb-24">
        {selectedSessionIdForDetail && currentDetailSession ? (
          /* ----------------------------------------------------------- */
          /* View 1: Detailed Session Attendance View                    */
          /* ----------------------------------------------------------- */
          <div className="space-y-4">
            {/* Quick Breadcrumb back to Card Hub */}
            <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedSessionIdForDetail(null)}
                className="flex items-center gap-2 text-xs font-black text-indigo-700 hover:text-indigo-900 transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>العودة للوحة الحصص</span>
              </button>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                حصة فصل {currentDetailSession.className} · {currentTeacher.subject}
              </span>
            </div>

            <SessionDetailView
              session={currentDetailSession}
              currentTeacher={currentTeacher}
              students={students}
              classes={classes}
              onBackToSessions={() => setSelectedSessionIdForDetail(null)}
              onUpdateSessionAttendance={handleUpdateSessionAttendance}
              onUpdateSessionZoom={handleUpdateSessionZoom}
              onUpdateSession={handleUpdateSession}
              onDeleteSession={handleDeleteSession}
              onOpenStudentGateway={handleOpenStudentGateway}
            />
          </div>
        ) : (
          /* ----------------------------------------------------------- */
          /* Main Hub: Card-based Tab Switcher + Selected View           */
          /* ----------------------------------------------------------- */
          <div className="space-y-3 sm:space-y-3.5">
            {/* Sleek 1-Row Compact Navigation Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab('sessions')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'sessions'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>الحصص وزوم المباشر</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                    activeTab === 'sessions' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {teacherSessions.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('classes')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'classes'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <School className="w-4 h-4" />
                <span>إدارة الفصول والطلاب</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                    activeTab === 'classes' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {classes.length}
                </span>
              </button>
            </div>

            {/* Active Tab View */}
            {activeTab === 'classes' ? (
              <ClassRosterTab
                currentTeacher={currentTeacher}
                classes={classes}
                students={students}
                onAddClass={handleAddClass}
                onUpdateClass={handleUpdateClass}
                onDeleteClass={handleDeleteClass}
                onSaveFullRoster={handleSaveFullRoster}
                onAddStudent={handleAddStudent}
                onUpdateStudent={handleUpdateStudent}
                onDeleteStudent={handleDeleteStudent}
                onBatchUpdateStudents={handleBatchUpdateStudents}
                onBatchDeleteStudents={handleBatchDeleteStudents}
                onMergeDuplicateClasses={handleMergeDuplicateClasses}
              />
            ) : (
              <SessionHubHome
                currentTeacher={currentTeacher}
                allTeachers={teachers}
                classes={classes}
                students={students}
                sessions={sessions}
                onEnterSession={(sessionId) => setSelectedSessionIdForDetail(sessionId)}
                onCreateSession={handleCreateSession}
                onUpdateSession={handleUpdateSession}
                onDeleteSession={handleDeleteSession}
                onBatchDeleteSessions={handleBatchDeleteSessions}
                onResetAttendance={handleResetAttendance}
                onOpenStudentGateway={handleOpenStudentGateway}
                onSwitchToClassesTab={() => setActiveTab('classes')}
                onOpenPasswordModal={() => setShowPasswordModal(true)}
              />
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Navigation Dock for Mobile (Always accessible) */}
      <MobileFloatingNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setSelectedSessionIdForDetail(null);
          setActiveTab(tab);
        }}
        onQuickAddClick={handleQuickAddClick}
        currentTeacher={currentTeacher}
        allTeachers={teachers}
        onSwitchTeacher={(id) => setCurrentTeacherId(id)}
        sessionsCount={teacherSessions.length}
        classesCount={classes.length}
        latestSession={teacherSessions[0] || null}
      />

      {/* Text Roster Quick Modal */}
      <SimpleRosterModal
        isOpen={showRosterModal}
        onClose={() => setShowRosterModal(false)}
        classes={classes}
        students={students}
        onSaveRoster={handleSaveFullRoster}
      />

      {/* Change Password Modal (Admin: Ahmed Badawi) */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        currentTeacher={currentTeacher}
      />

      {/* Master Synchronization Console Modal (Admin: Ahmed Badawi) */}
      <MasterSyncModal
        isOpen={showMasterSyncModal}
        onClose={() => setShowMasterSyncModal(false)}
        classes={classes}
        students={students}
        sessions={sessions}
        teachers={teachers}
        currentTeacherId={currentTeacherId}
        onExecuteSync={handleExecuteMasterSync}
      />

      {/* Reset Confirmation Modal */}
      {showResetConfirmModal && (
        <ConfirmModal
          isOpen={showResetConfirmModal}
          title="استعادة البيانات الافتراضية"
          message="هل أنت متأكد من رغبتك في إعادة ضبط النظام إلى بياناته التجريبية الافتراضية؟ سيتم مسح أي تعديلات قمت بها."
          confirmText="نعم، إعادة الضبط"
          cancelText="تراجع"
          isDestructive={false}
          onConfirm={handleResetData}
          onCancel={() => setShowResetConfirmModal(false)}
        />
      )}
    </div>
  );
}
