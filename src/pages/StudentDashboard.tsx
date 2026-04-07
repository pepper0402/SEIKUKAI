import { useEffect, useState } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

const getBeltTheme = (kyu: string) => {
  if (!kyu || kyu === '無級') return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200' };
  if (kyu.includes('10級') || kyu.includes('9級')) return { name: '黄帯', bg: 'bg-yellow-400', text: 'text-yellow-900', border: 'border-yellow-500' };
  if (kyu.includes('8級') || kyu.includes('7級')) return { name: '青帯', bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700' };
  if (kyu.includes('6級') || kyu.includes('5級')) return { name: '橙・紫帯', bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600' };
  if (kyu.includes('4級') || kyu.includes('3級')) return { name: '緑帯', bg: 'bg-green-600', text: 'text-white', border: 'border-green-700' };
  if (kyu.includes('2級') || kyu.includes('1級')) return { name: '茶帯', bg: 'bg-amber-900', text: 'text-white', border: 'border-amber-950' };
  if (kyu.includes('段')) return { name: '黒帯', bg: 'bg-gray-900', text: 'text-white', border: 'border-black' };
  return { name: '白帯', bg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200' };
}

const gradeToScore = (grade: string | null) => {
  if (grade === 'A') return 2.5;
  if (grade === 'B') return 1.5;
  if (grade === 'C') return 0.5;
  if (grade === 'D') return 0;
  return 0;
};

export default function StudentPortal({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const theme = getBeltTheme(profile.kyu)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const { data: criteriaData } = await supabase
        .from('criteria')
        .select('*')
        .eq('dan', theme.name.split('・')[0]) // 複数の場合は前方一致などで調整
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

  if (loading) return <div className="flex justify-center py-20 animate-pulse text-gray-400 font-black">Loading Seikukai...</div>

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-10 text-[#001f3f]">
      {/* 帯色メインヘッダー */}
      <div className={`${theme.bg} ${theme.text} px-6 pt-12 pb-16 rounded-b-[50px] shadow-xl relative overflow-hidden`}>
        <div className="absolute top-0 right-0 opacity-10 text-9xl font-black italic -mr-10 -mt-10 pointer-events-none">
          {theme.name}
        </div>
        
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70 mb-1">Current Status</p>
          <h1 className="text-4xl font-black tracking-tighter mb-2">{profile.name}</h1>
          <div className="flex items-center gap-2">
            <span className="bg-black/20 px-3 py-1 rounded-full text-[10px] font-bold backdrop-blur-sm">
              {profile.kyu || '無級'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-10 relative z-20">
        {/* スコア・プログレスカード */}
        <div className="bg-white rounded-[32px] p-6 shadow-2xl border border-white/50 mb-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Examination Score</p>
              <p className="text-5xl font-black tracking-tighter">{totalScore}<span className="text-sm ml-1 opacity-30">/100</span></p>
            </div>
            {isEligible ? (
              <div className="bg-green-500 text-white px-4 py-2 rounded-2xl font-black text-[10px] animate-bounce shadow-lg shadow-green-100">審査可能</div>
            ) : (
              <div className="text-right">
                <p className="text-[10px] font-black text-[#ff6600]">あと {80 - totalScore}点</p>
                <p className="text-[8px] font-bold text-gray-300">合格ライン: 80点</p>
              </div>
            )}
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden p-1">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${isEligible ? 'bg-green-500' : 'bg-[#ff6600]'}`}
              style={{ width: `${Math.min(totalScore, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* 審査項目セクション */}
        <h2 className="px-2 font-black text-xs text-gray-400 uppercase tracking-widest mb-4">
          {theme.name} 審査項目 一覧
        </h2>
        
        <div className="space-y-3">
          {currentCriteria.map((c) => (
            <div key={c.id} className="bg-white rounded-[24px] p-4 flex items-center gap-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              {/* 評価 A-D */}
              <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl border-2 ${
                c.grade === 'A' ? 'bg-orange-50 border-[#ff6600] text-[#ff6600]' : 
                c.grade === 'B' ? 'bg-orange-50/50 border-orange-200 text-[#ff6600]/70' :
                c.grade ? 'bg-gray-50 border-gray-100 text-gray-400' : 
                'bg-white border-dashed border-gray-200 text-gray-200'
              }`}>
                {c.grade || '-'}
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-0.5">{c.examination_type}</p>
                <p className="text-sm font-bold text-[#001f3f] leading-tight break-words">{c.examination_content}</p>
              </div>

              {/* 動画リンク（右端） */}
              {c.video_url ? (
                <a 
                  href={c.video_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-shrink-0 w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-100 transition-colors shadow-inner"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </a>
              ) : (
                <div className="w-10 h-10"></div> // スペース保持用
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
