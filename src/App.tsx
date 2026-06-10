import { useEffect, useState } from 'react'
import { supabase, Profile } from './lib/supabase'
import { useLang } from './lib/i18n'
import { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage'
import StudentDashboard from './pages/StudentDashboard'
import AdminDashboard from './pages/AdminDashboard'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { ToastProvider } from './components/Toast'

const ADMIN_MODE_STORAGE_KEY = 'seikukai.isAdminMode'
const SELECTED_PROFILE_STORAGE_KEY = 'seikukai.selectedProfileId'

function AppInner() {
  const { t } = useLang()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [familyProfiles, setFamilyProfiles] = useState<Profile[]>([])
  const [ready, setReady]     = useState(false)
  // PASSWORD_RECOVERY 検出時のみ true。リカバリーセッション中のみ新パスワード入力画面を出す。
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null)

  // 初期値: URLクエリ > localStorage（明示的に保存された選択） > false
  const [isAdminMode, setIsAdminMode] = useState(() => {
    if (window.location.search.includes('admin=true')) return true
    return localStorage.getItem(ADMIN_MODE_STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    const handlePopState = () => {
      setIsAdminMode(window.location.search.includes('admin=true'))
    }
    window.addEventListener('popstate', handlePopState)

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user?.email) loadProfile(data.session.user.email)
      else setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // PASSWORD_RECOVERY: リセットリンク経由で来た場合。
      // 専用画面 (ResetPasswordPage) に遷移して、updateUser({ password }) で
      // リカバリーセッションへ新パスワードを設定する。
      // 注意: 管理者がログイン中に生徒のリカバリーリンクを開くと管理者のセッションが
      // 上書きされる事故が起きる。recoveryMode=true 中は他の画面を出さないことで
      // 「気付かず操作する」事故を防ぐ。
      if (event === 'PASSWORD_RECOVERY') {
        setSession(s)
        setRecoveryEmail(s?.user?.email ?? null)
        setRecoveryMode(true)
        setReady(true)
        return
      }
      setSession(s)
      if (s?.user?.email) {
        loadProfile(s.user.email)
      } else {
        setProfile(null)
        setFamilyProfiles([])
        setReady(true)
        // サインアウト時は localStorage を削除。次ユーザーの profile.is_admin で再判定させる
        localStorage.removeItem(ADMIN_MODE_STORAGE_KEY)
        localStorage.removeItem(SELECTED_PROFILE_STORAGE_KEY)
        setIsAdminMode(false)
        setRecoveryMode(false)
        setRecoveryEmail(null)
      }
    })

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // profile ロード完了時にモードを決定
  // - 非管理者: 強制的に生徒モード
  // - 管理者: 明示保存があればそれを使う、無ければ管理者モードをデフォルト
  useEffect(() => {
    if (!profile) return
    if (!profile.is_admin) {
      setIsAdminMode(false)
      return
    }
    const stored = localStorage.getItem(ADMIN_MODE_STORAGE_KEY)
    if (stored === null) {
      setIsAdminMode(true)
    } else {
      setIsAdminMode(stored === 'true')
    }
  }, [profile])

  // 家族運用対応: login_email OR parent_login_email に一致する全プロファイル取得
  const loadProfile = async (email: string) => {
    const lower = email.trim().toLowerCase()
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`login_email.ilike.${lower},parent_login_email.ilike.${lower}`)

    if (error) console.warn('[loadProfile] query error:', error.message)

    const list = (rows as Profile[] | null) ?? []
    setFamilyProfiles(list)

    if (list.length === 0) {
      console.error('[loadProfile] no profile matched for email:', email)
      setProfile(null)
      setReady(true)
      return
    }

    const savedId = localStorage.getItem(SELECTED_PROFILE_STORAGE_KEY)
    let selected = list.find(p => p.id === savedId)
    if (!selected) {
      selected = list.find(p => (p.login_email || '').toLowerCase() === lower) || list[0]
    }
    setProfile(selected)
    setReady(true)
  }

  const switchProfile = (id: string) => {
    const target = familyProfiles.find(p => p.id === id)
    if (!target) return
    localStorage.setItem(SELECTED_PROFILE_STORAGE_KEY, id)
    setProfile(target)
  }

  const toggleMode = (toAdmin: boolean) => {
    const newUrl = toAdmin ? '?admin=true' : window.location.pathname
    window.history.pushState({}, '', newUrl)
    setIsAdminMode(toAdmin)
    localStorage.setItem(ADMIN_MODE_STORAGE_KEY, String(toAdmin))
  }

  if (!ready) return (
    <div className="min-h-screen bg-[#001f3f] flex items-center justify-center">
      <div className="text-white text-xl font-bold tracking-widest animate-pulse">{t('読み込み中...', 'Loading...')}</div>
    </div>
  )

  // ★ パスワードリセット中: 専用画面のみ表示（管理画面/生徒画面を出さない）
  if (recoveryMode) {
    return (
      <ResetPasswordPage
        email={recoveryEmail}
        onDone={() => {
          setRecoveryMode(false)
          setRecoveryEmail(null)
        }}
      />
    )
  }

  // 未ログイン時：切り替えリンク付きのログイン画面を表示
  if (!session || !profile) {
    return (
      <div className="relative">
        <LoginPage admin={isAdminMode} />
        <div className="fixed bottom-8 left-0 right-0 text-center">
          <button
            onClick={() => toggleMode(!isAdminMode)}
            className="text-[10px] text-[#001f3f]/30 hover:text-[#ff6600] font-bold transition-colors underline decoration-dotted"
          >
            {isAdminMode
              ? t('→ 生徒用ポータルへ', '→ Student Portal')
              : t('→ 管理者ログインはこちら', '→ Admin Login')}
          </button>
        </div>
      </div>
    )
  }

  // 管理者モードでの表示
  if (isAdminMode) {
    if (!profile.is_admin) return (
      <div className="min-h-screen bg-[#001f3f] flex items-center justify-center flex-col gap-6 p-6 text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-2">
          <span className="text-red-500 text-3xl">⚠️</span>
        </div>
        <p className="text-white font-bold leading-relaxed">
          {t('管理者権限がありません。', 'No administrator privileges.')}<br />
          <span className="text-sm font-normal opacity-60 text-gray-300">
            {t('データベースの is_admin 設定を確認してください。', 'Please check the is_admin setting in the database.')}
          </span>
        </p>
        <button
          onClick={() => {
            toggleMode(false)
            supabase.auth.signOut()
          }}
          className="bg-[#ff6600] text-white px-8 py-3 rounded-xl font-bold shadow-lg"
        >
          {t('ログアウトして戻る', 'Logout and return')}
        </button>
      </div>
    )
    return (
      <AdminDashboard
        profile={profile}
        onReload={() => session?.user?.email && loadProfile(session.user.email)}
        onSwitchToStudent={() => toggleMode(false)}
      />
    )
  }

  // 生徒モードでの表示
  return (
    <StudentDashboard
      profile={profile}
      onReload={() => session?.user?.email && loadProfile(session.user.email)}
      familyProfiles={familyProfiles.length > 1 ? familyProfiles : undefined}
      onSwitchProfile={familyProfiles.length > 1 ? switchProfile : undefined}
      onSwitchToAdmin={profile.is_admin ? () => toggleMode(true) : undefined}
    />
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}
