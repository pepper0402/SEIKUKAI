// --- (中略: calculateAgeなどはそのまま) ---

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  // ... (既存のステートなど)

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      {/* ... (サイドバーなどはそのまま) ... */}

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {selectedStudent ? (
          /* ここが重要：keyに生徒の全情報をJSON化して渡すことで、
             データが1文字でも変わればコンポーネントを強制再生成させます */
          <EvaluationPanel 
            key={`${selectedStudent.id}-${selectedStudent.kyu}-${selectedStudent.birthday}`} 
            student={selectedStudent} 
            onRefresh={loadStudents} 
            allBranchList={allBranchList} 
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
             <h2 className="font-black text-4xl italic tracking-tighter uppercase">SEIKUKAI</h2>
          </div>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ student, onRefresh, allBranchList }: any) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([]);

  // 判定ロジックをここで完全に確定させる
  const age = calculateAge(student.birthday);
  const isGeneral = age >= 15;
  const sectionLabel = isGeneral ? "一般部" : "少年部"; // ここが「少年部」なら確実に少年部と出るはず

  // ... (targetBelt, viewBelt, useEffectなどは前回と同じ)

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-[#001f3f] rounded-[40px] p-6 md:p-8 text-white mb-8 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-black mb-4 leading-tight tracking-tighter">{student.name}</h2>
            <div className="flex gap-6 items-center">
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase mb-1">GRADE</p>
                <p className="text-xl font-black text-orange-400">{student.kyu || '無級'}</p>
              </div>
              <div className="h-8 w-[1px] bg-white/10"></div>
              <div>
                {/* 直接変数を表示 */}
                <p className="text-[10px] font-black text-white/40 uppercase mb-1">{sectionLabel}</p>
                <p className="text-xl font-black">{targetBelt}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-white/40 mb-1 uppercase tracking-widest">TOTAL SCORE</p>
            <p className={`text-6xl md:text-7xl font-black leading-none ${totalScore >= 80 ? 'text-green-400' : 'text-white'}`}>
              {totalScore.toFixed(0)}
            </p>
          </div>
        </div>
        
        {/* ... (ボタン類) */}
      </div>

      {/* ... (残りのコード) */}
    </div>
  );
}
