import React, { useState, useEffect } from 'react';
import { X, Check, School, Edit3 } from 'lucide-react';
import { SchoolClass } from '../types';
import { ensureAbsoluteUrl } from '../utils/urlHelper';

interface EditClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolClass: SchoolClass | null;
  onSave: (updated: {
    id: string;
    name: string;
    gradeLevel: string;
    zoomUrl?: string;
  }) => void;
}

export const EditClassModal: React.FC<EditClassModalProps> = ({
  isOpen,
  onClose,
  schoolClass,
  onSave,
}) => {
  const [name, setName] = useState(schoolClass?.name || '');
  const [gradeLevel, setGradeLevel] = useState(schoolClass?.gradeLevel || '');
  const [zoomUrl, setZoomUrl] = useState(schoolClass?.zoomUrl || '');

  useEffect(() => {
    if (schoolClass) {
      setName(schoolClass.name);
      setGradeLevel(schoolClass.gradeLevel);
      setZoomUrl(schoolClass.zoomUrl || '');
    }
  }, [schoolClass]);

  if (!isOpen || !schoolClass) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      id: schoolClass.id,
      name: name.trim(),
      gradeLevel: gradeLevel.trim() || 'المرحلة الدراسية',
      zoomUrl: zoomUrl.trim() ? ensureAbsoluteUrl(zoomUrl.trim()) : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                تعديل بيانات الفصل
              </h2>
              <p className="text-xs text-slate-500">
                تعديل اسم الفصل، المرحلة، أو رابط زوم الافتراضي
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              اسم الفصل أو الشعبة (مثال: GR4 - A):
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: GR4 - A"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-black border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              المرحلة الدراسية:
            </label>
            <input
              type="text"
              required
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              placeholder="مثال: الصف الرابع الابتدائي (Grade 4)"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              رابط زوم الافتراضي للفصل (اختياري):
            </label>
            <input
              type="url"
              value={zoomUrl}
              onChange={(e) => setZoomUrl(e.target.value)}
              placeholder="https://zoom.us/j/..."
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dir-ltr text-left"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Check className="w-4 h-4" />
              <span>حفظ تعديل الفصل</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
