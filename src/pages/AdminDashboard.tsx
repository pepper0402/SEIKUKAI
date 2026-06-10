import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  supabase, Profile, Role, MemberStatus, MEMBER_STATUS_LABEL,
  resolveRole, canCertifyDan, canCertifyKyu, canScore, getRoleLabel,
  KYU_OPTIONS, KYU_GRADES, GAKUINEN_OPTIONS, normalizeKyu, isValidVideoUrl, logAudit,
  BELT_COLORS, BELT_GRADE_MAP, getBeltCategoryForGrade, getBeltForProfile, isIppan, needsIppanMigration, calcAge,
  APPLY_SCORE, PASS_SCORE,
} from '../lib/supabase'
import { useLang, LangToggle } from '../lib/i18n'
import StudentDashboard from './StudentDashboard'
import AccountSettingsModal from '../components/AccountSettingsModal'
import { useToast } from '../components/Toast'
import Avatar from '../components/Avatar'
import { StudentListSkeleton, CriteriaListSkeleton } from '../components/Skeleton'
import ProgressRing from '../components/ProgressRing'

const RECENT_VIEWED_KEY = 'seikukai.recentlyViewedStudents'
const MAX_RECENT = 6

type QuickFilter = 'all' | 'attending' | 'candidate' | 'uninvited'

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



type BulkPromotionPreview = {
  eligible: { student: Profile; from: string; to: string; score: number }[]
  ineligible: { student: Profile; reasons: string[] }[]
}

export default function AdminDashboard({ profile: adminProfile, onReload, onSwitchToStudent }: { profile: Profile; onReload?: () => void; onSwitchToStudent?: () => void }) {
  const { t } = useLang()
  const toast = useToast()
  const adminRole = resolveRole(adminProfile)
  const isMaster = adminRole === 'master'
  const isBranchChief = adminRole === 'branch'
  const isInstructor = adminRole === 'instructor'
  // 支部長・指導員は自支部スコープ
  const isBranchScoped = isBranchChief || isInstructor
  const adminBranch = adminProfile.branch || ''

  const [students, setStudents] = useState<Profile[]>([])
  // 集計・退会数把握用に、フィルタ前の生データを別途保持
  const [allStudentsRaw, setAllStudentsRaw] = useState<Profile[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  // 支部長・指導員は自分の支部に固定。マスターは「すべて」デフォルト
  const [branchFilter, setBranchFilter] = useState(isBranchScoped && adminBranch ? adminBranch : 'すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [criteriaVersion, setCriteriaVersion] = useState(0)
  const [showAddStudent, setShowAddStudent] = useState(false)
  // アカウント設定モーダル（自分のパスワード・メール変更）
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  // 管理メニュー（CSV読込・支部追加・全削除等の低頻度操作）の開閉
  const [showAdminTools, setShowAdminTools] = useState(false)
  // マスターのみ: スタッフ（管理者アカウント）を一覧に含めるトグル
  const [includeStaff, setIncludeStaff] = useState(false)
  // 退会・休会も一覧に含めるトグル（デフォルト非表示）
  const [includeInactive, setIncludeInactive] = useState(false)
  // 集計ダッシュボード/監査ログ/一括昇級モーダル
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [bulkPromotionPreview, setBulkPromotionPreview] = useState<BulkPromotionPreview | null>(null)
  const [bulkPromoting, setBulkPromoting] = useState(false)
  // 生徒一覧のローディング状態（初回true、loadStudents完了でfalse）
  const [studentsLoading, setStudentsLoading] = useState(true)
  // クイックフィルタピル
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  // 最近見た生徒（ID配列、新しい順、最大6件）
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_VIEWED_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  // キーボードショートカットヘルプ
  const [showShortcuts, setShowShortcuts] = useState(false)
  // 検索ボックスへの参照（"/"キーでフォーカス）
  const searchInputRef = useRef<HTMLInputElement | null>(null)
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
    setStudentsLoading(true)
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
      // フィルタ前の生データ（集計用・退会含む全件）
      setAllStudentsRaw(data as Profile[])
      // status でのフィルタ（null は active 扱い）
      const filtered = includeInactive
        ? data
        : data.filter((p: any) => !p.status || p.status === 'active')
      setStudents(filtered);
    }
    setStudentsLoading(false)
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
        const allLines = text.split('\n').filter((r: string) => r.trim());
        // CSV形式: 支部, 氏, 名, ヨミガナ, 性別, 入会日, 生年月日, 級/段, メールアドレス, パスワード
        const EXPECTED_COLS = 9;
        // ヘッダ行を簡易検証（想定列数を満たさなければ取込中止）
        const header = allLines.length ? parseCsvRow(allLines[0]) : [];
        if (header.length < EXPECTED_COLS) {
          alert(
            `CSVの列数が想定（${EXPECTED_COLS}列以上）と一致しません。検出: ${header.length}列。\n\n` +
            `想定フォーマット:\n支部, 氏, 名, ヨミガナ, 性別, 入会日, 生年月日, 級/段, メールアドレス, パスワード\n\n` +
            `ヘッダ行が無い／列がずれている可能性があります。取込を中止しました。`
          );
          return;
        }
        const rows = allLines.slice(1);
        const toISODate = (s: string): string | null => {
          if (!s) return null;
          const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
          if (!m) return null;
          const [, y, mo, d] = m;
          return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        };
        let ok = 0;
        // スキップ・エラーを理由別に集計（黙ってスキップせず全件を報告）
        const skips: { row: number; reason: string }[] = [];
        const errors: { row: number; name: string; reason: string }[] = [];
        for (let i = 0; i < rows.length; i++) {
          const lineNo = i + 2; // ヘッダ=1行目、データは2行目から
          const cols = parseCsvRow(rows[i]);
          if (cols.length < EXPECTED_COLS) { skips.push({ row: lineNo, reason: `列不足(${cols.length}列)` }); continue; }
          const [branch, sei, mei, , , joined_at_raw, birthday_raw, kyu, login_email] = cols;
          const name = `${sei} ${mei}`.trim();
          if (!name) { skips.push({ row: lineNo, reason: '氏名が空' }); continue; }
          if (!login_email) { skips.push({ row: lineNo, reason: 'メール欠落' }); continue; }
          const { error } = await supabase.from('profiles').upsert({
            name,
            kyu: kyu || null,
            branch: branch || null,
            birthday: toISODate(birthday_raw),
            joined_at: toISODate(joined_at_raw),
            login_email: login_email.toLowerCase(),
            is_admin: false,
          }, { onConflict: 'login_email' });
          if (error) { errors.push({ row: lineNo, name, reason: error.message }); }
          else ok++;
        }
        const skippedCount = skips.length;
        const errorCount = errors.length;
        let report = `インポート完了\n更新/追加: ${ok}件 / スキップ: ${skippedCount}件 / エラー: ${errorCount}件`;
        if (skippedCount) {
          report += `\n\n■ スキップ（取込対象外）${skippedCount}件:\n` +
            skips.map(s => `  行${s.row}: ${s.reason}`).join('\n');
        }
        if (errorCount) {
          report += `\n\n■ DB保存エラー ${errorCount}件:\n` +
            errors.map(e => `  行${e.row} ${e.name}: ${e.reason}`).join('\n');
        }
        alert(report);
        loadStudents();
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // 新フォーマット審査CSV: 帯, 級, 種類, 内容, 動画
  // ★プレフィックスは is_required=true のサイン（★形/★体力測定/★精神面）
  // upsert方式: (dan, examination_type, examination_content, division) で既存行を更新。
  // 既存行の id を保持するため、evaluations.criterion_id 経由の点数データが消えない。
  const handleCriteriaCsvImport = async (division: 'junior' | 'general') => {
    const divisionLabel = division === 'junior' ? '少年部' : '一般部';
    if (!window.confirm(
      `${divisionLabel}の審査基準を更新します。\n\n` +
      `・CSV内の項目で「帯・種類・内容」が一致する既存項目は内容のみ上書き（評価・点数は保持）\n` +
      `・CSVに無い新規項目は追加\n` +
      `・CSVに無い既存項目はDBに残します（点数も保持）\n\n続行しますか？`
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

        // upsert: 既存(dan,type,content,division)が一致する行は id を保ったまま UPDATE。
        // → criterion_id を参照する evaluations の点数データが消えない。
        const { error: upsertErr } = await supabase
          .from('criteria')
          .upsert(batch, { onConflict: 'dan,examination_type,examination_content,division' });
        if (upsertErr) {
          alert(`インポートエラー:\n${upsertErr.message}`);
          return;
        }
        setCriteriaVersion((v: number) => v + 1);
        alert(`${divisionLabel}審査基準 ${batch.length}件 取込完了\n既存の点数（評価データ）は保持されました。`);
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

  // 拡張検索: 名前・級・支部に加えて メール / 生年(YYYY) / 入会年(YYYY) もマッチ
  // クイックフィルタピル: all / attending / candidate (受験準備=準級) / uninvited
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let result = students.filter(s => {
      if (branchFilter !== 'すべて' && s.branch !== branchFilter) return false
      if (quickFilter === 'attending' && !attendingIds.has(s.id)) return false
      if (quickFilter === 'candidate' && !normalizeKyu(s.kyu).startsWith('準')) return false
      if (quickFilter === 'uninvited' && (!s.login_email || !!s.user_id)) return false
      if (!q) return true
      const haystack = [
        s.name || '',
        s.kyu || '',
        s.branch || '',
        s.login_email || '',
        s.parent_login_email || '',
        s.birthday ? String(s.birthday).slice(0, 4) : '',         // 生年
        s.birthday ? String(s.birthday).slice(0, 7) : '',         // 生年-月
        s.joined_at ? String(s.joined_at).slice(0, 4) : '',       // 入会年
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    });
    return result.sort((a, b) => sortBy === 'kyu' ? allKyuList.indexOf(normalizeKyu(b.kyu)) - allKyuList.indexOf(normalizeKyu(a.kyu)) : (a.name || '').localeCompare(b.name || '', 'ja'));
  }, [students, searchQuery, branchFilter, sortBy, quickFilter, attendingIds])

  // 最近見た生徒の更新 + 永続化
  const recordRecentlyViewed = useCallback((id: string) => {
    setRecentlyViewed(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, MAX_RECENT)
      try { localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])
  const selectStudent = useCallback((id: string) => {
    setSelectedStudentId(id)
    recordRecentlyViewed(id)
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }, [recordRecentlyViewed])

  const recentStudents = useMemo(
    () => recentlyViewed
      .map(id => allStudentsRaw.find(s => s.id === id))
      .filter((s): s is Profile => !!s)
      .slice(0, MAX_RECENT),
    [recentlyViewed, allStudentsRaw]
  )

  // ===== キーボードショートカット =====
  //   /  → 検索ボックスにフォーカス
  //   ?  → ヘルプ表示
  //   j  → 次の生徒
  //   k  → 前の生徒
  //   Esc → 検索解除 / 選択解除
  //   a  → 選択中の生徒を今日の出席にトグル
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 入力中（input/textarea/contenteditable）は基本素通し。'/' だけは別途処理
      const target = e.target as HTMLElement | null
      const isEditing = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      )
      // モディファイア付きはスキップ
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '/' && !isEditing) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (e.key === '?' && !isEditing) {
        e.preventDefault()
        setShowShortcuts(s => !s)
        return
      }
      if (e.key === 'Escape') {
        if (isEditing && target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') {
          ;(target as HTMLInputElement).blur()
          return
        }
        // 選択解除
        setSelectedStudentId(null)
        return
      }
      if (isEditing) return
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        const list = filteredStudents
        if (list.length === 0) return
        const idx = list.findIndex(s => s.id === selectedStudentId)
        const next = list[Math.min(list.length - 1, idx + 1)] ?? list[0]
        selectStudent(next.id)
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        const list = filteredStudents
        if (list.length === 0) return
        const idx = list.findIndex(s => s.id === selectedStudentId)
        const prev = idx <= 0 ? list[0] : list[idx - 1]
        selectStudent(prev.id)
      } else if (e.key === 'a' || e.key === 'A') {
        if (selectedStudentId) {
          e.preventDefault()
          toggleAttending(selectedStudentId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filteredStudents, selectedStudentId, selectStudent, toggleAttending])

  // 退会・休会者の件数（all から計算 → チップで表示）
  const inactiveCount = useMemo(
    () => allStudentsRaw.filter(s => s.status && s.status !== 'active').length,
    [allStudentsRaw]
  )

  // CSV エクスポート: 現在フィルタ後の filteredStudents を一覧でダウンロード
  const handleCsvExport = useCallback(() => {
    const header = [
      'name', 'login_email', 'kyu', 'branch', 'birthday', 'joined_at',
      'gakuinen', 'role', 'status', 'is_admin', 'parent_login_email',
    ]
    const escape = (v: any): string => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const rows = filteredStudents.map(s => [
      s.name, s.login_email, normalizeKyu(s.kyu), s.branch || '',
      s.birthday || '', s.joined_at || '',
      s.gakuinen || '', resolveRole(s), s.status || 'active', s.is_admin ? 'true' : 'false',
      s.parent_login_email || '',
    ].map(escape).join(','))
    const csv = '﻿' + header.join(',') + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seikukai_members_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(t(`CSVをダウンロードしました（${filteredStudents.length}件）`, `CSV downloaded (${filteredStudents.length} rows)`))
  }, [filteredStudents, t, toast])

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

  // 一括昇級: 出席中の生徒を一括で評価し、合格者をまとめて昇級可能か preview
  const handlePrepareBulkPromotion = useCallback(async () => {
    if (attendingStudents.length === 0) return
    setBulkPromoting(true)
    try {
      const { data: allCriteria } = await supabase.from('criteria').select('*')
      const ids = attendingStudents.map(s => s.id)
      const { data: allEvals } = await supabase.from('evaluations').select('*').in('student_id', ids)

      const eligible: BulkPromotionPreview['eligible'] = []
      const ineligible: BulkPromotionPreview['ineligible'] = []

      for (const s of attendingStudents) {
        const currentKyu = normalizeKyu(s.kyu)
        if (currentKyu.includes('段')) {
          ineligible.push({ student: s, reasons: [t('段位は一括昇級の対象外', 'Dan ranks not eligible for bulk promotion')] })
          continue
        }
        const ippan = isIppan(s)
        const div = ippan ? 'general' : 'junior'
        const crit = (allCriteria || []).filter((c: any) =>
          normalizeKyu(c.dan) === currentKyu &&
          (c.division === 'both' || c.division === div || !c.division)
        )
        if (crit.length === 0) {
          ineligible.push({ student: s, reasons: [t('審査基準データなし', 'No criteria data')] })
          continue
        }
        const myEvals = (allEvals || []).filter((e: any) => e.student_id === s.id)
        const evaluated = crit.map((c: any) => ({
          ...c,
          grade: myEvals.find((e: any) => e.criterion_id === c.id)?.grade || 'D',
        }))
        const rawScore = evaluated.reduce((a, c) =>
          a + (c.grade === 'A' ? 10 : c.grade === 'B' ? 6 : c.grade === 'C' ? 3 : 0), 0)
        const score = Math.round((rawScore / (evaluated.length * 10)) * 100)
        const unmet = evaluated.filter((c: any) => c.is_required && c.grade !== 'A' && c.grade !== 'B')

        const reasons: string[] = []
        if (score < APPLY_SCORE) reasons.push(t(`点数不足 (${score}/${APPLY_SCORE})`, `Low score (${score}/${APPLY_SCORE})`))
        if (unmet.length > 0) reasons.push(t(`必須未達 ${unmet.length}件`, `${unmet.length} required unmet`))

        if (reasons.length === 0) {
          const idx = allKyuList.indexOf(currentKyu)
          const toKyu = allKyuList[idx + 1]
          if (!toKyu) {
            ineligible.push({ student: s, reasons: [t('次の級がありません', 'No next grade')] })
          } else {
            eligible.push({ student: s, from: currentKyu, to: toKyu, score })
          }
        } else {
          ineligible.push({ student: s, reasons })
        }
      }

      setBulkPromotionPreview({ eligible, ineligible })
    } catch (e: any) {
      toast.error(t('集計エラー: ', 'Calc error: ') + (e?.message ?? String(e)))
    } finally {
      setBulkPromoting(false)
    }
  }, [attendingStudents, t, toast])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 bg-[#001f3f] text-white p-3 rounded-full shadow-2xl md:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}

      {/* スマホでサイドバー開時のバックドロップ。タップで閉じる。 */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          aria-hidden="true"
        />
      )}

      <div className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:max-w-none`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-start mb-4 gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-black italic uppercase leading-none">
                {t('誠空会 管理パネル', 'SEIKUKAI Admin Panel')}
              </h1>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mt-1">
                {getRoleLabel(adminRole)}
                {isBranchScoped && adminBranch
                  ? t(` / ${adminBranch}支部`, ` / ${adminBranch} branch`)
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <LangToggle className="text-[10px] bg-white/15 hover:bg-white/25 px-2 py-1.5 rounded-md font-black" />
              <button onClick={() => setShowAccountSettings(true)}
                className="text-[10px] bg-white/15 hover:bg-white/25 px-2 py-1.5 rounded-md font-black"
                title={t('自分のパスワード・メール変更', 'Change own password / email')}>
                {t('アカウント', 'Account')}
              </button>
              {onSwitchToStudent && (
                <button onClick={onSwitchToStudent}
                  className="text-[10px] bg-white/15 hover:bg-white/25 px-2 py-1.5 rounded-md font-black"
                  title={t('自分の生徒画面へ切替', 'Switch to student view')}>
                  {t('生徒画面', 'Student')}
                </button>
              )}
              <button onClick={() => supabase.auth.signOut()}
                className="text-[10px] bg-red-600/90 hover:bg-red-600 px-2 py-1.5 rounded-md font-black uppercase"
                title="Logout">
                Logout
              </button>
              {/* スマホ専用: サイドバーを閉じる */}
              <button onClick={() => setIsSidebarOpen(false)}
                className="md:hidden ml-1 w-7 h-7 flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-md font-black text-sm"
                title={t('閉じる', 'Close')}
                aria-label={t('サイドバーを閉じる', 'Close sidebar')}>
                ✕
              </button>
            </div>
          </div>

          {/* ===== メインアクション（常に見える） ===== */}
          {canAddStudent && (
            <button onClick={() => setShowAddStudent(true)}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 rounded-lg text-[11px] font-black border border-orange-400 mb-2">
              ＋ {isBranchChief && adminBranch
                   ? t(`${adminBranch}支部の生徒を追加`, `Add member to ${adminBranch} branch`)
                   : t('生徒を追加', 'Add Member')}
            </button>
          )}

          {/* ===== 管理メニュー（畳める低頻度操作） ===== */}
          {(canBulkImportStudents || isMaster || canDeleteAll) && (
            <div className="mb-2">
              <button
                onClick={() => setShowAdminTools(v => !v)}
                className="w-full flex items-center justify-between py-1.5 px-3 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100 hover:bg-white/5 rounded-lg transition-opacity">
                <span>{t('管理メニュー', 'Admin Tools')}</span>
                <span className="text-[10px]">{showAdminTools ? '▾' : '▸'}</span>
              </button>
              {showAdminTools && (
                <div className="mt-1.5 p-2 bg-white/5 rounded-lg border border-white/10 space-y-2">
                  {/* CSV読込（1行3ボタン） */}
                  {canBulkImportStudents && (
                    <div>
                      <p className="text-[10px] font-black uppercase opacity-50 mb-1 px-0.5">CSV {t('読込', 'Import')}</p>
                      <div className="grid grid-cols-3 gap-1">
                        <button onClick={handleStudentsCsvImport} className="py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black">{t('生徒', 'Members')}</button>
                        <button onClick={() => handleCriteriaCsvImport('junior')} className="py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black">{t('少年部', 'Junior')}</button>
                        <button onClick={() => handleCriteriaCsvImport('general')} className="py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black">{t('一般部', 'General')}</button>
                      </div>
                    </div>
                  )}

                  {/* 支部追加＋手動追加支部チップ */}
                  {isMaster && (
                    <div>
                      <button onClick={handleAddBranch}
                        className="w-full py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black">
                        {t('＋ 支部を追加', '＋ Add Branch')}
                      </button>
                      {removableBranches.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {removableBranches.map(b => (
                            <button key={b} onClick={() => handleRemoveCustomBranch(b)}
                              title={t('クリックで削除（所属生徒がいると削除不可）', 'Click to remove (locked if members exist)')}
                              className="text-[10px] bg-white/10 hover:bg-red-500/40 px-2 py-0.5 rounded font-black">
                              {b} ✕
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 危険操作 */}
                  {canDeleteAll && (
                    <div>
                      <p className="text-[10px] font-black uppercase opacity-50 mb-1 px-0.5 text-red-200">{t('危険操作', 'Danger Zone')}</p>
                      <div className="grid grid-cols-2 gap-1">
                        <button onClick={async () => {
                          const first = window.prompt('生徒データを全削除します。確認のため「削除」と入力してください。');
                          if (first !== '削除') return;
                          if (!window.confirm('本当に全ての生徒・評価・昇級履歴を削除しますか？この操作は取り消せません。')) return;
                          const { error } = await supabase.from('profiles').delete().eq('is_admin', false);
                          if (error) { alert('削除失敗: ' + error.message); return; }
                          setSelectedStudentId(null);
                          loadStudents();
                          alert('生徒データを全削除しました。');
                        }} className="py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded text-[10px] font-black text-red-300 border border-red-500/20">
                          {t('生徒 全削除', 'Delete all members')}
                        </button>
                        <button onClick={async () => {
                          if (!window.confirm('審査基準データを全削除してよろしいですか？\n（再インポート前にご利用ください）')) return;
                          await supabase.from('criteria').delete().neq('id', 0);
                          alert('削除完了。CSVを再インポートしてください。');
                        }} className="py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded text-[10px] font-black text-red-300 border border-red-500/20">
                          {t('審査 全削除', 'Delete all criteria')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('検索...  ( / でフォーカス )', 'Search...  ( / to focus )')}
                className="w-full bg-white/10 border-none rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-white/40 outline-none focus:bg-white focus:text-[#001f3f] focus:placeholder-gray-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-xs">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs font-black bg-white/10 hover:bg-white/20 rounded px-1.5 py-0.5"
                  title={t('クリア', 'Clear')}>✕</button>
              )}
            </div>
            {/* クイックフィルタピル */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-0.5">
              {([
                { k: 'all'        as QuickFilter, label: t('すべて', 'All'),         icon: '◉', desc: t('在籍中の全会員を表示', 'Show all active members') },
                { k: 'attending'  as QuickFilter, label: t('出席中', 'Attending'),   icon: '✓', desc: t('在籍中（active）の会員', 'Members with active status') },
                { k: 'candidate'  as QuickFilter, label: t('受験準備', 'Candidates'), icon: '★', desc: t('「準◯級」＝次の審査に向けた準備段階の会員', 'Members at a "準" grade, preparing for the next exam') },
                { k: 'uninvited'  as QuickFilter, label: t('未招待', 'Uninvited'),   icon: '🔓', desc: t('ログイン用メール未登録（アプリに招待していない会員）', 'No login email yet (not invited to the app)') },
              ]).map(p => {
                const active = quickFilter === p.k
                return (
                  <button key={p.k} onClick={() => setQuickFilter(p.k)} title={p.desc}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black border transition-colors ${active ? 'bg-orange-500 text-white border-orange-400' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}>
                    <span className="opacity-70 mr-0.5">{p.icon}</span>{p.label}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-1">
              <select
                className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[10px] font-black outline-none disabled:opacity-60"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                disabled={isBranchScoped}
                title={isBranchScoped ? t('自分の支部のみ表示されます', 'Only your own branch is shown') : undefined}
              >
                {isMaster && <option value="すべて" className="text-black">{t('全支部', 'All Branches')}</option>}
                {allBranchList.map(b => <option key={b} value={b} className="text-black">{b}</option>)}
              </select>
              <select className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[10px] font-black outline-none" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="name" className="text-black">{t('名前順', 'By Name')}</option>
                <option value="kyu" className="text-black">{t('級順', 'By Grade')}</option>
              </select>
            </div>

            {/* 集計・CSV・監査ログ ボタン群 */}
            <div className="grid grid-cols-3 gap-1">
              <button onClick={() => setShowAnalytics(true)}
                className="py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black"
                title={t('帯別・支部別など集計', 'Belt / branch breakdown')}>
                📊 {t('集計', 'Stats')}
              </button>
              <button onClick={handleCsvExport}
                className="py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black"
                title={t('現在の絞り込み結果をCSV', 'Export current filter to CSV')}>
                ⬇ CSV
              </button>
              {isMaster ? (
                <button onClick={() => setShowAuditLog(true)}
                  className="py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black"
                  title={t('監査ログ閲覧', 'Audit log')}>
                  📜 {t('ログ', 'Audit')}
                </button>
              ) : (
                <div /> // grid balancing
              )}
            </div>

            {isMaster && (
              <label className="flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded-lg text-[10px] font-black cursor-pointer select-none">
                <input type="checkbox" checked={includeStaff} onChange={(e) => setIncludeStaff(e.target.checked)}
                  className="accent-orange-500" />
                <span className="opacity-80">{t('スタッフ（支部長・指導員）も表示', 'Include staff (chiefs/instructors)')}</span>
              </label>
            )}

            {/* 退会・休会者チップ（件数とトグル合体 / 0件なら非表示） */}
            {inactiveCount > 0 && (
              <button
                onClick={() => setIncludeInactive(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-black border transition-colors ${includeInactive ? 'bg-orange-500/20 border-orange-400/40 text-orange-200' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}>
                <span>{includeInactive
                  ? t(`退会・休会も表示中 (${inactiveCount}名)`, `Showing paused/resigned (${inactiveCount})`)
                  : t(`退会・休会を非表示 (${inactiveCount}名)`, `Hidden paused/resigned (${inactiveCount})`)}</span>
                <span>{includeInactive ? '✓' : '+'}</span>
              </button>
            )}
            {attendingIds.size > 0 && (
              <div className="mt-1 p-2 bg-emerald-500/15 border border-emerald-400/30 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-emerald-300">
                    {t(`出席中: ${attendingIds.size}名`, `Attending: ${attendingIds.size}`)}
                  </span>
                  <button onClick={clearAttending} className="text-[10px] font-black text-emerald-200 hover:text-white underline">
                    {t('クリア', 'Clear')}
                  </button>
                </div>
                {/* スマホ専用: 評価画面へ遷移（サイドバーを閉じる） */}
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="md:hidden w-full py-2 bg-emerald-500 hover:bg-emerald-600 rounded-md text-[10px] font-black text-white uppercase tracking-wider">
                  ▶ {t('評価画面へ', 'Start Evaluation')}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {studentsLoading ? (
            <StudentListSkeleton count={8} />
          ) : filteredStudents.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-5xl mb-3 opacity-30">🔍</p>
              <p className="text-xs font-black text-gray-400">
                {searchQuery || quickFilter !== 'all'
                  ? t('該当する会員がいません', 'No members matched')
                  : t('会員データなし', 'No member data')}
              </p>
              {(searchQuery || quickFilter !== 'all') && (
                <button onClick={() => { setSearchQuery(''); setQuickFilter('all') }}
                  className="mt-3 text-[10px] font-black text-orange-500 hover:text-orange-600 underline">
                  {t('フィルタをクリア', 'Clear filters')}
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredStudents.map(s => {
                const sRole = resolveRole(s);
                const isStaff = sRole !== 'student';
                const unmigrated = needsIppanMigration(s);
                const status = (s.status as MemberStatus | undefined) || 'active';
                const isInactive = status !== 'active';
                const isAttending = attendingIds.has(s.id);
                const isSelected = selectedStudentId === s.id;
                const belt = getBeltForProfile(s);
                const bc = BELT_COLORS[belt] || BELT_COLORS['白帯'];
                return (
                  <div key={s.id}
                    onClick={() => selectStudent(s.id)}
                    className={`px-4 py-3 border-l-4 cursor-pointer transition-all ${isSelected ? 'bg-orange-50 border-orange-500' : isAttending ? 'bg-emerald-50/60 border-emerald-400' : 'border-transparent hover:bg-gray-50'} ${isInactive ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      {/* 出席チェック（クリックはカード選択に伝播させない） */}
                      <label
                        onClick={e => e.stopPropagation()}
                        className="flex items-center justify-center w-5 h-5 rounded-md cursor-pointer bg-white border border-gray-200 hover:border-emerald-400 shrink-0"
                        title={t('今日の出席にチェック', 'Mark attending today')}>
                        <input
                          type="checkbox"
                          checked={isAttending}
                          onChange={() => toggleAttending(s.id)}
                          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                        />
                      </label>
                      {/* アバター（帯色のリング装飾） */}
                      <div className="relative shrink-0">
                        <Avatar name={s.name} size={36} />
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: bc.bg }} title={belt} />
                      </div>
                      {/* 名前・級 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap leading-tight">
                          <p className="font-black text-sm truncate max-w-[14ch]">{s.name}</p>
                          {isStaff && (
                            <span className="text-[9px] bg-[#001f3f] text-white px-1 py-px rounded font-black uppercase tracking-wider">{getRoleLabel(sRole)}</span>
                          )}
                          {unmigrated && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-1 py-px rounded font-black" title={t('一般未移行', 'Pending migration')}>⚠</span>
                          )}
                          {status === 'paused' && (
                            <span className="text-[9px] bg-gray-200 text-gray-700 px-1 py-px rounded font-black">{t('休会', 'Paused')}</span>
                          )}
                          {status === 'resigned' && (
                            <span className="text-[9px] bg-red-100 text-red-700 px-1 py-px rounded font-black">{t('退会', 'Resigned')}</span>
                          )}
                          {!s.login_email && (
                            <span className="text-[9px] bg-orange-100 text-orange-700 border border-orange-300 px-1 py-px rounded font-black" title={t('ログイン用メール未設定', 'No login email')}>📧</span>
                          )}
                          {s.login_email && !s.user_id && (
                            <span className="text-[9px] bg-sky-100 text-sky-700 border border-sky-300 px-1 py-px rounded font-black" title={t('未招待', 'Not invited')}>🔓</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] font-bold text-orange-500 uppercase">{normalizeKyu(s.kyu)}</p>
                          {s.branch && (
                            <p className="text-[10px] font-bold text-gray-400 truncate">· {s.branch}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {attendingStudents.length > 0 ? (
          <div className="max-w-2xl mx-auto">
            {/* 並列モードのスティッキー・ヘッダー＆タブ */}
            <div className="sticky top-0 z-20 -mx-4 md:-mx-10 px-4 md:px-10 pt-2 pb-3 bg-[#f8f9fa]/95 backdrop-blur-sm border-b border-gray-200 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
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
                  {canCertifyKyu(adminRole) && attendingStudents.length >= 1 && (
                    <button
                      onClick={handlePrepareBulkPromotion}
                      disabled={bulkPromoting}
                      title={t('出席者を一括で評価し、合格者だけ昇級確定', 'Bulk-evaluate attending; only promote those who pass')}
                      className="ml-2 text-[10px] font-black bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                      {bulkPromoting ? t('計算中...', 'Calc...') : t('▶ 一括昇級', '▶ Bulk Promote')}
                    </button>
                  )}
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
                          className="text-[10px] font-black px-1.5 py-0.5 rounded"
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
          <div className="max-w-2xl mx-auto pt-8 md:pt-16">
            {/* ヒーロー */}
            <div className="text-center mb-8">
              <h2 className="font-black text-3xl md:text-4xl italic tracking-tighter uppercase text-[#001f3f] opacity-90 mb-2">SEIKUKAI</h2>
              <p className="text-xs font-bold text-gray-400">{t('左の一覧から会員を選択するか、複数選択して並列評価', 'Pick a member on the left, or check multiple for parallel evaluation')}</p>
            </div>

            {/* 最近見た会員 */}
            {recentStudents.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 px-1">
                  ⏱ {t('最近見た会員', 'Recently viewed')}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {recentStudents.map(s => {
                    const belt = getBeltForProfile(s)
                    const bc = BELT_COLORS[belt] || BELT_COLORS['白帯']
                    return (
                      <button key={s.id} onClick={() => selectStudent(s.id)}
                        className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all text-left flex items-center gap-3">
                        <div className="relative">
                          <Avatar name={s.name} size={40} />
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ backgroundColor: bc.bg }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-[#001f3f] truncate">{s.name}</p>
                          <p className="text-[10px] font-bold text-orange-500">{normalizeKyu(s.kyu)}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ショートカットヘルプ */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  ⌨ {t('キーボードショートカット', 'Keyboard shortcuts')}
                </p>
                <button onClick={() => setShowShortcuts(true)} className="text-[10px] font-black text-orange-500 hover:underline">
                  {t('全て', 'All')} →
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { k: '/', desc: t('検索にフォーカス', 'Focus search') },
                  { k: 'j / k', desc: t('次の/前の会員', 'Next / prev member') },
                  { k: 'a', desc: t('出席トグル', 'Toggle attending') },
                  { k: 'Esc', desc: t('選択解除', 'Deselect') },
                ].map(s => (
                  <div key={s.k} className="flex items-center gap-2">
                    <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-black text-[#001f3f] min-w-[2.5rem] text-center">{s.k}</kbd>
                    <span className="text-[11px] font-bold text-gray-600">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
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

      {/* 自分のアカウント設定（パスワード・メール変更） */}
      {showAccountSettings && (
        <AccountSettingsModal
          profile={adminProfile}
          variant="admin"
          onClose={() => setShowAccountSettings(false)}
        />
      )}

      {/* 集計ダッシュボード */}
      {showAnalytics && (
        <AnalyticsModal
          students={allStudentsRaw}
          isMaster={isMaster}
          adminBranch={isBranchScoped ? adminBranch : null}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {/* 監査ログ閲覧（マスター限定） */}
      {showAuditLog && isMaster && (
        <AuditLogModal onClose={() => setShowAuditLog(false)} />
      )}

      {/* 一括昇級確認モーダル */}
      {bulkPromotionPreview && (
        <BulkPromotionModal
          preview={bulkPromotionPreview}
          adminProfile={adminProfile}
          onClose={() => setBulkPromotionPreview(null)}
          onDone={() => {
            setBulkPromotionPreview(null)
            loadStudents()
            toast.success(t('一括昇級を実行しました', 'Bulk promotion done'))
          }}
        />
      )}

      {/* モバイル用 出席→評価開始 FAB（出席1人以上 & サイドバー閉時のみ） */}
      {attendingIds.size > 0 && !isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-full shadow-2xl font-black text-xs flex items-center gap-2"
          aria-label={t('評価画面へ', 'Start Evaluation')}>
          ▶ {t(`評価へ ${attendingIds.size}名`, `Eval ${attendingIds.size}`)}
        </button>
      )}

      {/* ショートカットヘルプモーダル ( ? キーで開閉 ) */}
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  )
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const items: { keys: string[]; desc: string; group: string }[] = [
    { group: t('ナビゲーション', 'Navigation'), keys: ['/'],   desc: t('検索ボックスにフォーカス', 'Focus search box') },
    { group: t('ナビゲーション', 'Navigation'), keys: ['j'],   desc: t('次の会員を選択', 'Next member') },
    { group: t('ナビゲーション', 'Navigation'), keys: ['k'],   desc: t('前の会員を選択', 'Previous member') },
    { group: t('ナビゲーション', 'Navigation'), keys: ['Esc'], desc: t('選択を解除 / 検索フィールドを抜ける', 'Deselect / blur search') },
    { group: t('操作', 'Actions'),              keys: ['a'],   desc: t('選択中の会員の出席をトグル', 'Toggle attendance for selected') },
    { group: t('操作', 'Actions'),              keys: ['?'],   desc: t('このヘルプを表示', 'Show this help') },
  ]
  const groups = Array.from(new Set(items.map(i => i.group)))
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-black text-[#001f3f]">⌨ {t('キーボードショートカット', 'Keyboard Shortcuts')}</h3>
          <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black hover:bg-gray-200">✕</button>
        </div>
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g}>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">{g}</p>
              <div className="space-y-1.5">
                {items.filter(i => i.group === g).map(i => (
                  <div key={i.keys.join('+') + i.desc} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-xl">
                    <span className="text-xs font-bold text-[#001f3f]">{i.desc}</span>
                    <div className="flex gap-1 shrink-0">
                      {i.keys.map(k => (
                        <kbd key={k} className="px-2 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-black text-[#001f3f]">{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 font-bold mt-5 text-center">
          {t('入力欄にフォーカス中はショートカットは無効になります', 'Shortcuts are disabled while typing in input fields')}
        </p>
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
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">名前 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">ログイン用メール <span className="text-red-500">*</span></label>
            <input type="email" value={form.login_email} onChange={e => setForm({ ...form, login_email: e.target.value })}
              placeholder="example@seikukai.jp"
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">初期級</label>
              <select value={form.kyu} onChange={e => setForm({ ...form, kyu: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]">
                {KYU_OPTIONS.filter(k => k !== '').map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
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
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">生年月日</label>
              <input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">入会日</label>
              <input type="date" value={form.joined_at} onChange={e => setForm({ ...form, joined_at: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">学年</label>
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
  const [tempPasswordModal, setTempPasswordModal] = useState<{
    studentName: string;
    studentEmail: string;
    tempPassword: string;
    createdNewAuth?: boolean;
  } | null>(null);

  const handlePasswordReset = async () => {
    if (!student.login_email) {
      alert('この会員にはログイン用メールアドレスが登録されていません。');
      return;
    }
    if (student.id === adminProfile.id) {
      alert('自分自身のパスワードは「アカウント設定」から変更してください。');
      return;
    }
    if (!confirm(
      `${student.name} さんの一時パスワードを生成します。\n` +
      `生成されたパスワードを画面で確認し、直接ご本人にお伝えください。\n` +
      `（メールは送信されません・管理者のセッションには影響しません）\n\n` +
      `続行しますか？`
    )) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-member-password', {
        body: { studentProfileId: student.id },
      });
      if (error || !data?.tempPassword) {
        const msg = data?.error || error?.message || '不明なエラー';
        alert('パスワード設定に失敗しました: ' + msg);
        return;
      }
      setTempPasswordModal({
        studentName: data.studentName || student.name,
        studentEmail: data.studentEmail || student.login_email,
        tempPassword: data.tempPassword,
        createdNewAuth: data.createdNewAuth || false,
      });
    } catch (e: any) {
      alert('通信エラー: ' + (e?.message ?? String(e)));
    } finally {
      setResetting(false);
    }
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
    // 影響の大きい変更（権限変更・退会/休会化）は誤操作防止のため確認する
    const prevRole = resolveRole(student);
    if (canAssignRole && form.role !== prevRole) {
      if (!window.confirm(`${student.name} さんの権限を「${getRoleLabel(prevRole)}」→「${getRoleLabel(form.role)}」に変更します。よろしいですか？`)) return;
    }
    if (form.status && form.status !== (student.status || 'active') && form.status !== 'active') {
      const label = MEMBER_STATUS_LABEL[form.status as MemberStatus] || form.status;
      if (!window.confirm(`${student.name} さんを「${label}」にします。一覧の既定表示から外れます。よろしいですか？`)) return;
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
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">名前</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
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
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
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
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">生年月日</label>
              <input
                type="date"
                value={form.birthday}
                onChange={e => setForm({ ...form, birthday: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">入会日</label>
              <input
                type="date"
                value={form.joined_at}
                onChange={e => setForm({ ...form, joined_at: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">学年</label>
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
              <p className="text-[10px] text-amber-700 font-bold mt-0.5 leading-snug">
                高校進学済でも少年部ランク（少年緑帯・茶帯・黒帯）を保持する場合にチェック。<br />
                一般審査合格時にOFFにすると、年齢ベースで一般ランクへ自動切替されます。
              </p>
            </div>
          </label>

          {/* 会員ステータス */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
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
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
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
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
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
        {!isSelf && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">アカウント操作</label>
            <button
              onClick={handlePasswordReset}
              disabled={resetting || !student.login_email}
              className="w-full py-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-2xl text-xs font-black hover:bg-orange-100 disabled:opacity-50"
            >
              {resetting ? '生成中...' : '🔑 一時パスワードを生成して画面に表示'}
            </button>
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed font-bold">
              ・メールは送信されません<br/>
              ・画面に表示された一時パスワードを直接ご本人にお伝えください<br/>
              ・管理者のセッションには一切影響しません（安全）
            </p>
          </div>
        )}
        {isSelf && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 font-bold">※ 自分自身のパスワードは「アカウント設定」から変更してください。</p>
          </div>
        )}

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-2xl text-sm font-black text-gray-500 hover:bg-gray-200">キャンセル</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-[#001f3f] text-white rounded-2xl text-sm font-black disabled:opacity-50">
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
      {/* 一時パスワード表示モーダル */}
      {tempPasswordModal && (
        <TempPasswordModal
          studentName={tempPasswordModal.studentName}
          studentEmail={tempPasswordModal.studentEmail}
          tempPassword={tempPasswordModal.tempPassword}
          createdNewAuth={tempPasswordModal.createdNewAuth}
          onClose={() => setTempPasswordModal(null)}
        />
      )}
    </div>
  );
}

// --- 一時パスワード表示モーダル ---
function TempPasswordModal({ studentName, studentEmail, tempPassword, createdNewAuth, onClose }: {
  studentName: string;
  studentEmail: string;
  tempPassword: string;
  createdNewAuth?: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック
      const ta = document.createElement('textarea');
      ta.value = tempPassword;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-[40px] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-2xl">✓</div>
            <h3 className="text-lg font-black text-[#001f3f]">一時パスワード生成完了</h3>
          </div>
        </div>
        <div className="bg-gray-50 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">対象会員</p>
          <p className="text-sm font-bold text-[#001f3f]">{studentName}</p>
          <p className="text-xs text-gray-500">{studentEmail}</p>
        </div>
        {createdNewAuth && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 mb-4">
            <p className="text-[10px] text-yellow-800 font-bold leading-relaxed">
              ✨ この会員は初回のため、Authアカウントを新規作成しました。<br/>
              　 このパスワードを伝えれば、すぐにログインできます。
            </p>
          </div>
        )}
        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-orange-700 uppercase mb-2">一時パスワード</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white px-4 py-3 rounded-xl font-mono text-lg font-bold text-[#001f3f] tracking-wider border border-orange-200">
              {tempPassword}
            </code>
            <button
              onClick={copyToClipboard}
              className="px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black text-xs whitespace-nowrap"
            >
              {copied ? '✓ コピー済' : 'コピー'}
            </button>
          </div>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4 mb-6 space-y-2">
          <p className="text-xs font-black text-blue-900">📋 次のステップ:</p>
          <ol className="text-xs text-blue-800 list-decimal list-inside space-y-1 font-bold">
            <li>このパスワードを<span className="text-red-600">対面・電話・LINE等で直接</span>ご本人にお伝えください</li>
            <li>ご本人は次回ログインで一時パスワードを使ってください</li>
            <li>ログイン後「アカウント設定」から自分のパスワードに変更するよう案内してください</li>
          </ol>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-[10px] text-red-700 font-bold leading-relaxed">
            ⚠️ このパスワードは画面を閉じると再表示できません。今すぐコピーまたはメモしてください。
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 bg-[#001f3f] text-white rounded-2xl text-sm font-black hover:bg-[#003366]"
        >
          確認して閉じる
        </button>
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
  const toast = useToast();
  const adminRole = resolveRole(adminProfile);
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([])
  const [currentGradeEvals, setCurrentGradeEvals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(initialStudent);
  const [recentPromotion, setRecentPromotion] = useState<any | null>(null);
  const [reversing, setReversing] = useState(false);
  // 採点リストの絞り込み: すべて / 未採点のみ / 必須のみ（道場で素早く対象を絞る）
  const [scoreFilter, setScoreFilter] = useState<'all' | 'unscored' | 'required'>('all');

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
      // 評価行が無い項目は null（未採点）。暗黙の 'D' にしない＝「採点済D」と「未採点」を区別できる
      setCriteria(filtered.map((c: any) => ({ ...c, grade: evals?.find((e: any) => e.criterion_id === c.id)?.grade || null })));
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
      setCurrentGradeEvals(filtered.map((c: any) => ({ ...c, grade: evals?.find((e: any) => e.criterion_id === c.id)?.grade || null })));
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
  // 必須科目(is_required=true)は A または B で合格。ひとつでもC/Dなら昇級不可。
  const unmetRequired = useMemo(
    () => currentGradeEvals.filter((c: any) =>
      c.is_required && c.grade !== 'A' && c.grade !== 'B'
    ),
    [currentGradeEvals]
  );
  const allRequiredPassed = unmetRequired.length === 0;
  const hasEvals = currentGradeEvals.length > 0;

  // 3段階レディネス:
  //   practicing (0-59点)      → まだ練習段階
  //   canApply   (60-79点)     → 審査申込み可・合格ボーダー
  //   confidentPass (80+点)    → 合格圏
  //   いずれも必須科目A/Bクリアが前提（未達ならすべて false 扱い）
  const canApply = hasEvals && currentGradeScore >= APPLY_SCORE && allRequiredPassed;
  const confidentPass = hasEvals && currentGradeScore >= PASS_SCORE && allRequiredPassed;
  // 従来の isEligible = 昇級確定ボタンを押せる条件。60点以上＋必須クリアで押せる（ボーダーも押下可）
  const isEligible = canApply;

  // 採点フィルタ適用後の表示対象
  const visibleCriteria = useMemo(() => criteria.filter((c: any) => {
    if (scoreFilter === 'unscored') return !c.grade;        // 未採点(null)のみ
    if (scoreFilter === 'required') return c.is_required;   // 必須のみ
    return true;
  }), [criteria, scoreFilter]);

  const unscoredCount = useMemo(() => criteria.filter((c: any) => !c.grade).length, [criteria]);
  const requiredCount = useMemo(() => criteria.filter((c: any) => c.is_required).length, [criteria]);

  const groupedCriteria: [string, any[]][] = useMemo(() => {
    const groups: Record<string, any[]> = {};
    visibleCriteria.forEach((c: any) => {
      const key = c.examination_type || 'その他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups);
  }, [visibleCriteria]);

  // ローカル状態（criteria / currentGradeEvals）に grade を反映する共通処理
  const applyGradeLocal = (id: number, g: string | null) => {
    setCriteria((prev: any[]) => prev.map((item: any) => item.id === id ? { ...item, grade: g } : item));
    if (viewGrade === currentKyu) {
      setCurrentGradeEvals((prev: any[]) => prev.map((item: any) => item.id === id ? { ...item, grade: g } : item));
    }
  };

  // DBへ grade を保存（null=評価行を削除して未採点に戻す）
  const persistGrade = async (id: number, g: string | null) => {
    if (g === null) {
      await supabase.from('evaluations').delete().eq('student_id', student.id).eq('criterion_id', id);
    } else {
      await supabase.from('evaluations').upsert(
        { student_id: student.id, criterion_id: id, grade: g },
        { onConflict: 'student_id,criterion_id' }
      );
    }
  };

  // 単項目の採点（誤タップ救済のため Undo トースト付き）
  const scoreOne = (c: any, g: string) => {
    const prev = c.grade ?? null;
    if (prev === g) return;
    applyGradeLocal(c.id, g);
    persistGrade(c.id, g);
    toast.push(
      `${c.examination_content?.slice(0, 14) || '項目'} → ${g}`,
      'success', 4000,
      { label: t('元に戻す', 'Undo'), onClick: () => { applyGradeLocal(c.id, prev); persistGrade(c.id, prev); } }
    );
  };

  // 一括: 未採点(null)の項目だけ B で埋める（既存の A/C/D は壊さない・非破壊）
  const bulkFillUnscoredB = async () => {
    const targets = criteria.filter((c: any) => !c.grade);
    if (targets.length === 0) { toast.info(t('未採点の項目はありません', 'No unscored items')); return; }
    const snapshot = targets.map((c: any) => c.id);
    targets.forEach((c: any) => applyGradeLocal(c.id, 'B'));
    await supabase.from('evaluations').upsert(
      targets.map((c: any) => ({ student_id: student.id, criterion_id: c.id, grade: 'B' })),
      { onConflict: 'student_id,criterion_id' }
    );
    toast.push(
      t(`未採点 ${targets.length} 件を B にしました`, `Filled ${targets.length} unscored items with B`),
      'success', 6000,
      { label: t('元に戻す', 'Undo'), onClick: async () => {
        snapshot.forEach((id) => applyGradeLocal(id, null));
        await supabase.from('evaluations').delete().eq('student_id', student.id).in('criterion_id', snapshot);
      } }
    );
  };

  // 一括: この級の評価をすべてクリア（確認あり）
  const bulkClearGrades = async () => {
    const scored = criteria.filter((c: any) => c.grade);
    if (scored.length === 0) { toast.info(t('クリアする評価がありません', 'Nothing to clear')); return; }
    if (!window.confirm(t(`この級の評価 ${scored.length} 件をすべてクリアします。よろしいですか？`, `Clear all ${scored.length} evaluations for this grade?`))) return;
    const backup = scored.map((c: any) => ({ id: c.id, grade: c.grade }));
    scored.forEach((c: any) => applyGradeLocal(c.id, null));
    await supabase.from('evaluations').delete().eq('student_id', student.id).in('criterion_id', backup.map(b => b.id));
    toast.push(
      t(`${scored.length} 件をクリアしました`, `Cleared ${scored.length} items`),
      'warn', 7000,
      { label: t('元に戻す', 'Undo'), onClick: async () => {
        backup.forEach((b) => applyGradeLocal(b.id, b.grade));
        await supabase.from('evaluations').upsert(
          backup.map((b) => ({ student_id: student.id, criterion_id: b.id, grade: b.grade })),
          { onConflict: 'student_id,criterion_id' }
        );
      } }
    );
  };

  const handlePromote = async (step: number = 1) => {
    if (!isEligible) {
      const reasons: string[] = [];
      if (currentGradeScore < APPLY_SCORE) {
        reasons.push(`・審査可ライン（${APPLY_SCORE}点）に達していません。現在：${currentGradeScore}点 / ${currentGradeMax}点`);
      }
      if (!allRequiredPassed) {
        const names = unmetRequired
          .map((c: any) => `${c.examination_type} / ${c.examination_content}`)
          .join('\n    - ');
        reasons.push(`・必須科目でA/B未達のものがあります（${unmetRequired.length}件）：\n    - ${names}`);
      }
      alert(`昇級できません。\n\n${reasons.join('\n\n')}`);
      return;
    }
    // 60-79点のボーダーゾーンは昇級可能だが念押し確認
    if (!confidentPass) {
      const ok = window.confirm(
        `合格ボーダー（${currentGradeScore}点／合格確実は${PASS_SCORE}点以上）での昇級です。\n` +
        `審査会での実技評価を踏まえた判断ですか？\n\n続行すると昇級が確定します。`
      );
      if (!ok) return;
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
    const prevKyu = student.kyu;
    setStudent(updated);
    onRefresh();
    setShowEdit(false);
    // 級を誤選択したときのワンタップ取り消し（昇級と同様の安全網）
    if (updated.kyu !== prevKyu) {
      const undo = async () => {
        const { error } = await supabase.from('profiles')
          .update({ kyu: prevKyu }).eq('id', updated.id);
        if (error) { toast.error(t('取り消しに失敗しました: ', 'Undo failed: ') + error.message); return; }
        logAudit({
          actorEmail: adminProfile.login_email,
          action: 'undo_kyu_edit',
          targetId: updated.id,
          targetTable: 'profiles',
          before: { kyu: updated.kyu },
          after: { kyu: prevKyu },
        });
        setStudent({ ...updated, kyu: prevKyu });
        onRefresh();
        toast.success(t(`級を ${prevKyu || '無級'} に戻しました`, `Reverted to ${prevKyu || '無級'}`));
      };
      toast.push(
        t(`級を ${updated.kyu || '無級'} に変更しました`, `Grade changed to ${updated.kyu || '無級'}`),
        'success', 8000, { label: t('元に戻す', 'Undo'), onClick: undo }
      );
    }
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
          {/* 名前行（アバター付き） */}
          <div className="flex justify-between items-start mb-4 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={student.name} size={48} />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-40 mb-0.5">Student</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-black tracking-tight truncate">{student.name}</h2>
                  {needsIppanMigration(student) && (
                    <span className="text-[10px] font-black px-2 py-1 rounded"
                      style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}
                      title={t('高校進学済・一般ランクへ未移行', 'High school or above, pending migration to General')}>
                      ⚠ {t('一般未移行', 'Pending General')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setShowPreview(true)}
              className="text-[10px] font-black border rounded-full px-3 py-1.5 uppercase opacity-50 shrink-0"
              style={{ borderColor: 'rgba(0,0,0,0.2)', color: currentBeltColor.text }}>
              Preview
            </button>
          </div>

          {/* スコア + リング + バッジ */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div>
              <div className="flex gap-2 mb-2">
                <span className="text-[10px] font-black px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>{currentBelt}</span>
                <span className="text-[10px] font-black px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>{currentKyu}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-black leading-none"
                  style={{ color: confidentPass ? '#4ade80' : canApply ? '#fbbf24' : currentBeltColor.text }}>
                  {currentGradeScore}
                </span>
                <span className="text-sm font-black opacity-25">/ {currentGradeMax || '—'}</span>
              </div>
            </div>
            {/* ProgressRing: しきい値マーカー + 必須未達色変化 */}
            {currentGradeMax > 0 && (
              <div className="shrink-0">
                <ProgressRing
                  value={currentGradeScore}
                  max={currentGradeMax}
                  size={84}
                  strokeWidth={7}
                  applyAt={APPLY_SCORE}
                  passAt={PASS_SCORE}
                  unmetRequired={!allRequiredPassed}
                  textColor={currentBeltColor.text}
                  label={confidentPass ? t('合格圏', 'PASS') : canApply ? t('審査可', 'APPLY') : ''}
                />
              </div>
            )}
          </div>

          {/* 必須未達ブロック: 80点到達後も必須がC/Dなら昇級不可なので、何が足りないか明示 */}
          {currentGradeEvals.length > 0 && !allRequiredPassed && (
            <div className="mb-3 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(0,0,0,0.22)' }}>
              <p className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">★ 必須未達 ({unmetRequired.length}件)</p>
              <div className="space-y-0.5">
                {unmetRequired.slice(0, 3).map((c: any) => (
                  <p key={c.id} className="text-[10px] font-bold leading-snug opacity-90">
                    <span className="opacity-60">{c.examination_type}</span> — {c.examination_content}
                    <span className="ml-1.5 text-[10px] opacity-60">({c.grade})</span>
                  </p>
                ))}
                {unmetRequired.length > 3 && (
                  <p className="text-[10px] font-black opacity-50">…ほか {unmetRequired.length - 3} 件</p>
                )}
              </div>
            </div>
          )}

          {/* プログレスバー: 60=審査可, 80=合格圏 の二段マーカー */}
          <div className="mb-4">
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: confidentPass ? '#4ade80' : canApply ? '#fbbf24' : 'rgba(255,255,255,0.55)'
                }} />
              {currentGradeMax > 0 && (
                <>
                  {/* 60点マーカー（審査可ライン） */}
                  <div className="absolute top-0 h-full w-px" style={{ left: `${Math.min((APPLY_SCORE / currentGradeMax) * 100, 100)}%`, backgroundColor: '#fbbf24', opacity: 0.6 }} />
                  {/* 80点マーカー（合格ライン） */}
                  <div className="absolute top-0 h-full w-px" style={{ left: `${Math.min((PASS_SCORE / currentGradeMax) * 100, 100)}%`, backgroundColor: '#4ade80', opacity: 0.7 }} />
                </>
              )}
            </div>
            <div className="relative h-4 mt-1">
              <span className="absolute left-0 text-[9px] font-black opacity-35">0</span>
              {currentGradeMax > 0 && (
                <>
                  <span className="absolute text-[9px] font-black text-amber-300 opacity-80 -translate-x-1/2"
                    style={{ left: `${Math.min((APPLY_SCORE / currentGradeMax) * 100, 100)}%` }}>
                    審査可 {APPLY_SCORE}
                  </span>
                  <span className="absolute text-[9px] font-black text-green-400 opacity-80 -translate-x-1/2"
                    style={{ left: `${Math.min((PASS_SCORE / currentGradeMax) * 100, 100)}%` }}>
                    合格 {PASS_SCORE}
                  </span>
                </>
              )}
              <span className="absolute right-0 text-[9px] font-black opacity-35">{currentGradeMax > 0 ? currentGradeMax : ''}</span>
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
            <p className="text-center text-[10px] font-black uppercase tracking-widest opacity-25">採点モード</p>
          )}

          {/* 昇級Undo（直近24時間以内） */}
          {recentPromotion && canEdit && (
            <div className="mt-2 p-2 rounded-xl border border-white/30 bg-white/10 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black opacity-60 uppercase tracking-wider">直近の昇級</p>
                <p className="text-[10px] font-black truncate">
                  {recentPromotion.from_kyu} → {recentPromotion.to_kyu}
                  <span className="opacity-60 ml-1 font-normal">
                    ({new Date(recentPromotion.promoted_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                  </span>
                </p>
              </div>
              <button onClick={handleReversePromotion} disabled={reversing}
                className="shrink-0 text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-50">
                {reversing ? '取消中...' : '取消'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== ナビゲーション（帯 + 級） ===== */}
      <div className="bg-white rounded-[22px] p-4 shadow-sm border border-gray-100 mb-4">
        {/* 帯タブ */}
        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-2">Belt</p>
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
                  ? <span className="text-[10px]">🔒</span>
                  : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isSelected ? bc.text : bc.bg, opacity: isSelected ? 0.5 : 1 }} />
                }
                {isCurrent && !isLocked ? `▶ ${belt}` : belt}
              </button>
            );
          })}
        </div>

        {/* 級サブタブ */}
        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-2">Grade</p>
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

      {/* ===== 必須未達フローティングバッジ（採点中に常時可視化） ===== */}
      {viewGrade === currentKyu && currentGradeEvals.length > 0 && unmetRequired.length > 0 && canScore(adminRole) && (
        <div className="sticky top-2 z-30 mb-2">
          <button
            onClick={() => {
              const first = unmetRequired[0]
              const el = document.getElementById(`criterion-${first.id}`)
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                el.classList.add('ring-2', 'ring-red-400')
                setTimeout(() => el.classList.remove('ring-2', 'ring-red-400'), 1800)
              }
            }}
            className="w-full bg-red-50 border-2 border-red-300 rounded-2xl px-4 py-3 shadow-md flex items-center justify-between text-left hover:bg-red-100 transition-colors">
            <div>
              <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">{t('★ 必須未達', '★ Required Unmet')}</p>
              <p className="text-xs font-black text-red-700">
                {t(`${unmetRequired.length}件あります — タップで未達項目へ`, `${unmetRequired.length} items — tap to jump`)}
              </p>
            </div>
            <span className="text-2xl font-black text-red-500">→</span>
          </button>
        </div>
      )}

      {/* ===== 採点コントロールバー（フィルタ＋一括採点） ===== */}
      {!loading && criteria.length > 0 && canScore(adminRole) && (
        <div className="bg-white rounded-[18px] p-2.5 shadow-sm border border-gray-50 mb-3 space-y-2">
          <div className="flex gap-1">
            {([
              { k: 'all'      as const, label: t('すべて', 'All'),      n: criteria.length },
              { k: 'unscored' as const, label: t('未採点', 'Unscored'), n: unscoredCount },
              { k: 'required' as const, label: t('必須', 'Required'),   n: requiredCount },
            ]).map(f => {
              const on = scoreFilter === f.k
              return (
                <button key={f.k} onClick={() => setScoreFilter(f.k)}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-colors ${on ? 'bg-[#001f3f] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {f.label} <span className={on ? 'opacity-70' : 'opacity-50'}>{f.n}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-1">
            <button onClick={bulkFillUnscoredB}
              title={t('未採点の項目だけBで埋める（A/C/Dは変更しない）', 'Fill only unscored items with B (keeps A/C/D)')}
              className="flex-1 py-2 rounded-xl text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors">
              {t('未採点を一括B', 'Fill blanks: B')}
            </button>
            <button onClick={bulkClearGrades}
              title={t('この級の評価をすべて消す', 'Clear all evaluations for this grade')}
              className="flex-1 py-2 rounded-xl text-[11px] font-black bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 transition-colors">
              {t('全クリア', 'Clear all')}
            </button>
          </div>
        </div>
      )}

      {/* ===== 審査基準リスト ===== */}
      {loading ? (
        <CriteriaListSkeleton count={4} />
      ) : criteria.length === 0 ? (
        <div className="bg-white rounded-[22px] p-10 text-center border-2 border-dashed border-gray-100">
          <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest">審査基準データなし</p>
          <p className="text-[10px] text-gray-200 mt-1">CSVをインポートしてください</p>
        </div>
      ) : groupedCriteria.length === 0 ? (
        <div className="bg-white rounded-[22px] p-8 text-center border-2 border-dashed border-gray-100">
          <p className="text-[11px] font-black text-gray-300">
            {scoreFilter === 'unscored'
              ? t('未採点の項目はありません（すべて採点済み）', 'No unscored items — all done')
              : t('該当する項目がありません', 'No matching items')}
          </p>
          <button onClick={() => setScoreFilter('all')} className="mt-2 text-[11px] font-black text-[#001f3f] underline">
            {t('すべて表示', 'Show all')}
          </button>
        </div>
      ) : (
        <div>
          {groupedCriteria.map(([type, items]) => (
            <div key={type} className="mb-5">
              {/* カテゴリヘッダー */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[10px] font-black text-white px-3 py-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: vbc.bg }}>{type}</span>
                <div className="flex-1 h-px" style={{ backgroundColor: vbc.bg, opacity: 0.12 }} />
                <span className="text-[10px] font-black text-gray-300 flex-shrink-0">{items.length}項目</span>
              </div>
              {/* カード群 */}
              <div className="space-y-2">
                {items.map((c: any) => (
                  <div key={c.id} id={`criterion-${c.id}`} className="bg-white rounded-[18px] p-4 shadow-sm border border-gray-50 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 pr-2">
                        <p className="text-[13px] font-bold text-gray-800 leading-snug">{c.examination_content}</p>
                        {c.is_required && (
                          <span className="inline-block mt-1.5 text-[10px] font-black text-white px-2 py-0.5 rounded-md"
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
                          <button key={g} onClick={() => scoreOne(c, g)}
                          className="min-h-[48px] py-3 rounded-xl flex flex-col items-center justify-center transition-all active:scale-95"
                          style={c.grade === g
                            ? { backgroundColor: vbc.bg, color: vbc.text }
                            : { backgroundColor: '#f5f5f5', color: '#c0c0c0' }}>
                            <span className="text-[15px] font-black leading-none">{g}</span>
                            <span className="text-[9px] font-bold mt-0.5 opacity-60">{pt}pt</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="py-3 rounded-xl font-black text-center text-xl"
                        style={{ backgroundColor: vbc.light, color: vbc.bg }}>{c.grade || '—'}</div>
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

// ============================================================
// 集計ダッシュボード（帯別在籍数・直近昇級・支部別比較）
// ============================================================
function AnalyticsModal({ students, isMaster, adminBranch, onClose }: {
  students: Profile[]
  isMaster: boolean
  adminBranch: string | null
  onClose: () => void
}) {
  const { t } = useLang()
  const [recentPromotions, setRecentPromotions] = useState<any[]>([])
  const [loadingPromotions, setLoadingPromotions] = useState(true)

  useEffect(() => {
    (async () => {
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - 3)
      let q = supabase.from('promotion_history')
        .select('*, profiles!student_id(name, branch)')
        .gte('promoted_at', cutoff.toISOString())
        .eq('is_reversed', false)
        .order('promoted_at', { ascending: false })
        .limit(100)
      const { data } = await q
      let rows = data || []
      if (adminBranch) {
        rows = rows.filter((r: any) => r.profiles?.branch === adminBranch)
      }
      setRecentPromotions(rows)
      setLoadingPromotions(false)
    })()
  }, [adminBranch])

  // 帯別在籍数
  const byBelt = useMemo(() => {
    const acc: Record<string, number> = {}
    students.forEach(s => {
      if (s.status && s.status !== 'active') return
      const b = getBeltForProfile(s)
      acc[b] = (acc[b] || 0) + 1
    })
    return acc
  }, [students])

  // 支部別在籍数
  const byBranch = useMemo(() => {
    const acc: Record<string, number> = {}
    students.forEach(s => {
      if (s.status && s.status !== 'active') return
      const b = s.branch || t('（未設定）', '(unset)')
      acc[b] = (acc[b] || 0) + 1
    })
    return acc
  }, [students, t])

  // ステータス内訳
  const byStatus = useMemo(() => {
    const acc = { active: 0, paused: 0, resigned: 0 } as Record<MemberStatus, number>
    students.forEach(s => {
      const st = (s.status as MemberStatus) || 'active'
      acc[st] = (acc[st] || 0) + 1
    })
    return acc
  }, [students])

  // 直近の昇級件数（過去3ヶ月）
  const recentPromotionCount = recentPromotions.length

  // 受験可能者の概算（80点以上の必要計算は別途読込が必要なので、帯ごとの「準級」=ボーダー上の生徒数で簡易表現）
  // 上の帯への準級カテゴリ生徒は受験準備フェーズと見なす
  const candidatesByGrade = useMemo(() => {
    const acc: Record<string, number> = {}
    students.forEach(s => {
      if (s.status && s.status !== 'active') return
      const k = normalizeKyu(s.kyu)
      if (k.startsWith('準')) {
        acc[k] = (acc[k] || 0) + 1
      }
    })
    return acc
  }, [students])

  return (
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-[32px] p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-lg font-black text-[#001f3f]">📊 {t('集計ダッシュボード', 'Analytics')}</h3>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">
              {adminBranch ? t(`${adminBranch}支部のみ`, `${adminBranch} branch only`) : t('全支部対象', 'All branches')}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black hover:bg-gray-200">✕</button>
        </div>

        {/* サマリー4カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <SummaryCard label={t('在籍中', 'Active')} value={byStatus.active} color="emerald" />
          <SummaryCard label={t('休会中', 'Paused')} value={byStatus.paused} color="amber" />
          <SummaryCard label={t('退会済', 'Resigned')} value={byStatus.resigned} color="gray" />
          <SummaryCard label={t('直近3ヶ月昇級', 'Promotions 3mo')} value={recentPromotionCount} color="orange" />
        </div>

        {/* 帯別 */}
        <div className="bg-gray-50 rounded-2xl p-4 mb-3">
          <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-3">{t('帯別在籍', 'By Belt')}</p>
          <div className="space-y-2">
            {Object.entries(byBelt).sort((a, b) => b[1] - a[1]).map(([belt, n]) => {
              const bc = BELT_COLORS[belt] || BELT_COLORS['白帯']
              const total = byStatus.active || 1
              const pct = (n / total) * 100
              return (
                <div key={belt} className="flex items-center gap-3">
                  <span className="w-20 text-[10px] font-black" style={{ color: bc.bg }}>{belt}</span>
                  <div className="flex-1 h-3 bg-white rounded-full overflow-hidden border border-gray-100">
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: bc.bg }} />
                  </div>
                  <span className="w-12 text-right text-xs font-black text-[#001f3f]">{n}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 支部別（マスター/全支部表示のとき） */}
        {isMaster && !adminBranch && Object.keys(byBranch).length > 1 && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-3">
            <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-3">{t('支部別在籍', 'By Branch')}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(byBranch).sort((a, b) => b[1] - a[1]).map(([b, n]) => (
                <div key={b} className="bg-white rounded-xl p-3 flex justify-between items-center">
                  <span className="text-xs font-bold text-[#001f3f]">{b}</span>
                  <span className="text-lg font-black text-orange-500">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 受験準備（準級カテゴリの人数） */}
        {Object.keys(candidatesByGrade).length > 0 && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-3">
            <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-3">
              {t('受験準備（準級カテゴリ）', 'Preparing for next exam (sub-grade)')}
            </p>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries(candidatesByGrade).sort((a, b) =>
                allKyuList.indexOf(a[0]) - allKyuList.indexOf(b[0])
              ).map(([k, n]) => (
                <div key={k} className="bg-white rounded-xl p-2 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-[#001f3f]">{k}</span>
                  <span className="text-sm font-black text-orange-500">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 直近昇級リスト */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-3">{t('直近3ヶ月の昇級履歴', 'Promotions — last 3 months')}</p>
          {loadingPromotions ? (
            <p className="text-xs text-gray-400 font-bold">{t('読込中...', 'Loading...')}</p>
          ) : recentPromotions.length === 0 ? (
            <p className="text-xs text-gray-400 font-bold">{t('該当する昇級はありません', 'No promotions in this period')}</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {recentPromotions.map((p: any) => (
                <div key={p.id} className="bg-white rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-[#001f3f] truncate">{p.profiles?.name || '—'}
                      <span className="ml-2 text-[10px] text-gray-400 font-bold">{p.profiles?.branch}</span>
                    </p>
                  </div>
                  <p className="text-[11px] font-black text-orange-500 mx-2 whitespace-nowrap">
                    {p.from_kyu} → {p.to_kyu}
                  </p>
                  <p className="text-[10px] text-gray-400 font-bold whitespace-nowrap">
                    {new Date(p.promoted_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: 'emerald' | 'amber' | 'gray' | 'orange' }) {
  const palette = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    gray:    'bg-gray-50 text-gray-700 border-gray-200',
    orange:  'bg-orange-50 text-orange-700 border-orange-200',
  }[color]
  return (
    <div className={`rounded-2xl border p-3 ${palette}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</p>
      <p className="text-3xl font-black leading-none mt-1">{value}</p>
    </div>
  )
}

// ============================================================
// 監査ログ閲覧（マスター限定）
// ============================================================
function AuditLogModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState<string>('all')

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) {
        console.warn('[audit_log] load:', error.message)
        setRows([])
      } else {
        setRows(data || [])
      }
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => filterAction === 'all' ? rows : rows.filter(r => r.action === filterAction), [rows, filterAction])
  const actions = useMemo(() => Array.from(new Set(rows.map(r => r.action))).sort(), [rows])

  return (
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-[32px] p-6 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-black text-[#001f3f]">📜 {t('監査ログ', 'Audit Log')}</h3>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">{t(`最大300件`, `Last 300 entries`)}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black hover:bg-gray-200">✕</button>
        </div>

        <div className="mb-3">
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="w-full md:w-auto border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none">
            <option value="all">{t('全アクション', 'All actions')}</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50 rounded-2xl p-2">
          {loading ? (
            <p className="text-center text-xs text-gray-400 font-bold py-10">{t('読込中...', 'Loading...')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-gray-400 font-bold py-10">{t('ログなし', 'No entries')}</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(r => (
                <details key={r.id} className="bg-white rounded-lg border border-gray-100 group">
                  <summary className="px-3 py-2 cursor-pointer flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-[#001f3f]">
                        <span className="text-orange-500">{r.action}</span>
                        <span className="ml-2 text-[10px] text-gray-400 font-bold">{r.actor_email || '—'}</span>
                      </p>
                      {r.note && <p className="text-[10px] text-gray-500 font-bold truncate">{r.note}</p>}
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </summary>
                  {(r.before_data || r.after_data) && (
                    <div className="px-3 pb-3 pt-1 text-[10px] font-mono text-gray-600 space-y-1 border-t border-gray-50">
                      {r.before_data && <div><span className="text-red-500 font-bold">before:</span> <span className="break-all">{r.before_data}</span></div>}
                      {r.after_data && <div><span className="text-green-600 font-bold">after:</span> <span className="break-all">{r.after_data}</span></div>}
                      {r.target_id && <div><span className="text-gray-400 font-bold">target:</span> {r.target_table}/{r.target_id}</div>}
                    </div>
                  )}
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 一括昇級 確認＆実行モーダル
// ============================================================
function BulkPromotionModal({ preview, adminProfile, onClose, onDone }: {
  preview: BulkPromotionPreview
  adminProfile: Profile
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const [executing, setExecuting] = useState(false)

  const handleExecute = async () => {
    if (preview.eligible.length === 0) return
    setExecuting(true)
    try {
      // 1) admin のSelf ID（promotion_history.promoted_by 用）
      const { data: adminSelf } = await supabase.from('profiles')
        .select('id').eq('login_email', adminProfile.login_email).maybeSingle()

      // 2) 順次実行（ステップごとに失敗があってもログ）
      let ok = 0
      let failed: string[] = []
      for (const e of preview.eligible) {
        const { error: profErr } = await supabase.from('profiles')
          .update({ kyu: e.to }).eq('id', e.student.id)
        if (profErr) { failed.push(`${e.student.name}: ${profErr.message}`); continue }
        await supabase.from('promotion_history').insert({
          student_id: e.student.id,
          from_kyu: e.from,
          to_kyu: e.to,
          promoted_by: adminSelf?.id ?? null,
          score: e.score,
        })
        if (e.student.login_email) {
          await supabase.from('notifications').insert({
            recipient_email: e.student.login_email,
            subject: `【誠空会】昇級おめでとうございます - ${e.to}`,
            body: `${e.student.name} 様\n\nこのたび${e.from}から${e.to}への昇級が確定いたしました。\n日頃の稽古の成果です。今後のさらなる精進をお祈りいたします。\n\n誠空会`,
            type: 'promotion',
          })
        }
        logAudit({
          actorEmail: adminProfile.login_email,
          action: 'promote_bulk',
          targetId: e.student.id,
          targetTable: 'profiles',
          before: { kyu: e.from }, after: { kyu: e.to },
          note: `bulk score=${e.score}`,
        })
        ok++
      }
      if (failed.length > 0) {
        toast.warn(t(`${ok}件成功 / ${failed.length}件失敗\n${failed.slice(0,3).join('\n')}`,
                     `${ok} succeeded / ${failed.length} failed\n${failed.slice(0,3).join('\n')}`))
      } else {
        toast.success(t(`${ok}件 一括昇級を完了しました`, `${ok} bulk promotions complete`))
      }
      onDone()
    } catch (e: any) {
      toast.error(t('一括昇級エラー: ', 'Bulk promotion error: ') + (e?.message ?? String(e)))
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[170] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-[32px] p-6 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-black text-[#001f3f]">▶ {t('一括昇級プレビュー', 'Bulk Promotion Preview')}</h3>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">
              {t(`昇級可能 ${preview.eligible.length}名 / 不可 ${preview.ineligible.length}名`,
                 `Eligible ${preview.eligible.length} / Ineligible ${preview.ineligible.length}`)}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black hover:bg-gray-200">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {/* 昇級可能 */}
          {preview.eligible.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">
                ✓ {t('昇級可能', 'Will promote')} ({preview.eligible.length})
              </p>
              <div className="space-y-1.5">
                {preview.eligible.map(e => (
                  <div key={e.student.id} className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-[#001f3f] truncate">{e.student.name}</p>
                      <p className="text-[10px] text-gray-500 font-bold">{e.student.branch || '—'}</p>
                    </div>
                    <p className="text-[11px] font-black text-emerald-700 whitespace-nowrap">
                      {e.from} → {e.to}
                      <span className="ml-2 text-[10px] opacity-60">{e.score}pt</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 不可 */}
          {preview.ineligible.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                — {t('昇級不可（スキップ）', 'Will skip')} ({preview.ineligible.length})
              </p>
              <div className="space-y-1.5">
                {preview.ineligible.map(e => (
                  <div key={e.student.id} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-black text-gray-600 truncate">{e.student.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold">{e.student.branch || '—'}</p>
                    </div>
                    <p className="text-[10px] text-gray-500 font-bold mt-0.5">{e.reasons.join(' / ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-2xl text-sm font-black text-gray-600">
            {t('キャンセル', 'Cancel')}
          </button>
          <button
            onClick={handleExecute}
            disabled={executing || preview.eligible.length === 0}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-black disabled:opacity-40">
            {executing ? t('実行中...', 'Executing...')
              : t(`${preview.eligible.length}名を昇級確定`, `Promote ${preview.eligible.length}`)}
          </button>
        </div>
      </div>
    </div>
  )
}
