import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

export default function AdminDashboard({ profile }: { profile: Profile; onReload: () => void }) {
  const [tab, setTab] = useState('生徒一覧')
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#001f3f] px-6 py-4 flex justify-between items-center shadow-lg">
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
  const [log, setLog] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // CSV読み込み機能
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n')
      const updates = lines.slice(1).map(line => {
        const v = line.split(',').map(s => s.trim())
        if (v.length < 9) return null
        return { name: v[1] + v[2], login_email: v[8], kyu: v[7] || '無級', is_admin: false }
      }).filter(item => item && item.login_email) as any[]
      
      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (error) alert(error.message); else { alert(`${updates.length}名の名簿を更新しました。`); load(); }
    }
    reader.readAsText(file)
  }

  // アカウント一括作成（パスワードを123456に強制）
  const runBatchRegistration = async () => {
    if (students.length === 0) return alert('名簿がありません')
    if (!confirm(`全員のパスワードを「123456」で登録します。よろしいですか？`)) return

    setProcessing(true)
    setLog(["処理を開始します..."])
    let success = 0, skip = 0, errorCount = 0

    for (const s of students) {
      const email = s.login_email.replace(/[\s\t\n\r　]/g, '').trim().toLowerCase()
      if (!email.includes('@')) continue

      const { error } = await supabase.auth.signUp({
        email: email,
        password: '123456', // 6文字以上に修正
      })

      if (!error) {
        success++
        setLog(prev => [`✅ ${s.name}: 完了`, ...prev.slice(0, 5)])
      } else if (error.message.includes('already registered')) {
        skip++
        setLog(prev => [`ℹ️ ${s.name}: 登録済み`, ...prev.slice(0, 5)])
      } else {
        errorCount++
        setLog(prev => [`❌ ${s.name}: ${error.message}`, ...prev.slice(0, 5)])
      }
      await new Promise(r => setTimeout(r, 400))
    }

    setProcessing(false)
    alert(`完了！\n新規: ${success}名 / 登録済: ${skip}名 / エラー: ${errorCount}名`)
    load()
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      {/* 操作パネル */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <label className="bg-white p-4 rounded-2xl border-2 border-dashed border-gray-200 text-center cursor-pointer active:bg-gray-50">
          <span className="text-[10px] font-black text-gray-400 block mb-1 uppercase">Step 1</span>
          <span className="text-xs font-bold text-[#001f3f]">CSV読込</span>
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
        <button onClick={runBatchRegistration} disabled={processing} className="bg-[#ff6600] text-white p-4 rounded-2xl font-black shadow-lg disabled:opacity-50 text-xs">
          <span className="text-[10px] opacity-60 block mb-1 uppercase">Step 2</span>
          ログイン許可
        </button>
      </div>

      {processing && (
        <div className="mb-6 bg-[#001f3f] p-4 rounded-2xl font-mono text-[10px] h-32 overflow-y-auto">
          {log.map((l, i) => <div key={i} className={l.includes('✅') ? 'text-green-400' : l.includes('❌') ? 'text-red-400' : 'text-gray-400'}>{l}</div>)}
        </div>
      )}

      <div className="space-y-2">
        {students.map(s => (
          <div key={s.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm">
            <div className="text-left leading-tight">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[9px] font-bold text-gray-300 uppercase tracking-tighter">{s.kyu} | {s.login_email}</p>
            </div>
            <button onClick={() => onSelect(s)} className="bg-gray-50 text-[#001f3f] font-black text-[10px] px-4 py-2 rounded-xl">評価入力</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EvalTab({ student, onBack }: any) { return <div className="p-20 text-center font-bold text-gray-300">評価入力画面</div> }
function CriteriaTab() { return <div className="p-20 text-center font-bold text-gray-300">審査基準設定</div> }
function Loader() { return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
