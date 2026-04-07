import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [loading, setLoading] = useState(true)

  // 管理者メールアドレスのチェック（null安全）
  const isMaster = adminProfile?.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
      if (error) throw error
      setStudents(data || [])
    } catch (err) {
      console.error('データ読み込みエラー:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // 支部リストを動的に生成（データが空の場合のガードレール付き）
  const dynamicBranches = useMemo(() => {
    if (!students || students.length === 0) return ['すべて']
    const branches = students.map(s => (s as any).branch).filter(Boolean)
    return ['すべて', ...Array.from(new Set(branches))]
  }, [students])

  // 検索・フィルタリング（null安全）
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const kyu = s.kyu || '無級'
      const belt = getTargetBelt(kyu)
      const branch = (s as any).branch || '未設定'
      const matchSearch = `${s.name} ${kyu} ${belt}`.toLowerCase().includes(searchQuery.toLowerCase())
      const matchBranch = branchFilter === 'すべて' || branch === branchFilter
      return matchSearch && matchBranch
    })
  }, [students, searchQuery, branchFilter])

  // CSV読み込み
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').filter(line => line.trim() !== '')
      const dataLines = lines.slice(1)
      
      const updates = dataLines.map(line => {
        const v = line.split(',').map(s => s.trim())
        if (v.length < 9) return null
        const email = v[8]
        const isAdmin = email === 'mr.pepper0402@gmail.com'
        return { 
          name: v[1] + v[2], 
          login_email: email, 
          kyu: v[7] || '無級', 
          branch: v[10] || '未設定', 
          is_admin: isAdmin 
        }
      }).filter(Boolean) as any[]
      
      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (!error) { 
        alert('名簿情報を更新しました'); 
        loadStudents(); 
      }
    }
    reader.readAsText(file)
  }

  if (loading && students.length === 0) {
    return <div className="h-screen flex items-center justify-center bg-[#f0f2f5] font-black text-[#001f3f]">LOADING...</div>
  }

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden text-[#001f3f]">
      {/* 左側：検索パネル */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl z-10">
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-5">
            <h1 className="text-xs font-black tracking-widest text-orange-400">SEIKUKAI ADMIN</h1>
            <label className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl cursor-pointer font-black border border-white/10 transition-all">
              CSV読込 <input type="file" className="hidden" onChange={handleCsvUpload} />
            </label>
          </div>
          <div className="space-y-3">
            <input 
              type="text" placeholder="名前・級で検索..." 
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs outline-none focus:bg-white focus:text-[#001f3f]"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select 
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-black outline-none focus:bg-white focus:text-[#001f3f]"
              value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            >
              {dynamicBranches.map(b => (
                <option key={b} value={b} className="text-black">{b === 'すべて' ? 'すべての支部' : `${b}支部`}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 no-scrollbar bg-white">
          {filteredStudents.map(s => (
            <button key={s.id} onClick={() => setSelectedStudent(s)}
              className={`w-full p-5 text-left transition-all border-l-4 ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500' : 'border-transparent hover:bg-gray-50'}`}>
              <p className="font-black text-sm">{s.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{(s as any).branch || '未設定'}</span>
                <span className="text-[9px] font-bold text-orange-500 uppercase">{s.kyu || '無級'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 右側：評価・操作エリア */}
      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-6 md:p-10">
        {selectedStudent ? (
          <EvaluationPanel 
            key={selectedStudent.id}
            student={selectedStudent} 
            isMaster={isMaster} 
            onRefresh={loadStudents}
            onKyuUpdate={(newKyu) => setSelectedStudent({...selectedStudent, kyu: newKyu})}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-200">
            <p className="font-black text-[10px] uppercase tracking-[0.5em]">Please Select a Student</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* 評価パネル */
function EvaluationPanel({ student, isMaster, onRefresh, onKyuUpdate }: { student: Profile, isMaster: boolean, onRefresh: () => void, onKyuUpdate: (k: string) => void }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const targetBelt = getTargetBelt(student.kyu || '無級')

  useEffect(() => {
    async function fetchEvals() {
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || null })))
    }
    fetchEvals()
  }, [student.id, student.kyu, targetBelt])

  const saveGrade = async (cid: number, grade: string | null) => {
    setCriteria(prev => prev.map(c => c.id === cid ? { ...c, grade } : c))
    if (grade === null) {
      await supabase.from('evaluations').delete().match({ student_id: student.id, criterion_id: cid })
    } else {
      await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: cid, grade }, { onConflict: 'student_id,criterion_id' })
    }
  }

  const handlePassAndUpgrade = async (nextKyu: string) => {
    if (!window.confirm(`${nextKyu} への昇級を確定しますか？`)) return
    const { error } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id)
    if (!error) {
      alert(`${student.name}君
