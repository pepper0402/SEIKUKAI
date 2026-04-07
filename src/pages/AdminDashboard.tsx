// --- 審査項目CSVのアップロード（改善版） ---
  const handleCriteriaCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // 確認ポップアップ
    if (!window.confirm('現在の審査項目をすべて上書き、または追加しますか？')) return

    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
        
        const updates = lines.slice(1).map(line => {
          const v = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
          // 列の並びが [帯, 種類, 内容, 動画URL] であることを想定
          if (!v[0] || !v[2]) return null 
          return { 
            dan: v[0], 
            examination_type: v[1] || '基本', 
            examination_content: v[2], 
            video_url: v[3] || '' 
          }
        }).filter(Boolean) as any[]

        if (updates.length > 0) {
          // 既存の項目を一旦クリアしたい場合は以下を有効化（注意して使用してください）
          // await supabase.from('criteria').delete().neq('id', 0) 

          const { error } = await supabase.from('criteria').insert(updates)
          if (error) throw error
          alert(`✅ 審査項目を ${updates.length} 件登録しました。管理画面を再読み込みしてください。`)
        }
      } catch (err: any) {
        alert('❌ 審査項目CSVの形式が正しくないか、DBエラーです: ' + err.message)
      } finally {
        setIsUploading(false)
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }
