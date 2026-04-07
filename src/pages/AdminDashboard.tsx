import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [loading, setLoading] = useState(true)

  // マスター権限の判定
  const isMaster = adminProfile.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // 検索と支部フィルターの適用
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = `${s.name} ${s.kyu}`.toLowerCase().includes(searchQuery.toLowerCase())
      const matchBranch = branchFilter === 'すべて' || (s as any).branch === branchFilter
      return matchSearch && matchBranch
    })
  }, [students, searchQuery, branchFilter])

  // CSVインポート機能の復活
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').slice(1)
      const updates = lines.map(line => {
        const v = line.split(',').map(s => s.trim())
        if (v.length < 9) return null
        return { name: v[1] + v[2], login_email: v[8], kyu: v[7] || '無級', branch: v[10] || '未設定', is_admin: false }
      }).filter(Boolean) as any[]
      
      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (!error) { alert('名簿を更新しました'); loadStudents(); }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans">
      
      {/* --- 左側：生徒管理・検索パネル --- */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-2xl">
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-sm font-black tracking-[0.2em]">SEIKUKAI ADMIN</h1>
            <label className="text-[10px] bg-[#ff6600] px-2 py-1 rounded cursor-pointer hover:bg-orange-600 transition-colors">
              CSV読込 <input type="file" className="hidden" onChange={handleCsvUpload} />
            </label>
          </div>
          
          <input 
            type="text" placeholder="名前・級で検索..." 
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-xs mb-3 outline-none focus:bg-white focus:text-[#001f3f]"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          <select 
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-[10px] font-black outline-none"
            value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
          >
            {['すべて', '池田', '川西', '宝塚'].map(b => <option key={b} value={b} className="text-black">{b}支部</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {loading ? <p className="p-10 text-center text-[10px] font-bold text-gray-300 animate-pulse">読み込み中...</p> : 
            filteredStudents.map(s => (
              <button key={s.id} onClick={() => setSelectedStudent(s)}
                className={`w-full p-5 text-left transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-r-4 border-[#ff6600]' : 'hover:bg-gray-50'}`}>
                <p className="font-black text-[#001f3f] text-sm">{s.name}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">{(s as any).branch} | {s.kyu}</p>
              </button>
            ))
          }
        </div>
      </div>

      {/* --- 右側：評価・合否操作パネル --- */}
      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-6 md:p-10">
        {selectedStudent ? (
          <EvaluationDetail 
            student={selectedStudent} 
            isMaster={isMaster} 
            onRefresh={() => { loadStudents(); }} 
            // 昇級時に親コンポーネントの選択状態も更新する
            onKyuUpdate={(newKyu) => setSelectedStudent({...selectedStudent, kyu: newKyu})}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-300">
            <div className="text-6xl mb-4 opacity-20">🥋</div>
            <p className="font-black text-xs uppercase tracking-[0.4em]">生徒を選択してください</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* --- 評価詳細コンポーネント --- */
function EvaluationDetail({ student, isMaster, onRefresh, onKyuUpdate }: { student: Profile, isMaster: boolean, onRefresh: () => void, onKyuUpdate: (k: string) => void }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const targetBelt = getTargetBelt(student.kyu)

  useEffect(() => {
    async function fetchEvals() {
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || null })))
    }
    fetchEvals()
  }, [student.id, student.kyu, targetBelt])

  const saveGrade = async (cid: number, grade: string) => {
    setCriteria(prev => prev.map(c => c.id === cid ? { ...c, grade } : c))
    await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: cid, grade }, { onConflict: 'student_id,criterion_id' })
  }

  const handlePass = async (nextKyu: string) => {
    const { error } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id)
    if (!error) {
      alert(`${nextKyu} への昇級を完了しました`);
      onKyuUpdate(nextKyu); // 即座に画面を切り替える
      onRefresh();
    }
  }

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 flex justify-between items-center shadow-xl">
        <div>
          <h2 className="text-3xl font-black mb-1">{student.name}</h2>
          <span className="bg-[#ff6600] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{student.kyu} / {targetBelt}</span>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black opacity-40 uppercase mb-1">Total Score</p>
          <p className="text-5xl font-black leading-none">{totalScore}</p>
        </div>
      </div>

      {/* 合格・昇級セクション (スコア80以上かつマスターのみ) */}
      {totalScore >= 80 && isMaster ? (
        <div className="bg-white p-6 rounded-[30px] border-2 border-[#ff6600] shadow-lg mb-8 text-center animate-in fade-in zoom-in duration-300">
          <p className="text-[#ff6600] font-black text-xs mb-4 uppercase tracking-widest">🏆 合格基準達成！昇級を選択</p>
          <div className="grid grid-cols-2 gap-2">
            {getSelectableKyu(student.kyu).map(k => (
              <button key={k} onClick={() => handlePass(k)} className="bg-[#001f3f] text-white py-4 rounded-2xl font-black text-xs hover:bg-[#ff6600] transition-colors">{k}</button>
            ))}
          </div>
        </div>
      ) : totalScore >= 80 ? (
        <div className="bg-green-50 p-6 rounded-[30px] border border-green-200 text-center mb-8">
          <p className="text-green-600 font-black text-xs uppercase tracking-widest">審査合格ライン到達 (マスターの承認待ち)</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{c.examination_type}</p>
            <p className="text-sm font-bold text-[#001f3f] mb-4">{c.examination_content}</p>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => saveGrade(c.id, g)}
                  className={`py-3 rounded-xl font-black text-lg transition-all ${c.grade === g ? 'bg-[#ff6600] text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-200 active:bg-gray-100'}`}>
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

// 判定ロジック
function getTargetBelt(kyu: string) {
  if (!kyu || kyu === '無級') return '白帯';
  if (kyu.match(/10|9/)) return '黄帯';
  if (kyu.match(/8|7/)) return '青帯';
  if (kyu.match(/6|5/)) return '橙帯';
  if (kyu.match(/4|3/)) return '緑帯';
  if (kyu.includes('1') || kyu.includes('2')) return '茶帯';
  return '黒帯';
}

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
