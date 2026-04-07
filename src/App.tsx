import { useEffect, useState } from 'react'
import { supabase, Profile } from './lib/supabase'
import { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage'
import StudentDashboard from './pages/StudentDashboard'
import AdminDashboard from './pages/AdminDashboard'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady]     = useState(false)
  
  // URLの「?admin=true」を読み取って初期状態を決定する
  const [isAdminMode, setIsAdminMode] = useState(window.location.search.includes('admin=true'))

  useEffect(() => {
    // URLの変更を監視してモードを切り替える（リンククリック対応）
    const handlePopState = () => {
      setIsAdminMode(window.location.search.includes('admin=true'))
    }
    window.addEventListener('popstate', handlePopState)

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.email!)
      else setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) {
        loadProfile(s.user.email!)
      } else {
        setProfile(null)
        setReady(true)
      }
    })

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const loadProfile = async (email: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('login_email', email).single()
    setProfile(data)
    setReady(true)
  }

  // モード切り替えリンクのクリックイベント
  const toggleMode = (toAdmin: boolean) => {
    const newUrl = toAdmin ? '?admin=true' : window.location.pathname
    window.history.pushState({}, '', newUrl)
    setIsAdminMode(toAdmin)
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
    return <AdminDashboard profile={profile} onReload={() => loadProfile(profile.login_email)} />
  }

  // 生徒モードでの表示
  return <StudentDashboard profile={profile} />
}
