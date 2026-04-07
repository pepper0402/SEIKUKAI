import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [isUploading, setIsUploading] = useState(false)

  const isMaster = adminProfile?.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
        
        const updates = lines.slice(1).map(line => {
          const v = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
          if (!v[8]) return null
          
          return { 
            name: (v[1] || '') + (v[2] || ''), 
            login_email: v[8].toLowerCase(), 
            kyu: v[7] || '無級', 
            branch: v[10] || '未設定',
            grade_level: v[4] || '', // CSVの学年列
            is_admin: v[8].toLowerCase() === 'mr.pepper0402@gmail.com'
          }
        }).filter(Boolean) as any[]

        if (updates.length > 0) {
          const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
          if (error) throw error
          // 成功ポップアップ
          alert(`✅ CSV読み込み完了\n${updates.length} 名のデータを更新しました。`)
          loadStudents()
        }
      } catch (err: any) {
        alert('❌ CSVの読み込みに失敗しました: ' + err.message)
      } finally {
        setIsUploading(false)
        e.target.value = ''
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
      const k = (s.name || '') + (s.kyu || '') + ((s as any).branch || '')
      return k.toLowerCase().includes(searchQuery.toLowerCase()) && (branchFilter === 'すべて' || (s as any).branch === branchFilter)
    })
  }, [students, searchQuery, branchFilter])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl z-10">
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic tracking-tighter">SEIKUKAI <span className="text-orange-400">ADMIN</span></h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase shadow-lg hover:bg-red-700">Logout</button>
          </div>
          <div className="space-y-3">
            <label className={`block w-full text-center py-2 rounded-xl cursor-pointer text-[10px] font-black border border-white/10 transition-all ${isUploading ? 'bg-gray-500 opacity-50' : 'bg-white/10 hover:bg-white/20'}`}>
              {isUploading ? '処理中...' : 'CSV名簿を読込'} 
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} disabled={isUploading} />
            </label>
            <input type="text" placeholder="検索..." className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <select className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black outline-none focus:bg-white focus:text-[#001f3f]" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              {dynamicBranches.map(b => <option key={b} value={b} className="text-black">{b === 'すべて' ? 'すべての支部' : `${b}支部`}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <button key={s.id} onClick={() => setSelectedStudent(s)} className={`w-full p-5 text-left border-l-4 transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500' : 'border-transparent hover:bg-gray-50'}`}>
              <p className="font-black text-sm">{s.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{(s as any).branch || '未設定'}</span>
                <span className="text-[9px] font-bold text-orange-500 uppercase">{s.kyu || '無級'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-6 md:p-10">
        {selectedStudent ? (
          <EvaluationPanel 
            key={selectedStudent.id} 
            student={selectedStudent} 
            isMaster={isMaster} 
            onRefresh={() => { loadStudents(); setSelectedStudent(null); }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-200 font-black text-[10px] tracking-widest uppercase italic">Select Student</div>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ student, isMaster, onRefresh }: any) {
  const allKyuList = [
    '無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', '準6級', '6級', 
    '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', 
    '初段', '弍段', '参段', '四段', '五段'
  ]

  // 高校生以上の判定
  const isAdult = useMemo(() => {
    const g = student.grade_level || "";
    return g.includes("高") || g.includes("大") || g.includes("一般") || g.includes("社");
  }, [student.grade_level]);

  // ターゲット帯の自動判定ロジック（充当ルール込み）
  const getAutoTargetBelt = (kyu: string, adult: boolean) => {
    const k = kyu || '無級';
    if (k === '無級' || k === '準10級') return '白帯';
    if (k.match(/10|9/)) return '黄帯';
    if (k.match(/8|7/)) return '青帯';
    // 中学生以下は橙、高校生以上は紫（中学生の橙は一般の紫に充当）
    if (k.match(/6|5/)) return adult ? '紫帯' : '橙帯'; 
    if (k.match(/4|3/)) return '緑帯';
    if (k.includes('1') || k.includes('2')) return '茶帯';
    return '黒帯';
  }

  const [viewBelt, setViewBelt] = useState(getAutoTargetBelt(student?.kyu, isAdult))
  const [criteria, setCriteria] = useState<any[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  
  const belts = ['白帯', '黄帯', '青帯', '橙帯', '紫帯', '緑帯', '茶帯', '黒帯']

  useEffect(() => {
    async function fetchEvals() {
      if (!student?.id) return
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', viewBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || null })))
    }
    fetchEvals()
  }, [student?.id, viewBelt])

  const saveGrade = async (cid: number, grade: string | null) => {
    setCriteria(prev => prev.map(c => c.id === cid ? { ...c, grade } : c))
    if (!grade) {
      await supabase.from('evaluations').delete().match({ student_id: student.id, criterion_id: cid })
    } else {
      await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: cid, grade }, { onConflict: 'student_id,criterion_id' })
    }
  }

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)
  const isScoreReady = totalScore >= 80

  const handleKyuChange = async (newKyu: string) => {
    if (!newKyu || newKyu === student.kyu) return

    const currentIndex = allKyuList.indexOf(student.kyu || '無級')
    const newIndex = allKyuList.indexOf(newKyu)

    // 飛び級禁止ロジック
    if (newIndex > currentIndex + 1) {
      alert(`❌ 飛び級はできません。\n次は【${allKyuList[currentIndex + 1]}】への昇段となります。`)
      return
    }

    // 80点ルール
    if (newIndex > currentIndex && !isScoreReady) {
      alert(`❌ スコアが80点に達していないため、昇段できません。`)
      return
    }

    if (!window.confirm(`${student.name} を 【${newKyu}】 に変更しますか？`)) return
    
    setIsUpdating(true)
    const { error } = await supabase.from('profiles').update({ kyu: newKyu }).eq('id', student.id)
    if (!error) {
      alert('✅ 級を更新しました。')
      onRefresh()
    }
    setIsUpdating(false)
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-black mb-2">{student?.name}</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="bg-orange-500 px-3 py-1 rounded-full text-[10px] font-black uppercase">Current: {student?.kyu || '無級'}</span>
              <span className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-black">{isAdult ? '一般/高校生' : '中学生以下'}</span>
              <select value={viewBelt} onChange={(e) => setViewBelt(e.target.value)} className="bg-white/20 border border-white/20 rounded-lg px-2 py-1 text-[10px] font-black text-white outline-none">
                {belts.map(b => <option key={b} value={b} className="text-black">{b}の評価を表示</option>)}
              </select>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-orange-400 mb-1">{viewBelt} SCORE</p>
            <p className={`text-6xl font-black tabular-nums ${isScoreReady ? 'text-green-400' : 'text-white'}`}>{totalScore}</p>
          </div>
        </div>
      </div>

      {isMaster && (
        <div className={`bg-white p-6 rounded-[30px] shadow-lg border-2 mb-8 transition-all ${isScoreReady ? 'border-green-500' : 'border-gray-200'}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-black text-[#001f3f]">⚙️ 級・段位の管理</h3>
            {!isScoreReady && <span className="text-[9px] bg-red-100 text-red-600 px-2 py-1 rounded-full font-black">Score 80+ Required</span>}
          </div>
          
          <select 
            disabled={isUpdating || !isScoreReady}
            value={student.kyu || '無級'}
            onChange={(e) => handleKyuChange(e.target.value)}
            className={`w-full border-none rounded-xl px-4 py-3 text-sm font-black outline-none appearance-none cursor-pointer transition-colors ${!isScoreReady ? 'bg-gray-100 text-gray-400' : 'bg-[#f0f2f5] text-[#001f3f]'}`}
          >
            {allKyuList.map(k => (
              <option key={k} value={k}>{k === student.kyu ? `★ ${k}` : k}</option>
            ))}
          </select>
          <p className="mt-3 text-[9px] font-bold text-gray-400">※ 1つ上の級のみ昇段可能です。</p>
        </div>
      )}

      <div className="space-y-4">
        {criteria.length > 0 ? criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] shadow-sm border border-gray-100 group">
            <div className="flex justify-between items-start mb-4">
              <p className="text-sm font-bold text-[#001f3f]">{c.examination_content}</p>
              {c.grade && <button onClick={() => saveGrade(c.id, null)} className="text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕ RESET</button>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => saveGrade(c.id, g)} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )) : (
          <div className="text-center py-10 text-gray-300 text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-gray-100 rounded-[30px]">No Data for {viewBelt}</div>
        )}
      </div>
    </div>
  )
}
