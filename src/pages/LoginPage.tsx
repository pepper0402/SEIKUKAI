import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage({ admin }: { admin?: boolean }) {
  const [email, setEmail]     = useState('')
  const [pass, setPass]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    setLoading(false)
    if (error) setError('メールアドレスかパスワードが違います')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* ロゴ */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-white tracking-widest">誠空会</h1>
          <p className="text-red-600 font-bold tracking-widest mt-1">SEIKUKAI</p>
          <div className="w-12 h-0.5 bg-red-600 mx-auto my-3" />
          <p className="text-gray-500 text-sm tracking-widest">{admin ? '管理者ポータル' : '生徒ポータル'}</p>
        </div>

        {/* フォーム */}
        <form onSubmit={handleLogin} className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 space-y-4">
          {error && <p className="text-red-400 text-sm text-center bg-red-950 rounded-lg py-2">{error}</p>}
          <div>
            <label className="text-gray-400 text-xs tracking-widest block mb-1">メールアドレス</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com" required
              className="w-full bg-black text-white border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs tracking-widest block mb-1">パスワード</label>
            <input
              type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="パスワード" required
              className="w-full bg-black text-white border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-600"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? '...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
