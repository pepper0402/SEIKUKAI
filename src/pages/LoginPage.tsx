import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage({ admin }: { admin?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert('ログインに失敗しました: ' + error.message)
    setLoading(false)
  }

  return (
    // 画面全体を白背景に、文字をネイビーに設定
    <div className="min-h-screen w-full bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl border-t-8 border-[#ff6600]">
        
        {/* ロゴ・タイトル部分 */}
        <div className="text-center">
          <h1 className="text-4xl font-black text-[#001f3f] tracking-tighter">
            誠空会
          </h1>
          <p className="text-[#ff6600] font-bold mt-1 tracking-[0.2em]">SEIKUKAI</p>
          <div className="mt-4 h-1 w-12 bg-[#ff6600] mx-auto"></div>
          <h2 className="mt-6 text-xl font-bold text-[#001f3f]">
            {admin ? '管理者パネル' : '生徒ポータル'}
          </h2>
        </div>

        {/* ログインフォーム */}
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-[#001f3f] mb-1">メールアドレス</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#ff6600] outline-none transition-all"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#001f3f] mb-1">パスワード</label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#ff6600] outline-none transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-4 border border-transparent rounded-lg shadow-sm text-lg font-bold text-white bg-[#ff6600] hover:bg-[#e65c00] focus:outline-none transition-colors"
          >
            {loading ? '認証中...' : 'ログイン'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-8">
          &copy; 1977-{new Date().getFullYear()} SEIKUKAI. All Rights Reserved.
        </p>
      </div>
    </div>
  )
}
// 一番外側の div をこれに書き換えてください
<div className="min-h-screen w-screen bg-white flex items-center justify-center p-0 m-0 overflow-x-hidden">
  
  {/* そのすぐ内側の div（白いカード部分） */}
  <div className="w-full max-w-[400px] space-y-8 bg-white p-10 rounded-xl shadow-2xl border-t-8 border-[#ff6600] mx-4">
    {/* ...中身はそのまま... */}
