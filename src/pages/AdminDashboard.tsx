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
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ★一括登録スクリプト本体
  const runBatchRegistration = async () => {
    if (students.length === 0) return alert('名簿がありません')
    const confirmMsg = `現在表示されている ${students.length} 名を「パスワード: 1234」で認証システムに登録します。よろしいですか？\n\n※既に登録済みの人はスキップされます。`
    if (!confirm(confirmMsg)) return

    setProcessing(true)
    let successCount = 0
    let skipCount = 0

    for (let i = 0; i < students.length; i++) {
      const s = students[i]
      const email = s.login_email.replace(/[\s\t\n\r　]/g, '').trim().toLowerCase()
      
      setProgress({ current: i + 1, total: students.length, msg: `${s.name} を登録中...` })

      // 1件ずつサインアップを実行
      const { error } = await supabase.auth.signUp({
        email: email,
        password: '1234',
        options: { data: { full_name: s.name } }
      })

      if (!error) {
        successCount++
      } else {
        skipCount++ // すでに存在する場合などはここ
      }

      // サーバーへの負荷軽減のため、少しだけ待機（0.2秒）
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    setProcessing(false)
    alert(`完了しました！\n新規登録: ${successCount}名\nスキップ: ${skipCount}名\n\nこれで全員が「1234」でログインできるはずです。`)
    load()
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      {/* 一括登録ツールパネル */}
      <div className="mb-6 p-6 bg-[#001f3f] rounded-3xl shadow-2xl text-center relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-[10px] font-black text-[#ff6600] mb-2 uppercase tracking-[0.3em]">System Activation</p>
          <h3 className="text-white font-black text-lg mb-4 tracking-tighter">一括アカウント作成</h3>
          
          {processing ? (
            <div className="py-4">
              <div className="text-white text-2xl font-black mb-1">{Math.round((progress.current / progress.total) * 100)}%</div>
              <div className="text-[#ff6600] text-[10px] font-bold animate-pulse">{progress.msg}</div>
              <div className="w-full bg-white/10 h-1.5 mt-4 rounded-full overflow-hidden">
                <div className="bg-[#ff6600] h-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
              </div>
            </div>
          ) : (
            <button 
              onClick={runBatchRegistration}
              className="w-full bg-[#ff6600] text-white py-4 rounded-2xl font-black shadow-xl active:scale-95 transition-all text-sm"
            >
              全員のログインを許可する (1234)
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {students.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} className="w-full bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm">
            <div className="text-left">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">{s.kyu} | {s.login_email}</p>
            </div>
            <span className="text-[#ff6600] font-black">＞</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// 評価入力・審査基準は今のまま維持
function EvalTab({ student, onBack }: any) { return <div className="p-20 text-center font-bold">評価画面（構築中）</div> }
function CriteriaTab() { return <div className="p-20 text-center font-bold">審査基準</div> }
function Loader() { return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
