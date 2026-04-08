import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

const allKyuList = [
  '無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', 
  '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', 
  '初段', '弍段', '参段', '四段', '五段'
];

export default function AdminDashboard() {
  const [students, setStudents] = useState<Profile[]>([])
  const [criteria, setCriteria] = useState<any[]>([])
  const [evaluations, setEvaluations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [previewStudent, setPreviewStudent] = useState<Profile | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      setLoading(true)
      setErrorMsg(null)

      // profilesを取得。roleカラムがない場合でもエラーにならないよう、全件取得を試みる
      const { data: p, error: pError } = await supabase.from('profiles').select('*');
      if (pError) throw pError;

      const { data: c, error: cError } = await supabase.from('criteria').select('*').order('id', { ascending: true });
      if (cError) throw cError;

      const { data: e, error: eError } = await supabase.from('evaluations').select('*');
      if (eError) throw eError;

      // roleカラムが存在する場合のみフィルタリング、なければ全員表示
      const studentList = p && p[0] && 'role' in p[0] 
        ? p.filter((user: any) => user.role === 'student') 
        : p;
      
      setStudents(studentList || [])
      setCriteria(c || [])
      setEvaluations(e || [])

    } catch (err: any) {
      console.error('Fetch error:', err)
      setErrorMsg(`DB Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // --- (updateStudentInfo などの処理はそのまま) ---
  const updateStudentInfo = async (id: string, updates: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) alert('更新エラー: ' + error.message)
    else fetchData()
  }

  const updateGrade = async (studentId: string, criterionId: number, grade: string | null) => {
    if (grade) {
      await supabase.from('evaluations').upsert({
        student_id: studentId,
        criterion_id: criterionId,
        grade
      }, { onConflict: 'student_id,criterion_id' })
    } else {
      await supabase.from('evaluations').delete().match({ student_id: studentId, criterion_id: criterionId })
    }
    const { data: e } = await supabase.from('evaluations').select('*')
    setEvaluations(e || [])
  }

  if (loading) return <div className="p-10 text-center font-black animate-pulse text-gray-400 italic">SYNCING SEIKUKAI DATA...</div>

  return (
    <div className="min-h-screen bg-[#f0f2f5] p-4 md:p-8 text-[#001f3f]">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Seikukai Admin</p>
            <h1 className="text-3xl font-black italic tracking-tighter uppercase leading-none">Management</h1>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="bg-red-600 text-white px-5 py-2 rounded-2xl text-[10px] font-black shadow-lg">Logout</button>
        </div>

        {errorMsg && (
          <div className="bg-orange-50 border-2 border-orange-200 p-6 rounded-[30px] mb-10 text-orange-700">
            <h2 className="font-black text-xs uppercase mb-1">Notice</h2>
            <p className="text-xs font-mono">{errorMsg}</p>
            <p className="text-[10px] mt-2 opacity-70">※profilesテーブルに 'role' カラムを作成することをお勧めします。</p>
          </div>
        )}

        <div className="space-y-8">
          {students.map(student => (
            <div key={student.id} className="bg-white rounded-[35px] shadow-xl shadow-gray-200/50 overflow-hidden border border-white">
              <div className="bg-gray-50/50 p-6 border-b flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <input 
                    type="text" 
                    className="text-xl font-black bg-transparent border-b-2 border-transparent focus:border-[#001f3f] outline-none"
                    defaultValue={student.name}
                    onBlur={(e) => updateStudentInfo(student.id, { name: e.target.value })}
                  />
                  <select 
                    className="bg-white border-2 border-gray-100 rounded-xl px-2 py-1 text-xs font-black"
                    value={student.kyu || '無級'}
                    onChange={(e) => updateStudentInfo(student.id, { kyu: e.target.value })}
                  >
                    {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <button onClick={() => setPreviewStudent(student)} className="px-4 py-2 bg-[#001f3f] text-white rounded-xl text-[10px] font-black uppercase">Preview</button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {criteria.map(criterion => {
                    const evalData = evaluations.find(e => e.student_id === student.id && e.criterion_id === criterion.id);
                    return (
                      <div key={criterion.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                        <select
                          className={`w-10 h-10 rounded-xl font-black text-center border-2 transition-all ${
                            evalData?.grade === 'A' ? 'bg-orange-500 border-orange-600 text-white' :
                            evalData?.grade === 'B' ? 'bg-slate-800 border-black text-white' :
                            evalData?.grade === 'C' ? 'bg-gray-400 border-gray-500 text-white' :
                            'bg-white border-gray-200 text-gray-200'
                          }`}
                          value={evalData?.grade || ''}
                          onChange={(e) => updateGrade(student.id, criterion.id, e.target.value || null)}
                        >
                          <option value="">-</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-gray-700 leading-tight truncate">{criterion.examination_content}</p>
                        </div>
                        {criterion.video_url && (
                          <a href={criterion.video_url} target="_blank" rel="noreferrer" className="w-7 h-7 bg-white text-red-500 rounded-lg flex items-center justify-center border border-red-50 shadow-sm text-[10px]">▶️</a>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001f3f]/90 backdrop-blur-md">
          <div className="relative w-full max-w-md h-[90vh] overflow-hidden rounded-[50px] bg-white">
            <button onClick={() => setPreviewStudent(null)} className="absolute top-6 right-6 z-[70] w-10 h-10 bg-black text-white rounded-full font-black">✕</button>
            <div className="h-full overflow-y-auto pt-4">
              <StudentDashboard profile={previewStudent} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
