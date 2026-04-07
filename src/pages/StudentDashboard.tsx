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

// 帯の順序を定義（履歴の並び替え用）
const BELT_ORDER = ['白帯', '黄帯', '青帯', '橙帯', '紫帯', '緑帯', '茶帯', '黒帯'];

export default function StudentPortal({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const targetBelt = getTargetBelt(profile.kyu)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      
      // 1. 全ての審査基準と自分の全評価を取得
      const { data: allCriteria } = await supabase.from('criteria').select('*')
      const { data: allEvals } = await supabase.from('evaluations').select('*').eq('student_id', profile.id)

      if (allCriteria && allEvals) {
        // 全データを帯（dan）ごとにグループ化
        const groupedByBelt: Record<string, any[]> = {};
        
        allCriteria.forEach(c => {
          const evalEntry = allEvals.find(e => e.criterion_id === c.id);
          if (!groupedByBelt[c.dan]) groupedByBelt[c.dan] = [];
          groupedByBelt[c.dan].push({ ...c, grade: evalEntry?.grade || null });
        });

        // 現在の目標と履歴に分ける
        const historyData: any[] = [];
        Object.entries(groupedByBelt).forEach(([belt, items]) => {
          const score = items.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0);
          if (belt === targetBelt) {
            setCurrentCriteria(items);
          } else if (score >= 80) { // 80点以上＝合格済み履歴とする
            historyData.push({ belt, score, items });
          }
        });

        // 履歴を帯の順（昇順）にソート
        historyData.sort((a, b) => BELT_ORDER.indexOf(a.belt) - BELT_ORDER.indexOf(b.belt));
        setHistory(historyData);
      }
      setLoading(false)
    }
    loadData()
  }, [profile.id, targetBelt])

  const totalScore = currentCriteria.reduce((acc, curr) => acc + gradeToScore(curr.grade), 0);
  const isEligible = totalScore >= 80;

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-20 text-[#001f3f]">
      {/* ヘッダー */}
      <div className="bg-[#001f3f] px-6 pt-12 pb-10 rounded-b-[40px] shadow-2xl relative">
        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#ff6600]"></div>
        <h1 className="text-white text-3xl font-black tracking-tighter mb-1">{profile.name}</h1>
        <p className="text-[#ff6600] font-bold text-xs uppercase tracking-widest">{profile.kyu} 保持</p>
      </div>

      <div className="px-5 -mt-6">
        {/* 現在のスコアボード */}
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 mb-8 text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">現在の挑戦: {targetBelt}</p>
          <div className="flex justify-center items-baseline mb-4">
            <span className="text-6xl font-black">{totalScore}</span>
            <span className="text-xl font-bold ml-1 text-gray-300">/ 100</span>
          </div>
          {isEligible ? (
            <div className="bg-[#ff6600] text-white py-4 rounded-2xl font-black text-sm animate-bounce shadow-lg shadow-orange-200">審査可能です！</div>
          ) : (
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
              <div className="bg-[#ff6600] h-full transition-all duration-1000" style={{ width: `${totalScore}%` }}></div>
            </div>
          )}
        </div>

        {/* 履歴セクション */}
        {history.length > 0 && (
          <div className="mb-8">
            <h2 className="font-black text-sm text-gray-400 mb-4 px-2 uppercase tracking-[0.2em]">合格済みの記録</h2>
            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
              {history.map((h) => (
                <div key={h.belt} className="flex-shrink
