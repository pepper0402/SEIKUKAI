import { useEffect, useState, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

// 期間計算ユーティリティ（修行年数用）
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

const calculateAge = (birthdayStr: any) => {
  if (!birthdayStr) return 0;
  const birthDate = new Date(birthdayStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

const getBeltTheme = (kyu: string, isGeneral: boolean) => {
  const k = kyu || '無級';
  if (k === '無級' || k.includes('準10級')) return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', badge: 'bg-gray-100 text-gray-500' };
  if (k.includes('10級') || k.includes('9級')) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-900', badge: 'bg-yellow-500 text-white' };
  if (k.includes('8級') || k.includes('7級')) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white', badge: 'bg-blue-800 text-white' };
  if (k.includes('6級') || k.includes('5級')) {
    const name = isGeneral ? '紫帯' : '橙帯';
    return { name, bg: isGeneral ? 'bg-purple-600' : 'bg-orange-500', text: 'text-white', badge: 'bg-white/20 text-white' };
  }
  if (k.includes('4級') || k.includes('3級')) return { name: '緑帯', bg: 'bg-green-600', text: 'text-white', badge: 'bg-green-800 text-white' };
  if (k.includes('2級') || k.includes('1級')) return { name: '茶帯', bg: 'bg-amber-900', text: 'text-white', badge: 'bg-amber-950 text-white' };
  if (k.includes('段')) return { name: '黒帯', bg: 'bg-gray-900', text: 'text-white', badge: 'bg-black text-white' };
  return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', badge: 'bg-gray-100 text-gray-400' };
}

const gradeToScore = (grade: string | null) => {
  if (grade === 'A') return 2.5;
  if (grade === 'B') return 1.5;
  if (grade === 'C') return 0.5;
  return 0;
};

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [historyData, setHistoryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'current' | 'history'>('current')

  const isGeneral = useMemo(() => calculateAge(profile.birthday) >= 15, [profile.birthday]);
  const theme = useMemo(() => getBeltTheme(profile.kyu || '無級', isGeneral), [profile.kyu, isGeneral]);
  const trainingPeriod = useMemo(() => calculateTrainingPeriod((profile as any).joined_at), [profile]);

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const targetBelt = (theme.name === '橙帯' || theme.name === '紫帯') ? '橙帯/紫帯' : theme.name;

      // 現在の基準
      const { data: criteriaData } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id');
      // 全評価（履歴用含む）
      const { data: scoresData } = await supabase.from('evaluations').select('*, criteria(*)').eq('student_id', profile.id);

      const combined = (criteriaData || []).map(c => ({
        ...c,
        grade: scoresData?.find(s => s.criterion_id === c.id)?.grade || null
      }));

      setCurrentCriteria(combined)
      setHistoryData(scoresData || [])
      setLoading(false)
    }
    loadData()
  }, [profile.id, theme.name])

  const totalScore = currentCriteria.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0);
  const isEligible = totalScore >= 80;

  if (loading) return <div className="flex justify-center py-20 animate-pulse text-gray-300 font-black tracking-widest">LOADING...</div>

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-12 text-[#001f3f]">
      {/* 帯色メインヘッダー */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-10 pb-20 rounded-b-[50px] shadow-2xl relative overflow-hidden transition-all duration-700`}>
        <div className="absolute top-0 right-0 opacity-[0.08] text-[12rem] font-black italic -mr-16 -mt-12 pointer-events-none select-none">
          {theme.name.slice(0,1)}
        </div>
        
        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-60">Seikukai Student Portal</p>
              <h1 className="text-3xl font-black tracking-tighter leading-none mb-2">{profile.name}</h1>
              <div className="flex gap-2">
                <div className={`${theme.badge} px-3 py-1.5 rounded-xl shadow-lg flex flex-col items-center justify-center min-w-[60px] border border-white/20 backdrop-blur-sm`}>
                  <span className="text-[8px] font-black uppercase leading-none mb-0.5 opacity-80">Grade</span>
                  <span className="text-lg font-black leading-none tracking-tighter">{profile.kyu || '無級'}</span>
                </div>
                <div className="bg-black/5 px-3 py-1.5 rounded-xl flex flex-col items-center justify-center border border-white/10 backdrop-blur-sm">
                  <span className="text-[8px] font-black uppercase leading-none mb-0.5 opacity-60">修行年数</span>
                  <span className="text-sm font-black leading-none">{trainingPeriod}</span>
                </div>
              </div>
            </div>
            
            <button onClick={() => supabase.auth.signOut()} className="px-4 py-2 bg-black/5 rounded-xl text-[10px] font-bold border border-white/10">ログアウト</button>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-10 relative z-20 max-w-md mx-auto">
        {/* スコア・切り替えカード */}
        <div className="bg-white rounded-[35px] p-6 shadow-2xl shadow-gray-200/50 border border-white mb-6">
          <div className="flex justify-between items-center mb-6">
             <div className="flex bg-gray-100 p-1 rounded-2xl w-full">
                <button 
                  onClick={() => setViewMode('current')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${viewMode === 'current' ? 'bg-white shadow-sm text-[#001f3f]' : 'text-gray-400'}`}
                >
                  現在の審査
                </button>
                <button 
                  onClick={() => setViewMode('history')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${viewMode === 'history' ? 'bg-white shadow-sm text-[#001f3f]' : 'text-gray-400'}`}
                >
                  過去の評価履歴
                </button>
             </div>
          </div>

          {viewMode === 'current' && (
            <>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1 italic">Current Progress</p>
                  <div className="flex items-baseline">
                    <span className="text-5xl font-black tracking-tighter text-[#001f3f] leading-none">{totalScore.toFixed(0)}</span>
                    <span className="text-sm font-black opacity-10 ml-1">/ 100</span>
                  </div>
                </div>
                {isEligible && (
                  <div className="bg-green-500 text-white px-3 py-1.5 rounded-lg font-black text-[9px] animate-bounce shadow-lg shadow-green-100">審査合格圏内</div>
                )}
              </div>
              <div className="relative h-2 bg-gray-50 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full transition-all duration-1000 ${isEligible ? 'bg-green-500' : 'bg-[#001f3f]'}`} style={{ width: `${Math.min(totalScore, 100)}%` }}></div>
              </div>
            </>
          )}

          {viewMode === 'history' && (
            <div className="text-center py-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">全評価取得数</p>
              <p className="text-2xl font-black">{historyData.length} <span className="text-[10px] opacity-30 italic font-bold">Items</span></p>
            </div>
          )}
        </div>

        {/* リストエリア */}
        <div className="space-y-3">
          {viewMode === 'current' ? (
            currentCriteria.map((c) => (
              <div key={c.id} className="bg-white rounded-[28px] p-4 shadow-sm border border-gray-50 flex items-center gap-4 group">
                <div className={`shrink-0 w-12 h-12 rounded-[18px] flex items-center justify-center font-black text-lg border-2 ${
                  c.grade === 'A' ? 'bg-orange-50 border-orange-500 text-orange-600' : 
                  c.grade === 'B' ? 'bg-slate-50 border-slate-800 text-slate-800' :
                  c.grade === 'C' ? 'bg-gray-50 border-gray-400 text-gray-600' : 'bg-white border-dashed border-gray-100 text-gray-100'
                }`}>
                  {c.grade || '-'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] font-black text-gray-300 uppercase leading-none mb-1">{c.examination_type}</p>
                  <p className="text-[13px] font-bold text-[#001f3f] leading-tight line-clamp-2">{c.examination_content}</p>
                </div>
                {c.video_url && (
                  <a href={c.video_url} target="_blank" rel="noreferrer" className="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex
