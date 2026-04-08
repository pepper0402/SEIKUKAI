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
  if (k.match(/10|9/)) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-900', badge: 'bg-yellow-500 text-white' };
  if (k.match(/8|7/)) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white', badge: 'bg-blue-800 text-white' };
  if (k.match(/6|5/)) {
    const name = isGeneral ? '紫帯' : '橙帯';
    return { name, bg: isGeneral ? 'bg-purple-600' : 'bg-orange-500', text: 'text-white', badge: 'bg-white/20 text-white' };
  }
  if (k.match(/4|3/)) return { name: '緑帯', bg: 'bg-green-600', text: 'text-white', badge: 'bg-green-800 text-white' };
  if (k.match(/2|1/)) return { name: '茶帯', bg: 'bg-amber-900', text: 'text-white', badge: 'bg-amber-950 text-white' };
  return { name: '黒帯', bg: 'bg-gray-900', text: 'text-white', badge: 'bg-black text-white' };
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

  if (loading) return <div className="p-20 text-center font-black animate-pulse">LOADING...</div>

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-12 text-[#001f3f]">
      <div className={`${theme.bg} ${theme.text} px-6 pt-10 pb-20 rounded-b-[50px] shadow-2xl relative`}>
        <div className="relative z-10 max-w-md mx-auto flex justify-between items-start">
          <div>
            <p className="text-[9px] font-black uppercase opacity-60">Student Portal</p>
            <h1 className="text-3xl font-black tracking-tighter mb-2">{profile.name}</h1>
            <div className="flex gap-2">
              <div className={`${theme.badge} px-3 py-1.5 rounded-xl font-black text-xs`}>{profile.kyu || '無級'}</div>
              <div className="bg-black/5 px-3 py-1.5 rounded-xl font-black text-xs">修行: {trainingPeriod}</div>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="px-4 py-2 bg-black/5 rounded-xl text-[10px] font-black">LOGOUT</button>
        </div>
      </div>

      <div className="px-5 -mt-10 relative z-20 max-w-md mx-auto">
        <div className="bg-white rounded-[35px] p-4 shadow-xl mb-6">
          <div className="flex bg-gray-100 p-1 rounded-2xl mb-4">
            <button onClick={() => setViewMode('current')} className={`flex-1 py-2 rounded-xl text-[10px] font-black ${viewMode === 'current' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>現在の審査</button>
            <button onClick={() => setViewMode('history')} className={`flex-1 py-2 rounded-xl text-[10px] font-black ${viewMode === 'history' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>履歴</button>
          </div>
          {viewMode === 'current' && (
            <div className="text-center">
              <p className="text-5xl font-black">{totalScore.toFixed(0)}<span className="text-sm opacity-20">/100</span></p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#001f3f]" style={{ width: `${totalScore}%` }}></div></div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {viewMode === 'current' ? (
            currentCriteria.map(c => (
              <div key={c.id} className="bg-white rounded-[25px] p-4 shadow-sm flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black border-2 ${c.grade === 'A' ? 'border-orange-500 text-orange-500' : 'border-gray-100 text-gray-200'}`}>{c.grade || '-'}</div>
                <div className="flex-1">
                  <p className="text-[8px] font-black text-gray-300 uppercase">{c.examination_type}</p>
                  <p className="text-xs font-bold leading-tight">{c.examination_content}</p>
                </div>
              </div>
            ))
          ) : (
            historyData.map(h => (
              <div key={h.id} className="bg-white rounded-[25px] p-4 shadow-sm flex items-center gap-4 border-l-4 border-orange-500">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center font-black">{h.grade}</div>
                <div>
                  <p className="text-[8px] font-black text-orange-500 uppercase">{h.criteria?.dan}</p>
                  <p className="text-xs font-bold">{h.criteria?.examination_content}</p>
                  <p className="text-[7px] text-gray-300 font-black">{new Date(h.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
