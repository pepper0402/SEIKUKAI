import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

const allKyuList = [
  '無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', 
  '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', 
  '初段', '弍段', '参段', '四段', '五段'
];

const getPromotionRule = (kyu: string) => {
  if (kyu.includes('準10級') || kyu.includes('準8級') || kyu.includes('準6級') || kyu.includes('準4級') || kyu.includes('準2級')) return { minScore: 50, needA: false };
  if (kyu.includes('10級') || kyu.includes('8級') || kyu.includes('6級') || kyu.includes('4級') || kyu.includes('2級')) return { minScore: 60, needA: false };
  if (kyu.includes('準9級') || kyu.includes('準7級') || kyu.includes('準5級') || kyu.includes('準3級') || kyu.includes('準1級')) return { minScore: 70, needA: false };
  if (kyu.includes('9級') || kyu.includes('7級') || kyu.includes('5級') || kyu.includes('3級') || kyu.includes('1級') || kyu === '無級') return { minScore: 80, needA: true };
  return { minScore: 100, needA: true };
};

const calculateAge = (birthdayStr: any) => {
  if (!birthdayStr) return 0;
  const birthDate = new Date(birthdayStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

const getBeltColorClass = (beltName: string) => {
  switch (beltName) {
    case '白帯': return 'bg-white text-gray-500 border-gray-200';
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
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    if (data) setStudents(data);
  }, [])

  useEffect(() => {
    loadStudents()
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }, [loadStudents])

  const handleCsvImport = async (type: 'students' | 'criteria') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event: any) => {
        const text = event.target.result;
        const rows = text.split('\n').slice(1).filter((r: string) => r.trim());
        if (type === 'students') {
          for (const row of rows) {
            const cols = row.split(',');
            const name = cols[0]?.trim();
            const kyu = cols[1]?.trim();
            const branch = cols[2]?.trim();
            const birthday = cols[3]?.trim();
            const joined_at = cols[5]?.trim(); // F列を入会日として取得
            
            if (name) {
              await supabase.from('profiles').insert({ 
                name, 
                kyu: kyu || '無級', 
                branch: branch || '池田', 
                birthday: birthday || null,
                joined_at: joined_at || new Date().toISOString(),
                is_admin: false 
              });
            }
          }
        } else {
          for (const row of rows) {
            const [dan, type, content, video] = row.split(',');
            await supabase.from('criteria').insert({ dan: dan?.trim(), examination_type: type?.trim(), examination_content: content?.trim(), video_url: video?.trim() || null });
          }
        }
        alert('インポート完了');
        loadStudents();
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const selectedStudent = useMemo(() => students.find(s => s.id === selectedStudentId) || null, [students, selectedStudentId]);

  const filteredStudents = useMemo(() => {
    let result = students.filter(s => {
      const k = (s.name || '') + (s.kyu || '') + ((s as any).branch || '')
      return k.toLowerCase().includes(searchQuery.toLowerCase()) && (branchFilter === 'すべて' || (s as any).branch === branchFilter)
    });
    return result.sort((a, b) => sortBy === 'kyu' ? allKyuList.indexOf(b.kyu || '無級') - allKyuList.indexOf(a.kyu || '無級') : (a.name || '').localeCompare(b.name || '', 'ja'));
  }, [students, searchQuery, branchFilter, sortBy])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic uppercase">誠空会 管理パネル</h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase">Logout</button>
          </div>
          
          <div className="flex gap-2 mb-4">
            <button onClick={() => handleCsvImport('students')} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black border border-white/10">生徒CSV読込</button>
            <button onClick={() => handleCsvImport('criteria')} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black border border-white/10">審査CSV読込</button>
          </div>

          <div className="space-y-2">
            <input type="text" placeholder="名前・級で検索..." className="w-full bg-white/10 border-none rounded-xl px-4 py-2 text-xs text-white outline-none focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div key={s.id} onClick={() => setSelectedStudentId(s.id)} className={`p-5 border-l-4 cursor-pointer ${selectedStudentId === s.id ? 'bg-orange-50 border-orange-500' : 'border-transparent hover:bg-gray-50'}`}>
              <p className="font-black text-sm">{s.name}</p>
              <p className="text-[9px] font-bold text-orange-500 uppercase">{s.kyu}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa]">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={loadStudents} />
        ) : (
          <div className="h-full flex items-center justify-center opacity-10 font-black text-6xl italic">SEIKUKAI</div>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ student: initialStudent, onRefresh }: any) {
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(initialStudent);

  const isGeneral = calculateAge(student.birthday) >= 15;
  const currentKyu = student.kyu || '無級';
  const promotionRule = getPromotionRule(currentKyu);

  useEffect(() => {
    async function fetchEvals() {
      setLoading(true);
      const targetBelt = (currentKyu.includes('6') || currentKyu.includes('5')) ? '橙帯/紫帯' : 
                         (currentKyu.includes('10') || currentKyu.includes('無')) ? '白帯' : 
                         (currentKyu.includes('9') || currentKyu.includes('10')) ? '黄帯' : '青帯'; // 簡易版
      const { data: crit } = await supabase.from('criteria').select('*').order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || 'D' })));
      setLoading(false);
    }
    fetchEvals()
  }, [student.id, currentKyu])

  const totalScore = useMemo(() => criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0), [criteria]);
  const isScoreReady = totalScore >= promotionRule.minScore;

  const handlePromote = async () => {
    const currentIdx = allKyuList.indexOf(currentKyu);
    const nextKyu = allKyuList[currentIdx + 1];
    if (!nextKyu || !window.confirm(`${nextKyu}へ昇級させますか？`)) return;
    const { error } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id);
    if (!error) { setStudent({ ...student, kyu: nextKyu }); onRefresh(); }
  };

  return (
    <div className="p-10 max-w-4xl mx-auto">
      <div className="bg-[#001f3f] rounded-[40px] p-8 text-white mb-8 shadow-2xl flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black mb-2">{student.name}</h2>
          <p className="text-orange-400 font-black">{currentKyu} / 基準: {promotionRule.minScore}点</p>
        </div>
        <div className="text-right">
          <p className="text-6xl font-black">{totalScore.toFixed(0)}</p>
          <button onClick={handlePromote} disabled={!isScoreReady} className={`mt-4 px-8 py-2 rounded-xl font-black uppercase text-xs ${isScoreReady ? 'bg-orange-500' : 'bg-white/10 text-white/20'}`}>昇級確定</button>
          <button onClick={() => setShowPreview(true)} className="ml-2 px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black">PREVIEW</button>
        </div>
      </div>
      
      <div className="grid gap-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] shadow-sm flex justify-between items-center">
            <div className="flex-1">
              <span className="text-[10px] font-black text-gray-300 block mb-1">{c.examination_type}</span>
              <p className="font-bold text-[#001f3f]">{c.examination_content}</p>
            </div>
            <div className="flex gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => {
                   setCriteria(prev => prev.map(item => item.id === c.id ? { ...item, grade: g } : item));
                   supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: c.id, grade: g }, { onConflict: 'student_id,criterion_id' }).then();
                }} className={`w-10 h-10 rounded-xl font-black ${c.grade === g ? 'bg-[#001f3f] text-white' : 'bg-gray-100 text-gray-300'}`}>{g}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {showPreview && <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"><div className="bg-white w-full max-w-md h-[90vh] rounded-[40px] overflow-hidden relative"><button onClick={() => setShowPreview(false)} className="absolute top-4 right-4 z-10 bg-black text-white w-8 h-8 rounded-full">✕</button><StudentDashboard profile={student} /></div></div>}
    </div>
  )
}
