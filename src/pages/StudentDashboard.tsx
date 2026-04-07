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

// 誠空会スコアリング: A=2.5, B=1.5, C=0.5, D=0
const gradeToScore = (grade: string | null) => {
  if (grade === 'A') return 2.5;
  if (grade === 'B') return 1.5;
  if (grade === 'C') return 0.5;
  if (grade === 'D') return 0;
  return 0;
};

export default function StudentPortal({ profile }: { profile: Profile }) {
  const [criteria, setCriteria] = useState<any[]>([])
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

      setCriteria(combined)
      setLoading(false)
    }
    loadData()
  }, [profile.id, targetBelt])

  // 合計点計算 (最大100点)
  const totalScore = criteria.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0);
  const isEligible = totalScore >= 80; // 80%で審査可能

  if (loading) return <Loader />

  return (
    <div className="min-h-screen bg-gray-50 pb-20 text-[#001f3f]">
      {/* ヘッダー */}
      <div className="bg-[#001f3f] px-6 pt-12 pb-10 rounded-b-[40px] shadow-2xl relative">
        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#ff6600]"></div>
        <h1 className="text-white text-3xl font-black tracking-tighter mb-1">{profile.name}</h1>
        <p className="text-[#ff6600] font-bold text-xs uppercase tracking-widest">{profile.kyu} 保持</p>
      </div>

      <div className="px-5 -mt-6">
        {/* スコアボード */}
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 mb-6 text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{targetBelt} 昇級スコア</p>
          <div className="flex justify-center items-baseline mb-4">
            <span className="text-6xl font-black">{totalScore}</span>
            <span className="text-xl font-bold ml-1 text-gray-300">/ 100</span>
          </div>
          
          {isEligible ? (
            <div className="bg-[#ff6600] text-white py-4 rounded-2xl font-black text-sm animate-bounce shadow-lg shadow-orange-200">
              合格ライン突破！審査可能です
            </div>
          ) : (
            <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden mb-2">
              <div className="bg-[#ff6600] h-full transition-all duration-1000" style={{ width: `${totalScore}%` }}></div>
            </div>
          )}
          {!isEligible && (
            <p className="text-[10px] font-bold text-gray-400 mt-2">あと {80 - totalScore} 点で審査可能ライン (80点)</p>
          )}
        </div>

        {/* 項目リスト */}
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-black text-lg flex items-center gap-2">
              <span className="w-1.5 h-6 bg-[#ff6600] rounded-full"></span>
              審査項目
            </h2>
            <span className="text-[10px] font-bold text-gray-300 bg-gray-50 px-3 py-1 rounded-full uppercase">Total: {criteria.length} items</span>
          </div>
          
          <div className="space-y-4">
            {criteria.map((c) => (
              <div key={c.id} className="flex justify-between items-center p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] font-black text-white bg-[#001f3f] px-1.5 py-0.5 rounded uppercase tracking-tighter">{c.examination_type}</span>
                  </div>
                  <p className="text-sm font-bold leading-tight">{c.examination_content}</p>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl transition-all ${
                  c.grade === 'A' ? 'bg-[#ff6600] text-white shadow-lg shadow-orange-100 scale-105' : 
                  c.grade === 'B' ? 'bg-orange-50 text-[#ff6600]' : 
                  c.grade ? 'bg-gray-100 text-[#001f3f]' : 
                  'bg-gray-50 text-gray-200 border-2 border-dashed border-gray-100'
                }`}>
                  {c.grade || '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Loader() { return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div> }
