import { useEffect, useState, useMemo } from 'react'
import { supabase, Profile, normalizeKyu, isValidVideoUrl, BELT_COLORS, getBeltForProfile, isIppan, needsIppanMigration, APPLY_SCORE, PASS_SCORE } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import AccountSettingsModal from '../components/AccountSettingsModal'
import Avatar from '../components/Avatar'
import ProgressRing from '../components/ProgressRing'
import { CriteriaListSkeleton } from '../components/Skeleton'

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

export default function StudentDashboard({ profile, onReload, familyProfiles, onSwitchProfile, onSwitchToAdmin }: {
  profile: Profile;
  onReload?: () => void;
  familyProfiles?: Profile[];
  onSwitchProfile?: (id: string) => void;
  onSwitchToAdmin?: () => void;
}) {
  const { t } = useLang()
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
      const ippan = isIppan(profile);
      const divisionFilter = ippan ? 'general' : 'junior';
      const filtered = (allCriteria || []).filter((c: any) =>
        normalizeKyu(c.dan) === currentKyu
        && (c.division === 'both' || c.division === divisionFilter || !c.division)
      );
      console.log('[StudentDashboard] currentKyu=', currentKyu, 'ippan=', ippan, 'total criteria=', allCriteria?.length, 'matched=', filtered.length);
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
  const unmetRequired = useMemo(
    () => currentCriteria.filter(c => c.is_required && c.grade !== 'A' && c.grade !== 'B'),
    [currentCriteria]
  );
  const allRequiredPassed = unmetRequired.length === 0;
  const canApply = maxScore > 0 && totalScore >= APPLY_SCORE && allRequiredPassed;
  const confidentPass = maxScore > 0 && totalScore >= PASS_SCORE && allRequiredPassed;
  const isEligible = canApply;  // 互換
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
    <div className="min-h-screen bg-[#f2f2f7] pb-12">
      <div className="px-5 pt-10 pb-20 rounded-b-[36px] shadow-lg" style={{ backgroundColor: bc.bg, color: bc.text }}>
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-white/30 animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-32 bg-white/30 rounded animate-pulse" />
              <div className="h-3 w-20 bg-white/20 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 -mt-10 relative z-20 max-w-md mx-auto">
        <div className="bg-white rounded-[26px] p-5 shadow-xl shadow-gray-200/60 mb-4">
          <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
        <CriteriaListSkeleton count={3} />
      </div>
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
        <div className="relative z-10 max-w-md mx-auto flex justify-between items-start gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Avatar name={profile.name} size={52} />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-40 mb-1">Seikukai Student</p>
              <h1 className="text-2xl font-black tracking-tight leading-none mb-3 truncate">{profile.name}</h1>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: t('帯', 'Belt'),      value: beltName },
                { label: t('級', 'Grade'),     value: currentKyu },
                { label: t('修行歴', 'Years'), value: trainingPeriod },
              ].map(({ label, value }) => (
                <div key={label} className="px-3 py-1.5 rounded-xl" style={{ backgroundColor: 'rgba(0,0,0,0.14)' }}>
                  <p className="text-[9px] font-black uppercase opacity-55 leading-none mb-0.5">{label}</p>
                  <p className="text-[12px] font-black leading-none">{value}</p>
                </div>
              ))}
              {needsIppanMigration(profile) && (
                <div className="px-3 py-1.5 rounded-xl border"
                  style={{ backgroundColor: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }}>
                  <p className="text-[9px] font-black uppercase opacity-70 leading-none mb-0.5">Status</p>
                  <p className="text-[12px] font-black leading-none">⚠ {t('一般未移行', 'Pending General')}</p>
                </div>
              )}
            </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {familyProfiles && familyProfiles.length > 1 && onSwitchProfile && (
              <select
                value={profile.id}
                onChange={e => onSwitchProfile(e.target.value)}
                className="text-[10px] font-bold px-2 py-2 rounded-xl outline-none max-w-[140px]"
                style={{ backgroundColor: 'rgba(0,0,0,0.18)', color: bc.text }}
                title="家族の会員を切替">
                {familyProfiles.map(p => (
                  <option key={p.id} value={p.id} className="text-black">{p.name}</option>
                ))}
              </select>
            )}
            {onSwitchToAdmin && (
              <button onClick={onSwitchToAdmin}
                className="text-[10px] font-bold px-3 py-2 rounded-xl"
                style={{ backgroundColor: 'rgba(0,0,0,0.18)', color: bc.text }}
                title={t('管理画面へ切替', 'Switch to admin panel')}>
                {t('管理画面へ', 'Admin Panel')}
              </button>
            )}
            <button onClick={() => setShowSettings(true)}
              className="text-[10px] font-bold px-3 py-2 rounded-xl flex items-center gap-1 justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.12)', color: bc.text }}
              title={t('パスワード・メール変更', 'Password / Email')}>
              ⚙ {t('設定', 'Settings')}
            </button>
            <button onClick={() => supabase.auth.signOut()}
              className="text-[10px] font-bold px-3 py-2 rounded-xl"
              style={{ backgroundColor: 'rgba(0,0,0,0.12)', color: bc.text }}>
              {t('ログアウト', 'Logout')}
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
                {mode === 'current' ? t('現在の審査', 'Current Exam') : t('過去の評価', 'History')}
              </button>
            ))}
          </div>

          {viewMode === 'current' && (
            <>
              <div className="flex justify-between items-center mb-3 gap-3">
                <div>
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Score</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black leading-none"
                      style={{ color: confidentPass ? '#16a34a' : canApply ? '#d97706' : '#001f3f' }}>{totalScore}</span>
                    <span className="text-xs font-black text-gray-200">/ {maxScore || '—'}</span>
                  </div>
                  {maxScore > 0 && totalScore < APPLY_SCORE && (
                    <p className="text-[10px] font-black text-gray-400 mt-1">
                      {t(`審査可まで あと ${Math.max(0, APPLY_SCORE - totalScore)} 点`, `${Math.max(0, APPLY_SCORE - totalScore)} pt to apply`)}
                    </p>
                  )}
                  {maxScore > 0 && totalScore >= APPLY_SCORE && !allRequiredPassed && (
                    <p className="text-[10px] font-black text-red-500 mt-1">
                      {t(`必須未達 ${unmetRequired.length} 件`, `${unmetRequired.length} required unmet`)}
                    </p>
                  )}
                </div>
                {maxScore > 0 && (
                  <ProgressRing
                    value={totalScore}
                    max={maxScore}
                    size={88}
                    strokeWidth={8}
                    applyAt={APPLY_SCORE}
                    passAt={PASS_SCORE}
                    unmetRequired={!allRequiredPassed && totalScore >= APPLY_SCORE}
                    label={confidentPass ? t('合格圏', 'PASS') : canApply ? t('審査可', 'APPLY') : ''}
                  />
                )}
              </div>
              <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%`, backgroundColor: confidentPass ? '#22c55e' : canApply ? '#f59e0b' : bc.bg }} />
                {maxScore > 0 && (
                  <>
                    <div className="absolute top-0 h-full w-px" style={{ left: `${Math.min((APPLY_SCORE / maxScore) * 100, 100)}%`, backgroundColor: '#f59e0b', opacity: 0.5 }} />
                    <div className="absolute top-0 h-full w-px" style={{ left: `${Math.min((PASS_SCORE / maxScore) * 100, 100)}%`, backgroundColor: '#22c55e', opacity: 0.6 }} />
                  </>
                )}
              </div>
              <div className="relative h-4 text-[9px] font-black text-gray-300">
                <span className="absolute left-0">0</span>
                {maxScore > 0 && (
                  <>
                    <span className="absolute text-amber-600 -translate-x-1/2" style={{ left: `${Math.min((APPLY_SCORE / maxScore) * 100, 100)}%` }}>{t('審査可', 'Apply')} {APPLY_SCORE}</span>
                    <span className="absolute text-green-600 -translate-x-1/2" style={{ left: `${Math.min((PASS_SCORE / maxScore) * 100, 100)}%` }}>{t('合格', 'Pass')} {PASS_SCORE}</span>
                  </>
                )}
                <span className="absolute right-0">{maxScore > 0 ? maxScore : ''}</span>
              </div>
            </>
          )}

          {viewMode === 'history' && (
            <div className="text-center py-1">
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">{t('評価済みアイテム数', 'Evaluated Items')}</p>
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
              <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-50 mb-1">Fight Info</p>
              <p className="text-[15px] font-black leading-none mb-1">{t('試合情報', 'Fight Info')}</p>
              <p className="text-[10px] font-bold opacity-60">{t('FightPort で大会・対戦表を確認', 'Check tournaments & matchups on FightPort')}</p>
            </div>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-black"
              style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>→</div>
          </div>
        </a>

        {/* ===== 現在の審査リスト（アコーディオン） ===== */}
        {viewMode === 'current' && (
          currentCriteria.length === 0 ? (
            <div className="bg-white rounded-[22px] p-10 text-center border-2 border-dashed border-gray-100">
              <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest">{t('審査基準データなし', 'No exam criteria data')}</p>
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
                        <span className="text-[10px] font-black text-white px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: bc.bg }}>{type}</span>
                        <span className="text-[10px] font-black text-gray-300">{doneCount}/{items.length}</span>
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
                                <span className="inline-block mt-1 text-[9px] font-black text-white px-1.5 py-0.5 rounded-sm"
                                  style={{ backgroundColor: bc.bg }}>{t('必須', 'Required')}</span>
                              )}
                            </div>
                            {/* 動画リンク */}
                            {isValidVideoUrl(c.video_url) && (
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
                    <p className="text-[10px] font-black text-orange-500 uppercase leading-none mb-1">{h.criteria?.dan || '—'}</p>
                    <p className="text-[12px] font-bold text-[#001f3f] leading-snug">{h.criteria?.examination_content}</p>
                    <p className="text-[9px] text-gray-300 font-black mt-0.5 uppercase">{new Date(h.updated_at).toLocaleDateString()}</p>
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
