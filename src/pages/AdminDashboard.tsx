import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion, DAN_OPTIONS, KYU_OPTIONS, GAKUINEN_OPTIONS } from '../lib/supabase'

type Tab = '生徒一覧' | '評価入力' | '審査基準'

export default function AdminDashboard({ profile, onReload }: { profile: Profile; onReload: () => void }) {
  const [tab, setTab] = useState<Tab>('生徒一覧')
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-zinc-900 px-4 py-3 flex justify-between items-center">
        <h1 className="text-white font-black text-lg tracking-widest">誠空会　管理</h1>
        <button onClick={() => supabase.auth.signOut()} className="text-red-500 text-sm">ログアウト</button>
      </div>
      <div className="flex bg-zinc-800">
        {(['生徒一覧', '評価入力', '審査基準'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${tab === t ? 'text-white border-b-2 border-red-600' : 'text-gray-500'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="max-w-lg mx-auto">
        {tab === '生徒一覧' && <StudentsTab />}
        {tab === '評価入力' && <EvalTab />}
        {tab === '審査基準' && <CriteriaTab />}
      </div>
    </div>
  )
}

// ─── 生徒一覧 ──────────────────────────────────────────
function StudentsTab() {
  const [students, setStudents] = useState<Profile[]>([])
  const [modal, setModal]       = useState(false)
  const [selected, setSelected] = useState<Profile | null>(null)
  const [form, setForm]         = useState<Partial<Profile>>({})
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setSelected(null)
    setForm({ name: '', login_email: '', dan: '', kyu: '', keiko_days: 0, gakuinen: '', gohi: '' })
    setModal(true)
  }

  const openEdit = (s: Profile) => { setSelected(s); setForm({ ...s }); setModal(true) }

  const save = async () => {
    if (!form.name || !form.login_email) return alert('名前とメールは必須です')
    if (selected) {
      await supabase.from('profiles').update(form).eq('id', selected.id)
    } else {
      await supabase.from('profiles').insert({ ...form, is_admin: false })
    }
    setModal(false); load()
  }

  const del = async (s: Profile) => {
    if (!confirm(`${s.name}を削除しますか？`)) return
    await supabase.from('profiles').delete().eq('id', s.id)
    load()
  }

  if (loading) return <Loader />

  return (
    <div>
      <div className="flex justify-between items-center px-4 py-3 bg-white border-b">
        <span className="text-sm text-gray-500">生徒数：{students.length}名</span>
        <button onClick={openNew} className="bg-red-700 text-white text-sm px-4 py-1.5 rounded-lg">＋ 追加</button>
      </div>
      {students.map(s => (
        <div key={s.id} className="flex items-center justify-between bg-white px-4 py-3 border-b">
          <div>
            <p className="font-bold text-gray-900">{s.name}</p>
            <p className="text-xs text-gray-400">{s.kyu}　{s.dan}　{s.gakuinen}</p>
            <p className="text-xs text-gray-400">{s.login_email}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openEdit(s)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg">編集</button>
            <button onClick={() => del(s)}      className="text-xs bg-red-50  text-red-600  px-3 py-1.5 rounded-lg">削除</button>
          </div>
        </div>
      ))}

      {modal && (
        <Modal title={selected ? '生徒を編集' : '生徒を追加'} onClose={() => setModal(false)} onSave={save}>
          <FInput label="名前 *"              value={form.name || ''}         onChange={v => setForm(p => ({ ...p, name: v }))} />
          <FInput label="メール *"            value={form.login_email || ''}  onChange={v => setForm(p => ({ ...p, login_email: v }))} type="email" />
          <FInput label="稽古日数"            value={String(form.keiko_days ?? 0)} onChange={v => setForm(p => ({ ...p, keiko_days: parseInt(v) || 0 }))} type="number" />
          <FInput label="入会日 (YYYY-MM-DD)" value={form.join_date || ''}   onChange={v => setForm(p => ({ ...p, join_date: v }))} />
          <FInput label="生年月日"            value={form.birth_date || ''}  onChange={v => setForm(p => ({ ...p, birth_date: v }))} />
          <FSelect label="帯色"    value={form.dan || ''}      options={DAN_OPTIONS}      onChange={v => setForm(p => ({ ...p, dan: v }))} />
          <FSelect label="級"      value={form.kyu || ''}      options={KYU_OPTIONS}      onChange={v => setForm(p => ({ ...p, kyu: v }))} />
          <FSelect label="学年"    value={form.gakuinen || ''} options={GAKUINEN_OPTIONS} onChange={v => setForm(p => ({ ...p, gakuinen: v }))} />
          <FSelect label="合否"    value={form.gohi || ''}     options={['', '合格']}     onChange={v => setForm(p => ({ ...p, gohi: v }))} />
        </Modal>
      )}
    </div>
  )
}

// ─── 評価入力 ──────────────────────────────────────────
function EvalTab() {
  const [students,  setStudents]  = useState<Profile[]>([])
  const [selected,  setSelected]  = useState<Profile | null>(null)
  const [criteria,  setCriteria]  = useState<Criterion[]>([])
  const [evalMap,   setEvalMap]   = useState<Record<number, string>>({})
  const [saving,    setSaving]    = useState(false)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    supabase.from('profiles').select('*').eq('is_admin', false).order('name')
      .then(({ data }) => { setStudents(data || []); setLoading(false) })
  }, [])

  const select = async (s: Profile) => {
    setSelected(s)
    const [{ data: cr }, { data: ev }] = await Promise.all([
      supabase.from('criteria').select('*').eq('dan', s.dan).order('id'),
      supabase.from('evaluations').select('*').eq('user_email', s.login_email),
    ])
    setCriteria(cr || [])
    const map: Record<number, string> = {}
    ;(ev || []).forEach((e: any) => { map[e.criteria_id] = e.hyoka })
    setEvalMap(map)
  }

  const saveAll = async () => {
    if (!selected) return
    setSaving(true)
    for (const [cid, hyoka] of Object.entries(evalMap)) {
      if (!hyoka) continue
      await supabase.from('evaluations').upsert({
        user_email: selected.login_email,
        criteria_id: parseInt(cid),
        hyoka,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_email,criteria_id' })
    }
    setSaving(false)
    alert(`${selected.name}の評価を保存しました`)
  }

  if (loading) return <Loader />

  if (!selected) return (
    <div>
      <p className="text-sm text-gray-500 px-4 py-3 bg-white border-b">評価する生徒を選択</p>
      {students.map(s => (
        <button key={s.id} onClick={() => select(s)} className="w-full flex justify-between items-center bg-white px-4 py-3 border-b text-left hover:bg-gray-50">
          <div>
            <p className="font-bold text-gray-900">{s.name}</p>
            <p className="text-xs text-gray-400">{s.kyu}　{s.dan}</p>
          </div>
          <span className="text-gray-300 text-xl">›</span>
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2.5">
        <button onClick={() => setSelected(null)} className="text-red-500 text-lg">‹ 戻る</button>
        <span className="text-white font-bold text-sm">{selected.name}　{selected.kyu}</span>
        <button onClick={saveAll} disabled={saving} className="bg-red-700 text-white text-xs px-4 py-1.5 rounded-lg">
          {saving ? '...' : '保存'}
        </button>
      </div>
      {criteria.length === 0 ? (
        <div className="p-8 text-center text-gray-400">帯色「{selected.dan}」の審査基準がありません</div>
      ) : criteria.map(cr => (
        <div key={cr.id} className="flex items-center justify-between bg-white px-4 py-3 border-b">
          <div className="flex-1 pr-4">
            <p className="text-xs text-gray-400">{cr.examination_type}</p>
            <p className="text-sm text-gray-800">{cr.examination_content}</p>
          </div>
          <div className="flex gap-1.5">
            {['優', '良', '可'].map(h => (
              <button key={h}
                onClick={() => setEvalMap(prev => ({ ...prev, [cr.id]: prev[cr.id] === h ? '' : h }))}
                className={`w-9 h-9 rounded-lg text-sm font-bold border transition-colors ${evalMap[cr.id] === h ? 'bg-red-700 text-white border-red-700' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {h}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 審査基準 ──────────────────────────────────────────
function CriteriaTab() {
  const [criteria,  setCriteria]  = useState<Criterion[]>([])
  const [filter,    setFilter]    = useState('')
  const [modal,     setModal]     = useState(false)
  const [selected,  setSelected]  = useState<Criterion | null>(null)
  const [form,      setForm]      = useState<Partial<Criterion>>({})
  const [loading,   setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('criteria').select('*').order('id')
    setCriteria(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openNew  = () => { setSelected(null); setForm({ dan: '', examination_type: '', examination_content: '', video_url: '' }); setModal(true) }
  const openEdit = (c: Criterion) => { setSelected(c); setForm({ ...c }); setModal(true) }

  const save = async () => {
    if (!form.dan || !form.examination_content) return alert('帯色と内容は必須です')
    if (selected) await supabase.from('criteria').update(form).eq('id', selected.id)
    else await supabase.from('criteria').insert(form)
    setModal(false); load()
  }

  const del = async (c: Criterion) => {
    if (!confirm(`「${c.examination_content}」を削除しますか？`)) return
    await supabase.from('criteria').delete().eq('id', c.id)
    load()
  }

  if (loading) return <Loader />
  const filtered = filter ? criteria.filter(c => c.dan === filter) : criteria

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['', ...DAN_OPTIONS.filter(d => d)].map(d => (
            <button key={d} onClick={() => setFilter(d)}
              className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${filter === d ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {d || '全て'}
            </button>
          ))}
        </div>
        <button onClick={openNew} className="ml-2 bg-red-700 text-white text-sm px-3 py-1.5 rounded-lg flex-shrink-0">＋</button>
      </div>
      {filtered.map(c => (
        <div key={c.id} className="flex items-center justify-between bg-white px-4 py-3 border-b">
          <div className="flex-1">
            <p className="text-xs font-bold text-red-600">{c.dan}</p>
            <p className="text-xs text-gray-400">{c.examination_type}</p>
            <p className="text-sm text-gray-800">{c.examination_content}</p>
          </div>
          <div className="flex gap-2 ml-2">
            <button onClick={() => openEdit(c)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg">編集</button>
            <button onClick={() => del(c)}      className="text-xs bg-red-50  text-red-600  px-3 py-1.5 rounded-lg">削除</button>
          </div>
        </div>
      ))}

      {modal && (
        <Modal title={selected ? '審査基準を編集' : '審査基準を追加'} onClose={() => setModal(false)} onSave={save}>
          <FSelect label="帯色 *" value={form.dan || ''}                    options={DAN_OPTIONS} onChange={v => setForm(p => ({ ...p, dan: v }))} />
          <FInput  label="種目"   value={form.examination_type || ''}      onChange={v => setForm(p => ({ ...p, examination_type: v }))} />
          <FInput  label="内容 *" value={form.examination_content || ''}   onChange={v => setForm(p => ({ ...p, examination_content: v }))} />
          <FInput  label="動画URL" value={form.video_url || ''}            onChange={v => setForm(p => ({ ...p, video_url: v }))} />
        </Modal>
      )}
    </div>
  )
}

// ─── 共通コンポーネント ────────────────────────────────
function Loader() {
  return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
}

function Modal({ title, children, onClose, onSave }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gray-900 mb-4">{title}</h2>
        <div className="space-y-3">{children}</div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold">キャンセル</button>
          <button onClick={onSave}  className="flex-1 py-3 rounded-xl bg-red-700 text-white font-bold">保存</button>
        </div>
      </div>
    </div>
  )
}

function FInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
    </div>
  )
}

function FSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${value === opt ? 'bg-red-700 text-white border-red-700' : 'bg-white text-gray-600 border-gray-200'}`}>
            {opt || '未選択'}
          </button>
        ))}
      </div>
    </div>
  )
}
