import { useEffect, useState, useCallback } from 'react';
import { History, CheckCircle2, XCircle, Loader2, Trash2, Clock } from 'lucide-react';
import { supabase, type Campaign } from '../lib/supabase';

export default function CampaignHistory({ refreshKey }: { refreshKey: number }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching campaigns:', error);
    } else {
      setCampaigns((data as Campaign[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns, refreshKey]);

  async function deleteCampaign(id: string) {
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (!error) {
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-400/20">
            <History className="w-5 h-5 text-brand-400" />
          </div>
          <h2 className="text-lg font-bold text-white">سجل الحملات</h2>
        </div>
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-400/20">
            <History className="w-5 h-5 text-brand-400" />
          </div>
          <h2 className="text-lg font-bold text-white">سجل الحملات</h2>
        </div>
        <div className="text-center py-12 text-slate-400">
          <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد حملات بعد. ابدأ بإنشاء حملة جديدة.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-400/20">
          <History className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">سجل الحملات</h2>
          <p className="text-sm text-slate-400">{campaigns.length} حملة</p>
        </div>
      </div>

      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="bg-ink-800/60 border border-white/8 rounded-xl overflow-hidden transition-all duration-200 hover:border-white/15 animate-slide-in"
          >
            <div
              className="flex items-center gap-3 p-4 cursor-pointer"
              onClick={() => setExpanded(expanded === campaign.id ? null : campaign.id)}
            >
              <StatusBadge status={campaign.status} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-white truncate">Page: {campaign.page_id}</span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400 truncate">Post: {campaign.post_id}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(campaign.created_at).toLocaleString('ar-EG')}
                  </span>
                  <span>{campaign.goal}</span>
                  <span>{campaign.currency} {campaign.budget}</span>
                </div>
              </div>

              {campaign.boost_id && (
                <span className="text-xs font-mono text-emerald-300 bg-emerald2-500/10 px-2 py-1 rounded-lg border border-emerald2-400/20">
                  {campaign.boost_id}
                </span>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCampaign(campaign.id);
                }}
                className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {expanded === campaign.id && (
              <div className="border-t border-white/8 p-4 bg-ink-950/40 animate-fade-in">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                  <Detail label="Ad Account" value={campaign.ad_account_id} />
                  <Detail label="Link" value={campaign.link || '—'} />
                  <Detail label="Duration" value={`${campaign.duration} days`} />
                  <Detail label="Countries" value={campaign.countries} />
                  <Detail label="Gender" value={campaign.gender === 0 ? 'All' : campaign.gender === 1 ? 'Men' : 'Women'} />
                  <Detail label="Age Range" value={`${campaign.age_min} - ${campaign.age_max}`} />
                  <Detail label="Currency" value={campaign.currency} />
                  <Detail label="Budget" value={String(campaign.budget)} />
                </div>
                {campaign.error_message && (
                  <div className="text-xs text-red-300 bg-red-500/10 rounded-lg p-3 mb-3 border border-red-400/15">
                    {campaign.error_message}
                  </div>
                )}
                {campaign.response_payload && (
                  <pre className="bg-ink-950/80 border border-white/8 rounded-lg p-3 text-xs text-brand-100 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
                    {JSON.stringify(campaign.response_payload, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  if (status === 'success') {
    return (
      <span className="status-badge bg-emerald2-500/15 text-emerald-300 border border-emerald2-400/20">
        <CheckCircle2 className="w-3.5 h-3.5" />
        نجح
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="status-badge bg-red-500/15 text-red-300 border border-red-400/20">
        <XCircle className="w-3.5 h-3.5" />
        فشل
      </span>
    );
  }
  return (
    <span className="status-badge bg-amber-500/15 text-amber-300 border border-amber-400/20">
      <Loader2 className="w-3.5 h-3.5" />
      معلق
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500 block">{label}</span>
      <span className="text-slate-200 font-medium truncate block">{value}</span>
    </div>
  );
}
