import { useState } from 'react'
import { supabase, APP_URL } from '../lib/supabase'

export default function LoginPage({ admin }: { admin?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  const humanizeError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes('invalid') || m.includes('credentials')) {
      return 'メールアドレスまたはパスワードが正しくありません。';
    }
    if (m.includes('not confirmed') || m.includes('confirm')) {
      return 'メールアドレスの確認が完了していません。確認メールをご確認ください。';
    }
    if (m.includes('rate') || m.includes('too many')) {
      return '試行回数が多すぎます。しばらく時間をおいて再度お試しください。';
    }
    if (m.includes('network')) {
      return 'ネットワークに接続できません。通信環境をご確認ください。';
    }
    return `ログインに失敗しました（${msg}）。解決しない場合は管理者にお問い合わせください。`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErrorMsg(humanizeError(error.message));
    setLoading(false)
  }

  const handleResetRequest = async () => {
    if (!email) {
      setErrorMsg('リセットメールを送るには、まずメールアドレスを入力してください。');
      return;
    }
    setResetting(true);
    setErrorMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/`,
    });
    setResetting(false);
    if (error) setErrorMsg('リセットメール送信に失敗しました: ' + error.message);
    else alert('パスワードリセット用のメールを送信しました。受信箱をご確認ください。');
  };

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

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 font-bold leading-relaxed">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-4 border border-transparent rounded-lg shadow-sm text-lg font-bold text-white bg-[#ff6600] hover:bg-[#e65c00] focus:outline-none transition-colors disabled:opacity-50"
          >
            {loading ? '認証中...' : 'ログイン'}
          </button>

          <button
            type="button"
            onClick={handleResetRequest}
            disabled={resetting}
            className="w-full text-xs text-[#001f3f] hover:text-[#ff6600] font-bold underline decoration-dotted underline-offset-4 disabled:opacity-50"
          >
            {resetting ? '送信中...' : 'パスワードを忘れた場合'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-8">
          &copy; 1977-{new Date().getFullYear()} SEIKUKAI. All Rights Reserved.
        </p>
      </div>
    </div>
  )
}
