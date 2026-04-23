import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)

/**
 * 本番アプリのURL。パスワードリセット等の redirectTo に使用。
 * VITE_APP_URL（環境変数）が設定されていればそれを使用、
 * なければ window.location.origin にフォールバック。
 * 本番・プレビュー・localhost 混在時のリセットリンク誤送を防ぐ。
 */
export const APP_URL = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://seikukai.vercel.app')

export type Role = 'master' | 'branch' | 'instructor' | 'student'

/** 会員籍ステータス */
export type MemberStatus = 'active' | 'paused' | 'resigned'

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active:   '在籍中',
  paused:   '休会中',
  resigned: '退会済',
}

export type Profile = {
  id: string
  user_id: string
  login_email: string
  name: string
  dan: string
  kyu: string
  keiko_days: number
  birthday: string | null
  joined_at: string | null
  gakuinen: string
  is_admin: boolean
  role: Role
  branch: string
  /** 高校進学済だが一般ランクへ未移行の場合 TRUE。少年部ランクを保持し表示も少年部色＋「未移行」バッジ */
  keeps_junior_rank?: boolean
  /** 会員ステータス。default 'active'。退会者を一覧から隠す等に使用 */
  status?: MemberStatus
  /** 保護者のログイン用メール（家族アカウント運用）。親が子profileをこのフィールドで紐付け */
  parent_login_email?: string | null
}

/** 審査基準の分類: 少年部専用 / 一般部専用 / 両方共通 */
export type Division = 'junior' | 'general' | 'both'

export type Criterion = {
  id: number
  dan: string
  examination_type: string
  examination_content: string
  video_url: string | null
  is_required: boolean
  /** 対象区分。'both'なら全員、'junior'は少年部のみ、'general'は一般のみ表示 */
  division: Division
}

export type Evaluation = {
  id: number
  student_id: string
  criterion_id: number
  grade: string
}

export type BeltConfig = {
  id: number
  dan: string
  kyu: string
  kitei_gokaku_su: number
  manten: number
}

export const KYU_OPTIONS = [
  '', '無級',
  '準10級', '10級',
  '準9級',  '9級',
  '準8級',  '8級',
  '準7級',  '7級',
  '準6級',  '6級',
  '準5級',  '5級',
  '準4級',  '4級',
  '準3級',  '3級',
  '準2級',  '2級',
  '準1級',  '1級',
  '初段', '弍段', '参段', '四段', '五段'
]

export const KYU_GRADES = KYU_OPTIONS.filter(k => k && !k.includes('段'))
export const DAN_GRADES  = ['初段', '弍段', '参段', '四段', '五段']

export const GAKUINEN_OPTIONS = [
  '', '小学1年生', '小学2年生', '小学3年生', '小学4年生',
  '小学5年生', '小学6年生', '中学1年生', '中学2年生', '中学3年生',
  '高校1年生', '高校2年生', '高校3年生', '社会人'
]

export const DAN_COLORS: Record<string, { bg: string; text: string }> = {
  '白帯': { bg: '#f0f0f0', text: '#333' },
  '黄帯': { bg: '#FFD700', text: '#333' },
  '青帯': { bg: '#4A90D9', text: '#fff' },
  '緑帯': { bg: '#4CAF50', text: '#fff' },
  '橙帯': { bg: '#FF8C00', text: '#fff' },
  '茶帯': { bg: '#8B4513', text: '#fff' },
  '黒帯': { bg: '#1a1a1a', text: '#fff' },
}

// ==========================================================================
// 帯カラー・帯判定ロジック（age-aware）
// 15歳以上を「一般」とし、6/5級=紫、4/3級=一般緑、2/1級=一般茶、段=一般黒
// 14歳以下を「少年部」とし、6/5級=橙、4/3級=少年緑、2/1級=少年茶、段=少年黒
// ==========================================================================

export type BeltColor = { bg: string; text: string; light: string }

export const BELT_COLORS: Record<string, BeltColor> = {
  '白帯':     { bg: '#e0e0e0', text: '#1a1a1a', light: '#f5f5f5' },
  '黄帯':     { bg: '#d4a800', text: '#1a1a1a', light: '#fef9e0' },
  '青帯':     { bg: '#1a4fa0', text: '#ffffff', light: '#dbeafe' },
  // 6/5級: 少年=橙 / 一般=紫
  '橙帯':     { bg: '#c04a00', text: '#ffffff', light: '#ffedd5' },
  '紫帯':     { bg: '#6d28d9', text: '#ffffff', light: '#ede9fe' },
  // 4/3級: 少年=明るい緑 / 一般=深緑
  '少年緑帯': { bg: '#43a047', text: '#ffffff', light: '#c8e6c9' },
  '一般緑帯': { bg: '#1b5e20', text: '#ffffff', light: '#a5d6a7' },
  // 2/1級: 少年=明るい茶 / 一般=濃茶
  '少年茶帯': { bg: '#8d6e63', text: '#ffffff', light: '#efebe9' },
  '一般茶帯': { bg: '#4e342e', text: '#ffffff', light: '#bcaaa4' },
  // 段: 少年=柔らかい黒（濃灰） / 一般=漆黒
  '少年黒帯': { bg: '#424242', text: '#ffffff', light: '#e0e0e0' },
  '一般黒帯': { bg: '#0a0a0a', text: '#ffffff', light: '#9e9e9e' },
}

// 管理画面ナビ用: 級の範囲でグルーピング（年齢に依らない）
export const BELT_GRADE_MAP: Record<string, string[]> = {
  '白帯':      ['無級'],
  '黄帯':      ['準10級', '10級', '準9級', '9級'],
  '青帯':      ['準8級', '8級', '準7級', '7級'],
  '橙帯/紫帯': ['準6級', '6級', '準5級', '5級'],
  '緑帯':      ['準4級', '4級', '準3級', '3級'],
  '茶帯':      ['準2級', '2級', '準1級', '1級'],
  '黒帯':      ['初段', '弍段', '参段', '四段', '五段'],
}

/** 年齢を計算（誕生日未設定のときは null） */
export const calculateAgeFromBirthday = (birthday: string | null | undefined): number | null => {
  if (!birthday) return null
  const born = new Date(birthday)
  if (isNaN(born.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  const mDiff = today.getMonth() - born.getMonth()
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < born.getDate())) age--
  return age
}

/**
 * 高校生以上（または社会人）を「一般」、小中学生以下を「少年部」とする。
 * 判定優先順: keeps_junior_rank=true → gakuinen（学年）→ birthday から計算した年齢。
 *   - keeps_junior_rank=true: 年齢/学年に関わらず少年部
 *   - gakuinen が「高校〜」または「社会人」なら一般
 *   - gakuinen が「小学/中学〜」なら少年部
 *   - gakuinen 未設定のときは age>=15 を一般の近似とする
 * 誕生日も学年も未設定なら少年部扱い。
 *
 * ※ 単純な年齢カットオフでは「早生まれ/4月生まれで中3のうちに15歳になる子」が
 *   学年的にはまだ少年部なのに一般判定されてしまうため、学年を優先する。
 */
export const isIppan = (profile: Pick<Profile, 'birthday' | 'keeps_junior_rank' | 'gakuinen'> | null | undefined): boolean => {
  if (!profile) return false
  if (profile.keeps_junior_rank === true) return false
  const g = (profile.gakuinen || '').trim()
  if (g) {
    if (g.startsWith('高校') || g === '社会人') return true
    if (g.startsWith('小学') || g.startsWith('中学')) return false
  }
  const age = calculateAgeFromBirthday(profile.birthday)
  return age !== null && age >= 15
}

/**
 * 「本来なら一般ランクへ移行すべきだが、まだ少年部ランクを保持」状態の判定。
 * 高校進学以降（または社会人）かつ keeps_junior_rank=true のとき true → UI に未移行バッジ。
 * gakuinen 未設定時は age>=15 を近似として用いる。
 */
export const needsIppanMigration = (profile: Pick<Profile, 'birthday' | 'keeps_junior_rank' | 'gakuinen'> | null | undefined): boolean => {
  if (!profile) return false
  if (profile.keeps_junior_rank !== true) return false
  const g = (profile.gakuinen || '').trim()
  if (g) {
    if (g.startsWith('小学') || g.startsWith('中学')) return false
    if (g.startsWith('高校') || g === '社会人') return true
  }
  const age = calculateAgeFromBirthday(profile.birthday)
  return age !== null && age >= 15
}

/** プロファイル全体から age/学年-aware な帯名を返す（keeps_junior_rank にも対応） */
export const getBeltForProfile = (profile: Pick<Profile, 'kyu' | 'birthday' | 'keeps_junior_rank' | 'gakuinen'> | null | undefined): string => {
  if (!profile) return '白帯'
  const k = normalizeKyu(profile.kyu)
  const ippan = isIppan(profile)
  if (k === '無級' || k.includes('準10級')) return '白帯'
  if (k.includes('10級') || k.includes('9級')) return '黄帯'
  if (k.includes('8級')  || k.includes('7級')) return '青帯'
  if (k.includes('6級')  || k.includes('5級')) return ippan ? '紫帯' : '橙帯'
  if (k.includes('4級')  || k.includes('3級')) return ippan ? '一般緑帯' : '少年緑帯'
  if (k.includes('2級')  || k.includes('1級')) return ippan ? '一般茶帯' : '少年茶帯'
  if (k.includes('段')) return ippan ? '一般黒帯' : '少年黒帯'
  return '白帯'
}

/** ナビ用の帯カテゴリ（年齢に依らない、級の範囲ベース） */
export const getBeltCategoryForGrade = (kyu: string): string => {
  const k = normalizeKyu(kyu)
  for (const [category, grades] of Object.entries(BELT_GRADE_MAP)) {
    if (grades.includes(k)) return category
  }
  return '白帯'
}

// A=10 / B=6 / C=3 / D=0  → 10項目満点100点、80点以上で受験可（実地審査のエントリー資格）
export const gradeToPoint = (g: string): number =>
  g === 'A' ? 10 : g === 'B' ? 6 : g === 'C' ? 3 : 0

export const ELIGIBLE_SCORE = 80

// 役割ごとの権限
export const canCertifyDan = (role: Role) => role === 'master'
export const canCertifyKyu = (role: Role) => role === 'master' || role === 'branch'
export const canScore      = (role: Role) => role !== 'student'

export const getRoleLabel = (role: Role) => {
  if (role === 'master')     return 'マスター'
  if (role === 'branch')     return '支部長'
  if (role === 'instructor') return '指導員'
  return '会員'
}

/** is_admin を fallback として使い、role カラムが未設定でも動作させる */
export const resolveRole = (profile: Profile): Role => {
  if (profile.role) return profile.role
  return profile.is_admin ? 'master' : 'student'
}

/** video_url がhttp/httpsのURLとして有効か判定。"FALSE"等の誤データを弾く */
export const isValidVideoUrl = (url: string | null | undefined): url is string => {
  if (!url) return false
  const s = String(url).trim()
  return s.startsWith('http://') || s.startsWith('https://')
}

/**
 * 監査ログ記録ヘルパー。actor が target に対して action を実施したことを audit_log に記録。
 * before/after は差分。エラーは silent に console 出力（ログ記録失敗で本処理を止めない）
 */
export const logAudit = async (params: {
  actorEmail: string | null | undefined
  action: string
  targetId?: string | null
  targetTable?: string | null
  before?: any
  after?: any
  note?: string
}): Promise<void> => {
  try {
    await supabase.from('audit_log').insert({
      actor_email: params.actorEmail || null,
      action: params.action,
      target_id: params.targetId || null,
      target_table: params.targetTable || null,
      before_data: params.before ? JSON.stringify(params.before) : null,
      after_data: params.after ? JSON.stringify(params.after) : null,
      note: params.note || null,
    })
  } catch (e) {
    console.warn('[logAudit] failed:', e)
  }
}

/** '正10級' / '10' / '準4' などを '10級' / '準4級' に正規化（段はそのまま） */
export const normalizeKyu = (k: string | null | undefined): string => {
  if (k === null || k === undefined || k === '') return '無級'
  let s = String(k).trim()
  if (!s) return '無級'
  if (s.startsWith('正')) s = s.slice(1)
  if (/^\d+$/.test(s)) s = s + '級'
  else if (/^準\d+$/.test(s)) s = s + '級'
  return s
}

export const calcAge = (birthDate: string | null) => {
  if (!birthDate) return '-'
  const born = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  if (today.getMonth() - born.getMonth() < 0 ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) age--
  return String(age)
}
