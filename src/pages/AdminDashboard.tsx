import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

export default function AdminDashboard({ profile }: { profile: Profile; onReload: () => void }) {
  const [tab, setTab] = useState('生徒一覧')
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)

  return (
    <div className="min-h-screen bg-gray-50 text-[#001f3f]">
      {/* ヘッダー */}
      <div className="bg-[#001f3f] px-6 py-4 flex justify-between items-center shadow-lg">
        <h1 className="text-white font-black text-lg tracking-[0.2em]">誠空会 管理</h1>
        <button onClick={() => supabase.auth.signOut()} className="text-white/60 text-[10px] font-bold border border-white/20 rounded-full px-4 py-1.5 hover:bg-white/10 transition-all">ログアウト</button>
      </div>

      {/* タブナビゲーション */}
      <div className="flex bg-[#001f3f] border-t border-white/10 sticky top-0 z-10">
        {['生徒一覧', '評価入力', '審査基準'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-4 text-[10px] font-black tracking-widest transition-all ${tab === t ? 'text-white border-b-4 border-[#ff6600]' : 'text-white/40'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto pb-10">
        {tab === '生徒一覧' && <StudentsTab onSelect={(s) => { setSelectedStudent(s); setTab('評価入力'); }} />}
        {tab === '評価入力' && <EvalTab student={selectedStudent} onBack={() => setTab('生徒一覧')} />}
        {tab === '審査基準' && <CriteriaTab />}
      </div>
    </div>
  )
}

// --- 生徒一覧タブ ---
function StudentsTab({ onSelect }: { onSelect: (s: Profile) => void }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Loader />

  return (
    <div className="p-4 space-y-3">
      {students.map(s => (
        <button key={s.id} onClick={() => onSelect(s)} className="w-full bg-white p-5 rounded-3xl border border-gray-100 flex justify-between items-center shadow-sm active:scale-[0.98] transition-all text-left">
          <div>
            <p className="font-black text-[#001f3f] text-base">{s.name}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">{s.kyu || '無級'}</p>
          </div>
          <div className="bg-gray-50 text-[#ff6600] font-black text-[10px] px-4 py-2 rounded-xl border border-orange-50">評価 ＞</div>
        </button>
      ))}
    </div>
  )
}

// --- 評価入力タブ (ここがメイン機能) ---
function EvalTab({ student, onBack }: { student: Profile | null; onBack: () => void }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const getTargetBelt = (kyu: string) => {
    if (!kyu || kyu === '無級') return '白帯';
    if (kyu.includes('10級') || kyu.includes('9級')) return '黄帯';
    if (kyu.includes('8級') || kyu.includes('7級')) return '青帯';
    if (kyu.includes('6級') || kyu.includes('5級')) return '橙帯';
    if (kyu.includes('4級') || kyu.includes('3級')) return '緑帯';
    if (kyu.includes('2級') || kyu.includes('1級')) return '茶帯';
    if (kyu.includes('段')) return '黒帯';
    return '白帯';
  }

  useEffect(() => {
    if (!student) return
    async function loadData() {
      setLoading(true)
      const targetBelt = getTargetBelt(student?.kyu || '無級')
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student?.id)

      const combined = (crit || []).map(c => ({
        ...c,
        grade: evals?.find(e => e.criterion_id === c.id)?.grade || null
      }))
      setCriteria(combined)
      setLoading(false)
    }
    loadData()
  }, [student])

  const saveGrade = async (criterionId: number, grade: string) => {
    if (!student) return
    
    // 楽観的更新（先に画面を書き換えてサクサク感を出す）
    setCriteria(prev => prev.map(c => c.id === criterionId ? { ...c, grade } : c))

    const { error } = await supabase
      .from('evaluations')
      .upsert({
        student_id: student.id,
        criterion_id: criterionId,
        grade: grade,
        updated_at: new Date().toISOString()
      }, { onConflict: 'student_id,criterion_id' })

    if (error) {
      alert("保存に失敗しました: " + error.message)
      // 失敗したらリロードして戻す
    }
  }

  if (!student) return <div className="p-20 text-center font-bold text-gray-300">生徒を選択してください</div>
  if (loading) return <Loader />

  return (
    <div className="p-4">
      <div className="flex justify-between items-end mb-6 px-2">
        <div>
          <button onClick={onBack} className="text-[#ff6600] font-black text-[10px] uppercase mb-2">← 戻る</button>
          <h2 className="text-2xl font-black">{student.name} <span className="text-xs text-gray-400 font-bold ml-1">{student.kyu}</span></h2>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-black text-gray-300 uppercase">Target</p>
          <p className="text-sm font-black text-[#ff6600]">{getTargetBelt(student.kyu)}項目</p>
        </div>
      </div>

      <div className="space-y-4">
        {criteria.map((c) => (
          <div key={c.id} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-gray-100 transition-all">
            <div className="mb-4 px-2">
              <span className="text-[8px] font-black text-white bg-[#001f3f] px-2 py-0.5 rounded-full uppercase mr-2 tracking-tighter">{c.examination_type}</span>
              <p className="text-sm font-bold mt-1.5 leading-tight">{c.examination_content}</p>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button
                  key={g}
                  onClick={() => saveGrade(c.id, g)}
                  className={`py-3 rounded-2xl font-black text-lg transition-all ${
                    c.grade === g 
                      ? 'bg-[#ff6600] text-white shadow-lg shadow-orange-100 scale-105' 
                      : 'bg-gray-50 text-gray-300 active:bg-gray-100'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CriteriaTab() { return <div className="p-20 text-center font-bold text-gray-200 uppercase tracking-widest">審査基準設定（準備中）</div> }
function Loader() { return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
