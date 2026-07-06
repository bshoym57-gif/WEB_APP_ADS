import { useState } from 'react';
import { Rocket, Loader2, AlertCircle, CheckCircle2, RotateCcw, Send, Globe, Users, Target, DollarSign, Calendar, Eye } from 'lucide-react';
import { EDGE_FUNCTION_URL, type ConnectionState } from '../lib/supabase';

interface CampaignFormProps {
  state: ConnectionState;
  onCampaignCreated: () => void;
}

const GOALS = [
  { value: 'LINK_CLICKS', label: 'LINK_CLICKS' },
  { value: 'PAGE_LIKES', label: 'PAGE_LIKES' },
  { value: 'POST_ENGAGEMENT', label: 'POST_ENGAGEMENT' },
  { value: 'MESSAGES', label: 'MESSAGES' },
  { value: 'VIDEO_VIEWS', label: 'VIDEO_VIEWS' },
];

const GENDERS = [
  { value: 0, label: 'الجميع' },
  { value: 1, label: 'رجال' },
  { value: 2, label: 'نساء' },
];

const COUNTRY_PRESETS = [
  { label: 'مصر', value: 'EG' },
  { label: 'السعودية', value: 'SA' },
  { label: 'الإمارات', value: 'AE' },
  { label: 'المغرب', value: 'MA' },
  { label: 'الجزائر', value: 'DZ' },
  { label: 'العراق', value: 'IQ' },
  { label: 'الأردن', value: 'JO' },
  { label: 'الفلبين', value: 'PH' },
  { label: 'دول أفريقيا', value: 'AFRICA_REGION' },
  { label: 'مجموعة معززة', value: 'COMB_BOOST' },
];

export default function CampaignForm({ state, onCampaignCreated }: CampaignFormProps) {
  const [form, setForm] = useState({
    pageId: '',
    adAccountId: '',
    postId: '',
    link: '',
    budget: '2',
    duration: '7',
    currency: 'USD',
    goal: 'LINK_CLICKS',
    countries: 'EG',
    gender: '0',
    ageMin: '18',
    ageMax: '55',
  });

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'info' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });
  const [result, setResult] = useState<string>('لن تظهر النتيجة حتى يتم الإرسال.');

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addCountry(code: string) {
    const current = form.countries.split(',').map((c) => c.trim()).filter(Boolean);
    if (!current.includes(code)) {
      update('countries', [...current, code].join(','));
    }
  }

  function reset() {
    setForm({
      pageId: '', adAccountId: '', postId: '', link: '',
      budget: '2', duration: '7', currency: 'USD', goal: 'LINK_CLICKS',
      countries: 'EG', gender: '0', ageMin: '18', ageMax: '55',
    });
    setStatus({ type: 'idle', message: '' });
    setResult('لن تظهر النتيجة حتى يتم الإرسال.');
  }

  async function handleSubmit() {
    if (!state.connected) {
      setStatus({ type: 'error', message: 'يرجى إتمام خطوة الاتصال أولًا.' });
      return;
    }

    const pageId = form.pageId.trim();
    const adAccountId = form.adAccountId.trim();
    const postId = form.postId.trim();
    const link = form.link.trim();

    if (!pageId || !adAccountId || !postId || (form.goal === 'LINK_CLICKS' && !link)) {
      setStatus({ type: 'error', message: 'الرجاء ملء كل الحقول المطلوبة قبل الإرسال.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: 'جاري إرسال الحملة إلى فيسبوك...' });
    setResult('جاري الإرسال...');

    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          cookies: state.cookies,
          cookieHeader: state.cookieHeader,
          fbDtsg: state.fbDtsg,
          lsd: state.lsd,
          userId: state.userId,
          pageId,
          adAccountId,
          postId,
          link,
          budget: parseFloat(form.budget) || 2,
          duration: parseInt(form.duration, 10) || 7,
          currency: form.currency,
          goal: form.goal,
          countries: form.countries,
          gender: parseInt(form.gender, 10) || 0,
          ageMin: parseInt(form.ageMin, 10) || 18,
          ageMax: parseInt(form.ageMax, 10) || 55,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setStatus({ type: 'error', message: data.message || 'فشل الإرسال.' });
        setResult(data.message || 'فشل الإرسال');
      } else {
        setStatus({ type: 'success', message: data.message || 'تم إنشاء الحملة بنجاح.' });
        setResult(JSON.stringify(data.payload || data, null, 2));
        onCampaignCreated();
      }
    } catch (error) {
      setStatus({ type: 'error', message: 'فشل الاتصال بالخادم.' });
      setResult((error as Error).message || 'فشل الاتصال');
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
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald2-500/15 border border-emerald2-400/20">
          <Rocket className="w-5 h-5 text-emerald2-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">خطوة 2: أدخل بيانات الحملة</h2>
          <p className="text-sm text-slate-400">املأ الحقول التالية ثم اضغط بدء الإرسال</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Required fields */}
        <Field label="Page ID" icon={<Target className="w-4 h-4" />} required>
          <input value={form.pageId} onChange={(e) => update('pageId', e.target.value)} className="input-field" placeholder="123456789" />
        </Field>

        <Field label="Ad Account ID" icon={<DollarSign className="w-4 h-4" />} required>
          <input value={form.adAccountId} onChange={(e) => update('adAccountId', e.target.value)} className="input-field" placeholder="act_123456789" />
        </Field>

        <Field label="Post ID" icon={<Eye className="w-4 h-4" />} required>
          <input value={form.postId} onChange={(e) => update('postId', e.target.value)} className="input-field" placeholder="987654321" />
        </Field>

        <Field label="Link" icon={<Globe className="w-4 h-4" />} required={form.goal === 'LINK_CLICKS'}>
          <input value={form.link} onChange={(e) => update('link', e.target.value)} className="input-field" placeholder="https://..." />
        </Field>

        {/* Budget & Duration */}
        <Field label="Budget" icon={<DollarSign className="w-4 h-4" />}>
          <input type="number" value={form.budget} onChange={(e) => update('budget', e.target.value)} className="input-field" min="1" step="0.5" />
        </Field>

        <Field label="Duration (days)" icon={<Calendar className="w-4 h-4" />}>
          <input type="number" value={form.duration} onChange={(e) => update('duration', e.target.value)} className="input-field" min="1" />
        </Field>

        <Field label="Currency">
          <input value={form.currency} onChange={(e) => update('currency', e.target.value)} className="input-field" placeholder="USD" />
        </Field>

        <Field label="Objective">
          <select value={form.goal} onChange={(e) => update('goal', e.target.value)} className="input-field cursor-pointer">
            {GOALS.map((g) => (
              <option key={g.value} value={g.value} className="bg-ink-800">{g.label}</option>
            ))}
          </select>
        </Field>

        {/* Targeting */}
        <Field label="Target Countries" icon={<Globe className="w-4 h-4" />}>
          <input value={form.countries} onChange={(e) => update('countries', e.target.value)} className="input-field" placeholder="EG,SA,AE" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COUNTRY_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => addCountry(preset.value)}
                className="px-2.5 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-brand-500/15 hover:border-brand-400/30 hover:text-brand-200 transition-all duration-150"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Gender" icon={<Users className="w-4 h-4" />}>
          <select value={form.gender} onChange={(e) => update('gender', e.target.value)} className="input-field cursor-pointer">
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value} className="bg-ink-800">{g.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Age Min">
          <input type="number" value={form.ageMin} onChange={(e) => update('ageMin', e.target.value)} className="input-field" min="13" max="65" />
        </Field>

        <Field label="Age Max">
          <input type="number" value={form.ageMax} onChange={(e) => update('ageMax', e.target.value)} className="input-field" min="13" max="65" />
        </Field>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-6">
        <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري الإرسال...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              بدء الإرسال
            </>
          )}
        </button>
        <button onClick={reset} disabled={loading} className="btn-ghost flex items-center justify-center gap-2">
          <RotateCcw className="w-4 h-4" />
          إعادة تعيين
        </button>
      </div>

      {/* Status */}
      {status.type !== 'idle' && (
        <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed mt-4 ${statusStyles[status.type]} animate-fade-in`}>
          <div className="flex items-start gap-2">
            {StatusIcon && <StatusIcon className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{status.message}</span>
          </div>
        </div>
      )}

      {/* Result */}
      <div className="mt-4">
        <label className="text-sm font-semibold text-slate-300 mb-2 block">النتيجة</label>
        <pre className="bg-ink-950/80 border border-white/10 rounded-xl p-4 text-xs text-brand-100 min-h-[120px] max-h-[300px] overflow-auto whitespace-pre-wrap leading-relaxed font-mono">
          {result}
        </pre>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  required,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-300">
        {icon && <span className="text-slate-400">{icon}</span>}
        {label}
        {required && <span className="text-red-400 text-xs">*</span>}
      </label>
      {children}
    </div>
  );
}
