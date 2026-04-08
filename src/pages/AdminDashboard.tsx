import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

// --- ユーティリティ: 年齢計算 ---
const calculateAge = (birthday: string) => {
  if (!birthday) return 0;
  const normalizedBirthday = birthday.replace(/\//g, '-');
  const birthDate = new Date(normalizedBirthday);
  if (isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

// --- CSVパース用のユーティリティ (複雑な引用符や改行に対応) ---
const parseCsvLine = (text: string): string[] => {
  const result: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') { cell += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { cell += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { result.push(cell.trim()); cell = ''; }
      else { cell += char; }
    }
  }
  result.push(cell.trim());
  return result;
};

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isUploading, setIsUploading] = useState(false)

  // 個別追加用
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStudent, setNewStudent] = useState({ name: '', login_email: '', branch: '池田', birthday: '', kyu: '無級' })
  const [isNewBranch, setIsNewBranch] = useState(false) 

  const isMaster = adminProfile?.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
  }, [])

  useEffect(() => { 
    loadStudents() 
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }, [loadStudents])

  const handleSelectStudent = (student: Profile) => {
    setSelectedStudent(student)
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }

  const allBranchList = useMemo(() => {
    const branches = students.map(s => (s as any).branch).filter(Boolean)
    const uniqueBranches = Array.from(new Set(['池田', '川西', '宝塚', ...branches]))
    return uniqueBranches.sort()
  }, [students])

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStudent.name || !newStudent.login_email) return alert('名前とメールは必須です')
    setIsUploading(true)
    const { error } = await supabase.from('profiles').upsert([{
      ...newStudent,
      login_email: newStudent.login_email.toLowerCase(),
      is_admin: false
    }], { onConflict: 'login_email' })

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      alert(`「${newStudent.name}」を追加しました。\n初期パスワード: Seikukai2026`);
      setNewStudent({ name: '', login_email: '', branch: '池田', birthday: '', kyu: '無級' });
      setShowAddForm(false); setIsNewBranch(false); loadStudents();
    }
    setIsUploading(false)
  }

  const handleBranchUpdate = async (studentId: string, newBranch: string) => {
    const { error } = await supabase.from('profiles').update({ branch: newBranch }).eq('id', studentId)
    if (!error) setStudents(prev => prev.map(s => s.id === studentId ? { ...s, branch: newBranch } : s))
  }

  const handleCriteriaCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (!window.confirm('⚠️ 注意：現在の全審査項目を削除し、このCSVの内容に【完全に上書き】します。よろしいですか？')) {
      e.target.value = ''; return;
    }
    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
        const updates = lines.slice(1).map(line => {
          const v = parseCsvLine(line);
          if (!v[0] || !v[2]) return null 
          return { dan: v[0], examination_type: v[1] || '基本', examination_content: v[2], video_url: v[3] || '' }
        }).filter(Boolean) as any[]

        if (updates.length > 0) {
          await supabase.from('criteria').delete().neq('id', 0)
          const { error: insError } = await supabase.from('criteria').insert(updates)
          if (insError) throw insError
          alert(`✅ 審査項目を ${updates.length} 件で更新しました。`)
          window.location.reload(); 
        }
      } catch (err: any) { alert('CSVエラー: ' + err.message) } finally { setIsUploading(false); e.target.value = '' }
    }
    reader.readAsText(file)
  }

  const handleProfileCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
        const updates = lines.slice(1).map(line => {
          const v = parseCsvLine(line);
          if (!v[8]) return null
          return { name: (v[1] || '') + (v[2] || ''), login_email: v[8].toLowerCase(), kyu: v[7] || '無級', branch: v[0] || '未設定', birthday: v[6] || '', is_admin: false }
        }).filter(Boolean) as any[]
        const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
        if (!error) { alert('名簿を更新しました'); loadStudents(); }
      } catch (err: any) { alert(err.message) } finally { setIsUploading(false); e.target.value = '' }
    }
    reader.readAsText(file)
  }

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const k = (s.name || '') + (s.kyu || '') + ((s as any).branch || '')
      return k.toLowerCase().includes(searchQuery.toLowerCase()) && (branchFilter === 'すべて' || (s as any).branch === branchFilter)
    })
  }, [students, searchQuery, branchFilter])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f] relative">
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 bg-[#001f3f] text-white p-3 rounded-full shadow-2xl md:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}

      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic tracking-tighter uppercase leading-none">SEIKUKAI <span className="text-orange-400">ADMIN</span></h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase hover:bg-red-700">Logout</button>
          </div>
          <div className="grid grid-cols-1 gap-2 mb-4">
            <button onClick={() => setShowAddForm(!showAddForm)} className="w-full py-2 bg-green-600 rounded-xl text-[9px] font-black border border-green-500/20 hover:bg-green-700 transition-all">
              {showAddForm ? '× 閉じる' : '＋ 個別追加'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-center py-2 bg-white/10 rounded-xl cursor-pointer text-[9px] font-black border border-white/10 hover:bg-white/20">👤 名簿CSV <input type="file" className="hidden" onChange={handleProfileCsvUpload} /></label>
              <label className="block text-center py-2 bg-orange-500/20 rounded-xl cursor-pointer text-[9px] font-black border border-orange-500/20 text-orange-400 hover:bg-orange-500/30">📜 審査CSV <input type="file" className="hidden" onChange={handleCriteriaCsvUpload} /></label>
            </div>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddStudent} className="mb-4 p-3 bg-white/5 rounded-xl border border-white/10 space-y-2 animate-in fade-in slide-in-from-top-2">
              <input type="text" placeholder="氏名" required className="w-full bg-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:bg-white focus:text-[#001f3f]" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} />
              <input type="email" placeholder="メール" required className="w-full bg-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:bg-white focus:text-[#001f3f]" value={newStudent.login_email} onChange={e => setNewStudent({...newStudent, login_email: e.target.value})} />
              <input type="date" className="w-full bg-white/10 rounded-lg px-2 py-1.5 text-xs outline-none" value={newStudent.birthday} onChange={e => setNewStudent({...newStudent, birthday: e.target.value})} />
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[8px] font-bold text-white/50 uppercase">支部設定</span>
                  <button type="button" onClick={() => setIsNewBranch(!isNewBranch)} className="text-[8px] text-orange-400 font-bold underline">{isNewBranch ? 'リストから選ぶ' : '新しい支部を追加'}</button>
                </div>
                {isNewBranch ? (
                  <input type="text" placeholder="新しい支部名を入力" required className="w-full bg-orange-500/20 border border-orange-500/30 rounded-lg px-3 py-1.5 text-xs outline-none text-white placeholder:text-white/40" value={newStudent.branch} onChange={e => setNewStudent({...newStudent, branch: e.target.value})} />
                ) : (
                  <select className="w-full bg-white/10 rounded-lg px-2 py-1.5 text-xs outline-none text-white" value={newStudent.branch} onChange={e => setNewStudent({...newStudent, branch: e.target.value})}>
                    {allBranchList.map(b => <option key={b} value={b} className="text-black">{b}</option>)}
                  </select>
                )}
              </div>
              <button type="submit" disabled={isUploading} className="w-full py-2 bg-orange-500 rounded-lg text-[9px] font-black hover:bg-orange-600 transition-colors uppercase tracking-widest">{isUploading ? '保存中...' : '保存する'}</button>
            </form>
          )}

          <div className="space-y-2">
            <input type="text" placeholder="検索..." className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <select className="w-full bg-[#001f3f] border border-white/20 rounded-xl px-4 py-2 text-[10px] font-black text-white outline-none cursor-pointer" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="すべて">すべての支部</option>
              {allBranchList.map(b => <option key={b} value={b}>{b}支部</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div key={s.id} className={`group w-full p-5 border-l-4 transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500 shadow-inner' : 'border-transparent hover:bg-gray-50'}`}>
              <div className="flex justify-between items-start cursor-pointer" onClick={() => handleSelectStudent(s)}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-sm leading-tight">{s.name}</p>
                    <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold whitespace-nowrap">{(s as any).branch}</span>
                  </div>
                  <p className="text-[9px] font-bold text-orange-500 mt-1 uppercase tracking-wider">{s.kyu}</p>
                </div>
                <div className="text-right whitespace-nowrap pl-2">
                  <p className="text-[8px] font-black text-gray-300 uppercase">Age</p>
                  <p className="text-xs font-black text-[#001f3f]">{calculateAge(s.birthday)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} isMaster={isMaster} onRefresh={() => { loadStudents(); setSelectedStudent(null); }} allBranchList={allBranchList} onBranchUpdate={handleBranchUpdate} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
             <h2 className="font-black text-4xl italic tracking-tighter text-[#001f3f] leading-none">SEIKUKAI</h2>
             <p className="text-[10px] font-black uppercase mt-2 tracking-[0.3em]">Management System</p>
          </div>
        )}
      </div>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
    </div>
  )
}

function EvaluationPanel({ student, isMaster, onRefresh, allBranchList, onBranchUpdate }: any) {
  const allKyuList = ['無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', '初段', '弍段', '参段', '四段', '五段']
  const age = useMemo(() => calculateAge(student.birthday), [student.birthday]);
  const isGeneral = age >= 15;
  const belts = useMemo(() => {
    const base = ['白帯', '黄帯', '青帯', '橙帯', '紫帯', '緑帯', '茶帯', '黒帯'];
    return isGeneral ? base.filter(b => b !== '橙帯') : base.filter(b => b !== '紫帯');
  }, [isGeneral]);

  const getAutoTargetBelt = (kyu: string, gen: boolean) => {
    const k = kyu || '無級';
    if (k === '無級' || k === '準10級') return '白帯';
    if (k.match(/10|9/)) return '黄帯';
    if (k.match(/8|7/)) return '青帯';
    if (k.match(/6|5/)) return gen ? '紫帯' : '橙帯';
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
      setCriteria((crit || []).map(c => {
        const existing = evals?.find(e => e.criterion_id === c.id);
        return { ...c, grade: existing ? existing.grade : 'D' };
      }))
    }
    fetchEvals()
  }, [student.id, viewBelt])

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)
  const isScoreReady = totalScore >= 80

  const updateGrade = async (criterionId: number, newGrade: string) => {
    setCriteria(prev => prev.map(item => item.id === criterionId ? { ...item, grade: newGrade } : item));
    await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: criterionId, grade: newGrade }, { onConflict: 'student_id,criterion_id' });
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-[#001f3f] rounded-[30px] md:rounded-[40px] p-6 md:p-8 text-white mb-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
           <p className="text-8xl font-black italic tracking-tighter uppercase leading-none">SEIKUKAI</p>
        </div>
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl md:text-3xl font-black leading-tight">{student.name}</h2>
                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${isGeneral ? 'bg-purple-600' : 'bg-orange-500'}`}>{isGeneral ? '一般部' : '少年部'}</span>
              </div>
              <div className="flex gap-4">
                <div><p className="text-[10px] font-black text-white/40 uppercase mb-1">現在の級</p><p className="text-xl font-black text-orange-400 whitespace-nowrap">{student.kyu || '無級'}</p></div>
                <div><p className="text-[10px] font-black text-white/40 uppercase mb-1">対象の帯</p><p className="text-xl font-black whitespace-nowrap">{targetBelt}</p></div>
              </div>
            </div>
            <div className="text-left md:text-right whitespace-nowrap">
              <p className="text-[10px] font-black text-white/40 mb-1 uppercase tracking-widest">{viewBelt === '橙帯/紫帯' ? targetBelt : viewBelt} SCORE</p>
              <p className={`text-6xl md:text-8xl font-black leading-none ${isScoreReady ? 'text-green-400' : 'text-white'}`}>{totalScore.toFixed(1)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-5 rounded-[25px] shadow-sm border border-gray-100">
           <h3 className="text-[9px] font-black text-gray-400 uppercase mb-2">🥋 昇級・支部の変更</h3>
           <div className="space-y-2">
              <select value={student.kyu || '無級'} onChange={(e) => {
                 if (window.confirm(`${e.target.value}に更新しますか？`)) {
                   supabase.from('profiles').update({ kyu: e.target.value }).eq('id', student.id).then(() => onRefresh());
                 }
              }} className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs font-black outline-none appearance-none cursor-pointer focus:bg-gray-100 transition-colors">
                {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={(student as any).branch} onChange={(e) => onBranchUpdate(student.id, e.target.value)} className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs font-black outline-none appearance-none cursor-pointer focus:bg-gray-100 transition-colors">
                {allBranchList.map(b => <option key={b} value={b}>{b}支部</option>)}
              </select>
           </div>
        </div>
        <div className="bg-white p-5 rounded-[25px] shadow-sm border border-gray-100 flex flex-col justify-center transition-all hover:border-red-100 group">
           <h3 className="text-[9px] font-black text-gray-400 uppercase mb-2 group-hover:text-red-400 transition-colors">⚙️ 管理</h3>
           <button onClick={async () => {
             if (window.confirm(`退会処理を行います。よろしいですか？`)) {
               await supabase.from('profiles').delete().eq('id', student.id); onRefresh();
             }
           }} className="w-full py-3 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95">
             退会処理（削除）
           </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {belts.map(b => {
          const tabKey = (b === '橙帯' || b === '紫帯') ? '橙帯/紫帯' : b;
          return (
            <button key={b} onClick={() => setViewBelt(tabKey)} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${viewBelt === tabKey ? 'bg-[#001f3f] text-white shadow-md scale-105' : 'bg-white text-gray-400 hover:text-[#001f3f]'}`}>{b}</button>
          )
        })}
      </div>

      {/* 審査項目リスト */}
      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-4 md:p-6 rounded-[30px] shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <div className="flex flex-col mb-4">
              <span className="text-[9px] font-black text-gray-300 uppercase mb-1 tracking-wider">{c.examination_type}</span>
              
              {/* 【修正箇所】内容と動画を横並びに配置 */}
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-bold text-[#001f3f] leading-snug flex-1">
                  {c.examination_content}
                </p>
                
                {c.video_url && (
                  <div className="flex flex-wrap gap-1 shrink-0">
                    {c.video_url.split(/[\s,\n]+/)
                      .map((url: string) => url.trim().replace(/^"|"$/g, ''))
                      .filter((url: string) => url.startsWith('http'))
                      .map((url: string, index: number) => (
                        <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-600 hover:text-white transition-all border border-orange-100 shadow-sm active:scale-90 text-xs">
                          ▶️
                        </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 評価ボタン */}
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => updateGrade(c.id, g)} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-300 active:bg-gray-100 hover:bg-gray-100'}`}>{g}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
