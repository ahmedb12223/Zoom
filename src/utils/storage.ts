import type { SchoolClass, Student, ClassSession, TeacherProfile } from '../types/index.ts';

const STORAGE_KEYS = {
  TEACHERS: 'zoom_attend_teachers_v2',
  CURRENT_TEACHER_ID: 'zoom_attend_current_teacher_id_v2',
  CLASSES: 'zoom_attend_classes_v2',
  STUDENTS: 'zoom_attend_students_v2',
  SESSIONS: 'zoom_attend_sessions_v2',
  TEACHER_PIN: 'zoom_attend_teacher_pin_v2',
  TEACHER_AUTH_TOKEN: 'zoom_attend_teacher_auth_v1',
};

// Official School Teachers List
export const DEFAULT_TEACHERS: TeacherProfile[] = [
  {
    id: 'teacher_ahmed_badawi',
    name: 'مستر احمد بدوي',
    subject: 'الرياضيات (Math)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'ahmedbadawi5090@gmail.com',
    defaultZoomLink: 'https://zoom.us/j/1112223333?pwd=mathRoom2026',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b', 'class_gr5_a']
  },
  {
    id: 'teacher_mahmoud_morsi',
    name: 'مستر محمود مرسي',
    subject: 'العلوم (Science)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'mahmoud.morsi@school.edu',
    defaultZoomLink: 'https://zoom.us/j/9876543210?pwd=scienceRoom2026',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_hussein_bisher',
    name: 'مستر حسين بشر',
    subject: 'العلوم (Science)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'hussein.bisher@school.edu',
    defaultZoomLink: 'https://zoom.us/j/9876543211?pwd=scienceRoom2026',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_mohamed_matar',
    name: 'مستر محمد مطر',
    subject: 'التربية الإسلامية، القرآن الكريم، الفقه (Islamic / Quran / FG)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'mohamed.matar@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_walid_abouzeid',
    name: 'مسيو وليد ابو زيد',
    subject: 'التربية الإسلامية، القرآن الكريم، الفقه (Islamic / Quran / FG)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'walid.abouzeid@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_raafat',
    name: 'مستر رأفت',
    subject: 'الرياضيات (Math)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'raafat.math@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_omar',
    name: 'مستر عمر',
    subject: 'اللغة الإنجليزية (English)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'omar.english@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_mohamed_hesham',
    name: 'مستر محمد هشام',
    subject: 'اللغة الإنجليزية (English)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'mohamed.hesham@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_amr_mostafa',
    name: 'مستر عمرو مصطفي',
    subject: 'اللغة العربية (Arabic)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'amr.mostafa@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_abdelrazek',
    name: 'مستر عبد الرزاق',
    subject: 'الحاسب الآلي وتكنولوجيا المعلومات (ICT)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'abdelrazek.ict@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_mahmoud_ebada',
    name: 'مستر محمود عباده',
    subject: 'الدراسات الاجتماعية (Social Studies)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'mahmoud.ebada@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  },
  {
    id: 'teacher_abdelhamid',
    name: 'مستر عبد الحميد',
    subject: 'اللغة العربية (Arabic)',
    schoolName: 'مدرسة اللغات الحديثة',
    email: 'abdelhamid.arabic@school.edu',
    defaultZoomLink: '',
    assignedClassIds: ['class_gr4_a', 'class_gr4_b']
  }
];

// Initial default classes matching school format (GR4 - A, GR4 - B, etc.)
export const DEFAULT_CLASSES: SchoolClass[] = [
  {
    id: 'class_gr4_a',
    name: 'GR4 - A',
    gradeLevel: 'Grade 4 (الصف الرابع الابتدائي)',
    zoomUrl: 'https://zoom.us/j/1112223333?pwd=mathRoom2026',
    description: 'فصل GR4 - A',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'class_gr4_b',
    name: 'GR4 - B',
    gradeLevel: 'Grade 4 (الصف الرابع الابتدائي)',
    zoomUrl: 'https://zoom.us/j/2223334444?pwd=mathRoom2026',
    description: 'فصل GR4 - B',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'class_gr5_a',
    name: 'GR5 - A',
    gradeLevel: 'Grade 5 (الصف الخامس الابتدائي)',
    zoomUrl: 'https://zoom.us/j/3334445555?pwd=mathRoom2026',
    description: 'فصل GR5 - A',
    createdAt: new Date().toISOString(),
  }
];

// Initial students matching user's exact sample
export const DEFAULT_STUDENTS: Student[] = [
  // GR4 - A
  { id: 'st_gr4a_1', name: 'احمد عبدالله حليمه', classId: 'class_gr4_a', track: 'english', studentCode: 'GR4-101' },
  { id: 'st_gr4a_2', name: 'احمد حسام الدين عبد المعز عبد', classId: 'class_gr4_a', track: 'english', studentCode: 'GR4-102' },
  { id: 'st_gr4a_3', name: 'اياد احمد محمد علم الدين', classId: 'class_gr4_a', track: 'english', studentCode: 'GR4-103' },
  { id: 'st_gr4a_4', name: 'عمر طارق فاروق', classId: 'class_gr4_a', track: 'english', studentCode: 'GR4-104' },
  { id: 'st_gr4a_5', name: 'مريم كريم حسن', classId: 'class_gr4_a', track: 'arabic', studentCode: 'GR4-105' },
  { id: 'st_gr4a_6', name: 'سيف الدين أسامة', classId: 'class_gr4_a', track: 'arabic', studentCode: 'GR4-106' },

  // GR4 - B
  { id: 'st_gr4b_1', name: 'يوسف محمد صبحي شحاته', classId: 'class_gr4_b', track: 'english', studentCode: 'GR4-201' },
  { id: 'st_gr4b_2', name: 'سيف الدين احمد محمد محمود ابراهيم', classId: 'class_gr4_b', track: 'english', studentCode: 'GR4-202' },
  { id: 'st_gr4b_3', name: 'حمزة شريف الشناوي', classId: 'class_gr4_b', track: 'english', studentCode: 'GR4-203' },
  { id: 'st_gr4b_4', name: 'فاطمة إبراهيم الشناوي', classId: 'class_gr4_b', track: 'arabic', studentCode: 'GR4-204' }
];

// Initial default sessions (Started clean as per user request)
export const DEFAULT_SESSIONS: ClassSession[] = [];

// In-memory fallback if localStorage is not available (Node.js or private mode)
const memoryStore: Record<string, string> = {};

const safeStorage = {
  getItem: (key: string): string | null => {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // fallback
      }
    }
    return memoryStore[key] || null;
  },
  setItem: (key: string, value: string): void => {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // fallback
      }
    }
    memoryStore[key] = value;
  },
};

export const storage = {
  getTeachers: (): TeacherProfile[] => {
    try {
      const data = safeStorage.getItem(STORAGE_KEYS.TEACHERS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    safeStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(DEFAULT_TEACHERS));
    return DEFAULT_TEACHERS;
  },

  saveTeachers: (teachers: TeacherProfile[]) => {
    safeStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachers));
  },

  getCurrentTeacherId: (): string => {
    const id = safeStorage.getItem(STORAGE_KEYS.CURRENT_TEACHER_ID);
    return id || 'teacher_ahmed_badawi';
  },

  setCurrentTeacherId: (id: string) => {
    safeStorage.setItem(STORAGE_KEYS.CURRENT_TEACHER_ID, id);
  },

  getClasses: (): SchoolClass[] => {
    try {
      const data = safeStorage.getItem(STORAGE_KEYS.CLASSES);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    safeStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(DEFAULT_CLASSES));
    return DEFAULT_CLASSES;
  },

  saveClasses: (classes: SchoolClass[]) => {
    safeStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
  },

  getStudents: (): Student[] => {
    try {
      const data = safeStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    safeStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(DEFAULT_STUDENTS));
    return DEFAULT_STUDENTS;
  },

  saveStudents: (students: Student[]) => {
    safeStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
  },

  getSessions: (): ClassSession[] => {
    try {
      const data = safeStorage.getItem(STORAGE_KEYS.SESSIONS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    safeStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(DEFAULT_SESSIONS));
    return DEFAULT_SESSIONS;
  },

  saveSessions: (sessions: ClassSession[]) => {
    safeStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  },

  getTeacherPin: (): string => {
    const saved = safeStorage.getItem(STORAGE_KEYS.TEACHER_PIN);
    if (!saved || saved === '1234') {
      safeStorage.setItem(STORAGE_KEYS.TEACHER_PIN, '123654');
      return '123654';
    }
    return saved;
  },

  saveTeacherPin: (pin: string) => {
    safeStorage.setItem(STORAGE_KEYS.TEACHER_PIN, pin);
  },

  isTeacherAuthenticated: (): boolean => {
    return safeStorage.getItem(STORAGE_KEYS.TEACHER_AUTH_TOKEN) === 'true';
  },

  setTeacherAuthenticated: (auth: boolean) => {
    safeStorage.setItem(STORAGE_KEYS.TEACHER_AUTH_TOKEN, auth ? 'true' : 'false');
  },

  resetToDefault: () => {
    safeStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(DEFAULT_TEACHERS));
    safeStorage.setItem(STORAGE_KEYS.CURRENT_TEACHER_ID, 'teacher_ahmed_badawi');
    safeStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(DEFAULT_CLASSES));
    safeStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(DEFAULT_STUDENTS));
    safeStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(DEFAULT_SESSIONS));
    safeStorage.setItem(STORAGE_KEYS.TEACHER_PIN, '123654');
  }
};

/**
 * Checks if a given teacher is Ahmed Badawi (the super admin / owner).
 * Used to restrict sensitive control panel settings like Teacher PIN modifications.
 */
export const isAhmedBadawi = (teacher?: TeacherProfile | null): boolean => {
  if (!teacher) return false;
  const name = (teacher.name || '').toLowerCase();
  const email = (teacher.email || '').toLowerCase();
  const id = (teacher.id || '').toLowerCase();
  return (
    id === 'teacher_ahmed_badawi' ||
    email === 'ahmedbadawi5090@gmail.com' ||
    name.includes('بدوي') ||
    name.includes('badawi')
  );
};
