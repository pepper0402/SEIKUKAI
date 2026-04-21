import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile, resolveRole, canCertifyDan, canCertifyKyu, canScore, KYU_OPTIONS, KYU_GRADES, GAKUINEN_OPTIONS } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

// --- ユーティリティ ---
const allKyuList = KYU_OPTIONS.filter(k => k !== '')



export default function AdminDashboard({ profile: adminProfile, onReload }: { profile: Profile; onReload?: () => void }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    if (data) setStudents(data);
  }, [])

  useEffect(() => {
    loadStudents()
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }, [loadStudents])

  const handleCsvImport = async (type: 'students' | 'criteria') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event: any) => {
        const text = event.target.result;
        const rows = text.split('\n').slice(1).filter((r: string) => r.trim());
        if (type === 'students') {
          for (const row of rows) {
            const [name, kyu, branch, birthday] = row.split(',');
            await supabase.from('profiles').insert({ name: name?.trim(), kyu: kyu?.trim(), branch: branch?.trim(), birthday: birthday?.trim() || null, is_admin: false });
          }
        } else {
          // Drill_Master.csv format: drill_no, belt_ja, grade_ja, category, item_ja, item_en, is_required, video_url, notes
          for (const row of rows) {
            const cols = row.split(',');
            if (cols.length < 5) continue;
            const gradeRaw = cols[2]?.trim() || '';
            const dan = gradeRaw.startsWith('正') ? gradeRaw.slice(1) : gradeRaw; // 正10級 → 10級
            const examination_type = cols[3]?.trim() || '';
            const examination_content = cols[4]?.trim() || '';
            const is_required = cols[6]?.trim()?.toUpperCase() === 'TRUE';
            const video_url = cols[7]?.trim() || null;
            if (!dan || !examination_content) continue;
            await supabase.from('criteria').insert({ dan, examination_type, examination_content, is_required, video_url });
          }
        }
        alert('インポート完了');
        loadStudents();
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const selectedStudent = useMemo(() => students.find(s => s.id === selectedStudentId) || null, [students, selectedStudentId]);

  const allBranchList = useMemo(() => {
    const branches = students.map(s => s.branch).filter(Boolean)
    return Array.from(new Set(['池田', '川西', '宝塚', ...branches])).sort()
  }, [students])

  const filteredStudents = useMemo(() => {
    let result = students.filter(s => {
      const k = (s.name || '') + (s.kyu || '') + (s.branch || '')
      return k.toLowerCase().includes(searchQuery.toLowerCase()) && (branchFilter === 'すべて' || s.branch === branchFilter)
    });
    return result.sort((a, b) => sortBy === 'kyu' ? allKyuList.indexOf(b.kyu || '無級') - allKyuList.indexOf(a.kyu || '無級') : (a.name || '').localeCompare(b.name || '', 'ja'));
  }, [students, searchQuery, branchFilter, sortBy])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 bg-[#001f3f] text-white p-3 rounded-full shadow-2xl md:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}

      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic uppercase leading-none">誠空会 管理パネル</h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase">Logout</button>
          </div>

          <div className="flex gap-2 mb-2">
            <button onClick={() => handleCsvImport('students')} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black border border-white/10">生徒CSV読込</button>
            <button onClick={() => handleCsvImport('criteria')} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black border border-white/10">審査CSV読込</button>
          </div>
          <button onClick={async () => {
            if (!window.confirm('審査基準データを全削除してよろしいですか？\n（再インポート前にご利用ください）')) return;
            await supabase.from('criteria').delete().neq('id', 0);
            alert('削除完了。CSVを再インポートしてください。');
          }} className="w-full py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-[9px] font-black text-red-300 border border-red-500/20 mb-4">
            審査基準 全削除（再インポート用）
          </button>

          <div className="space-y-2">
            <input type="text" placeholder="名前・級で検索..." className="w-full bg-white/10 border-none rounded-xl px-4 py-2 text-xs text-white outline-none focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="flex gap-1">
              <select className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[9px] font-black outline-none" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="すべて" className="text-black">全支部</option>
                {allBranchList.map(b => <option key={b} value={b} className="text-black">{b}</option>)}
              </select>
              <select className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[9px] font-black outline-none" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="name" className="text-black">名前順</option>
                <option value="kyu" className="text-black">級順</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div key={s.id} onClick={() => {setSelectedStudentId(s.id); if(window.innerWidth<768)setIsSidebarOpen(false);}} className={`p-5 border-l-4 cursor-pointer transition-all ${selectedStudentId === s.id ? 'bg-orange-50 border-orange-500 shadow-inner' : 'border-transparent hover:bg-gray-50'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-black text-sm">{s.name}</p>
                  <p className="text-[9px] font-bold text-orange-500 uppercase">{s.kyu}</p>
                </div>
                <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold">{s.branch}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={loadStudents} allBranchList={allBranchList} adminProfile={adminProfile} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
             <h2 className="font-black text-4xl italic tracking-tighter uppercase">SEIKUKAI</h2>
          </div>
        )}
      </div>
    </div>
  )
}

// --- 編集パネル ---
function EditPanel({ student, adminProfile, onClose, onSave }: { student: any; adminProfile: Profile; onClose: () => void; onSave: (updated: any) => void }) {
  const adminRole = resolveRole(adminProfile);
  const [form, setForm] = useState({
    name: student.name || '',
    kyu: student.kyu || '無級',
    branch: student.branch || '',
    birthday: student.birthday || '',
    joined_at: student.joined_at || '',
    gakuinen: student.gakuinen || '',
    gohi: student.gohi || '',
  });
  const [saving, setSaving] = useState(false);

  const gradeOptions = adminRole === 'master'
    ? KYU_OPTIONS.filter(k => k !== '')
    : KYU_GRADES;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      name: form.name,
      kyu: form.kyu,
      branch: form.branch,
      birthday: form.birthday || null,
      joined_at: form.joined_at || null,
      gakuinen: form.gakuinen,
      gohi: form.gohi,
    }).eq('id', student.id);
    setSaving(false);
    if (!error) onSave({ ...student, ...form });
    else alert('保存に失敗しました: ' + error.message);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-[40px] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-[#001f3f]">データ修正</h3>
          <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black hover:bg-gray-200">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">名前</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
              現在の級{adminRole === 'instructor' ? '（閲覧のみ）' : ''}
            </label>
            <select
              value={form.kyu}
              onChange={e => setForm({ ...form, kyu: e.target.value })}
              disabled={adminRole === 'instructor'}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f] disabled:bg-gray-50 disabled:text-gray-400"
            >
              {gradeOptions.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">支部</label>
            <input
              type="text"
              value={form.branch}
              onChange={e => setForm({ ...form, branch: e.target.value })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">生年月日</label>
              <input
                type="date"
                value={form.birthday}
                onChange={e => setForm({ ...form, birthday: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">入会日</label>
              <input
                type="date"
                value={form.joined_at}
                onChange={e => setForm({ ...form, joined_at: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">学年</label>
            <select
              value={form.gakuinen}
              onChange={e => setForm({ ...form, gakuinen: e.target.value })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
            >
              {GAKUINEN_OPTIONS.map(g => <option key={g} value={g}>{g || '未設定'}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">護費</label>
            <input
              type="text"
              value={form.gohi}
              onChange={e => setForm({ ...form, gohi: e.target.value })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-2xl text-sm font-black text-gray-500 hover:bg-gray-200">キャンセル</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-[#001f3f] text-white rounded-2xl text-sm font-black disabled:opacity-50">
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 評価パネル ---
function EvaluationPanel({ student: initialStudent, onRefresh, allBranchList, adminProfile }: {
  student: any;
  onRefresh: () => void;
  allBranchList: string[];
  adminProfile: Profile;
}) {
  const adminRole = resolveRole(adminProfile);
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(initialStudent);

  const currentKyu = student.kyu || '無級';

  const [viewGrade, setViewGrade] = useState(currentKyu);

  useEffect(() => {
    async function fetchEvals() {
      setLoading(true);
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', viewGrade).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => ({ ...c, grade: evals?.find(e => e.criterion_id === c.id)?.grade || 'D' })));
      setLoading(false);
    }
    fetchEvals()
  }, [student.id, viewGrade])

  // A=10, B=6, C=3, D=0
  const totalScore = useMemo(() =>
    criteria.reduce((acc, c) => acc + (c.grade === 'A' ? 10 : c.grade === 'B' ? 6 : c.grade === 'C' ? 3 : 0), 0),
    [criteria]
  );
  const maxScore = criteria.length * 10;
  const isScoreReady = criteria.length > 0 && totalScore >= 80;

  const handlePromote = async (step: number = 1) => {
    const currentIdx = allKyuList.indexOf(currentKyu);
    const nextIdx = currentIdx + step;
    const nextKyu = allKyuList[nextIdx];
    if (!nextKyu || !window.confirm(`${nextKyu}へ昇級を確定しますか？`)) return;
    const { error } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id);
    if (!error) { setStudent({ ...student, kyu: nextKyu }); onRefresh(); }
  };

  const handleEditSave = (updated: any) => {
    setStudent(updated);
    onRefresh();
    setShowEdit(false);
  };


  const isDanGrade = currentKyu.includes('段');
  const showPromoteKyu = canCertifyKyu(adminRole) && !isDanGrade;
  const showPromoteDan = canCertifyDan(adminRole) && (currentKyu === '1級' || isDanGrade);
  const showAnyPromotion = showPromoteKyu || showPromoteDan;
  const canEdit = adminRole === 'master' || adminRole === 'branch';

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-[#001f3f] rounded-[40px] p-6 md:p-8 text-white mb-8 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-wrap justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-3xl font-black tracking-tighter">{student.name}</h2>
              <button onClick={() => setShowPreview(true)} className="bg-white/10 hover:bg-white/20 text-white/60 px-3 py-1.5 rounded-full text-[9px] font-black border border-white/10 uppercase">Preview</button>
            </div>
            <div className="flex gap-4">
              <div><p className="text-[10px] opacity-40 uppercase">Grade</p><p className="text-xl font-black text-orange-400">{currentKyu}</p></div>
              <div><p className="text-[10px] opacity-40 uppercase">Pass</p><p className="text-xl font-black">80点以上</p></div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] opacity-40 tracking-widest uppercase">Score</p>
            <p className={`text-6xl md:text-7xl font-black ${isScoreReady ? 'text-green-400' : 'text-white'}`}>{totalScore}</p>
            <p className="text-[9px] opacity-30">/ {maxScore || 100}</p>
          </div>
        </div>

        <div className={`grid gap-3 mt-8 relative z-10 ${showAnyPromotion && canEdit ? 'grid-cols-3' : showAnyPromotion ? 'grid-cols-2' : canEdit ? 'grid-cols-1' : 'hidden'}`}>
          {showPromoteKyu && (
            <button
              onClick={() => handlePromote(1)}
              className={`py-4 rounded-2xl font-black uppercase text-[10px] ${isScoreReady ? 'bg-orange-500 text-white' : 'bg-orange-500/60 text-white/80'}`}
            >
              昇級確定
            </button>
          )}
          {showPromoteKyu && (
            <button
              onClick={() => handlePromote(2)}
              className={`py-4 rounded-2xl font-black uppercase text-[10px] ${isScoreReady ? 'bg-orange-600 text-white' : 'bg-orange-600/60 text-white/80'}`}
            >
              1級飛び級
            </button>
          )}
          {showPromoteDan && !showPromoteKyu && (
            <button
              onClick={() => handlePromote(1)}
              className={`py-4 rounded-2xl font-black uppercase text-[10px] col-span-2 ${isScoreReady ? 'bg-purple-700 text-white' : 'bg-purple-700/60 text-white/80'}`}
            >
              昇段確定
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowEdit(true)} className="py-4 bg-white/20 text-white rounded-2xl font-black uppercase text-[10px]">
              データ修正
            </button>
          )}
        </div>

        {/* 指導員向け：採点のみ可能の表示 */}
        {!showAnyPromotion && !canEdit && (
          <div className="mt-8 relative z-10">
            <p className="text-[9px] text-white/30 font-black uppercase tracking-widest text-center">採点モード（昇級・データ修正は管理者が行います）</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-1">
        {allKyuList.map(g => (
          <button
            key={g}
            onClick={() => setViewGrade(g)}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black whitespace-nowrap border transition-all ${
              viewGrade === g
                ? g === currentKyu
                  ? 'bg-[#001f3f] text-white shadow-lg border-transparent scale-105'
                  : 'bg-gray-700 text-white shadow border-transparent scale-105'
                : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'
            }`}
          >
            {g === currentKyu ? `▶ ${g}` : g}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-20 animate-pulse text-gray-300 font-black italic">LOADING...</div>
        ) : (
          criteria.map(c => (
            <div key={c.id} className="bg-white p-6 rounded-[35px] shadow-sm border border-gray-100">
              <div className="flex justify-between mb-4">
                <div className="flex-1">
                  <span className="text-[9px] font-black text-gray-300 uppercase block">{c.examination_type}</span>
                  <p className="text-sm font-bold text-[#001f3f] leading-snug">{c.examination_content}</p>
                  {c.is_required && <span className="text-[8px] font-black text-orange-500 uppercase mt-1 block">★ 必須項目</span>}
                </div>
                {c.video_url && <a href={c.video_url} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center bg-gray-50 text-orange-500 rounded-lg border border-gray-100 text-xs">▶️</a>}
              </div>
              {canScore(adminRole) ? (
                <div className="grid grid-cols-4 gap-2">
                  {['A', 'B', 'C', 'D'].map(g => (
                    <button key={g} onClick={() => {
                      setCriteria(prev => prev.map(item => item.id === c.id ? { ...item, grade: g } : item));
                      supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: c.id, grade: g }, { onConflict: 'student_id,criterion_id' }).then();
                    }} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}>{g}</button>
                  ))}
                </div>
              ) : (
                <div className={`py-3 rounded-xl font-black text-center text-lg ${c.grade === 'A' ? 'bg-orange-50 text-orange-600' : c.grade === 'B' ? 'bg-slate-50 text-slate-800' : c.grade === 'C' ? 'bg-gray-50 text-gray-600' : 'bg-gray-50 text-gray-300'}`}>
                  {c.grade}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showEdit && (
        <EditPanel
          student={student}
          adminProfile={adminProfile}
          onClose={() => setShowEdit(false)}
          onSave={handleEditSave}
        />
      )}

      {showPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#001f3f]/95 backdrop-blur-md">
          <div className="relative w-full max-w-md h-[90vh] overflow-hidden rounded-[50px] bg-white">
            <button onClick={() => setShowPreview(false)} className="absolute top-6 right-6 z-[120] w-10 h-10 bg-black text-white rounded-full font-black">✕</button>
            <div className="h-full overflow-y-auto"><StudentDashboard profile={student} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
