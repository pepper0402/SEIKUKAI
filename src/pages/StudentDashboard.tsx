import { useEffect, useState } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

// 級から帯の色を判定する関数
const getBeltColor = (kyu: string) => {
  if (!kyu || kyu === '無級') return '白帯';
  if (kyu.includes('10級') || kyu.includes('9級')) return '黄帯';
  if (kyu.includes('8級') || kyu.includes('7級')) return '青帯';
  if (kyu.includes('6級') || kyu.includes('5級')) {
    // 本来は年齢で分けますが、一旦データ上の表記に従います
    return '橙帯/紫帯';
  }
  if (kyu.includes('4級') || kyu.includes('3級')) return '緑帯';
  if (kyu.includes('2級') || kyu.includes('1級')) return '茶帯';
  if (kyu.includes('段')) return '黒帯';
  return '白帯';
}

export default function StudentPortal({ profile }: { profile: Profile }) {
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [loading, setLoading] = useState(true)
  const currentBelt = getBeltColor(profile.kyu)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      // 自分の現在の帯に対応する審査基準のみを取得
      // criteriaテーブルに 'belt' カラムがある前提、もしくは内容からフィルタリング
      const { data } = await supabase
        .from('criteria')
        .select('*')
        .eq('target_belt', currentBelt) // テーブルにtarget_beltカラムを追加推奨
        .order('id', { ascending: true })
      
      setCriteria(data || [])
      setLoading(false)
    }
    loadData()
  }, [currentBelt])

  // 仮の点数計算ロジック（実際はデータベースから取得した評価点数を使用）
  const totalScore = 85; // ダミーデータ
  const isEligible = totalScore >= 80; // 80点以上で審査可能とする例

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-[#001f3f] px-6 pt-12 pb-10 rounded-b-[40px] shadow-2xl relative overflow-hidden">
        {/* 装飾用の帯色ライン */}
        <div className="absolute bottom-0 left-0 w-full h-2 bg-[#ff6600]"></div>
        
        <h1 className="text-white text-3xl font-black tracking-tighter mb-1">{profile.name}</h1>
        <div className="flex items-center gap-2">
          <span className="text-[#ff6600] font-bold text-xs uppercase tracking-[0.2em]">{profile.kyu}</span>
          <span className="bg-white/10 text-white/60 text-[10px] px-2 py-0.5 rounded-full font-bold">{currentBelt}</span>
        </div>
      </div>

      <div className="px-5 -mt-6">
        {/* ステータスカード */}
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 mb-6 text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">現在の評価点数</p>
          <div className="text-5xl font-black text-[#001f3f] mb-4">{totalScore}<span className="text-sm ml-1">点</span></div>
          
          {isEligible ? (
            <div className="bg-green-500 text-white py-3 rounded-2xl font-black text-sm animate-bounce shadow-lg shadow-green-200">
              審査可能です！
            </div>
          ) : (
            <div className="bg-gray-100 text-gray-400 py-3 rounded-2xl font-black text-sm">
              あと {80 - totalScore} 点で審査可能
            </div>
          )}
        </div>

        {/* 審査基準セクション */}
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 mb-8">
          <h2 className="text-[#001f3f] font-black text-lg mb-6 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-[#ff6600] rounded-full"></span>
            {currentBelt}の審査項目
          </h2>
          
          <div className="space-y-6">
            {criteria.length > 0 ? (
              criteria.map((c) => (
                <div key={c.id} className="relative pl-6 border-l-2 border-orange-100">
                  <div className="absolute -left-[5px] top-1 w-2 h-2 bg-[#ff6600] rounded-full"></div>
                  <p className="text-[10px] font-black text-[#ff6600] uppercase mb-1 tracking-widest">{c.examination_type}</p>
                  <p className="text-sm font-bold text-[#001f3f] leading-tight mb-2">{c.examination_content}</p>
                  {/* ここに項目ごとの点数（A~D）を表示するパーツを後で追加 */}
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-xs text-center py-10 italic">審査基準を読み込み中、または設定されていません。</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
