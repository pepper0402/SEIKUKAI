import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion, DAN_OPTIONS, KYU_OPTIONS, GAKUINEN_OPTIONS } from '../lib/supabase'

type Tab = '生徒一覧' | '評価入力' | '審査基準'

export default function AdminDashboard({ profile }: { profile: Profile; onReload: () => void }) {
  const [tab, setTab] = useState<Tab>('生徒一覧')

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
        {tab === '生徒一覧' && <StudentsTab />}
        {tab === '評価入力' && <EvalTab />}
        {tab === '審査基準' && <CriteriaTab />}
      </div>
    </div>
  )
}

// ─── 生徒一覧（CSVインポート） ──────────────────
function StudentsTab() {
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ライブラリを使わないCSV解析
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n')
      const headers = lines[0].split(',')

      const updates = lines.slice(1).map(line => {
        const values = line.split(',')
        if (values.length < 5) return null
        
        // CSVの列：支部,氏,名,ヨミガナ,性別,入会日,生年月日,級/段,メールアドレス
        // 氏(1) + 名(2) を結合して名前に、メールアドレス(8) を取得
        return {
          name: (values[1] || '') + (values[2] || ''),
          login_email: values[8]?.trim(),
          kyu: values[7] || '無級',
          join_date: values[5] || null,
          birth_date: values[6] || null,
          is_admin: false,
        }
      }).filter(item => item && item.login_email) as any[]

      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (error) alert('エラー: ' + error.message)
      else { alert(`${updates.length}名の生徒を登録しました`); load() }
    }
    reader.readAsText(file)
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 text-center">
        <p className="text-[10px] font-black text-gray-400 mb-3 tracking-widest uppercase">生徒データの一括登録</p>
        <label className="inline-block bg-[#ff6600] text-white text-xs font-black px-6 py-3 rounded-full cursor-pointer shadow-lg active:scale-95 transition-all">
          CSVファイルを選択
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
        <p className="mt-2 text-[8px] text-gray-400">※「生徒.xlsx」から書き出したCSVを選択してください</p>
      </div>

      <div className="space-y-2">
        {students.map(s => (
          <div key={s.id} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
            <div>
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[10px] font-bold text-gray-400">{s.kyu} | {s.login_email}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 審査基準（CSVインポート） ──────────────────
function CriteriaTab() {
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('criteria').select('*').order('id')
    setCriteria(data || [])
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
      
      const updates = lines.slice(1).map(line => {
        const values = line.split(',')
        if (values.length < 3) return null
        // CSVの列：帯(0), 種類(1), 内容(2), 動画(3)
        return {
          dan: values[0]?.trim(),
          examination_type: values[1]?.trim(),
          examination_content: values[2]?.trim(),
          video_url: values[3]?.trim() === '動画' ? '' : values[3]?.trim()
        }
      }).filter(item => item && item.dan && item.examination_content) as any[]

      const { error } = await supabase.from('criteria').upsert(updates)
      if (error) alert('エラー: ' + error.message)
      else { alert(`${updates.length}件の審査基準を登録しました`); load() }
    }
    reader.readAsText(file)
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 text-center">
        <p className="text-[10px] font-black text-gray-400 mb-3 tracking-widest uppercase">審査基準の一括登録</p>
        <label className="inline-block bg-[#001f3f] text-white text-xs font-black px-6 py-3 rounded-full cursor-pointer shadow-lg active:scale-95 transition-all">
          CSVファイルを選択
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
      </div>

      <div className="space-y-2">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-3 rounded-lg border border-gray-100 flex items-start gap-3">
            <span className="text-[8px] font-black bg-[#ff6600] text-white px-2 py-1 rounded shrink-0">{c.dan}</span>
            <div>
              <p className="text-[10px] font-bold text-gray-400">{c.examination_type}</p>
              <p className="text-xs font-bold text-[#001f3f]">{c.examination_content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EvalTab() { return <div className="p-12 text-center text-gray-400 font-bold">生徒を選択して評価を開始</div> }
function Loader() { return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
