import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)

export type Role = 'master' | 'branch' | 'instructor' | 'student'

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
}

export type Criterion = {
  id: number
  dan: string
  examination_type: string
  examination_content: string
  video_url: string | null
  is_required: boolean
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

// A=10 / B=6 / C=3 / D=0  → 10項目満点100点、80点以上合格
export const gradeToPoint = (g: string): number =>
  g === 'A' ? 10 : g === 'B' ? 6 : g === 'C' ? 3 : 0

export const PASS_SCORE = 80

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
