// 管理者：級の選択肢を制限するロジック
const getSelectableKyu = (currentKyu: string) => {
  const belt = getTargetBelt(currentKyu);
  if (belt === '白帯') return ['無級'];
  if (belt === '黄帯') return ['10級', '準10級', '9級', '準9級'];
  if (belt === '青帯') return ['8級', '準8級', '7級', '準7級'];
  if (belt === '橙帯') return ['6級', '準6級', '5級', '準5級'];
  if (belt === '緑帯') return ['4級', '準4級', '3級', '準3級'];
  if (belt === '茶帯') return ['2級', '準2級', '1級', '準1級'];
  if (belt === '黒帯') return ['初段', '弍段', '参段'];
  return [currentKyu];
};

// 生徒一覧タブ（「評価 ＞」を削除）
function StudentsTab({ onSelect }: { onSelect: (s: Profile) => void }) {
  // ... (省略: load/filterロジック)
  return (
    <div className="p-4 space-y-3">
      {filteredStudents.map(s => (
        <button key={s.id} onClick={() => onSelect(s)} className="w-full bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm active:scale-95 transition-all flex justify-between items-center">
          <div className="text-left">
            <p className="font-black text-[#001f3f] text-lg">{s.name}</p>
            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{s.kyu} | {(s as any).branch || '支部未設定'}</p>
          </div>
          <div className="text-gray-200">▶︎</div>
        </button>
      ))}
    </div>
  )
}

// 評価入力タブ（マスター権限の級変更部分）
{isMaster && (
  <div className="mt-4 pt-4 border-t border-white/10">
    <p className="text-[8px] font-black text-[#ff6600] mb-2 uppercase tracking-widest">Master: 合否・昇級決定</p>
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
        <p className="text-[8px] opacity-40 uppercase">現在の級</p>
        <p className="text-sm font-black">{student.kyu}</p>
      </div>
      <select 
        value={student.kyu}
        onChange={(e) => updateKyu(e.target.value)}
        className="bg-white text-[#001f3f] text-xs font-black p-3 rounded-xl outline-none"
      >
        <option value="">級を確定する</option>
        {getSelectableKyu(student.kyu).map(k => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
    </div>
  </div>
)}
