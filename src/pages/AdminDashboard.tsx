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

      // 1. 生徒一覧の取得 (roleがstudentのもの)
      const { data: p, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('name');
      
      if (pError) throw pError;

      // 2. 審査項目の取得
      const { data: c, error: cError } = await supabase
        .from('criteria')
        .select('*')
        .order('id', { ascending: true });
      
      if (cError) throw cError;

      // 3. 評価データの取得
      const { data: e, error: eError } = await supabase
        .from('evaluations')
        .select('*');
      
      if (eError) throw eError;

      setStudents(p || [])
      setCriteria(c || [])
      setEvaluations(e || [])

    } catch (err: any) {
      console.error('Fetch error:', err)
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- (updateStudentInfo, resetPassword, deleteStudent, updateGrade 関数は前回と同じ) ---
  const updateStudentInfo = async (id: string, updates: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) alert('更新エラー: ' + error.message)
    else fetchData()
  }

  const resetPassword = async (student: Profile) => {
    const newPass = Math.random().toString(36).slice(-8);
    if (!window.confirm(`「${student.name}」さんのパスワードを「${newPass}」に変更しますか？`)) return;
    const { error } = await supabase.auth.admin.updateUserById(student.id, { password: newPass })
    if (error) alert('管理者権限エラー: ' + error.message)
    else alert('更新完了: ' + newPass)
  }

  const deleteStudent = async (id: string) => {
    if (!window.confirm('退会処理を実行しますか？')) return
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) alert('削除エラー: ' + error.message)
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

  if (loading) return <div className="p-10 text-center font-black animate-pulse text-gray-400">LOADING DATA...</div>

  return (
    <div className="min-h-screen bg-[#f0f2f5] p-4 md:p-8 text-[#001f3f]">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Seikukai Admin</p>
            <h1 className="text-3xl font-black italic tracking-tighter">誠空会 管理パネル</h1>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="bg-red-600 text-white px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-red-700 transition-all">Logout</button>
        </div>

        {/* エラー表示エリア */}
        {errorMsg && (
          <div className="bg-red-50 border-2 border-red-200 p-6 rounded-[30px] mb-10 text-red-600">
            <h2 className="font-black mb-2">データ取得エラー</h2>
            <p className="text-sm font-mono">{errorMsg}</p>
          </div>
        )}

        {/* 生徒が0人の場合の表示 */}
        {!loading && students.length === 0 && !errorMsg && (
          <div className="bg-white p-10 rounded-[40px] text-center border-2 border-dashed border-gray-200">
            <p className="text-gray-400 font-bold">表示できる生徒が見つかりませんでした。</p>
            <p className="text-xs text-gray-300 mt-2">profilesテーブルの role が 'student' になっているか確認してください。</p>
          </div>
        )}

        <div className="space-y-10">
          {students.map(student => (
            <div key={student.id} className="bg-white rounded-[40px] shadow-xl shadow-gray-200/50 overflow-hidden border border-white">
              <div className="bg-gray-50/50 p-6 md:p-8 border-b border-gray-100 flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Student Name</span>
                    <input 
                      type="text" 
                      className="text-2xl font-black bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-[#001f3f] outline-none transition-all"
                      defaultValue={student.name}
                      onBlur={(e) => updateStudentInfo(student.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Rank</span>
                    <select 
                      className="bg-white border-2 border-gray-100 rounded-xl px-3 py-1.5 text-sm font-black focus:border-[#001f3f] outline-none shadow-sm"
                      value={student.kyu || '無級'}
                      onChange={(e) => updateStudentInfo(student.id, { kyu: e.target.value })}
                    >
                      {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPreviewStudent(student)} className="px-4 py-2 bg-[#001f3f] text-white rounded-xl text-[10px] font-black uppercase tracking-tighter hover:scale-105 transition-all shadow-md">プレビュー</button>
                  <button onClick={() => resetPassword(student)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-gray-200 transition-all">PWリセット</button>
                  <button onClick={() => deleteStudent(student.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-red-100 transition-all">退会</button>
                </div>
              </div>

              <div className="p-6 md:p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {criteria.map(criterion => {
                    const evaluation = evaluations.find(e => e.student_id === student.id && e.criterion_id === criterion.id);
                    return (
                      <div key={criterion.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-[24px] border border-gray-100">
                        <select
                          className={`shrink-0 w-12 h-12 rounded-[18px] font-black text-center border-2 transition-all ${
                            evaluation?.grade === 'A' ? 'bg-orange-500 border-orange-600 text-white' :
                            evaluation?.grade === 'B' ? 'bg-slate-800 border-black text-white' :
                            evaluation?.grade === 'C' ? 'bg-gray-400 border-gray-500 text-white' :
                            'bg-white border-gray-200 text-gray-300'
                          }`}
                          value={evaluation?.grade || ''}
                          onChange={(e) => updateGrade(student.id, criterion.id, e.target.value || null)}
                        >
                          <option value="">-</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                        <div className="flex-1 min-w-0">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{criterion.examination_type || '審査'}</p>
                          <p className="text-[13px] font-bold text-gray-700 leading-tight line-clamp-2">{criterion.examination_content}</p>
                        </div>
                        {criterion.video_url && (
                          <div className="shrink-0 flex gap-1">
                            {criterion.video_url.split(/[,\n ]+/).filter((url:string) => url.startsWith('http')).map((url:string, i:number) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer" className="w-8 h-8 bg-white text-red-500 rounded-lg flex items-center justify-center border border-red-50 shadow-sm">
                                <span className="text-xs">▶️</span>
                              </a>
                            ))}
                          </div>
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

      {/* モーダル部分などは前回と同じ */}
      {previewStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001f3f]/90 backdrop-blur-md">
          <div className="relative w-full max-w-md h-[90vh] overflow-hidden rounded-[50px] bg-white shadow-2xl border-8 border-white">
            <button onClick={() => setPreviewStudent(null)} className="absolute top-6 right-6 z-[70] w-12 h-12 bg-black/80 text-white rounded-full font-black text-xl flex items-center justify-center shadow-xl">✕</button>
            <div className="h-full overflow-y-auto">
              <StudentDashboard profile={previewStudent} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
