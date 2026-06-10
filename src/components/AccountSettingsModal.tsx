import { useState } from 'react'
import { supabase, Profile } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { useToast } from './Toast'

/**
 * パスワード・メール変更モーダル。生徒画面と管理画面で共通利用。
 * variant='student' は hacomono 連携の注意を出す。'admin' は出さない。
 */
export default function AccountSettingsModal({
  profile,
  variant = 'student',
  onClose,
  onEmailChanged,
}: {
  profile: Profile
  variant?: 'student' | 'admin'
  onClose: () => void
  onEmailChanged?: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const [tab, setTab] = useState<'password' | 'email'>('password')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      toast.warn(t('パスワードは8文字以上で設定してください。', 'Please use at least 8 characters.'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.warn(t('確認用パスワードが一致しません。', 'The confirmation does not match.'))
      return
    }
    if (variant === 'admin') {
      if (!confirm(t('自分（管理者）のパスワードを変更します。よろしいですか？',
                     'Change your own (admin) password. Proceed?'))) return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSubmitting(false)
    if (error) {
      toast.error(t('パスワード変更に失敗しました: ', 'Failed to change password: ') + error.message)
      return
    }
    toast.success(t('パスワードを変更しました。次回ログインから新パスワードをお使いください。',
                    'Password changed. Use the new password from your next login.'))
    setNewPassword('')
    setConfirmPassword('')
    onClose()
  }

  const handleEmailChange = async () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      toast.warn(t('有効なメールアドレスを入力してください。', 'Please enter a valid email address.'))
      return
    }
    if (trimmed === (profile.login_email || '').toLowerCase()) {
      toast.warn(t('現在のメールアドレスと同じです。', 'Same as your current email.'))
      return
    }
    const hacomonoNote = variant === 'student'
      ? t('\n※hacomonoのご登録メールもあわせて更新をお願いします（支部/本部まで）。',
          '\nNote: please also update your registered email in hacomono via your branch/HQ.')
      : ''
    if (!confirm(t(
      `新しいメールアドレス「${trimmed}」に確認メールを送信します。\n届いたメールのリンクをクリックして変更を完了してください。${hacomonoNote}`,
      `A confirmation email will be sent to "${trimmed}".\nClick the link in the email to complete the change.${hacomonoNote}`
    ))) return
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ email: trimmed })
    setSubmitting(false)
    if (error) {
      toast.error(t('メール変更の送信に失敗しました: ', 'Failed to send email change request: ') + error.message)
      return
    }
    toast.success(t(
      `${trimmed} と現在のアドレス両方に確認メールを送信しました。両方のリンクをクリックすると変更完了です。`,
      `Confirmation emails sent to both ${trimmed} and your current address. Click both to complete the change.`
    ))
    setNewEmail('')
    onEmailChanged?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-[32px] p-7 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-lg font-black text-[#001f3f]">{t('アカウント設定', 'Account Settings')}</h3>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5 truncate">{profile.name} / {profile.login_email || t('未設定', 'Not set')}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black hover:bg-gray-200">✕</button>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-2xl mb-5">
          {([
            { k: 'password' as const, label: t('パスワード変更', 'Password') },
            { k: 'email'    as const, label: t('メール変更',     'Email') },
          ]).map(({ k, label }) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${tab === k ? 'bg-white shadow-sm text-[#001f3f]' : 'text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'password' ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('新しいパスワード', 'New Password')}</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder={t('8文字以上', 'At least 8 characters')}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('確認のためもう一度', 'Confirm Password')}</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[10px] text-blue-700 font-bold leading-relaxed">
              💡 {t('変更後もログイン状態は継続します。次回ログイン時から新パスワードをお使いください。',
                    'You remain logged in. Use the new password from your next login.')}
            </div>
            <button onClick={handlePasswordChange} disabled={submitting || !newPassword || !confirmPassword}
              className="w-full py-3 bg-[#001f3f] text-white rounded-2xl text-sm font-black disabled:opacity-50">
              {submitting ? t('変更中...', 'Changing...') : t('パスワードを変更する', 'Change Password')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('現在のメールアドレス', 'Current Email')}</label>
              <p className="text-sm font-bold text-gray-600 px-4 py-3 bg-gray-50 rounded-2xl">{profile.login_email || t('未設定', 'Not set')}</p>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('新しいメールアドレス', 'New Email')}</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="example@example.com"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-[10px] text-orange-700 font-bold leading-relaxed">
              ⚠️ {t(
                '新旧両方のメールアドレスに確認メールが届きます。両方のリンクをクリックして変更完了となります。',
                'Confirmation emails will be sent to both the old and new addresses. Click both to complete the change.'
              )}
              {variant === 'student' && t(
                ' ※hacomono側のご登録メールも別途、支部/本部にご連絡ください。',
                ' Please also update your registered email in hacomono via your branch/HQ.'
              )}
            </div>
            <button onClick={handleEmailChange} disabled={submitting || !newEmail}
              className="w-full py-3 bg-[#001f3f] text-white rounded-2xl text-sm font-black disabled:opacity-50">
              {submitting ? t('送信中...', 'Sending...') : t('確認メールを送信する', 'Send Confirmation Email')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
