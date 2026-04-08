import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard' // プレビュー用

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
  const [previewStudent, setPreviewStudent] = useState<Profile | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const { data: p } = await supabase.from('profiles').select('*').eq('role', 'student').order('name')
    const { data: c } = await supabase.from('criteria').select('*').order('id')
    const { data: e } = await supabase.from('evaluations').select('*')
    setStudents(p || [])
    setCriteria(c || [])
    setEvaluations(e || [])
    setLoading(false)
  }

  // 生徒情報の更新（名前・級）
  const updateStudentInfo = async (id: string, updates: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) alert('更新エラー: ' + error.message)
    else fetchData()
  }

  // パスワードリセット
  const resetPassword = async (email: string) => {
    const newPass = Math.random().toString(36).slice(-8);
    if (!window.confirm(`パスワードを「${newPass}」に変更しますか？（メモしてください）`)) return;
    
    // 注: 本来はRPCやEdge Functions推奨ですが、簡易的にAuth APIを使用
    const { error } = await supabase.auth.admin.updateUserById(
      students.find(s => s.email === email)?.id || '',
      { password: newPass }
    )
    if (error) alert('エラー: 管理者権限が必要です\n' + error.message)
    else alert('パスワードを更新しました')
  }

  // 退会処理
  const deleteStudent = async (id: string) => {
    if (!window.confirm('本当にこの生徒を削除しますか？この操作は取り消せません。')) return
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
    fetchData()
  }

  if (loading) return <div className="p-10 text-center font-bold">データを読込中...</div>

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 text-gray-800">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-black italic">誠空会 管理パネル</h1>
          <button onClick={() => supabase.auth.signOut()} className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold">ログアウト</button>
        </div>

        {students.map(student => (
          <div key={student.id} className="bg-white rounded-3xl shadow-sm mb-8 overflow-hidden border border-gray-200">
            {/* 生徒情報ヘッダー */}
            <div className="bg-gray-50 p-6 border-b flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <input 
                  type="text" 
                  className="text-xl font-black bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1"
                  defaultValue={student.name}
                  onBlur={(e) => updateStudentInfo(student.id, { name: e.target.value })}
                />
                <select 
                  className="bg-white border rounded px-2 py-1 text-sm font-bold"
                  value={student.kyu || '無級'}
                  onChange={(e) => updateStudentInfo(student.id, { kyu: e.target.value })}
                >
                  {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setPreviewStudent(student)}
                  className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-100"
                >
                  表示プレビュー
                </button>
                <button 
                  onClick={() => resetPassword(student.email || '')}
                  className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-200"
                >
                  PWリセット
                </button>
                <button 
                  onClick={() => deleteStudent(student.id)}
                  className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-100"
                >
                  退会
                </button>
              </div>
            </div>

            {/* 審査項目リスト */}
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {criteria
                  .filter(c => c.dan === (student.kyu?.includes('段') ? '黒帯' : '級位')) // 級か段かでフィルタ（DB構造に合わせ調整）
                  .map(criterion => {
                    const evaluation = evaluations.find(e => e.student_id === student.id && e.criterion_id === criterion.id);
                    return (
                      <div key={criterion.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                        <select
                          className={`w-12 h-12 rounded-xl font-black text-center appearance-none border-2 transition-all ${
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
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{criterion.examination_type}</p>
                          <p className="text-sm font-bold text-gray-700 truncate">{criterion.examination_content}</p>
                        </div>

                        {/* 動画ボタンを右端に配置 */}
                        {criterion.video_url && (
                          <div className="flex gap-1">
                            {criterion.video_url.split(/[,\n ]+/).filter((url:string) => url.startsWith('http')).map((url:string, i:number) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer" className="w-8 h-8 bg-red-100 text-red-600 rounded-lg flex items-center justify-center text-xs">
                                ▶️
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

      {/* プレビューモーダル */}
      {previewStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md h-[90vh] overflow-y-auto rounded-[40px] bg-white">
            <button 
              onClick={() => setPreviewStudent(null)}
              className="absolute top-4 right-4 z-[60] w-10 h-10 bg-black/50 text-white rounded-full font-bold"
            >
              ✕
            </button>
            <StudentDashboard profile={previewStudent} />
          </div>
        </div>
      )}
    </div>
  )
}
