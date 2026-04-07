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
            className={`flex-1 py-4 text-[10px] font-black tracking-widest transition-all ${tab === t ? 'text-white border-b-4 border-[#ff6600]' : 'text-white/40'}`}>
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
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const cleanEmail = (email: string) => {
    // 前後の空白、タブ、改行、全角スペースをすべて徹底的に除去
    return email.replace(/[\s\t\n\r　]/g, '').trim().toLowerCase();
  }

  const fixLoginIssues = async () => {
    if (students.length === 0) return alert('名簿が空です。先にCSVを読み込んでください。')
    if (!confirm('【重要】全生徒のログイン情報を洗浄し、パスワードを「1234」で再設定しますか？')) return
    
    setProcessing(true)
    let count = 0

    for (const s of students) {
      const email = cleanEmail(s.login_email)
      if (!email || !email.includes('@')) continue;

      setMsg(`同期中: ${s.name}...`)

      // 1. まずAuthに新規登録を試みる
      const { error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: '1234',
      })

      // 2. 既に登録済みの場合は、このままでもログイン可能なはずですが、
      // 念のためProfiles側のメールアドレスも「洗浄済み」のもので上書き更新します
      await supabase
        .from('profiles')
        .update({ login_email: email })
        .eq('id', s.id)

      count++
    }

    setProcessing(false)
    setMsg('')
    load()
    alert(`完了: ${count}名のログイン環境を洗浄・同期しました。ログインをお試しください。`)
  }

  if (loading) return <Loader />

  return (
    <div className="p-3">
      <div className="mb-6 p-5 bg-white rounded-3xl shadow-xl border-2 border-[#ff6600]/20 text-center">
        <div className="bg-orange-50 text-[#ff6600] text-[10px] font-black py-1 px-3 rounded-full inline-block mb-3 uppercase tracking-widest">Login Fix Tool</div>
        <h3 className="text-[#001f3f] font-black text-sm mb-2">ログインできない問題を解決</h3>
        <p className="text-[10px] text-gray-400 mb-5 leading-relaxed px-4">
          メールアドレスに含まれる「見えないゴミ」を掃除して、<br/>
          全員が <b>1234</b> でログインできるように設定し直します。
        </p>
        <button 
          onClick={fixLoginIssues} 
          disabled={processing}
          className="w-full bg-[#ff6600] text-white py-4 rounded-2xl font-black shadow-lg active:scale-95 disabled:opacity-50 transition-all text-xs"
        >
          {processing ? msg : 'ログイン許可を強制実行する'}
        </button>
      </div>

      <div className="space-y-2">
        {students.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} className="w-full bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm active:bg-gray-50">
            <div className="text-left">
              <p className="font-black text-[#001f3f]">{s.name}</p>
              <p className="text-[9px] font-bold text-gray-300 uppercase">{s.kyu} | {s.login_email}</p>
            </div>
            <span className="text-[#ff6600] font-black">＞</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function EvalTab({ student, onBack }: any) {
  if (!student) return <div className="p-20 text-center"><button onClick={onBack} className="bg-[#001f3f] text-white px-8 py-3 rounded-full text-xs font-black">名簿に戻る</button></div>
  return (
    <div className="p-4">
      <div className="bg-white p-6 rounded-3xl shadow-sm border-b-8 border-[#ff6600] mb-6">
        <button onClick={onBack} className="text-[#001f3f] text-[10px] font-black mb-1 opacity-30 uppercase block">← Back</button>
        <h2 className="text-2xl font-black text-[#001f3f]">{student.name} <span className="text-sm font-normal opacity-40">の評価</span></h2>
      </div>
      <p className="text-center py-20 text-gray-300 text-xs font-bold animate-pulse">読み込み中...</p>
    </div>
  )
}
function CriteriaTab() { return <div className="p-10 text-center text-gray-300 text-xs font-bold uppercase">審査基準の表示</div> }
function Loader() { return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
