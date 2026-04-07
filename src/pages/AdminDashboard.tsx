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

  const runBatchRegistration = async () => {
    if (students.length === 0) return alert('名簿がありません')
    if (!confirm(`制限解除はお済みですか？\n${students.length} 名のアカウント作成を再試行します。`)) return

    setProcessing(true)
    setLog(["再開します..."])
    let success = 0
    let skip = 0

    for (let i = 0; i < students.length; i++) {
      const s = students[i]
      const email = s.login_email.replace(/[\s\t\n\r　]/g, '').trim().toLowerCase()
      
      setLog(prev => [`⏳ ${s.name} を処理中...`, ...prev.slice(0, 4)])

      const { error } = await supabase.auth.signUp({
        email: email,
        password: '1234',
      })

      if (!error) {
        success++
        setLog(prev => [`✅ ${s.name}: 完了`, ...prev.slice(0, 5)])
      } else if (error.message.includes('already registered')) {
        skip++
        setLog(prev => [`ℹ️ ${s.name}: 登録済み`, ...prev.slice(0, 5)])
      } else {
        setLog(prev => [`❌ ${s.name}: ${error.message}`, ...prev.slice(0, 5)])
        // エラーが出た場合は1秒待機して再開
        await new Promise(r => setTimeout(r, 1000))
      }

      // 成功時も0.5秒待機してRate Limitを回避
      await new Promise(r => setTimeout(r, 500))
    }

    setProcessing(false)
    alert(`完了しました。\n新規成功: ${success}件\n登録済み: ${skip}件`)
    load()
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="mb-6 p-6 bg-[#001f3f] rounded-3xl shadow-xl text-center border-t-4 border-[#ff6600]">
        <h3 className="text-white font-black text-sm mb-4 uppercase tracking-widest">アカウント一括作成ツール</h3>
        
        {processing ? (
          <div className="bg-black/40 p-4 rounded-xl mb-4 text-left font-mono text-[11px] h-40 overflow-y-auto">
            {log.map((line, idx) => (
              <div key={idx} className={line.startsWith('✅') ? 'text-green-400' : line.startsWith('❌') ? 'text-red-400' : 'text-gray-400'}>{line}</div>
            ))}
          </div>
        ) : (
          <button onClick={runBatchRegistration} className="w-full bg-[#ff6600] text-white py-4 rounded-2xl font-black shadow-lg active:scale-95 transition-all text-sm">
            全員のログインを許可する (1234)
          </button>
        )}
        <p className="text-[9px] text-white/40 mt-3 italic">※Rate Limitエラーが出る場合は、Supabase設定の制限緩和が必要です。</p>
      </div>

      <div className="space-y-2">
        {students.map(s => (
          <div key={s.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm active:bg-gray-50">
            <div className="text-left">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[10px] font-bold text-gray-300">{s.login_email}</p>
            </div>
            <button onClick={() => onSelect(s)} className="text-[#ff6600] font-black text-xs border border-[#ff6600]/20 px-3 py-1.5 rounded-full">評価入力</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EvalTab({ student, onBack }: any) { return <div className="p-20 text-center font-bold text-gray-300">評価入力画面</div> }
function CriteriaTab() { return <div className="p-20 text-center font-bold text-gray-300">審査基準設定</div> }
function Loader() { return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
