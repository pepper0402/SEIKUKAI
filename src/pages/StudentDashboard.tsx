import { useEffect, useState } from 'react'
import { supabase, Profile, Criterion } from '../lib/supabase'

export default function StudentPortal({ profile }: { profile: Profile }) {
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        // 審査基準を全件取得（まずはフィルターなしで全部出す）
        const { data, error } = await supabase
          .from('criteria')
          .select('*')
          .order('id', { ascending: true })
        
        if (error) throw error
        
        console.log("取得した審査基準:", data) // ブラウザのコンソールで確認用
        setCriteria(data || [])
      } catch (err: any) {
        setErrorMsg(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#ff6600] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ヘッダー */}
      <div className="bg-[#001f3f] px-6 pt-12 pb-6 rounded-b-[40px] shadow-2xl">
        <h1 className="text-white text-3xl font-black tracking-tighter mb-1">{profile.name}</h1>
        <p className="text-[#ff6600] font-bold text-xs uppercase tracking-[0.2em]">{profile.kyu} | 誠空会 会員</p>
      </div>

      <div className="px-5 -mt-4">
        {errorMsg && (
          <div className="bg-red-50 text-red-500 p-4 rounded-2xl mb-4 text-xs font-bold">
            エラー: {errorMsg}
          </div>
        )}

        <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 mb-8">
          <h2 className="text-[#001f3f] font-black text-lg mb-4 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-[#ff6600] rounded-full"></span>
            審査基準一覧
          </h2>
          
          <div className="space-y-4">
            {criteria.length > 0 ? (
              criteria.map((c) => (
                <div key={c.id} className="border-l-4 border-orange-100 pl-4 py-1">
                  <p className="text-[9px] font-black text-[#ff6600] uppercase mb-1 tracking-widest">{c.examination_type}</p>
                  <p className="text-sm font-bold text-[#001f3f] leading-tight">{c.examination_content}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <p className="text-gray-400 text-xs font-bold italic">現在、表示できる審査基準がありません。</p>
                <p className="text-gray-300 text-[10px] mt-2">※Table Editorの "criteria" テーブルにデータが入っているか確認してください。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
