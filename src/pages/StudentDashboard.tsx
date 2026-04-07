import { useEffect, useState } from 'react'
import { supabase, Profile, Criterion, BeltConfig, DAN_COLORS, calcScore, calcAge } from '../lib/supabase'

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [criteria,   setCriteria]   = useState<Criterion[]>([])
  const [evalMap,    setEvalMap]    = useState<Record<number, string>>({})
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
  const manten     = beltConfig?.manten ?? 0
  const pct        = manten > 0 ? Math.min((totalScore / manten) * 100, 100) : 0
  const gohi       = profile.gohi === '合格' ? '合格' : kitei > 0 && totalScore >= kitei ? '受験可能' : '練習中'
  const gohiColor  = gohi === '合格' ? 'text-green-500' : gohi === '受験可能' ? 'text-red-500' : 'text-gray-400'
  const danStyle   = DAN_COLORS[profile.dan] || { bg: '#ccc', text: '#333' }

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
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div style={{ backgroundColor: danStyle.bg }} className="px-4 py-4 flex justify-between items-center">
        <div>
          <p style={{ color: danStyle.text }} className="text-xs opacity-70">{profile.kyu}</p>
          <h1 style={{ color: danStyle.text }} className="text-2xl font-black">{profile.name}</h1>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ color: danStyle.text, borderColor: danStyle.text }}
          className="text-xs border rounded-full px-3 py-1 opacity-60"
        >ログアウト</button>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto pb-12">
        {/* ステータスカード */}
        <div className="grid grid-cols-2 gap-3">
          {[
            ['稽古日数', `${profile.keiko_days}日`],
            ['合計点',   `${totalScore.toFixed(1)}点`],
            ['規定点',   `${kitei}点`],
          ].map(([label, val]) => (
            <div key={label} className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{val}</p>
            </div>
          ))}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400">合否</p>
            <p className={`text-2xl font-black mt-1 ${gohiColor}`}>{gohi}</p>
          </div>
        </div>

        {/* プログレスバー */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-2">達成度</p>
          <div className="relative h-3 bg-gray-100 rounded-full overflow-visible">
            <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: danStyle.bg }} />
            {kitei > 0 && manten > 0 && (
              <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-red-600"
                style={{ left: `${(kitei / manten) * 100}%` }} />
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0</span>
            {kitei > 0 && <span>規定{kitei}</span>}
            <span>満点{manten}</span>
          </div>
        </div>

        {/* 審査項目 */}
        {Object.keys(grouped).length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="bg-gray-900 px-4 py-2 grid grid-cols-12 text-xs text-white font-bold">
              <span className="col-span-2">評価</span>
              <span className="col-span-4">種目</span>
              <span className="col-span-6">内容</span>
            </div>
            {Object.entries(grouped).map(([type, items]) =>
              items.map((cr, i) => (
                <div key={cr.id} className={`grid grid-cols-12 items-center px-2 py-2 border-b border-gray-50 text-sm ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
                  <div className="col-span-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${hyokaClass(evalMap[cr.id] || '')}`}>
                      {evalMap[cr.id] || '-'}
                    </span>
                  </div>
                  <span className="col-span-4 text-xs text-gray-500">{i === 0 ? type : ''}</span>
                  <span className="col-span-6 text-xs text-gray-800">{cr.examination_content}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
            審査基準がまだ登録されていません
          </div>
        )}

        {/* プロフィール */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
          <p className="text-xs font-bold text-gray-500 mb-3">プロフィール</p>
          {[
            ['帯色', profile.dan],
            ['入会日', profile.join_date || '-'],
            ['年齢', calcAge(profile.birth_date) + '歳'],
            ['学年', profile.gakuinen || '-'],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-sm text-gray-400">{label}</span>
              <span className="text-sm font-semibold text-gray-800">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
