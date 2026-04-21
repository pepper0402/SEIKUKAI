// ============================================================
// SEIKUKAI 通知送信 Edge Function
// ------------------------------------------------------------
// 目的: notifications テーブルの pending 行を読み取り、Resend API
//       でメール送信し、status を sent/failed に更新する。
//
// デプロイ:
//   1. Supabase CLI をインストール (npm i -g supabase)
//   2. supabase login
//   3. supabase link --project-ref <your-project-ref>
//   4. Resend.com でアカウント作成、API キー取得
//   5. supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL=noreply@seikukai.example
//   6. supabase functions deploy send-notifications
//
// 定期実行: Supabase ダッシュボード → Database → Cron で以下を登録
//   SELECT net.http_post(
//     url := 'https://<project>.supabase.co/functions/v1/send-notifications',
//     headers := jsonb_build_object('Authorization', 'Bearer <service_role_key>')
//   );
// （1-5分毎の cron 推奨）
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@seikukai.example'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function sendViaResend(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      text,
    }),
  })
  if (res.ok) return { ok: true }
  const err = await res.text()
  return { ok: false, error: err.slice(0, 500) }
}

Deno.serve(async () => {
  const { data: queue, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!queue || queue.length === 0) return new Response(JSON.stringify({ processed: 0 }))

  let sent = 0, failed = 0
  for (const n of queue) {
    const result = await sendViaResend(n.recipient_email, n.subject, n.body)
    if (result.ok) {
      await supabase.from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', n.id)
      sent++
    } else {
      await supabase.from('notifications')
        .update({ status: 'failed', error: result.error })
        .eq('id', n.id)
      failed++
    }
  }

  return new Response(JSON.stringify({ processed: queue.length, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
