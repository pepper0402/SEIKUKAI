/**
 * 名前からイニシャル + 決定論的カラーのアバターを生成。
 * 同じ名前なら常に同じ色になるので、リスト上で人物を素早く識別できる。
 */
const PALETTE = [
  { bg: '#fef3c7', text: '#92400e' }, // amber
  { bg: '#dbeafe', text: '#1e40af' }, // blue
  { bg: '#fce7f3', text: '#9d174d' }, // pink
  { bg: '#dcfce7', text: '#166534' }, // green
  { bg: '#ede9fe', text: '#5b21b6' }, // violet
  { bg: '#ffedd5', text: '#9a3412' }, // orange
  { bg: '#cffafe', text: '#155e75' }, // cyan
  { bg: '#fae8ff', text: '#86198f' }, // fuchsia
  { bg: '#fee2e2', text: '#991b1b' }, // red
  { bg: '#e0e7ff', text: '#3730a3' }, // indigo
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** 日本語名から「最初の2文字」を取る。英数なら姓名のイニシャル。 */
function getInitials(name: string): string {
  const n = (name || '').trim()
  if (!n) return '？'
  // ASCII（英語名）なら 単語先頭文字を結合
  if (/^[\x00-\x7F]+$/.test(n)) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }
  // 日本語名: 最初の1文字（漢字1文字＝姓の頭）
  return n.slice(0, 1)
}

export default function Avatar({
  name,
  size = 36,
  className = '',
}: {
  name: string
  size?: number
  className?: string
}) {
  const initials = getInitials(name)
  const color = PALETTE[hashStr(name) % PALETTE.length]
  const fontSize = Math.max(10, Math.round(size * 0.42))
  return (
    <div
      className={`shrink-0 rounded-full flex items-center justify-center font-black select-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color.bg,
        color: color.text,
        fontSize,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}
