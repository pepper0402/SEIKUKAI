import { useEffect, useState } from 'react'
import { supabase, Profile } from './lib/supabase'
import { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage'
import StudentDashboard from './pages/StudentDashboard'
import AdminDashboard from './pages/AdminDashboard'

export default function App({ admin }: { admin?: boolean }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady]     = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.email!)
      else setReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadProfile(s.user.email!)
      else { setProfile(null); setReady(true) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (email: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('login_email', email).single()
    setProfile(data)
    setReady(true)
  }

  if (!ready) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white text-xl">読み込み中...</div>
    </div>
  )

  if (!session || !profile) return <LoginPage admin={admin} />

  if (admin) {
    if (!profile.is_admin) return (
      <div className="min-h-screen bg-black flex items-center justify-center flex-col gap-4">
        <p className="text-white">管理者アカウントではありません</p>
        <button onClick={() => supabase.auth.signOut()} className="bg-red-700 text-white px-6 py-2 rounded">ログアウト</button>
      </div>
    )
    return <AdminDashboard profile={profile} onReload={() => loadProfile(profile.login_email)} />
  }

  return <StudentDashboard profile={profile} />
}
