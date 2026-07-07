import { useState } from 'react';
import { Facebook, Zap, ShieldCheck } from 'lucide-react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import ConnectionCard from './components/ConnectionCard';
import CampaignForm from './components/CampaignForm';
import CampaignHistory from './components/CampaignHistory';
import type { ConnectionState } from './lib/supabase';

function App() {
  const [connection, setConnection] = useState<ConnectionState>({
    cookies: '',
    cookieHeader: '',
    fbDtsg: '',
    lsd: '',
    userId: '',
    connected: false,
  });
  const [historyRefresh, setHistoryRefresh] = useState(0);

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-ink-900/70 border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-600/30">
              <Zap className="w-5 h-5 text-white" fill="white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Boost Tool</h1>
              <p className="text-xs text-slate-400">أداة إدارة حملات فيسبوك</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connection.connected ? (
              <span className="status-badge bg-emerald2-500/15 text-emerald-300 border border-emerald2-400/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                متصل
              </span>
            ) : (
              <span className="status-badge bg-white/5 text-slate-400 border border-white/10">
                <Facebook className="w-3.5 h-3.5" />
                غير متصل
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Hero */}
        <div className="bg-gradient-to-br from-brand-500/10 via-brand-600/5 to-emerald2-500/10 border border-white/8 rounded-2xl p-6 sm:p-8 animate-fade-in">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            أداة Boost Tool Web App
          </h2>
          <p className="text-slate-300 leading-relaxed max-w-2xl">
            اربط حساب فيسبوك الخاص بك باستخدام الكوكيز، ثم استخرج رموز المصادقة تلقائيًا.
            بعد ذلك، أدخل بيانات الحملة وابدأ في نشر إعلاناتك مباشرة.
          </p>
        </div>

        {/* Step 1: Connection */}
        <ConnectionCard state={connection} onConnect={setConnection} />

        {/* Step 2: Campaign Form (only when connected) */}
        {connection.connected && (
          <CampaignForm
            state={connection}
            onCampaignCreated={() => setHistoryRefresh((k) => k + 1)}
          />
        )}

        {/* History */}
        <CampaignHistory refreshKey={historyRefresh} />
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 sm:px-6 mt-8">
        <p className="text-center text-xs text-slate-500">
          Boost Tool - جميع الحقوق محفوظة
        </p>
      </footer>
      <SpeedInsights />
    </div>
  );
}

export default App;
