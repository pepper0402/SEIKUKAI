import { useEffect, useState, useCallback } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const loadStudents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // 検索フィルタ（名前、支部、級、帯で絞り込み）
  const filteredStudents = students.filter(s => {
    const belt = getTargetBelt(s.kyu);
    const searchStr = `${s.name} ${s.kyu} ${(s as any).branch || ''} ${belt}`.toLowerCase();
    return searchStr.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#f0f2f5] overflow-hidden text-[#001f3f]">
      {/* 左：生徒検索・一覧（ここが検索パネルになります） */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col h-full shadow-xl">
        <div className="p-6 bg-[#001f3f] text-white">
          <h1 className="text-lg font-black tracking-widest mb-4">SEIKUKAI ADMIN</h1>
          <input 
            type="text" 
            placeholder="名前・級・支部で検索..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-xs focus:bg-white focus:text-[#001f3f] transition-all outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredStudents.map(s => (
            <button key={s.id} onClick={() => setSelectedStudent(s)}
              className={`w-full p-4 border-b border-gray-50 flex flex-col items-start transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-r-4 border-[#ff6600]' : 'hover:bg-gray-50'}`}>
              <p className="font-black text-sm">{s.name}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">{(s as any).branch || '未設定'}</span>
                <span className="text-[9px] font-bold text-[#ff6600] uppercase tracking-tighter">{s.kyu}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 右：評価入力エリア */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onUpdate={loadStudents} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-300 font-black uppercase tracking-widest">
            生徒を選択してください
          </div>
        )}
      </div>
    </div>
  )
}

// 評価パネルの内部ロジックなどは以前のコードと同様です。
// まずは「左に一覧・右に詳細」のレイアウトに切り替わるか確認してください！
