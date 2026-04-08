import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

// --- ユーティリティ・定数 ---
const allKyuList = ['無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', '初段', '弍段', '参段', '四段', '五段'];

const getPromotionRule = (kyu: string) => {
  if (kyu.includes('準')) return { minScore: kyu.match(/10|8|6|4|2/) ? 50 : 70, needA: false };
  if (kyu.match(/10|8|6|4|2/)) return { minScore: 60, needA: false };
  return { minScore: 80, needA: true }; // 9,7,5,3,1級・無級
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

  const filteredStudents = useMemo(() => {
    return students.filter(s => (s.name || '').includes(searchQuery) || (s.kyu || '').includes(searchQuery))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
  }, [students, searchQuery]);

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  return (
    <div className="flex h-screen bg-white text-slate-800 font-sans overflow-hidden">
      {/* 左サイドバー: 名簿 */}
      <div className="w-72 border-r border-gray-100 flex flex-col h-full bg-white">
        <div className="p-6 border-b border-gray-50">
          <h1 className="text-xl font-bold tracking-tighter mb-4">誠空会 管理システム</h1>
          <input 
            type="text" placeholder="名前を検索..." 
            className="w-full bg-gray-100 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredStudents.map(s => (
            <div 
              key={s.id} onClick={() => setSelectedStudentId(s.id)}
              className={`p-4 mx-2 my-1 rounded-xl cursor-pointer transition-all ${selectedStudentId === s.id ? 'bg-orange-50 text-orange-600' : 'hover:bg-gray-50 text-slate-500'}`}
            >
              <p className="font-bold text-sm">{s.name}</p>
              <p className="text-[10px] font-bold opacity-60 uppercase">{s.kyu}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 右メイン: 評価詳細 */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {selectedStudent ? (
          <div className="p-8 max-w-4xl mx-auto">
            <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={loadStudents} />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-200 font-bold italic text-3xl">SEIKUKAI ADMIN</div>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ student: initialStudent, onRefresh }: any) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [student, setStudent] = useState(initialStudent);
  const [showPreview, setShowPreview] = useState(false);
  const [viewBelt, setViewBelt] = useState('');

  const kyu = student.kyu || '無級';
  const rule = getPromotionRule(kyu);

  useEffect(() => {
    async function fetchData() {
      const beltMatch = kyu.match(/無級|10|9|8|7|6|5|4|3|2|1|段/);
      let initialBelt = '白帯';
      if (kyu.match(/10|9/)) initialBelt = '黄帯';
      else if (kyu.match(/8|7/)) initialBelt = '青帯';
      else if (kyu.match(/6|5/)) initialBelt = '橙帯/紫帯';
      else if (kyu.match(/4|3/)) initialBelt = '緑帯';
      else if (kyu.match(/2|1/)) initialBelt = '茶帯';
      else if (kyu.match(/段/)) initialBelt = '黒帯';
      
      const target = viewBelt || initialBelt;
      setViewBelt(target);

      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', target).order('id');
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id);
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || 'D' })));
    }
    fetchData();
  }, [student.id, viewBelt]);

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0);

  const handleGradeUpdate = async (cid: number, grade: string) => {
    setCriteria(prev => prev.map(item => item.id === cid ? { ...item, grade } : item));
    await supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: cid, grade }, { onConflict: 'student_id,criterion_id' });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold mb-1">{student.name}</h2>
          <p className="text-orange-500 font-bold text-sm tracking-widest">{kyu} <span className="text-gray-300 mx-2">|</span> 目標: {rule.minScore}点</p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-black text-slate-800">{totalScore.toFixed(0)}</p>
          <button onClick={() => setShowPreview(true)} className="mt-4 px-6 py-2 bg-gray-100 rounded-full text-[10px] font-bold uppercase hover:bg-gray-200 transition-all">Preview Mobile</button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {['白帯', '黄帯', '青帯', '橙帯/紫帯', '緑帯', '茶帯', '黒帯'].map(b => (
          <button 
            key={b} onClick={() => setViewBelt(b)}
            className={`px-6 py-2 rounded-full text-[10px] font-bold whitespace-nowrap transition-all ${viewBelt === b ? 'bg-slate-800 text-white shadow-lg' : 'bg-white text-slate-400 border border-gray-100'}`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[24px] border border-gray-50 flex justify-between items-center group shadow-sm">
            <div className="flex-1">
              <span className="text-[9px] font-bold text-gray-300 uppercase block mb-1">{c.examination_type}</span>
              <p className="font-bold text-sm">{c.examination_content}</p>
            </div>
            <div className="flex gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button 
                  key={g} onClick={() => handleGradeUpdate(c.id, g)}
                  className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${c.grade === g ? 'bg-orange-500 text-white shadow-md scale-105' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-[375px] h-[700px] rounded-[40px] overflow-hidden shadow-2xl relative border-[8px] border-slate-800">
            <button onClick={() => setShowPreview(false)} className="absolute top-4 right-4 z-[60] bg-black text-white w-8 h-8 rounded-full font-bold">✕</button>
            <StudentDashboard profile={student} />
          </div>
        </div>
      )}
    </div>
  )
}
