import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info' | 'warn'

/** トーストに付ける任意のアクション（例:「元に戻す」） */
type ToastAction = { label: string; onClick: () => void }

type Toast = {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}

type ToastContextValue = {
  push: (message: string, kind?: ToastKind, durationMs?: number, action?: ToastAction) => void
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
  warn: (message: string, durationMs?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((message: string, kind: ToastKind = 'info', durationMs = 3500, action?: ToastAction) => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, kind, message, action }])
    // アクション付きトーストは押す余裕を持たせて既定で長め
    const effective = durationMs ?? (action ? 8000 : 3500)
    if (effective > 0) {
      window.setTimeout(() => remove(id), action ? Math.max(effective, 8000) : effective)
    }
  }, [remove])

  const value: ToastContextValue = {
    push,
    success: (m, d) => push(m, 'success', d),
    error: (m, d) => push(m, 'error', d ?? 5000),
    info: (m, d) => push(m, 'info', d),
    warn: (m, d) => push(m, 'warn', d ?? 4500),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-md pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setShow(true), 10)
    return () => window.clearTimeout(id)
  }, [])

  const styleByKind: Record<ToastKind, { bg: string; ring: string; text: string; icon: string }> = {
    success: { bg: 'bg-emerald-600',  ring: 'ring-emerald-300/40', text: 'text-white', icon: '✓' },
    error:   { bg: 'bg-red-600',      ring: 'ring-red-300/40',     text: 'text-white', icon: '✕' },
    info:    { bg: 'bg-[#001f3f]',    ring: 'ring-blue-300/40',    text: 'text-white', icon: 'i' },
    warn:    { bg: 'bg-amber-500',    ring: 'ring-amber-300/40',   text: 'text-white', icon: '!' },
  }
  const s = styleByKind[toast.kind]

  return (
    <div
      onClick={onClose}
      className={`pointer-events-auto cursor-pointer transition-all duration-200 ease-out ring-1 ${s.ring} ${s.bg} ${s.text} shadow-lg rounded-2xl px-4 py-3 flex items-start gap-3 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
      role="status"
    >
      <span className="shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm font-black leading-none">
        {s.icon}
      </span>
      <p className="text-xs font-bold leading-relaxed whitespace-pre-line flex-1">{toast.message}</p>
      {toast.action && (
        <button
          onClick={(e) => { e.stopPropagation(); toast.action!.onClick(); onClose(); }}
          className="shrink-0 bg-white/25 hover:bg-white/40 rounded-full px-3 py-1 text-xs font-black"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100 text-xs font-black" aria-label="close">✕</button>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // ToastProvider 外で呼ばれた場合の安全策（alert にフォールバック）
    return {
      push: (m) => alert(m),
      success: (m) => alert(m),
      error: (m) => alert(m),
      info: (m) => alert(m),
      warn: (m) => alert(m),
    }
  }
  return ctx
}
