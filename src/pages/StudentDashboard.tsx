import { useEffect, useState } from 'react'
import { supabase, Profile, Criterion, BeltConfig, DAN_COLORS, calcScore, calcAge } from '../lib/supabase'

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [criteria,    setCriteria]    = useState<Criterion[]>([])
  const [evalMap,     setEvalMap]     = useState<Record<number, string>>({})
  const [beltConfig, setBeltConfig] = useState<BeltConfig | null>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: cr }, { data: ev }, { data: bc }] = await Promise.all([
        supabase.from('criteria').select('*').eq('dan', profile.dan).order('id'),
        supabase.from('evaluations').select('*').eq('user_email', profile.login_email),
        supabase.from('belt_config').select('*').eq('kyu', profile.kyu).single(),
      ])
      setCriteria(cr || [])
      const map: Record<number, string> = {}
      ;(ev || []).forEach((e: any) => { map[e.criteria_id] = e.hyoka })
      setEvalMap(map)
      setBeltConfig(bc)
    }
    load()
  }, [profile])

  const totalScore = calcScore(evalMap)
  const kitei      = beltConfig?.kitei_gokaku_su ?? 0
  const manten      = beltConfig?.manten ?? 0
  const pct         = manten > 0 ? Math.min((totalScore / manten) * 100, 100) : 0
  const gohi        = profile.gohi === '合格' ? '合格' : kitei > 0 && totalScore >= kitei ? '受験可能' : '練習中'
  
  // 色の定義
  const SEIKUKAI_ORANGE = '#ff6600'
  const SEIKUKAI_NAVY = '#001f3f'
  const gohiColor = gohi === '合格' ? 'text-green-600' : gohi === '受験可能' ? 'text-[#ff6600]' : 'text-gray-400'
  const danStyle = DAN_COLORS[profile.dan] || { bg: '#ccc', text: '#333' }

  const grouped: Record<string, Criterion[]> = {}
  criteria.forEach(cr => {
    if (!grouped[cr.examination_type]) grouped[cr.examination_type] = []
    grouped[cr.examination_type].push(cr)
  })

  const hyokaClass = (h: string) =>
    h === '優' ? 'bg-yellow-100 text-yellow-800' :
    h === '良' ? 'bg-green-100 text-green-800' :
    h === '可' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'

  return (
    <div className="min-h-screen bg-white text-[#001f3f]">
      {/* ヘッダー：誠空会ネイビーをベースに帯の色でアクセント */}
      <div className="bg-[#001f3f] px-6 py-5 flex justify-between items-end shadow-md border-b-4" style={{ borderColor: danStyle.bg }}>
        <div>
          <p className="text-white text-[10px] font-bold tracking-[0.2em] opacity-70 mb-1">{profile.kyu}</p>
          <h1 className="text-2xl font-black text-white leading-none">
            {profile.name} <span className="text-sm font-normal opacity-80">選手</span>
          </h1>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-[10px] font-bold text-white border border-white/20 rounded-lg px-3 py-1.5 hover:bg-white/10 transition-colors"
        >
          ログアウト
        </button>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto pb-12">
        
        {/* ステータスカード：オレンジのアクセントライン */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 border-l-4 border-l-[#ff6600]">
            <p className="text-[10px] font-bold text-gray-400 uppercase">合計点</p>
            <p className="text-2xl font-black text-[#001f3f] mt-1">{totalScore.toFixed(1)}<span className="text-xs ml-0.5">点</span></p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 border-l-4 border-l-[#001f3f]">
            <p className="text-[10px] font-bold text-gray-400 uppercase">合否判定</p>
            <p className={`text-2xl font-black mt-1 ${gohiColor}`}>{gohi}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase">稽古日数</p>
            <p className="text-2xl font-black text-[#001f3f] mt-1">{profile.keiko_days}<span className="text-xs ml-0.5">日</span></p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase">規定点</p>
            <p className="text-2xl font-black text-[#001f3f] mt-1">{kitei}<span className="text-xs ml-0.5">点</span></p>
          </div>
        </div>

        {/* プログレスバー */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-[#001f3f] mb-3">次審査への達成度</p>
          <div className="relative h-4 bg-gray-100 rounded-full overflow-visible">
            <div 
              className="h-4 rounded-full transition-all duration-1000 shadow-inner" 
              style={{ width: `${pct}%`, backgroundColor: SEIKUKAI_ORANGE }} 
            />
            {kitei > 0 && manten > 0 && (
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-[#001f3f] rounded-full z-10"
                style={{ left: `${(kitei / manten) * 100}%` }}
              >
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-[#001f3f] whitespace-nowrap">規定点</span>
              </div>
            )}
          </div>
          <div className="flex justify-between text-[10px] font-bold text-gray-400 mt-2">
            <span>0</span>
            <span>満点 {manten}</span>
          </div>
        </div>

        {/* 審査項目：ヘッダーをネイビーに */}
        {Object.keys(grouped).length > 0 ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
            <div className="bg-[#001f3f] px-4 py-3 grid grid-cols-12 text-[10px] text-white font-black tracking-widest uppercase">
              <span className="col-span-2 text-center">評価</span>
              <span className="col-span-4 pl-2">種目</span>
              <span className="col-span-6 pl-2">内容</span>
            </div>
            {Object.entries(grouped).map(([type, items]) =>
              items.map((cr, i) => (
                <div key={cr.id} className={`grid grid-cols-12 items-center px-2 py-3 border-b border-gray-50 text-sm ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                  <div className="col-span-2 flex justify-center">
                    <span className={`inline-block w-8 py-1 rounded text-center text-[10px] font-black ${hyokaClass(evalMap[cr.id] || '')}`}>
                      {evalMap[cr.id] || '-'}
                    </span>
                  </div>
                  <span className="col-span-4 text-[10px] font-bold text-gray-500 pl-2">{i === 0 ? type : ''}</span>
                  <span className="col-span-6 text-[11px] font-medium text-[#001f3f] pl-2 leading-tight">{cr.examination_content}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-10 text-center text-gray-400 border-2 border-dashed border-gray-200">
            審査基準がまだ登録されていません
          </div>
        )}

        {/* プロフィール：誠実なネイビーでまとめる */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-xs font-black text-[#001f3f] mb-4 flex items-center">
            <span className="w-1 h-3 bg-[#ff6600] mr-2"></span>プロフィール
          </h3>
          <div className="space-y-3">
            {[
              ['現在の帯', profile.dan],
              ['入会年月日', profile.join_date || '-'],
              ['現在の年齢', calcAge(profile.birth_date) + ' 歳'],
              ['学年', profile.gakuinen || '-'],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <span className="text-[11px] font-bold text-gray-400">{label}</span>
                <span className="text-sm font-bold text-[#001f3f]">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-300 pt-4">
          &copy; SEIKUKAI POS PORTAL
        </p>
      </div>
    </div>
  )
}
