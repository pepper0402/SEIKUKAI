import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'

const getBeltTheme = (kyu: string) => {
  const k = kyu || '無級';
  if (k === '無級' || k.includes('準10級')) return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', badge: 'bg-gray-100 text-gray-500' };
  if (k.includes('10級') || k.includes('9級')) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-900', badge: 'bg-yellow-500 text-white' };
  if (k.includes('8級') || k.includes('7級')) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white', badge: 'bg-blue-800 text-white' };
  if (k.includes('6級') || k.includes('5級')) return { name: '橙・紫帯', bg: 'bg-orange-500', text: 'text-white', badge: 'bg-orange-700 text-white' };
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
  const [loading, setLoading] = useState(true)
  const theme = getBeltTheme(profile.kyu || '無級')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const { data: criteriaData } = await supabase
        .from('criteria')
        .select('*')
        .eq('dan', theme.name.split('・')[0])
        .order('id', { ascending: true })

      const { data: scoresData } = await supabase
        .from('evaluations')
        .select('*')
        .eq('student_id', profile.id)

      const combined = (criteriaData || []).map(c => ({
        ...c,
        grade: scoresData?.find(s => s.criterion_id === c.id)?.grade || null
      }));

      setCurrentCriteria(combined)
      setLoading(false)
    }
    loadData()
  }, [profile.id, theme.name])

  const handlePasswordChange = async () => {
    const newPassword = window.prompt('新しいパスワードを入力してください（6文字以上）')
    if (!newPassword || newPassword.length < 6) {
      if (newPassword) alert('パスワードは6文字以上必要です')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) alert('エラー: ' + error.message)
    else alert('パスワードを更新しました')
  }

  const totalScore = currentCriteria.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0);
  const isEligible = totalScore >= 80;

  if (loading) return <div className="flex justify-center py-20 animate-pulse text-gray-300 font-black tracking-widest">LOADING...</div>

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-12 text-[#001f3f]">
      {/* 帯色メインヘッダー（ボタン付き） */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-10 pb-20 rounded-b-[50px] shadow-2xl relative overflow-hidden`}>
        <div className="absolute top-0 right-0 opacity-[0.08] text-[12rem] font-black italic -mr-16 -mt-12 pointer-events-none select-none">
          {theme.name.slice(0,1)}
        </div>
        
        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-60">Seikukai Portal</p>
              <h1 className="text-3xl font-black tracking-tighter leading-none mb-4">{profile.name}</h1>
              <div className="flex gap-2">
                <div className={`${theme.badge} px-3 py-1 rounded-xl text-[10px] font-black uppercase border border-white/20`}>
                  {profile.kyu || '無級'}
                </div>
              </div>
            </div>
            
            {/* 設定・ログアウトボタン */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={handlePasswordChange} 
                className="px-4 py-1.5 bg-black/5 hover:bg-black/10 rounded-xl text-[10px] font-bold border border-white/10 transition-all"
              >
                設定
              </button>
              <button 
                onClick={() => supabase.auth.signOut()} 
                className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-xl text-[10px] font-bold border border-white/10 transition-all"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-10 relative z-20 max-w-md mx-auto">
        {/* スコアカード */}
        <div className="bg-white rounded-[35px] p-6 shadow-2xl shadow-gray-200/50 border border-white mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1 italic">Current Score</p>
              <div className="flex items-baseline">
                <span className="text-5xl font-black tracking-tighter">{totalScore}</span>
                <span className="text-sm font-black opacity-10 ml-1">/ 100</span>
              </div>
            </div>
            {isEligible && (
              <div className="bg-orange-500 text-white px-4 py-2 rounded-xl font-black text-[10px] animate-bounce uppercase">審査可能</div>
            )}
          </div>
          <div className="h-3 bg-gray-50 rounded-full overflow-hidden p-0.5">
            <div className="h-full bg-[#001f3f] rounded-full transition-all duration-1
