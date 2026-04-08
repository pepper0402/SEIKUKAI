import { useEffect, useState, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

const calculateTrainingPeriod = (joinedDateStr: any) => {
  if (!joinedDateStr) return '未設定';
  const start = new Date(joinedDateStr);
  const now = new Date();
  const diffDays = Math.ceil(Math.abs(now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years === 0 ? `${months}ヶ月` : `${years}年 ${months}ヶ月`;
};

const getBeltTheme = (kyu: string, isGeneral: boolean) => {
  const k = kyu || '無級';
  if (k === '無級' || k.includes('10級')) return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', badge: 'bg-gray-100 text-gray-500' };
  if (k.match(/10|9/)) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-950', badge: 'bg-yellow-500/20 text-yellow-900' };
  if (k.match(/8|7/)) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white', badge: 'bg-blue-800 text-white' };
  if (k.match(/6|5/)) {
    const name = isGeneral ? '紫帯' : '橙帯';
    return { name, bg: isGeneral ? 'bg-purple-600' : 'bg-orange-500', text: 'text-white', badge: 'bg-white/20 text-white' };
  }
  if (k.match(/4|3/)) return { name: '緑帯', bg: 'bg-green-600', text: 'text-white', badge: 'bg-green-800 text-white' };
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
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age >= 15;
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

  if (loading) return <div className="h-screen bg-white flex items-center justify-center text-gray-300 font-black animate-pulse">LOADING...</div>

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-12 text-[#001f3f] font-sans">
      {/* HEADER */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-12 pb-20 rounded-b-[50px] relative shadow-xl overflow-hidden`}>
        <div className="absolute top-0 right-0 opacity-[0.05] text-[10rem] font-black italic -mr-10 -mt-10 select-none">
          {theme.name.slice(0,1)}
        </div>
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-1">Seikukai Portal</p>
          <h1 className="text-3xl font-black mb-4">{profile.name}</h1>
          <div className="flex gap-2">
            <div className={`${theme.badge} px-4 py-2 rounded-2xl font-black text-[10px] uppercase shadow-sm border border-black/5`}>{profile.kyu || '無級'}</div>
            <div className="bg-black/5 px-4 py-2 rounded-2xl font-black text-[10px] border border-black/5">修行: {trainingPeriod}</div>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-10 relative z-20">
        {/* SCORE CARD */}
        <div className="bg-white rounded-[35px] p-6 shadow-xl shadow-gray-200/50 border border-white mb-6">
          <div className="flex bg-gray-100 p-1 rounded-2xl mb-6">
            <button onClick={() => setViewMode('current')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'current' ? 'bg-white text-[#001f3f] shadow-sm' : 'text-gray-400'}`}>Current</button>
            <button onClick={() => setViewMode('history')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'history' ? 'bg-white text-[#001f3f] shadow-sm' : 'text-gray-400'}`}>History</button>
          </div>

          {viewMode === 'current' ? (
            <div className="text-center">
              <p className="text-5xl font-black text-[#001f3f] leading-none">{totalScore.toFixed(0)}<span className="text-xs opacity-20 ml-1">/100</span></p>
              <div className="mt-5 h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full transition-all duration-1000 ${totalScore >= 80 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(totalScore, 100)}%` }}></div>
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-[10px] font-black text-orange-500 uppercase mb-1">Total Records</p>
              <p className="text-3xl font-black">{historyData.length} 件</p>
            </div>
          )}
        </div>

        {/* LIST */}
        <div className="space-y-3">
          {viewMode === 'current' ? (
            currentCriteria.map(c => (
              <div key={c.id} className="bg-white p-4 rounded-[28px] flex items-center gap-4 border border-white shadow-sm hover:shadow-md transition-all active:scale-95">
                <div className={`shrink-0 w-12 h-12 rounded-[18px] flex items-center justify-center font-black text-lg border-2 ${c.grade ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-50 text-gray-200'}`}>
                  {c.grade || '-'}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] font-black text-gray-300 uppercase block mb-0.5">{c.examination_type}</span>
                  <p className="text-sm font-bold leading-tight line-clamp-2">{c.examination_content}</p>
                </div>
                {c.video_url && <a href={c.video_url} target="_blank" rel="noreferrer" className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-100 transition-all">▶️</a>}
              </div>
            ))
          ) : (
            historyData.map(h => (
              <div key={h.id} className="bg-white p-5 rounded-[28px] flex items-center gap-4 border border-white shadow-sm border-l-4 border-l-orange-500">
                <div className="w-12 h-12 rounded-[18px] bg-gray-50 flex items-center justify-center font-black text-lg text-gray-600 border border-gray-100">{h.grade}</div>
                <div>
                  <p className="text-[8px] font-black text-orange-500 uppercase">{h.criteria?.dan || '過去の評価'}</p>
                  <p className="text-sm font-bold text-[#001f3f] leading-tight">{h.criteria?.examination_content}</p>
                  <p className="text-[8px] font-black text-gray-300 uppercase mt-1">{new Date(h.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
