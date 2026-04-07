import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

export default function AdminDashboard({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState('生徒一覧')
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const isMaster = profile.login_email === 'mr.pepper0402@gmail.com'

  return (
    <div className="min-h-screen bg-gray-50 text-[#001f3f]">
      {/* ヘッダー */}
      <div className="bg-[#001f3f] px-6 py-4 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-white font-black text-lg tracking-[0.2em]">誠空会 管理</h1>
          <p className="text-[8px] text-white/40 font-bold uppercase">{isMaster ? 'Master Admin' : 'Branch Manager'}</p>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-white/60 text-[10px] font-bold border border-white/20 rounded-full px-4 py-1.5 hover:bg-white/10 transition-all">ログアウト</button>
      </div>

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
        {tab === '評価入力' && <EvalTab student={selectedStudent} isMaster={isMaster} onBack={() => setTab('生徒一覧')} />}
        {tab === '審査基準' && <div className="p-10 text-center text-gray-300 font-bold uppercase tracking-widest">Settings Mode</div>}
      </div>
    </div>
  )
}

function StudentsTab({ onSelect }: { onSelect: (s: Profile) => void }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [branchFilter, setBranchFilter] = useState('すべて')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n')
      const updates = lines.slice(1).map(line => {
        const v = line.split(',').map(s => s.trim())
        if (v.length < 9) return null
        // 支部情報がCSVのどこか（例: 10列目）にある想定。なければ「未設定」
        return { name: v[1] + v[2], login_email: v[8], kyu: v[7] || '無級', is_admin: false }
      }).filter(item => item && item.login_email) as any[]
      
      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (error) alert(error.message); else { alert(`${updates.length}名の名簿を更新しました。`); load(); }
    }
    reader.readAsText(file)
  }

  // 支部のリスト（仮）
  const branches = ['すべて', '池田', '川西', '宝塚']
  const filteredStudents = branchFilter === 'すべて' 
    ? students 
    : students.filter(s => (s as any).branch === branchFilter) // DBにbranchカラムがある想定

  if (loading) return <div className="flex justify-center py-20 animate-spin">🌀</div>

  return (
    <div className="p-4">
      {/* CSV読込ボタン復活 */}
      <div className="mb-6">
        <label className="flex items-center justify-center gap-2 bg-white border-2 border-dashed border-gray-200 p-4 rounded-2xl cursor-pointer hover:bg-gray-50 transition-all">
          <span className="text-xs font-black text-[#001f3f]">名簿CSVを読み込む</span>
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
      </div>

      {/* 支部フィルター */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {branches.map(b => (
          <button key={b} onClick={() => setBranchFilter(b)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-[10px] font-black tracking-widest transition-all ${branchFilter === b ? 'bg-[#ff6600] text-white' : 'bg-white text-gray-400 border border-gray-100'}`}>
            {b}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredStudents.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} className="w-full bg-white p-5 rounded-[2rem] border border-gray-100 flex justify-between items-center shadow-sm active:scale-95 transition-all">
            <div className="text-left">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[9px] font-bold text-gray-300 uppercase">{s.kyu} | {(s as any).branch || '支部未設定'}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-[#ff6600]">→</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function EvalTab({ student, isMaster, onBack }: { student: Profile | null, isMaster: boolean, onBack: () => void }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student) return
    async function loadData() {
      setLoading(true)
      const { data: crit } = await supabase.from('criteria').select('*').order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
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
    setCriteria(prev => prev.map(c => c.id === criterionId ? { ...c, grade } : c))
    await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: criterionId, grade }, { onConflict: 'student_id,criterion_id' })
  }

  // マスター専用：級の更新機能
  const updateKyu = async (newKyu: string) => {
    if (!student || !isMaster) return
    const { error } = await supabase.from('profiles').update({ kyu: newKyu }).eq('id', student.id)
    if (!error) alert(`級を ${newKyu} に更新しました`);
  }

  if (!student) return null

  return (
    <div className="p-4">
      <button onClick={onBack} className="text-[10px] font-black text-[#ff6600] mb-4">← BACK TO LIST</button>
      
      <div className="bg-[#001f3f] p-6 rounded-[2.5rem] text-white mb-6">
        <h2 className="text-2xl font-black mb-1">{student.name}</h2>
        <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest">{student.kyu}</p>
        
        {isMaster && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-[8px] font-black text-[#ff6600] mb-2 uppercase">Master Action: 昇級・合否決定</p>
            <select 
              onChange={(e) => updateKyu(e.target.value)}
              className="bg-white/10 text-xs font-bold w-full p-3 rounded-xl border-none outline-none"
            >
              <option value="">級を変更する</option>
              {['無級','10級','9級','8級','7級','6級','5級','4級','3級','2級','1級','初段'].map(k => (
                <option key={k} value={k} className="text-black">{k}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {criteria.filter(c => c.dan === (student.kyu === '無級' ? '白帯' : '該当帯')).map(c => (
          <div key={c.id} className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[8px] font-black text-gray-300 uppercase mb-1">{c.examination_type}</p>
            <p className="text-sm font-bold mb-4">{c.examination_content}</p>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => saveGrade(c.id, g)}
                  className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#ff6600] text-white shadow-lg' : 'bg-gray-50 text-gray-300'}`}>
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
