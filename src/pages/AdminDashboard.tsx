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

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    if (data) setStudents(data);
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  const handleCsvImport = async (type: 'students' | 'criteria') => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv';
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
            if (cols[0]) {
              await supabase.from('profiles').insert({ 
                name: cols[0]?.trim(), kyu: cols[1]?.trim() || '無級', branch: cols[2]?.trim() || '池田', 
                birthday: cols[3]?.trim() || null, joined_at: cols[5]?.trim() || new Date().toISOString(), is_admin: false 
              });
            }
          }
        } else {
          for (const row of rows) {
            const [dan, type, content, video] = row.split(',');
            await supabase.from('criteria').insert({ dan: dan?.trim(), examination_type: type?.trim(), examination_content: content?.trim(), video_url: video?.trim() || null });
          }
        }
        alert('CSV読込完了'); loadStudents();
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
    <div className="flex h-screen bg-[#f8f9fa] text-[#001f3f] font-sans overflow-hidden">
      {/* SIDEBAR: 名簿選択 */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <div className="p-6">
          <h1 className="text-xl font-black mb-6">誠空会 管理パネル</h1>
          <div className="flex gap-2 mb-4">
            <button onClick={() => handleCsvImport('students')} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold">生徒読込</button>
            <button onClick={() => handleCsvImport('criteria')} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold">基準読込</button>
          </div>
          <input 
            type="text" placeholder="名前・級で検索..." 
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div 
              key={s.id} onClick={() => setSelectedStudentId(s.id)}
              className={`p-5 cursor-pointer transition-all ${selectedStudentId === s.id ? 'bg-orange-50 border-r-4 border-orange-500' : 'hover:bg-gray-50'}`}
            >
              <p className="font-bold text-sm">{s.name}</p>
              <p className="text-[10px] font-bold text-orange-500">{s.kyu} <span className="text-gray-300 ml-2">{(s as any).branch}</span></p>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN: 評価パネル */}
      <div className="flex-1 overflow-y-auto p-10">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={loadStudents} />
        ) : (
          <div className="h-full flex items-center justify-center opacity-20">
             <h2 className="font-black text-4xl italic">SEIKUKAI</h2>
          </div>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ student: initialStudent, onRefresh }: any) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [student, setStudent] = useState(initialStudent);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);

  const kyu = student.kyu || '無級';
  const age = calculateAge(student.birthday);
  const isGeneral = age >= 15;
  const rule = getPromotionRule(kyu);

  const currentBelt = useMemo(() => {
    if (kyu === '無級' || kyu.includes('10級')) return '白帯';
    if (kyu.match(/10|9/)) return '黄帯';
    if (kyu.match(/8|7/)) return '青帯';
    if (kyu.match(/6|5/)) return isGeneral ? '紫帯' : '橙帯';
    if (kyu.match(/4|3/)) return '緑帯';
    if (kyu.match(/2|1/)) return '茶帯';
    return '黒帯';
  }, [kyu, isGeneral]);

  const [viewBelt, setViewBelt] = useState((currentBelt === '橙帯' || currentBelt === '紫帯') ? '橙帯/紫帯' : currentBelt);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', viewBelt).order('id');
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id);
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || 'D' })));
      setLoading(false);
    }
    fetchData();
  }, [student.id, viewBelt]);

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0);
  const isReady = totalScore >= rule.minScore;

  const handlePromote = async () => {
    const idx = allKyuList.indexOf(kyu);
    const next = allKyuList[idx + 1];
    if (!next || !window.confirm(`${next}へ昇級させますか？`)) return;
    const { error } = await supabase.from('profiles').update({ kyu: next }).eq('id', student.id);
    if (!error) { setStudent({ ...student, kyu: next }); onRefresh(); }
  };

  const belts = isGeneral ? ['白帯', '黄帯', '青帯', '紫帯', '緑帯', '茶帯', '黒帯'] : ['白帯', '黄帯', '青帯', '橙帯', '緑帯', '茶帯', '黒帯'];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-[40px] p-8 shadow-xl shadow-gray-200/50 border border-white mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black mb-2">{student.name}</h2>
          <div className="flex gap-4">
            <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">{kyu}</span>
            <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">目標: {rule.minScore}点</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-6xl font-black leading-none">{totalScore.toFixed(0)}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setShowPreview(true)} className="px-4 py-2 bg-gray-100 rounded-xl text-[10px] font-black uppercase">Preview</button>
            <button onClick={handlePromote} disabled={!isReady} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${isReady ? 'bg-orange-500 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}>昇級確定</button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-8">
        {belts.map(b => (
          <button key={b} onClick={() => setViewBelt((b === '橙帯' || b === '紫帯') ? '橙帯/紫帯' : b)} className={`px-5 py-2.5 rounded-2xl text-[10px] font-bold whitespace-nowrap transition-all border ${viewBelt === ((b === '橙帯' || b === '紫帯') ? '橙帯/紫帯' : b) ? 'bg-[#001f3f] text-white border-transparent' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>{b}</button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? <div className="text-center py-20 animate-pulse text-gray-200 font-black italic">LOADING...</div> : criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] border border-gray-100 flex justify-between items-center group">
            <div className="flex-1 pr-4">
              <span className="text-[9px] font-black text-gray-300 uppercase block mb-1">{c.examination_type}</span>
              <p className="font-bold text-sm leading-snug">{c.examination_content}</p>
            </div>
            <div className="flex gap-1.5">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => {
                   setCriteria(prev => prev.map(item => item.id === c.id ? { ...item, grade: g } : item));
                   supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: c.id, grade: g }, { onConflict: 'student_id,criterion_id' }).then();
                }} className={`w-11 h-11 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}>{g}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-[#001f3f]/90 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-md h-[90vh] rounded-[50px] overflow-hidden relative shadow-2xl">
            <button onClick={() => setShowPreview(false)} className="absolute top-6 right-6 z-[60] bg-black text-white w-10 h-10 rounded-full font-black shadow-xl">✕</button>
            <StudentDashboard profile={student} />
          </div>
        </div>
      )}
    </div>
  )
}
