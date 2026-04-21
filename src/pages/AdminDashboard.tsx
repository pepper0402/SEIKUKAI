import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile, resolveRole, canCertifyDan, canCertifyKyu, canScore, KYU_OPTIONS, KYU_GRADES, GAKUINEN_OPTIONS, normalizeKyu } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

// --- ユーティリティ ---
const allKyuList = KYU_OPTIONS.filter(k => k !== '')

const BELT_GRADE_MAP: Record<string, string[]> = {
  '白帯':      ['無級'],
  '黄帯':      ['準10級', '10級', '準9級', '9級'],
  '青帯':      ['準8級', '8級', '準7級', '7級'],
  '橙帯/紫帯': ['準6級', '6級', '準5級', '5級'],
  '緑帯':      ['準4級', '4級', '準3級', '3級'],
  '茶帯':      ['準2級', '2級', '準1級', '1級'],
  '黒帯':      ['初段', '弍段', '参段', '四段', '五段'],
}

const BELT_COLORS: Record<string, { bg: string; text: string; light: string }> = {
  '白帯':      { bg: '#e8e8e8', text: '#1a1a1a', light: '#f5f5f5' },
  '黄帯':      { bg: '#d4a800', text: '#1a1a1a', light: '#fef3c7' },
  '青帯':      { bg: '#1a4fa0', text: '#ffffff', light: '#dbeafe' },
  '橙帯/紫帯': { bg: '#c04a00', text: '#ffffff', light: '#ffedd5' },
  '緑帯':      { bg: '#186a18', text: '#ffffff', light: '#dcfce7' },
  '茶帯':      { bg: '#5c2a0a', text: '#ffffff', light: '#fef3e2' },
  '黒帯':      { bg: '#0d0d0d', text: '#ffffff', light: '#e5e5e5' },
}

const getBeltForGrade = (kyu: string): string =>
  Object.entries(BELT_GRADE_MAP).find(([, grades]) => grades.includes(kyu))?.[0] ?? '白帯'



export default function AdminDashboard({ profile: adminProfile, onReload }: { profile: Profile; onReload?: () => void }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [criteriaVersion, setCriteriaVersion] = useState(0)

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
          // CSV形式: name, kyu, branch, birthday, login_email
          let ok = 0, skipped = 0;
          for (const row of rows) {
            const [name, kyu, branch, birthday, login_email] = row.split(',').map((s: string) => s?.trim() || '');
            if (!name || !login_email) { skipped++; continue; }
            const { error } = await supabase.from('profiles').upsert({
              name,
              kyu: kyu || null,
              branch: branch || null,
              birthday: birthday || null,
              login_email,
              is_admin: false,
            }, { onConflict: 'login_email' });
            if (error) skipped++; else ok++;
          }
          alert(`インポート完了: ${ok}件更新/追加 / スキップ${skipped}件`);
          loadStudents();
        } else {
          // Drill_Master.csv: drill_no, belt_ja, grade_ja, category, item_ja, item_en, is_required, video_url, notes
          const batch: any[] = [];
          for (const row of rows) {
            const cols = row.split(',');
            if (cols.length < 5) continue;
            const gradeRaw = cols[2]?.trim() || '';
            const dan = gradeRaw.startsWith('正') ? gradeRaw.slice(1) : gradeRaw;
            const examination_type = cols[3]?.trim() || '';
            const examination_content = cols[4]?.trim() || '';
            const is_required = cols[6]?.trim()?.toUpperCase() === 'TRUE';
            const video_url = cols[7]?.trim() || null;
            if (!dan || !examination_content) continue;
            batch.push({ dan, examination_type, examination_content, is_required, video_url });
          }
          if (batch.length === 0) {
            alert('有効なデータが見つかりません。\nCSVの形式・文字コードを確認してください。');
            return;
          }
          const { error } = await supabase.from('criteria').upsert(batch, { onConflict: 'dan,examination_content' });
          if (error) {
            alert('インポートエラー:\n' + error.message);
            return;
          }
          setCriteriaVersion((v: number) => v + 1);
          alert(`審査基準 ${batch.length}件 インポート/更新完了`);
          loadStudents();
        }
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
    return result.sort((a, b) => sortBy === 'kyu' ? allKyuList.indexOf(normalizeKyu(b.kyu)) - allKyuList.indexOf(normalizeKyu(a.kyu)) : (a.name || '').localeCompare(b.name || '', 'ja'));
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
                  <p className="text-[9px] font-bold text-orange-500 uppercase">{normalizeKyu(s.kyu)}</p>
                </div>
                <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold">{s.branch}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={loadStudents} allBranchList={allBranchList} adminProfile={adminProfile} criteriaRefreshKey={criteriaVersion} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
             <h2 className="font-black text-4xl italic tracking-tighter uppercase">SEIKUKAI</h2>
          </div>
        )}
      </div>
    </div>
  )
}

// ISO日時文字列を YYYY-MM-DD に整形（HTML date input 用）
const toDateInput = (v: string | null | undefined): string => {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

// --- 編集パネル ---
function EditPanel({ student, adminProfile, onClose, onSave }: { student: any; adminProfile: Profile; onClose: () => void; onSave: (updated: any) => void }) {
  const adminRole = resolveRole(adminProfile);
  const [form, setForm] = useState({
    name: student.name || '',
    kyu: normalizeKyu(student.kyu),
    branch: student.branch || '',
    birthday: toDateInput(student.birthday),
    joined_at: toDateInput(student.joined_at),
    gakuinen: (student.gakuinen || '').trim(),
  });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handlePasswordReset = async () => {
    if (!student.login_email) {
      alert('この会員にはログイン用メールアドレスが登録されていません。');
      return;
    }
    if (!confirm(`${student.login_email} にパスワードリセット用のメールを送信します。よろしいですか？`)) return;
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(student.login_email, {
      redirectTo: `${window.location.origin}/`,
    });
    setResetting(false);
    if (error) alert('送信に失敗しました: ' + error.message);
    else alert('パスワードリセット用メールを送信しました。');
  };

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

        </div>

        {/* パスワードリセット（管理者操作） */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">アカウント操作</label>
          <button
            onClick={handlePasswordReset}
            disabled={resetting || !student.login_email}
            className="w-full py-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-2xl text-xs font-black hover:bg-orange-100 disabled:opacity-50"
          >
            {resetting ? '送信中...' : 'パスワードリセットメールを送信'}
          </button>
          {student.login_email && (
            <p className="text-[10px] text-gray-400 mt-2 font-bold">送信先: {student.login_email}</p>
          )}
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
function EvaluationPanel({ student: initialStudent, onRefresh, allBranchList, adminProfile, criteriaRefreshKey }: {
  student: any;
  onRefresh: () => void;
  allBranchList: string[];
  adminProfile: Profile;
  criteriaRefreshKey: number;
}) {
  const adminRole = resolveRole(adminProfile);
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([])
  const [currentGradeEvals, setCurrentGradeEvals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(initialStudent);

  const currentKyu = normalizeKyu(student.kyu);
  const currentBelt = getBeltForGrade(currentKyu);
  const currentBeltColor = BELT_COLORS[currentBelt];

  const [viewBelt, setViewBelt] = useState(currentBelt);
  const [viewGrade, setViewGrade] = useState(currentKyu);

  // 昇級後に帯・グレードタブを同期
  useEffect(() => {
    const belt = getBeltForGrade(currentKyu);
    setViewBelt(belt);
    setViewGrade(currentKyu);
  }, [currentKyu]);

  const handleBeltChange = (belt: string) => {
    setViewBelt(belt);
    const grades = BELT_GRADE_MAP[belt];
    setViewGrade(grades.includes(currentKyu) ? currentKyu : grades[0]);
  };

  // 閲覧中グレードの基準・評価を取得（表示・採点用）
  useEffect(() => {
    async function fetchEvals() {
      setLoading(true);
      const { data: crit } = await supabase.from('criteria').select('*').order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      const filtered = (crit || []).filter((c: any) => normalizeKyu(c.dan) === viewGrade);
      console.log('[AdminDashboard/view] viewGrade=', viewGrade, 'total=', crit?.length, 'matched=', filtered.length);
      setCriteria(filtered.map((c: any) => ({ ...c, grade: evals?.find((e: any) => e.criterion_id === c.id)?.grade || 'D' })));
      setLoading(false);
    }
    fetchEvals()
  }, [student.id, viewGrade, criteriaRefreshKey])

  // 現在の級スコア（昇級判定専用）― viewGradeに関わらず常にcurrentKyuで計算
  useEffect(() => {
    async function fetchCurrentGrade() {
      const { data: crit } = await supabase.from('criteria').select('*').order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      const filtered = (crit || []).filter((c: any) => normalizeKyu(c.dan) === currentKyu);
      setCurrentGradeEvals(filtered.map((c: any) => ({ ...c, grade: evals?.find((e: any) => e.criterion_id === c.id)?.grade || 'D' })));
    }
    fetchCurrentGrade()
  }, [student.id, currentKyu, criteriaRefreshKey])

  const rawCurrentScore = useMemo(() =>
    currentGradeEvals.reduce((acc: number, c: any) => acc + (c.grade === 'A' ? 10 : c.grade === 'B' ? 6 : c.grade === 'C' ? 3 : 0), 0),
    [currentGradeEvals]
  );
  const rawCurrentMax = currentGradeEvals.length * 10;
  const currentGradeScore = rawCurrentMax > 0 ? Math.round((rawCurrentScore / rawCurrentMax) * 100) : 0;
  const currentGradeMax = currentGradeEvals.length > 0 ? 100 : 0;
  const isEligible = currentGradeEvals.length > 0 && currentGradeScore >= 80;

  const groupedCriteria: [string, any[]][] = useMemo(() => {
    const groups: Record<string, any[]> = {};
    criteria.forEach((c: any) => {
      const key = c.examination_type || 'その他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups);
  }, [criteria]);

  const handlePromote = async (step: number = 1) => {
    if (!isEligible) {
      alert(`合格点（80点）に達していません。\n現在の点数：${currentGradeScore}点 / ${currentGradeMax}点`);
      return;
    }
    const currentIdx = allKyuList.indexOf(currentKyu);
    const nextIdx = currentIdx + step;
    const nextKyu = allKyuList[nextIdx];
    if (!nextKyu || !window.confirm(`${nextKyu}へ昇級を確定しますか？`)) return;

    const { error: profileErr } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id);
    if (profileErr) {
      alert('昇級処理に失敗しました: ' + profileErr.message);
      return;
    }

    // 昇級履歴を記録
    const { data: adminSelf } = await supabase.from('profiles').select('id').eq('login_email', adminProfile.login_email).maybeSingle();
    await supabase.from('promotion_history').insert({
      student_id: student.id,
      from_kyu: currentKyu,
      to_kyu: nextKyu,
      promoted_by: adminSelf?.id ?? null,
      score: currentGradeScore,
    });

    // 通知キューに追加（メール送信は Edge Function が処理）
    if (student.login_email) {
      await supabase.from('notifications').insert({
        recipient_email: student.login_email,
        subject: `【誠空会】昇級おめでとうございます - ${nextKyu}`,
        body: `${student.name} 様\n\nこのたび${currentKyu}から${nextKyu}への昇級が確定いたしました。\n日頃の稽古の成果です。今後のさらなる精進をお祈りいたします。\n\n誠空会`,
        type: 'promotion',
      });
    }

    setStudent({ ...student, kyu: nextKyu });
    onRefresh();
    alert(`${nextKyu}への昇級を確定しました。`);
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

  const currentKyuIdx = allKyuList.indexOf(currentKyu);
  const isGradeAccessible = (grade: string) => allKyuList.indexOf(grade) <= currentKyuIdx;
  const isBeltAccessible = (belt: string) => BELT_GRADE_MAP[belt].some(g => isGradeAccessible(g));
  const vbc = BELT_COLORS[viewBelt];
  const progressPct = currentGradeMax > 0 ? Math.min((currentGradeScore / currentGradeMax) * 100, 100) : 0;

  return (
    <div className="max-w-2xl mx-auto pb-20">

      {/* ===== ヘッダーカード ===== */}
      <div className="rounded-[28px] p-6 mb-4 shadow-xl relative overflow-hidden"
        style={{ backgroundColor: currentBeltColor.bg, color: currentBeltColor.text }}>
        <div className="absolute right-0 top-0 text-[8rem] font-black italic opacity-[0.06] -mr-2 -mt-2 pointer-events-none select-none leading-none">
          {currentBelt.slice(0, 1)}
        </div>
        <div className="relative z-10">
          {/* 名前行 */}
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.25em] opacity-40 mb-0.5">Student</p>
              <h2 className="text-2xl font-black tracking-tight">{student.name}</h2>
            </div>
            <button onClick={() => setShowPreview(true)}
              className="text-[9px] font-black border rounded-full px-3 py-1.5 uppercase opacity-50"
              style={{ borderColor: 'rgba(0,0,0,0.2)', color: currentBeltColor.text }}>
              Preview
            </button>
          </div>

          {/* スコア + バッジ */}
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="flex gap-2 mb-2">
                <span className="text-[9px] font-black px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>{currentBelt}</span>
                <span className="text-[9px] font-black px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>{currentKyu}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-black leading-none" style={{ color: isEligible ? '#4ade80' : currentBeltColor.text }}>{currentGradeScore}</span>
                <span className="text-sm font-black opacity-25">/ {currentGradeMax || '—'}</span>
              </div>
            </div>
            {isEligible ? (
              <div className="px-3 py-2 rounded-2xl" style={{ backgroundColor: 'rgba(74,222,128,0.18)', border: '1.5px solid rgba(74,222,128,0.4)' }}>
                <p className="text-[9px] font-black text-green-400 uppercase tracking-wide leading-none">合格圏内</p>
              </div>
            ) : (
              <div className="text-right opacity-40">
                <p className="text-[7px] font-black uppercase tracking-widest">あと</p>
                <p className="text-xl font-black leading-none">{Math.max(0, 80 - currentGradeScore)}<span className="text-[9px] ml-0.5">点</span></p>
              </div>
            )}
          </div>

          {/* プログレスバー */}
          <div className="mb-4">
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%`, backgroundColor: isEligible ? '#4ade80' : 'rgba(255,255,255,0.55)' }} />
              {currentGradeMax > 0 && (
                <div className="absolute top-0 h-full w-px" style={{ left: `${Math.min((80 / currentGradeMax) * 100, 100)}%`, backgroundColor: currentBeltColor.text, opacity: 0.5 }} />
              )}
            </div>
            <div className="flex justify-between text-[7px] font-black mt-1 opacity-35">
              <span>0</span><span>合格 80点</span><span>{currentGradeMax > 0 ? `満点 ${currentGradeMax}` : ''}</span>
            </div>
          </div>

          {/* アクションボタン */}
          {(showAnyPromotion || canEdit) && (
            <div className={`grid gap-2 ${showAnyPromotion && canEdit ? 'grid-cols-3' : showAnyPromotion ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {showPromoteKyu && (
                <button onClick={() => handlePromote(1)}
                  className="py-3 rounded-2xl font-black text-[11px] text-white"
                  style={{ backgroundColor: isEligible ? '#f97316' : 'rgba(249,115,22,0.3)' }}>昇級確定</button>
              )}
              {showPromoteKyu && (
                <button onClick={() => handlePromote(2)}
                  className="py-3 rounded-2xl font-black text-[11px] text-white"
                  style={{ backgroundColor: isEligible ? '#ea580c' : 'rgba(234,88,12,0.3)' }}>1級飛び級</button>
              )}
              {showPromoteDan && !showPromoteKyu && (
                <button onClick={() => handlePromote(1)}
                  className="py-3 rounded-2xl font-black text-[11px] text-white col-span-2"
                  style={{ backgroundColor: isEligible ? '#7c3aed' : 'rgba(124,58,237,0.3)' }}>昇段確定</button>
              )}
              {canEdit && (
                <button onClick={() => setShowEdit(true)}
                  className="py-3 rounded-2xl font-black text-[11px]"
                  style={{ backgroundColor: 'rgba(0,0,0,0.18)', color: currentBeltColor.text }}>データ修正</button>
              )}
            </div>
          )}
          {!showAnyPromotion && !canEdit && (
            <p className="text-center text-[9px] font-black uppercase tracking-widest opacity-25">採点モード</p>
          )}
        </div>
      </div>

      {/* ===== ナビゲーション（帯 + 級） ===== */}
      <div className="bg-white rounded-[22px] p-4 shadow-sm border border-gray-100 mb-4">
        {/* 帯タブ */}
        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-2">Belt</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3">
          {Object.keys(BELT_GRADE_MAP).map(belt => {
            const bc = BELT_COLORS[belt];
            const isSelected = belt === viewBelt;
            const isCurrent = belt === currentBelt;
            const isLocked = !isBeltAccessible(belt);
            return (
              <button key={belt}
                onClick={() => !isLocked && handleBeltChange(belt)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[10px] font-black whitespace-nowrap border-2 transition-all ${isLocked ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'}`}
                style={isSelected && !isLocked
                  ? { backgroundColor: bc.bg, color: bc.text, borderColor: 'transparent' }
                  : { backgroundColor: '#fafafa', color: '#a0aec0', borderColor: '#f0f0f0' }}
              >
                {isLocked
                  ? <span className="text-[9px]">🔒</span>
                  : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isSelected ? bc.text : bc.bg, opacity: isSelected ? 0.5 : 1 }} />
                }
                {isCurrent && !isLocked ? `▶ ${belt}` : belt}
              </button>
            );
          })}
        </div>

        {/* 級サブタブ */}
        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-2">Grade</p>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {(BELT_GRADE_MAP[viewBelt] || []).map(grade => {
            const isSelected = grade === viewGrade;
            const isCurrent = grade === currentKyu;
            const isLocked = !isGradeAccessible(grade);
            return (
              <button key={grade}
                onClick={() => !isLocked && setViewGrade(grade)}
                className={`px-3.5 py-2.5 rounded-xl text-[10px] font-black whitespace-nowrap border transition-all ${isLocked ? 'opacity-20 cursor-not-allowed' : ''}`}
                style={isSelected && !isLocked
                  ? { backgroundColor: vbc.bg, color: vbc.text, borderColor: 'transparent' }
                  : { backgroundColor: isCurrent ? vbc.light : '#fafafa', color: isCurrent && !isSelected ? vbc.bg : '#a0aec0', borderColor: isCurrent && !isSelected ? vbc.bg + '60' : '#f0f0f0' }}
              >
                {isLocked ? '🔒' : isCurrent ? `▶ ${grade}` : grade}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== 審査基準リスト ===== */}
      {loading ? (
        <div className="text-center py-16 text-gray-200 font-black italic animate-pulse">LOADING...</div>
      ) : criteria.length === 0 ? (
        <div className="bg-white rounded-[22px] p-10 text-center border-2 border-dashed border-gray-100">
          <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest">審査基準データなし</p>
          <p className="text-[10px] text-gray-200 mt-1">CSVをインポートしてください</p>
        </div>
      ) : (
        <div>
          {groupedCriteria.map(([type, items]) => (
            <div key={type} className="mb-5">
              {/* カテゴリヘッダー */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[9px] font-black text-white px-3 py-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: vbc.bg }}>{type}</span>
                <div className="flex-1 h-px" style={{ backgroundColor: vbc.bg, opacity: 0.12 }} />
                <span className="text-[8px] font-black text-gray-300 flex-shrink-0">{items.length}項目</span>
              </div>
              {/* カード群 */}
              <div className="space-y-2">
                {items.map((c: any) => (
                  <div key={c.id} className="bg-white rounded-[18px] p-4 shadow-sm border border-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 pr-2">
                        <p className="text-[13px] font-bold text-gray-800 leading-snug">{c.examination_content}</p>
                        {c.is_required && (
                          <span className="inline-block mt-1.5 text-[8px] font-black text-white px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: vbc.bg }}>★ 必須</span>
                        )}
                      </div>
                      {c.video_url && (
                        <a href={c.video_url} target="_blank" rel="noreferrer"
                          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black border ml-2"
                          style={{ backgroundColor: vbc.light, color: vbc.bg, borderColor: vbc.bg + '20' }}>▶</a>
                      )}
                    </div>
                    {canScore(adminRole) ? (
                      <div className="grid grid-cols-4 gap-1.5">
                        {[{ g: 'A', pt: '10' }, { g: 'B', pt: '6' }, { g: 'C', pt: '3' }, { g: 'D', pt: '0' }].map(({ g, pt }) => (
                          <button key={g} onClick={() => {
                            setCriteria((prev: any[]) => prev.map((item: any) => item.id === c.id ? { ...item, grade: g } : item));
                            if (viewGrade === currentKyu) {
                              setCurrentGradeEvals((prev: any[]) => prev.map((item: any) => item.id === c.id ? { ...item, grade: g } : item));
                            }
                            supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: c.id, grade: g }, { onConflict: 'student_id,criterion_id' }).then();
                          }}
                          className="py-2.5 rounded-xl flex flex-col items-center justify-center transition-all"
                          style={c.grade === g
                            ? { backgroundColor: vbc.bg, color: vbc.text }
                            : { backgroundColor: '#f5f5f5', color: '#c0c0c0' }}>
                            <span className="text-[15px] font-black leading-none">{g}</span>
                            <span className="text-[7px] font-bold mt-0.5 opacity-60">{pt}pt</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="py-3 rounded-xl font-black text-center text-xl"
                        style={{ backgroundColor: vbc.light, color: vbc.bg }}>{c.grade}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
