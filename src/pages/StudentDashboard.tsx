import { useEffect, useState, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

// 期間計算ユーティリティ
const calculateTrainingPeriod = (joinedDateStr: any) => {
  if (!joinedDateStr) return '未設定';
  const start = new Date(joinedDateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  if (years === 0) return `${months}ヶ月`;
  return `${years}年 ${months}ヶ月`;
};

const getBeltTheme = (kyu: string, isGeneral: boolean) => {
  const k = kyu || '無級';
  if (k === '無級' || k.includes('10級')) return { name: '白帯', bg: 'bg-white', text: 'text-black', badge: 'bg-black/10 text-black/40' };
  if (k.match(/10|9/)) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-950', badge: 'bg-black/20 text-yellow-900' };
  if (k.match(/8|7/)) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white', badge: 'bg-white/20 text-white' };
  if (k.match(/6|5/)) {
    const name = isGeneral ? '紫帯' : '橙帯';
    return { name, bg: isGeneral ? 'bg-purple-600' : 'bg-orange-500', text: 'text-white', badge: 'bg-white/20 text-white' };
  }
  if (k.match(/4|3/)) return { name: '緑帯', bg: 'bg-green-600', text: 'text-white', badge: 'bg-white/20 text-white' };
  if (k.match(/2|1/)) return { name: '茶帯', bg: 'bg-[#5D4037]', text: 'text-white', badge: 'bg-white/20 text-white' };
  return { name: '黒帯', bg: 'bg-black', text: 'text-white', badge: 'bg-white/20 text-white' };
}

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [historyData, setHistoryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'current' | 'history'>('current')

  const isGeneral = useMemo(() => {
    const birthDate = new Date(profile.birthday || '');
    const today = new Date();
    return (today.getFullYear() - birthDate.getFullYear()) >= 15;
  }, [profile.birthday]);

  const theme = useMemo(() => getBeltTheme(profile.kyu || '無級', isGeneral), [profile.kyu, isGeneral]);
  const trainingPeriod = useMemo(() => calculateTrainingPeriod((profile as any).joined_at), [profile]);

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const targetBelt = (theme.name === '橙帯' || theme.name === '紫帯') ? '橙帯/紫帯' : theme.name;
      const { data: criteriaData } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id');
      const { data: scoresData } = await supabase.from('evaluations').select('*, criteria(*)').eq('student_id', profile.id).order('updated_at', { ascending: false });

      setCurrentCriteria((criteriaData || []).map(c => ({
        ...c,
        grade: scoresData?.find(s => s.criterion_id === c.id)?.grade || null
      })))
      setHistoryData(scoresData || [])
      setLoading(false)
    }
    loadData()
  }, [profile.id, theme.name])

  const totalScore = currentCriteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0);

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic animate-pulse">LOADING...</div>

  return (
    <div className="min-h-screen bg-black pb-12 text-white font-sans overflow-y-auto no-scrollbar">
      {/* HEADER */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-12 pb-20 rounded-b-[60px] relative shadow-2xl transition-all duration-500`}>
        <div className="absolute top-0 right-0 opacity-10 text-[10rem] font-black italic -mr-10 -mt-10 select-none pointer-events-none">
          {theme.name.slice(0,1)}
        </div>
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50 mb-1">Seikukai Portal</p>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase mb-4">{profile.name}</h1>
          <div className="flex gap-2">
            <div className={`${theme.badge} px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm`}>{profile.kyu || '無級'}</div>
            <div className="bg-black/10 px-4 py-2 rounded-xl font-black text-xs opacity-70 border border-black/5">修行: {trainingPeriod}</div>
          </div>
        </div>
      </div>

      <div className="px-6 -mt-10 relative z-20">
        {/* SCORE CARD */}
        <div className="bg-[#111] border border-white/10 rounded-[40px] p-6 shadow-2xl mb-8">
          <div className="flex bg-white/5 p-1 rounded-2xl mb-6 border border-white/5">
            <button onClick={() => setViewMode('current')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'current' ? 'bg-white text-black shadow-lg' : 'text-white/40'}`}>Current</button>
            <button onClick={() => setViewMode('history')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'history' ? 'bg-white text-black shadow-lg' : 'text-white/40'}`}>History</button>
          </div>

          {viewMode === 'current' ? (
            <div className="text-center">
              <p className="text-6xl font-black italic leading-none text-white tracking-tighter">{totalScore.toFixed(0)}<span className="text-sm opacity-20 not-italic ml-1 font-bold">/100</span></p>
              <div className="mt-6 h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full transition-all duration-1000 ${totalScore >= 80 ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-orange-500'}`} style={{ width: `${Math.min(totalScore, 100)}%` }}></div>
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">Items Evaluated</p>
              <p className="text-3xl font-black italic tracking-tighter">{historyData.length} RECORDS</p>
            </div>
          )}
        </div>

        {/* LIST AREA */}
        <div className="space-y-3">
          {viewMode === 'current' ? (
            currentCriteria.map(c => (
              <div key={c.id} className="bg-[#111] border border-white/5 p-5 rounded-[30px] flex items-center gap-4 group hover:border-white/20 transition-all active:scale-95">
                <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl border-2 transition-all ${c.grade === 'A' ? 'border-orange-500 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'border-white/10 text-white/10'}`}>
                  {c.grade || '-'}
                </div>
                <div className="flex-1">
                  <span className="text-[8px] font-black text-white/30 uppercase block mb-0.5 tracking-[0.2em]">{c.examination_type}</span>
                  <p className="text-sm font-bold leading-tight text-white/90">{c.examination_content}</p>
                </div>
                {c.video_url && <a href={c.video_url} target="_blank" rel="noreferrer" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-orange-500 hover:text-black transition-all">▶️</a>}
              </div>
            ))
          ) : (
            historyData.map(h => (
              <div key={h.id} className="bg-[#111] border-l-4 border-orange-500 p-5 rounded-r-[30px] flex items-center gap-4 border border-white/5 border-l-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center font-black text-lg text-white/80">{h.grade}</div>
                <div>
                  <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest">{h.criteria?.dan || '過去の級'}</p>
                  <p className="text-sm font-bold text-white/80 leading-tight">{h.criteria?.examination_content}</p>
                  <p className="text-[8px] font-black text-white/20 uppercase mt-1 tracking-tighter">{new Date(h.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
