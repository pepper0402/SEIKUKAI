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

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'current' | 'history'>('current')
  const [loading, setLoading] = useState(true)

  const trainingPeriod = useMemo(() => calculateTrainingPeriod((profile as any).joined_at), [profile]);

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

  if (loading) return <div className="h-full bg-white flex items-center justify-center font-bold text-gray-200 italic">SEIKUKAI...</div>

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-800 font-sans pb-10">
      {/* 以前の白いヘッダー */}
      <div className="px-6 pt-12 pb-16 bg-white rounded-b-[48px] shadow-sm border-b border-gray-50 relative">
        <div className="absolute top-8 right-8 w-16 h-16 bg-orange-500 rounded-2xl rotate-12 opacity-10"></div>
        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Grade Status</p>
        <h1 className="text-3xl font-black italic tracking-tighter mb-4">{profile.name}</h1>
        <div className="flex gap-3">
          <div className="bg-slate-900 text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase">{profile.kyu || '無級'}</div>
          <div className="bg-gray-100 text-slate-500 px-4 py-1.5 rounded-full text-[10px] font-bold">修行: {trainingPeriod}</div>
        </div>
      </div>

      <div className="px-5 -mt-8 relative z-10">
        {/* スコア・トグルカード */}
        <div className="bg-white rounded-[32px] p-6 shadow-xl shadow-gray-200/40 border border-white">
          <div className="flex bg-gray-50 p-1 rounded-2xl mb-6 border border-gray-100">
            <button onClick={() => setViewMode('current')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold transition-all ${viewMode === 'current' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-400'}`}>現在の審査</button>
            <button onClick={() => setViewMode('history')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold transition-all ${viewMode === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-400'}`}>履歴</button>
          </div>

          <div className="text-center">
            <p className="text-6xl font-black text-slate-800 tracking-tighter leading-none mb-1">{totalScore.toFixed(0)}</p>
            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">Total Score Points</p>
            <div className="mt-6 h-2 bg-gray-50 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${Math.min(totalScore, 100)}%` }}></div>
            </div>
          </div>
        </div>

        {/* 以前の白いリストデザイン */}
        <div className="mt-8 space-y-3">
          {currentCriteria.map(c => (
            <div key={c.id} className="bg-white p-4 rounded-[24px] flex items-center gap-4 border border-gray-50 shadow-sm transition-all active:scale-[0.98]">
              <div className={`shrink-0 w-12 h-12 rounded-[16px] flex items-center justify-center font-bold text-xl ${c.grade ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-gray-50 text-gray-200'}`}>
                {c.grade || '-'}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[8px] font-bold text-gray-300 uppercase block mb-0.5">{c.examination_type}</span>
                <p className="text-sm font-bold text-slate-700 leading-tight">{c.examination_content}</p>
              </div>
              {c.video_url && <span className="text-orange-500 text-xs">▶︎</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
