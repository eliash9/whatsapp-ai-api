(() => {
  const $ = (q, el = document) => el.querySelector(q)
  const apiBase = window.location.origin
  async function fetchJSON(url, options){
    const res = await fetch(url, options)
    const ct = res.headers.get('content-type')||''
    const data = ct.includes('application/json') ? await res.json() : await res.text().then(t=>({raw:t}))
    if (!res.ok) throw data
    return data
  }

  let items = []
  let selectedId = null

  $('#toggleTheme')?.addEventListener('click', ()=>{ document.documentElement.classList.toggle('dark'); localStorage.theme = document.documentElement.classList.contains('dark')?'dark':'light' })

  async function loadList(q=''){
    try {
      const url = new URL(`${apiBase}/api/quick-replies`)
      if (q) url.searchParams.set('q', q)
      const res = await fetchJSON(url.toString())
      items = res.data || []
    } catch { items = [] }
    renderList()
  }

  function renderList(){
    const list = $('#qrList'); if (!list) return
    list.innerHTML = ''
    for (const it of items){
      const row = document.createElement('button')
      row.className = 'w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800'
      const prev = (it.text||'').toString().replace(/\s+/g, ' ').slice(0, 120)
      row.innerHTML = `<div class="flex items-center justify-between"><div class="font-medium text-sm truncate">${it.title||'(tanpa judul)'}</div><div class="text-[10px] text-slate-500">${new Date(it.updatedAt||it.createdAt||Date.now()).toLocaleString()}</div></div><div class="text-xs text-slate-500 dark:text-slate-400 truncate">${prev}</div>`
      row.addEventListener('click', ()=> select(it.pkId))
      list.append(row)
    }
  }

  function select(id){
    selectedId = id
    const it = items.find(x => x.pkId === id)
    const t=$('#qrTitle'); const b=$('#qrText'); const g=$('#qrTags')
    if (t) t.value = it?.title || ''
    if (b) b.value = it?.text || ''
    if (g) g.value = it?.tags || ''
    const h=$('#qrHint'); if (h) h.textContent = it ? `Mengedit #${it.pkId}` : 'Buat item baru.'
  }

  async function save(){
    const t=$('#qrTitle'); const b=$('#qrText'); const g=$('#qrTags')
    const title = t && 'value' in t ? t.value.trim() : ''
    const text = b && 'value' in b ? b.value.trim() : ''
    const tags = g && 'value' in g ? g.value.trim() : ''
    if (!title || !text) return
    try {
      if (selectedId){
        await fetchJSON(`${apiBase}/api/quick-replies/${encodeURIComponent(selectedId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, text, tags }) })
      } else {
        await fetchJSON(`${apiBase}/api/quick-replies`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, text, tags }) })
      }
      selectedId = null; if (t) t.value=''; if (b) b.value=''; if (g) g.value=''; await loadList($('#qrSearch')?.value||'')
    } catch {}
  }

  async function remove(){
    if (!selectedId) return
    try { await fetchJSON(`${apiBase}/api/quick-replies/${encodeURIComponent(selectedId)}`, { method:'DELETE' }); selectedId=null; const t=$('#qrTitle'); const b=$('#qrText'); const g=$('#qrTags'); if (t) t.value=''; if (b) b.value=''; if (g) g.value=''; await loadList($('#qrSearch')?.value||'') } catch {}
  }

  $('#qrNew')?.addEventListener('click', ()=>{ selectedId=null; const t=$('#qrTitle'); const b=$('#qrText'); const g=$('#qrTags'); if (t) t.value=''; if (b) b.value=''; if (g) g.value=''; const h=$('#qrHint'); if (h) h.textContent='Buat item baru.' })
  $('#qrSave')?.addEventListener('click', save)
  $('#qrDelete')?.addEventListener('click', remove)
  $('#qrSearch')?.addEventListener('input', (e)=>{ const q = e && e.target && 'value' in e.target ? e.target.value : ''; loadList(q) })
  $('#qrRefresh')?.addEventListener('click', ()=> loadList($('#qrSearch')?.value||''))

  ;(async () => { await loadList('') })()
})()
