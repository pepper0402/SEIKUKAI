import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)

export type Profile = {
  id: string
  user_id: string
  login_email: string
  name: string
  dan: string
  kyu: string
  keiko_days: number
  birth_date: string | null
  join_date: string | null
  gakuinen: string
  gohi: string
  is_admin: boolean
}

export type Criterion = {
  id: number
  dan: string
  examination_type: string
  examination_content: string
  video_url: string | null
}

export type Evaluation = {
  id: number
  user_email: string
  criteria_id: number
  hyoka: string
}

export type BeltConfig = {
  id: number
  dan: string
  kyu: string
  kitei_gokaku_su: number
  manten: number
}

export const DAN_OPTIONS = ['', '白帯', '黄帯', '青帯', '緑帯', '橙帯', '茶帯', '黒帯']
export const KYU_OPTIONS = ['', '無級', '準10級', '正10級', '準9級', '正9級', '準8級', '正8級',
  '準7級', '正7級', '準6級', '正6級', '準5級', '正5級', '準4級', '正4級',
  '準3級', '正3級', '準2級', '正2級', '準1級', '正1級', '初段', '弍段', '参段', '四段', '五段']
export const GAKUINEN_OPTIONS = ['', '小学1年生', '小学2年生', '小学3年生', '小学4年生',
  '小学5年生', '小学6年生', '中学1年生', '中学2年生', '中学3年生',
  '高校1年生', '高校2年生', '高校3年生', '社会人']
export const DAN_COLORS: Record<string, { bg: string; text: string }> = {
  '白帯': { bg: '#f0f0f0', text: '#333' },
  '黄帯': { bg: '#FFD700', text: '#333' },
  '青帯': { bg: '#4A90D9', text: '#fff' },
  '緑帯': { bg: '#4CAF50', text: '#fff' },
  '橙帯': { bg: '#FF8C00', text: '#fff' },
  '茶帯': { bg: '#8B4513', text: '#fff' },
  '黒帯': { bg: '#1a1a1a', text: '#fff' },
}

export const calcScore = (evalMap: Record<number, string>) =>
  Object.values(evalMap).reduce((acc, h) =>
    acc + (h === '優' ? 2.5 : h === '良' ? 1.5 : h === '可' ? 0.5 : 0), 0)

export const calcAge = (birthDate: string | null) => {
  if (!birthDate) return '-'
  const born = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  if (today.getMonth() - born.getMonth() < 0 ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) age--
  return String(age)
}
