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
      {/* 帯色メインヘッダー */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-12 pb-24 rounded-b-[60px] shadow-2xl relative overflow-hidden transition-all duration-700`}>
        <div className="absolute top-0 right-0 opacity-[0.08] text-[14rem] font-black italic -mr-20 -mt-16 pointer-events-none select-none">
          {theme.name.slice(0,1)}
        </div>
        
        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60">Seikukai Portal</p>
              <div className="flex items-center gap-4">
                <h1 className="text-4xl font-black tracking-tighter leading-none">{profile.name}</h1>
                <div className={`${theme.badge} px-4 py-2 rounded-2xl shadow-lg flex flex-col items-center justify-center min-w-[70px] border border-white/20 backdrop-blur-sm`}>
                  <span className="text-[9px] font-black uppercase leading-none mb-1 opacity-80">{theme.name}</span>
                  <span className="text-xl font-black leading-none tracking-tighter">{profile.kyu || '無級'}</span>
                </div>
              </div>
            </div>
            
            {/* 文字ボタンに変更した設定・ログアウトエリア */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={handlePasswordChange} 
                className="px-3 py-1.5 bg-black/5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-inner hover:bg-black/10 transition-all border border-white/10"
              >
                Pass
              </button>
              <button 
                onClick={() => supabase.auth.signOut()} 
                className="px-3 py-1.5 bg-black/5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-inner hover:bg-red-500/20 text-red-600 transition-all border border-white/10"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-14 relative z-20 max-w-md mx-auto">
        {/* スコアカード */}
        <div className="bg-white rounded-[40px] p-8 shadow-2xl shadow-gray-200/50 border border-white mb-10">
          <div className="flex justify-between items-end mb-8">
            <div>
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-2 italic">Current Score</p>
              <div className="flex items-baseline">
                <span className="text-6xl font-black tracking-tighter text-[#001f3f]">{totalScore}</span>
                <span className="text-lg font-black opacity-10 ml-2">/ 100</span>
              </div>
            </div>
            {isEligible ? (
              <div className="bg-[#001f3f] text-white px-5 py-2.5 rounded-2xl font-black text-[11px] animate-bounce shadow-xl uppercase tracking-tighter">
                審査可能
              </div>
            ) : (
              <div className="text-right pb-1">
                <p className="text-[11px] font-black text-orange-500 mb-0.5 tracking-tighter italic">あと {80 - totalScore}点</p>
                <div className="w-16 h-1.5 bg-gray-50 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(totalScore/80)*100}%` }}></div>
                </div>
              </div>
            )}
          </div>
          <div className="relative h-4 bg-gray-50 rounded-full overflow-hidden shadow-inner p-1">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${isEligible ? 'bg-green-500' : 'bg-[#001f3f]'}`}
              style={{ width: `${Math.min((totalScore / 100) * 100, 100)}%` }}
            ></div>
            <div className="absolute left-[80%] top-0 w-0.5 h-full bg-white/40"></div>
          </div>
        </div>

        <div className="flex items-center justify-between px-2 mb-6">
          <h2 className="font-black text-[11px] text-gray-400 uppercase tracking-[0.3em] italic opacity-80">
            Examination List
          </h2>
        </div>
        
        <div className="space-y-4">
          {currentCriteria.map((c) => (
            <div key={c.id} className="bg-white rounded-[32px] p-5 shadow-sm border border-gray-50 hover:shadow-xl transition-all duration-300 group">
              <div className="flex items-start gap-4">
                <div className={`shrink-0 w-14 h-14 rounded-[20px] flex items-center justify-center font-black text-xl border-2 transition-all ${
                  c.grade === 'A' ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-lg shadow-orange-100' : 
                  c.grade === 'B' ? 'bg-slate-50 border-slate-800 text-slate-800' :
                  c.grade ? 'bg-gray-50 border-gray-100 text-gray-300' : 
                  'bg-white border-dashed border-gray-100 text-gray-100'
                }`}>
                  {c.grade || '-'}
                </div>

                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1 leading-none">{c.examination_type || '審査'}</p>
                  <p className="text-[14px] font-bold text-[#001f3f] leading-[1.4] break-words">{c.examination_content}</p>
                </div>
              </div>

              {c.video_url && (
                <div className="mt-4 pt-4 border-t border-gray-50 flex flex-wrap gap-2">
                  {c.video_url
                    .split(/[\s,\n]+/)
                    .map((url: string) => url.trim().replace(/^"|"$/g, ''))
                    .filter((url: string) => url.startsWith('http'))
                    .map((url: string, index: number) => (
                      <a 
                        key={index}
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-90 border border-red-100"
                      >
                        <span className="text-[10px] font-black uppercase">Play</span>
                      </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
