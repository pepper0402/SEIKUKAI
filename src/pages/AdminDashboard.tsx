import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

type Tab = '生徒一覧' | '評価入力' | '審査基準'

export default function AdminDashboard({ profile }: { profile: Profile; onReload: () => void }) {
  const [tab, setTab] = useState<Tab>('生徒一覧')
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)

  // 生徒が選択されたら、自動的に「評価入力」タブに切り替える
  const handleSelectStudent = (student: Profile) => {
    setSelectedStudent(student)
    setTab('評価入力')
  }

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
        {tab === '生徒一覧' && <StudentsTab onSelect={handleSelectStudent} />}
        {tab === '評価入力' && <EvalTab student={selectedStudent} onBack={() => setTab('生徒一覧')} />}
        {tab === '審査基準' && <CriteriaTab />}
      </div>
    </div>
  )
}

// ─── 生徒一覧（選択機能付き） ──────────────────
function StudentsTab({ onSelect }: { onSelect: (s: Profile) => void }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

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
      const updates = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim())
        if (values.length < 3) return null
        const kana = values[3] || ''
        const finalEmail = values[8]?.includes('@') ? values[8] : (kana ? `${kana.toLowerCase()}@example.com` : `user${index}@seikukai.test`)
        return { name: (values[1] || '') + (values[2] || ''), login_email: finalEmail, kyu: values[7] || '無級', is_admin: false }
      }).filter(item => item !== null) as any[]
      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (error) alert(error.message); else { alert(`${updates.length}名登録完了`); load(); }
    }
    reader.readAsText(file)
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 text-center">
        <label className="inline-block bg-[#ff6600] text-white text-xs font-black px-6 py-3 rounded-full cursor-pointer shadow-lg active:scale-95">
          生徒CSVを読み込む
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
      </div>
      <div className="space-y-2">
        {students.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm active:bg-gray-50">
            <div className="text-left">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase">{s.kyu} | {s.login_email}</p>
            </div>
            <span className="text-[#ff6600] font-bold">＞</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── 評価入力（メイン機能） ──────────────────
function EvalTab({ student, onBack }: { student: Profile | null; onBack: () => void }) {
  const [criteria, setCriteria] = useState<Criterion[]>([])

  useEffect(() => {
    async function loadCriteria() {
      if (!student) return
      // 生徒の級（例: 白帯）に合わせた審査基準を取得（今回は全表示にします）
      const { data } = await supabase.from('criteria').select('*').order('id')
      setCriteria(data || [])
    }
    loadCriteria()
  }, [student])

  if (!student) return (
    <div className="p-20 text-center">
      <p className="text-gray-400 font-bold mb-4">生徒が選択されていません</p>
      <button onClick={onBack} className="bg-[#001f3f] text-white px-6 py-2 rounded-full text-xs font-bold">生徒一覧から選ぶ</button>
    </div>
  )

  return (
    <div className="p-4">
      <div className="bg-white p-6 rounded-2xl shadow-sm border-b-4 border-[#ff6600] mb-6">
        <div className="flex justify-between items-center mb-2">
          <button onClick={onBack} className="text-[#001f3f] text-xs font-bold">← 戻る</button>
          <span className="bg-[#ff6600] text-white text-[10px] px-3 py-1 rounded-full font-black">{student.kyu}</span>
        </div>
        <h2 className="text-2xl font-black text-[#001f3f]">{student.name} <span className="text-sm font-normal opacity-50">の評価</span></h2>
      </div>

      <div className="space-y-4">
        {criteria.length === 0 ? <p className="text-center text-gray-400 text-xs">審査基準が登録されていません</p> : 
          criteria.map(c => (
            <div key={c.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-[8px] font-black text-[#ff6600] uppercase tracking-tighter">{c.dan} / {c.examination_type}</p>
                  <p className="text-sm font-bold text-[#001f3f]">{c.examination_content}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {['A', 'B', 'C', 'D'].map(grade => (
                  <button key={grade} className="flex-1 py-3 rounded-lg border-2 border-gray-100 text-sm font-black text-gray-300 hover:border-[#ff6600] hover:text-[#ff6600] transition-all">
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          ))
        }
      </div>
      
      <button className="w-full mt-8 bg-[#001f3f] text-white py-5 rounded-2xl font-black shadow-xl active:scale-95 transition-all">
        評価を保存する
      </button>
    </div>
  )
}

// ─── 審査基準（前回と同じ） ──────────────────
function CriteriaTab() {
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('criteria').select('*').order('id')
    setCriteria(data || []); setLoading(false)
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
        return { dan: values[0]?.trim(), examination_type: values[1]?.trim(), examination_content: values[2]?.trim(), video_url: values[3]?.trim() === '動画' ? '' : values[3]?.trim() }
      }).filter(item => item && item.dan && item.examination_content) as any[]
      const { error } = await supabase.from('criteria').upsert(updates)
      if (error) alert(error.message); else { alert('審査基準を更新しました'); load(); }
    }
    reader.readAsText(file)
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 text-center">
        <label className="inline-block bg-[#001f3f] text-white text-xs font-black px-6 py-3 rounded-full cursor-pointer shadow-lg active:scale-95">
          審査基準CSVを読み込む
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
      </div>
      <div className="space-y-2">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-3 rounded-lg border border-gray-100 flex items-start gap-3 shadow-sm">
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

function Loader() { return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
