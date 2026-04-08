import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

// --- 定数・ユーティリティ ---
const allKyuList = [
  '無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', 
  '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', 
  '初段', '弍段', '参段', '四段', '五段'
];

const calculateAge = (birthday: string) => {
  if (!birthday) return 0;
  const normalized = birthday.replace(/\//g, '-');
  const birthDate = new Date(normalized);
  if (isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

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

// --- メインコンポーネント ---
export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStudent, setNewStudent] = useState({ name: '', login_email: '', branch: '池田', birthday: '', kyu: '無級' })
  const [isNewBranch, setIsNewBranch] = useState(false)

  const isMaster = adminProfile?.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    setStudents(data || [])
  }, [])

  useEffect(() => {
    loadStudents()
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }, [loadStudents])

  const allBranchList = useMemo(() => {
    const branches = students.map(s => (s as any).branch).filter(Boolean)
    const uniqueBranches = Array.from(new Set(['池田', '川西', '宝塚', ...branches]))
    return uniqueBranches.sort()
  }, [students])

  // 並び替えとフィルタリング
  const filteredStudents = useMemo(() => {
    let result = students.filter(s => {
      const k = (s.name || '') + (s.kyu || '') + ((s as any).branch || '')
      return k.toLowerCase().includes(searchQuery.toLowerCase()) && 
             (branchFilter === 'すべて' || (s as any).branch === branchFilter)
    });

    return result.sort((a, b) => {
      if (sortBy === 'kyu') {
        const idxA = allKyuList.indexOf(a.kyu || '無級');
        const idxB = allKyuList.indexOf(b.kyu || '無級');
        return idxB - idxA; // 級が高い順
      }
      return (a.name || '').localeCompare(b.name || '', 'ja');
    });
  }, [students, searchQuery, branchFilter, sortBy])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f] relative">
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 bg-[#001f3f] text-white p-3 rounded-full shadow-2xl md:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}

      {/* サイドバー */}
      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic tracking-tighter uppercase leading-none">SEIKUKAI <span className="text-orange-400">ADMIN</span></h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase hover:bg-red-700">Logout</button>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mb-4">
            <button onClick={() => setShowAddForm(!showAddForm)} className="w-full py-2 bg-green-600 rounded-xl text-[9px] font-black border border-green-500/20 hover:bg-green-700">
              {showAddForm ? '× 閉じる' : '＋ 個別追加'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-center py-2 bg-white/10 rounded-xl cursor-pointer text-[9px] font-black border border-white/10 hover:bg-white/20">👤 名簿CSV <input type="file" className="hidden" onChange={(e) => {/* CSV実装 */}} /></label>
              <label className="block text-center py-2 bg-orange-500/20 rounded-xl cursor-pointer text-[9px] font-black border border-orange-500/20 text-orange-400 hover:bg-orange-500/30">📜 審査CSV <input type="file" className="hidden" onChange={(e) => {/* CSV実装 */}} /></label>
            </div>
          </div>

          <div className="space-y-2">
            <input type="text" placeholder="名前・級で検索..." className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="flex gap-1">
              <select className="flex-1 bg-[#001f3f] border border-white/20 rounded-xl px-2 py-2 text-[9px] font-black text-white outline-none" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="すべて">全支部</option>
                {allBranchList.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select className="flex-1 bg-[#001f3f] border border-white/20 rounded-xl px-2 py-2 text-[9px] font-black text-white outline-none" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="name">名前順</option>
                <option value="kyu">級の順</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div key={s.id} onClick={() => {setSelectedStudent(s); if(window.innerWidth<768)setIsSidebarOpen(false);}} className={`group w-full p-5 border-l-4 cursor-pointer transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500 shadow-inner' : 'border-transparent hover:bg-gray-50'}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-sm leading-tight">{s.name}</p>
                    <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold">{(s as any).branch}</span>
                  </div>
                  <p className="text-[9px] font-bold text-orange-500 mt-1 uppercase">{s.kyu}</p>
                </div>
                <div className="text-right whitespace-nowrap pl-2">
                  <p className="text-[8px] font-black text-gray-300 uppercase">Age</p>
                  <p className="text-xs font-black">{calculateAge(s.birthday)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* メインパネル */}
      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {selectedStudent ? (
          <EvaluationPanel 
            key={selectedStudent.id} 
            student={selectedStudent} 
            isMaster={isMaster} 
            onRefresh={() => { loadStudents(); setSelectedStudent(null); }} 
            allBranchList={allBranchList} 
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
             <h2 className="font-black text-4xl italic tracking-tighter text-[#001f3f]">SEIKUKAI</h2>
             <p className="text-[10px] font-black uppercase mt-2 tracking-[0.3em]">Management System</p>
          </div>
        )}
      </div>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
    </div>
  )
}

// --- 詳細変更モーダル ---
function EditStudentModal({ student, allBranchList, onClose, onRefresh }: any) {
  const [formData, setFormData] = useState({ ...student });
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      name: formData.name,
      kyu: formData.kyu,
      branch: formData.branch,
      birthday: formData.birthday,
    }).eq('id', student.id);
    
    if (error) alert(error.message);
    else { alert('更新しました'); onRefresh(); onClose(); }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('本当に退会処理（データ削除）を行いますか？この操作は取り消せません。')) return;
    setLoading(true);
    const { error } = await supabase.from('profiles').delete().eq('id', student.id);
    if (error) alert(error.message);
    else { alert('退会処理を完了しました'); onRefresh(); onClose(); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#001f3f]/90 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 font-black text-gray-400 hover:text-black">✕</button>
        <h2 className="text-xl font-black italic mb-6 uppercase">会員詳細変更</h2>
        
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">氏名</label>
            <input type="text" className="w-full bg-gray-50 border-2 border-transparent focus:border-[#001f3f] rounded-2xl px-4 py-3 text-sm outline-none font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase ml-2">現在の級</label>
              <select className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold outline-none" value={formData.kyu} onChange={e => setFormData({...formData, kyu: e.target.value})}>
                {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase ml-2">所属支部</label>
              <select className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold outline-none" value={formData.branch} onChange={e => setFormData({...formData, branch: e.target.value})}>
                {allBranchList.map((b:string) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">生年月日</label>
            <input type="date" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none font-bold" value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} />
          </div>

          <div className="pt-4 space-y-3">
            <button type="submit" disabled={loading} className="w-full py-4 bg-[#001f3f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all">
              {loading ? '更新中...' : '情報を保存する'}
            </button>
            <button type="button" onClick={handleDelete} className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-600 hover:text-white transition-all">
              退会処理を実行
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- 評価パネル ---
function EvaluationPanel({ student, onRefresh, allBranchList }: any) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const age = useMemo(() => calculateAge(student.birthday), [student.birthday]);
  const isGeneral = age >= 15;
  const [criteria, setCriteria] = useState<any[]>([])

  const targetBelt = useMemo(() => {
    const k = student.kyu || '無級';
    if (k === '無級' || k === '準10級') return '白帯';
    if (k.match(/10|9/)) return '黄帯';
    if (k.match(/8|7/)) return '青帯';
    if (k.match(/6|5/)) return isGeneral ? '紫帯' : '橙帯';
    if (k.match(/4|3/)) return '緑帯';
    if (k.includes('1') || k.includes('2')) return '茶帯';
    return '黒帯';
  }, [student.kyu, isGeneral]);

  const dbBeltName = (targetBelt === '橙帯' || targetBelt === '紫帯') ? '橙帯/紫帯' : targetBelt;
  const [viewBelt, setViewBelt] = useState(dbBeltName);

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

  const handlePromote = async () => {
    const currentIdx = allKyuList.indexOf(student.kyu || '無級');
    if (currentIdx >= allKyuList.length - 1) return alert('既に最高位です');
    const nextKyu = allKyuList[currentIdx + 1];
    
    if (!window.confirm(`「${nextKyu}」への昇級を確定しますか？`)) return;
    
    const { error } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id);
    if (error) alert(error.message);
    else { alert(`${nextKyu}に昇級しました！`); onRefresh(); }
  };

  const updateGrade = async (criterionId: number, newGrade: string) => {
    setCriteria(prev => prev.map(item => item.id === criterionId ? { ...item, grade: newGrade } : item));
    await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: criterionId, grade: newGrade }, { onConflict: 'student_id,criterion_id' });
  }

  const belts = isGeneral 
    ? ['白帯', '黄帯', '青帯', '紫帯', '緑帯', '茶帯', '黒帯'] 
    : ['白帯', '黄帯', '青帯', '橙帯', '緑帯', '茶帯', '黒帯'];

  return (
    <div className="max-w-2xl mx-auto pb-20">
      {/* ユーザー情報ヘッダー */}
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-black">{student.name}</h2>
                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${isGeneral ? 'bg-purple-600' : 'bg-orange-500'}`}>{isGeneral ? '一般部' : '少年部'}</span>
              </div>
              <div className="flex gap-6">
                <div><p className="text-[10px] font-black text-white/40 uppercase mb-1">Current</p><p className="text-xl font-black text-orange-400">{student.kyu || '無級'}</p></div>
                <div><p className="text-[10px] font-black text-white/40 uppercase mb-1">Target</p><p className="text-xl font-black">{targetBelt}</p></div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-white/40 mb-1 uppercase tracking-widest">Score</p>
              <p className={`text-7xl font-black leading-none ${isScoreReady ? 'text-green-400' : 'text-white'}`}>{totalScore.toFixed(1)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={handlePromote} className={`py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all active:scale-95 ${isScoreReady ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/40 border border-white/10'}`}>
              {isScoreReady ? '🔥 昇級を確定する' : 'スコア不足（80.0必要）'}
            </button>
            <button onClick={() => setShowEdit(true)} className="py-4 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all active:scale-95">
              ⚙️ 詳細変更・退会
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          {belts.map(b => {
            const tabKey = (b === '橙帯' || b === '紫帯') ? '橙帯/紫帯' : b;
            return (
              <button key={b} onClick={() => setViewBelt(tabKey)} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${viewBelt === tabKey ? 'bg-[#001f3f] text-white shadow-md' : 'bg-white text-gray-400 hover:text-[#001f3f]'}`}>{b}</button>
            )
          })}
        </div>
        <button onClick={() => setShowPreview(true)} className="shrink-0 px-4 py-2 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg ml-2">Preview</button>
      </div>

      {/* 審査項目リスト */}
      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[35px] shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <div className="flex flex-col mb-4">
              <span className="text-[9px] font-black text-gray-300 uppercase mb-1 tracking-wider">{c.examination_type}</span>
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-bold text-[#001f3f] leading-snug flex-1">{c.examination_content}</p>
                {c.video_url && (
                  <div className="flex flex-wrap gap-1 shrink-0">
                    {c.video_url.split(/[\s,\n]+/).filter((url:string) => url.startsWith('http')).map((url:string, i:number) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-600 hover:text-white transition-all border border-orange-100 shadow-sm text-xs">▶️</a>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => updateGrade(c.id, g)} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}>{g}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 各種モーダル */}
      {showEdit && <EditStudentModal student={student} allBranchList={allBranchList} onClose={() => setShowEdit(false)} onRefresh={onRefresh} />}
      
      {showPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#001f3f]/95 backdrop-blur-md">
          <div className="relative w-full max-w-md h-[90vh] overflow-hidden rounded-[50px] bg-white shadow-2xl">
            <button onClick={() => setShowPreview(false)} className="absolute top-6 right-6 z-[110] w-10 h-10 bg-black text-white rounded-full font-black">✕</button>
            <div className="h-full overflow-y-auto pt-2">
              <StudentDashboard profile={student} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
