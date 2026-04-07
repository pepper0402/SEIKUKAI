import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const targetBelt = getTargetBelt(profile.kyu || '無級')
  // 帯に応じたテーマカラー設定
  const theme = getTheme(targetBelt)

  useEffect(() => {
    async function fetchMyEvals() {
      try {
        setLoading(true)
        const { data: crit } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id')
        const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', profile.id)

        if (crit) {
          const merged = crit.map(c => ({
            ...c,
            grade: evals?.find(e => e.criterion_id === c.id)?.grade || '-'
          }))
          setCriteria(merged)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchMyEvals()
  }, [profile.id, targetBelt])

  const handlePasswordChange = async () => {
    const newPassword = window.prompt('新しいパスワードを入力してください（6文字以上）')
    if (!newPassword) return
    if (newPassword.length < 6) {
      alert('パスワードは6文字以上で入力してください')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) alert('エラー: ' + error.message)
    else alert('パスワードを更新しました')
  }

  const totalScore = criteria.reduce((acc, curr) => {
    const score = curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0
    return acc + score
  }, 0)

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-[#001f3f] pb-10">
      {/* ヘッダー部分 */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-10 pb-16 rounded-b-[50px] shadow-xl relative overflow-hidden`}>
        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-black tracking-tighter">{profile.name}</h1>
              <span className="bg-black/10 px-3 py-1 rounded-full text-[12px] font-black backdrop-blur-sm border border-white/10">
                {targetBelt}
              </span>
            </div>
            <div className="flex gap-3">
              <button onClick={handlePasswordChange} className="flex flex-col items-center gap-1 opacity-70 hover:opacity-100 transition-all">
                <div className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center text-lg">⚙️</div>
                <span className="text-[8px] font-black uppercase">設定</span>
              </button>
              <button onClick={() => supabase.auth.signOut()} className="flex flex-col items-center gap-1 opacity-70 hover:opacity-100 transition-all">
                <div className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center text-lg">🚪</div>
                <span className="text-[8px] font-black uppercase">ログアウト</span>
              </button>
            </div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">
            {profile.kyu || '無級'} 保持
          </p>
        </div>
        {/* 背景の装飾用アイコン */}
        <div className="absolute -right-10 -bottom-10 text-black/5 text-[120px] font-black italic select-none">SKK</div>
      </div>

      <main className="max-w-md mx-auto px-6 -mt-8 relative z-20">
        {/* スコアカード */}
        <div className="bg-white rounded-[35px] p-8 shadow-2xl mb-10 flex justify-between items-center border border-gray-50">
          <div>
            <p className="text-[10px] font-black text-gray-400 tracking-widest uppercase mb-1">Current Points</p>
            <p className="text-sm font-bold text-[#001f3f] opacity-80">審査評価合計</p>
          </div>
          <div className="text-right">
            <p className="text-6xl font-black tabular-nums leading-none text-[#001f3f]">{totalScore}</p>
            <p className="text-[10px] font-bold text-orange-500 mt-1 uppercase">Points</p>
          </div>
        </div>

        {/* 評価リスト */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-gray-400 tracking-[0.3em] uppercase ml-2 italic">Evaluation Items</h3>
          {loading ? (
            <div className="text-center py-20 opacity-20 font-black animate-pulse">LOADING...</div>
          ) : (
            criteria.map((c, i) => (
              <div key={i} className="bg-white p-6 rounded-[25px] shadow-sm border border-gray-100 flex justify-between items-center">
                <p className="text-sm font-bold text-[#001f3f] flex-1 pr-4 leading-relaxed">{c.examination_content}</p>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${
                  c.grade === 'A' ? 'bg-orange-500 text-white shadow-lg' : 
                  c.grade === 'B' ? 'bg-[#001f3f] text-white' : 
                  c.grade === 'C' ? 'bg-gray-100 text-gray-400' : 'bg-gray-50 text-gray-200'
                }`}>
                  {c.grade}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}

function getTargetBelt(kyu: string) {
  const k = kyu || '無級'
  if (k === '無級') return '白帯'
  if (k.match(/10|9/)) return '黄帯'
  if (k.match(/8|7/)) return '青帯'
  if (k.match(/6|5/)) return '橙帯'
  if (k.match(/4|3/)) return '緑帯'
  if (k.includes('1') || k.includes('2')) return '茶帯'
  return '黒帯'
}

function getTheme(belt: string) {
  const themes: any = {
    '白帯': { bg: 'bg-white', text: 'text-[#001f3f]' },
    '黄帯': { bg: 'bg-yellow-400', text: 'text-black' },
    '青帯': { bg: 'bg-blue-600', text: 'text-white' },
    '橙帯': { bg: 'bg-orange-500', text: 'text-white' },
    '緑帯': { bg: 'bg-green-600', text: 'text-white' },
    '茶帯': { bg: 'bg-amber-900', text: 'text-white' },
    '黒帯': { bg: 'bg-black', text: 'text-white' },
  }
  return themes[belt] || themes['白帯']
}
