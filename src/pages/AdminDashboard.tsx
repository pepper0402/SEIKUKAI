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
      const text = event.target?.result as string
      const lines = text.split('\n').filter(line => line.trim() !== '')
      const updates = lines.slice(1).map(line => {
        const v = line.split(',').map(s => s.trim())
        if (!v[8]) return null
        return { 
          name: (v[1] || '') + (v[2] || ''), 
          login_email: v[8], 
          kyu: v[7] || '無級', 
          branch: v[10] || '未設定', 
          is_admin: v[8] === 'mr.pepper0402@gmail.com'
        }
      }).filter(Boolean) as any[]
      if (updates.length > 0) {
        await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
        loadStudents()
      }
      setIsUploading(false)
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
      {/* サイドバー */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl z-10">
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic">SEIKUKAI <span className="text-orange-400">ADMIN</span></h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase shadow-lg hover:bg-red-700 transition-all">Logout</button>
          </div>
          <div className="space-y-3">
            <label className="block w-full text-center bg-white/10 hover:bg-white/20 py-2 rounded-xl cursor-pointer text-[10px] font-black border border-white/10 transition-all">
              CSV名簿を読込 <input type="file" className="hidden" onChange={handleCsvUpload} />
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

      {/* メイン詳細エリア */}
      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-6 md:p-10">
        {selectedStudent ? (
          <EvaluationPanel 
            key={selectedStudent.id} 
            student={selectedStudent} 
            isMaster={isMaster} 
            onRefresh={() => { loadStudents(); setSelectedStudent(null); }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-200 font-black text-[10px] tracking-widest uppercase">Select Student</div>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ student, isMaster, onRefresh }: any) {
  const [viewBelt, setViewBelt] = useState(getTargetBelt(student?.kyu || '無級'))
  const [criteria, setCriteria] = useState<any[]>([])
  const [isUpdatingKyu, setIsUpdatingKyu] = useState(false)
  const belts = ['白帯', '黄帯', '青帯', '橙帯', '緑帯', '茶帯', '黒帯']

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

  const handleKyuUpdate = async (newKyu: string) => {
    if (!newKyu) return
    if (!window.confirm(`${student.name} 君の級を 【${newKyu}】 に変更して確定しますか？`)) return
    
    setIsUpdatingKyu(true)
    const { error } = await supabase.from('profiles').update({ kyu: newKyu }).eq('id', student.id)
    if (!error) {
      alert('級を更新しました。')
      onRefresh()
    }
    setIsUpdatingKyu(false)
  }

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)
  const nextKyuOptions = getSelectableKyu(student?.kyu || '無級')

  return (
    <div className="max-w-2xl mx-auto pb-20">
      {/* ステータスカード */}
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-black mb-2">{student?.name}</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="bg-orange-500 px-3 py-1 rounded-full text-[10px] font-black">現在の級: {student?.kyu || '無級'}</span>
              <select value={viewBelt} onChange={(e) => setViewBelt(e.target.value)} className="bg-white/20 border border-white/20 rounded-lg px-2 py-1 text-[10px] font-black outline-none text-white">
                {belts.map(b => <option key={b} value={b} className="text-black">{b}の項目</option>)}
              </select>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">{viewBelt} 合計</p>
            <p className="text-6xl font-black tabular-nums">{totalScore}</p>
          </div>
        </div>
      </div>

      {/* 昇級確定セクション (マスターのみ) */}
      {isMaster && (
        <div className="bg-white p-6 rounded-[30px] shadow-lg border-2 border-orange-500 mb-8 animate-pulse-slow">
          <h3 className="text-xs font-black mb-4 text-[#001f3f] flex items-center gap-2">
            🏆 昇級の確定
            {totalScore >= 80 && <span className="text-green-500 text-[10px]">● 合格圏内</span>}
          </h3>
          <div className="flex gap-3">
            <select 
              disabled={isUpdatingKyu}
              onChange={(e) => handleKyuUpdate(e.target.value)}
              className="flex-1 bg-[#f0f2f5] border-none rounded-xl px-4 py-3 text-sm font-black text-[#001f3f] outline-none"
            >
              <option value="">新しい級を選択...</option>
              {nextKyuOptions.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <p className="mt-3 text-[9px] text-gray-400 font-bold italic">※ 級を確定すると名簿に反映され、一覧に戻ります。</p>
        </div>
      )}

      {/* 評価項目リスト */}
      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <p className="text-sm font-bold text-[#001f3f] leading-relaxed">{c.examination_content}</p>
              {c.grade && <button onClick={() => saveGrade(c.id, null)} className="text-[10px] text-gray-300 font-bold hover:text-red-500">✕</button>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => saveGrade(c.id, g)} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-md scale-105' : 'bg-gray-50 text-gray-200'}`}>
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

function getTargetBelt(kyu: string) {
  const k = kyu || '無級'
  if (k === '無級') return '白帯'
  if (k.match(/10|9/)) return '黄帯'
  if (k.match(/8|7/)) return '青帯'
  if (k.match(/6|5/)) return '橙帯'
  if (k.match(/4|3/)) return '緑帯'
  if (k.includes('1') || k.includes('2')) return '茶帯'
  return '黒帯'
}

function getSelectableKyu(currentKyu: string) {
  // 現在の級に基づいた昇級の選択肢を生成
  if (currentKyu === '無級') return ['準10級', '10級']
  if (currentKyu.includes('10')) return ['準9級', '9級']
  if (currentKyu.includes('9')) return ['準8級', '8級']
  if (currentKyu.includes('8')) return ['準7級', '7級']
  if (currentKyu.includes('7')) return ['準6級', '6級']
  if (currentKyu.includes('6')) return ['準5級', '5級']
  if (currentKyu.includes('5')) return ['準4級', '4級']
  if (currentKyu.includes('4')) return ['準3級', '3級']
  if (currentKyu.includes('3')) return ['準2級', '2級']
  if (currentKyu.includes('2')) return ['準1級', '1級']
  if (currentKyu.includes('1')) return ['初段']
  return ['弍段', '参段', '四段']
}
