import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

// --- ユーティリティ: 年齢計算 ---
const calculateAge = (birthday: string) => {
  if (!birthday) return 0;
  const birthDate = new Date(birthday.replace(/\//g, '-'));
  if (isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

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

  // --- 支部変更処理 ---
  const handleBranchUpdate = async (studentId: string, newBranch: string) => {
    const { error } = await supabase.from('profiles').update({ branch: newBranch }).eq('id', studentId)
    if (error) {
      alert('支部の更新に失敗しました')
    } else {
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, branch: newBranch } : s))
    }
  }

  // --- 名簿CSVアップロード ---
  const handleProfileCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
            branch: v[0] || '未設定',
            birthday: v[6] || '',
            is_admin: v[8].toLowerCase() === 'mr.pepper0402@gmail.com'
          }
        }).filter(Boolean) as any[]

        if (updates.length > 0) {
          const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
          if (error) throw error
          alert(`✅ 名簿を更新しました（${updates.length}名）`)
          loadStudents()
        }
      } catch (err: any) {
        alert('❌ 名簿CSVエラー: ' + err.message)
      } finally {
        setIsUploading(false)
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  // --- 審査基準CSVアップロード ---
  const handleCriteriaCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!window.confirm('審査項目を追加しますか？')) return
    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
        const updates = lines.slice(1).map(line => {
          const v = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
          if (!v[0] || !v[2]) return null 
          return { dan: v[0], examination_type: v[1] || '基本', examination_content: v[2], video_url: v[3] || '' }
        }).filter(Boolean) as any[]
        if (updates.length > 0) {
          const { error } = await supabase.from('criteria').insert(updates)
          if (error) throw error
          alert(`✅ 審査項目を ${updates.length} 件登録しました。`)
        }
      } catch (err: any) {
        alert('❌ 審査項目CSVエラー: ' + err.message)
      } finally {
        setIsUploading(false)
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  // 既存の全支部リスト（選択用）
  const allBranchList = useMemo(() => {
    const branches = students.map(s => (s as any).branch).filter(Boolean)
    return Array.from(new Set(['池田', '川西', '宝塚', ...branches]))
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
            <h1 className="text-lg font-black italic tracking-tighter text-white uppercase">SEIKUKAI <span className="text-orange-400">ADMIN</span></h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase hover:bg-red-700 transition-all shadow-lg text-white">Logout</button>
          </div>
          <div className="space-y-2 mb-4">
            <label className="block w-full text-center py-2 bg-white/10 hover:bg-white/20 rounded-xl cursor-pointer text-[9px] font-black border border-white/10 transition-all">
              👤 名簿CSV読込 <input type="file" className="hidden" onChange={handleProfileCsvUpload} />
            </label>
            <label className="block w-full text-center py-2 bg-orange-500/20 hover:bg-orange-500/40 rounded-xl cursor-pointer text-[9px] font-black border border-orange-500/20 transition-all text-orange-400">
              📜 審査基準CSV読込 <input type="file" className="hidden" onChange={handleCriteriaCsvUpload} />
            </label>
          </div>
          <input type="text" placeholder="名前検索..." className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none focus:bg-white focus:text-[#001f3f] mb-2 placeholder:text-white/30" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <div className="text-[9px] font-black text-white/40 mb-1 uppercase tracking-widest">支部フィルタ</div>
          <select className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black outline-none cursor-pointer" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="すべて" className="text-black">すべての支部</option>
            {allBranchList.map(b => <option key={b} value={b} className="text-black">{b}支部</option>)}
          </select>
        </div>
        
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div key={s.id} className={`group w-full p-5 border-l-4 transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500' : 'border-transparent hover:bg-gray-50'}`}>
              <div className="flex justify-between items-start cursor-pointer" onClick={() => setSelectedStudent(s)}>
                <div>
                  <p className="font-black text-sm">{s.name}</p>
                  <p className="text-[9px] font-bold text-orange-500 uppercase mt-1">{s.kyu}</p>
                </div>
              </div>
              {/* 支部変更ドロップダウン */}
              <div className="mt-3">
                <select 
                  className="bg-gray-100 border-none rounded-md px-2 py-1 text-[9px] font-black text-gray-500 outline-none cursor-pointer hover:bg-gray-200 transition-colors"
                  value={(s as any).branch}
                  onChange={(e) => handleBranchUpdate(s.id, e.target.value)}
                >
                  {allBranchList.map(b => <option key={b} value={b}>{b}支部</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-6 md:p-10">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} isMaster={isMaster} onRefresh={() => { loadStudents(); setSelectedStudent(null); }} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-200 font-black text-xs uppercase italic tracking-widest">対象者を選択してください</div>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ student, isMaster, onRefresh }: any) {
  const allKyuList = ['無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', '初段', '弍段', '参段', '四段', '五段']
  
  // 年齢計算と所属判定
  const age = useMemo(() => calculateAge(student.birthday), [student.birthday]);
  const isGeneral = age >= 15;

  // タブに表示する帯のリストを属性によってフィルタリング
  const belts = useMemo(() => {
    const baseBelts = ['白帯', '黄帯', '青帯', '橙帯', '紫帯', '緑帯', '茶帯', '黒帯'];
    if (isGeneral) {
      return baseBelts.filter(b => b !== '橙帯'); // 一般部には橙帯を表示しない
    } else {
      return baseBelts.filter(b => b !== '紫帯'); // 少年部には紫帯を表示しない
    }
  }, [isGeneral]);

  const getAutoTargetBelt = (kyu: string, general: boolean) => {
    const k = kyu || '無級';
    if (k === '無級' || k === '準10級') return '白帯';
    if (k.match(/10|9/)) return '黄帯';
    if (k.match(/8|7/)) return '青帯';
    if (k.match(/6|5/)) return general ? '紫帯' : '橙帯'; 
    if (k.match(/4|3/)) return '緑帯';
    if (k.includes('1') || k.includes('2')) return '茶帯';
    return '黒帯';
  }

  const targetBelt = getAutoTargetBelt(student.kyu, isGeneral);
  const dbBeltName = (targetBelt === '橙帯' || targetBelt === '紫帯') ? '橙帯/紫帯' : targetBelt;

  const [viewBelt, setViewBelt] = useState(dbBeltName)
  const [criteria, setCriteria] = useState<any[]>([])

  useEffect(() => {
    async function fetchEvals() {
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', viewBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || null })))
    }
    fetchEvals()
  }, [student.id, viewBelt])

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)
  const isScoreReady = totalScore >= 80

  const handleKyuChange = async (newKyu: string) => {
    const currentIndex = allKyuList.indexOf(student.kyu || '無級')
    const newIndex = allKyuList.indexOf(newKyu)
    if (newIndex > currentIndex + 1) return alert(`❌ 飛び級はできません。次は【${allKyuList[currentIndex + 1]}】です。`);
    if (newIndex > currentIndex && !isScoreReady) return alert(`❌ スコアが80点に達していません。`);
    
    if (window.confirm(`${student.name} を ${newKyu} に更新しますか？`)) {
      const { error } = await supabase.from('profiles').update({ kyu: newKyu }).eq('id', student.id)
      if (!error) { alert('✅ 更新しました'); onRefresh(); }
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 shadow-xl relative overflow-hidden border-b-8 border-orange-500">
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-black">{student.name}</h2>
              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${isGeneral ? 'bg-purple-600' : 'bg-orange-500'}`}>
                {isGeneral ? '一般部' : '少年部'}
              </span>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">現在の級</p>
                <p className="text-xl font-black text-orange-400">{student.kyu || '無級'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">現在の帯</p>
                <p className="text-xl font-black">{targetBelt}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-white/40 mb-1 uppercase tracking-widest">{viewBelt === '橙帯/紫帯' ? targetBelt : viewBelt} スコア</p>
            <p className={`text-7xl font-black tabular-nums ${isScoreReady ? 'text-green-400' : 'text-white'}`}>{totalScore}</p>
          </div>
        </div>
      </div>

      {isMaster && (
        <div className={`bg-white p-6 rounded-[30px] shadow-lg border-2 mb-8 ${isScoreReady ? 'border-green-500' : 'border-gray-100'}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-black text-[#001f3f] uppercase">🥋 昇段・昇級の実行</h3>
            {isScoreReady && <span className="text-[9px] bg-green-100 text-green-600 px-3 py-1 rounded-full font-black">昇段可能</span>}
          </div>
          <select 
            disabled={!isScoreReady}
            value={student.kyu || '無級'}
            onChange={(e) => handleKyuChange(e.target.value)}
            className="w-full bg-[#f0f2f5] border-none rounded-xl px-4 py-4 text-base font-black text-[#001f3f] outline-none appearance-none cursor-pointer"
          >
            {allKyuList.map(k => (
              <option key={k} value={k}>{k === student.kyu ? `現在の設定: ${k}` : k}</option>
            ))}
          </select>
        </div>
      )}

      {/* フィルタリングされた帯タブを表示 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {belts.map(b => {
          const actualTabKey = (b === '橙帯' || b === '紫帯') ? '橙帯/紫帯' : b;
          return (
            <button 
              key={b} 
              onClick={() => setViewBelt(actualTabKey)} 
              className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${viewBelt === actualTabKey ? 'bg-[#001f3f] text-white' : 'bg-white text-gray-400'}`}
            >
              {b}
            </button>
          )
        })}
      </div>

      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] shadow-sm border border-gray-100 group">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{c.examination_type}</span>
              <p className="text-sm font-bold text-[#001f3f] flex-1 px-4">{c.examination_content}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => {
                  setCriteria(prev => prev.map(item => item.id === c.id ? { ...item, grade: g } : item));
                  supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: c.id, grade: g }, { onConflict: 'student_id,criterion_id' }).then();
                }} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}>
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
