import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [loading, setLoading] = useState(true)

  // 管理者権限の保護
  const isMaster = adminProfile.login_email === 'mr.pepper0402@gmail.com'

  const loadStudents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false).order('name')
    setStudents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  // 1. CSV読み込みロジックの強化
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').filter(line => line.trim() !== '') // 空行を除外
      const dataLines = lines.slice(1) // ヘッダーを除外
      
      const updates = dataLines.map(line => {
        const v = line.split(',').map(s => s.trim())
        if (v.length < 9) return null // 必須項目（メール等）が足りない行はスキップ
        
        const email = v[8]; // 9列目：メールアドレス
        const isAdmin = email === 'mr.pepper0402@gmail.com';
        
        return { 
          name: v[1] + v[2],        // 2列目(姓)+3列目(名)
          login_email: email, 
          kyu: v[7] || '無級',       // 8列目：級
          branch: v[10] || '未設定',  // 11列目：支部
          is_admin: isAdmin 
        }
      }).filter(Boolean) as any[]
      
      const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'login_email' })
      if (!error) { 
        alert('名簿と支部情報を更新しました'); 
        loadStudents(); 
      } else {
        console.error(error);
        alert('エラーが発生しました。CSVの形式を確認してください。');
      }
    }
    reader.readAsText(file)
  }

  // 2. 検索と支部フィルターの連動ロジック
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const belt = getTargetBelt(s.kyu);
      const studentBranch = (s as any).branch || '未設定';
      const matchSearch = `${s.name} ${s.kyu} ${belt}`.toLowerCase().includes(searchQuery.toLowerCase())
      
      // 支部フィルターが「すべて」なら全表示、そうでなければ完全一致
      const matchBranch = branchFilter === 'すべて' || studentBranch === branchFilter
      
      return matchSearch && matchBranch
    })
  }, [students, searchQuery, branchFilter])

  // 3. 現在登録されている支部リストを動的に生成（重複削除）
  const dynamicBranches = useMemo(() => {
    const branches = students.map(s => (s as any).branch).filter(Boolean);
    return ['すべて', ...Array.from(new Set(branches))];
  }, [students])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      
      {/* 左側：検索パネル */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl z-10">
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-5">
            <div className="flex flex-col">
              <h1 className="text-[10px] font-black tracking-[0.3em] text-orange-400 leading-none mb-1 text-left">SEIKUKAI</h1>
              <span className="text-lg font-black italic tracking-tighter">ADMIN</span>
            </div>
            <label className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl cursor-pointer font-black border border-white/10 transition-all">
              CSV読込 <input type="file" className="hidden" onChange={handleCsvUpload} />
            </label>
          </div>

          {/* 名前・級検索 */}
          <div className="space-y-3">
            <div>
              <p className="text-[8px] font-black uppercase opacity-40 mb-1 ml-1 tracking-widest">Search Name / Kyu</p>
              <input 
                type="text" placeholder="例: 田中 または 10級..." 
                className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs outline-none focus:bg-white focus:text-[#001f3f] transition-all"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* 支部フィルター */}
            <div>
              <p className="text-[8px] font-black uppercase opacity-40 mb-1 ml-1 tracking-widest">Branch Filter</p>
              <select 
                className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-black outline-none focus:bg-white focus:text-[#001f3f] transition-all"
                value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
              >
                {dynamicBranches.map(b => (
                  <option key={b} value={b} className="text-black">{b === 'すべて' ? 'すべての支部' : `${b}支部`}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 生徒一覧 */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 no-scrollbar bg-white">
          {filteredStudents.length > 0 ? (
            filteredStudents.map(s => (
              <button key={s.id} onClick={() => setSelectedStudent(s)}
                className={`w-full p-5 text-left transition-all border-l-4 ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500' : 'border-transparent hover:bg-gray-50'}`}>
                <p className="font-black text-sm">{s.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{(s as any).branch}</span>
                  <span className="text-[9px] font-bold text-orange-500 uppercase tracking-tighter">{s.kyu}</span>
                </div>
              </button>
            ))
          ) : (
            <p className="p-10 text-center text-[10px] font-bold text-gray-300">該当する生徒はいません</p>
          )}
        </div>
      </div>

      {/* 右側：評価・操作エリア */}
      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-6 md:p-10">
        {selectedStudent ? (
          <EvaluationPanel 
            key={selectedStudent.id}
            student={selectedStudent} 
            isMaster={isMaster} 
            onRefresh={loadStudents}
            onKyuUpdate={(newKyu) => setSelectedStudent({...selectedStudent, kyu: newKyu})}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-200">
            <div className="text-9xl mb-4 opacity-5 italic font-black">🥋</div>
            <p className="font-black text-[10px] uppercase tracking-[0.6em]">Please Select a Student</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* 評価パネルとヘルパー関数は前回同様（そのまま使用可能） */
// ... (EvaluationPanel, getTargetBelt, getSelectableKyu をここに配置)
