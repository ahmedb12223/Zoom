export type LanguageTrack = 'all' | 'english' | 'arabic';

export interface Student {
  id: string;
  name: string; // e.g. "عمر طارق فاروق" or "Adam Hesham"
  classId: string;
  track: 'english' | 'arabic'; // English (Languages) or Arabic
  studentCode?: string;
  parentPhone?: string;
}

export interface SchoolClass {
  id: string;
  name: string; // e.g. "GR4 - A", "GR4 - B", "7A"
  gradeLevel: string; // e.g. "Grade 4"
  zoomUrl?: string; // Zoom meeting link linked to this class
  description?: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId?: string; // matched student id, or undefined if guest
  studentName: string; // entered name
  matchedRosterName?: string; // official matched name in roster
  track?: 'english' | 'arabic';
  timestamp: string; // ISO string (first join)
  lastJoinedAt?: string; // ISO string (latest re-entry join)
  joinCount?: number; // number of times re-entered
  deviceFingerprint?: string;
  status: 'present' | 'late' | 'guest';
  confidenceScore: number; // 0 to 1
}

export interface ClassSession {
  id: string;
  teacherId: string;
  classId: string;
  className: string;
  sessionTitle: string;
  zoomUrl: string;
  targetTrack: LanguageTrack; // 'all' | 'english' | 'arabic'
  createdAt: string;
  scheduledTime?: string;
  isActive: boolean;
  attendance: AttendanceRecord[];
}

export interface TeacherProfile {
  id: string;
  name: string; // e.g. "أ. أحمد مصطفى"
  subject: string; // e.g. "Science & Biology / علوم ولغات"
  schoolName: string; // e.g. "مدرسة الأمل الرسمية المتميزة للغات"
  email: string;
  defaultZoomLink?: string;
  assignedClassIds: string[]; // Classes this teacher teaches
  avatarUrl?: string;
}
