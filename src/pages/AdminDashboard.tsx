import { useEffect, useState } from 'react'
import { supabase, Profile } from '../lib/supabase'

// 帯の順序を定義（CSVのdanカラムと一致させる）
const BELT_ORDER = ['白帯', '黄帯', '青帯', '橙帯', '緑帯', '茶帯', '黒帯'];

const getBeltTheme = (kyu: string) => {
  if (!kyu || kyu === '無級') return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', badge: 'bg-gray-100 text-gray-500' };
  if (kyu.includes('10級') || kyu.includes('9級')) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-900', badge: 'bg-yellow-500 text-white' };
  if (kyu.includes('8級') || kyu.includes('7級')) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white', badge: 'bg-blue-800 text-white' };
  if (kyu.includes('6級') || kyu.includes('5級')) return { name: '橙帯', bg: 'bg-orange-500', text: 'text-white', badge: 'bg-orange-700 text-white' };
  if (kyu.includes('4級') || kyu.includes('3級')) return { name: '緑帯', bg: 'bg-green-600', text: 'text-white', badge: 'bg-green-800 text-white' };
  if (kyu.includes('2級') || kyu.includes('1級')) return { name: '茶帯', bg: 'bg-amber-900', text: 'text-white', badge: 'bg-amber-950 text-white' };
  if (kyu.includes('段')) return { name: '黒帯', bg: 'bg-gray-900', text: 'text-white', badge: 'bg-black text-white' };
  return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', badge: 'bg-gray-100 text-gray-400' };
}

const gradeToScore = (grade: string | null) => {
  if (grade === 'A') return 2.5;
  if (grade === 'B') return 1.5;
  if (grade === 'C') return 0.5;
  return 0;
};

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const theme = getBeltTheme(profile.kyu || '無級')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      // CSVのdan列が「橙帯」などになっている場合を想定
      const searchDan = theme.name.split('・')[0];

      const { data: criteriaData } = await supabase
        .from('criteria')
        .select('*')
        .eq('dan', searchDan)
        .order('id', { ascending: true })

      const { data: scoresData } = await supabase
        .from('evaluations')
        .select('*')
        .eq('student_id', profile.id)

      const combined = (criteriaData || []).map(c => ({
        ...c,
        grade: scoresData?.find(s => s.criterion_id === c.id)?.grade || null
      }));

      setCurrentCriteria(combined)
      setLoading(false)
    }
    loadData()
  }, [profile.id, theme.name])

  const totalScore = currentCriteria.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0);
  const isEligible = totalScore >= 80;

  if (loading) return <div className="flex justify-center py-20 font-black text-gray-300">LOADING...</div>

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-12 text-[#001f3f]">
      {/* ヘッダー省略 (前回と同じ) */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-12 pb-24 rounded-b-[60px] shadow-2xl relative overflow-hidden`}>
        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-2">
               <h1 className="text-4xl font-black tracking-tighter leading-none">{profile.name}</h1>
               <div className={`${theme.badge} px-4 py-2 rounded-2xl shadow-lg flex flex-col items-center justify-center min-w-[70px]`}>
                  <span className="text-[9px] font-black opacity-80">{theme.name}</span>
                  <span className="text-xl font-black">{profile.kyu || '無級'}</span>
                </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-14 relative z-20 max-w-md mx-auto">
        {/* スコアカード */}
        <div className="bg-white rounded-[40px] p-8 shadow-2xl border border-white mb-10 text-center">
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] mb-2">Next Belt Eligibility</p>
          <div className="flex justify-center items-baseline gap-1 mb-4">
            <span className={`text-7xl font-black tracking-tighter ${isEligible ? 'text-green-500' : 'text-[#001f3f]'}`}>
              {totalScore}
            </span>
            <span className="text-xl font-black opacity-10">/ 100</span>
          </div>

          {/* 80点未満の場合の警告メッセージ */}
          {!isEligible ? (
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6">
              <p className="text-orange-600 text-[11px] font-black tracking-tight">
                ⚠️ あと {80 - totalScore} 点で昇級審査の申請が可能です。<br/>
                80点に達するまで上の帯へは進めません。
              </p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mb-6 animate-pulse">
              <p className="text-green-600 text-[11px] font-black uppercase tracking-widest">
                合格ライン突破！審査可能です
              </p>
            </div>
          )}

          <div className="relative h-4 bg-gray-50 rounded-full overflow-hidden shadow-inner">
            <div 
              className={`h-full transition-all duration-1000 ${isEligible ? 'bg-green-500' : 'bg-orange-500'}`}
              style={{ width: `${Math.min(totalScore, 100)}%` }}
            ></div>
            <div className="absolute left-[80%] top-0 w-1 h-full bg-white/50"></div>
          </div>
        </div>

        {/* 審査項目リスト */}
        <div className="space-y-4">
          {currentCriteria.map((c) => (
            <div key={c.id} className={`bg-white rounded-[32px] p-5 flex items-center gap-5 shadow-sm border border-gray-50 transition-all ${!isEligible && 'grayscale-[0.5]'}`}>
              <div className={`shrink-0 w-16 h-16 rounded-[22px] flex items-center justify-center font-black text-2xl border-2 ${
                c.grade === 'A' ? 'bg-orange-50 border-orange-500 text-orange-600' : 
                c.grade === 'B' ? 'bg-slate-50 border-slate-800 text-slate-800' :
                'bg-gray-50 text-gray-200'
              }`}>
                {c.grade || '-'}
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-[#001f3f] leading-tight">{c.examination_content}</p>
              </div>
              {c.video_url && (
                <a href={c.video_url} target="_blank" className="shrink-0 w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center shadow-sm">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
