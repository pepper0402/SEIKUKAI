import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  supabase, Profile, Role, MemberStatus, MEMBER_STATUS_LABEL, APP_URL,
  resolveRole, canCertifyDan, canCertifyKyu, canScore, getRoleLabel,
  KYU_OPTIONS, KYU_GRADES, GAKUINEN_OPTIONS, normalizeKyu, isValidVideoUrl, logAudit,
  BELT_COLORS, BELT_GRADE_MAP, getBeltCategoryForGrade, getBeltForProfile, isIppan, needsIppanMigration,
} from '../lib/supabase'
import { useLang, LangToggle } from '../lib/i18n'
import StudentDashboard from './StudentDashboard'

// --- ユーティリティ ---
const allKyuList = KYU_OPTIONS.filter(k => k !== '')

// ナビのカテゴリ色は閲覧中の生徒の 少年/一般 区分に合わせて動的に決める。
// 少年部生徒を見ているときに紫帯（一般6/5級）色が出てしまう等の不整合を防ぐ。
const getNavBeltColor = (category: string, ippan: boolean): { bg: string; text: string; light: string } => {
  switch (category) {
    case '白帯':      return BELT_COLORS['白帯']
    case '黄帯':      return BELT_COLORS['黄帯']
    case '青帯':      return BELT_COLORS['青帯']
    case '橙帯/紫帯': return ippan ? BELT_COLORS['紫帯'] : BELT_COLORS['橙帯']
    case '緑帯':      return ippan ? BELT_COLORS['一般緑帯'] : BELT_COLORS['少年緑帯']
    case '茶帯':      return ippan ? BELT_COLORS['一般茶帯'] : BELT_COLORS['少年茶帯']
    case '黒帯':      return ippan ? BELT_COLORS['一般黒帯'] : BELT_COLORS['少年黒帯']
    default:          return BELT_COLORS['白帯']
  }
}



export default function AdminDashboard({ profile: adminProfile, onReload, onSwitchToStudent }: { profile: Profile; onReload?: () => void; onSwitchToStudent?: () => void }) {
  const { t } = useLang()
  const adminRole = resolveRole(adminProfile)
  const isMaster = adminRole === 'master'
  const isBranchChief = adminRole === 'branch'
  const isInstructor = adminRole === 'instructor'
  // 支部長・指導員は自支部スコープ
  const isBranchScoped = isBranchChief || isInstructor
  const adminBranch = adminProfile.branch || ''

  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  // 支部長・指導員は自分の支部に固定。マスターは「すべて」デフォルト
  const [branchFilter, setBranchFilter] = useState(isBranchScoped && adminBranch ? adminBranch : 'すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [criteriaVersion, setCriteriaVersion] = useState(0)
  const [showAddStudent, setShowAddStudent] = useState(false)
  // マスターのみ: スタッフ（管理者アカウント）を一覧に含めるトグル
  const [includeStaff, setIncludeStaff] = useState(false)
  // 退会・休会も一覧に含めるトグル
  const [includeInactive, setIncludeInactive] = useState(false)
  // 支部マスタ（branches テーブル）。生徒ゼロの支部もドロップダウンに出せるようにDBで管理。
  // { name, is_canonical } のペアで保持。is_canonical=TRUE は正式3支部（池田/川西/宝塚）で削除UI保護。
  const [branchMaster, setBranchMaster] = useState<{ name: string; is_canonical: boolean }[]>([])

  // ===== 出席モード（今日来てる子を選択して並列評価） =====
  // 日付キー（YYYY-MM-DD）ごとにlocalStorageへ保存。日付が変われば自動リセット。
  const attendanceKey = `seikukai:attendance:${new Date().toISOString().slice(0, 10)}`
  const [attendingIds, setAttendingIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(attendanceKey)
      return new Set<string>(raw ? JSON.parse(raw) : [])
    } catch { return new Set<string>() }
  })
  const persistAttending = useCallback((next: Set<string>) => {
    try { localStorage.setItem(attendanceKey, JSON.stringify([...next])) } catch {}
  }, [attendanceKey])
  const toggleAttending = useCallback((id: string) => {
    setAttendingIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      persistAttending(next)
      return next
    })
  }, [persistAttending])
  const clearAttending = useCallback(() => {
    const empty = new Set<string>()
    setAttendingIds(empty)
    persistAttending(empty)
  }, [persistAttending])

  const canDeleteAll = isMaster
  const canBulkImportStudents = isMaster
  // 生徒追加はマスター・支部長のみ（指導員は評価のみ）
  const canAddStudent = isMaster || isBranchChief

  const loadStudents = useCallback(async () => {
    let query = supabase.from('profiles').select('*')
    // マスターで「スタッフを表示」OFF、または支部長・指導員なら is_admin=false に限定
    if (!(isMaster && includeStaff)) {
      query = query.eq('is_admin', false)
    }
    // 支部長・指導員は自分の支部のメンバーのみ
    if (isBranchScoped && adminBranch) {
      query = query.eq('branch', adminBranch)
    }
    const { data } = await query
    if (data) {
      // status でのフィルタ（null は active 扱い）
      const filtered = includeInactive
        ? data
        : data.filter((p: any) => !p.status || p.status === 'active')
      setStudents(filtered);
    }
  }, [isMaster, isBranchScoped, adminBranch, includeStaff, includeInactive])

  const loadBranches = useCallback(async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('name, is_canonical')
      .order('is_canonical', { ascending: false })
      .order('name')
    if (error) {
      // テーブル未作成/権限エラー時はフォールバックで正式3支部だけ表示
      console.warn('[branches] load failed:', error.message)
      setBranchMaster([
        { name: '池田', is_canonical: true },
        { name: '川西', is_canonical: true },
        { name: '宝塚', is_canonical: true },
      ])
      return
    }
    setBranchMaster((data || []) as any)
  }, [])

  useEffect(() => {
    loadStudents()
    loadBranches()
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }, [loadStudents, loadBranches])

  // ダブルクォート囲みのフィールド（URL内カンマ等）に対応したCSV行パーサ
  const parseCsvRow = (row: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < row.length; i++) {
      const c = row[i]
      if (c === '"') {
        // ""（2連続）は1個のダブルクォートとして扱う
        if (inQuotes && row[i + 1] === '"') { cur += '"'; i++; continue }
        inQuotes = !inQuotes
      } else if (c === ',' && !inQuotes) {
        out.push(cur.trim())
        cur = ''
      } else {
        cur += c
      }
    }
    out.push(cur.trim())
    return out
  }

  const handleStudentsCsvImport = async () => {
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
        // CSV形式: 支部, 氏, 名, ヨミガナ, 性別, 入会日, 生年月日, 級/段, メールアドレス, パスワード
        const toISODate = (s: string): string | null => {
          if (!s) return null;
          const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
          if (!m) return null;
          const [, y, mo, d] = m;
          return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        };
        let ok = 0, skipped = 0, errors: string[] = [];
        for (const row of rows) {
          const cols = parseCsvRow(row);
          if (cols.length < 9) { skipped++; continue; }
          const [branch, sei, mei, , , joined_at_raw, birthday_raw, kyu, login_email] = cols;
          const name = `${sei} ${mei}`.trim();
          if (!name || !login_email) { skipped++; continue; }
          const { error } = await supabase.from('profiles').upsert({
            name,
            kyu: kyu || null,
            branch: branch || null,
            birthday: toISODate(birthday_raw),
            joined_at: toISODate(joined_at_raw),
            login_email: login_email.toLowerCase(),
            is_admin: false,
          }, { onConflict: 'login_email' });
          if (error) { skipped++; errors.push(`${name}: ${error.message}`); }
          else ok++;
        }
        const errMsg = errors.length > 0 ? `\n\n最初のエラー:\n${errors.slice(0, 3).join('\n')}` : '';
        alert(`インポート完了: ${ok}件更新/追加 / スキップ${skipped}件${errMsg}`);
        loadStudents();
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // 新フォーマット審査CSV: 帯, 級, 種類, 内容, 動画
  // ★プレフィックスは is_required=true のサイン（★形/★体力測定/★精神面）
  const handleCriteriaCsvImport = async (division: 'junior' | 'general') => {
    const divisionLabel = division === 'junior' ? '少年部' : '一般部';
    if (!window.confirm(
      `${divisionLabel}の審査基準を取込します。\n\n` +
      `現在の ${divisionLabel}（division='${division}'）のデータは全削除され、\n` +
      `CSV の内容で置き換わります。共通項目(division='both')と他方の区分は維持。\n\n続行しますか？`
    )) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event: any) => {
        const text = event.target.result;
        const lines = text.split('\n').filter((r: string) => r.trim());
        // 1行目はヘッダー: 帯, , 種類, 内容, 動画
        const rows = lines.slice(1);
        const batch: any[] = [];
        for (const row of rows) {
          const cols = parseCsvRow(row);
          if (cols.length < 4) continue;
          const [obi, kyuRaw, typeRaw, content, videoRaw] = cols;
          if (!obi) continue;

          // 級→dan（正プレフィックス除去。白帯で級空欄なら無級）
          let dan = (kyuRaw || '').trim();
          if (!dan) {
            if (obi.startsWith('白')) dan = '無級';
            else continue;
          }
          if (dan.startsWith('正')) dan = dan.slice(1);

          // 種類→examination_type（★は is_required フラグ）
          let examination_type = (typeRaw || '').trim();
          let is_required = false;
          if (examination_type.startsWith('★')) {
            is_required = true;
            examination_type = examination_type.slice(1).trim();
          }

          const examination_content = (content || '').trim();
          if (!examination_content) continue;

          const video_url = (videoRaw || '').trim() || null;

          batch.push({
            dan,
            examination_type,
            examination_content,
            is_required,
            video_url,
            division,
          });
        }

        if (batch.length === 0) {
          alert('有効なデータが見つかりません。\nCSVの書式・文字コードを確認してください。');
          return;
        }

        // 該当divisionを全削除 → バッチinsert（bothは温存）
        const { error: delErr } = await supabase
          .from('criteria')
          .delete()
          .eq('division', division);
        if (delErr) {
          alert(`既存データ削除失敗:\n${delErr.message}`);
          return;
        }
        const { error: insErr } = await supabase.from('criteria').insert(batch);
        if (insErr) {
          alert(`インポートエラー:\n${insErr.message}`);
          return;
        }
        setCriteriaVersion((v: number) => v + 1);
        alert(`${divisionLabel}審査基準 ${batch.length}件 取込完了`);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const selectedStudent = useMemo(() => students.find(s => s.id === selectedStudentId) || null, [students, selectedStudentId]);

  const allBranchList = useMemo(() => {
    // 支部長・指導員は自分の支部のみ。マスターは全支部（マスタテーブル＋実データをunion）
    // プリセット3支部は常に先頭・固定順（池田・川西・宝塚）、追加支部は後ろに50音順
    if (isBranchScoped && adminBranch) return [adminBranch]
    const CANONICAL = ['池田', '川西', '宝塚']
    const masterNames = branchMaster.map(b => b.name)
    const dataBranches = students.map(s => s.branch).filter(Boolean) as string[]
    const merged = [...masterNames, ...dataBranches]
    const extras = Array.from(new Set(merged.filter(b => !CANONICAL.includes(b))))
      .sort((a, b) => a.localeCompare(b, 'ja'))
    return [...CANONICAL, ...extras]
  }, [students, branchMaster, isBranchScoped, adminBranch])

  // 手動追加された（削除可能な）支部名の集合
  const removableBranches = useMemo(
    () => branchMaster.filter(b => !b.is_canonical).map(b => b.name),
    [branchMaster]
  )

  const handleAddBranch = async () => {
    const name = window.prompt('追加する支部名を入力してください')
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return
    if (allBranchList.includes(trimmed)) {
      alert(`支部「${trimmed}」は既に存在します。`)
      return
    }
    const { error } = await supabase
      .from('branches')
      .insert({ name: trimmed, is_canonical: false, created_by: adminProfile.id })
    if (error) {
      alert(`支部の追加に失敗しました: ${error.message}`)
      return
    }
    await loadBranches()
    alert(`支部「${trimmed}」を追加しました。生徒追加・編集のドロップダウンから選択できます。`)
  }

  const handleRemoveCustomBranch = async (name: string) => {
    // 現在その支部に所属する生徒が居る場合は削除不可
    const inUse = students.some(s => s.branch === name)
    if (inUse) {
      alert(`支部「${name}」には所属生徒が居るため、ドロップダウンから外せません。\n先に所属生徒の支部を変更してください。`)
      return
    }
    if (!confirm(`支部「${name}」を削除しますか？\nこの支部に生徒を追加しない限りリストに表示されなくなります。`)) return
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('name', name)
      .eq('is_canonical', false)
    if (error) {
      alert(`支部の削除に失敗しました: ${error.message}`)
      return
    }
    await loadBranches()
  }

  const filteredStudents = useMemo(() => {
    let result = students.filter(s => {
      const k = (s.name || '') + (s.kyu || '') + (s.branch || '')
      return k.toLowerCase().includes(searchQuery.toLowerCase()) && (branchFilter === 'すべて' || s.branch === branchFilter)
    });
    return result.sort((a, b) => sortBy === 'kyu' ? allKyuList.indexOf(normalizeKyu(b.kyu)) - allKyuList.indexOf(normalizeKyu(a.kyu)) : (a.name || '').localeCompare(b.name || '', 'ja'));
  }, [students, searchQuery, branchFilter, sortBy])

  // 出席中の生徒を並列表示の順序（ロード済みリスト順）で解決
  const attendingStudents = useMemo(
    () => students.filter(s => attendingIds.has(s.id)),
    [students, attendingIds]
  )

  // 並列モードで「今見てる1人」をタブで切替
  const [activeAttendingId, setActiveAttendingId] = useState<string | null>(null)
  useEffect(() => {
    if (attendingStudents.length === 0) {
      setActiveAttendingId(null)
      return
    }
    // 現在の active が出席リストから外れたら先頭に切替
    if (!activeAttendingId || !attendingStudents.some(s => s.id === activeAttendingId)) {
      setActiveAttendingId(attendingStudents[0].id)
    }
  }, [attendingStudents, activeAttendingId])
  const activeAttending = useMemo(
    () => attendingStudents.find(s => s.id === activeAttendingId) || attendingStudents[0] || null,
    [attendingStudents, activeAttendingId]
  )
  const goRelativeAttending = useCallback((delta: number) => {
    if (attendingStudents.length === 0) return
    const idx = Math.max(0, attendingStudents.findIndex(s => s.id === activeAttendingId))
    const nextIdx = (idx + delta + attendingStudents.length) % attendingStudents.length
    setActiveAttendingId(attendingStudents[nextIdx].id)
  }, [attendingStudents, activeAttendingId])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 bg-[#001f3f] text-white p-3 rounded-full shadow-2xl md:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}

      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-start mb-4 gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-black italic uppercase leading-none">
                {t('誠空会 管理パネル', 'SEIKUKAI Admin Panel')}
              </h1>
              <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mt-1">
                {getRoleLabel(adminRole)}
                {isBranchScoped && adminBranch
                  ? t(` / ${adminBranch}支部`, ` / ${adminBranch} branch`)
                  : ''}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <LangToggle className="text-[10px] bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg font-black" />
              {onSwitchToStudent && (
                <button onClick={onSwitchToStudent}
                  className="text-[10px] bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg font-black"
                  title={t('自分の生徒画面へ切替', 'Switch to student view')}>
                  {t('生徒画面', 'Student View')}
                </button>
              )}
              <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase">Logout</button>
            </div>
          </div>

          {canBulkImportStudents && (
            <div className="space-y-2 mb-2">
              <button onClick={handleStudentsCsvImport} className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black border border-white/10">{t('生徒CSV読込', 'Import Members CSV')}</button>
              <div className="flex gap-2">
                <button onClick={() => handleCriteriaCsvImport('junior')} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black border border-white/10">{t('少年部審査CSV', 'Junior Criteria CSV')}</button>
                <button onClick={() => handleCriteriaCsvImport('general')} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black border border-white/10">{t('一般部審査CSV', 'General Criteria CSV')}</button>
              </div>
            </div>
          )}
          {canAddStudent && (
            <button onClick={() => setShowAddStudent(true)}
              className="w-full py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-[10px] font-black border border-orange-400 mb-2">
              ＋ {isBranchChief && adminBranch
                   ? t(`${adminBranch}支部の生徒を追加`, `Add member to ${adminBranch} branch`)
                   : t('生徒を追加', 'Add Member')}
            </button>
          )}
          {isMaster && (
            <button onClick={handleAddBranch}
              className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-black border border-white/10 mb-2">
              ＋ 支部を追加
            </button>
          )}
          {isMaster && removableBranches.length > 0 && (
            <div className="mb-2 p-2 bg-white/5 rounded-lg border border-white/10">
              <p className="text-[8px] font-black uppercase opacity-60 mb-1">手動追加の支部</p>
              <div className="flex flex-wrap gap-1">
                {removableBranches.map(b => (
                  <button key={b} onClick={() => handleRemoveCustomBranch(b)}
                    title="クリックで削除（所属生徒がいると削除不可）"
                    className="text-[9px] bg-white/10 hover:bg-red-500/40 px-2 py-0.5 rounded font-black">
                    {b} ✕
                  </button>
                ))}
              </div>
            </div>
          )}
          {canDeleteAll && (
            <div className="flex gap-2 mb-4">
              <button onClick={async () => {
                const first = window.prompt('生徒データを全削除します。確認のため「削除」と入力してください。');
                if (first !== '削除') return;
                if (!window.confirm('本当に全ての生徒・評価・昇級履歴を削除しますか？この操作は取り消せません。')) return;
                const { error } = await supabase.from('profiles').delete().eq('is_admin', false);
                if (error) { alert('削除失敗: ' + error.message); return; }
                setSelectedStudentId(null);
                loadStudents();
                alert('生徒データを全削除しました。');
              }} className="flex-1 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-[9px] font-black text-red-300 border border-red-500/20">
                生徒 全削除
              </button>
              <button onClick={async () => {
                if (!window.confirm('審査基準データを全削除してよろしいですか？\n（再インポート前にご利用ください）')) return;
                await supabase.from('criteria').delete().neq('id', 0);
                alert('削除完了。CSVを再インポートしてください。');
              }} className="flex-1 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-[9px] font-black text-red-300 border border-red-500/20">
                審査基準 全削除
              </button>
            </div>
          )}

          <div className="space-y-2">
            <input type="text" placeholder={t('名前・級で検索...', 'Search by name / grade...')} className="w-full bg-white/10 border-none rounded-xl px-4 py-2 text-xs text-white outline-none focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="flex gap-1">
              <select
                className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[9px] font-black outline-none disabled:opacity-60"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                disabled={isBranchScoped}
                title={isBranchScoped ? t('自分の支部のみ表示されます', 'Only your own branch is shown') : undefined}
              >
                {isMaster && <option value="すべて" className="text-black">{t('全支部', 'All Branches')}</option>}
                {allBranchList.map(b => <option key={b} value={b} className="text-black">{b}</option>)}
              </select>
              <select className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[9px] font-black outline-none" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="name" className="text-black">{t('名前順', 'By Name')}</option>
                <option value="kyu" className="text-black">{t('級順', 'By Grade')}</option>
              </select>
            </div>
            {isMaster && (
              <label className="flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded-lg text-[9px] font-black cursor-pointer select-none">
                <input type="checkbox" checked={includeStaff} onChange={(e) => setIncludeStaff(e.target.checked)}
                  className="accent-orange-500" />
                <span className="opacity-80">{t('スタッフ（支部長・指導員）も表示', 'Include staff (chiefs/instructors)')}</span>
              </label>
            )}
            <label className="flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded-lg text-[9px] font-black cursor-pointer select-none">
              <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
                className="accent-orange-500" />
              <span className="opacity-80">{t('休会・退会者も表示', 'Include paused / resigned')}</span>
            </label>
            {attendingIds.size > 0 && (
              <div className="mt-1 p-2 bg-emerald-500/15 border border-emerald-400/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-emerald-300">
                    {t(`出席中: ${attendingIds.size}名`, `Attending: ${attendingIds.size}`)}
                  </span>
                  <button onClick={clearAttending} className="text-[9px] font-black text-emerald-200 hover:text-white underline">
                    {t('クリア', 'Clear')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => {
            const sRole = resolveRole(s);
            const isStaff = sRole !== 'student';
            const unmigrated = needsIppanMigration(s);
            const status = (s.status as MemberStatus | undefined) || 'active';
            const isInactive = status !== 'active';
            const isAttending = attendingIds.has(s.id);
            return (
              <div key={s.id} onClick={() => {setSelectedStudentId(s.id); if(window.innerWidth<768)setIsSidebarOpen(false);}}
                className={`p-5 border-l-4 cursor-pointer transition-all ${selectedStudentId === s.id ? 'bg-orange-50 border-orange-500 shadow-inner' : isAttending ? 'bg-emerald-50/60 border-emerald-400' : 'border-transparent hover:bg-gray-50'} ${isInactive ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-center gap-3">
                  {/* 出席チェック（クリックはカード選択に伝播させない） */}
                  <label
                    onClick={e => e.stopPropagation()}
                    className="flex items-center justify-center w-6 h-6 rounded-md cursor-pointer bg-white border border-gray-200 hover:border-emerald-400 shrink-0"
                    title={t('今日の出席にチェック', 'Mark attending today')}>
                    <input
                      type="checkbox"
                      checked={isAttending}
                      onChange={() => toggleAttending(s.id)}
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <p className="font-black text-sm">{s.name}</p>
                      {isStaff && (
                        <span className="text-[7px] bg-[#001f3f] text-white px-1.5 py-0.5 rounded font-black uppercase tracking-wider">{getRoleLabel(sRole)}</span>
                      )}
                      {unmigrated && (
                        <span className="text-[7px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-black" title={t('高校進学済・一般ランクへ未移行', 'High school or above, pending migration to General rank')}>⚠ {t('未移行', 'Pending')}</span>
                      )}
                      {status === 'paused' && (
                        <span className="text-[7px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-black">{t('休会中', 'Paused')}</span>
                      )}
                      {status === 'resigned' && (
                        <span className="text-[7px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-black">{t('退会済', 'Resigned')}</span>
                      )}
                    </div>
                    <p className="text-[9px] font-bold text-orange-500 uppercase">{normalizeKyu(s.kyu)}</p>
                  </div>
                  <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold">{s.branch}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {attendingStudents.length > 0 ? (
          <div className="max-w-2xl mx-auto">
            {/* 並列モードのスティッキー・ヘッダー＆タブ */}
            <div className="sticky top-0 z-20 -mx-4 md:-mx-10 px-4 md:px-10 pt-2 pb-3 bg-[#f8f9fa]/95 backdrop-blur-sm border-b border-gray-200 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
                    {t('今日の並列評価', 'Parallel Evaluation — Today')}
                  </p>
                  <p className="text-sm font-black text-[#001f3f] truncate">
                    {activeAttending ? activeAttending.name : ''}
                    <span className="text-[10px] font-black text-gray-400 ml-2">
                      {attendingStudents.findIndex(s => s.id === activeAttending?.id) + 1} / {attendingStudents.length}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => goRelativeAttending(-1)}
                    disabled={attendingStudents.length <= 1}
                    title={t('前の生徒', 'Previous')}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 font-black text-[#001f3f] disabled:opacity-30 disabled:cursor-not-allowed">
                    ←
                  </button>
                  <button
                    onClick={() => goRelativeAttending(1)}
                    disabled={attendingStudents.length <= 1}
                    title={t('次の生徒', 'Next')}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 font-black text-[#001f3f] disabled:opacity-30 disabled:cursor-not-allowed">
                    →
                  </button>
                  <button
                    onClick={clearAttending}
                    title={t('出席選択をすべてクリア', 'Clear all')}
                    className="ml-2 text-[10px] font-black bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg">
                    {t('クリア', 'Clear')}
                  </button>
                </div>
              </div>

              {/* タブ（横スクロール） */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                {attendingStudents.map(s => {
                  const belt = getBeltForProfile(s)
                  const bc = BELT_COLORS[belt] || BELT_COLORS['白帯']
                  const isActive = s.id === activeAttending?.id
                  return (
                    <div key={s.id} className="shrink-0 relative group">
                      <button
                        onClick={() => setActiveAttendingId(s.id)}
                        className="flex items-center gap-2 pl-3 pr-7 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border-2"
                        style={isActive
                          ? { backgroundColor: bc.bg, color: bc.text, borderColor: bc.bg }
                          : { backgroundColor: '#ffffff', color: '#64748b', borderColor: '#e2e8f0' }}>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: isActive ? bc.text : bc.bg, opacity: isActive ? 0.8 : 1 }} />
                        <span className="truncate max-w-[7rem]">{s.name}</span>
                        <span
                          className="text-[9px] font-black px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: isActive ? 'rgba(0,0,0,0.18)' : '#f1f5f9',
                            color: isActive ? bc.text : '#94a3b8',
                          }}>
                          {normalizeKyu(s.kyu)}
                        </span>
                      </button>
                      {/* 出席から外す × ボタン */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleAttending(s.id); }}
                        title={t('出席から外す', 'Remove from attendance')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black hover:bg-black/20 leading-none"
                        style={{ color: isActive ? bc.text : '#94a3b8' }}>
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 選択中の1名のみEvaluationPanelを表示 */}
            {activeAttending && (
              <EvaluationPanel
                key={activeAttending.id}
                student={activeAttending}
                onRefresh={loadStudents}
                allBranchList={allBranchList}
                adminProfile={adminProfile}
                criteriaRefreshKey={criteriaVersion}
              />
            )}
          </div>
        ) : selectedStudent ? (
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={loadStudents} allBranchList={allBranchList} adminProfile={adminProfile} criteriaRefreshKey={criteriaVersion} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
             <h2 className="font-black text-4xl italic tracking-tighter uppercase">SEIKUKAI</h2>
          </div>
        )}
      </div>

      {showAddStudent && (
        <AddStudentModal
          branches={allBranchList}
          lockedBranch={isBranchScoped ? adminBranch : null}
          onClose={() => setShowAddStudent(false)}
          onAdded={(newStudent) => {
            setShowAddStudent(false);
            loadStudents();
            setSelectedStudentId(newStudent.id);
          }}
        />
      )}
    </div>
  )
}

// ISO日時文字列を YYYY-MM-DD に整形（HTML date input 用）
const toDateInput = (v: string | null | undefined): string => {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

// --- 生徒追加モーダル ---
function AddStudentModal({ branches, lockedBranch, onClose, onAdded }: { branches: string[]; lockedBranch: string | null; onClose: () => void; onAdded: (s: any) => void }) {
  const [form, setForm] = useState({
    name: '',
    login_email: '',
    kyu: '無級',
    branch: lockedBranch || '',
    birthday: '',
    joined_at: '',
    gakuinen: '',
  });
  const [addingNewBranch, setAddingNewBranch] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.login_email.trim()) {
      alert('名前とメールアドレスは必須です。');
      return;
    }
    // 支部長は自分の支部以外には登録できない（サーバー側対策は将来のRLSで実施）
    const branchToSave = (lockedBranch || form.branch).trim();
    if (addingNewBranch && !branchToSave) {
      alert('新しい支部名を入力してください。');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('profiles').insert({
      name: form.name.trim(),
      login_email: form.login_email.trim().toLowerCase(),
      kyu: form.kyu,
      branch: branchToSave || null,
      birthday: form.birthday || null,
      joined_at: form.joined_at || null,
      gakuinen: form.gakuinen || null,
      is_admin: false,
    }).select().single();
    setSaving(false);
    if (error) {
      alert('追加に失敗しました: ' + error.message);
      return;
    }
    onAdded(data);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-[40px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-[#001f3f]">生徒を追加</h3>
          <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black hover:bg-gray-200">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">名前 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
          </div>

          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">ログイン用メール <span className="text-red-500">*</span></label>
            <input type="email" value={form.login_email} onChange={e => setForm({ ...form, login_email: e.target.value })}
              placeholder="example@seikukai.jp"
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">初期級</label>
              <select value={form.kyu} onChange={e => setForm({ ...form, kyu: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]">
                {KYU_OPTIONS.filter(k => k !== '').map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                支部{lockedBranch ? '（自支部に固定）' : ''}
              </label>
              <select
                value={lockedBranch ? lockedBranch : (addingNewBranch ? '__new__' : form.branch)}
                onChange={e => {
                  if (lockedBranch) return;
                  const v = e.target.value;
                  if (v === '__new__') {
                    setAddingNewBranch(true);
                    setForm({ ...form, branch: '' });
                  } else {
                    setAddingNewBranch(false);
                    setForm({ ...form, branch: v });
                  }
                }}
                disabled={!!lockedBranch}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f] disabled:bg-gray-50 disabled:text-gray-400"
              >
                {!lockedBranch && <option value="">選択してください</option>}
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
                {!lockedBranch && <option value="__new__">＋ 新しい支部を追加...</option>}
              </select>
              {addingNewBranch && !lockedBranch && (
                <input type="text" value={form.branch}
                  onChange={e => setForm({ ...form, branch: e.target.value })}
                  placeholder="新しい支部名を入力"
                  autoFocus
                  className="mt-2 w-full border border-orange-300 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-orange-500" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">生年月日</label>
              <input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">入会日</label>
              <input type="date" value={form.joined_at} onChange={e => setForm({ ...form, joined_at: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">学年</label>
            <select value={form.gakuinen} onChange={e => setForm({ ...form, gakuinen: e.target.value })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]">
              {GAKUINEN_OPTIONS.map(g => <option key={g} value={g}>{g || '未設定'}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mt-6 text-[10px] text-blue-700 font-bold leading-relaxed">
          💡 追加後、この生徒にメールで「パスワードリセット」を送ると、初回ログイン用のパスワード設定ができます。
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-2xl text-sm font-black text-gray-500 hover:bg-gray-200">キャンセル</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-[#001f3f] text-white rounded-2xl text-sm font-black disabled:opacity-50">
            {saving ? '追加中...' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 編集パネル ---
function EditPanel({ student, adminProfile, branches, onClose, onSave }: { student: any; adminProfile: Profile; branches: string[]; onClose: () => void; onSave: (updated: any) => void }) {
  const adminRole = resolveRole(adminProfile);
  const isSelf = student.id === adminProfile.id;
  const canAssignRole = adminRole === 'master' && !isSelf;
  const initialBranch = student.branch || '';
  const [form, setForm] = useState({
    name: student.name || '',
    kyu: normalizeKyu(student.kyu),
    branch: initialBranch,
    birthday: toDateInput(student.birthday),
    joined_at: toDateInput(student.joined_at),
    gakuinen: (student.gakuinen || '').trim(),
    role: (resolveRole(student) as Role),
    keeps_junior_rank: !!student.keeps_junior_rank,
    status: ((student.status as MemberStatus | undefined) || 'active') as MemberStatus,
    parent_login_email: (student.parent_login_email as string | null | undefined) || '',
  });
  // 既存生徒の所属支部がプリセットに無い場合は最初から新規入力モードで開く
  const [addingNewBranch, setAddingNewBranch] = useState(
    !!initialBranch && !branches.includes(initialBranch)
  );
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
      redirectTo: `${APP_URL}/`,
    });
    setResetting(false);
    if (error) alert('送信に失敗しました: ' + error.message);
    else alert('パスワードリセット用メールを送信しました。');
  };

  const gradeOptions = adminRole === 'master'
    ? KYU_OPTIONS.filter(k => k !== '')
    : KYU_GRADES;

  const handleSave = async () => {
    // 支部長に昇格する場合は支部が必須
    if (canAssignRole && form.role === 'branch' && !form.branch.trim()) {
      alert('支部長には所属支部が必須です。支部を入力してください。');
      return;
    }
    setSaving(true);
    const updatePayload: Record<string, any> = {
      name: form.name,
      kyu: form.kyu,
      branch: form.branch,
      birthday: form.birthday || null,
      joined_at: form.joined_at || null,
      gakuinen: form.gakuinen,
      keeps_junior_rank: form.keeps_junior_rank,
      status: form.status,
      parent_login_email: form.parent_login_email.trim().toLowerCase() || null,
    };
    // マスターのみ role / is_admin を更新可能（自分自身は除く）
    if (canAssignRole) {
      updatePayload.role = form.role;
      updatePayload.is_admin = form.role !== 'student';
    }
    const { error } = await supabase.from('profiles').update(updatePayload).eq('id', student.id);
    setSaving(false);
    if (!error) {
      logAudit({
        actorEmail: adminProfile.login_email,
        action: 'edit_profile',
        targetId: student.id,
        targetTable: 'profiles',
        before: {
          name: student.name, kyu: student.kyu, branch: student.branch,
          role: resolveRole(student), status: student.status,
          keeps_junior_rank: !!student.keeps_junior_rank,
        },
        after: {
          name: form.name, kyu: form.kyu, branch: form.branch,
          role: canAssignRole ? form.role : resolveRole(student),
          status: form.status, keeps_junior_rank: form.keeps_junior_rank,
        },
      });
      onSave({ ...student, ...form, is_admin: canAssignRole ? form.role !== 'student' : student.is_admin });
    } else alert('保存に失敗しました: ' + error.message);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-[40px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
              支部{adminRole === 'branch' ? '（支部長は変更不可）' : ''}
            </label>
            <select
              value={adminRole === 'branch' ? form.branch : (addingNewBranch ? '__new__' : form.branch)}
              onChange={e => {
                if (adminRole === 'branch') return;
                const v = e.target.value;
                if (v === '__new__') {
                  setAddingNewBranch(true);
                  setForm({ ...form, branch: '' });
                } else {
                  setAddingNewBranch(false);
                  setForm({ ...form, branch: v });
                }
              }}
              disabled={adminRole === 'branch'}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f] disabled:bg-gray-50 disabled:text-gray-400"
            >
              {adminRole !== 'branch' && <option value="">選択してください</option>}
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
              {adminRole === 'branch' && form.branch && !branches.includes(form.branch) && (
                <option value={form.branch}>{form.branch}</option>
              )}
              {adminRole !== 'branch' && <option value="__new__">＋ 新しい支部を追加...</option>}
            </select>
            {addingNewBranch && adminRole !== 'branch' && (
              <input
                type="text"
                value={form.branch}
                onChange={e => setForm({ ...form, branch: e.target.value })}
                placeholder="新しい支部名を入力"
                autoFocus
                className="mt-2 w-full border border-orange-300 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-orange-500"
              />
            )}
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

          {/* 一般未移行フラグ（高校進学済だが少年部ランク保持） */}
          <label className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 cursor-pointer select-none">
            <input type="checkbox"
              checked={form.keeps_junior_rank}
              onChange={e => setForm({ ...form, keeps_junior_rank: e.target.checked })}
              className="mt-0.5 accent-amber-500 w-4 h-4" />
            <div>
              <p className="text-[11px] font-black text-amber-900 leading-tight">一般ランクへ未移行</p>
              <p className="text-[9px] text-amber-700 font-bold mt-0.5 leading-snug">
                高校進学済でも少年部ランク（少年緑帯・茶帯・黒帯）を保持する場合にチェック。<br />
                一般審査合格時にOFFにすると、年齢ベースで一般ランクへ自動切替されます。
              </p>
            </div>
          </label>

          {/* 会員ステータス */}
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
              会員ステータス
            </label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value as MemberStatus })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
            >
              <option value="active">{MEMBER_STATUS_LABEL.active}</option>
              <option value="paused">{MEMBER_STATUS_LABEL.paused}</option>
              <option value="resigned">{MEMBER_STATUS_LABEL.resigned}</option>
            </select>
            {form.status !== 'active' && (
              <p className="text-[10px] text-gray-500 mt-1 font-bold leading-snug">
                一覧からは標準で非表示になります（「休会・退会者も表示」トグルで表示可）。
              </p>
            )}
          </div>

          {/* 保護者メール（家族運用） */}
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
              保護者のログインメール（任意）
            </label>
            <input type="email"
              value={form.parent_login_email}
              onChange={e => setForm({ ...form, parent_login_email: e.target.value })}
              placeholder="親のhacomono登録メール"
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            <p className="text-[10px] text-gray-500 mt-1 font-bold leading-snug">
              この会員が「保護者が親メールでログインして管理する子ども」の場合、親のメールを入力。<br />
              入力されていれば、親がログインしたときにこの会員profileへ切替可能になります。
            </p>
          </div>

        </div>

        {/* 権限設定（マスター限定） */}
        {canAssignRole && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">
              権限（マスター限定）
            </label>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as Role })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
            >
              <option value="student">会員</option>
              <option value="instructor">指導員</option>
              <option value="branch">支部長</option>
              <option value="master">マスター</option>
            </select>
            {form.role === 'branch' && (
              <p className="text-[10px] text-orange-600 mt-2 font-bold">⚠ 支部長には所属支部が必須です。</p>
            )}
            {form.role !== 'student' && (
              <p className="text-[10px] text-blue-600 mt-2 font-bold">保存時に管理者フラグ（is_admin）が自動で有効になります。</p>
            )}
          </div>
        )}
        {isSelf && adminRole === 'master' && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 font-bold">※自分自身の権限は変更できません（誤操作防止）。Supabase側で直接操作してください。</p>
          </div>
        )}

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
  const { t } = useLang();
  const adminRole = resolveRole(adminProfile);
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([])
  const [currentGradeEvals, setCurrentGradeEvals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(initialStudent);
  const [recentPromotion, setRecentPromotion] = useState<any | null>(null);
  const [reversing, setReversing] = useState(false);

  const currentKyu = normalizeKyu(student.kyu);
  // 生徒表示用（年齢込みの帯名・色）
  const currentBelt = getBeltForProfile(student);
  const currentBeltColor = BELT_COLORS[currentBelt] || BELT_COLORS['白帯'];
  // ナビ用（級範囲ベースのカテゴリ）
  const currentNavCategory = getBeltCategoryForGrade(currentKyu);

  const [viewBelt, setViewBelt] = useState(currentNavCategory);
  const [viewGrade, setViewGrade] = useState(currentKyu);

  // 昇級後に帯・グレードタブを同期
  useEffect(() => {
    setViewBelt(currentNavCategory);
    setViewGrade(currentKyu);
  }, [currentKyu, currentNavCategory]);

  const handleBeltChange = (belt: string) => {
    setViewBelt(belt);
    const grades = BELT_GRADE_MAP[belt];
    setViewGrade(grades.includes(currentKyu) ? currentKyu : grades[0]);
  };

  // 閲覧中グレードの基準・評価を取得（表示・採点用）
  useEffect(() => {
    async function fetchEvals() {
      setLoading(true);
      const ippan = isIppan(student);
      const divisionFilter = ippan ? 'general' : 'junior';
      const { data: crit } = await supabase.from('criteria').select('*').order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      const filtered = (crit || []).filter((c: any) =>
        normalizeKyu(c.dan) === viewGrade
        && (c.division === 'both' || c.division === divisionFilter || !c.division)
      );
      console.log('[AdminDashboard/view] viewGrade=', viewGrade, 'ippan=', ippan, 'total=', crit?.length, 'matched=', filtered.length);
      setCriteria(filtered.map((c: any) => ({ ...c, grade: evals?.find((e: any) => e.criterion_id === c.id)?.grade || 'D' })));
      setLoading(false);
    }
    fetchEvals()
  }, [student.id, viewGrade, criteriaRefreshKey])

  // 直近の昇級履歴（未取消のみ）を取得。24時間以内の最新1件
  useEffect(() => {
    async function fetchRecentPromotion() {
      const { data } = await supabase.from('promotion_history')
        .select('*')
        .eq('student_id', student.id)
        .order('promoted_at', { ascending: false })
        .limit(1);
      const latest = data?.[0];
      if (!latest || latest.is_reversed) {
        setRecentPromotion(null);
        return;
      }
      const promotedAt = new Date(latest.promoted_at);
      const hoursAgo = (Date.now() - promotedAt.getTime()) / 3600000;
      // 24時間以内なら取消可能とする
      setRecentPromotion(hoursAgo <= 24 ? latest : null);
    }
    fetchRecentPromotion();
  }, [student.id, student.kyu]);

  // 現在の級スコア（昇級判定専用）― viewGradeに関わらず常にcurrentKyuで計算
  useEffect(() => {
    async function fetchCurrentGrade() {
      const ippan = isIppan(student);
      const divisionFilter = ippan ? 'general' : 'junior';
      const { data: crit } = await supabase.from('criteria').select('*').order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      const filtered = (crit || []).filter((c: any) =>
        normalizeKyu(c.dan) === currentKyu
        && (c.division === 'both' || c.division === divisionFilter || !c.division)
      );
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
      alert(`受験可ライン（80点）に達していません。\n現在の点数：${currentGradeScore}点 / ${currentGradeMax}点`);
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

    logAudit({
      actorEmail: adminProfile.login_email,
      action: 'promote',
      targetId: student.id,
      targetTable: 'profiles',
      before: { kyu: currentKyu },
      after: { kyu: nextKyu },
      note: `score=${currentGradeScore}, step=${step}`,
    });

    setStudent({ ...student, kyu: nextKyu });
    onRefresh();
    alert(`${nextKyu}への昇級を確定しました。`);
  };

  const handleReversePromotion = async () => {
    if (!recentPromotion) return;
    const msg = `${recentPromotion.to_kyu} → ${recentPromotion.from_kyu} に昇級を取り消します。\n\n` +
                `（誤操作時のリバース用です。通知メールは送信済みのため会員への連絡は別途必要です）\n\n実行しますか？`;
    if (!window.confirm(msg)) return;
    setReversing(true);
    // profiles.kyu を元に戻す
    const { error: profErr } = await supabase.from('profiles')
      .update({ kyu: recentPromotion.from_kyu })
      .eq('id', student.id);
    if (profErr) {
      setReversing(false);
      alert('取消に失敗しました: ' + profErr.message);
      return;
    }
    // promotion_history に reversed フラグ
    await supabase.from('promotion_history')
      .update({ is_reversed: true, reversed_at: new Date().toISOString() })
      .eq('id', recentPromotion.id);
    logAudit({
      actorEmail: adminProfile.login_email,
      action: 'reverse_promotion',
      targetId: student.id,
      targetTable: 'profiles',
      before: { kyu: recentPromotion.to_kyu },
      after: { kyu: recentPromotion.from_kyu },
      note: `reversed promotion_history.id=${recentPromotion.id}`,
    });
    setStudent({ ...student, kyu: recentPromotion.from_kyu });
    setRecentPromotion(null);
    setReversing(false);
    onRefresh();
    alert(`昇級を取消しました（${recentPromotion.from_kyu} に戻しました）`);
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
  // ナビ用の色。viewBeltはカテゴリ名（白帯/黄帯/青帯/橙帯/紫帯/緑帯/茶帯/黒帯）
  // 生徒が少年部か一般かで6/5級・緑・茶・黒の色味が変わるため動的に解決
  const studentIsIppan = isIppan(student);
  const vbc = getNavBeltColor(viewBelt, studentIsIppan);
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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-black tracking-tight">{student.name}</h2>
                {needsIppanMigration(student) && (
                  <span className="text-[9px] font-black px-2 py-1 rounded"
                    style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}
                    title={t('高校進学済・一般ランクへ未移行', 'High school or above, pending migration to General')}>
                    ⚠ {t('一般未移行', 'Pending General')}
                  </span>
                )}
              </div>
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
                <p className="text-[9px] font-black text-green-400 uppercase tracking-wide leading-none">受験可</p>
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
              <span>0</span><span>受験可 80点</span><span>{currentGradeMax > 0 ? `満点 ${currentGradeMax}` : ''}</span>
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

          {/* 昇級Undo（直近24時間以内） */}
          {recentPromotion && canEdit && (
            <div className="mt-2 p-2 rounded-xl border border-white/30 bg-white/10 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[8px] font-black opacity-60 uppercase tracking-wider">直近の昇級</p>
                <p className="text-[10px] font-black truncate">
                  {recentPromotion.from_kyu} → {recentPromotion.to_kyu}
                  <span className="opacity-60 ml-1 font-normal">
                    ({new Date(recentPromotion.promoted_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                  </span>
                </p>
              </div>
              <button onClick={handleReversePromotion} disabled={reversing}
                className="shrink-0 text-[9px] font-black px-2.5 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-50">
                {reversing ? '取消中...' : '取消'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== ナビゲーション（帯 + 級） ===== */}
      <div className="bg-white rounded-[22px] p-4 shadow-sm border border-gray-100 mb-4">
        {/* 帯タブ */}
        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-2">Belt</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3">
          {Object.keys(BELT_GRADE_MAP).map(belt => {
            const bc = getNavBeltColor(belt, studentIsIppan);
            const isSelected = belt === viewBelt;
            const isCurrent = belt === currentNavCategory;
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
                      {isValidVideoUrl(c.video_url) && (
                        <a href={c.video_url} target="_blank" rel="noreferrer"
                          title="指導動画を再生"
                          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-black text-white ml-2 shadow-md hover:scale-105 transition-transform"
                          style={{ backgroundColor: '#dc2626' }}>▶</a>
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
          branches={allBranchList}
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
