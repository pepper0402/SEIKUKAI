import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

export default function AdminDashboard({ profile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const isMaster = profile.login_email === 'mr.pepper0402@gmail.com'

  // 1. 生徒一覧の取得
  const loadStudents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // 2. 検索・フィルタリングロジック
  const filteredStudents = students.filter(s => {
    const searchStr = `${s.name} ${s.kyu} ${(s as any).branch || ''} ${getTargetBelt(s.kyu)}`.toLowerCase()
    return searchStr.includes(searchQuery.toLowerCase())
  })

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-[#001f3f] flex flex-col md:flex-row">
      
      {/* 左側：生徒検索・一覧エリア */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
        <div className="p-6 border-b border-gray-100 bg-[#001f3f] text-white">
          <h1 className="text-xl font-black tracking-widest mb-4 text-center">誠空会 管理パネル</h1>
          <input 
            type="text" 
            placeholder="名前・級・支部で検索..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-xs focus:bg-white focus:text-[#001f3f] transition-all outline-none"
          />
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {filteredStudents.map(s => (
            <button 
              key={s.id} 
              onClick={() => setSelectedStudent(s)}
              className={`w-full p-4 border-b border-gray-50 flex items-center justify-between hover:bg-orange-50 transition-colors ${selectedStudent?.id === s.id ? 'bg-orange-50 border-r-4 border-r-[#ff6600]' : ''}`}
            >
              <div className="text-left">
                <p className="font-black text-sm">{s.name}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">{(s as any).branch || '未設定'}</span>
                  <span className="text-[8px] font-bold text-[#ff6600] uppercase tracking-tighter">{s.kyu}</span>
                </div>
              </div>
              <span className="text-gray-300 text-xs">▶</span>
            </button>
          ))}
        </div>
      </div>

      {/* 右側：評価・操作エリア */}
      <div className="flex-1 overflow-y-auto h-screen p-6">
        {selectedStudent ? (
          <EvaluationPanel 
            student={selectedStudent} 
            isMaster={isMaster} 
            onUpdate={loadStudents}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-300">
            <div className="text-6xl mb-4">🥋</div>
            <p className="font-black text-sm uppercase tracking-[0.3em]">生徒を選択してください</p>
          </div>
        )}
      </div>
    </div>
  )
}

// --- 評価入力・合格判定パネル ---
function EvaluationPanel({ student, isMaster, onUpdate }: { student: Profile; isMaster: boolean; onUpdate: () => void }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [showPassModal, setShowPassModal] = useState(false)
  const targetBelt = getTargetBelt(student.kyu)

  useEffect(() => {
    async function load() {
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || null })))
    }
    load()
  }, [student, targetBelt])

  const saveGrade = async (criterionId: number, grade: string) => {
    setCriteria(prev => prev.map(c => c.id === criterionId ? { ...c, grade } : c))
    await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: criterionId, grade }, { onConflict: 'student_id,criterion_id' })
  }

  const totalScore = criteria.reduce((acc, curr) => {
    const s = curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0
    return acc + s
  }, 0)

  return (
    <div className="max-w-2xl mx-auto">
      {/* 生徒情報ヘッダー */}
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-8 flex justify-between items-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 text-8xl font-black italic -mr-10">SEIKUKAI</div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black tracking-tighter mb-1">{student.name}</h2>
          <p className="text-[#ff6600] font-bold text-xs tracking-widest uppercase">{student.kyu} / {targetBelt}項目</p>
        </div>
        <div className="relative z-10 text-right">
          <p className="text-[10px] font-black opacity-50 uppercase mb-1 tracking-[0.2em]">Total Score</p>
          <p className="text-5xl font-black leading-none">{totalScore}<span className="text-sm opacity-30">/100</span></p>
        </div>
      </div>

      {/* 合格ボタン (80点以上で活性化) */}
      <div className="mb-10">
        <button 
          onClick={() => setShowPassModal(true)}
          disabled={totalScore < 80}
          className={`w-full py-5 rounded-[2rem] font-black text-sm tracking-[0.3em] uppercase transition-all shadow-lg ${totalScore >= 80 ? 'bg-[#ff6600] text-white hover:scale-[1.02] active:scale-95 animate-pulse' : 'bg-white text-gray-200 cursor-not-allowed'}`}
        >
          {totalScore >= 80 ? '審査合格・昇級処理へ' : `あと ${80 - totalScore}点で合格可能`}
        </button>
      </div>

      {/* 評価シート */}
      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[8px] font-black text-[#ff6600] uppercase tracking-widest">{c.examination_type}</span>
                <p className="text-sm font-bold mt-1">{c.examination_content}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => saveGrade(c.id, g)}
                  className={`py-3 rounded-2xl font-black text-lg transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg' : 'bg-gray-50 text-gray-200 active:bg-gray-100'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 合格モーダル (マスター専用) */}
      {showPassModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] w-full max-w-sm p-8 text-center">
            <div className="text-4xl mb-4">🏆</div>
            <h3 className="text-xl font-black mb-2">昇級・級の確定</h3>
            <p className="text-xs text-gray-400 mb-6 font-bold">次に付与する級を選択してください</p>
            
            <div className="grid grid-cols-2 gap-2 mb-8">
              {getSelectableKyu(student.kyu).map(k => (
                <button 
                  key={k}
                  onClick={async () => {
                    await supabase.from('profiles').update({ kyu: k }).eq('id', student.id)
                    alert(`${k} への昇級を完了しました！`);
                    setShowPassModal(false);
                    onUpdate();
                  }}
                  className="bg-gray-50 hover:bg-[#001f3f] hover:text-white py-4 rounded-2xl font-black text-xs transition-colors"
                >
                  {k}
                </button>
              ))}
            </div>
            <button onClick={() => setShowPassModal(false)} className="text-gray-300 font-bold text-[10px] uppercase tracking-widest">キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ヘルパー関数
function getTargetBelt(kyu: string) {
  if (!kyu || kyu === '無級') return '白帯';
  if (kyu.includes('10級') || kyu.includes('9級')) return '黄帯';
  if (kyu.includes('8級') || kyu.includes('7級')) return '青帯';
  if (kyu.includes('6級') || kyu.includes('5級')) return '橙帯';
  if (kyu.includes('4級') || kyu.includes('3級')) return '緑帯';
  if (kyu.includes('2級') || kyu.includes('1級')) return '茶帯';
  return '黒帯';
}

function getSelectableKyu(currentKyu: string) {
  const belt = getTargetBelt(currentKyu);
  if (belt === '白帯') return ['準10級', '正10級'];
  if (belt === '黄帯') return ['準8級', '正8級'];
  if (belt === '青帯') return ['準6級', '正6級'];
  if (belt === '橙帯') return ['準4級', '正4級'];
  if (belt === '緑帯') return ['準2級', '正2級'];
  if (belt === '茶帯') return ['初段'];
  return ['弍段', '参段'];
}
