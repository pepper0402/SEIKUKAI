/** 共通スケルトンローダー。pulse animationでデータ取得中を表現 */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`bg-gray-200/70 rounded-lg animate-pulse ${className}`}
      style={style}
    />
  )
}

/** 採点カードのスケルトン (StudentDashboard / EvaluationPanel 共通) */
export function CriteriaListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-[18px] p-4 border border-gray-50 shadow-sm">
          <div className="flex items-start gap-3 mb-3">
            <Skeleton className="w-10 h-10 rounded-[12px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-10 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 生徒リストのスケルトン (admin sidebar) */
export function StudentListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-y divide-gray-50">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-5 flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
