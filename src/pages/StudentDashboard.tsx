import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'

// 帯の色とテーマを取得する関数（変更なし）
const getBeltTheme = (kyu: string) => {
  if (!kyu || kyu === '無級') return { name: '白帯', bg: 'bg-white', text: 'text-gray-900' };
  if (kyu.match(/10|9/)) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-900' };
  if (kyu.match(/8|7/)) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white' };
  if (kyu.match(/6|5/)) return { name: '橙帯', bg: 'bg-orange-500', text: 'text-white' };
  if (kyu.match(/4|3/)) return { name: '緑帯', bg: 'bg-green-600', text: 'text-white' };
  if (kyu.includes('1') || kyu.includes('2')) return { name: '茶帯', bg: 'bg-amber-900', text: 'text-white' };
  return { name: '黒帯', bg: 'bg-gray-900', text: 'text-white' };
}

export default function StudentPortal({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isSettingsMode, setIsSettingsMode] = useState(false)
  
  const theme = getBeltTheme(profile.kyu)

  // ... (useEffectなどのロジックは以前と同様)

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-10 text-[#001f3f]">
      {/* ヘッダーエリア */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-10 pb-16 rounded-b-[50px] shadow-xl relative overflow-hidden transition-colors duration-500`}>
        
        {/* 装飾用の薄い文字（見切れ防止のためさらに薄く、または削除可能） */}
        <div className="absolute top-0 left-0 opacity-[0.03] text-9xl font-black italic -ml-10 -mt-5 pointer-events-none">
          SEIKUKAI
        </div>

        <div className="relative z-10">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Student Portal</p>
              
              {/* 名前と級・帯を横並びに配置 */}
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-4xl font-black tracking-tighter">{profile.name}</h1>
                <div className="flex gap-1.5">
                  <span className="bg-black/10 px-3 py-1 rounded-full text-[10px] font-black backdrop-blur-sm border border-black/5 whitespace-nowrap">
                    {profile.kyu || '無級'}
                  </span>
                  <span className="bg-black/20 px-3 py-1 rounded-full text-[10px] font-black backdrop-blur-sm border border-black/5 whitespace-nowrap">
                    {theme.name}
                  </span>
                </div>
              </div>
            </div>

            {/* 設定・ログアウトボタン（右上に配置） */}
            <div className="flex gap-3">
              <button onClick={() => setIsSettingsMode(true)} className="flex flex-col items-center gap-1 group">
                <div className="w-10 h-10 bg-black/5 group-hover:bg-black/10 rounded-full flex items-center justify-center text-lg transition-all">⚙️</div>
                <span className="text-[8px] font-black uppercase opacity-60">設定</span>
              </button>
              <button onClick={() => supabase.auth.signOut()} className="flex flex-col items-center gap-1 group">
                <div className="w-10 h-10 bg-black/5 group-hover:bg-red-500 group-hover:text-white rounded-full flex items-center justify-center text-lg transition-all">🚪</div>
                <span className="text-[8px] font-black uppercase opacity-60">終了</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 以下、メインコンテンツ（スコア・評価項目）は以前と同じ */}
      <div className="px-5 -mt-10 relative z-20">
        {/* ... (スコアカードや評価項目のコード) ... */}
      </div>
    </div>
  )
}
