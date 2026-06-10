// ============================================================
// 誠空会 DX審査アプリ: 初期パスワード未変更会員 一斉リセット
// ------------------------------------------------------------
// 目的: 配信時の初期PW (Seikukai2026) のまま放置している会員に
//       Supabase Auth リセットリンクメールを一斉送信する。
//
// 認証フロー:
//   1. Authorization: Bearer <admin_jwt> (masterのみ)
//   2. profile.role = 'master' を確認
//   3. dryRun=true なら対象リストだけ返す
//   4. dryRun=false なら notifications テーブルに INSERT
//      → 別途 send-notifications cron が Resend で配信
//
// 入力 (POST JSON):
//   {
//     dryRun: boolean,        // true=リスト返却のみ実行しない
//     targetMode: 'unchanged' | 'list',
//     emails?: string[],      // targetMode='list' のときのみ
//     deadline?: string       // 'YYYY-MM-DD' リセット期限。メール本文に挿入
//   }
//
// 出力:
//   { targets: number, sample: [{email, name, last_login}...], notifications_queued: number }
//
// デプロイ:
//   Supabase Dashboard → Edge Functions → New Function
//   名前: bulk-reset-passwords
//   コードをコピペ → Deploy
//   その後 supabase secrets set (RESEND_API_KEY / FROM_EMAIL は既存)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://seikukai.vercel.app'

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function buildResetEmailBody(name: string, resetLink: string, deadline?: string): string {
  const deadlineMsg = deadline
    ? `\n本リンクは ${deadline} までに必ずクリックし、新しいパスワードを設定してください。\n期限後はログイン不能となり、再発行が必要となります。\n`
    : '\n本リンクをクリックして新しいパスワードを設定してください。\n'

  return `${name} 様

平素より誠空会をご利用いただきありがとうございます。

このたび審査アプリのセキュリティ強化のため、お客様のパスワード再設定をお願いしております。
${deadlineMsg}
▼ パスワード再設定リンク
${resetLink}

------------------------------
※ このメールにお心当たりがない場合はお手数ですが破棄してください。
※ ご不明点は info@seikukai.co.jp までご連絡ください。

誠空会
https://seikukai.co.jp/
`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    // 1. 管理者 JWT 検証
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: '認証ヘッダー不足' }, 401)
    const jwt = authHeader.slice('Bearer '.length)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt)
    if (userErr || !user?.email) return json({ error: '認証エラー' }, 401)

    const { data: callerProfile } = await adminSupabase
      .from('profiles')
      .select('role, name')
      .ilike('login_email', user.email)
      .maybeSingle()
    if (!callerProfile || callerProfile.role !== 'master') {
      return json({ error: 'master 権限が必要です' }, 403)
    }

    // 2. リクエスト body
    const body = await req.json().catch(() => ({}))
    const dryRun: boolean = body.dryRun !== false  // デフォルトdry-run
    const targetMode: string = body.targetMode ?? 'unchanged'
    const explicitEmails: string[] = Array.isArray(body.emails) ? body.emails : []
    const deadline: string | undefined = body.deadline

    // 3. 対象会員リスト構築
    type Target = { email: string; name: string; profileId: string; lastSignIn: string | null }
    const targets: Target[] = []

    // 全 Auth ユーザーをページング取得
    let page = 1
    const perPage = 1000
    const allAuthUsers: Array<{ id: string; email: string | null; created_at: string; updated_at: string; last_sign_in_at: string | null }> = []
    for (let i = 0; i < 20; i++) {
      const { data: pageData, error: listErr } = await adminSupabase.auth.admin.listUsers({ page, perPage })
      if (listErr) return json({ error: 'auth listUsers 失敗: ' + listErr.message }, 500)
      allAuthUsers.push(...pageData.users.map(u => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        updated_at: u.updated_at,
        last_sign_in_at: u.last_sign_in_at,
      })))
      if (pageData.users.length < perPage) break
      page++
    }

    // profiles と join
    const { data: profiles } = await adminSupabase
      .from('profiles')
      .select('id, user_id, login_email, name, role, status')

    const profileByUserId = new Map<string, { id: string; name: string; role: string | null; status: string | null }>()
    for (const p of profiles ?? []) {
      if (p.user_id) profileByUserId.set(p.user_id, { id: p.id, name: p.name, role: p.role, status: p.status })
    }

    for (const u of allAuthUsers) {
      if (!u.email) continue
      const prof = profileByUserId.get(u.id)
      if (!prof) continue
      if (prof.role !== 'student') continue           // 管理者は対象外
      if ((prof.status ?? 'active') !== 'active') continue  // 退会・休会は除外

      let include = false
      if (targetMode === 'list') {
        include = explicitEmails.includes(u.email)
      } else {
        // 'unchanged': updated_at が created_at とほぼ同じ = PW 未変更
        const createdAt = new Date(u.created_at).getTime()
        const updatedAt = new Date(u.updated_at).getTime()
        include = (updatedAt - createdAt) < 5 * 60 * 1000  // 5分以内
      }
      if (include) {
        targets.push({
          email: u.email,
          name: prof.name,
          profileId: prof.id,
          lastSignIn: u.last_sign_in_at,
        })
      }
    }

    // 4. dryRun=true ならここで返却
    if (dryRun) {
      return json({
        dryRun: true,
        targets: targets.length,
        sample: targets.slice(0, 10),
        notifications_queued: 0,
      })
    }

    // 5. 実行: 各人に Auth recovery link を生成して notifications に INSERT
    let queued = 0
    const errors: Array<{ email: string; error: string }> = []
    for (const t of targets) {
      const { data: linkData, error: linkErr } = await adminSupabase.auth.admin.generateLink({
        type: 'recovery',
        email: t.email,
        options: {
          redirectTo: `${APP_URL}/reset-password`,
        },
      })
      if (linkErr || !linkData?.properties?.action_link) {
        errors.push({ email: t.email, error: linkErr?.message ?? 'no link' })
        continue
      }
      const link = linkData.properties.action_link
      const body = buildResetEmailBody(t.name, link, deadline)
      const { error: insErr } = await adminSupabase.from('notifications').insert({
        recipient_email: t.email,
        subject: '【誠空会・審査アプリ】パスワード再設定のお願い',
        body,
        type: 'password_reset',
        status: 'pending',
      })
      if (insErr) {
        errors.push({ email: t.email, error: 'notifications INSERT 失敗: ' + insErr.message })
        continue
      }
      queued++
    }

    return json({
      dryRun: false,
      targets: targets.length,
      notifications_queued: queued,
      errors,
    })
  } catch (e) {
    return json({ error: '内部エラー: ' + ((e as Error).message ?? String(e)) }, 500)
  }
})
