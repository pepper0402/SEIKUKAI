import { useState } from 'react'
import { supabase, APP_URL } from '../lib/supabase'
import { useLang, LangToggle } from '../lib/i18n'

export default function LoginPage({ admin }: { admin?: boolean }) {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  const humanizeError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes('invalid') || m.includes('credentials')) {
      return t('メールアドレスまたはパスワードが正しくありません。', 'Incorrect email or password.');
    }
    if (m.includes('not confirmed') || m.includes('confirm')) {
      return t('メールアドレスの確認が完了していません。確認メールをご確認ください。', 'Email not confirmed. Please check your inbox for the confirmation email.');
    }
    if (m.includes('rate') || m.includes('too many')) {
      return t('試行回数が多すぎます。しばらく時間をおいて再度お試しください。', 'Too many attempts. Please wait a moment and try again.');
    }
    if (m.includes('network')) {
      return t('ネットワークに接続できません。通信環境をご確認ください。', 'Cannot connect to the network. Please check your connection.');
    }
    return t(
      `ログインに失敗しました（${msg}）。解決しない場合は管理者にお問い合わせください。`,
      `Login failed (${msg}). Please contact your administrator if the issue persists.`
    );
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
      setErrorMsg(t(
        'リセットメールを送るには、まずメールアドレスを入力してください。',
        'Please enter your email address first to send a reset email.'
      ));
      return;
    }
    setResetting(true);
    setErrorMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/`,
    });
    setResetting(false);
    if (error) setErrorMsg(t(
      'リセットメール送信に失敗しました: ' + error.message,
      'Failed to send reset email: ' + error.message
    ));
    else alert(t(
      'パスワードリセット用のメールを送信しました。受信箱をご確認ください。',
      'Password reset email sent. Please check your inbox.'
    ));
  };

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center p-4 relative">
      {/* 言語切替ボタン（右上に固定） */}
      <div className="absolute top-4 right-4">
        <LangToggle className="text-xs font-bold text-[#001f3f] border border-[#001f3f]/20 rounded-lg px-3 py-1.5 hover:bg-[#001f3f] hover:text-white transition-colors" />
      </div>

      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl border-t-8 border-[#ff6600]">

        {/* ロゴ・タイトル */}
        <div className="text-center">
          <h1 className="text-4xl font-black text-[#001f3f] tracking-tighter">
            {t('誠空会', 'SEIKUKAI')}
          </h1>
          <p className="text-[#ff6600] font-bold mt-1 tracking-[0.2em]">SEIKUKAI</p>
          <div className="mt-4 h-1 w-12 bg-[#ff6600] mx-auto"></div>
          <h2 className="mt-6 text-xl font-bold text-[#001f3f]">
            {admin
              ? t('管理者パネル', 'Admin Panel')
              : t('生徒ポータル', 'Student Portal')}
          </h2>
        </div>

        {/* ログインフォーム */}
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-[#001f3f] mb-1">
                {t('メールアドレス', 'Email Address')}
              </label>
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
              <label className="block text-sm font-bold text-[#001f3f] mb-1">
                {t('パスワード', 'Password')}
              </label>
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
            {loading ? t('認証中...', 'Signing in...') : t('ログイン', 'Login')}
          </button>

          <button
            type="button"
            onClick={handleResetRequest}
            disabled={resetting}
            className="w-full text-xs text-[#001f3f] hover:text-[#ff6600] font-bold underline decoration-dotted underline-offset-4 disabled:opacity-50"
          >
            {resetting
              ? t('送信中...', 'Sending...')
              : t('パスワードを忘れた場合', 'Forgot your password?')}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-8">
          &copy; 1977-{new Date().getFullYear()} SEIKUKAI. All Rights Reserved.
        </p>
      </div>
    </div>
  )
}
