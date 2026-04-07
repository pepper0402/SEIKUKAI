import { useEffect, useState } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

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
  if (grade === 'D') return 0;
  return 0;
};

export default function StudentPortal({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isSettingsMode, setIsSettingsMode] = useState(false)
  
  const theme = getBeltTheme(profile.kyu)

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

  const totalScore = currentCriteria.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0);
  const isEligible = totalScore >= 80;

  if (loading) return <div className="flex justify-center py-20 text-gray-300 font-black animate-pulse">SEIKUKAI Loading...</div>

  // --- 設定画面（パスワード変更など） ---
  if (isSettingsMode) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 text-[#001f3f]">
        <button onClick={() => setIsSettingsMode(false)} className="mb-8 font-black text-[#ff6600] text-sm">← 戻る</button>
        <h2 className="text-2xl font-black mb-6">登録情報の変更</h2>
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
          <p className="text-xs text-gray-400 leading-relaxed">メールアドレスやパスワードの変更は、Supabaseのセキュリティ設定に基づき、送信される確認メールからのお手続きとなります。</p>
          <button 
            onClick={() => alert('パスワード再設定メールを送信しました（実装例）')}
            className="w-full bg-[#001f3f] text-white py-4 rounded-2xl font-black text-sm"
          >
            パスワードを変更する
          </button>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-full border-2 border-red-100 text-red-500 py-4 rounded-2xl font-black text-sm"
          >
            ログアウト
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-10 text-[#001f3f]">
      {/* 改善版ヘッダー */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-8 pb-16 rounded-b-[50px] shadow-xl relative overflow-hidden`}>
        {/* 見切れ防止のため位置とサイズを調整 */}
        <div className="absolute top-4 right-[-20px] opacity-[0.07] text-7xl font-black italic pointer-events-none whitespace-nowrap">
          {theme.name}
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-1">Seikukai Portal</p>
              <h1 className="text-3xl font-black tracking-tighter">{profile.name}</h1>
            </div>
            {/* 設定・ログアウトボタン */}
            <div className="flex gap-2">
              <button 
                onClick={() => setIsSettingsMode(true)}
                className="w-10 h-10 bg-black/5 backdrop-blur-md rounded-full flex items-center justify-center border border-black/5"
              >
                ⚙️
              </button>
              <button 
                onClick={() => supabase.auth.signOut()}
                className="w-10 h-10 bg-black/5 backdrop-blur-md rounded-full flex items-center justify-center border border-black/5"
              >
                🚪
              </button>
            </div>
          </div>
          <span className="bg-black/10 px-4 py-1.5 rounded-full text-[10px] font-black backdrop-blur-sm border border-white/10">
            {profile.kyu || '無級'}
          </span>
        </div>
      </div>

      <div className="px-5 -mt-10 relative z-20">
        {/* スコアカード（変更なし） */}
        <div className="bg-white rounded-[32px] p-6 shadow-2xl border border-white/50 mb-8">
          <div className="flex justify-between items-end mb-4 text-[#001f3f]">
            <div>
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Score</p>
              <p className="text-5xl font-black tracking-tighter">{totalScore}<span className="text-sm ml-1 opacity-20">/100</span></p>
            </div>
            {isEligible ? (
              <div className="bg-[#ff6600] text-white px-5 py-2.5 rounded-2xl font-black text-[10px] animate-bounce shadow-lg shadow-orange-200">審査可能！</div>
            ) : (
              <div className="text-right">
                <p className="text-[10px] font-black text-[#ff6600]">あと {80 - totalScore}点</p>
              </div>
            )}
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${isEligible ? 'bg-green-500' : 'bg-[#ff6600]'}`}
              style={{ width: `${Math.min(totalScore, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* 審査項目一覧（変更なし） */}
        <div className="space-y-3">
          {currentCriteria.map((c) => (
            <div key={c.id} className="bg-white rounded-[24px] p-4 flex items-center gap-4 shadow-sm border border-gray-100">
              <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl border-2 ${
                c.grade === 'A' ? 'bg-orange-50 border-[#ff6600] text-[#ff6600]' : 
                c.grade === 'B' ? 'bg-orange-50/50 border-orange-200 text-[#ff6600]/70' :
                c.grade ? 'bg-gray-50 border-gray-100 text-gray-400' : 
                'bg-white border-dashed border-gray-200 text-gray-200'
              }`}>
                {c.grade || '-'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-tighter mb-0.5">{c.examination_type}</p>
                <p className="text-sm font-bold text-[#001f3f] leading-tight">{c.examination_content}</p>
              </div>
              {c.video_url && (
                <a href={c.video_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center shadow-inner">
                  ▶
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
