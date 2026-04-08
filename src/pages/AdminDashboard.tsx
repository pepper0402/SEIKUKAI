import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

// --- ユーティリティ ---
const allKyuList = [
  '無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', 
  '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', 
  '初段', '弍段', '参段', '四段', '五段'
];

// どんな形式の日付が来ても年齢を計算する
const calculateAge = (birthdayStr: any) => {
  if (!birthdayStr || birthdayStr === "") return 0;
  try {
    const datePart = String(birthdayStr).split('T')[0].replace(/\//g, '-');
    const birthDate = new Date(datePart);
    if (isNaN(birthDate.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  } catch (e) { return 0; }
};

const getBeltColorClass = (beltName: string) => {
  switch (beltName) {
    case '白帯': return 'bg-gray-100 text-gray-600 border-gray-200';
    case '黄帯': return 'bg-yellow-400 text-yellow-900 border-yellow-500';
    case '青帯': return 'bg-blue-600 text-white border-blue-700';
    case '橙帯': return 'bg-orange-500 text-white border-orange-600';
    case '紫帯': return 'bg-purple-600 text-white border-purple-700';
    case '緑帯': return 'bg-green-600 text-white border-green-700';
    case '茶帯': return 'bg-[#5D4037] text-white border-[#3E2723]';
    case '黒帯': return 'bg-black text-white border-gray-800';
    default: return 'bg-white text-gray-400 border-gray-100';
  }
};

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    if (data) {
      setStudents(data);
      if (selectedStudent) {
        const updated = data.find(s => s.id === selectedStudent.id);
        if (updated) setSelectedStudent({ ...updated }); 
      }
    }
  }, [selectedStudent])

  useEffect(() => {
    loadStudents()
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }, [loadStudents])

  const allBranchList = useMemo(() => {
    const branches = students.map(s => (s as any).branch).filter(Boolean)
    return Array.from(new Set(['池田', '川西', '宝塚', ...branches])).sort()
  }, [students])

  const filteredStudents = useMemo(() => {
    let result = students.filter(s => {
      const k = (s.name || '') + (s.kyu || '') + ((s as any).branch || '')
      return k.toLowerCase().includes(searchQuery.toLowerCase()) && 
             (branchFilter === 'すべて' || (s as any).branch === branchFilter)
    });
    return result.sort((a, b) => {
      if (sortBy === 'kyu') {
        return allKyuList.indexOf(b.kyu || '無級') - allKyuList.indexOf(a.kyu || '無級');
      }
      return (a.name || '').localeCompare(b.name || '', 'ja');
    });
  }, [students, searchQuery, branchFilter, sortBy])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 bg-[#001f3f] text-white p-3 rounded-full shadow-2xl md:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}

      {/* サイドバー */}
      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic uppercase leading-none">誠空会 管理パネル</h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase">Logout</button>
          </div>
          <div className="space-y-2">
            <input type="text" placeholder="名前・級で検索..." className="w-full bg-white/10 border-none rounded-xl px-4 py-2 text-xs text-white outline-none focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="flex gap-1">
              <select className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[9px] font-black outline-none" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="すべて" className="text-black">全支部</option>
                {allBranchList.map(b => <option key={b} value={b} className="text-black">{b}</option>)}
              </select>
              <select className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[9px] font-black outline-none" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="name" className="text-black">名前順</option>
                <option value="kyu" className="text-black">級順</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div key={s.id} onClick={() => {setSelectedStudent(s); if(window.innerWidth<768)setIsSidebarOpen(false);}} className={`p-5 border-l-4 cursor-pointer transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500 shadow-inner' : 'border-transparent hover:bg-gray-50'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-black text-sm">{s.name}</p>
                  <p className="text-[9px] font-bold text-orange-500 uppercase">{s.kyu}</p>
                </div>
                <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold">{(s as any).branch}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {selectedStudent ? (
          <EvaluationPanel 
            key={`${selectedStudent.id}-${selectedStudent.kyu}-${selectedStudent.birthday}`} 
            student={selectedStudent} 
            onRefresh={loadStudents} 
            allBranchList={allBranchList} 
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
             <h2 className="font-black text-4xl italic tracking-tighter uppercase">SEIKUKAI</h2>
          </div>
        )}
      </div>
    </div>
  )
}

function EditStudentModal({ student, allBranchList, onClose, onRefresh }: any) {
  const getSafeDate = (val: any) => {
    if (!val) return "";
    return String(val).split('T')[0].replace(/\//g, '-');
  };

  const [formData, setFormData] = useState({ 
    ...student, 
    birthday: getSafeDate(student.birthday) 
  });
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      name: formData.name,
      kyu: formData.kyu,
      branch: formData.branch,
      birthday: formData.birthday || null,
    }).eq('id', student.id);
    
    if (error) alert(error.message);
    else { onRefresh(); onClose(); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#001f3f]/90 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 font-black text-gray-400">✕</button>
        <h2 className="text-xl font-black italic mb-6 uppercase tracking-tight">会員詳細変更</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">氏名</label>
            <input type="text" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold border-none outline-none" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase ml-2">現在の級</label>
              <select className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold border-none outline-none" value={formData.kyu || '無級'} onChange={e => setFormData({...formData, kyu: e.target.value})}>
                {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase ml-2">所属支部</label>
              <select className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold border-none outline-none" value={formData.branch || ''} onChange={e => setFormData({...formData, branch: e.target.value})}>
                {allBranchList.map((b:string) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">生年月日</label>
            <input type="date" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold border-none outline-none" value={formData.birthday || ''} onChange={e => setFormData({...formData, birthday: e.target.value})} />
          </div>
          <div className="pt-2">
            <button type="submit" disabled={loading} className="w-full py-4 bg-[#001f3f] text-white rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all">保存する</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EvaluationPanel({ student, onRefresh, allBranchList }: any) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([])

  // 年齢判定と色付きラベルの設定
  const age = useMemo(() => calculateAge(student.birthday), [student.birthday]);
  const isGeneral = age >= 15;
  
  // ラベル部分のスタイル定義
  const sectionLabel = isGeneral ? "一般部" : "少年部";
  const sectionColorClass = isGeneral 
    ? "bg-rose-500 text-white" 
    : "bg-sky-400 text-[#001f3f]";

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
  const [viewBelt, setViewBelt]
