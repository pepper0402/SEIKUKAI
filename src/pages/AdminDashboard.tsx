import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

export default function AdminDashboard({ profile }: { profile: Profile; onReload: () => void }) {
  const [tab, setTab] = useState('生徒一覧')
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#001f3f] px-6 py-4 flex justify-between items-center">
        <h1 className="text-white font-black text-lg tracking-[0.2em]">誠空会 管理</h1>
        <button onClick={() => supabase.auth.signOut()} className="text-white/60 text-[10px] font-bold border border-white/20 rounded-full px-4 py-1.5">ログアウト</button>
      </div>

      <div className="flex bg-[#001f3f] border-t border-white/10">
        {['生徒一覧', '評価入力', '審査基準'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-4 text-[10px] font-black tracking-widest ${tab === t ? 'text-white border-b-4 border-[#ff6600]' : 'text-white/40'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto pb-10">
        {tab === '生徒一覧' && <StudentsTab onSelect={(s) => { setSelectedStudent(s); setTab('評価入力'); }} />}
        {tab === '評価入力' && <EvalTab student={selectedStudent} onBack={() => setTab('生徒一覧')} />}
        {tab === '審査基準' && <CriteriaTab />}
      </div>
    </div>
  )
}

function StudentsTab({ onSelect }: { onSelect: (s: Profile) => void }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [log, setLog] = useState<string[]>([]) // ログ表示用

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const runBatchRegistration = async () => {
    if (students.length === 0) return alert('名簿がありません')
    if (!confirm(`${students.length} 名のアカウント作成を開始します。`)) return

    setProcessing(true)
    setLog(["開始します..."])
    let success = 0
    let errorCount = 0

    for (let i = 0; i < students.length; i++) {
      const s = students[i]
      const email = s.login_email.replace(/[\s\t\n\r　]/g, '').trim().toLowerCase()
      
      // 1件ずつサインアップ
      const { error } = await supabase.auth.signUp({
        email: email,
        password: '1234',
      })

      if (!error) {
        success++
        setLog(prev => [`✅ ${s.name}: 成功`, ...prev.slice(0, 5)])
      } else {
        errorCount++
        setLog(prev => [`❌ ${s.name}: ${error.message}`, ...prev.slice(0, 5)])
      }

      await new Promise(r => setTimeout(r, 300)) // サーバー負荷軽減
    }

    setProcessing(false)
    alert(`完了しました。\n成功: ${success}件\nエラー: ${errorCount}件\n\nエラーが出る場合はSupabaseの設定を確認してください。`)
    load()
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="mb-6 p-6 bg-[#001f3f] rounded-3xl shadow-xl text-center">
        <h3 className="text-white font-black text-lg mb-4">アカウント一括作成</h3>
        
        {processing ? (
          <div className="bg-black/20 p-4 rounded-xl mb-4 text-left font-mono text-[10px]">
            {log.map((line, idx) => (
              <div key={idx} className={line.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>{line}</div>
            ))}
          </div>
        ) : (
          <button onClick={runBatchRegistration} className="w-full bg-[#ff6600] text-white py-4 rounded-2xl font-black shadow-lg">
            全員のログインを許可する (1234)
          </button>
        )}
      </div>

      <div className="space-y-2">
        {students.map(s => (
          <div key={s.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm">
            <div className="text-left">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[9px] font-bold text-gray-300">{s.login_email}</p>
            </div>
            <button onClick={() => onSelect(s)} className="text-[#ff6600] font-black text-sm">評価入力 ＞</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EvalTab({ student, onBack }: any) { return <div className="p-20 text-center font-bold">評価画面</div> }
function CriteriaTab() { return <div className="p-20 text-center font-bold">審査基準</div> }
function Loader() { return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
