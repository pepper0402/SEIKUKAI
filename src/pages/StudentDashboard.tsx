import { useEffect, useState } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

const getTargetBelt = (kyu: string) => {
  if (!kyu || kyu === '無級') return '白帯';
  if (kyu.includes('10級') || kyu.includes('9級')) return '黄帯';
  if (kyu.includes('8級') || kyu.includes('7級')) return '青帯';
  if (kyu.includes('6級') || kyu.includes('5級')) return '橙帯';
  if (kyu.includes('4級') || kyu.includes('3級')) return '緑帯';
  if (kyu.includes('2級') || kyu.includes('1級')) return '茶帯';
  if (kyu.includes('段')) return '黒帯';
  return '白帯';
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
  const targetBelt = getTargetBelt(profile.kyu)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const { data: criteriaData } = await supabase
        .from('criteria')
        .select('*')
        .eq('dan', targetBelt)
        .order('id', { ascending: true })

      const { data: scoresData } = await supabase
        .from('evaluations')
        .select('*')
        .eq('student_id', profile.id)

      const combined = (criteriaData || []).map(c => {
        const scoreEntry = scoresData?.find(s => s.criterion_id === c.id);
        return { ...c, grade: scoreEntry?.grade || null };
      });

      setCurrentCriteria(combined)
      setLoading(false)
    }
    loadData()
  }, [profile.id, targetBelt])

  const totalScore = currentCriteria.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0);
  const isEligible = totalScore >= 80;

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-20 text-[#001f3f]">
      {/* コンパクトなヘッダー */}
      <div className="bg-[#001f3f] px-6 py-8 rounded-b-[30px] shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-white text-2xl font-black tracking-tighter">{profile.name}</h1>
            <p className="text-[#ff6600] font-bold text-xs tracking-widest">{profile.kyu} / {targetBelt}挑戦中</p>
          </div>
          <div className="text-right text-white">
            <p className="text-[10px] font-black opacity-50 uppercase">Score</p>
            <p className="text-3xl font-black">{totalScore}<span className="text-sm font-bold opacity-50">/100</span></p>
          </div>
        </div>
        
        {/* 合格ゲージ */}
        <div className="mt-6">
          <div className="flex justify-between text-[10px] font-black text-white/50 mb-1.5 uppercase tracking-widest">
            <span>Progress</span>
            <span>{isEligible ? '審査可能' : `あと ${80 - totalScore}点`}</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${isEligible ? 'bg-green-400' : 'bg-[#ff6600]'}`}
              style={{ width: `${Math.min(totalScore, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-6">
        {/* 審査項目リスト */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
            <h2 className="font-black text-sm flex items-center gap-2">
              <span className="w-1 h-4 bg-[#ff6600] rounded-full"></span>
              {targetBelt} 審査項目
            </h2>
          </div>
          
          <div className="divide-y divide-gray-50">
            {currentCriteria.map((c) => (
              <div key={c.id} className="p-4 flex items-center gap-4">
                {/* 評価 A-D */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${
                  c.grade === 'A' ? 'bg-[#ff6600] text-white' : 
                  c.grade ? 'bg-gray-100 text-[#001f3f]' : 'bg-gray-50 text-gray-200'
                }`}>
                  {c.grade || '-'}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">{c.examination_type}</span>
                    {/* 動画リンクがある場合のみ表示 */}
                    {c.video_url && (
                      <a 
                        href={c.video_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[8px] font-black text-[#ff6600] bg-orange-50 px-1.5 py-0.5 rounded-full hover:bg-orange-100 transition-colors"
                      >
                        ▶ 動画でお手本を見る
                      </a>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#001f3f] truncate">{c.examination_content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
