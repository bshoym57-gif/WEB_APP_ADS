import { useState } from 'react';
import { Link2, Loader2, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { EDGE_FUNCTION_URL, type ConnectionState } from '../lib/supabase';

interface ConnectionCardProps {
  state: ConnectionState;
  onConnect: (state: ConnectionState) => void;
}

export default function ConnectionCard({ state, onConnect }: ConnectionCardProps) {
  const [cookies, setCookies] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'info' | 'success' | 'error'; message: string }>({
    type: 'info',
    message: 'أدخل كوكيز فيسبوك لربط حسابك واستخراج الرموز المطلوبة.',
  });

  async function handleConnect() {
    const rawCookies = cookies.trim();
    if (!rawCookies) {
      setStatus({ type: 'error', message: 'الرجاء إدخال كوكيز فيسبوك أولاً.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: 'جاري فحص الحساب واستخراج fb_dtsg و lsd...' });

    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', cookies: rawCookies }),
      });
      const data = await response.json();

      if (!data.success) {
        setStatus({ type: 'error', message: data.message || 'تعذر الاتصال.' });
        return;
      }

      onConnect({
        cookies: data.cookies || rawCookies,
        cookieHeader: data.cookieHeader || '',
        fbDtsg: data.fbDtsg || '',
        lsd: data.lsd || '',
        userId: data.userId || '',
        connected: true,
      });

      setStatus({
        type: 'success',
        message: `تم الاتصال بنجاح! User ID: ${data.userId || 'غير متوفر'}`,
      });
    } catch {
      setStatus({ type: 'error', message: 'فشل الاتصال بالخادم. تأكد من الاتصال بالإنترنت.' });
    } finally {
      setLoading(false);
    }
  }

  const statusStyles = {
    idle: 'hidden',
    info: 'block bg-brand-500/10 text-brand-200 border border-brand-400/20',
    success: 'block bg-emerald2-500/10 text-emerald-300 border border-emerald2-400/20',
    error: 'block bg-red-500/10 text-red-300 border border-red-400/20',
  };

  const StatusIcon = status.type === 'success' ? CheckCircle2 : status.type === 'error' ? AlertCircle : null;

  return (
    <div className="card p-6 animate-slide-up">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-400/20">
          <Link2 className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">خطوة 1: ربط حساب فيسبوك</h2>
          <p className="text-sm text-slate-400">أدخل كوكيز حسابك لاستخراج رموز المصادقة</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="cookieInput" className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-2">
            <KeyRound className="w-4 h-4 text-slate-400" />
            كوكيز فيسبوك
          </label>
          <textarea
            id="cookieInput"
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            placeholder="مثال: c_user=1000; xs=...; fr=...; datr=..."
            className="input-field min-h-[110px] resize-y font-mono text-xs leading-relaxed"
            disabled={loading || state.connected}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleConnect}
            disabled={loading || state.connected}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري الاتصال...
              </>
            ) : state.connected ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                متصل
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                اتصال وفحص الحساب
              </>
            )}
          </button>
        </div>

        {status.type !== 'idle' && (
          <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${statusStyles[status.type]} animate-fade-in`}>
            <div className="flex items-start gap-2">
              {StatusIcon && <StatusIcon className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{status.message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
