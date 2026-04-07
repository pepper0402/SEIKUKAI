import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [loading, setLoading] = useState(true)

  const isMaster = adminProfile.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const belt = getTargetBelt(s.kyu);
      const matchSearch = `${s.name} ${s.kyu} ${belt}`.toLowerCase().includes(searchQuery.toLowerCase())
      const matchBranch = branchFilter === 'すべて' || (s as any).branch === branchFilter
      return matchSearch && matchBranch
    })
  }, [students, searchQuery, branchFilter])

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
        const email = v[8];
        const isAdmin = email === 'mr.pepper0402@gmail.com';
        return { name: v[1] + v[2], login_email: email, kyu: v[7] || '無級', branch: v[10] || '未設定', is_admin: isAdmin }
      }).filter(Boolean) as any[]
      
      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (!error) { alert('名簿を更新しました'); loadStudents(); }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden">
      {/* 左側：検索・名簿 */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl z-10">
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xs font-black tracking-widest text-orange-400">SEIKUKAI ADMIN</h1>
            <label className="text-[10px] bg-white/20 px-2 py-1 rounded cursor-pointer font-black hover:bg-white/30 transition-all">
              CSV読込 <input type="file" className="hidden" onChange={handleCsvUpload} />
            </label>
          </div>
          <input 
            type="text" placeholder="名前・級で検索..." 
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-xs mb-3 outline-none focus:bg-white focus:text-[#001f3f]"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select 
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-[10px] font-black outline-none"
            value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
          >
            {['すべて', '池田', '川西', '宝塚'].map(b => <option key={b} value={b} className="text-black">{b}支部</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 no-scrollbar">
          {filteredStudents.map(s => (
            <button key={s.id} onClick={() => setSelectedStudent(s)}
              className={`w-full p-5 text-left transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-r-4 border-[#ff6600]' : 'hover:bg-gray-50'}`}>
              <p className="font-black text-[#001f3f] text-sm">{s.name}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-[9px] font-bold text-gray-400">{(s as any).branch}</span>
                <span className="text-[9px] font-bold text-[#ff6600] uppercase tracking-tighter">{s.kyu}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 右側：評価・修正エリア */}
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
            <div className="text-8xl mb-4 opacity-10">🥋</div>
            <p className="font-black text-xs uppercase tracking-[0.5em]">生徒を選択してください</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* --- 評価・確定・修正パネル --- */
function EvaluationPanel({ student, isMaster, onRefresh, onKyuUpdate }: { student: Profile, isMaster: boolean, onRefresh: () => void, onKyuUpdate: (k: string) => void }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [savingId, setSavingId] = useState<number | null>(null)
  const targetBelt = getTargetBelt(student.kyu)

  useEffect(() => {
    async function fetchEvals() {
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', targetBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || null })))
    }
    fetchEvals()
  }, [student.id, student.kyu, targetBelt])

  // 評価の保存・修正ロジック
  const saveGrade = async (cid: number, grade: string | null) => {
    setSavingId(cid)
    // UIを即座に更新（楽観的アップデート）
    setCriteria(prev => prev.map(c => c.id === cid ? { ...c, grade } : c))

    if (grade === null) {
      // クリア（削除）処理
      await supabase.from('evaluations').delete().match({ student_id: student.id, criterion_id: cid })
    } else {
      // 保存・修正（上書き）処理
      await supabase.from('evaluations').upsert({ 
        student_id: student.id, 
        criterion_id: cid, 
        grade 
      }, { onConflict: 'student_id,criterion_id' })
    }
    setSavingId(null)
  }

  const handlePassAndUpgrade = async (nextKyu: string) => {
    if (!window.confirm(`${nextKyu} への昇級を確定しますか？`)) return
    const { error } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id)
    if (!error) {
      alert(`${student.name}君を ${nextKyu} へ昇級させました。`);
      onKyuUpdate(nextKyu);
      onRefresh();
    }
  }

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ヘッダー */}
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 flex justify-between items-center shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 text-9xl font-black italic -mr-10 -mt-10">🥋</div>
        <div className="relative z-10">
          <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.3em] mb-1">Evaluation Board</p>
          <h2 className="text-3xl font-black mb-1">{student.name}</h2>
          <span className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
            現在: {student.kyu}
          </span>
        </div>
        <div className="relative z-10 text-right">
          <p className="text-[10px] font-black opacity-40 mb-1">SCORE</p>
          <p className="text-5xl font-black tabular-nums">{totalScore}</p>
        </div>
      </div>

      {/* 昇級確定セクション */}
      {totalScore >= 80 && isMaster && (
        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-orange-400 shadow-xl mb-8 text-center animate-bounce-short">
          <p className="text-orange-500 font-black text-xs mb-4 uppercase tracking-widest">🏆 合格基準達成！ 昇級を確定させる</p>
          <div className="grid grid-cols-2 gap-2">
            {getSelectableKyu(student.kyu).map(k => (
              <button key={k} onClick={() => handlePassAndUpgrade(k)}
                className="bg-[#001f3f] text-white py-4 rounded-2xl font-black text-sm hover:bg-orange-500 transition-all active:scale-95">
                {k} に昇級
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 評価基準リスト */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-4">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            {targetBelt} 審査項目 一覧
          </h3>
          <p className="text-[9px] text-gray-300 font-bold italic">タップで自動保存・修正</p>
        </div>
        
        {criteria.map(c => (
          <div key={c.id} className={`bg-white p-6 rounded-[30px] shadow-sm border transition-all ${savingId === c.id ? 'border-orange-200 bg-orange-50/30' : 'border-gray-100'}`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">{c.examination_type}</p>
                <p className="text-sm font-bold text-[#001f3f] leading-tight">{c.examination_content}</p>
              </div>
              {/* クリア（取消）ボタン */}
              {c.grade && (
                <button 
                  onClick={() => saveGrade(c.id, null)}
                  className="ml-4 w-8 h-8 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center text-xs hover:bg-red-50 hover:text-red-400 transition-all"
                  title="評価を消去"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button 
                  key={g} 
                  onClick={() => saveGrade(c.id, g)}
                  className={`py-3 rounded-xl font-black text-lg transition-all active:scale-90 ${
                    c.grade === g 
                    ? 'bg-[#001f3f] text-white shadow-md scale-105' 
                    : 'bg-gray-50 text-gray-200 hover:bg-gray-100'
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

/* 判定用ヘルパー（変更なし） */
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
