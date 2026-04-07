import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile: adminUser }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 1. 生徒一覧の取得
  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // 2. 選択された生徒の「級」に応じた評価基準を読み込む
  useEffect(() => {
    async function loadCriteriaAndEvals() {
      if (!selectedStudent) return
      
      const targetBelt = getTargetBelt(selectedStudent.kyu)
      
      // 基準(criteria)と現在の評価(evaluations)を同時に取得
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', selectedStudent.id)
      
      setCriteria((crit || []).map(c => ({
        ...c,
        grade: evals?.find(e => e.criterion_id === c.id)?.grade || null
      })))
    }
    loadCriteriaAndEvals()
  }, [selectedStudent]) // 生徒が切り替わるか、生徒のデータ(kyu)が変わると再実行

  // 3. 検索フィルタ
  const filteredStudents = students.filter(s => {
    const searchStr = `${s.name} ${s.kyu} ${(s as any).branch || ''}`.toLowerCase()
    return searchStr.includes(searchQuery.toLowerCase())
  })

  // 4. 評価の保存
  const saveGrade = async (criterionId: number, grade: string) => {
    if (!selectedStudent) return
    setCriteria(prev => prev.map(c => c.id === criterionId ? { ...c, grade } : c))
    await supabase.from('evaluations').upsert({ 
      student_id: selectedStudent.id, 
      criterion_id: criterionId, 
      grade 
    }, { onConflict: 'student_id,criterion_id' })
  }

  // 5. 昇級処理（profilesテーブルの書き換え）
  const handlePassAndUpgrade = async (nextKyu: string) => {
    if (!selectedStudent) return
    
    const { error } = await supabase
      .from('profiles')
      .update({ kyu: nextKyu })
      .eq('id', selectedStudent.id)

    if (!error) {
      alert(`${selectedStudent.name}君を ${nextKyu} に昇級させました。`)
      // 一覧を更新し、選択中の生徒情報も更新（これで評価項目が自動で切り替わる）
      await loadStudents()
      setSelectedStudent({ ...selectedStudent, kyu: nextKyu })
    }
  }

  const totalScore = criteria.reduce((acc, curr) => {
    const s = curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0
    return acc + s
  }, 0)

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#f0f2f5] overflow-hidden">
      
      {/* 左：生徒一覧 & 検索 */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col h-full shadow-lg">
        <div className="p-6 bg-[#001f3f] text-white">
          <h1 className="text-lg font-black tracking-widest mb-4">誠空会 管理システム</h1>
          <input 
            type="text" 
            placeholder="生徒名・支部・級で検索..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-xs focus:bg-white focus:text-[#001f3f] outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredStudents.map(s => (
            <button key={s.id} onClick={() => setSelectedStudent(s)}
              className={`w-full p-4 border-b border-gray-50 flex justify-between items-center ${selectedStudent?.id === s.id ? 'bg-orange-50 border-r-4 border-[#ff6600]' : 'hover:bg-gray-50'}`}>
              <div className="text-left">
                <p className="font-black text-sm">{s.name}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase">{(s as any).branch} | {s.kyu}</p>
              </div>
              <span className="text-gray-300 text-xs">▶</span>
            </button>
          ))}
        </div>
      </div>

      {/* 右：詳細・評価入力 */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#f8f9fa]">
        {selectedStudent ? (
          <div className="max-w-2xl mx-auto">
            {/* ヘッダーカード */}
            <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 shadow-2xl flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black">{selectedStudent.name}</h2>
                <p className="text-[#ff6600] font-bold text-sm tracking-widest">現在の級: {selectedStudent.kyu}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] opacity-50 uppercase font-black">Score</p>
                <p className="text-5xl font-black">{totalScore}</p>
              </div>
            </div>

            {/* 合格判定エリア */}
            <div className="mb-8">
              {totalScore >= 80 ? (
                <div className="bg-white p-6 rounded-[2.5rem] border-2 border-[#ff6600] shadow-xl text-center">
                  <p className="text-[#ff6600] font-black text-xs mb-4 uppercase tracking-[0.2em]">合格基準達成！新しい級を選択してください</p>
                  <div className="grid grid-cols-2 gap-2">
                    {getSelectableKyu(selectedStudent.kyu).map(k => (
                      <button key={k} onClick={() => handlePassAndUpgrade(k)}
                        className="bg-[#ff6600] text-white py-4 rounded-2xl font-black text-sm hover:scale-105 transition-all">
                        {k} に昇級
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-200 text-gray-400 py-6 rounded-[2.5rem] text-center font-black text-xs uppercase tracking-widest">
                  80点以上で合格判定が可能です（現在: {totalScore}点）
                </div>
              )}
            </div>

            {/* 評価基準リスト（級と連動） */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-4">
                {getTargetBelt(selectedStudent.kyu)} 審査基準
              </h3>
              {criteria.map(c => (
                <div key={c.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
                  <p className="text-sm font-bold mb-4">{c.examination_content}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {['A', 'B', 'C', 'D'].map(g => (
                      <button key={g} onClick={() => saveGrade(c.id, g)}
                        className={`py-3 rounded-xl font-black ${c.grade === g ? 'bg-[#001f3f] text-white' : 'bg-gray-50 text-gray-200'}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-300 font-black tracking-widest uppercase">
            生徒を選択してください
          </div>
        )}
      </div>
    </div>
  )
}

// 級から帯の色を判定する
function getTargetBelt(kyu: string) {
  if (!kyu || kyu === '無級') return '白帯';
  if (kyu.includes('10級') || kyu.includes('9級')) return '黄帯';
  if (kyu.includes('8級') || kyu.includes('7級')) return '青帯';
  if (kyu.includes('6級') || kyu.includes('5級')) return '橙帯';
  if (kyu.includes('4級') || kyu.includes('3級')) return '緑帯';
  if (kyu.includes('2級') || kyu.includes('1級')) return '茶帯';
  return '黒帯';
}

// 次に選択可能な級を返す
function getSelectableKyu(currentKyu: string) {
  const belt = getTargetBelt(currentKyu);
  if (belt === '白帯') return ['準10級', '10級'];
  if (belt === '黄帯') return ['準8級', '8級'];
  if (belt === '青帯') return ['準6級', '6級'];
  if (belt === '橙帯') return ['準4級', '4級'];
  if (belt === '緑帯') return ['準2級', '2級'];
  if (belt === '茶帯') return ['初段'];
  return ['弍段', '参段'];
}
