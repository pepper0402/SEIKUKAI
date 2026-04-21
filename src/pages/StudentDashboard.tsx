import { useEffect, useState, useMemo } from 'react'
import { supabase, Profile, normalizeKyu } from '../lib/supabase'

const calculateTrainingPeriod = (joinedDateStr: any) => {
  if (!joinedDateStr) return '未設定';
  const start = new Date(joinedDateStr);
  const diffDays = Math.ceil(Math.abs(new Date().getTime() - start.getTime()) / 86400000);
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years === 0 ? `${months}ヶ月` : `${years}年 ${months}ヶ月`;
};

const calculateAge = (birthdayStr: any) => {
  if (!birthdayStr) return 0;
  const born = new Date(birthdayStr);
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  if (today.getMonth() - born.getMonth() < 0 || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) age--;
  return age;
};

const BELT_COLORS: Record<string, { bg: string; text: string; light: string }> = {
  '白帯': { bg: '#e0e0e0', text: '#1a1a1a', light: '#f5f5f5' },
  '黄帯': { bg: '#d4a800', text: '#1a1a1a', light: '#fef9e0' },
  '青帯': { bg: '#1a4fa0', text: '#ffffff', light: '#dbeafe' },
  '橙帯': { bg: '#c04a00', text: '#ffffff', light: '#ffedd5' },
  '紫帯': { bg: '#6d28d9', text: '#ffffff', light: '#ede9fe' },
  '緑帯': { bg: '#186a18', text: '#ffffff', light: '#dcfce7' },
  '茶帯': { bg: '#5c2a0a', text: '#ffffff', light: '#fef3e2' },
  '黒帯': { bg: '#111111', text: '#ffffff', light: '#e5e5e5' },
};

const getBeltName = (kyu: string, isGeneral: boolean): string => {
  const k = kyu || '無級';
  if (k === '無級' || k.includes('準10級')) return '白帯';
  if (k.includes('10級') || k.includes('9級')) return '黄帯';
  if (k.includes('8級') || k.includes('7級')) return '青帯';
  if (k.includes('6級') || k.includes('5級')) return isGeneral ? '紫帯' : '橙帯';
  if (k.includes('4級') || k.includes('3級')) return '緑帯';
  if (k.includes('2級') || k.includes('1級')) return '茶帯';
  if (k.includes('段')) return '黒帯';
  return '白帯';
};

const gradeToScore = (grade: string | null) => {
  if (grade === 'A') return 10;
  if (grade === 'B') return 6;
  if (grade === 'C') return 3;
  return 0;
};

export default function StudentDashboard({ profile }: { profile: Profile }) {
  const [currentCriteria, setCurrentCriteria] = useState<any[]>([])
  const [historyData, setHistoryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'current' | 'history'>('current')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const currentKyu = useMemo(() => normalizeKyu(profile.kyu), [profile.kyu]);
  const isGeneral = useMemo(() => calculateAge(profile.birthday) >= 15, [profile.birthday]);
  const beltName = useMemo(() => getBeltName(currentKyu, isGeneral), [currentKyu, isGeneral]);
  const bc = BELT_COLORS[beltName] || BELT_COLORS['白帯'];
  const trainingPeriod = useMemo(() => calculateTrainingPeriod((profile as any).joined_at), [profile]);

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const gradeVariants = [currentKyu, '正' + currentKyu];
      const [{ data: criteriaData }, { data: scoresData }] = await Promise.all([
        supabase.from('criteria').select('*').in('dan', gradeVariants).order('id'),
        supabase.from('evaluations').select('*, criteria(*)').eq('student_id', profile.id),
      ]);
      setCurrentCriteria((criteriaData || []).map(c => ({
        ...c,
        grade: scoresData?.find((s: any) => s.criterion_id === c.id)?.grade || null
      })));
      setHistoryData(scoresData || []);
      setLoading(false);
    }
    loadData();
  }, [profile.id, currentKyu]);

  const totalScore = useMemo(() => currentCriteria.reduce((acc, c) => acc + gradeToScore(c.grade), 0), [currentCriteria]);
  const maxScore = currentCriteria.length * 10;
  const isEligible = maxScore > 0 && totalScore >= 80;
  const progressPct = maxScore > 0 ? Math.min((totalScore / maxScore) * 100, 100) : 0;

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
          <button onClick={() => supabase.auth.signOut()}
            className="text-[9px] font-bold px-3 py-2 rounded-xl"
            style={{ backgroundColor: 'rgba(0,0,0,0.12)', color: bc.text }}>
            ログアウト
          </button>
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
                    <p className="text-[9px] font-black text-green-600 leading-none">合格圏内 ✓</p>
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
                <span>0</span><span>合格 80点</span><span>{maxScore > 0 ? `${maxScore}点満点` : ''}</span>
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
                                className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[9px] font-black"
                                style={{ backgroundColor: bc.light, color: bc.bg }}>▶</a>
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
    </div>
  );
}
