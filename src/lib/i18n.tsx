import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Lang = 'ja' | 'en'

const STORAGE_KEY = 'seikukai.lang'

type LangContextValue = {
  lang: Lang
  setLang: (l: Lang) => void
  /** 日本語・英語を並べて渡し、現在言語に応じた方を返す */
  t: (ja: string, en: string) => string
}

const LangContext = createContext<LangContextValue>({
  lang: 'ja',
  setLang: () => {},
  t: (ja) => ja,
})

export const LangProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'ja' || stored === 'en') return stored
    // ブラウザ言語から推定（ja 以外は en）
    return navigator.language?.startsWith('ja') ? 'ja' : 'en'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const value: LangContextValue = {
    lang,
    setLang: setLangState,
    t: (ja, en) => (lang === 'en' ? en : ja),
  }

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)

/** 言語切替ボタン（コンパクト） */
export const LangToggle = ({ className, style }: { className?: string; style?: React.CSSProperties }) => {
  const { lang, setLang } = useLang()
  return (
    <button
      onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
      className={className}
      style={style}
      title={lang === 'ja' ? 'Switch to English' : '日本語に切替'}
    >
      {lang === 'ja' ? 'EN' : '日本語'}
    </button>
  )
}
