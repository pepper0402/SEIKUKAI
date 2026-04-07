import { useEffect, useState, useRef } from 'react'
import { supabase, Profile, Criterion, Evaluation } from '../lib/supabase'

// 級の序列定義（昇級チェック用）
const KYU_ORDER = ['無級', '10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '2級', '1級', '初段'];

const gradeToScore = (grade: string | null) => {
  if (grade === 'A') return 2.5;
  if (grade === 'B') return 1.5;
  if (grade === 'C') return 0.5;
  return 0;
};

export default function AdminDashboard() {
  const [students, setStudents] = useState<Profile[]>([])
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: p } = await supabase.from('profiles').select('*').eq('role', 'student').order('name')
    const { data: c } = await supabase.from('criteria').select('*').order('id')
    const { data: e } = await supabase.from('evaluations').select('*')
    
    if (p) setStudents(p)
    if (c) setCriteria(c)
    if (e) setEvaluations(e)
    setLoading(false)
  }

  // 特定の生徒の合計スコアを計算
  const calculateTotalScore = (studentId: string) => {
    const studentEvals = evaluations.filter(e => e.student_id === studentId)
    return studentEvals.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0)
  }

  // 級の更新処理（80点未満はブロック）
  const handleKyuChange = async (student: Profile, newKyu: string) => {
    const currentScore = calculateTotalScore(student.id)
    const currentIndex = KYU_ORDER.indexOf(student.kyu || '無級')
    const newIndex = KYU_ORDER.indexOf(newKyu)

    // 上の級に上げようとしている場合のみチェック
    if (newIndex > currentIndex && currentScore < 80) {
      alert(`昇級できません。\n${student.name} の現在のスコアは ${currentScore}点です。80点以上必要です。`)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({ kyu: newKyu })
      .eq('id', student.id)

    if (error) alert('更新エラー: ' + error.message)
    else loadData()
  }

  // 評価の更新
  const updateGrade = async (studentId: string, criterionId: number, grade: string) => {
    const { error } = await supabase
      .from('evaluations')
      .upsert({ 
        student_id: studentId, 
        criterion_id: criterionId, 
        grade 
      }, { onConflict: 'student_id, criterion_id' })

    if (error) alert(error.message)
    else loadData()
  }

  // CSVインポート処理
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      // 改行コードで分割し、空行を除去
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
      
      const newStudents = []
      // 1行目はヘッダーと仮定 (名前,ログインID,パスワード,級)
      for (let i = 1; i < lines.length; i++) {
        const [name, loginId, password, kyu] = lines[i].split(',').map(s => s?.trim())
        if (!name || !loginId || !password) continue

        // 1. Auth登録 (email形式にする必要があるため仮ドメイン付与)
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: `${loginId}@seikukai-temp.com`,
          password: password,
        })

        if (authError) {
          console.error(`登録失敗: ${name}`, authError.message)
          continue
        }

        // 2. Profile作成
        if (authData.user) {
          await supabase.from('profiles').insert({
            id: authData.user.id,
            name: name,
            kyu: kyu || '無級',
            role: 'student'
          })
        }
      }
      alert('インポート処理が完了しました')
      loadData()
    }
    // Shift-JIS (Excel作成CSV) に対応させる場合は 'Shift_JIS' を指定
    reader.readAsText(file, 'UTF-8')
  }

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">管理データ読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 text-[#001f3f]">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white p-6 rounded-[30px] shadow-sm">
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter">ADMIN DASHBOARD</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">誠空会 管理システム</p>
          </div>
          <div className="flex gap-4">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleCSVUpload} 
              className="hidden" 
              accept=".csv"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#001f3f] text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-blue-900/20"
            >
              CSV生徒一括登録
            </button>
            <button onClick={() => supabase.auth.signOut()} className="text-xs font-bold text-gray-400 hover:text-red-500">ログアウト</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 生徒一覧 */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="px-2 text-[11px] font-black text-gray-400 uppercase tracking-widest italic">Student List</h2>
            {students.map(student => {
              const score = calculateTotalScore(student.id)
              return (
                <div 
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                  className={`p-5 rounded-[28px] cursor-pointer transition-all border-2 ${
                    selectedStudent?.id === student.id 
                    ? 'bg-white border-[#001f3f] shadow-xl translate-x-2' 
                    : 'bg-white/50 border-transparent hover:bg-white'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-lg font-black tracking-tighter">{student.name}</p>
                      <select 
                        value={student.kyu || '無級'}
                        onChange={(e) => handleKyuChange(student, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 text-[10px] font-bold bg-gray-100 rounded-md px-2 py-0.5 border-none"
                      >
                        {KYU_ORDER.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black ${score >= 80 ? 'text-green-500' : 'text-[#001f3f]'}`}>{score}</p>
                      <p className="text-[8px] font-bold text-gray-300 uppercase">Points</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 評価入力エリア */}
          <div className="lg:col-span-2">
            {selectedStudent ? (
              <div className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Evaluating</span>
                    <h2 className="text-3xl font-black tracking-tighter">{selectedStudent.name}</h2>
                  </div>
                  <div className={`px-4 py-1.5 rounded-full text-[11px] font-black ${calculateTotalScore(selectedStudent.id) >= 80 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {calculateTotalScore(selectedStudent.id) >= 80 ? '昇級要件クリア' : 'スコア不足'}
                  </div>
                </div>

                <div className="space-y-3">
                  {criteria
                    .filter(c => c.dan === (selectedStudent.kyu || '無級').replace(/[0-9]|級/g, '') || true) // 簡易フィルタ
                    .map(c => (
                      <div key={c.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group">
                        <div className="flex-1 pr-4">
                          <p className="text-[9px] font-black text-gray-400 uppercase leading-none mb-1">{c.examination_type}</p>
                          <p className="text-sm font-bold text-[#001f3f] leading-tight">{c.examination_content}</p>
                        </div>
                        <div className="flex gap-1">
                          {['A', 'B', 'C', 'D'].map(g => (
                            <button
                              key={g}
                              onClick={() => updateGrade(selectedStudent.id, c.id, g)}
                              className={`w-9 h-9 rounded-xl font-black text-xs transition-all ${
                                evaluations.find(e => e.student_id === selectedStudent.id && e.criterion_id === c.id)?.grade === g
                                ? 'bg-[#001f3f] text-white scale-110 shadow-md'
                                : 'bg-white text-gray-300 hover:text-[#001f3f] border border-gray-100'
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[400px] bg-white/50 rounded-[40px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300">
                <span className="text-4xl mb-4">🥋</span>
                <p className="font-bold">生徒を選択してください</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
