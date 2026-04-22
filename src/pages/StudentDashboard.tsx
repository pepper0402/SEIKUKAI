import { useEffect, useState, useMemo } from 'react'
import { supabase, Profile, normalizeKyu, BELT_COLORS, getBeltForProfile } from '../lib/supabase'

// --- アカウント設定モーダル（パスワード/メール変更） ---
function AccountSettingsModal({ profile, onClose, onEmailChanged }: {
  profile: Profile;
  onClose: () => void;
  onEmailChanged?: () => void;
}) {
  const [tab, setTab] = useState<'password' | 'email'>('password');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      alert('パスワードは8文字以上で設定してください。');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('確認用パスワードが一致しません。');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);
    if (error) {
      alert('パスワード変更に失敗しました: ' + error.message);
      return;
    }
    alert('パスワードを変更しました。次回ログインから新しいパスワードをお使いください。');
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  const handleEmailChange = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      alert('有効なメールアドレスを入力してください。');
      return;
    }
    if (trimmed === (profile.login_email || '').toLowerCase()) {
      alert('現在のメールアドレスと同じです。');
      return;
    }
    if (!confirm(
      `新しいメールアドレス「${trimmed}」に確認メールを送信します。\n\n` +
      `届いたメールのリンクをクリックして変更を完了してください。\n` +
      `※hacomonoのご登録メールもあわせて更新をお願いします（支部/本部まで）。`
    )) return;
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setSubmitting(false);
    if (error) {
      alert('メール変更の送信に失敗しました: ' + error.message);
      return;
    }
    alert(
      `${trimmed} と 現在のアドレス の両方に確認メールを送信しました。\n` +
      `両方のリンクをクリックすると変更が完了します。`
    );
    setNewEmail('');
    onEmailChanged?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-[32px] p-7 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-black text-[#001f3f]">アカウント設定</h3>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black">✕</button>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-2xl mb-5">
          {([
            { k: 'password', label: 'パスワード変更' },
            { k: 'email', label: 'メール変更' },
          ] as const).map(({ k, label }) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${tab === k ? 'bg-white shadow-sm text-[#001f3f]' : 'text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'password' ? (
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">新しいパスワード</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="8文字以上"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">確認のためもう一度入力</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[10px] text-blue-700 font-bold leading-relaxed">
              💡 変更後は自動的に新しいパスワードでログイン状態が続きます。次回ログイン時から新パスワードをお使いください。
            </div>
            <button onClick={handlePasswordChange} disabled={submitting || !newPassword || !confirmPassword}
              className="w-full py-3 bg-[#001f3f] text-white rounded-2xl text-sm font-black disabled:opacity-50">
              {submitting ? '変更中...' : 'パスワードを変更する'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">現在のメールアドレス</label>
              <p className="text-sm font-bold text-gray-600 px-4 py-3 bg-gray-50 rounded-2xl">{profile.login_email || '未設定'}</p>
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">新しいメールアドレス</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="example@example.com"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#001f3f]" />
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-[10px] text-orange-700 font-bold leading-relaxed">
              ⚠️ 新旧両方のメールアドレスに確認メールが届きます。<br />
              両方のリンクをクリックして変更完了となります。<br />
              <span className="opacity-80">※hacomono側のご登録メールも別途、支部/本部にご連絡ください。</span>
            </div>
            <button onClick={handleEmailChange} disabled={submitting || !newEmail}
              className="w-full py-3 bg-[#001f3f] text-white rounded-2xl text-sm font-black disabled:opacity-50">
              {submitting ? '送信中...' : '確認メールを送信する'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const calculateTrainingPeriod = (joinedDateStr: any) => {
  if (!joinedDateStr) return '未設定';
  const start = new Date(joinedDateStr);
  const diffDays = Math.ceil(Math.abs(new Date().getTime() - start.getTime()) / 86400000);
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years === 0 ? `${months}ヶ月` : `${years}年 ${months}ヶ月`;
};

const gradeToScore = (grade: string | null) => {
  if (grade === 'A') return 10;
  if (grade === 'B') return 6;
  if (grade === 'C') return 3;
  return 0;
};

export default function StudentDashboard({ profile, onReload }: { profile: Profile; onReload?: () => void }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [historyData, setHistoryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'current' | 'history'>('current')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [showSettings, setShowSettings] = useState(false)

  const currentKyu = useMemo(() => normalizeKyu(profile.kyu), [profile.kyu]);
  const beltName = useMemo(() => getBeltForProfile(profile), [profile]);
  const bc = BELT_COLORS[beltName] || BELT_COLORS['白帯'];
  const trainingPeriod = useMemo(() => calculateTrainingPeriod((profile as any).joined_at), [profile]);

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const [{ data: allCriteria }, { data: scoresData }] = await Promise.all([
        supabase.from('criteria').select('*').order('id'),
        supabase.from('evaluations').select('*, criteria(*)').eq('student_id', profile.id),
      ]);
      const filtered = (allCriteria || []).filter((c: any) => normalizeKyu(c.dan) === currentKyu);
      console.log('[StudentDashboard] currentKyu=', currentKyu, 'total criteria=', allCriteria?.length, 'matched=', filtered.length, 'sample dan values=', [...new Set((allCriteria || []).map((c: any) => c.dan))]);
      setCurrentCriteria(filtered.map((c: any) => ({
        ...c,
        grade: scoresData?.find((s: any) => s.criterion_id === c.id)?.grade || null
      })));
      setHistoryData(scoresData || []);
      setLoading(false);
    }
    loadData();
  }, [profile.id, currentKyu]);

  const rawScore = useMemo(() => currentCriteria.reduce((acc, c) => acc + gradeToScore(c.grade), 0), [currentCriteria]);
  const rawMax = currentCriteria.length * 10;
  const totalScore = rawMax > 0 ? Math.round((rawScore / rawMax) * 100) : 0;
  const maxScore = currentCriteria.length > 0 ? 100 : 0;
  const isEligible = maxScore > 0 && totalScore >= 80;
  const progressPct = maxScore > 0 ? Math.min(totalScore, 100) : 0;

  const groupedCriteria = useMemo(() => {
    const groups: Record<string, any[]> = {};
    currentCriteria.forEach(c => {
      const key = c.examination_type || 'その他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups);
  }, [currentCriteria]);

  const isExpanded = (key: string) => expandedGroups[key] !== false;
  const toggleGroup = (key: string) =>
    setExpandedGroups(prev => ({ ...prev, [key]: !isExpanded(key) }));

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen" style={{ backgroundColor: bc.bg }}>
      <p className="font-black tracking-widest text-sm animate-pulse" style={{ color: bc.text, opacity: 0.4 }}>LOADING...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f2f2f7] pb-12">

      {/* ===== ヘッダー ===== */}
      <div className="px-5 pt-10 pb-20 rounded-b-[36px] shadow-lg relative overflow-hidden"
        style={{ backgroundColor: bc.bg, color: bc.text }}>
        <div className="absolute top-0 right-0 text-[8rem] font-black italic opacity-[0.07] -mr-4 -mt-4 pointer-events-none select-none leading-none">
          {beltName.slice(0, 1)}
        </div>
        <div className="relative z-10 max-w-md mx-auto flex justify-between items-start">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.25em] opacity-40 mb-1">Seikukai Student</p>
            <h1 className="text-2xl font-black tracking-tight leading-none mb-3">{profile.name}</h1>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: 'Belt', value: beltName },
                { label: 'Grade', value: currentKyu },
                { label: '修行歴', value: trainingPeriod },
              ].map(({ label, value }) => (
                <div key={label} className="px-3 py-1.5 rounded-xl" style={{ backgroundColor: 'rgba(0,0,0,0.14)' }}>
                  <p className="text-[7px] font-black uppercase opacity-55 leading-none mb-0.5">{label}</p>
                  <p className="text-[12px] font-black leading-none">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <button onClick={() => setShowSettings(true)}
              className="text-[9px] font-bold px-3 py-2 rounded-xl flex items-center gap-1 justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.12)', color: bc.text }}
              title="パスワード・メール変更">
              ⚙ 設定
            </button>
            <button onClick={() => supabase.auth.signOut()}
              className="text-[9px] font-bold px-3 py-2 rounded-xl"
              style={{ backgroundColor: 'rgba(0,0,0,0.12)', color: bc.text }}>
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-10 relative z-20 max-w-md mx-auto">

        {/* ===== スコアカード ===== */}
        <div className="bg-white rounded-[26px] p-5 shadow-xl shadow-gray-200/60 mb-4">
          {/* タブ切り替え */}
          <div className="flex bg-gray-100 p-1 rounded-2xl mb-4">
            {(['current', 'history'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${viewMode === mode ? 'bg-white shadow-sm text-[#001f3f]' : 'text-gray-400'}`}>
                {mode === 'current' ? '現在の審査' : '過去の評価'}
              </button>
            ))}
          </div>

          {viewMode === 'current' && (
            <>
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Score</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black leading-none"
                      style={{ color: isEligible ? '#16a34a' : '#001f3f' }}>{totalScore}</span>
                    <span className="text-xs font-black text-gray-200">/ {maxScore || '—'}</span>
                  </div>
                </div>
                {isEligible ? (
                  <div className="px-3 py-2 rounded-xl text-center" style={{ backgroundColor: '#dcfce7', border: '1.5px solid #86efac' }}>
                    <p className="text-[9px] font-black text-green-600 leading-none">受験可 ✓</p>
                  </div>
                ) : maxScore > 0 ? (
                  <div className="text-right">
                    <p className="text-[7px] font-black text-gray-300 uppercase leading-none mb-0.5">あと</p>
                    <p className="text-2xl font-black text-gray-300 leading-none">{Math.max(0, 80 - totalScore)}<span className="text-[9px]">点</span></p>
                  </div>
                ) : null}
              </div>
              <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%`, backgroundColor: isEligible ? '#22c55e' : bc.bg }} />
                {maxScore > 0 && (
                  <div className="absolute top-0 h-full w-px opacity-30 bg-gray-400"
                    style={{ left: `${Math.min((80 / maxScore) * 100, 100)}%` }} />
                )}
              </div>
              <div className="flex justify-between text-[7px] font-black text-gray-300">
                <span>0</span><span>受験可 80点</span><span>{maxScore > 0 ? `${maxScore}点満点` : ''}</span>
              </div>
            </>
          )}

          {viewMode === 'history' && (
            <div className="text-center py-1">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">評価済みアイテム数</p>
              <p className="text-4xl font-black text-[#001f3f]">{historyData.length}
                <span className="text-[10px] font-bold text-gray-200 ml-1">Items</span>
              </p>
            </div>
          )}
        </div>

        {/* ===== 試合情報リンク ===== */}
        <a href="https://fight-port.vercel.app/" target="_blank" rel="noreferrer"
          className="block mb-4 rounded-[22px] p-4 shadow-md overflow-hidden relative transition-transform active:scale-[0.98]"
          style={{ backgroundColor: bc.bg, color: bc.text }}>
          <div className="absolute top-0 right-0 text-[5rem] font-black italic opacity-[0.08] -mr-2 -mt-3 pointer-events-none select-none leading-none">
            VS
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.25em] opacity-50 mb-1">Fight Info</p>
              <p className="text-[15px] font-black leading-none mb-1">試合情報</p>
              <p className="text-[9px] font-bold opacity-60">FightPort で大会・対戦表を確認</p>
            </div>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-black"
              style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>→</div>
          </div>
        </a>

        {/* ===== 現在の審査リスト（アコーディオン） ===== */}
        {viewMode === 'current' && (
          currentCriteria.length === 0 ? (
            <div className="bg-white rounded-[22px] p-10 text-center border-2 border-dashed border-gray-100">
              <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest">審査基準データなし</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedCriteria.map(([type, items]) => {
                const expanded = isExpanded(type);
                const groupScore = items.reduce((acc, c) => acc + gradeToScore(c.grade), 0);
                const doneCount = items.filter(c => c.grade !== null).length;
                return (
                  <div key={type} className="overflow-hidden rounded-[20px] shadow-sm border border-gray-50 bg-white">
                    {/* グループヘッダー */}
                    <button onClick={() => toggleGroup(type)}
                      className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-gray-50/50">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[9px] font-black text-white px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: bc.bg }}>{type}</span>
                        <span className="text-[9px] font-black text-gray-300">{doneCount}/{items.length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black" style={{ color: bc.bg }}>{groupScore}pt</span>
                        <span className="text-[14px] text-gray-300 font-black transition-transform duration-250"
                          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                          ▾
                        </span>
                      </div>
                    </button>

                    {/* アコーディオンコンテンツ */}
                    {expanded && (
                      <div className="border-t border-gray-50">
                        {items.map((c: any, i: number) => (
                          <div key={c.id}
                            className={`flex items-center gap-3 px-4 py-3.5 ${i < items.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            {/* グレードバッジ */}
                            <div className={`shrink-0 w-10 h-10 rounded-[12px] flex items-center justify-center font-black text-[15px] border-2 ${
                              c.grade === 'A' ? 'bg-orange-50 border-orange-400 text-orange-500' :
                              c.grade === 'B' ? 'bg-slate-50 border-slate-500 text-slate-600' :
                              c.grade === 'C' ? 'bg-gray-50 border-gray-300 text-gray-500' :
                              'bg-white border-dashed border-gray-100 text-gray-200'
                            }`}>{c.grade || '—'}</div>
                            {/* テキスト */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-[#001f3f] leading-snug">{c.examination_content}</p>
                              {c.is_required && (
                                <span className="inline-block mt-1 text-[7px] font-black text-white px-1.5 py-0.5 rounded-sm"
                                  style={{ backgroundColor: bc.bg }}>必須</span>
                              )}
                            </div>
                            {/* 動画リンク */}
                            {c.video_url && (
                              <a href={c.video_url} target="_blank" rel="noreferrer"
                                title="指導動画を再生"
                                className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black text-white shadow-md hover:scale-105 transition-transform"
                                style={{ backgroundColor: '#dc2626' }}>▶</a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ===== 過去の評価履歴 ===== */}
        {viewMode === 'history' && (
          historyData.length === 0 ? (
            <div className="bg-white rounded-[22px] p-10 text-center border-2 border-dashed border-gray-100">
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest italic">NO HISTORY DATA</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historyData.map((h: any) => (
                <div key={h.id} className="bg-white rounded-[18px] p-4 shadow-sm border border-gray-50 flex items-center gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-[12px] bg-gray-50 flex items-center justify-center font-black text-base text-gray-700 border-2 border-gray-200">
                    {h.grade}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black text-orange-500 uppercase leading-none mb-1">{h.criteria?.dan || '—'}</p>
                    <p className="text-[12px] font-bold text-[#001f3f] leading-snug">{h.criteria?.examination_content}</p>
                    <p className="text-[7px] text-gray-300 font-black mt-0.5 uppercase">{new Date(h.updated_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {showSettings && (
        <AccountSettingsModal
          profile={profile}
          onClose={() => setShowSettings(false)}
          onEmailChanged={onReload}
        />
      )}
    </div>
  );
}
