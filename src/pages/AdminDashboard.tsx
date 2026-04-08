function EvaluationPanel({ student, onRefresh, allBranchList }: any) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([]) // 初期値を空にする

  const age = useMemo(() => calculateAge(student.birthday), [student.birthday]);
  const experience = useMemo(() => calculateExperience(student.created_at), [student.created_at]);
  
  const isGeneral = age >= 15;
  const sectionLabel = isGeneral ? "一般部" : "キッズ";
  const sectionColorClass = isGeneral ? "bg-rose-500 text-white" : "bg-sky-400 text-[#001f3f]";

  const currentBelt = useMemo(() => {
    const k = student.kyu || '無級';
    if (k === '無級' || k === '準10級') return '白帯';
    if (k.match(/10|9/)) return '黄帯';
    if (k.match(/8|7/)) return '青帯';
    if (k.match(/6|5/)) return isGeneral ? '紫帯' : '橙帯';
    if (k.match(/4|3/)) return '緑帯';
    if (k.includes('1') || k.includes('2')) return '茶帯';
    return '黒帯';
  }, [student.kyu, isGeneral]);

  const dbBeltName = (currentBelt === '橙帯' || currentBelt === '紫帯') ? '橙帯/紫帯' : currentBelt;
  const [viewBelt, setViewBelt] = useState(dbBeltName);

  useEffect(() => {
    let isMounted = true; // メモリリーク防止用

    async function fetchEvals() {
      // 表示を一旦リセット（重要：これで前の人のデータが消えます）
      setCriteria([]);

      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', viewBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      
      if (isMounted) {
        setCriteria((crit || []).map(c => {
          const existing = evals?.find(e => e.criterion_id === c.id);
          return { ...c, grade: existing ? existing.grade : 'D' };
        }));
      }
    }
    fetchEvals();

    return () => { isMounted = false }; // クリーンアップ
  }, [student.id, viewBelt])

  const totalScore = criteria.length > 0 
    ? criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)
    : 0;

  const isScoreReady = totalScore >= 80

  // ... (handlePromote などの他の関数は変更なし)

  return (
    <div className="max-w-2xl mx-auto pb-20">
      {/* ユーザーヘッダー情報はそのまま表示 */}
      <div className="bg-[#001f3f] rounded-[40px] p-6 md:p-8 text-white mb-8 shadow-2xl relative overflow-hidden">
        {/* (中身は同じ) */}
      </div>

      {/* 判定基準リスト */}
      <div className="space-y-4">
        {criteria.length === 0 ? (
          // データ読み込み中の表示を入れると、よりスムーズに見えます
          <div className="text-center py-20 animate-pulse text-gray-300 font-black italic">
            LOADING DATA...
          </div>
        ) : (
          criteria.map(c => (
            <div key={c.id} className="bg-white p-5 md:p-6 rounded-[35px] shadow-sm border border-gray-100 animate-in fade-in duration-300">
               {/* (リストの中身は同じ) */}
            </div>
          ))
        )}
      </div>
      {/* ... */}
    </div>
  )
}
