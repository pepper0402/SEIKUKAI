/**
 * 円形プログレスインジケータ。スコア表示用。
 * - APPLY_SCORE / PASS_SCORE のしきい値に応じて色が自動で変わる
 * - 中央に数値を表示
 */
export default function ProgressRing({
  value,         // 現在値 (0-max)
  max,           // 最大値
  size = 96,
  strokeWidth = 8,
  applyAt,       // 審査可ライン (例: 60)
  passAt,        // 合格ライン (例: 80)
  color,         // 任意で色指定 (帯色など)。なければしきい値ベース
  textColor = '#001f3f',
  label,         // 任意の小ラベル ("pt" など)
  unmetRequired, // 未達必須があれば赤系にオーバーライド
}: {
  value: number
  max: number
  size?: number
  strokeWidth?: number
  applyAt?: number
  passAt?: number
  color?: string
  textColor?: string
  label?: string
  unmetRequired?: boolean
}) {
  const radius = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * radius
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const dashoffset = circ * (1 - pct)

  let stroke: string
  if (color) stroke = color
  else if (unmetRequired) stroke = '#f87171'
  else if (passAt != null && value >= passAt) stroke = '#22c55e'
  else if (applyAt != null && value >= applyAt) stroke = '#f59e0b'
  else stroke = '#94a3b8'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* 背景リング */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        {/* マーカーライン (applyAt) */}
        {applyAt != null && max > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={strokeWidth}
            strokeDasharray={`2 ${circ - 2}`}
            strokeDashoffset={-circ * (applyAt / max)}
            opacity={0.5}
          />
        )}
        {/* 進捗リング */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 700ms ease-out, stroke 250ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="font-black" style={{ color: textColor, fontSize: Math.round(size * 0.32) }}>
          {value}
        </span>
        {label && (
          <span className="font-black opacity-40" style={{ color: textColor, fontSize: Math.round(size * 0.1) }}>
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
