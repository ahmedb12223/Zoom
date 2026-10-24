import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Video,
  Copy,
  Check,
  QrCode,
  ExternalLink,
  Users,
  ArrowLeft,
  Sparkles,
  Trash2,
  Clock,
  ChevronUp,
  Edit2,
  School,
  UserCheck,
  Share2,
  ClipboardPaste,
  X,
  FileSpreadsheet,
  Globe,
  BookOpen,
  CheckSquare,
  Square,
  RotateCcw,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { ClassSession, SchoolClass, Student, TeacherProfile, LanguageTrack } from '../types';
import { QRCodeModal } from './QRCodeModal';
import { EditSessionModal } from './EditSessionModal';
import { ConfirmModal } from './ConfirmModal';
import {
  buildStudentAttendanceLink,
  ensureAbsoluteUrl,
  getPublishedDomain,
  setPublishedDomain,
  DEFAULT_PUBLISHED_DOMAIN
} from '../utils/urlHelper';
import { generateCombinedTeacherAbsenteeReport } from '../utils/whatsappFormatter';
import { normalizeText } from '../utils/arabicFuzzy';
import { isAhmedBadawi } from '../utils/storage';

interface SessionHubHomeProps {
  currentTeacher: TeacherProfile;
  allTeachers?: TeacherProfile[];
  classes: SchoolClass[];
  students: Student[];
  sessions: ClassSession[];
  onEnterSession: (sessionId: string) => void;
  onOpenPasswordModal?: () => void;
  onCreateSession: (
    classId: string,
    className: string,
    title: string,
    zoomUrl: string,
    targetTrack?: LanguageTrack
  ) => void;
  onUpdateSession: (updated: {
    id: string;
    sessionTitle: string;
    classId: string;
    className: string;
    zoomUrl: string;
  }) => void;
  onDeleteSession: (sessionId: string) => void;
  onBatchDeleteSessions?: (sessionIds: string[]) => void;
  onResetAttendance?: (teacherId?: string) => void;
  onOpenStudentGateway?: (sessionId: string) => void;
  onSwitchToClassesTab?: () => void;
}

export const SessionHubHome: React.FC<SessionHubHomeProps> = ({
  currentTeacher,
  allTeachers = [],
  classes,
  students,
  sessions,
  onEnterSession,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onBatchDeleteSessions,
  onResetAttendance,
  onOpenStudentGateway,
  onSwitchToClassesTab,
  onOpenPasswordModal,
}) => {
  // Collapsible Quick Add Bar State (Compact by default, opens on demand)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  // New Session Form State
  const [selectedClassId, setSelectedClassId] = useState<string>(
    classes[0]?.id || ''
  );
  const [sessionTitle, setSessionTitle] = useState('');

  // Target Track Selection: 'all' | 'english' | 'arabic'
  const [targetTrack, setTargetTrack] = useState<LanguageTrack>('all');

  // Zoom URL: starts completely EMPTY without default mock link
  const [zoomUrl, setZoomUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(`smart_zoom_${currentTeacher.id}`) || '';
    } catch {
      return '';
    }
  });

  // Batch selection for multi-delete & reset
  const [selectedForBatchDelete, setSelectedForBatchDelete] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [showResetAttendanceModal, setShowResetAttendanceModal] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  const mySessions = sessions.filter((s) => s.teacherId === currentTeacher.id);

  const isAllSelected =
    mySessions.length > 0 &&
    mySessions.every((s) => selectedForBatchDelete.includes(s.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedForBatchDelete([]);
    } else {
      setSelectedForBatchDelete(mySessions.map((s) => s.id));
    }
  };

  const handleToggleSelectSession = (sessionId: string) => {
    setSelectedForBatchDelete((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
  };

  const handleConfirmBatchDelete = () => {
    if (selectedForBatchDelete.length > 0 && onBatchDeleteSessions) {
      onBatchDeleteSessions(selectedForBatchDelete);
      setSelectedForBatchDelete([]);
    }
    setShowBatchDeleteModal(false);
  };

  const handleConfirmResetAttendance = () => {
    if (onResetAttendance) {
      onResetAttendance(currentTeacher.id);
    }
    setShowResetAttendanceModal(false);
  };

  // Modals & Feedback
  const [qrModalData, setQrModalData] = useState<{ url: string; title: string; subtitle: string } | null>(null);
  const [sessionToEdit, setSessionToEdit] = useState<ClassSession | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<ClassSession | null>(null);

  // Copied feedback
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [copiedAllAbsentees, setCopiedAllAbsentees] = useState(false);
  const [justCreatedSession, setJustCreatedSession] = useState<ClassSession | null>(null);

  // Initialize selected class if none
  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  // Published domain state & configuration
  const [publishedDomain, setPublishedDomainState] = useState<string>(() => getPublishedDomain());
  const [isEditingDomainBanner, setIsEditingDomainBanner] = useState(false);
  const [domainInputValue, setDomainInputValue] = useState<string>(() => getPublishedDomain());

  // Check student tracks for the selected class
  const activeClass = classes.find((c) => c.id === selectedClassId) || classes[0];
  const activeClassStudents = students.filter((s) => s.classId === activeClass?.id);
  const englishTrackCount = activeClassStudents.filter((s) => s.track === 'english').length;
  const arabicTrackCount = activeClassStudents.filter((s) => s.track === 'arabic').length;
  const isMixedTrackClass = englishTrackCount > 0 && arabicTrackCount > 0;

  // Smart Title Generation based on Teacher, Class, and Track
  useEffect(() => {
    const classNameStr = activeClass ? ` - فصل ${activeClass.name}` : '';
    let trackSuffix = '';
    if (targetTrack === 'english') trackSuffix = ' (لغات)';
    if (targetTrack === 'arabic') trackSuffix = ' (عربي)';

    setSessionTitle(`حصة ${currentTeacher.subject}${classNameStr}${trackSuffix}`);
  }, [currentTeacher, activeClass, targetTrack]);

  // Strictly filter sessions to show ONLY current teacher's sessions
  const displayedSessions = mySessions;

  const handleCopyLink = async (session: ClassSession) => {
    const link = buildStudentAttendanceLink(session, currentTeacher);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedSessionId(session.id);
      setTimeout(() => setCopiedSessionId(null), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleShareWhatsApp = (session: ClassSession) => {
    const link = buildStudentAttendanceLink(session, currentTeacher);
    const trackLabel = session.targetTrack === 'english' ? ' [مسار اللغات]' : session.targetTrack === 'arabic' ? ' [المسار العربي]' : '';
    const text = `📢 رابط حضور حصة ${session.sessionTitle}${trackLabel} مع المعلم ${currentTeacher.name}:\n${link}\n\nيرجى الدخول لتسجيل الحضور ثم الانتقال مباشرة لغرفة زوم.`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenQr = (session: ClassSession) => {
    const link = buildStudentAttendanceLink(session, currentTeacher);
    setQrModalData({
      url: link,
      title: `رمز حضور فصل ${session.className}`,
      subtitle: session.sessionTitle,
    });
  };

  const handlePasteZoom = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const cleaned = text.trim();
        setZoomUrl(cleaned);
        try {
          localStorage.setItem(`smart_zoom_${currentTeacher.id}`, cleaned);
        } catch {
          // ignore
        }
      }
    } catch {
      // Fallback
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetClass = classes.find((c) => c.id === selectedClassId) || classes[0];
    if (!targetClass) return;

    const safeZoom = zoomUrl.trim() ? ensureAbsoluteUrl(zoomUrl.trim()) : 'https://zoom.us/join';
    const finalTitle = sessionTitle.trim() || `حصة ${currentTeacher.subject} - فصل ${targetClass.name}`;

    // Smart Save Zoom URL for this teacher
    if (zoomUrl.trim()) {
      try {
        localStorage.setItem(`smart_zoom_${currentTeacher.id}`, zoomUrl.trim());
      } catch {
        // ignore
      }
    }

    onCreateSession(
      targetClass.id,
      targetClass.name,
      finalTitle,
      safeZoom,
      targetTrack
    );

    const mockCreatedSession: ClassSession = {
      id: `new_${Date.now()}`,
      teacherId: currentTeacher.id,
      classId: targetClass.id,
      className: targetClass.name,
      sessionTitle: finalTitle,
      zoomUrl: safeZoom,
      targetTrack,
      createdAt: new Date().toISOString(),
      scheduledTime: 'مباشر الآن',
      isActive: true,
      attendance: [],
    };
    setJustCreatedSession(mockCreatedSession);
    setIsAddFormOpen(false);
  };

  const handleToggleAddForm = () => {
    setIsAddFormOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          titleInputRef.current?.focus();
        }, 150);
      }
      return next;
    });
  };

  // -----------------------------------------------------------------
  // SMART FEATURE: نسخ جميع الطلاب الغائبين في حصصي دفعة واحدة
  // -----------------------------------------------------------------
  const handleCopyAllAbsentees = async () => {
    if (mySessions.length === 0) return;

    const report = generateCombinedTeacherAbsenteeReport(
      currentTeacher.name,
      currentTeacher.subject,
      mySessions,
      students
    );

    try {
      await navigator.clipboard.writeText(report);
      setCopiedAllAbsentees(true);
      setTimeout(() => setCopiedAllAbsentees(false), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleShareAllAbsenteesWhatsApp = () => {
    if (mySessions.length === 0) return;

    const report = generateCombinedTeacherAbsenteeReport(
      currentTeacher.name,
      currentTeacher.subject,
      mySessions,
      students
    );

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(report)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-3.5 dir-rtl font-sans">
      {/* ------------------------------------------------------------- */}
      {/* Security & Password Admin Banner (Only for Mr. Ahmed Badawi) */}
      {/* ------------------------------------------------------------- */}
      {isAhmedBadawi(currentTeacher) && onOpenPasswordModal && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50/50 to-indigo-50 border border-indigo-200/90 rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="truncate">
              <div className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5 truncate">
                <span>أمان لوحة التحكم (مستر أحمد بدوي)</span>
                <span className="text-[10px] bg-indigo-100 text-indigo-700 font-extrabold px-2 py-0.5 rounded-md hidden xs:inline-block">
                  المشرف العام
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                كلمة المرور الحالية تحمي لوحة التحكم وتمنع دخول الطلاب. يمكنك تغييرها في أي وقت.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenPasswordModal}
            className="shrink-0 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-indigo-600/20"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>تعديل كلمة السر</span>
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Universal Published Domain Banner (لضمان عمل الروابط على كافة الأجهزة) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-900">نطاق نشر المنصة لروابط وباركود الطلاب</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-md">
                  يعمل على الآيفون والاندرويد بدون تسجيل دخول
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                تعتمد جميع روابط الطلاب ورموز QR كود تلقائياً على هذا النطاق المنشور لضمان التحضير المباشر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isEditingDomainBanner ? (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <input
                  type="text"
                  value={domainInputValue}
                  onChange={(e) => setDomainInputValue(e.target.value)}
                  placeholder="https://example.com"
                  className="px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-lg text-slate-800 dir-ltr text-left w-48 sm:w-56 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (domainInputValue.trim()) {
                      setPublishedDomain(domainInputValue.trim());
                      setPublishedDomainState(getPublishedDomain());
                      setIsEditingDomainBanner(false);
                    }
                  }}
                  className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPublishedDomain('');
                    const actualOrigin = getPublishedDomain();
                    setDomainInputValue(actualOrigin);
                    setPublishedDomainState(actualOrigin);
                    setIsEditingDomainBanner(false);
                  }}
                  className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 cursor-pointer"
                  title="استعادة رابط الموقع التلقائي الفعلي"
                >
                  تلقائي
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg dir-ltr">
                  {publishedDomain}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDomainInputValue(publishedDomain);
                    setIsEditingDomainBanner(true);
                  }}
                  className="text-xs text-slate-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-slate-50 font-bold transition-colors cursor-pointer"
                >
                  تعديل
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div
        id="quick-add-session-card"
        className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all"
      >
        {/* Sleek 1-Row Collapsed Header Bar */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggleAddForm}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleToggleAddForm();
          }}
          className="p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              {isAddFormOpen ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4 stroke-[3]" />}
            </div>
            <div className="truncate">
              <div className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5 truncate">
                <span>إضافة حصة جديدة واختيار الفصل</span>
                {!isAddFormOpen && (
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.2 rounded-md hidden xs:inline-block">
                    سريع وذكي
                  </span>
                )}
              </div>
              {!isAddFormOpen && (
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  اختر الفصل ومسار الطلاب (لغات / عربي) وضع رابط زوم
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleAddForm();
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                isAddFormOpen
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
              }`}
            >
              {isAddFormOpen ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  <span>إغلاق</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>حصة جديدة</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Expandable Form Drawer */}
        {isAddFormOpen && (
          <div className="p-3.5 sm:p-5 border-t border-slate-100 bg-slate-50/50 animate-in slide-in-from-top-2 duration-150">
            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              {/* 1. Class Selection: ONLY CLASS NAME, NO STUDENT COUNT */}
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  ١. اختر الفصل الدراسي:
                </label>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
                  {classes.map((cls) => {
                    const isSelected = cls.id === selectedClassId;
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => setSelectedClassId(cls.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border select-none ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs scale-102'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <span>فصل {cls.name}</span>
                      </button>
                    );
                  })}
                  {onSwitchToClassesTab && (
                    <button
                      type="button"
                      onClick={onSwitchToClassesTab}
                      className="shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 hover:text-indigo-600 bg-white border border-dashed border-slate-300"
                    >
                      + فصل جديد
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Target Track Selection (الاختيار بين طلاب العربي أو اللغات أو كلاهما) */}
              <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <label className="text-xs font-black text-slate-800">
                    ٢. تحديد فئة الطلاب المستهدفة للحصة:
                  </label>
                  {isMixedTrackClass ? (
                    <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md font-bold">
                      فصل مشترك ({englishTrackCount} لغات · {arabicTrackCount} عربي)
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-bold">
                      {activeClassStudents.length > 0
                        ? `إجمالي طلاب الفصل: ${activeClassStudents.length}`
                        : 'اختر الفئة المستهدفة'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-200/80 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTargetTrack('all')}
                    className={`py-2 px-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      targetTrack === 'all'
                        ? 'bg-white text-indigo-950 shadow-2xs font-extrabold ring-1 ring-indigo-300'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>كلاهما (الجميع)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetTrack('english')}
                    className={`py-2 px-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      targetTrack === 'english'
                        ? 'bg-blue-600 text-white shadow-2xs font-extrabold ring-1 ring-blue-700'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>طلاب اللغات ({englishTrackCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetTrack('arabic')}
                    className={`py-2 px-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      targetTrack === 'arabic'
                        ? 'bg-amber-600 text-white shadow-2xs font-extrabold ring-1 ring-amber-700'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>طلاب العربي ({arabicTrackCount})</span>
                  </button>
                </div>
              </div>

              {/* 3. Title & Clean Zoom Input (NO DEFAULT URL) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    عنوان وموضوع الحصة:
                  </label>
                  <input
                    ref={titleInputRef}
                    type="text"
                    required
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    placeholder="مثال: مراجعة العلوم - الحصة الأولى"
                    className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      رابط زوم (ضع الرابط هنا):
                    </label>
                    <button
                      type="button"
                      onClick={handlePasteZoom}
                      className="text-[10px] text-indigo-600 font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      <span>لصق من الحافظة</span>
                    </button>
                  </div>
                  <input
                    type="url"
                    value={zoomUrl}
                    onChange={(e) => setZoomUrl(e.target.value)}
                    placeholder="ضع رابط زوم هنا... https://zoom.us/j/..."
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dir-ltr text-left"
                  />
                </div>
              </div>

              {/* Submit / Cancel Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>بدء الحصة وتوليد الرابط فوراً 🚀</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Immediate Share Feedback Banner */}
        {justCreatedSession && (
          <div className="p-3 bg-emerald-50 border-t border-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold">
              <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
              <span>تمت إضافة الحصة! شارك الرابط الآن:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleShareWhatsApp(justCreatedSession)}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-black text-xs flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>واتساب</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopyLink(justCreatedSession)}
                className="px-2.5 py-1.5 bg-white text-slate-800 border border-slate-200 rounded-lg font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                <span>نسخ</span>
              </button>
              <button
                type="button"
                onClick={() => setJustCreatedSession(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. SMART CONSOLIDATED ABSENTEE REPORT ACTION (نسخ غياب جميع حصصي) */}
      {/* ------------------------------------------------------------- */}
      {mySessions.length > 0 && (
        <div className="p-2.5 sm:p-3 bg-linear-to-r from-slate-900 to-indigo-950 text-white rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-right">
            <div className="w-8 h-8 rounded-xl bg-white/10 text-amber-300 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                <span>تقرير الغياب المجمع لجميع حصصي</span>
                <span className="text-[10px] bg-amber-400 text-slate-900 font-extrabold px-1.5 py-0.2 rounded-md">
                  كشف موحد
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                تجميع أسماء جميع الطلاب الغائبين في كافة حصصك بنقرة واحدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyAllAbsentees}
              className={`flex-1 sm:flex-initial py-2 px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                copiedAllAbsentees
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-900 shadow-2xs'
              }`}
            >
              {copiedAllAbsentees ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>تم نسخ كشف الغياب! ✅</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-indigo-600" />
                  <span>نسخ جميع الغائبين دفعة واحدة</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShareAllAbsenteesWhatsApp}
              className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-xs cursor-pointer"
              title="إرسال التقرير المجمع للواتساب"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">واتساب</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. LIVE SESSIONS LIST (حصص المعلم الحالي فقط - بدون "الكل")   */}
      {/* ------------------------------------------------------------- */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              حصص المعلم: {currentTeacher.name} ({displayedSessions.length})
            </h3>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Select All Toggle Button */}
            {displayedSessions.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              >
                {isAllSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{isAllSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</span>
              </button>
            )}

            {/* Batch Delete Selected Button */}
            {selectedForBatchDelete.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(true)}
                className="px-3 py-1 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 transition-all shadow-xs cursor-pointer animate-in fade-in"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحدد ({selectedForBatchDelete.length})</span>
              </button>
            )}

            {/* Instant Manual Reset Button */}
            <button
              type="button"
              onClick={() => setShowResetAttendanceModal(true)}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="تصفير سجلات الغياب فوراً"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
              <span>تصفير الغياب الآن</span>
            </button>

            <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3 text-indigo-600" />
              تصفير تلقائي 12:00 ص 🇸🇦
            </span>
          </div>
        </div>

        {/* Compact Sessions Cards Grid */}
        {displayedSessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {displayedSessions.map((session) => {
              const isSelectedForBatch = selectedForBatchDelete.includes(session.id);

              // Targeted students according to session track
              const sessionStudents = students.filter((s) => {
                if (s.classId !== session.classId) return false;
                if (session.targetTrack === 'all') return true;
                return s.track === session.targetTrack;
              });

              const presentCount = session.attendance.length;
              const totalCount = sessionStudents.length;
              const absentCount = Math.max(0, totalCount - presentCount);
              const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
              const isCopied = copiedSessionId === session.id;

              const trackBadge =
                session.targetTrack === 'english' ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                    لغات
                  </span>
                ) : session.targetTrack === 'arabic' ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                    عربي
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600">
                    الكل
                  </span>
                );

              return (
                <div
                  key={session.id}
                  className={`bg-white rounded-2xl border transition-all p-3 sm:p-3.5 flex flex-col justify-between space-y-2.5 group ${
                    isSelectedForBatch
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                      : 'border-slate-200/90 hover:border-indigo-300 hover:shadow-md'
                  }`}
                >
                  <div>
                    {/* Top Row: Class Tag + Track Tag + Title + Select/Edit/Delete */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectSession(session.id);
                          }}
                          className="p-0.5 cursor-pointer shrink-0"
                          title={isSelectedForBatch ? 'إلغاء التحديد' : 'تحديد الحصة'}
                        >
                          {isSelectedForBatch ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 stroke-[2.5]" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                        <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded-lg bg-indigo-600 text-white shrink-0">
                          فصل {session.className}
                        </span>
                        {trackBadge}
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                          {session.sessionTitle}
                        </h4>
                      </div>

                      {/* Quiet Edit/Delete Icons */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSessionToEdit(session);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 cursor-pointer"
                          title="تعديل الحصة"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSessionToDelete(session);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                          title="حذف الحصة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Middle Row: Compact Attendance Summary Bar */}
                    <div className="flex items-center justify-between text-[11px] py-1 px-2.5 bg-slate-50 rounded-xl border border-slate-100 font-mono mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-700 font-bold">🟢 {presentCount} حاضر</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-rose-700 font-bold">🔴 {absentCount} غائب</span>
                      </div>
                      <span className="text-slate-500 font-bold">
                        {attendanceRate}% ({totalCount} طالب)
                      </span>
                    </div>

                    {/* Compact Zoom Info */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                      <span className="flex items-center gap-1 truncate font-mono dir-ltr text-left max-w-[200px]">
                        <Video className="w-3 h-3 text-blue-600 shrink-0" />
                        <span className="truncate">{session.zoomUrl}</span>
                      </span>
                      <a
                        href={ensureAbsoluteUrl(session.zoomUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5"
                      >
                        <span>فتح زوم</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Bottom Row: 2 Big Primary Actions (Enter + Share/Copy) */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                    {/* Primary Enter Details Button */}
                    <button
                      type="button"
                      onClick={() => onEnterSession(session.id)}
                      className="flex-1 py-2 px-3 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>دخول التحضير</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>

                    {/* WhatsApp Direct Share Button */}
                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp(session)}
                      className="py-2 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer"
                      title="إرسال الرابط للواتساب فوراً"
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden xs:inline">واتساب</span>
                    </button>

                    {/* Copy Link Button */}
                    <button
                      type="button"
                      onClick={() => handleCopyLink(session)}
                      className={`p-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title={isCopied ? 'تم النسخ!' : 'نسخ رابط الطالب'}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>

                    {/* QR Code */}
                    <button
                      type="button"
                      onClick={() => handleOpenQr(session)}
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl cursor-pointer"
                      title="رمز QR"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>

                    {/* Student Gateway Preview */}
                    {onOpenStudentGateway && (
                      <button
                        type="button"
                        onClick={() => onOpenStudentGateway(session.id)}
                        className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl cursor-pointer"
                        title="معاينة تجربة الطالب"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-2xs">
            <p className="text-xs sm:text-sm font-bold text-slate-700 mb-1">
              لا توجد حصص مضافة باسم {currentTeacher.name} حتى الآن
            </p>
            <p className="text-[11px] text-slate-500 mb-3">
              اضغط على شريط "إضافة حصة جديدة" بالأعلى لاختيار الفصل وتحديد الطلاب المستهدفين.
            </p>
            <button
              type="button"
              onClick={handleToggleAddForm}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>إضافة حصة الآن</span>
            </button>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {qrModalData && (
        <QRCodeModal
          isOpen={!!qrModalData}
          onClose={() => setQrModalData(null)}
          url={qrModalData.url}
          title={qrModalData.title}
          subtitle={qrModalData.subtitle}
          onDomainChanged={() => setPublishedDomainState(getPublishedDomain())}
        />
      )}

      {/* Edit Session Modal */}
      {sessionToEdit && (
        <EditSessionModal
          isOpen={!!sessionToEdit}
          onClose={() => setSessionToEdit(null)}
          session={sessionToEdit}
          classes={classes}
          onSave={(updated) => {
            onUpdateSession(updated);
            setSessionToEdit(null);
          }}
        />
      )}

      {/* Delete Session Confirmation Modal */}
      {sessionToDelete && (
        <ConfirmModal
          isOpen={!!sessionToDelete}
          title="حذف الحصة الدراسية"
          message={`هل أنت متأكد من رغبتك في حذف حصة "${sessionToDelete.sessionTitle}"؟ سيتم حذف بيانات الحضور المرتبطة بها نهائياً.`}
          confirmText="نعم، احذف الحصة"
          cancelText="تراجع"
          onConfirm={() => {
            onDeleteSession(sessionToDelete.id);
            setSessionToDelete(null);
          }}
          onCancel={() => setSessionToDelete(null)}
        />
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <ConfirmModal
          isOpen={showBatchDeleteModal}
          title="حذف الحصص المحددة دفعة واحدة"
          message={`هل أنت متأكد من رغبتك في حذف (${selectedForBatchDelete.length}) حصة من حصصك المحددة؟ سيتم مسحها نهائياً مع بيانات الحضور المرتبطة بها.`}
          confirmText={`نعم، احذف (${selectedForBatchDelete.length}) حصة`}
          cancelText="تراجع"
          isDestructive={true}
          onConfirm={handleConfirmBatchDelete}
          onCancel={() => setShowBatchDeleteModal(false)}
        />
      )}

      {/* Instant Attendance Reset Confirmation Modal */}
      {showResetAttendanceModal && (
        <ConfirmModal
          isOpen={showResetAttendanceModal}
          title="تصفير كشف الحضور والغياب فوراً"
          message={`هل أنت متأكد من رغبتك في تصفير سجلات الغياب فوراً لجميع حصص المعلم (${currentTeacher.name})؟ سيتم تفريغ كشف الحاضرين والبدء بكشف غياب جديد (تتم هذه العملية تلقائياً يومياً الساعة 12:00 ص بتوقيت السعودية).`}
          confirmText="نعم، تصفير كشف الغياب"
          cancelText="تراجع"
          isDestructive={false}
          onConfirm={handleConfirmResetAttendance}
          onCancel={() => setShowResetAttendanceModal(false)}
        />
      )}
    </div>
  );
};
