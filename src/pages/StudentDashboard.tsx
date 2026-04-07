// ヘッダー部分の抜粋
<div className={`${theme.bg} ${theme.text} px-6 pt-10 pb-16 rounded-b-[50px] shadow-xl relative overflow-hidden`}>
  <div className="relative z-10">
    <div className="flex justify-between items-start mb-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-black tracking-tighter">{profile.name}</h1>
        <span className="bg-black/10 px-3 py-1 rounded-full text-[12px] font-black backdrop-blur-sm border border-white/10">
          {theme.name}
        </span>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setIsSettingsMode(true)} className="flex flex-col items-center gap-1 opacity-70 hover:opacity-100 transition-all">
          <div className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center text-lg">⚙️</div>
          <span className="text-[8px] font-black uppercase">設定</span>
        </button>
        <button onClick={() => supabase.auth.signOut()} className="flex flex-col items-center gap-1 opacity-70 hover:opacity-100 transition-all">
          <div className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center text-lg">🚪</div>
          <span className="text-[8px] font-black uppercase">終了</span>
        </button>
      </div>
    </div>
    <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">
      {profile.kyu || '無級'} 保持
    </p>
  </div>
</div>
