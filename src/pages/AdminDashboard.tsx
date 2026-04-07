import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile, Criterion, DAN_OPTIONS, KYU_OPTIONS, GAKUINEN_OPTIONS } from '../lib/supabase'

type Tab = '生徒一覧' | '評価入力' | '審査基準'

// カラー定義
const SEIKUKAI_ORANGE = '#ff6600'
const SEIKUKAI_NAVY = '#001f3f'

export default function AdminDashboard({ profile, onReload }: { profile: Profile; onReload: () => void }) {
  const [tab, setTab] = useState<Tab>('生徒一覧')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー：ネイビー */}
      <div className="bg-[#001f3f] px-6 py-4 flex justify-between items-center shadow-lg">
        <h1 className="text-white font-black text-lg tracking-[0.2em]">誠空会 管理</h1>
        <button 
          onClick={() => supabase.auth.signOut()} 
          className="text-white/60 text-xs font-bold border border-white/20 rounded-full px-4 py-1.5 hover:bg-white/10 transition-colors"
        >
          ログアウト
        </button>
      </div>

      {/* タブメニュー */}
      <div className="flex bg-[#001f3f] border-t border-white/10">
        {(['生徒一覧', '評価入力', '審査基準'] as Tab[]).map(t => (
          <button 
            key={t} 
            onClick={() => setTab(t)}
            className={`flex-1 py-3.5 text-xs font-black tracking-widest transition-all ${
              tab === t ? 'text-white border-b-4 border-[#ff6600]' : 'text-white/40'
            }`}
          >
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
      <div className="flex justify-between items-center px-5 py-4 bg-white border-b sticky top-0 z-10 shadow-sm">
        <span className="text-xs font-bold text-gray-400">生徒数：<span className="text-[#001f3f]">{students.length}名</span></span>
        <button 
          onClick={openNew} 
          className="bg-[#ff6600] text-white text-xs font-bold px-5 py-2 rounded-full shadow-lg shadow-orange-200 active:scale-95 transition-transform"
        >
          ＋ 新規生徒
        </button>
      </div>
      <div className="space-y-2 p-3">
        {students.map(s => (
          <div key={s.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex-1">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">
                {s.kyu} <span className="mx-1">|</span> {s.dan} <span className="mx-1">|</span> {s.gakuinen}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(s)} className="text-[10px] font-bold bg-[#001f3f]/5 text-[#001f3f] px-4 py-2 rounded-lg">編集</button>
              <button onClick={() => del(s)} className="text-[10px] font-bold bg-red-50 text-red-500 px-4 py-2 rounded-lg">削除</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={selected ? '生徒情報を編集' : '新規生徒を登録'} onClose={() => setModal(false)} onSave={save}>
          <FInput label="氏名 *" value={form.name || ''} onChange={v => setForm(p => ({ ...p, name: v }))} />
          <FInput label="メールアドレス *" value={form.login_email || ''} onChange={v => setForm(p => ({ ...p, login_email: v }))} type="email" />
          <FInput label="稽古日数" value={String(form.keiko_days ?? 0)} onChange={v => setForm(p => ({ ...p, keiko_days: parseInt(v) || 0 }))} type="number" />
          <div className="grid grid-cols-2 gap-3">
            <FInput label="入会日 (YYYY-MM-DD)" value={form.join_date || ''} onChange={v => setForm(p => ({ ...p, join_date: v }))} />
            <FInput label="生年月日" value={form.birth_date || ''} onChange={v => setForm(p => ({ ...p, birth_date: v }))} />
          </div>
          <FSelect label="帯色" value={form.dan || ''} options={DAN_OPTIONS} onChange={v => setForm(p => ({ ...p, dan: v }))} />
          <FSelect label="現在の級" value={form.kyu || ''} options={KYU_OPTIONS} onChange={v => setForm(p => ({ ...p, kyu: v }))} />
          <FSelect label="学年" value={form.gakuinen || ''} options={GAKUINEN_OPTIONS} onChange={v => setForm(p => ({ ...p, gakuinen: v }))} />
          <FSelect label="最終合否" value={form.gohi || ''} options={['', '合格']} onChange={v => setForm(p => ({ ...p, gohi: v }))} />
        </Modal>
      )}
    </div>
  )
}

// ─── 評価入力 ──────────────────────────────────────────
function EvalTab() {
  const [students, setStudents] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile | null>(null)
  const [criteria, setCriteria] = useState<Criterion[]>([])
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
    <div className="p-3">
      <p className="text-[10px] font-black text-gray-400 mb-3 px-2 tracking-widest uppercase">生徒を選択して評価を開始</p>
      {students.map(s => (
        <button key={s.id} onClick={() => select(s)} className="w-full mb-2 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-left hover:border-[#ff6600] transition-colors group">
          <div>
            <p className="font-black text-[#001f3f] group-hover:text-[#ff6600]">{s.name}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-tighter">{s.kyu} | {s.dan}</p>
          </div>
          <span className="text-[#001f3f]/20 group-hover:text-[#ff6600] text-xl transition-colors">›</span>
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between bg-[#001f3f] px-5 py-3 sticky top-0 z-20">
        <button onClick={() => setSelected(null)} className="text-white/60 text-xs font-bold">‹ 戻る</button>
        <span className="text-white font-black text-sm">{selected.name} 選手の評価</span>
        <button onClick={saveAll} disabled={saving} className="bg-[#ff6600] text-white text-xs font-black px-5 py-2 rounded-lg shadow-lg">
          {saving ? '...' : '保存'}
        </button>
      </div>
      <div className="p-3">
        {criteria.length === 0 ? (
          <div className="p-12 text-center text-gray-400 font-bold bg-white rounded-xl border-2 border-dashed">帯色「{selected.dan}」の基準未登録</div>
        ) : criteria.map(cr => (
          <div key={cr.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-2">
            <p className="text-[10px] font-black text-[#ff6600] uppercase tracking-widest mb-1">{cr.examination_type}</p>
            <p className="text-xs font-bold text-[#001f3f] mb-4 leading-relaxed">{cr.examination_content}</p>
            <div className="flex gap-2">
              {['優', '良', '可'].map(h => (
                <button 
                  key={h}
                  onClick={() => setEvalMap(prev => ({ ...prev, [cr.id]: prev[cr.id] === h ? '' : h }))}
                  className={`flex-1 h-11 rounded-lg text-sm font-black transition-all border ${
                    evalMap[cr.id] === h 
                    ? 'bg-[#001f3f] text-white border-[#001f3f]' 
                    : 'bg-gray-50 text-gray-400 border-gray-100'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 審査基準 ──────────────────────────────────────────
function CriteriaTab() {
  const [criteria,  setCriteria]  = useState<Criterion[]>([])
  const [filter,    setFilter]    = useState('')
  const [modal,      setModal]      = useState(false)
  const [selected,  setSelected]  = useState<Criterion | null>(null)
  const [form,       setForm]      = useState<Partial<Criterion>>({})
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
    <div className="p-3">
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
        {['', ...DAN_OPTIONS.filter(d => d)].map(d => (
          <button 
            key={d} 
            onClick={() => setFilter(d)}
            className={`text-[10px] font-black px-4 py-2 rounded-full whitespace-nowrap transition-all border ${
              filter === d ? 'bg-[#001f3f] text-white border-[#001f3f]' : 'bg-white text-gray-400 border-gray-200 shadow-sm'
            }`}
          >
            {d || 'すべて表示'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
            <div className="flex-1 pr-4">
              <span className="inline-block text-[8px] font-black bg-[#ff6600] text-white px-2 py-0.5 rounded-sm uppercase mb-2 tracking-widest">{c.dan}</span>
              <p className="text-[10px] font-bold text-gray-400 mb-0.5">{c.examination_type}</p>
              <p className="text-xs font-bold text-[#001f3f] leading-relaxed">{c.examination_content}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => openEdit(c)} className="text-[10px] font-bold bg-[#001f3f]/5 text-[#001f3f] px-3 py-1.5 rounded-lg">編集</button>
              <button onClick={() => del(c)} className="text-[10px] font-bold bg-red-50 text-red-500 px-3 py-1.5 rounded-lg">削除</button>
            </div>
          </div>
        ))}
      </div>

      <button 
        onClick={openNew} 
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#ff6600] text-white rounded-full shadow-2xl flex items-center justify-center text-3xl font-light z-30"
      >
        ＋
      </button>

      {modal && (
        <Modal title={selected ? '審査基準の編集' : '新規審査基準の登録'} onClose={() => setModal(false)} onSave={save}>
          <FSelect label="対象の帯色 *" value={form.dan || ''} options={DAN_OPTIONS} onChange={v => setForm(p => ({ ...p, dan: v }))} />
          <FInput label="種目分類 (例: 基本, 型, 組手)" value={form.examination_type || ''} onChange={v => setForm(p => ({ ...p, examination_type: v }))} />
          <FInput label="審査内容の詳細 *" value={form.examination_content || ''} onChange={v => setForm(p => ({ ...p, examination_content: v }))} />
          <FInput label="参考動画URL (YouTubeなど)" value={form.video_url || ''} onChange={v => setForm(p => ({ ...p, video_url: v }))} />
        </Modal>
      )}
    </div>
  )
}

// ─── 共通コンポーネント ────────────────────────────────
function Loader() {
  return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div>
}

function Modal({ title, children, onClose, onSave }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 bg-[#001f3f]/80 z-[100] flex items-end justify-center backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-t-[2.5rem] p-8 max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-xl font-black text-[#001f3f] mb-6 tracking-tight text-center">{title}</h2>
        <div className="space-y-5">{children}</div>
        <div className="flex gap-4 mt-8 pb-4">
          <button onClick={onClose} className="flex-1 py-4 rounded-2xl bg-gray-100 text-gray-500 font-bold text-sm">キャンセル</button>
          <button onClick={onSave}  className="flex-1 py-4 rounded-2xl bg-[#ff6600] text-white font-black text-sm shadow-lg shadow-orange-200">保存する</button>
        </div>
      </div>
    </div>
  )
}

function FInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-[#001f3f] focus:outline-none focus:border-[#ff6600] focus:bg-white transition-all"
      />
    </div>
  )
}

function FSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button 
            key={opt} 
            type="button" 
            onClick={() => onChange(opt)}
            className={`text-[10px] font-bold px-4 py-2 rounded-lg border transition-all ${
              value === opt 
              ? 'bg-[#001f3f] text-white border-[#001f3f]' 
              : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'
            }`}
          >
            {opt || '未選択'}
          </button>
        ))}
      </div>
    </div>
  )
}
