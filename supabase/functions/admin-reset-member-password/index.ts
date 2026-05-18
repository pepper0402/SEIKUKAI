// ============================================================
// 誠空会 DX審査アプリ: 管理者による会員パスワード一時設定
// ------------------------------------------------------------
// 目的: 管理者が会員の Supabase Auth パスワードを一時パスワードに
//       置き換える。クライアント側 `resetPasswordForEmail` を使うと
//       管理者のセッションが上書きされる事故が起きるため、
//       service_role を持つこの Edge Function で安全に処理する。
//
// 認証フロー:
//   1. クライアントは Authorization: Bearer <admin_jwt> を送る
//   2. 関数は JWT を検証し、user の profile.is_admin を確認
//   3. master/branch chief/instructor のいずれかであることを確認
//   4. 対象 student の user_id を取得
//   5. service_role で auth.admin.updateUserById で一時パスワード設定
//   6. 一時パスワードを管理者にレスポンスで返す
//
// 入力 (POST JSON):
//   { studentProfileId: string }
//
// 出力 (200):
//   { tempPassword: string, studentName: string, studentEmail: string }
//
// デプロイ:
//   supabase functions deploy admin-reset-member-password
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// service_role クライアント (DB全操作 + auth.admin)
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function generateTempPassword(length = 12): string {
  // 視認性の高い文字のみ（0/O, 1/l/I などの混乱回避）
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  for (let i = 0; i < length; i++) out += chars[buf[i] % chars.length]
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    // Step 1: 認証ヘッダーから呼び出し管理者を取得
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: '認証ヘッダーが不足しています' }, 401)
    }
    const jwt = authHeader.slice('Bearer '.length)

    // 呼び出し側 JWT を anon クライアントで検証してユーザー情報取得
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt)
    if (userErr || !user?.email) {
      return json({ error: '認証されていません: ' + (userErr?.message ?? 'no user') }, 401)
    }

    // Step 2: 呼び出し側が管理者か確認
    const { data: adminProfile, error: adminErr } = await adminSupabase
      .from('profiles')
      .select('id, name, is_admin, role, branch')
      .ilike('login_email', user.email)
      .eq('is_admin', true)
      .maybeSingle()
    if (adminErr || !adminProfile) {
      return json({ error: '管理者権限がありません' }, 403)
    }

    // Step 3: 対象生徒の取得
    const body = await req.json().catch(() => ({}))
    const studentProfileId = body.studentProfileId
    if (!studentProfileId || typeof studentProfileId !== 'string') {
      return json({ error: 'studentProfileId が必要です' }, 400)
    }

    const { data: student, error: studentErr } = await adminSupabase
      .from('profiles')
      .select('id, name, login_email, user_id, branch, is_admin')
      .eq('id', studentProfileId)
      .maybeSingle()
    if (studentErr || !student) {
      return json({ error: '対象生徒が見つかりません' }, 404)
    }
    if (!student.user_id) {
      return json({ error: 'この会員はまだ Auth ユーザーが紐づいていません' }, 400)
    }
    if (!student.login_email) {
      return json({ error: 'この会員にはログイン用メールが設定されていません' }, 400)
    }

    // Step 4: 支部長は自支部の生徒のみ操作可
    if (adminProfile.role === 'branch' && adminProfile.branch && student.branch !== adminProfile.branch) {
      return json({ error: '他支部の会員のパスワードは変更できません' }, 403)
    }

    // 自分自身への操作は禁止（管理者が自分の Edge Function で自分のパスワードを変えるのは別UIに）
    if (student.user_id === user.id) {
      return json({ error: '自分自身のパスワードは「アカウント設定」から変更してください' }, 400)
    }

    // Step 5: 一時パスワード生成 → auth.admin で設定
    const tempPassword = generateTempPassword(12)
    const { error: updErr } = await adminSupabase.auth.admin.updateUserById(student.user_id, {
      password: tempPassword,
    })
    if (updErr) {
      return json({ error: 'パスワード更新失敗: ' + updErr.message }, 500)
    }

    // 監査ログ（任意・テーブルがあれば）
    // await adminSupabase.from('audit_log').insert({...})

    return json({
      tempPassword,
      studentName: student.name,
      studentEmail: student.login_email,
    }, 200)
  } catch (e) {
    return json({ error: '内部エラー: ' + ((e as Error).message ?? String(e)) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
