import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    if (data) setStudents(data);
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // CSVインポート機能の復旧
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
                name: cols[0]?.trim(), 
                kyu: cols[1]?.trim() || '無級', 
                branch: cols[2]?.trim() || '池田', 
                birthday: cols[3]?.trim() || null, 
                joined_at: cols[5]?.trim() || new Date().toISOString(), 
                is_admin: false 
              });
            }
          }
        } else {
          for (const row of rows) {
            const [dan, type, content, video] = row.split(',');
            await supabase.from('criteria').insert({ 
              dan: dan?.trim(), 
              examination_type: type?.trim(), 
              examination_content: content?.trim(), 
              video_url: video?.trim() || null 
            });
          }
        }
        alert('CSV読込が完了しました'); loadStudents();
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
    <div className="flex h-screen bg-white text-[#001f3f] font-sans overflow-hidden">
      {/* 左サイドバー: 名簿選択 */}
      <div className="w-80 bg-white border-r border-gray-100 flex flex-col shadow-sm">
        <div className="p-6">
          <h1 className="text-xl font-black mb-6 tracking-tighter">誠空会 管理パネル</h1>
          
          {/* CSVボタンの再配置 */}
          <div className="flex gap-2 mb-6">
            <button onClick={() => handleCsvImport('students')} className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-[10px] font-bold border border-gray-100 transition-colors">生徒CSV読込</button>
            <button onClick={() => handleCsvImport('criteria')} className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-[10px] font-bold border border-gray-100 transition-colors">基準CSV読込</button>
          </div>

          <input 
            type="text" placeholder="名前・級で検索..." 
            className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredStudents.map(s => (
            <div 
              key={s.id} onClick={() => setSelectedStudentId(s.id)}
              className={`p-5 mx-2 my-1 rounded-2xl cursor-pointer transition-all ${selectedStudentId === s.id ? 'bg-orange-50 text-orange-600' : 'hover:bg-gray-50 text-gray-500'}`}
            >
              <p className="font-bold text-sm">{s.name}</p>
              <p className="text-[10px] font-bold opacity-60 uppercase">{s.kyu}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 右メインエリア: 評価詳細 */}
      <div className="flex-1 overflow-y-auto bg-gray-50/30">
        {selectedStudent ? (
          <div className="p-10 max-w-4xl mx-auto">
            <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={loadStudents} />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center opacity-10">
             <h2 className="font-black text-5xl italic tracking-tighter">SEIKUKAI</h2>
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
  const [viewBelt, setViewBelt] = useState('');

  const kyu = student.kyu || '無級';

  useEffect(() => {
    async function fetchData() {
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
    <div className="space-y-8">
      <div className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100 flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black mb-2 tracking-tighter">{student.name}</h2>
          <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">{kyu}</span>
        </div>
        <div className="text-right">
          <p className="text-6xl font-black leading-none">{totalScore.toFixed(0)}</p>
          <button onClick={() => setShowPreview(true)} className="mt-4 px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-[10px] font-black uppercase transition-all">Preview Mobile</button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {['白帯', '黄帯', '青帯', '橙帯/紫帯', '緑帯', '茶帯', '黒帯'].map(b => (
          <button 
            key={b} onClick={() => setViewBelt(b)}
            className={`px-6 py-3 rounded-2xl text-[10px] font-bold whitespace-nowrap transition-all ${viewBelt === b ? 'bg-[#001f3f] text-white' : 'bg-white text-gray-400 border border-gray-100 hover:border-gray-200'}`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[30px] border border-gray-100 flex justify-between items-center group shadow-sm">
            <div className="flex-1 pr-4">
              <span className="text-[9px] font-black text-gray-300 uppercase block mb-1">{c.examination_type}</span>
              <p className="font-bold text-sm leading-snug">{c.examination_content}</p>
            </div>
            <div className="flex gap-1.5">
              {['A', 'B', 'C', 'D'].map(g => (
                <button 
                  key={g} onClick={() => handleGradeUpdate(c.id, g)}
                  className={`w-11 h-11 rounded-xl font-black transition-all ${c.grade === g ? 'bg-orange-500 text-white shadow-lg scale-105' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-[#001f3f]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[380px] h-[80vh] rounded-[50px] overflow-hidden relative shadow-2xl">
            <button onClick={() => setShowPreview(false)} className="absolute top-6 right-6 z-[60] bg-black text-white w-10 h-10 rounded-full font-black">✕</button>
            <StudentDashboard profile={student} />
          </div>
        </div>
      )}
    </div>
  )
}
