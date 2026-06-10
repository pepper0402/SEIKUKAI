import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang, LangToggle } from '../lib/i18n'
import { useToast } from '../components/Toast'

/**
 * パスワードリセットメールのリンクをクリックして辿り着いた専用画面。
 * App.tsx で PASSWORD_RECOVERY イベントを検出してこのページに遷移。
 * このタイミングでのみ supabase.auth.updateUser({ password }) が
 * リカバリーセッションに対して適用される。
 */
export default function ResetPasswordPage({ email, onDone }: {
  email?: string | null
  onDone: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast.warn(t('パスワードは8文字以上で設定してください。', 'Please use at least 8 characters.'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.warn(t('確認用パスワードが一致しません。', 'The confirmation does not match.'))
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSubmitting(false)
    if (error) {
      toast.error(t('パスワード変更に失敗しました: ', 'Failed to change password: ') + error.message)
      return
    }
    setDone(true)
    toast.success(t('新しいパスワードを設定しました。ログイン画面に戻ります。',
                    'Your new password has been set. Returning to login.'))
    // 安全のためサインアウトしてログイン画面へ
    setTimeout(async () => {
      await supabase.auth.signOut()
      onDone()
    }, 1500)
  }

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <LangToggle className="text-xs font-bold text-[#001f3f] border border-[#001f3f]/20 rounded-lg px-3 py-1.5 hover:bg-[#001f3f] hover:text-white transition-colors" />
      </div>

      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl border-t-8 border-[#ff6600]">
        <div className="text-center">
          <h1 className="text-3xl font-black text-[#001f3f] tracking-tighter">
            {t('新しいパスワード設定', 'Set New Password')}
          </h1>
          <p className="text-[#ff6600] font-bold mt-1 tracking-[0.2em] text-xs">SEIKUKAI</p>
          <div className="mt-4 h-1 w-12 bg-[#ff6600] mx-auto"></div>
          {email && (
            <p className="mt-4 text-xs font-bold text-gray-500 truncate">{email}</p>
          )}
        </div>

        {done ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-5 text-center">
            <p className="text-emerald-700 font-black text-sm">
              ✓ {t('変更完了。ログイン画面に戻ります...', 'Done. Returning to login...')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-[#001f3f] mb-1">
                {t('新しいパスワード', 'New Password')}
              </label>
              <input
                type="password"
                required
                autoFocus
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#ff6600] outline-none transition-all"
                placeholder={t('8文字以上', 'At least 8 characters')}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#001f3f] mb-1">
                {t('確認のためもう一度', 'Confirm Password')}
              </label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#ff6600] outline-none transition-all"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 px-4 border border-transparent rounded-lg shadow-sm text-lg font-bold text-white bg-[#ff6600] hover:bg-[#e65c00] focus:outline-none transition-colors disabled:opacity-50"
            >
              {submitting ? t('設定中...', 'Setting...') : t('新しいパスワードを設定', 'Set New Password')}
            </button>

            <p className="text-[10px] text-gray-500 font-bold leading-relaxed text-center">
              {t(
                'このリンクは短時間のみ有効です。期限切れの場合はログイン画面からもう一度「パスワードを忘れた」を実行してください。',
                'This link expires shortly. If it has expired, return to login and request a reset again.'
              )}
            </p>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">
          &copy; 1977-{new Date().getFullYear()} SEIKUKAI. All Rights Reserved.
        </p>
      </div>
    </div>
  )
}
