import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const targetBelt = getTargetBelt(profile.kyu || '無級')
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
    <div className="min-h-screen bg-[#f4f6f8] font-sans text-slate-800 pb-20">
      {/* ヘッダーエリア（帯色でダイナミックに変化） */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-12 pb-24 rounded-b-[40px] shadow-lg relative overflow-hidden transition-colors duration-500`}>
        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col gap-2">
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black tracking-widest backdrop-blur-md bg-white/20 border border-white/20 w-fit">
                {targetBelt} / {profile.kyu || '無級'}
              </span>
              <h1 className="text-3xl font-black tracking-tight">{profile.name}</h1>
            </div>
            <div className="flex gap-2">
              <button onClick={handlePasswordChange} className="w-10 h-10 bg-black/10 rounded-full flex items-center justify-center hover:bg-black/20 transition-all backdrop-blur-sm">
                <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
              <button onClick={() => supabase.auth.signOut()} className="w-10 h-10 bg-black/10 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all backdrop-blur-sm">
                <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </div>
        {/* 装飾背景文字 */}
        <div className="absolute -right-8 -bottom-12 text-black/5 text-[140px] font-black italic select-none pointer-events-none">SKK</div>
      </div>

      <main className="max-w-md mx-auto px-5 -mt-14 relative z-20">
        {/* メインスコアカード */}
        <div className="bg-white rounded-[30px] p-8 shadow-xl shadow-slate-200/50 mb-8 border border-slate-100 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Total Score</p>
            <p className="text-sm font-bold text-slate-700">現在の審査点数</p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-black tabular-nums tracking-tighter text-slate-800">{totalScore}</p>
            <p className="text-[10px] font-black text-orange-500 mt-1 uppercase tracking-widest">Points</p>
          </div>
        </div>

        {/* Youtubeリンク（全体用） */}
        <a 
          href="https://www.youtube.com/results?search_query=誠空会" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-red-50 text-red-600 font-bold py-4 rounded-[20px] mb-8 border border-red-100 hover:bg-red-100 transition-colors shadow-sm"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          誠空会の動画で予習する
        </a>

        {/* 評価項目リスト */}
        <div className="space-y-4">
          <div className="flex justify-between items-end ml-2 mb-2">
            <h3 className="text-[11px] font-black text-slate-400 tracking-[0.2em] uppercase">Evaluation Items</h3>
          </div>

          {loading ? (
            <div className="text-center py-20 opacity-30 font-black animate-pulse text-slate-400">LOADING...</div>
          ) : (
            criteria.map((c, i) => {
              // データベースにURLがあればそれを使用し、なければ自動検索リンクを生成
              const videoUrl = c.video_url || `https://www.youtube.com/results?search_query=誠空会+${encodeURIComponent(c.examination_content)}`

              return (
                <div key={i} className="bg-white p-5 rounded-[24px] shadow-sm hover:shadow-md border border-slate-100 transition-all group">
                  <div className="flex justify-between items-start gap-4 mb-3">
                    <p className="text-[13px] font-bold text-slate-700 leading-relaxed flex-1">
                      {c.examination_content}
                    </p>
                    <div className={`shrink-0 w-12 h-12 rounded-[14px] flex items-center justify-center font-black text-xl ${
                      c.grade === 'A' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 
                      c.grade === 'B' ? 'bg-slate-800 text-white shadow-md' : 
                      c.grade === 'C' ? 'bg-slate-100 text-slate-500' : 'bg-slate-50 text-slate-300 border border-slate-100'
                    }`}>
                      {c.grade}
                    </div>
                  </div>
                  
                  {/* 個別動画リンクボタン */}
                  <a 
                    href={videoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
                    参考動画を見る
                  </a>
                </div>
              )
            })
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
    '白帯': { bg: 'bg-white border-b border-slate-200', text: 'text-slate-800' },
    '黄帯': { bg: 'bg-yellow-400', text: 'text-yellow-950' },
    '青帯': { bg: 'bg-blue-600', text: 'text-white' },
    '橙帯': { bg: 'bg-orange-500', text: 'text-white' },
    '緑帯': { bg: 'bg-emerald-600', text: 'text-white' },
    '茶帯': { bg: 'bg-amber-800', text: 'text-white' },
    '黒帯': { bg: 'bg-slate-900', text: 'text-white' },
  }
  return themes[belt] || themes['白帯']
}
