import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 現在の級から、表示すべき「帯」を判定
  const targetBelt = getTargetBelt(profile.kyu || '無級')

  useEffect(() => {
    async function fetchMyEvals() {
      try {
        setLoading(true)
        // 1. 現在の級に対応する審査項目を取得
        const { data: crit } = await supabase
          .from('criteria')
          .select('*')
          .eq('dan', targetBelt)
          .order('id')

        // 2. 自分の評価データを取得
        const { data: evals } = await supabase
          .from('evaluations')
          .select('*')
          .eq('student_id', profile.id)

        // 3. 項目と評価をマッピング
        if (crit) {
          const merged = crit.map(c => ({
            ...c,
            grade: evals?.find(e => e.criterion_id === c.id)?.grade || '-'
          }))
          setCriteria(merged)
        }
      } catch (err) {
        console.error('データ取得エラー:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMyEvals()
  }, [profile.id, targetBelt])

  // 合計点数の計算 (A=2.5, B=1.5, C=0.5, D=0)
  const totalScore = criteria.reduce((acc, curr) => {
    const score = curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0
    return acc + score
  }, 0)

  return (
    <div className="min-h-screen bg-[#f0f2f5] font-sans text-[#001f3f]">
      {/* ヘッダー */}
      <header className="bg-[#001f3f] text-white p-6 pb-20 rounded-b-[50px] shadow-2xl relative">
        <div className="max-w-md mx-auto flex justify-between items-start">
          <div>
            <h1 className="text-[10px] font-black tracking-[0.4em] text-orange-400 mb-1">SEIKUKAI PORTAL</h1>
            <p className="text-2xl font-black">{profile.name} <span className="text-sm font-normal opacity-70">君</span></p>
          </div>
          <div className="flex gap-2">
            {/* 設定ボタンの修正: プロフィール確認等に利用可能（現在は簡易アラート） */}
            <button 
              onClick={() => alert(`所属: ${profile.branch || '未設定'}\n現在の級: ${profile.kyu || '無級'}`)} 
              className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all"
            >
              ⚙️
            </button>
            {/* 終了からログアウトに変更 */}
            <button 
              onClick={() => supabase.auth.signOut()} 
              className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-[10px] font-black hover:bg-red-500 hover:text-white transition-all"
            >
              LOGOUT
            </button>
          </div>
        </div>

        {/* スコアカード */}
        <div className="absolute left-1/2 -translate-x-1/2 top-24 w-[90%] max-w-md bg-white rounded-[30px] p-6 shadow-xl flex justify-between items-center border border-gray-100">
          <div>
            <p className="text-[10px] font-black text-gray-400 tracking-widest uppercase mb-1">{targetBelt} 審査状況</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-[#001f3f]">{profile.kyu || '無級'}</span>
              <span className="bg-orange-100 text-orange-600 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">{targetBelt}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black text-[#001f3f] tabular-nums">{totalScore}</p>
            <p className="text-[9px] font-bold text-gray-400 uppercase">Points</p>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-md mx-auto mt-20 px-6 pb-10">
        <h3 className="text-xs font-black text-gray-400 tracking-widest mb-4 uppercase italic">Evaluation Items</h3>
        
        {loading ? (
          <div className="text-center py-10 opacity-20 font-black animate-pulse">LOADING...</div>
        ) : (
          <div className="space-y-3">
            {criteria.length > 0 ? (
              criteria.map((c, i) => (
                <div key={i} className="bg-white p-5 rounded-[25px] shadow-sm flex justify-between items-center border border-gray-50">
                  <p className="text-[13px] font-bold text-[#001f3f] flex-1 pr-4 leading-snug">
                    {c.examination_content}
                  </p>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${
                    c.grade === 'A' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 
                    c.grade === 'B' ? 'bg-[#001f3f] text-white' : 
                    c.grade === 'C' ? 'bg-gray-100 text-gray-400' : 'bg-gray-50 text-gray-200'
                  }`}>
                    {c.grade}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-300 text-xs font-bold italic">
                {targetBelt}の項目は現在準備中です
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// 共通の帯判定ロジック
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
