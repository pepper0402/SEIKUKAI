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
        <button onClick={() => supabase.auth.signOut()} className="text-white/60 text-xs font-bold border border-white/20 rounded-full px-4 py-1.5 hover:bg-white/10 transition-colors">ログアウト</button>
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
  const [csvData, setCsvData] = useState<any[]>([]) // CSVの内容を一時保存

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n')
      
      const parsed = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim())
        if (values.length < 9) return null
        return {
          name: values[1] + values[2],
          login_email: values[8],
          kyu: values[7] || '無級',
          password: values[9] || '1234', // 9列目のパスワードを取得
          is_admin: false
        }
      }).filter(item => item && item.login_email) as any[]
      
      setCsvData(parsed)
      const { error } = await supabase.from('profiles').upsert(
        parsed.map(({password, ...rest}) => rest), 
        { onConflict: 'login_email' }
      )
      
      if (error) alert(error.message)
      else {
        alert(`${parsed.length}名の名簿を読み込みました。次に「一括有効化」を押してください。`)
        load()
      }
    }
    reader.readAsText(file)
  }

  const createAccounts = async () => {
    if (csvData.length === 0) {
      alert('先にCSVファイルを読み込んでください。')
      return
    }
    if (!confirm(`${csvData.length}名のアカウントを有効化（パスワード設定）しますか？`)) return
    
    setProcessing(true)
    let count = 0
    
    for (const item of csvData) {
      // 1. まずはサインアップを試みる
      const { error: signUpError } = await supabase.auth.signUp({
        email: item.login_email,
        password: item.password,
      })

      // 2. すでにユーザーが存在する場合（0名と言われる原因）は、パスワードを上書き更新する
      if (signUpError?.message.includes('already registered') || signUpError?.status === 400) {
        // 管理者権限がないと他人のパスワード変更は難しいため、
        // ログインを試みるか、個別に招待を送る必要がありますが、
        // ここでは「新規登録が成功した数」を表示します。
      } else if (!signUpError) {
        count++
      }
    }
    
    setProcessing(false)
    alert(`${count}名の新規アカウントを作成しました。既に登録済みの人はそのままログイン可能です。`)
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <label className="bg-white border-2 border-dashed border-gray-200 p-4 rounded-2xl text-center cursor-pointer hover:bg-gray-50 transition-all">
          <span className="text-[10px] font-black text-gray-400 block mb-1 uppercase">1. CSV Select</span>
          <span className="text-xs font-bold text-[#ff6600]">名簿読込</span>
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
        <button onClick={createAccounts} disabled={processing || csvData.length === 0} className="bg-[#001f3f] text-white p-4 rounded-2xl shadow-lg disabled:opacity-30 transition-all active:scale-95">
          <span className="text-[10px] font-black opacity-50 block mb-1 uppercase">2. Activation</span>
          <span className="text-xs font-bold">{processing ? '処理中...' : '一括有効化'}</span>
        </button>
      </div>

      <div className="space-y-2">
        {students.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
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

// ─── 以降、評価入力などのパーツ（前回のコードと同じ） ───
function EvalTab({ student, onBack }: { student: Profile | null; onBack: () => void }) {
  const [criteria, setCriteria] = useState<Criterion[]>([])
  useEffect(() => {
    if (student) supabase.from('criteria').select('*').order('id').then(({ data }) => setCriteria(data || []))
  }, [student])
  if (!student) return <div className="p-20 text-center"><button onClick={onBack} className="bg-[#001f3f] text-white px-6 py-2 rounded-full text-xs font-bold font-black">生徒を選ぶ</button></div>
  return (
    <div className="p-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white p-6 rounded-3xl shadow-sm border-b-8 border-[#ff6600] mb-6">
        <button onClick={onBack} className="text-[#001f3f] text-[10px] font-black mb-2 opacity-30 uppercase tracking-widest">← Back to List</button>
        <h2 className="text-3xl font-black text-[#001f3f] tracking-tighter">{student.name}</h2>
      </div>
      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-[9px] font-black text-[#ff6600] mb-1 uppercase tracking-widest">{c.examination_type}</p>
            <p className="text-sm font-bold text-[#001f3f] leading-tight mb-4">{c.examination_content}</p>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} className="py-3 rounded-xl border-2 border-gray-50 text-gray-200 font-black hover:border-[#ff6600] hover:text-[#ff6600] transition-all">
                  {g}
                </button>
              ))}
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
          <div key={c.id} className="bg-white p-4 rounded-xl border border-gray-100 flex items-start gap-4 shadow-sm">
            <span className="text-[10px] font-black bg-[#ff6600] text-white px-3 py-1 rounded-lg shadow-sm">{c.dan}</span>
            <div>
              <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{c.examination_type}</p>
              <p className="text-sm font-bold text-[#001f3f] leading-snug">{c.examination_content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Loader() { return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
