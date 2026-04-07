import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const targetBelt = getTargetBelt(profile.kyu || '無級')

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
    if (error) {
      alert('エラーが発生しました: ' + error.message)
    } else {
      alert('パスワードを更新しました')
    }
  }

  const totalScore = criteria.reduce((acc, curr) => {
    const score = curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0
    return acc + score
  }, 0)

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-[#001f3f] pb-10">
      {/* ナビゲーション */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-black italic tracking-tighter">SEIKUKAI</h1>
          <span className="bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">{profile.kyu || '無級'}</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handlePasswordChange} className="text-xl opacity-40 hover:opacity-100 transition-opacity">⚙️</button>
          <button 
            onClick={() => supabase.auth.signOut()} 
            className="text-[10px] font-black text-red-500 border border-red-100 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all"
          >
            ログアウト
          </button>
        </div>
      </nav>

      <main className="max-w-md mx-auto px-6 mt-8">
        {/* ユーザー挨拶 */}
        <div className="mb-8">
          <p className="text-[10px] font-black text-gray-400 tracking-[0.2em] mb-1 uppercase">Welcome Back</p>
          <h2 className="text-3xl font-black">{profile.name}</h2>
        </div>

        {/* スコア表示カード */}
        <div className="bg-[#001f3f] rounded-[35px] p-8 text-white shadow-2xl mb-10 flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-black text-orange-400 tracking-widest uppercase mb-1">{targetBelt} 審査</p>
            <p className="text-sm font-bold opacity-80">現在の評価点数</p>
          </div>
          <div className="relative z-10 text-right">
            <p className="text-6xl font-black tabular-nums leading-none">{totalScore}</p>
            <p className="text-[10px] font-bold opacity-50 mt-1 uppercase">Points</p>
          </div>
          {/* 装飾用の背景ロゴ的なもの */}
          <div className="absolute -right-4 -bottom-4 text-white/5 text-8xl font-black italic select-none">SKK</div>
        </div>

        {/* 評価項目 */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-gray-400 tracking-[0.3em] uppercase ml-2">Evaluation List</h3>
          {loading ? (
            <div className="text-center py-20 opacity-20 font-black animate-pulse">LOADING...</div>
          ) : (
            criteria.map((c, i) => (
              <div key={i} className="bg-white p-6 rounded-[25px] shadow-sm border border-gray-100 flex justify-between items-center transition-transform active:scale-95">
                <p className="text-sm font-bold text-[#001f3f] flex-1 pr-4 leading-snug">
                  {c.examination_content}
                </p>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${
                  c.grade === 'A' ? 'bg-orange-500 text-white shadow-lg shadow-orange-100' : 
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
