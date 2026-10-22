import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Download, ExternalLink } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
  subtitle: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  url,
  title,
  subtitle,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && url) {
      QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((dataUri) => {
          setQrDataUrl(dataUri);
        })
        .catch((err) => {
          console.error('Failed to generate QR code', err);
        });
    }
  }, [isOpen, url]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `QR_Attendance_${title.slice(0, 15).replace(/\s+/g, '_')}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-in fade-in">
      <div className="relative bg-white rounded-3xl max-w-sm sm:max-w-md w-full shadow-2xl border border-slate-100 my-auto overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div className="min-w-0 pr-1">
            <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors shrink-0 cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex flex-col items-center text-center space-y-3.5">
          <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-inner flex items-center justify-center max-w-full">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-44 h-44 sm:w-56 sm:h-56 rounded-xl object-contain max-w-full aspect-square"
              />
            ) : (
              <div className="w-44 h-44 sm:w-56 sm:h-56 flex items-center justify-center text-slate-400 text-xs">
                جاري توليد الرمز...
              </div>
            )}
          </div>

          <div>
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              وجّه كاميرا الهاتف نحو الرمز للدخول والتحضير
            </p>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
              يمكنك عرض هذا الرمز على شاشة الفصل أو إرسال الرابط مباشرة للطلاب
            </p>
          </div>

          {/* Fully Responsive Copyable Link Box (Never breaks screen width) */}
          <div className="w-full max-w-full bg-slate-50 rounded-xl border border-slate-200 p-1.5 sm:p-2 flex items-center gap-1.5 text-left dir-ltr overflow-hidden">
            <input
              type="text"
              readOnly
              value={url}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="w-full flex-1 min-w-0 bg-transparent text-[11px] sm:text-xs font-mono text-slate-600 select-all outline-none truncate px-1"
              aria-label="رابط الحضور"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>تم النسخ</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ الرابط</span>
                </>
              )}
            </button>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>تحميل الصورة</span>
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors shadow-2xs"
            >
              <ExternalLink className="w-4 h-4" />
              <span>تجربة الرابط</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
