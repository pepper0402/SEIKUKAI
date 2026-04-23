import { useEffect, useState } from 'react'
import { supabase, Profile } from './lib/supabase'
import { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage'
import StudentDashboard from './pages/StudentDashboard'
import AdminDashboard from './pages/AdminDashboard'

const ADMIN_MODE_STORAGE_KEY = 'seikukai.isAdminMode'
const SELECTED_PROFILE_STORAGE_KEY = 'seikukai.selectedProfileId'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [familyProfiles, setFamilyProfiles] = useState<Profile[]>([])
  const [ready, setReady]     = useState(false)

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
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
  // 複数あればlocalStorage保存の選択 or 先頭を current に
  const loadProfile = async (email: string) => {
    const lower = email.trim().toLowerCase()

    // login_email または parent_login_email で一致するプロファイルを全件
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

    // 前回選択したプロファイルIDがあればそれを。無ければ自分のlogin_email一致を優先、それもなければ先頭
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

  // モード切り替え（トグルボタンからの明示的な操作）
  const toggleMode = (toAdmin: boolean) => {
    const newUrl = toAdmin ? '?admin=true' : window.location.pathname
    window.history.pushState({}, '', newUrl)
    setIsAdminMode(toAdmin)
    localStorage.setItem(ADMIN_MODE_STORAGE_KEY, String(toAdmin))
  }

  if (!ready) return (
    <div className="min-h-screen bg-[#001f3f] flex items-center justify-center">
      <div className="text-white text-xl font-bold tracking-widest animate-pulse">読み込み中...</div>
    </div>
  )

  // 未ログイン時：切り替えリンク付きのログイン画面を表示
  if (!session || !profile) {
    return (
      <div className="relative">
        <LoginPage admin={isAdminMode} />
        {/* 切り替えリンク */}
        <div className="fixed bottom-8 left-0 right-0 text-center">
          <button
            onClick={() => toggleMode(!isAdminMode)}
            className="text-[10px] text-[#001f3f]/30 hover:text-[#ff6600] font-bold transition-colors underline decoration-dotted"
          >
            {isAdminMode ? '→ 生徒用ポータルへ' : '→ 管理者ログインはこちら'}
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
          管理者権限がありません。<br />
          <span className="text-sm font-normal opacity-60 text-gray-300">データベースの is_admin 設定を確認してください。</span>
        </p>
        <button
          onClick={() => {
            toggleMode(false) // 生徒モードに戻す
            supabase.auth.signOut()
          }}
          className="bg-[#ff6600] text-white px-8 py-3 rounded-xl font-bold shadow-lg"
        >
          ログアウトして戻る
        </button>
      </div>
    )
    return <AdminDashboard profile={profile} onReload={() => session?.user?.email && loadProfile(session.user.email)} />
  }

  // 生徒モードでの表示（家族複数人の場合は切替UIを渡す）
  return (
    <StudentDashboard
      profile={profile}
      onReload={() => session?.user?.email && loadProfile(session.user.email)}
      familyProfiles={familyProfiles.length > 1 ? familyProfiles : undefined}
      onSwitchProfile={familyProfiles.length > 1 ? switchProfile : undefined}
    />
  )
}
