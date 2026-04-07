import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'

const getBeltTheme = (kyu: string) => {
  if (!kyu || kyu === '無級') return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200' };
  if (kyu.includes('10級') || kyu.includes('9級')) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-900', border: 'border-yellow-500' };
  if (kyu.includes('8級') || kyu.includes('7級')) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700' };
  if (kyu.includes('6級') || kyu.includes('5級')) return { name: '橙・紫帯', bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600' };
  if (kyu.includes('4級') || kyu.includes('3級')) return { name: '緑帯', bg: 'bg-green-600', text: 'text-white', border: 'border-green-700' };
  if (kyu.includes('2級') || kyu.includes('1級')) return { name: '茶帯', bg: 'bg-amber-900', text: 'text-white', border: 'border-amber-950' };
  if (kyu.includes('段')) return { name: '黒帯', bg: 'bg-gray-900', text: 'text-white', border: 'border-black' };
  return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200' };
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

  if (loading) return <div className="flex justify-center py-20 animate-pulse text-gray-300 font-black tracking-[0.2em]">LOADING...</div>

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-12 text-[#001f3f]">
      {/* 帯色メインヘッダー */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-12 pb-20 rounded-b-[60px] shadow-2xl relative overflow-hidden transition-all duration-700`}>
        <div className="absolute top-0 right-0 opacity-[0.07] text-[12rem] font-black italic -mr-16 -mt-10 pointer-events-none select-none">
          {theme.name.slice(0,1)}
        </div>
        
        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60 mb-2">Seikukai Portal</p>
              <h1 className="text-4xl font-black tracking-tighter mb-4 leading-none">{profile.name}</h1>
              <div className="inline-flex items-center bg-black/10 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <span className="text-[11px] font-black uppercase tracking-wider">{profile.kyu || '無級'} 保持</span>
              </div>
            </div>
            {/* 設定・ログアウト */}
            <div className="flex gap-4">
              <button onClick={handlePasswordChange} className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 bg-black/5 rounded-2xl flex items-center justify-center text-xl shadow-inner group-hover:bg-black/10 transition-all">⚙️</div>
                <span className="text-[8px] font-black uppercase opacity-60">設定</span>
              </button>
              <button onClick={() => supabase.auth.signOut()} className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 bg-black/5 rounded-2xl flex items-center justify-center text-xl shadow-inner group-hover:bg-red-500/20 transition-all">🚪</div>
                <span className="text-[8px] font-black uppercase opacity-60">ログアウト</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-12 relative z-20 max-w-md mx-auto">
        {/* スコア・プログレスカード */}
        <div className="bg-white rounded-[40px] p-8 shadow-2xl shadow-gray-200/50 border border-white mb-10">
          <div className="flex justify-between items-end mb-8">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Score</p>
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
                <p className="text-[11px] font-black text-orange-500 mb-0.5 tracking-tighter">合格まであと {80 - totalScore}点</p>
                <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${(totalScore/80)*100}%` }}></div>
                </div>
              </div>
            )}
          </div>
          {/* プログレスバー（合格ライン視覚化） */}
          <div className="relative h-3 bg-gray-50 rounded-full overflow-hidden shadow-inner">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out ${isEligible ? 'bg-green-500' : 'bg-[#001f3f]'}`}
              style={{ width: `${Math.min((totalScore / 100) * 100, 100)}%` }}
            ></div>
            {/* 80点の目印 */}
            <div className="absolute left-[80%] top-0 w-0.5 h-full bg-white/50"></div>
          </div>
        </div>

        {/* 審査項目セクション */}
        <div className="flex items-center justify-between px-2 mb-6">
          <h2 className="font-black text-[11px] text-gray-400 uppercase tracking-[0.3em] italic">
            {theme.name} Examination
          </h2>
          <span className="text-[9px] font-bold text-gray-300">{currentCriteria.length} Items</span>
        </div>
        
        <div className="space-y-4">
          {currentCriteria.map((c) => (
            <div key={c.id} className="bg-white rounded-[32px] p-6 flex items-center gap-5 shadow-sm border border-gray-50 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 group">
              {/* 評価 A-D */}
              <div className={`shrink-0 w-16 h-16 rounded-[24px] flex items-center justify-center font-black text-2xl border-2 transition-all ${
                c.grade === 'A' ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-lg shadow-orange-100' : 
                c.grade === 'B' ? 'bg-slate-50 border-slate-800 text-slate-800' :
                c.grade ? 'bg-gray-50 border-gray-100 text-gray-300' : 
                'bg-white border-dashed border-gray-100 text-gray-100'
              }`}>
                {c.grade || '-'}
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1.5 leading-none">{c.examination_type || '基本項目'}</p>
                <p className="text-[15px] font-bold text-[#001f3f] leading-[1.4] break-words transition-colors">{c.examination_content}</p>
              </div>

              {/* 動画リンク（あるものだけ表示） */}
              {c.video_url && (
                <a 
                  href={c.video_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="shrink-0 w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
