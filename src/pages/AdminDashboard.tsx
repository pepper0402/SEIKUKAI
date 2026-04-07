import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

type Tab = '生徒一覧' | '評価入力' | '審査基準'

export default function AdminDashboard({ profile }: { profile: Profile; onReload: () => void }) {
  const [tab, setTab] = useState<Tab>('生徒一覧')
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#001f3f] px-6 py-4 flex justify-between items-center shadow-lg">
        <h1 className="text-white font-black text-lg tracking-[0.2em]">誠空会 管理</h1>
        <button onClick={() => supabase.auth.signOut()} className="text-white/60 text-xs font-bold border border-white/20 rounded-full px-4 py-1.5 hover:bg-white/10">ログアウト</button>
      </div>

      <div className="flex bg-[#001f3f] border-t border-white/10">
        {(['生徒一覧', '評価入力', '審査基準'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3.5 text-xs font-black tracking-widest transition-all ${tab === t ? 'text-white border-b-4 border-[#ff6600]' : 'text-white/40'}`}>
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

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // CSV読み込み
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n')
      const updates = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim())
        if (values.length < 9) return null
        return {
          name: values[1] + values[2],
          login_email: values[8],
          kyu: values[7] || '無級',
          is_admin: false
        }
      }).filter(item => item && item.login_email) as any[]
      
      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (error) alert(error.message); else { alert(`${updates.length}名の名簿を更新しました。次にアカウント作成を行ってください。`); load(); }
    }
    reader.readAsText(file)
  }

  // ★重要：ログインアカウントの一括作成
  const createAccounts = async () => {
    if (!confirm('名簿のメールアドレスでログインアカウント（パスワード:1234）を一括作成しますか？')) return
    setProcessing(true)
    
    let successCount = 0
    for (const student of students) {
      // 一人ずつAuthに登録（既にいる場合はスキップされる）
      const { error } = await supabase.auth.signUp({
        email: student.login_email,
        password: '1234', // CSVに合わせた仮パスワード
      })
      if (!error) successCount++
    }
    
    setProcessing(false)
    alert(`${successCount}名のアカウントを有効化しました。既存のアカウントは維持されます。`)
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <label className="bg-white border border-gray-200 p-3 rounded-xl text-center cursor-pointer shadow-sm">
          <span className="text-[10px] font-black text-gray-400 block mb-1">1. 名簿更新</span>
          <span className="text-xs font-bold text-[#ff6600]">CSV選択</span>
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
        <button onClick={createAccounts} disabled={processing} className="bg-[#001f3f] text-white p-3 rounded-xl shadow-sm disabled:opacity-50">
          <span className="text-[10px] font-black opacity-60 block mb-1">2. ログイン許可</span>
          <span className="text-xs font-bold">{processing ? '処理中...' : 'アカウント作成'}</span>
        </button>
      </div>

      <div className="space-y-2">
        {students.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm active:scale-[0.98] transition-all">
            <div className="text-left">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase">{s.kyu} | {s.login_email}</p>
            </div>
            <span className="text-[#ff6600] font-black">＞</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── 評価入力・審査基準（前回のコードを維持） ──────────────────
function EvalTab({ student, onBack }: { student: Profile | null; onBack: () => void }) {
  const [criteria, setCriteria] = useState<Criterion[]>([])
  useEffect(() => {
    if (student) supabase.from('criteria').select('*').order('id').then(({ data }) => setCriteria(data || []))
  }, [student])
  if (!student) return <div className="p-20 text-center"><button onClick={onBack} className="bg-[#001f3f] text-white px-6 py-2 rounded-full text-xs font-bold">生徒を選ぶ</button></div>
  return (
    <div className="p-4">
      <div className="bg-white p-6 rounded-2xl shadow-sm border-b-4 border-[#ff6600] mb-6">
        <button onClick={onBack} className="text-[#001f3f] text-[10px] font-bold mb-2">← 戻る</button>
        <h2 className="text-2xl font-black text-[#001f3f]">{student.name}</h2>
      </div>
      <div className="space-y-3">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-xl border border-gray-100">
            <p className="text-[8px] font-black text-[#ff6600] mb-1">{c.examination_type}</p>
            <p className="text-sm font-bold text-[#001f3f] mb-3">{c.examination_content}</p>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => <button key={g} className="py-2 rounded-lg border-2 border-gray-50 text-gray-300 font-black hover:border-[#ff6600] hover:text-[#ff6600]">{g}</button>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CriteriaTab() {
  const [list, setList] = useState<Criterion[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('criteria').select('*').order('id')
    setList(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <div className="p-3">
      <div className="space-y-2">
        {list.map(c => (
          <div key={c.id} className="bg-white p-3 rounded-lg border border-gray-100 flex items-start gap-3 shadow-sm">
            <span className="text-[8px] font-black bg-[#ff6600] text-white px-2 py-1 rounded">{c.dan}</span>
            <p className="text-xs font-bold text-[#001f3f]">{c.examination_content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Loader() { return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
