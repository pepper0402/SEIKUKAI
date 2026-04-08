import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

// --- ユーティリティ ---
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

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    if (data) setStudents(data);
  }, [])

  useEffect(() => {
    loadStudents()
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
            const joined_at = cols[5]?.trim(); // F列: 入会日
            if (name) {
              await supabase.from('profiles').insert({ 
                name, kyu: kyu || '無級', branch: branch || '池田', 
                birthday: birthday || null, joined_at: joined_at || new Date().toISOString(), is_admin: false 
              });
            }
          }
        } else {
          for (const row of rows) {
            const [dan, type, content, video] = row.split(',');
            await supabase.from('criteria').insert({ dan: dan?.trim(), examination_type: type?.trim(), examination_content: content?.trim(), video_url: video?.trim() || null });
          }
        }
        alert('CSV読込完了');
        loadStudents();
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const filteredStudents = useMemo(() => {
    return students.filter(s => (s.name || '').includes(searchQuery) || (s.kyu || '').includes(searchQuery))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
  }, [students, searchQuery]);

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* SIDEBAR */}
      <div className="w-80 bg-[#111] border-r border-white/10 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-black italic tracking-tighter mb-6 uppercase">Admin Panel</h1>
          
          <div className="flex gap-2 mb-6">
            <button onClick={() => handleCsvImport('students')} className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[9px] font-black uppercase">生徒読込</button>
            <button onClick={() => handleCsvImport('criteria')} className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[9px] font-black uppercase">基準読込</button>
          </div>

          <input 
            type="text" 
            placeholder="SEARCH..." 
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs uppercase font-bold outline-none focus:border-orange-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredStudents.map(s => (
            <div 
              key={s.id} 
              onClick={() => setSelectedStudentId(s.id)}
              className={`p-4 border-b border-white/5 cursor-pointer transition-all ${selectedStudentId === s.id ? 'bg-orange-500 text-black' : 'hover:bg-white/5'}`}
            >
              <p className="font-black text-sm uppercase">{s.name}</p>
              <p className={`text-[9px] font-black ${selectedStudentId === s.id ? 'text-black/60' : 'text-orange-500'}`}>{s.kyu}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto bg-black">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={loadStudents} />
        ) : (
          <div className="h-full flex items-center justify-center opacity-5 font-black text-8xl italic select-none">SEIKUKAI</div>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ student: initialStudent, onRefresh }: any) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [student, setStudent] = useState(initialStudent);
  const [showPreview, setShowPreview] = useState(false);

  const kyu = student.kyu || '無級';
  const rule = getPromotionRule(kyu);

  useEffect(() => {
    async function fetchData() {
      const { data: crit } = await supabase.from('criteria').select('*').order('id');
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id);
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || 'D' })));
    }
    fetchData();
  }, [student.id]);

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0);
  const isReady = totalScore >= rule.minScore;

  const handlePromote = async () => {
    const idx = allKyuList.indexOf(kyu);
    const next = allKyuList[idx + 1];
    if (!next || !window.confirm(`${next}へ昇級させますか？`)) return;
    const { error } = await supabase.from('profiles').update({ kyu: next }).eq('id', student.id);
    if (!error) { setStudent({ ...student, kyu: next }); onRefresh(); }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="bg-white text-black p-8 rounded-3xl flex justify-between items-center mb-8 shadow-[0_20px_50px_rgba(255,255,255,0.1)]">
        <div>
          <h2 className="text-5xl font-black italic tracking-tighter uppercase leading-none mb-2">{student.name}</h2>
          <p className="font-black text-orange-600 uppercase tracking-widest">{kyu} <span className="text-black/20 ml-2">基準: {rule.minScore}点</span></p>
        </div>
        <div className="text-right">
          <p className="text-7xl font-black italic leading-none">{totalScore.toFixed(0)}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setShowPreview(true)} className="px-4 py-2 bg-black text-white rounded font-black text-[10px] uppercase">Preview</button>
            <button onClick={handlePromote} disabled={!isReady} className={`px-6 py-2 rounded font-black text-[10px] uppercase ${isReady ? 'bg-orange-500' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>昇級確定</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {criteria.map(c => (
          <div key={c.id} className="bg-[#111] border border-white/5 p-6 rounded-2xl flex justify-between items-center group hover:border-orange-500/50 transition-all">
            <div className="flex-1">
              <span className="text-[9px] font-black text-orange-500 uppercase block mb-1">{c.examination_type}</span>
              <p className="font-bold text-white text-sm">{c.examination_content}</p>
            </div>
            <div className="flex gap-1">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => {
                   setCriteria(prev => prev.map(item => item.id === c.id ? { ...item, grade: g } : item));
                   supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: c.id, grade: g }, { onConflict: 'student_id,criterion_id' }).then();
                }} className={`w-10 h-10 rounded font-black text-xs transition-all ${c.grade === g ? 'bg-orange-500 text-black scale-110 shadow-lg' : 'bg-white/5 text-white/20 hover:bg-white/10'}`}>{g}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md h-[90vh] rounded-[40px] overflow-hidden relative shadow-2xl">
            <button onClick={() => setShowPreview(false)} className="absolute top-6 right-6 z-[60] bg-black text-white w-10 h-10 rounded-full font-black">✕</button>
            <StudentDashboard profile={student} />
          </div>
        </div>
      )}
    </div>
  )
}
