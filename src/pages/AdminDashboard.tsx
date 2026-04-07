import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [loading, setLoading] = useState(true)

  const isMaster = adminProfile?.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
      if (error) throw error
      setStudents(data || [])
    } catch (err) {
      console.error('Fetch Error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // --- CSV読み込み (エラー対策強化版) ---
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split('\n').filter(line => line.trim() !== '')
        const dataLines = lines.slice(1) // ヘッダー飛ばし
        
        const updates = dataLines.map(line => {
          const v = line.split(',').map(s => s.trim())
          if (v.length < 9 || !v[8]) return null // メールアドレスがない行は無視
          
          return { 
            name: (v[1] || '') + (v[2] || ''), 
            login_email: v[8], 
            kyu: v[7] || '無級', 
            branch: v[10] || '未設定', 
            is_admin: v[8] === 'mr.pepper0402@gmail.com'
          }
        }).filter(Boolean) as any[]
        
        if (updates.length === 0) {
          alert('有効なデータが見つかりませんでした。CSVの列を確認してください。');
          return;
        }

        const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
        if (error) throw error
        alert(`${updates.length}件の名簿を更新しました`);
        loadStudents();
      } catch (err) {
        console.error('CSV Import Error:', err);
        alert('CSVの読み込みに失敗しました。形式を確認してください。');
      }
    }
    reader.readAsText(file)
  }

  const dynamicBranches = useMemo(() => {
    const branches = students.map(s => (s as any).branch).filter(Boolean)
    return ['すべて', ...Array.from(new Set(branches))]
  }, [students])

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const kyu = s.kyu || '無級'
      const belt = getTargetBelt(kyu)
      const branch = (s as any).branch || '未設定'
      const matchSearch = `${s.name || ''} ${kyu} ${belt}`.toLowerCase().includes(searchQuery.toLowerCase())
      const matchBranch = branchFilter === 'すべて' || branch === branchFilter
      return matchSearch && matchBranch
    })
  }, [students, searchQuery, branchFilter])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      {/* 左：サイドバー */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl z-10">
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h1 className="text-[10px] font-black tracking-[0.3em] text-orange-400 mb-1">SEIKUKAI</h1>
              <span className="text-lg font-black italic">ADMIN</span>
            </div>
            
            {/* ログアウト・CSVボタン */}
            <div className="flex gap-2">
              <label className="text-[10px] bg-white/10 hover:bg-white/20 p-2 rounded-lg cursor-pointer border border-white/10">
                CSV <input type="file" className="hidden" onChange={handleCsvUpload} />
              </label>
              <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-500/20 hover:bg-red-500 p-2 rounded-lg border border-red-500/20 transition-all">
                Logout
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <input 
              type="text" placeholder="検索..." 
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:bg-white focus:text-[#001f3f]"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select 
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black outline-none focus:bg-white focus:text-[#001f3f]"
              value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            >
              {dynamicBranches.map(b => <option key={b} value={b} className="text-black">{b === 'すべて' ? 'すべての支部' : `${b}支部`}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          {filteredStudents.map(s => (
            <button key={s.id} onClick={() => setSelectedStudent(s)}
              className={`w-full p-5 text-left border-l-4 transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500' : 'border-transparent hover:bg-gray-50'}`}>
              <p className="font-black text-sm">{s.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{(s as any).branch || '未設定'}</span>
                <span className="text-[9px] font-bold text-orange-500 uppercase">{s.kyu || '無級'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 右：メインパネル */}
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
            <p className="font-black text-[10px] tracking-[0.5em]">SELECT STUDENT</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* --- サブコンポーネント --- */

function EvaluationPanel({ student, isMaster, onRefresh, onKyuUpdate }: any) {
  const [criteria, setCriteria] = useState<any[]>([])
  const targetBelt = getTargetBelt(student?.kyu || '無級')

  useEffect(() => {
    async function fetchEvals() {
      if (!student?.id) return
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || null })))
    }
    fetchEvals()
  }, [student?.id, student?.kyu, targetBelt])

  const saveGrade = async (cid: number, grade: string | null) => {
    setCriteria(prev => prev.map(c => c.id === cid ? { ...c, grade } : c))
    if (grade === null) {
      await supabase.from('evaluations').delete().match({ student_id: student.id, criterion_id: cid })
    } else {
      await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: cid, grade }, { onConflict: 'student_id,criterion_id' })
    }
  }

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 flex justify-between items-center shadow-xl">
        <div>
          <h2 className="text-3xl font-black mb-1">{student?.name}</h2>
          <span className="bg-orange-500 px-3 py-1 rounded-full text-[10px] font-black uppercase">{student?.kyu || '無級'}</span>
        </div>
        <div className="text-right">
          <p className="text-5xl font-black tabular-nums">{totalScore}</p>
        </div>
      </div>

      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] shadow-sm border border-gray-100 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <p className="text-sm font-bold text-[#001f3f]">{c.examination_content}</p>
              {c.grade && <button onClick={() => saveGrade(c.id, null)} className="text-[10px] text-gray-300 font-bold">✕ CLEAR</button>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => saveGrade(c.id, g)} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white' : 'bg-gray-50 text-gray-200'}`}>{g}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getTargetBelt(kyu: string) {
  const k = kyu || '無級'
  if (k === '無級') return '白帯';
  if (k.match(/10|9/)) return '黄帯';
  if (k.match(/8|7/)) return '青帯';
  if (k.match(/6|5/)) return '橙帯';
  if (k.match(/4|3/)) return '緑帯';
  if (k.includes('1') || k.includes('2')) return '茶帯';
  return '黒帯';
}
