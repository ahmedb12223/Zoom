import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  DEFAULT_TEACHERS,
  DEFAULT_CLASSES,
  DEFAULT_STUDENTS,
  DEFAULT_SESSIONS
} from './src/utils/storage.ts';
import { normalizeText, findBestMatch } from './src/utils/arabicFuzzy.ts';
import { mergeDuplicateClasses } from './src/utils/excelParser.ts';
import type { ClassSession, AttendanceRecord, SchoolClass, Student, TeacherProfile } from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable CORS for all origins (supports custom domains and static deployments)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database Persistence Directory & File
const DATA_DIR = path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface AppDatabase {
  teachers: TeacherProfile[];
  currentTeacherId: string;
  classes: SchoolClass[];
  students: Student[];
  sessions: ClassSession[];
  teacherPin?: string;
}

function loadDatabase(): AppDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        return {
          teachers: Array.isArray(parsed.teachers) && parsed.teachers.length > 0 ? parsed.teachers : DEFAULT_TEACHERS,
          currentTeacherId: parsed.currentTeacherId || 'teacher_ahmed_badawi',
          classes: Array.isArray(parsed.classes) ? parsed.classes : DEFAULT_CLASSES,
          students: Array.isArray(parsed.students) ? parsed.students : DEFAULT_STUDENTS,
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
          teacherPin: typeof parsed.teacherPin === 'string' && parsed.teacherPin.trim() ? parsed.teacherPin : '123654',
        };
      }
    }
  } catch (err) {
    console.error('Error loading db.json, fallback to defaults:', err);
  }

  return {
    teachers: DEFAULT_TEACHERS,
    currentTeacherId: 'teacher_ahmed_badawi',
    classes: DEFAULT_CLASSES,
    students: DEFAULT_STUDENTS,
    sessions: [],
    teacherPin: '123654',
  };
}

let db = loadDatabase();

function saveDatabase(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_FILE);
  } catch (err) {
    console.error('Error saving db.json:', err);
  }
}

// Sanitize database on startup: Remove any old hardcoded demo sessions if they exist
if (db.sessions && db.sessions.length > 0) {
  const demoIds = new Set(['ses_gr4a_math', 'ses_gr4b_science', 'ses_gr4a_english', 'ses_gr4b_arabic']);
  const initialCount = db.sessions.length;
  db.sessions = db.sessions.filter(s => !demoIds.has(s.id));
  if (db.sessions.length !== initialCount) {
    console.log(`[Startup] Purged ${initialCount - db.sessions.length} legacy demo sessions.`);
    saveDatabase();
  }
}

// Auto-merge duplicate classes on startup (e.g. Grade 8 and Grade 8 لغات)
if (db.classes && db.classes.length > 0) {
  const mergeInit = mergeDuplicateClasses(db.classes, db.students, db.sessions);
  if (mergeInit.mergedCount > 0) {
    console.log(`[Startup] Auto-merged ${mergeInit.mergedCount} duplicate classes.`);
    db.classes = mergeInit.classes;
    db.students = mergeInit.students;
    db.sessions = mergeInit.sessions;
    saveDatabase();
  }
}
// Saudi Midnight Auto-Reset Helper (12:00 AM KSA / UTC+3)
// -------------------------------------------------------------
function getSaudiDateString(date = new Date()): string {
  const saudiTime = new Date(date.getTime() + (3 * 60 + date.getTimezoneOffset()) * 60000);
  const year = saudiTime.getFullYear();
  const month = String(saudiTime.getMonth() + 1).padStart(2, '0');
  const day = String(saudiTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let lastSaudiResetDate = getSaudiDateString();

function checkAndTriggerSaudiMidnightReset(): void {
  const currentSaudiDate = getSaudiDateString();
  if (currentSaudiDate !== lastSaudiResetDate) {
    console.log(`[Saudi Midnight Reset] Date changed from ${lastSaudiResetDate} to ${currentSaudiDate}. Clearing attendance records...`);
    db.sessions = db.sessions.map((s) => ({ ...s, attendance: [] }));
    lastSaudiResetDate = currentSaudiDate;
    saveDatabase();
  }
}

// Check every 30 seconds for Saudi midnight transition
setInterval(checkAndTriggerSaudiMidnightReset, 30000);

// -------------------------------------------------------------
// Real-Time Server-Sent Events (SSE) Multi-Client Broadcaster
// -------------------------------------------------------------
const sseClients = new Set<Response>();

function broadcastSseEvent(eventPayload: object): void {
  const data = `data: ${JSON.stringify(eventPayload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Ping SSE clients every 15s to keep connection alive
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 15000);

// -------------------------------------------------------------
// REST API & SSE Routes
// -------------------------------------------------------------

// SSE Endpoint for instant live updates across all connected browsers
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  checkAndTriggerSaudiMidnightReset();
  res.json({ status: 'ok', time: new Date().toISOString(), saudiDate: getSaudiDateString() });
});

// Get all shared app data (classes, students, sessions, teachers)
app.get('/api/data', (_req: Request, res: Response) => {
  checkAndTriggerSaudiMidnightReset();
  res.json(db);
});

// Sync full state from teacher dashboard safely with per-teacher scoping
app.post('/api/sync', (req: Request, res: Response) => {
  checkAndTriggerSaudiMidnightReset();
  const { teachers, currentTeacherId, classes, students, sessions } = req.body;
  const syncingTeacherId = currentTeacherId || req.body.teacherId;

  if (Array.isArray(teachers) && teachers.length > 0) {
    const teacherMap = new Map(db.teachers.map((t) => [t.id, t]));
    teachers.forEach((t) => teacherMap.set(t.id, t));
    db.teachers = Array.from(teacherMap.values());
  }

  if (currentTeacherId) {
    db.currentTeacherId = currentTeacherId;
  }

  if (Array.isArray(classes)) {
    // Authoritative sync for classes: preserves deletions made by the user
    db.classes = classes;
  }

  if (Array.isArray(students)) {
    // Authoritative sync for students: preserves deletions made by the user
    db.students = students;
  }

  // Automatic duplicate unification check on every sync
  if (Array.isArray(db.classes) && db.classes.length > 0) {
    const autoMerge = mergeDuplicateClasses(db.classes, db.students, db.sessions);
    if (autoMerge.mergedCount > 0) {
      db.classes = autoMerge.classes;
      db.students = autoMerge.students;
      db.sessions = autoMerge.sessions;
    }
  }

  if (Array.isArray(sessions)) {
    if (syncingTeacherId) {
      const incomingIds = new Set(sessions.map((s: ClassSession) => s.id));
      // Remove sessions for syncingTeacherId that are no longer in incoming list (i.e. deleted)
      db.sessions = db.sessions.filter((s) => {
        if (s.teacherId === syncingTeacherId) {
          return incomingIds.has(s.id);
        }
        return true; // Keep other teachers' sessions
      });
    }

    const sessionMap = new Map(db.sessions.map((s) => [s.id, s]));
    sessions.forEach((incoming) => {
      const existing = sessionMap.get(incoming.id);
      if (existing) {
        const existingAttendance = Array.isArray(existing.attendance) ? existing.attendance : [];
        const existingAttMap = new Map(existingAttendance.map((a) => [a.id || a.studentId || a.studentName, a]));
        incoming.attendance?.forEach((att: AttendanceRecord) => {
          existingAttMap.set(att.id || att.studentId || att.studentName, att);
        });
        sessionMap.set(incoming.id, {
          ...existing,
          ...incoming,
          teacherId: incoming.teacherId || syncingTeacherId || existing.teacherId,
          attendance: Array.from(existingAttMap.values()),
        });
      } else {
        sessionMap.set(incoming.id, {
          ...incoming,
          teacherId: incoming.teacherId || syncingTeacherId,
          attendance: incoming.attendance || [],
        });
      }
    });
    db.sessions = Array.from(sessionMap.values());
  }

  saveDatabase();

  broadcastSseEvent({
    type: 'STATE_MUTATED',
    originTeacherId: syncingTeacherId,
    db,
  });

  res.json({ success: true, count: db.sessions.length, classesCount: db.classes.length });
});

// Get Teacher PIN
app.get('/api/teacher-pin', (_req: Request, res: Response) => {
  res.json({ pin: db.teacherPin || '123654' });
});

// Update Teacher PIN (Protected: Ahmed Badawi only)
app.post('/api/teacher-pin', (req: Request, res: Response) => {
  const { pin, teacherId } = req.body;
  const targetTeacher = db.teachers.find((t) => t.id === teacherId);
  const isAllowed =
    teacherId === 'teacher_ahmed_badawi' ||
    (targetTeacher &&
      (targetTeacher.email === 'ahmedbadawi5090@gmail.com' ||
        targetTeacher.name.includes('بدوي') ||
        targetTeacher.name.includes('badawi')));

  if (!isAllowed) {
    res.status(403).json({
      error: 'صلاحية تعديل كلمة المرور مقتصرة حصرياً على لوحة تحكم مستر أحمد بدوي',
    });
    return;
  }

  if (typeof pin === 'string' && pin.trim().length >= 4) {
    db.teacherPin = pin.trim();
    saveDatabase();
    res.json({ success: true, pin: db.teacherPin });
  } else {
    res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أرقام أو خانات على الأقل' });
  }
});

// Get sessions
app.get('/api/sessions', (_req: Request, res: Response) => {
  checkAndTriggerSaudiMidnightReset();
  res.json(db.sessions);
});

// Get single session with real-time attendance
app.get('/api/sessions/:id', (req: Request, res: Response) => {
  checkAndTriggerSaudiMidnightReset();
  const session = db.sessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// Create or update session
app.post('/api/sessions', (req: Request, res: Response) => {
  checkAndTriggerSaudiMidnightReset();
  const newSession: ClassSession = req.body;
  if (!newSession.id) {
    res.status(400).json({ error: 'Session ID required' });
    return;
  }
  const existingIdx = db.sessions.findIndex((s) => s.id === newSession.id);
  if (existingIdx >= 0) {
    db.sessions[existingIdx] = {
      ...db.sessions[existingIdx],
      ...newSession,
    };
  } else {
    db.sessions.unshift(newSession);
  }
  saveDatabase();

  broadcastSseEvent({
    type: 'SESSION_CREATED_OR_UPDATED',
    originTeacherId: newSession.teacherId,
    session: newSession,
    db,
  });

  res.json({ success: true, session: newSession });
});

// Delete single session
app.delete('/api/sessions/:id', (req: Request, res: Response) => {
  const sessionId = req.params.id;
  const targetSession = db.sessions.find((s) => s.id === sessionId);
  const originTeacherId = targetSession?.teacherId;
  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  saveDatabase();

  broadcastSseEvent({
    type: 'SESSION_DELETED',
    sessionId,
    originTeacherId,
    db,
  });

  res.json({ success: true });
});

// Batch Delete multiple sessions
app.post('/api/sessions/batch-delete', (req: Request, res: Response) => {
  const { sessionIds, teacherId } = req.body;
  if (Array.isArray(sessionIds) && sessionIds.length > 0) {
    const idSet = new Set(sessionIds);
    db.sessions = db.sessions.filter((s) => !idSet.has(s.id));
    saveDatabase();

    broadcastSseEvent({
      type: 'SESSIONS_BATCH_DELETED',
      sessionIds,
      originTeacherId: teacherId,
      db,
    });
  }
  res.json({ success: true, remaining: db.sessions.length });
});

// Reset Attendance Records (Manual instant reset)
app.post('/api/attendance/reset', (req: Request, res: Response) => {
  const { teacherId } = req.body;
  db.sessions = db.sessions.map((s) => {
    if (!teacherId || s.teacherId === teacherId) {
      return { ...s, attendance: [] };
    }
    return s;
  });
  saveDatabase();

  broadcastSseEvent({
    type: 'ATTENDANCE_RESET',
    teacherId,
    db,
  });

  res.json({ success: true, message: 'Attendance reset completed' });
});

// Delete single class
app.delete('/api/classes/:id', (req: Request, res: Response) => {
  const classId = req.params.id;
  db.classes = db.classes.filter((c) => c.id !== classId);
  db.students = db.students.filter((s) => s.classId !== classId);
  db.sessions = db.sessions.filter((s) => s.classId !== classId);
  db.teachers = db.teachers.map((t) => ({
    ...t,
    assignedClassIds: Array.isArray(t.assignedClassIds) ? t.assignedClassIds.filter((cid) => cid !== classId) : [],
  }));
  saveDatabase();

  broadcastSseEvent({
    type: 'CLASS_DELETED',
    classId,
    db,
  });

  res.json({ success: true, classId, remainingClasses: db.classes.length });
});

// Batch Delete multiple classes
app.post('/api/classes/batch-delete', (req: Request, res: Response) => {
  const { classIds } = req.body;
  if (Array.isArray(classIds) && classIds.length > 0) {
    const idSet = new Set(classIds);
    db.classes = db.classes.filter((c) => !idSet.has(c.id));
    db.students = db.students.filter((s) => !idSet.has(s.classId));
    db.sessions = db.sessions.filter((s) => !idSet.has(s.classId));
    db.teachers = db.teachers.map((t) => ({
      ...t,
      assignedClassIds: Array.isArray(t.assignedClassIds) ? t.assignedClassIds.filter((cid) => !idSet.has(cid)) : [],
    }));
    saveDatabase();

    broadcastSseEvent({
      type: 'CLASSES_BATCH_DELETED',
      classIds,
      db,
    });
  }
  res.json({ success: true, remaining: db.classes.length });
});

// Explicit manual merge trigger for duplicate classes
app.post('/api/classes/merge-duplicates', (_req: Request, res: Response) => {
  const result = mergeDuplicateClasses(db.classes, db.students, db.sessions);
  if (result.mergedCount > 0) {
    db.classes = result.classes;
    db.students = result.students;
    db.sessions = result.sessions;
    saveDatabase();

    broadcastSseEvent({
      type: 'CLASSES_MERGED',
      mergedCount: result.mergedCount,
      classes: db.classes,
      students: db.students,
      sessions: db.sessions,
      db,
    });
  }

  res.json({
    success: true,
    mergedCount: result.mergedCount,
    classes: db.classes,
    students: db.students,
    sessions: db.sessions,
  });
});

// Delete single student
app.delete('/api/students/:id', (req: Request, res: Response) => {
  const studentId = req.params.id;
  db.students = db.students.filter((s) => s.id !== studentId);
  saveDatabase();

  broadcastSseEvent({
    type: 'STUDENT_DELETED',
    studentId,
    db,
  });

  res.json({ success: true, studentId, remainingStudents: db.students.length });
});

// Batch Delete students
app.post('/api/students/batch-delete', (req: Request, res: Response) => {
  const { studentIds } = req.body;
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    const idSet = new Set(studentIds);
    db.students = db.students.filter((s) => !idSet.has(s.id));
    saveDatabase();

    broadcastSseEvent({
      type: 'STUDENTS_BATCH_DELETED',
      studentIds,
      db,
    });
  }
  res.json({ success: true, remaining: db.students.length });
});

// Batch Update students (transfer track or class)
app.post('/api/students/batch-update', (req: Request, res: Response) => {
  const { studentIds, track, classId } = req.body;
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    const idSet = new Set(studentIds);
    db.students = db.students.map((st) => {
      if (idSet.has(st.id)) {
        return {
          ...st,
          track: track !== undefined ? track : st.track,
          classId: classId !== undefined ? classId : st.classId,
        };
      }
      return st;
    });
    saveDatabase();

    broadcastSseEvent({
      type: 'STUDENTS_BATCH_UPDATED',
      studentIds,
      track,
      classId,
      db,
    });
  }
  res.json({ success: true, updatedCount: studentIds?.length || 0 });
});

// Real-time Attendance Recording Endpoint (called by Student Gateway from any device/browser)
app.post('/api/sessions/:id/attendance', (req: Request, res: Response) => {
  const sessionId = req.params.id;
  const { studentName, matchedStudent, confidenceScore } = req.body;

  if (!studentName || !studentName.trim()) {
    res.status(400).json({ error: 'Student name is required' });
    return;
  }

  let session = db.sessions.find((s) => s.id === sessionId);

  // If session doesn't exist (e.g. deleted by teacher), refuse check-in to prevent session resurrection
  if (!session) {
    res.status(404).json({ error: 'عذراً، هذه الحصة غير متاحة أو تم إغلاقها وحذفها بواسطة المعلم' });
    return;
  }

  // Server-side fuzzy matching if client didn't supply matchedStudent
  let finalMatched = matchedStudent;
  let finalConfidence = confidenceScore ?? 1.0;

  if (!finalMatched && Array.isArray(db.students) && db.students.length > 0) {
    const classStudents = db.students.filter((s) => s.classId === session?.classId);
    const candidateList = classStudents.length > 0 ? classStudents : db.students;
    const bestMatch = findBestMatch(studentName, candidateList, 0.40);
    if (bestMatch) {
      finalMatched = bestMatch.item;
      finalConfidence = bestMatch.score;
    }
  }

  const record: AttendanceRecord = {
    id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sessionId,
    studentId: finalMatched?.id,
    studentName: studentName.trim(),
    matchedRosterName: finalMatched?.name,
    track: finalMatched?.track,
    timestamp: new Date().toISOString(),
    status: finalMatched ? 'present' : 'guest',
    confidenceScore: finalConfidence,
  };

  // Robust Arabic fuzzy deduplication within same session
  const normInput = normalizeText(studentName);
  const normMatched = finalMatched?.name ? normalizeText(finalMatched.name) : '';

  const existingIndex = session.attendance.findIndex((rec) => {
    if (finalMatched?.id && rec.studentId && rec.studentId === finalMatched.id) return true;
    if (finalMatched?.id && rec.studentId === finalMatched.id) return true;
    if (normMatched && rec.matchedRosterName && normalizeText(rec.matchedRosterName) === normMatched) return true;
    const normRec = normalizeText(rec.studentName);
    const normRoster = rec.matchedRosterName ? normalizeText(rec.matchedRosterName) : '';
    if (normInput === normRec || (normRoster && normInput === normRoster)) return true;
    if (normMatched && (normMatched === normRec || normMatched === normRoster)) return true;
    return false;
  });

  let savedRecord: AttendanceRecord;
  let isReentry = false;

  if (existingIndex >= 0) {
    // Student already checked in: Update joinCount and lastJoinedAt without duplicating
    isReentry = true;
    const existing = session.attendance[existingIndex];
    const currentJoinCount = typeof existing.joinCount === 'number' ? existing.joinCount : 1;
    
    savedRecord = {
      ...existing,
      studentId: finalMatched?.id || existing.studentId,
      matchedRosterName: finalMatched?.name || existing.matchedRosterName,
      track: finalMatched?.track || existing.track,
      lastJoinedAt: new Date().toISOString(),
      joinCount: currentJoinCount + 1,
    };

    // Move updated record to the top of the attendance list so recent re-entry is visible
    session.attendance.splice(existingIndex, 1);
    session.attendance.unshift(savedRecord);
    saveDatabase();

    broadcastSseEvent({
      type: 'ATTENDANCE_RECORDED',
      sessionId,
      record: savedRecord,
      isReentry: true,
      session,
      db,
    });
  } else {
    savedRecord = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      studentId: finalMatched?.id,
      studentName: studentName.trim(),
      matchedRosterName: finalMatched?.name,
      track: finalMatched?.track,
      timestamp: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      joinCount: 1,
      status: finalMatched ? 'present' : 'guest',
      confidenceScore: finalConfidence,
    };

    session.attendance.unshift(savedRecord);
    saveDatabase();

    broadcastSseEvent({
      type: 'ATTENDANCE_RECORDED',
      sessionId,
      record: savedRecord,
      isReentry: false,
      session,
      db,
    });
  }

  res.json({
    success: true,
    alreadyCheckedIn: isReentry,
    record: savedRecord,
    isReentry,
    totalAttendance: session.attendance.length,
    session,
  });
});

// Reset demo data
app.post('/api/reset', (_req: Request, res: Response) => {
  db = {
    teachers: DEFAULT_TEACHERS,
    currentTeacherId: 'teacher_ahmed_badawi',
    classes: DEFAULT_CLASSES,
    students: DEFAULT_STUDENTS,
    sessions: DEFAULT_SESSIONS,
  };
  saveDatabase();

  broadcastSseEvent({
    type: 'STATE_RESET',
    db,
  });

  res.json({ success: true, message: 'Reset completed' });
});

// -------------------------------------------------------------
// Vite Server Integration (SPA Middleware in dev / Static in prod)
// -------------------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (mode: ${isProduction ? 'prod' : 'dev'})`);
  });
}

startServer();
