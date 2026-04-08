import { useEffect, useState, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'current' | 'history'>('current')
  const [loading, setLoading] = useState(true)

  const trainingPeriod = useMemo(() => {
    const start = new Date((profile as any).joined_at || '');
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365);
    const months = Math.floor((diffDays % 365) / 30);
    return years === 0 ? `${months}ヶ月` : `${years}年 ${months}ヶ月`;
  }, [profile]);

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const k = profile.kyu || '無級';
      let target = '白帯';
      if (k.match(/10|9/)) target = '黄帯';
      else if (k.match(/8|7/)) target = '青帯';
      else if (k.match(/6|5/)) target = '橙帯/紫帯';
      else if (k.match(/4|3/)) target = '緑帯';
      else if (k.match(/2|1/)) target = '茶帯';
      else if (k.match(/段/)) target = '黒帯';

      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', target).order('id');
      const { data: evals } = await supabase.from('evaluations').select('*, criteria(*)').eq('student_id', profile.id).order('updated_at', { ascending: false });

      setCurrentCriteria((crit || []).map(c => ({
        ...c,
        grade: evals?.find(e => e.criterion_id === c.id)?.grade || null
      })));
      setLoading(false)
    }
    loadData()
  }, [profile]);

  const totalScore = currentCriteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0);

  if (loading) return <div className="h-full bg-white flex items-center justify-center font-black text-gray-100 italic">LOADING...</div>

  return (
    <div className="min-h-screen bg-white text-[#001f3f] font-sans pb-10">
      {/* 白ベースのヘッダー */}
      <div className="px-8 pt-16 pb-12 bg-white rounded-b-[60px] relative border-b border-gray-50 shadow-sm">
        <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2">Seikukai Portal</p>
        <h1 className="text-4xl font-black tracking-tighter mb-6 italic">{profile.name}</h1>
        <div className="flex gap-3">
          <div className="bg-[#001f3f] text-white px-5 py-2 rounded-2xl text-[10px] font-black uppercase">{profile.kyu || '無級'}</div>
          <div className="bg-gray-100 text-gray-400 px-5 py-2 rounded-2xl text-[10px] font-black uppercase">修行: {trainingPeriod}</div>
        </div>
      </div>

      <div className="px-6 -mt-8 relative z-10">
        {/* メインスコアカード */}
        <div className="bg-white rounded-[40px] p-8 shadow-2xl shadow-gray-200/60 border border-white">
          <div className="flex bg-gray-50 p-1 rounded-2xl mb-8">
            <button onClick={() => setViewMode('current')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'current' ? 'bg-white text-[#001f3f] shadow-sm' : 'text-gray-400'}`}>Current</button>
            <button onClick={() => setViewMode('history')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'history' ? 'bg-white text-[#001f3f] shadow-sm' : 'text-gray-400'}`}>History</button>
          </div>

          <div className="text-center">
            <p className="text-7xl font-black tracking-tighter leading-none mb-2">{totalScore.toFixed(0)}</p>
            <div className="h-2 bg-gray-50 rounded-full overflow-hidden mt-6">
              <div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${Math.min(totalScore, 100)}%` }}></div>
            </div>
          </div>
        </div>

        {/* 以前の白いリスト表示 */}
        <div className="mt-10 space-y-4">
          {currentCriteria.map(c => (
            <div key={c.id} className="bg-white p-5 rounded-[30px] flex items-center gap-5 border border-gray-50 shadow-sm transition-all active:scale-95">
              <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl ${c.grade ? 'bg-orange-500 text-white shadow-lg' : 'bg-gray-50 text-gray-200'}`}>
                {c.grade || '-'}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-black text-gray-300 uppercase block mb-1">{c.examination_type}</span>
                <p className="text-sm font-bold text-[#001f3f] leading-snug">{c.examination_content}</p>
              </div>
              {c.video_url && <span className="text-orange-500 font-black text-xs">▶︎</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
