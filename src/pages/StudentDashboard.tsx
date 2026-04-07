import { useEffect, useState } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

// 級・段から「現在目指すべき審査基準の帯（dan）」を判定する関数
const getTargetBelt = (kyu: string) => {
  if (!kyu || kyu === '無級') return '白帯';
  if (kyu.includes('10級') || kyu.includes('9級')) return '黄帯';
  if (kyu.includes('8級') || kyu.includes('7級')) return '青帯';
  if (kyu.includes('6級') || kyu.includes('5級')) return '橙帯'; // 大人なら紫ですがDBに合わせます
  if (kyu.includes('4級') || kyu.includes('3級')) return '緑帯';
  if (kyu.includes('2級') || kyu.includes('1級')) return '茶帯';
  if (kyu.includes('段')) return '黒帯';
  return '白帯';
}

// A~Dの評価を点数に変換する関数
const gradeToScore = (grade: string | null) => {
  if (grade === 'A') return 100;
  if (grade === 'B') return 80;
  if (grade === 'C') return 60;
  if (grade === 'D') return 40;
  return 0;
};

export default function StudentPortal({ profile }: { profile: Profile }) {
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // 今の級から「次に審査を受ける帯」を特定
  const targetBelt = getTargetBelt(profile.kyu)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      
      // 1. 自分の帯に対応する審査基準を取得
      const { data: criteriaData } = await supabase
        .from('criteria')
        .select('*')
        .eq('dan', targetBelt) // スクリーンショットの「dan」カラムでフィルタ
        .order('id', { ascending: true })

      // 2. 自分の評価（点数）を取得
      const { data: scoresData } = await supabase
        .from('evaluations')
        .select('*')
        .eq('student_id', profile.id)

      // 基準と点数を紐付け
      const combined = (criteriaData || []).map(c => {
        const scoreEntry = scoresData?.find(s => s.criterion_id === c.id);
        return { ...c, grade: scoreEntry?.grade || null };
      });

      setCriteria(combined)
      setLoading(false)
    }
    loadData()
  }, [profile.id, targetBelt])

  // 合格判定（全項目の平均が80点以上、かつDがない等。ここでは平均80点と仮定）
  const validScores = criteria.filter(c => c.grade !== null);
  const averageScore = validScores.length > 0 
    ? validScores.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0) / validScores.length 
    : 0;
  
  const isEligible = averageScore >= 80 && criteria.length > 0;

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-20 text-[#001f3f]">
      {/* ヘッダー */}
      <div className="bg-[#001f3f] px-6 pt-12 pb-10 rounded-b-[40px] shadow-2xl relative">
        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#ff6600]"></div>
        <h1 className="text-white text-3xl font-black tracking-tighter mb-1">{profile.name}</h1>
        <p className="text-[#ff6600] font-bold text-xs
