import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [loading, setLoading] = useState(true)

  // 【最重要】田中様のメールアドレスを管理者として固定判定
  const isMaster = adminProfile.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // 検索・フィルタリング
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const belt = getTargetBelt(s.kyu);
      const matchSearch = `${s.name} ${s.kyu} ${belt}`.toLowerCase().includes(searchQuery.toLowerCase())
      const matchBranch = branchFilter === 'すべて' || (s as any).branch === branchFilter
      return matchSearch && matchBranch
    })
  }, [students, searchQuery, branchFilter])

  // CSVインポート（管理者権限の上書き防止版）
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
        // 田中様のアドレスだけは常に is_admin = true で保持
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
      
      {/* 左側：検索・名簿パネル */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl">
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xs font-black tracking-widest">SEIKUKAI ADMIN</h1>
            <label className="text-[10px] bg-[#ff6600] px-2 py-1 rounded cursor-pointer font-black">
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

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 no-scrollbar">
          {filteredStudents.map(s => (
            <button key={s.id} onClick={() => setSelectedStudent(s)}
              className={`w-full p-5 text-left transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-r-4 border-[#ff6600]' : 'hover:bg-gray-50'}`}>
              <p className="font-black text-[#001f3f] text-sm">{s.name}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-[9px] font-bold text-gray-400">{(s as any).branch}</span>
                <span className="text-[9px] font-bold text-[#ff6600] uppercase">{s.kyu}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 右側：詳細・評価エリア */}
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

/* --- 評価・確定・昇級パネル --- */
function EvaluationPanel({ student, isMaster, onRefresh, onKyuUpdate }: { student: Profile, isMaster: boolean, onRefresh: () => void, onKyuUpdate: (k: string) => void }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [isConfirming, setIsConfirming] = useState(false)
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

  // 1. 評価確定ボタンの処理（現在の状態を保存完了とする）
  const handleConfirmEvaluation = () => {
    setIsConfirming(true)
    setTimeout(() => {
      alert('現在の評価を確定・保存しました。');
      setIsConfirming(false)
    }, 500)
  }

  // 2. 昇級確定ボタンの処理
  const handlePassAndUpgrade = async (nextKyu: string) => {
    const { error } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id)
    if (!error) {
      alert(`${student.name}君を ${nextKyu} へ昇級させました。`);
      onKyuUpdate(nextKyu);
      onRefresh();
    }
  }

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)

  return (
    <div className="max-w-2xl mx-auto">
      {/* 共通ヘッダー */}
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 flex justify-between items-center shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 text-9xl font-black italic -mr-10 -mt-10">🥋</div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black mb-1">{student.name}</h2>
          <span className="bg-[#ff6600] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{student.kyu} / {targetBelt}</span>
        </div>
        <div className="relative z-10 text-right">
          <p className="text-[10px] font-black opacity-40 mb-1">SCORE</p>
          <p className="text-5xl font-black">{totalScore}</p>
        </div>
      </div>

      {/* 操作ボタンエリア：評価確定 ＆ 昇級確定 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* 評価確定ボタン */}
        <button 
          onClick={handleConfirmEvaluation}
          disabled={isConfirming}
          className="bg-white border-2 border-[#001f3f] text-[#001f3f] py-4 rounded-[2rem] font-black text-sm tracking-widest hover:bg-[#001f3f] hover:text-white transition-all shadow-md active:scale-95"
        >
          {isConfirming ? '保存中...' : '✅ 評価を確定する'}
        </button>

        {/* 昇級確定ボタン (80点以上かつマスターのみ) */}
        {totalScore >= 80 && isMaster && (
          <div className="animate-in slide-in-from-right duration-500">
            <select 
              onChange={(e) => e.target.value && handlePassAndUpgrade(e.target.value)}
              className="w-full bg-[#ff6600] text-white py-4 rounded-[2rem] font-black text-sm text-center outline-none shadow-lg shadow-orange-100 appearance-none cursor-pointer"
            >
              <option value="">🏆 昇級を確定させる</option>
              {getSelectableKyu(student.kyu).map(k => (
                <option key={k} value={k} className="text-black">{k} に昇級</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 評価基準リスト */}
      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] shadow-sm border border-gray-100">
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">{c.examination_type}</p>
            <p className="text-sm font-bold text-[#001f3f] mb-4 leading-tight">{c.examination_content}</p>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => saveGrade(c.id, g)}
                  className={`py-3 rounded-xl font-black text-lg transition-all ${c.grade === g ? 'bg-[#ff6600] text-white shadow-md scale-105' : 'bg-gray-50 text-gray-200 active:bg-gray-100'}`}>
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

/* 判定用ヘルパー */
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
