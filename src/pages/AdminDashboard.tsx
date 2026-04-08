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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isUploading, setIsUploading] = useState(false)

  // 個別追加用
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStudent, setNewStudent] = useState({ name: '', login_email: '', branch: '池田', birthday: '', kyu: '無級' })

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

// --- 個別追加実行（認証アカウントも同時に作成） ---
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStudent.name || !newStudent.login_email) return alert('名前とメールは必須です')

    setIsUploading(true) // ローディング開始

    try {
      // 1. まずは Profiles テーブルに登録（IDを取得するため）
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .upsert([{
          name: newStudent.name,
          login_email: newStudent.login_email.toLowerCase(),
          branch: newStudent.branch,
          birthday: newStudent.birthday,
          kyu: newStudent.kyu,
          is_admin: false
        }], { onConflict: 'login_email' })
        .select()
        .single()

      if (profileError) throw profileError

      // 2. SQLエディタで実行したのと同じ「認証アカウント作成」をRPC経由または手動で行う
      // ※通常のユーザー登録(signUp)だと確認メールが飛んでしまうため、
      // 既に実行したSQLを「新しいユーザーが追加された時に自動実行するトリガー」をDB側に設定するのが一番スマートです。
      
      alert(`道場生「${newStudent.name}」を追加しました。\n初期パスワード: Seikukai2026`);
      
      setNewStudent({ name: '', login_email: '', branch: '池田', birthday: '', kyu: '無級' });
      setShowAddForm(false);
      loadStudents();

    } catch (err: any) {
      alert('エラー: ' + err.message)
    } finally {
      setIsUploading(false)
    }
  }

  // --- 支部更新 ---
  const handleBranchUpdate = async (studentId: string, newBranch: string) => {
    const { error } = await supabase.from('profiles').update({ branch: newBranch }).eq('id', studentId)
    if (!error) setStudents(prev => prev.map(s => s.id === studentId ? { ...s, branch: newBranch } : s))
  }

  // --- 名簿削除 ---
  const handleDeleteStudent = async (student: Profile) => {
    if (!window.confirm(`【退会処理】\n${student.name} さんのデータを完全に削除しますか？`)) return
    const { error } = await supabase.from('profiles').delete().eq('id', student.id)
    if (!error) {
      if (selectedStudent?.id === student.id) setSelectedStudent(null)
      loadStudents()
    }
  }

  // --- 名簿CSVアップロード ---
  const handleProfileCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
        const updates = lines.slice(1).map(line => {
          const v = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
          if (!v[8]) return null
          return { name: (v[1] || '') + (v[2] || ''), login_email: v[8].toLowerCase(), kyu: v[7] || '無級', branch: v[0] || '未設定', birthday: v[6] || '', is_admin: false }
        }).filter(Boolean) as any[]
        const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
        if (!error) { alert('名簿を更新しました'); loadStudents(); }
      } catch (err: any) { alert(err.message) } finally { setIsUploading(false); e.target.value = '' }
    }
    reader.readAsText(file)
  }

  // --- 審査基準CSVアップロード ---
  const handleCriteriaCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (!window.confirm('審査項目を一括登録しますか？')) return
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
      } catch (err: any) { alert('CSVエラー: ' + err.message) } finally { setIsUploading(false); e.target.value = '' }
    }
    reader.readAsText(file)
  }

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
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f] relative">
      
      {/* モバイル用ハンバーガーボタン */}
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 bg-[#001f3f] text-white p-3 rounded-full shadow-2xl md:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}

      {/* サイドバー */}
      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic tracking-tighter uppercase">SEIKUKAI <span className="text-orange-400">ADMIN</span></h1>
            <div className="flex gap-2">
              <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-white/50"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase">Logout</button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mb-4">
            <button onClick={() => setShowAddForm(!showAddForm)} className="w-full py-2 bg-green-600 rounded-xl text-[9px] font-black border border-green-500/20 transition-all hover:bg-green-700">＋ 個別追加</button>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-center py-2 bg-white/10 rounded-xl cursor-pointer text-[9px] font-black border border-white/10 hover:bg-white/20">👤 名簿CSV <input type="file" className="hidden" onChange={handleProfileCsvUpload} /></label>
              <label className="block text-center py-2 bg-orange-500/20 rounded-xl cursor-pointer text-[9px] font-black border border-orange-500/20 text-orange-400 hover:bg-orange-500/30">📜 審査CSV <input type="file" className="hidden" onChange={handleCriteriaCsvUpload} /></label>
            </div>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddStudent} className="mb-4 p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
              <input type="text" placeholder="氏名" required className="w-full bg-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:bg-white focus:text-[#001f3f]" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} />
              <input type="email" placeholder="メール" required className="w-full bg-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:bg-white focus:text-[#001f3f]" value={newStudent.login_email} onChange={e => setNewStudent({...newStudent, login_email: e.target.value})} />
              <div className="flex gap-2">
                <input type="date" className="flex-1 bg-white/10 rounded-lg px-2 py-1.5 text-[10px] outline-none" value={newStudent.birthday} onChange={e => setNewStudent({...newStudent, birthday: e.target.value})} />
                <select className="flex-1 bg-white/10 rounded-lg px-2 py-1.5 text-[10px] outline-none" value={newStudent.branch} onChange={e => setNewStudent({...newStudent, branch: e.target.value})}>
                  {['池田', '川西', '宝塚'].map(b => <option key={b} value={b} className="text-black">{b}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full py-2 bg-orange-500 rounded-lg text-[9px] font-black hover:bg-orange-600 transition-colors">保存する</button>
            </form>
          )}

          <input type="text" placeholder="検索..." className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none mb-2 focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <select className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black outline-none" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="すべて" className="text-black">すべての支部</option>
            {allBranchList.map(b => <option key={b} value={b} className="text-black">{b}支部</option>)}
          </select>
        </div>
        
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div key={s.id} className={`group w-full p-5 border-l-4 transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500' : 'border-transparent hover:bg-gray-50'}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 cursor-pointer" onClick={() => handleSelectStudent(s)}>
                  <p className="font-black text-sm">{s.name}</p>
                  <p className="text-[9px] font-bold text-orange-500 mt-1 uppercase">{s.kyu}</p>
                </div>
                <button onClick={() => handleDeleteStudent(s)} className="text-gray-300 hover:text-red-500 p-1 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <div className="mt-3">
                <select className="bg-gray-100 rounded-md px-2 py-1 text-[9px] font-black text-gray-500 outline-none" value={(s as any).branch} onChange={(e) => handleBranchUpdate(s.id, e.target.value)}>
                  {['池田', '川西', '宝塚'].map(b => <option key={b} value={b}>{b}支部</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* メインパネル */}
      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} isMaster={isMaster} onRefresh={() => { loadStudents(); setSelectedStudent(null); }} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-200 font-black text-xs italic tracking-widest uppercase">Select a student</div>
        )}
      </div>

      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
    </div>
  )
}

function EvaluationPanel({ student, isMaster, onRefresh }: any) {
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
        const existingEval = evals?.find(e => e.criterion_id === c.id);
        return { 
          ...c, 
          grade: existingEval ? existingEval.grade : 'D' // 評価がなければデフォルトD
        };
      }))
    }
    fetchEvals()
  }, [student.id, viewBelt])

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)
  const isScoreReady = totalScore >= 80

  const handleKyuChange = async (newKyu: string) => {
    if (window.confirm(`${student.name} を ${newKyu} に更新しますか？`)) {
      const { error } = await supabase.from('profiles').update({ kyu: newKyu }).eq('id', student.id)
      if (!error) { alert('✅ 更新しました'); onRefresh(); }
    }
  }

  const updateGrade = async (criterionId: number, newGrade: string) => {
    setCriteria(prev => prev.map(item => item.id === criterionId ? { ...item, grade: newGrade } : item));
    await supabase.from('evaluations').upsert({ 
      student_id: student.id, 
      criterion_id: criterionId, 
      grade: newGrade 
    }, { onConflict: 'student_id,criterion_id' });
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-[#001f3f] rounded-[30px] md:rounded-[40px] p-6 md:p-8 text-white mb-6 shadow-xl relative border-b-8 border-orange-500">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl md:text-3xl font-black">{student.name}</h2>
              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${isGeneral ? 'bg-purple-600' : 'bg-orange-500'}`}>{isGeneral ? '一般部' : '少年部'}</span>
            </div>
            <div className="flex gap-4">
              <div><p className="text-[10px] font-black text-white/40 uppercase mb-1">現在の級</p><p className="text-xl font-black text-orange-400">{student.kyu || '無級'}</p></div>
              <div><p className="text-[10px] font-black text-white/40 uppercase mb-1">現在の帯</p><p className="text-xl font-black">{targetBelt}</p></div>
            </div>
          </div>
          <div className="text-left md:text-right">
            <p className="text-[10px] font-black text-white/40 mb-1 uppercase">{viewBelt === '橙帯/紫帯' ? targetBelt : viewBelt} スコア</p>
            <p className={`text-5xl md:text-7xl font-black ${isScoreReady ? 'text-green-400' : 'text-white'}`}>{totalScore}</p>
          </div>
        </div>
      </div>

      {isMaster && (
        <div className={`bg-white p-6 rounded-[30px] shadow-lg border-2 mb-8 ${isScoreReady ? 'border-green-500' : 'border-gray-100'}`}>
          <h3 className="text-xs font-black text-[#001f3f] uppercase mb-4">🥋 昇級の実行</h3>
          <select value={student.kyu || '無級'} onChange={(e) => handleKyuChange(e.target.value)} className="w-full bg-[#f0f2f5] rounded-xl px-4 py-4 text-base font-black outline-none appearance-none cursor-pointer focus:bg-white transition-all">
            {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {belts.map(b => {
          const tabKey = (b === '橙帯' || b === '紫帯') ? '橙帯/紫帯' : b;
          return (
            <button key={b} onClick={() => setViewBelt(tabKey)} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${viewBelt === tabKey ? 'bg-[#001f3f] text-white shadow-md' : 'bg-white text-gray-400 hover:text-[#001f3f]'}`}>{b}</button>
          )
        })}
      </div>

      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-4 md:p-6 rounded-[30px] shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <div className="flex flex-col mb-4">
              <span className="text-[9px] font-black text-gray-300 uppercase mb-1">{c.examination_type}</span>
              <p className="text-sm font-bold text-[#001f3f]">{c.examination_content}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => updateGrade(c.id, g)} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-300 active:bg-gray-100'}`}>{g}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
