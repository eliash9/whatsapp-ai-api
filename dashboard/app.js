(() => {
  const $ = (q, el = document) => el.querySelector(q)
  const $$ = (q, el = document) => Array.from(el.querySelectorAll(q))
  const apiBase = window.location.origin
  async function fetchJSON(url, options){
    const res = await fetch(url, options)
    const ct = res.headers.get('content-type')||''
    const data = ct.includes('application/json') ? await res.json() : await res.text().then(t=>({raw:t}))
    if (!res.ok) throw data
    return data
  }
  const state = {
    devices: [],
    messages: { outbox: [], inbox: [], gagal: [], scheduled: [] },
    activeMsgTab: 'outbox',
    msgPage: { outbox: 0, inbox: 0, gagal: 0, scheduled: 0 },
    messageView: { sessionId: '', direction: 'all', jid: '' },
    templates: [],
    contacts: [],
    campaigns: [],
    logs: [],
    page: 'overview',
  }

  function saveLocal() { localStorage.dashboardState = JSON.stringify(state) }
  function loadLocal() { try { Object.assign(state, JSON.parse(localStorage.dashboardState||'{}')) } catch {} }

  function toast(msg, type='success'){
    const t = document.createElement('div')
    t.className = `px-3 py-2 rounded shadow text-sm ${type==='error'?'bg-red-600 text-white':'bg-emerald-600 text-white'}`
    t.textContent = msg
    $('#toast').append(t)
    setTimeout(()=>t.remove(), 3000)
  }

  function setTheme(){
    const dark = document.documentElement.classList.contains('dark')
    localStorage.theme = dark ? 'dark' : 'light'
  }

  function switchPage(id){
    state.page = id
    $$('[data-page]').forEach(s => s.classList.toggle('hidden', s.getAttribute('data-page') !== id))
    $$('.navlink').forEach(a => a.classList.toggle('bg-slate-100', a.getAttribute('data-nav') === id))
  }

  function fmtDate(d){ const x = new Date(d); return x.toLocaleString() }
  function e164(cc, phone){ let p=(phone||'').replace(/[^0-9]/g,''); if(p.startsWith('0')&&cc){p=cc+p.slice(1)} return p }

  async function refreshDevicesFromAPI(){
    try {
      const sessions = await fetchJSON(`${apiBase}/sessions`)
      const statuses = await Promise.all(
        (sessions||[]).map(async (id) => {
          try { const s = await fetchJSON(`${apiBase}/sessions/${encodeURIComponent(id)}/status`); return [id, s.status] } catch { return [id, 'unknown'] }
        })
      )
      const statusMap = Object.fromEntries(statuses)
      state.devices = (sessions||[]).map(id => ({ id, name: id, status: statusMap[id]==='active'?'Tersambung':statusMap[id]||'disTersambung', phone: '', lastSync: null }))
    } catch {
      state.devices = []
    }
  }

  function seed(){
    if (state.templates.length===0){
      state.templates = [
        { id: 'tpl1', name:'greeting', category:'info', body:'Hello {{name}}, welcome!' },
        { id: 'tpl2', name:'order_update', category:'order', body:'Hi {{name}}, order {{order_id}} is {{status}}' },
      ]
    }
    if (state.logs.length<20){
      for (let i=0;i<20;i++) state.logs.unshift({ ts: Date.now()-i*60_000, text:`Log sistem #${i}` })
    }
  }

  async function updateOverviewCards(){
    try {
      const devices = state.devices || [];
      let sent = 0, failed = 0, queued = 0;
      await Promise.all(devices.map(async (d)=>{
        try {
          const r = await fetchJSON(`${apiBase}/${encodeURIComponent(d.id)}/messages/stats`);
          sent += Number(r.sentToday||0);
          failed += Number(r.failedToday||0);
          queued += Number(r.queueTotal||0);
        } catch {}
      }));
      const sentEl = document.getElementById('cardSent'); if (sentEl) sentEl.textContent = String(sent);
      const failedEl = document.getElementById('cardFailed'); if (failedEl) failedEl.textContent = String(failed);
      const queueEl = document.getElementById('cardQueue'); if (queueEl) queueEl.textContent = String(queued);
    } catch {}
  }

  async function updateOverviewChart(){
    try {
      const devices = state.devices || [];
      const days = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(6-i)); return d.toISOString().slice(0,10) })
      const agg = { sent:{}, delivered:{}, failed:{} };
      days.forEach(k=>{ agg.sent[k]=0; agg.delivered[k]=0; agg.failed[k]=0; })
      await Promise.all(devices.map(async (d)=>{
        try {
          const r = await fetchJSON(`${apiBase}/${encodeURIComponent(d.id)}/messages/stats/7d`)
          const ds = r.days||[]; const s=(r.series?.sent)||[]; const del=(r.series?.delivered)||[]; const f=(r.series?.failed)||[];
          ds.forEach((k,idx)=>{ if(k in agg.sent){ agg.sent[k]+=Number(s[idx]||0); agg.delivered[k]+=Number(del[idx]||0); agg.failed[k]+=Number(f[idx]||0) } })
        } catch {}
      }))
      const labels = days.map(k=>{ const d=new Date(k); return d.toLocaleDateString() })
      const sent = days.map(k=>agg.sent[k]||0)
      const delivered = days.map(k=>agg.delivered[k]||0)
      const failed = days.map(k=>agg.failed[k]||0)
      const ctx = $('#chart7d')
      if (ctx._chart) ctx._chart.destroy()
      ctx._chart = new Chart(ctx, { type:'line', data:{ labels, datasets:[
        { label:'Terkirim', data: sent, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.2)' },
        { label:'Tersampaikan', data: delivered, borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.2)' },
        { label:'Gagal', data: failed, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.2)' },
      ]}, options:{ responsive:true, scales:{ y:{ beginAtZero:true } } } })
    } catch {}
  }

  function renderOverview(){
    $('#cardDevices').textContent = state.devices.filter(d=>d.status==='Tersambung').length
    updateOverviewCards();
    updateOverviewChart();
  }

  function renderDevices(page=0, size=10){
    const start = page*size
    const rows = state.devices.slice(start, start+size)
    const tbody = $('#devicesTable'); tbody.innerHTML=''
    for (const d of rows){
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td class="px-3 py-2">${d.name}</td>
        <td class="px-3 py-2">${d.status==='Tersambung'?'<span class="text-emerald-600">Tersambung</span>':`<span class="text-slate-500">${d.status||'Tidak Tersambung'}</span>`}</td>
       
        <td class="px-3 py-2 text-right space-x-2">
          <button data-act="connect" data-id="${d.id}" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">${d.status==='Tersambung'?'Disconnect':'Connect'}</button>
          
          <button data-act="delete" data-id="${d.id}" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">Delete</button>
        </td>`
      tbody.append(tr)
    }
    $('#devicesInfo').textContent = `${state.devices.length} items`
    tbody.onclick = (e)=>{
      const btn = e.target.closest('button[data-act]'); if(!btn) return
      const id = btn.getAttribute('data-id'); const act = btn.getAttribute('data-act')
      const idx = state.devices.findIndex(x=>x.id===id); if(idx<0) return
      if (act==='delete'){
        fetchJSON(`${apiBase}/sessions/${encodeURIComponent(id)}`, { method:'DELETE' })
          .then(async ()=>{ toast('Device deleted'); await refreshDevicesFromAPI(); renderDevices(0,size); renderOverview(); })
          .catch(()=>toast('Gagal menghapus','error'))
      }
      if (act==='connect'){
        if (state.devices[idx].status==='Tersambung'){
          fetchJSON(`${apiBase}/sessions/${encodeURIComponent(id)}`, { method:'DELETE' })
            .then(async ()=>{ toast('DisTersambung'); await refreshDevicesFromAPI(); renderDevices(0,size); renderOverview(); })
            .catch(()=>toast('Gagal memutus','error'))
          return
        }
        openAddDeviceModal({ id })
      }
    }
  }

  function renderMessages(kind='outbox', page=0, size=10){
  
    if (!state.msgPage) state.msgPage = { outbox:0, inbox:0, failed:0, scheduled:0 }
    state.msgPage[kind] = page
    const start = page*size
    const arr = state.messages[kind]||[]
   // console.log(state.messages, kind, arr)
    const rows = arr.slice(start, start+size)
    const tbody = $('#messagesTable'); tbody.innerHTML=''
    for (const m of rows){
      const tr = document.createElement('tr')
      const hasMedia = detectMedia(m.raw)
      const dlBtn = hasMedia ? `<button data-dl class="ml-2 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">Download</button>` : ''
      tr.innerHTML = `<td class="px-3 py-2">${fmtDate(m.ts)}</td><td class="px-3 py-2">${m.direction==='out' ? m.to : m.from}</td><td class="px-3 py-2 truncate max-w-[360px]">${m.text||'[media]'}${dlBtn}</td><td class="px-3 py-2">${m.status}</td><td class="px-3 py-2">${m.retries||0}</td>`
      tr.querySelector('[data-dl]')?.addEventListener('click', async (e)=>{
        e.stopPropagation();
        const sid = document.getElementById('msgSession')?.value
        if (!sid) return
        try {
          const res = await fetch(`${apiBase}/${encodeURIComponent(sid)}/messages/download`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(m.raw) })
          if (!res.ok) throw new Error('Failed')
          const blob = await res.blob();
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filenameFor(m.raw); document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 500)
        } catch { toast('Unduh gagal','error') }
      })
      tbody.append(tr)
    }
    $('#messagesInfo').textContent = `${arr.length} items`
  }

  function extractText(msg){
    try {
      const m = msg.message || {}
      if (m.conversation) return m.conversation
      if (m.extendedTextMessage?.text) return m.extendedTextMessage.text
      if (m.imageMessage?.caption) return m.imageMessage.caption
      if (m.videoMessage?.caption) return m.videoMessage.caption
      if (m.documentMessage?.fileName) return m.documentMessage.fileName
      if (m.protocolMessage?.type) return `protocol: ${m.protocolMessage.type}`
      if (m.audioMessage) return '[audio]'
      if (m.stickerMessage) return '[sticker]'
      return Object.keys(m)[0] || ''
    } catch { return '' }
  }

  function detectMedia(msg){
    const m = msg?.message || {}
    const t = ['imageMessage','videoMessage','documentMessage','audioMessage','stickerMessage']
    for (const k of t){ if (m[k]) return k }
    return null
  }

  function filenameFor(msg){
    const m = msg?.message || {}
    if (m.documentMessage?.fileName) return m.documentMessage.fileName
    const k = detectMedia(msg) || 'file'
    const ext = (m[k]?.mimetype||'').split('/')[1] || 'bin'
    return `${k}-${msg.key?.id || Date.now()}.${ext}`
  }

  function renderTemplates(){
    const wrap = $('#tplTable'); wrap.innerHTML=''
    for (const t of state.templates){
      const row = document.createElement('div')
      row.className = 'flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded p-3'
      row.innerHTML = `<div><div class="font-medium">${t.name} <span class="text-xs text-slate-500">(${t.category})</span></div><div class="text-sm text-slate-500 dark:text-slate-400">${t.body}</div></div><div class="space-x-2"><button data-id="${t.id}" data-action="use" class="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-sm">Use</button><button data-id="${t.id}" data-action="edit" class="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-sm">Edit</button><button data-id="${t.id}" data-action="delete" class="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-sm">Delete</button></div>`
      wrap.append(row)
    }
    wrap.onclick = (e)=>{
      const btn = e.target.closest('button[data-action]'); if(!btn) return
      const id = btn.getAttribute('data-id'); const t = state.templates.find(x=>x.id===id)
      if (!t) return
      const act = btn.getAttribute('data-action')
      if (act==='delete'){ state.templates = state.templates.filter(x=>x.id!==id); saveLocal(); renderTemplates(); toast('Template deleted') }
      if (act==='use'){ $('#sendText').value = t.body.replace(/\{\{(.*?)\}\}/g,(m,v)=>`<${v.trim()}>`); switchPage('send'); toast('Template dimuat') }
      if (act==='edit'){ openTemplateModal(t) }
    }
  }

  function renderContacts(page=0, size=10){
    const start = page*size
    const rows = state.contacts.slice(start, start+size)
    const tbody = $('#contactsTable'); tbody.innerHTML=''
    for (const c of rows){
      const tr = document.createElement('tr')
      tr.innerHTML = `<td class="px-3 py-2">${c.name}</td><td class="px-3 py-2">${c.phone}</td><td class="px-3 py-2">${(c.tags||[]).join(',')}</td><td class="px-3 py-2">${c.optin?'yes':'no'}</td><td class="px-3 py-2">${c.notes||''}</td><td class="px-3 py-2 text-right space-x-2"><button data-act="edit" data-id="${c.id}" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">Edit</button><button data-act="del" data-id="${c.id}" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">Delete</button></td>`
      tbody.append(tr)
    }
    $('#contactsInfo').textContent = `${state.contacts.length} items`
    tbody.onclick = (e)=>{
      const btn = e.target.closest('button[data-act]'); if(!btn) return
      const id = btn.getAttribute('data-id'); const idx = state.contacts.findIndex(x=>x.id===id); if(idx<0) return
      const act = btn.getAttribute('data-act')
      if (act==='del'){ state.contacts.splice(idx,1); saveLocal(); renderContacts(page,size); toast('Contact deleted') }
      if (act==='edit'){ openContactModal(state.contacts[idx]) }
    }
  }

  function initContactsLive(){
    const section = document.querySelector('[data-page="contacts"]')
    if (!section) return
    // toolbar with session select
    const toolbar = document.createElement('div')
    toolbar.className = 'px-3 pt-3 flex items-center gap-2'
    toolbar.innerHTML = `<label class="text-sm text-slate-500 dark:text-slate-400">Session</label><select id="ctSession" class="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1 text-sm"></select><button id="ctRefresh" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-sm">Refresh</button>`
    const rounded = section.querySelector('.rounded-lg')
    const overflow = section.querySelector('.rounded-lg > .overflow-x-auto')
    if (rounded && overflow) rounded.insertBefore(toolbar, overflow)

    const sel = $('#ctSession'); sel.innerHTML=''
    for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) }

    let contactsCursor = null
    const cursorStack = [null]
    let pos = 0

    async function loadContactsAPI(mode='reset'){
      const sid = sel.value; if (!sid) return
      try {
        if (mode==='reset'){ contactsCursor=null; cursorStack.length=0; cursorStack.push(null); pos=0 }
        if (mode==='prev'){ if (pos>0) pos--; contactsCursor = cursorStack[pos] }
        const url = new URL(`${apiBase}/${encodeURIComponent(sid)}/contacts`)
        url.searchParams.set('limit','25')
        if (mode!=='reset' && contactsCursor) url.searchParams.set('cursor', contactsCursor)
        const res = await fetchJSON(url.toString())
        const list = res.data||[]
        const tbody = $('#contactsTable')
        if (mode==='reset') tbody.innerHTML=''
        for (const c of list){
          const tr = document.createElement('tr')
          const name = c.name || c.notify || ''
          const jid = c.id||'-'
          // photo cell with lazy load
          tr.innerHTML = `<td class="px-3 py-2"><div class="flex items-center gap-2"><img data-photo="${jid}" class="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700"/><span>${name}</span></div></td><td class="px-3 py-2">${jid}</td><td class="px-3 py-2">-</td><td class="px-3 py-2">-</td><td class="px-3 py-2">-</td><td class="px-3 py-2 text-right space-x-2"></td>`
          tr.title = 'Click to prefill send form'
          tr.style.cursor = 'pointer'
          tr.onclick = () => {
            switchPage('send')
            $('#sendDevice').value = sid
            $('#sendPhone').value = (jid).replace(/@s\.whatsapp\.net$/, '')
          }
          tbody.append(tr)
        }
        const nextCursor = res.cursor || null
        if (mode==='next' && nextCursor){ cursorStack.push(nextCursor); pos = cursorStack.length-1 }
        if (mode!=='next') contactsCursor = nextCursor
        $('#contactsInfo').textContent = `${tbody.children.length} items`
        // load photos
        $$('img[data-photo]', $('#contactsTable')).forEach(async (img)=>{
          if (img.getAttribute('data-loaded')) return
          img.setAttribute('data-loaded','1')
          const jid = img.getAttribute('data-photo')
          try {
            const resp = await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/contacts/${encodeURIComponent(jid)}/photo`)
            if (resp.url) img.src = resp.url
          } catch {}
        })
      } catch (e) {
        $('#contactsTable').innerHTML = ''
        $('#contactsInfo').textContent = '0 items'
      }
    }

    $('#ctRefresh').onclick = () => loadContactsAPI('reset')
    const prevBtn = section.querySelector('[data-ct-prev]')
    const nextBtn = section.querySelector('[data-ct-next]')
    if (prevBtn) prevBtn.onclick = () => { if (pos===0) return toast('Sudah di halaman pertama'); loadContactsAPI('prev') }
    if (nextBtn) nextBtn.onclick = () => { if (!contactsCursor) return toast('Akhir daftar'); loadContactsAPI('next') }

    // initial load
    loadContactsAPI('reset')
  }

  function initChatsLive(){
    const section = document.querySelector('[data-page="chats"]')
    if (!section) return
    const toolbar = document.createElement('div')
    toolbar.className = 'px-3 pt-3 flex items-center gap-2'
    toolbar.innerHTML = `<label class="text-sm text-slate-500 dark:text-slate-400">Session</label><select id="chSession" class="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1 text-sm"></select><label class="text-sm text-slate-500 dark:text-slate-400">Search</label><input id="chSearch" placeholder="name, number, or text" class="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1 text-sm"/><button id="chRefresh" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-sm">Refresh</button>`
    const rounded = section.querySelector('.rounded-lg')
    const overflow = section.querySelector('.rounded-lg > .overflow-x-auto')
    if (rounded && overflow) rounded.insertBefore(toolbar, overflow)
    const sel = $('#chSession'); sel.innerHTML=''; for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) }
    let cursor = null; const stack=[null]; let pos=0
    async function loadChatsAPI(mode='reset'){
      const sid = sel.value; if (!sid) return
      try {
        if (mode==='reset'){ cursor=null; stack.length=0; stack.push(null); pos=0 }
        if (mode==='prev'){ if (pos>0) pos--; cursor = stack[pos] }
        const url = new URL(`${apiBase}/${encodeURIComponent(sid)}/chats/table`)
        url.searchParams.set('limit','25')
        const qEl = document.getElementById('chSearch'); const q = qEl && 'value' in qEl ? qEl.value.trim() : '';
        if (q) url.searchParams.set('q', q)
        if (mode!=='reset' && cursor) url.searchParams.set('cursor', cursor)
        const res = await fetchJSON(url.toString())
        const tbody = $('#chatsTable'); if (mode==='reset') tbody.innerHTML=''
        for (const r of (res.rows||[])){
          const jid = r.jid
          const name = r.name || ''
          const preview = r.preview || ''
          const tr = document.createElement('tr')
          tr.innerHTML = `<td class="px-3 py-2">${name||'-'}</td><td class="px-3 py-2">${jid}</td><td class="px-3 py-2 truncate max-w-[360px]">${preview||'-'}</td><td class="px-3 py-2 text-right"><button data-jid="${jid}" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">Open</button></td>`
          tbody.append(tr)
        }
        const next = res.cursor || null
        if (mode==='next' && next){ stack.push(next); pos = stack.length-1 }
        if (mode!=='next') cursor = next
        $('#chatsInfo').textContent = `${tbody.children.length} items`
        $('#chatsTable').onclick = (e)=>{
          const btn = e.target.closest('button[data-jid]'); if(!btn) return
          const jid = btn.getAttribute('data-jid')
          switchPage('send'); $('#sendDevice').value = sel.value; if (/@g\.us$/.test(jid)){ $('#sendText').focus() } else { $('#sendPhone').value = jid.replace(/@s\.whatsapp\.net$/, ''); $('#sendText').focus() }
        }
      } catch { $('#chatsTable').innerHTML=''; $('#chatsInfo').textContent='0 items' }
    }
    $('#chRefresh').onclick = () => loadChatsAPI('reset')
    const sEl = document.getElementById('chSearch'); if (sEl) sEl.addEventListener('keyup', (e)=>{ if (e.key==='Enter') loadChatsAPI('reset') })
    const prevBtn = section.querySelector('[data-ch-prev]')
    const nextBtn = section.querySelector('[data-ch-next]')
    if (prevBtn) prevBtn.onclick = () => { if (pos===0) return toast('Sudah di halaman pertama'); loadChatsAPI('prev') }
    if (nextBtn) nextBtn.onclick = () => { if (!cursor) return toast('Akhir daftar'); loadChatsAPI('next') }
    // clicking Open should also open Messages view for that chat
    section.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-jid]'); if(!btn) return
      const jid = btn.getAttribute('data-jid'); const sid = sel.value
      switchPage('messages')
      const msgSel = document.getElementById('msgSession'); if (msgSel instanceof HTMLSelectElement) msgSel.value = sid
      const msgJid = document.getElementById('msgJid'); if (msgJid instanceof HTMLInputElement) msgJid.value = jid
      state.messageView.sessionId = sid; state.messageView.jid = jid; saveLocal()
      document.getElementById('msgLoadChat')?.click()
    })
    loadChatsAPI('reset')
  }

  function initGroupsLive(){
    const section = document.querySelector('[data-page="groups"]')
    if (!section) return
    const toolbar = document.createElement('div')
    toolbar.className = 'px-3 pt-3 flex items-center gap-2'
    toolbar.innerHTML = `<label class="text-sm text-slate-500 dark:text-slate-400">Session</label><select id="grSession" class="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1 text-sm"></select><button id="grRefresh" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-sm">Refresh</button>`
    const rounded = section.querySelector('.rounded-lg')
    const overflow = section.querySelector('.rounded-lg > .overflow-x-auto')
    if (rounded && overflow) rounded.insertBefore(toolbar, overflow)
    const sel = $('#grSession'); sel.innerHTML=''; for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) }
    let cursor = null; const stack=[null]; let pos=0
    async function loadGroupsAPI(mode='reset'){
      const sid = sel.value; if (!sid) return
      try {
        if (mode==='reset'){ cursor=null; stack.length=0; stack.push(null); pos=0 }
        if (mode==='prev'){ if (pos>0) pos--; cursor = stack[pos] }
        const url = new URL(`${apiBase}/${encodeURIComponent(sid)}/groups`)
        url.searchParams.set('limit','25')
        if (mode!=='reset' && cursor) url.searchParams.set('cursor', cursor)
        const res = await fetchJSON(url.toString())
        const tbody = $('#groupsTable'); if (mode==='reset') tbody.innerHTML=''
        for (const g of (res.data||[])){
          const jid = g.id
          const name = g.subject || g.name || '-'
          const tr = document.createElement('tr')
          tr.innerHTML = `<td class="px-3 py-2">${name}</td><td class="px-3 py-2">${jid}</td><td class="px-3 py-2 text-right"><button data-jid="${jid}" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">Open</button></td>`
          tbody.append(tr)
        }
        const next = res.cursor || null
        if (mode==='next' && next){ stack.push(next); pos = stack.length-1 }
        if (mode!=='next') cursor = next
        $('#groupsInfo').textContent = `${tbody.children.length} items`
        $('#groupsTable').onclick = (e)=>{
          const btn = e.target.closest('button[data-jid]'); if(!btn) return
          const jid = btn.getAttribute('data-jid')
          switchPage('send'); $('#sendDevice').value = sel.value; $('#sendType').value='group'; $('#sendText').focus()
        }
      } catch { $('#groupsTable').innerHTML=''; $('#groupsInfo').textContent='0 items' }
    }
    $('#grRefresh').onclick = () => loadGroupsAPI('reset')
    const prevBtn = section.querySelector('[data-gr-prev]')
    const nextBtn = section.querySelector('[data-gr-next]')
    if (prevBtn) prevBtn.onclick = () => { if (pos===0) return toast('Sudah di halaman pertama'); loadGroupsAPI('prev') }
    if (nextBtn) nextBtn.onclick = () => { if (!cursor) return toast('Akhir daftar'); loadGroupsAPI('next') }
    section.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-jid]'); if(!btn) return
      const jid = btn.getAttribute('data-jid'); const sid = sel.value
      switchPage('messages')
      const msgSel = document.getElementById('msgSession'); if (msgSel instanceof HTMLSelectElement) msgSel.value = sid
      const msgJid = document.getElementById('msgJid'); if (msgJid instanceof HTMLInputElement) msgJid.value = jid
      state.messageView.sessionId = sid; state.messageView.jid = jid; saveLocal()
      document.getElementById('msgLoadChat')?.click()
    })
    loadGroupsAPI('reset')
  }

  function appendLog(text){
    state.logs.unshift({ ts: Date.now(), text });
    const item = document.createElement('div');
    item.textContent = `${fmtDate(Date.now())} - ${text}`;
    const listMain = document.getElementById('logsList'); if (listMain) listMain.prepend(item.cloneNode(true));
    const listOverview = document.getElementById('logList'); if (listOverview) listOverview.prepend(item);
    const loading = document.getElementById('logsLoading'); if (loading) loading.textContent = 'Gulir untuk lainnya';
  }

  function initLogInfinite(){
    const cont = $('#logsContainer'); const loading = $('#logsLoading')
    cont.addEventListener('scroll', () => {
      if (cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 10){
        loading.textContent = 'Memuat...'
        setTimeout(()=>{ // mock load
          for (let i=0;i<10;i++) state.logs.push({ ts: Date.now()-Math.random()*1e7, text:'older log '+i })
          const frag = document.createDocumentFragment()
          for (let i=state.logs.length-10;i<state.logs.length;i++){
            const d = state.logs[i]; const el = document.createElement('div'); el.textContent = `${fmtDate(d.ts)} - ${d.text}`; frag.append(el)
          }
          $('#logsList').append(frag)
          loading.textContent = 'Gulir untuk lainnya'
        }, 600)
      }
    })
  }

  function openModal(title, bodyNode, actions=[]) {
    $('#modalTitle').textContent = title
    const body = $('#modalBody'); body.innerHTML=''; body.append(bodyNode)
    const act = $('#modalActions'); act.innerHTML=''
    for (const a of actions){ const b = document.createElement('button'); b.className = 'px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-sm'; b.textContent = a.label; b.onclick = () => a.onClick?.(); act.append(b) }
    $('#modal').classList.remove('hidden'); $('#modal').classList.add('flex')
  }
  function closeModal(){ $('#modal').classList.add('hidden'); $('#modal').classList.remove('flex') }

  function openAddDeviceModal(device){
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="space-y-3">
        <div>
          <label class="text-sm text-slate-500 dark:text-slate-400">Session ID</label>
          <input id="sessId" value="${device?.id||''}" class="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="e.g. my-session" />
        </div>
        <div class="text-sm text-slate-500 dark:text-slate-400">Scan QR to connect</div>
        <div class="flex gap-3 items-start">
          <img id="qrImg" class="w-56 h-56 rounded border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
          <pre id="qrState" class="text-xs p-2 border rounded border-slate-200 dark:border-slate-800 overflow-auto max-h-56 flex-1">Menunggu...</pre>
        </div>
      </div>`
    let es = null
    const startSSE = (id) => {
      if (es) { es.close(); es = null }
      $('#qrImg', wrap).src = ''
      $('#qrState', wrap).textContent = 'Menyambungkan...'
      es = new EventSource(`${apiBase}/sessions/${encodeURIComponent(id)}/add-sse`)
      es.onerror = () => { $('#qrState', wrap).textContent = 'Terjadi kesalahan koneksi'; es && es.close() }
      es.onmessage = async (ev) => {
        const data = JSON.parse(ev.data)
        if (data.qr) $('#qrImg', wrap).src = data.qr
        $('#qrState', wrap).textContent = JSON.stringify(data, null, 2)
        if (data.connection === 'open'){
          toast('Tersambung')
          es && es.close()
          await refreshDevicesFromAPI(); renderDevices(); renderOverview();
          closeModal()
        }
      }
    }
    const actions = [
      { label: 'Start', onClick: ()=>{ const id=$('#sessId',wrap).value.trim(); if(!id) return toast('Session ID required','error'); startSSE(id) } },
      { label: 'Close', onClick: ()=>{ es && es.close(); closeModal() } }
    ]
    openModal('Add Device', wrap, actions)
  }

  function openTemplateModal(existing){
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="space-y-2">
        <input id="tplName" class="w-full rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="name" value="${existing?.name||''}" />
        <input id="tplCat" class="w-full rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="category" value="${existing?.category||''}" />
        <textarea id="tplBody" rows="4" class="w-full rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="Body with {{variables}}">${existing?.body||''}</textarea>
      </div>`
    openModal(existing?'Edit Template':'Add Template', wrap, [
      { label:'Save', onClick: ()=>{
        const name = $('#tplName', wrap).value.trim(); const category = $('#tplCat', wrap).value.trim(); const body = $('#tplBody', wrap).value.trim()
        if (!name || !body) return toast('Name and body required','error')
        if (existing){ existing.name=name; existing.category=category; existing.body=body }
        else { state.templates.push({ id: 'tpl-'+Date.now(), name, category, body }) }
        saveLocal(); renderTemplates(); closeModal(); toast('Saved')
      }},
      { label:'Cancel', onClick: closeModal },
    ])
  }

  function openContactModal(existing){
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="space-y-2">
        <input id="ctName" class="w-full rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="name" value="${existing?.name||''}" />
        <input id="ctPhone" class="w-full rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="phone (E.164)" value="${existing?.phone||''}" />
        <input id="ctTags" class="w-full rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="tags (comma)" value="${(existing?.tags||[]).join(',')}" />
        <label class="inline-flex items-center gap-2 text-sm"><input id="ctOptin" type="checkbox" ${existing?.optin?'checked':''}/> Opt-in</label>
        <textarea id="ctNotes" rows="3" class="w-full rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="notes">${existing?.notes||''}</textarea>
      </div>`
    openModal(existing?'Edit Contact':'Add Contact', wrap, [
      { label:'Save', onClick: ()=>{
        const name=$('#ctName',wrap).value.trim(); const phone=$('#ctPhone',wrap).value.trim(); if(!name||!phone) return toast('Name and phone required','error')
        const rec = { id: existing?.id||('c'+Date.now()), name, phone, tags: $('#ctTags',wrap).value.split(',').map(s=>s.trim()).filter(Boolean), optin: $('#ctOptin',wrap).checked, notes: $('#ctNotes',wrap).value }
        if (existing){ Object.assign(existing, rec) } else { state.contacts.push(rec) }
        saveLocal(); renderContacts(); closeModal(); toast('Saved')
      }},
      { label:'Cancel', onClick: closeModal },
    ])
  }

  function validatePhone(cc, phone){ const p = e164(cc, phone); return /^\d{8,15}$/.test(p) }

  function initSend(){
    const sel = $('#sendDevice'); sel.innerHTML='';
    for (const d of state.devices){ const o = document.createElement('option'); o.value = d.id; o.textContent = `${d.name} (${d.status})`; sel.append(o) }
    $('#btnTestSend').onclick = async () => {
      const dev = $('#sendDevice').value; const cc=$('#sendCC').value; const phone=$('#sendPhone').value; const text=$('#sendText').value
      if (!dev || !phone) return toast('Fill device and phone','error')
      if (!validatePhone(cc, phone)) return toast('Invalid phone (E.164)','error')
      const jid = e164(cc, phone)+'@s.whatsapp.net'
      const file = /** @type {HTMLInputElement} */ (document.getElementById('sendFile')).files[0]
      let message = { text }
      if (file) {
        const dataUrl = await new Promise((resolve)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.readAsDataURL(file) })
        if (typeof dataUrl === 'string') {
          if (file.type.startsWith('image/')) message = { image: { dataUrl, caption: text } }
          else if (file.type.startsWith('video/')) message = { video: { dataUrl, caption: text } }
          else message = { document: { dataUrl, fileName: file.name, mimetype: file.type } }
        }
      }
      try {
        await fetchJSON(`${apiBase}/${encodeURIComponent(dev)}/messages/send`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ jid, type:'number', message }) })
        appendLog(`Send to ${jid}: ok`)
        toast('Message sent')
      } catch (e) {
        appendLog(`Send to ${jid}: failed`)
        toast('Send failed','error')
      }
    }
  }

  function initBroadcast(){
    const refreshDevices = ()=>{ const sel=$('#bcDevice'); sel.innerHTML=''; for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) } }
    refreshDevices()

    function parseCSV(text){
      const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      if (lines.length===0) return [];
      const first = lines[0];
      const hasHeader = /[a-zA-Z]/.test(first) && first.includes(',');
      let idxPhone = 0, idxName = -1;
      if (hasHeader){
        const headers = first.split(',').map(h=>h.trim().toLowerCase());
        idxPhone = headers.findIndex(h=> ['phone','number','msisdn','jid','to'].includes(h));
        idxName = headers.findIndex(h=> ['name','nama'].includes(h));
      }
      const start = hasHeader ? 1 : 0;
      const rows = [];
      for (let i=start;i<lines.length;i++){
        const cols = lines[i].split(',');
        const phone = (cols[idxPhone]||'').trim();
        const name = idxName>=0 ? (cols[idxName]||'').trim() : '';
        if (!phone) continue;
        rows.push({ phone, name });
      }
      return rows;
    }

    function toJid(phone){
      let p = String(phone).replace(/\D/g,'');
      if (!p) return '';
      return `${p}@s.whatsapp.net`;
    }

    async function startCampaign(){
      const device = $('#bcDevice').value;
      const throttle = parseInt($('#bcThrottle').value||'30', 10) || 30; // msgs per min
      const delay = Math.max(200, Math.floor(60000 / throttle));
      const text = ($('#sendText')?.value || '').trim() || ($('#bcText')?.value||'').trim();
      const fileInput = document.getElementById('bcCSV');
      const file = fileInput && 'files' in fileInput ? fileInput.files[0] : null;
      if (!device) return toast('Select device','error');
      if (!file) return toast('Upload CSV with phone column','error');
      if (!text) return toast('Provide message text (Send tab or Broadcast text field)','error');

      const csvText = await new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(String(fr.result||'')); fr.onerror=reject; fr.readAsText(file); });
      const rows = parseCSV(String(csvText));
      if (rows.length===0) return toast('No valid rows in CSV','error');

      const payload = rows.map((r,idx)=> ({
        jid: toJid(r.phone),
        type: 'number',
        delay,
        message: { text: text.replace(/\{\{name\}\}/g, r.name||'').replace(/\{\{phone\}\}/g, r.phone||'') },
      }));

      $('#bcProgress').style.width='0%';
      $('#bcSummary').textContent=`antri: ${payload.length}, terkirim: 0, gagal: 0`;

      try {
        const res = await fetch(`${apiBase}/${encodeURIComponent(device)}/messages/send/bulk`, {
          method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json();
        const sent = (data.results||[]).length;
        const failed = (data.errors||[]).length;
        $('#bcProgress').style.width='100%';
        $('#bcSummary').textContent=`antri: 0, terkirim: ${sent}, gagal: ${failed}`;
        appendLog(`Campaign ${$('#bcName').value||''}: sent=${sent} failed=${failed}`);
        toast('Campaign finished');
      } catch (e) {
        $('#bcSummary').textContent='antri: 0, terkirim: 0, gagal: 0';
        toast('Campaign failed','error');
      }
    }

    $('#btnStartCampaign').onclick = ()=>{ startCampaign() }
    $('#btnPauseCampaign').onclick = ()=>{ toast('Pause not supported in live mode') }
    $('#btnResumeCampaign').onclick = ()=>{ toast('Resume not supported in live mode') }
    $('#btnCancelCampaign').onclick = ()=>{ $('#bcProgress').style.width='0%'; $('#bcSummary').textContent='antri: 0, terkirim: 0, gagal: 0'; toast('Campaign cleared') }
  }

  function initMessages(){
    const section = document.querySelector('[data-page="messages"]')
    const selNodes = document.querySelectorAll('#msgSession');
    selNodes.forEach((sel) => {
      sel.innerHTML = '';
      if (state.devices.length === 0) {
        const opt = document.createElement('option'); opt.textContent = 'Tidak ada sesi'; opt.disabled = true; opt.selected = true; sel.append(opt);
      } else {
        for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) }
      }
    });
    if (!state.messageView?.sessionId && state.devices.length){
      selNodes.forEach((sel)=>{ sel.value = state.devices[0].id });
    }
    const dirSel = document.getElementById('msgDirection')
    const sel = document.getElementById('msgSession');
    if (sel) {
      sel.innerHTML = '';
      if (state.devices.length === 0) {
        const opt = document.createElement('option'); opt.textContent = 'Tidak ada sesi'; opt.disabled = true; opt.selected = true; sel.append(opt);
      } else {
        for (const d of state.devices) { const o = document.createElement('option'); o.value = d.id; o.textContent = d.name; sel.append(o); }
        if (!state.messageView?.sessionId) { sel.value = state.devices[0].id; }
      }
    }

    // tabs removed: we rely purely on toolbar

    // restore last view
    if (state.messageView?.sessionId && state.devices.some(d=>d.id===state.messageView.sessionId)) sel.value = state.messageView.sessionId
    if (dirSel instanceof HTMLSelectElement && state.messageView?.direction) dirSel.value = state.messageView.direction
    const jidInput = document.getElementById('msgJid')
    if (jidInput instanceof HTMLInputElement && state.messageView?.jid) jidInput.value = state.messageView.jid

    let msgCursor = null; const msgStack = [null]; let msgPos = 0; let usingChat = false; let currentChatJid = ''
    function wStatus(v){
      const map = { 0:'pending', 1:'sent', 2:'delivered', 3:'read', 4:'played' }
      return (v===0||v) ? (map[v]||String(v)) : '-'
    }

    function renderRows(list){
      const tbody = $('#messagesTable'); tbody.innerHTML=''
      if (!Array.isArray(list) || list.length===0){
        const tr=document.createElement('tr'); tr.innerHTML = `<td colspan="5" class="px-3 py-6 text-center text-slate-500 dark:text-slate-400">No messages</td>`; tbody.append(tr);
        $('#messagesInfo').textContent = '0 items';
        return;
      }
      for (const m of list){
        const tr = document.createElement('tr')
        const raw = m.raw || m
        const hasMedia = detectMedia(raw)
        const dlBtn = hasMedia ? `<button data-dl class="ml-2 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">Download</button>` : ''
 
        const ts = m.ts || (Number(raw.messageTimestamp||Date.now())*1000)
        const who = m.peer || (raw.key?.fromMe ? (raw.remoteJid||'') : (raw.key?.participant||raw.remoteJid||''))
        const text = m.text || extractText(raw)
        const st = m.statusText || wStatus(raw.status)
        tr.innerHTML = `<td class="px-3 py-2">${fmtDate(ts)}</td><td class="px-3 py-2">${who}</td><td class="px-3 py-2 truncate max-w-[360px]">${text}${dlBtn}</td><td class="px-3 py-2">${st}</td><td class="px-3 py-2">-</td>`
        tr.querySelector('[data-dl]')?.addEventListener('click', async (e)=>{
          e.stopPropagation();
          const sid = sel.value; if (!sid) return
          try {
            const res = await fetch(`${apiBase}/${encodeURIComponent(sid)}/messages/download`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(raw) })
            if (!res.ok) throw new Error('Failed')
            const blob = await res.blob(); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filenameFor(raw); document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 500)
          } catch { toast('Unduh gagal','error') }
        })
        tbody.append(tr)
      }
      $('#messagesInfo').textContent = `${list.length} items`
    }

    async function loadMsgsAPI(mode='reset'){
      const sid = sel.value; if (!sid) return
      //console.log('Loading messages for', sid, 'mode', mode, 'cursor', msgCursor, 'pos', msgPos, 'usingChat', usingChat, 'currentChatJid', currentChatJid)  
      state.messageView.sessionId = sid; saveLocal()
      try {
        if (mode==='reset'){ msgCursor=null; msgStack.length=0; msgStack.push(null); msgPos=0; usingChat=false; currentChatJid='' }
        if (mode==='prev'){ if (msgPos>0) msgPos--; msgCursor = msgStack[msgPos] }
        const url = new URL(`${apiBase}/${encodeURIComponent(sid)}/messages/table`)
        url.searchParams.set('limit','25')
        const direction = (dirSel instanceof HTMLSelectElement) ? dirSel.value : 'all'
        state.messageView.direction = direction; saveLocal()
        if (direction && direction !== 'all') url.searchParams.set('direction', direction)
        if (mode!=='reset' && msgCursor) url.searchParams.set('cursor', msgCursor)
        const qEl = document.getElementById('msgSearch'); const q = qEl && 'value' in qEl ? qEl.value.trim() : '';
        if (q) url.searchParams.set('q', q)
        const res = await fetchJSON(url.toString())
        renderRows(res.rows||res.data||[])
        const next = res.cursor || null
        if (mode==='next' && next){ msgStack.push(next); msgPos = msgStack.length-1 }
        if (mode!=='next') msgCursor = next
      } catch { $('#messagesTable').innerHTML=''; $('#messagesInfo').textContent='0 items' }
    }

    (function(){ const b=document.getElementById('msgRefresh'); if(b) b.addEventListener('click', function(ev){ ev.preventDefault(); loadMsgsAPI('reset'); }); const s=document.getElementById('msgSearch'); if(s) s.addEventListener('keyup', function(ev){ if(ev.key==='Enter'){ loadMsgsAPI('reset'); } }); })()
    // bind change on all session selects (in case of duplicates)
    document.querySelectorAll('#msgSession').forEach((el)=> el.addEventListener('change', ()=> loadMsgsAPI('reset')))
    if (dirSel instanceof HTMLSelectElement) dirSel.addEventListener('change', ()=> { loadMsgsAPI('reset') })
    const loadBtn = document.getElementById('msgLoadChat');
    if (loadBtn) loadBtn.onclick = async ()=>{
      const sid = sel.value;
      // @ts-ignore JS runtime: value exists on input
      const jid = (document.getElementById('msgJid') || {}).value?.trim() || '';
      if (!sid || !jid) return;
      state.messageView.sessionId = sid; state.messageView.jid = jid; saveLocal();
      try {
        // start per-chat cursor flow
        msgCursor=null; msgStack.length=0; msgStack.push(null); msgPos=0; usingChat=true; currentChatJid = jid;
        const url = new URL(`${apiBase}/${encodeURIComponent(sid)}/messages/table`);
        url.searchParams.set('limit','25');
        const direction = (dirSel instanceof HTMLSelectElement) ? dirSel.value : 'all';
        state.messageView.direction = direction; saveLocal();
        if (direction && direction !== 'all') url.searchParams.set('direction', direction);
        url.searchParams.set('jid', jid);
        const res = await fetchJSON(url.toString());
        renderRows(res.rows||res.data||[]);
        msgCursor = res.cursor || null;
      } catch { $('#messagesTable').innerHTML=''; $('#messagesInfo').textContent='0 items' }
    }
    // Initial load and rebind Prev/Next to cursor flow
    loadMsgsAPI('reset')
    const prevBtn = document.querySelector('[data-msg-prev]')
    const nextBtn = document.querySelector('[data-msg-next]')
    if (prevBtn) prevBtn.onclick = () => { if (msgPos===0) return toast('Sudah di halaman pertama'); if (usingChat){ const sid=sel.value; const jid=currentChatJid; if(!sid||!jid) return; msgPos=Math.max(0,msgPos-1); msgCursor = msgStack[msgPos]; const url=new URL(`${apiBase}/${encodeURIComponent(sid)}/messages/table`); url.searchParams.set('limit','25'); const direction=(dirSel instanceof HTMLSelectElement)?dirSel.value:'all'; if(direction!=='all') url.searchParams.set('direction',direction); url.searchParams.set('jid', jid); if (msgCursor) url.searchParams.set('cursor', msgCursor); fetchJSON(url.toString()).then(r=>{ renderRows(r.rows||r.data||[]); }).catch(()=>{}); } else { loadMsgsAPI('prev') } }
    if (nextBtn) nextBtn.onclick = () => { if (!msgCursor) return toast('Akhir daftar'); if (usingChat){ const sid=sel.value; const jid=currentChatJid; if(!sid||!jid) return; const url=new URL(`${apiBase}/${encodeURIComponent(sid)}/messages/table`); url.searchParams.set('limit','25'); const direction=(dirSel instanceof HTMLSelectElement)?dirSel.value:'all'; if(direction!=='all') url.searchParams.set('direction',direction); url.searchParams.set('jid', jid); if (msgCursor) url.searchParams.set('cursor', msgCursor); fetchJSON(url.toString()).then(r=>{ renderRows(r.rows||r.data||[]); const next=r.cursor||null; if(next){ msgStack.push(next); msgPos=msgStack.length-1; msgCursor=next } else { msgCursor = null } }).catch(()=>{}); } else { loadMsgsAPI('next') } }

    // Tabs behavior: sync to direction and reload
    $$('.tab').forEach(b=> b.onclick = () => {
      const tab = b.getAttribute('data-tab') || 'outbox'
      $$('.tab').forEach(x=>x.classList.remove('bg-brand/10'))
      b.classList.add('bg-brand/10')
      if (tab==='outbox' || tab==='inbox') {
        if (dirSel instanceof HTMLSelectElement) dirSel.value = tab
        loadMsgsAPI('reset')
      } else {
        // For failed/scheduled we default to all; backend currently doesn't expose delivery status
        if (dirSel instanceof HTMLSelectElement) dirSel.value = 'all'
        loadMsgsAPI('reset')
      }
    })
  }

  function initEvents(){
    $('#toggleTheme').onclick = () => { document.documentElement.classList.toggle('dark'); setTheme() }
    $('#openSidebar').onclick = () => $('#sidebar').classList.toggle('hidden')
    $('#modalClose').onclick = closeModal
    $$('.navlink').forEach(a=> a.onclick = ()=> switchPage(a.getAttribute('data-nav')))
    $('#btnAddDevice').onclick = () => openAddDeviceModal()
    $('[data-dev-prev]').onclick = () => renderDevices(0)
    $('[data-dev-next]').onclick = () => renderDevices(1)
    const msgPrev = () => { const tab = state.activeMsgTab || 'outbox'; const p=(state.msgPage?.[tab]||0); renderMessages(tab, Math.max(0, p-1)) }
    const msgNext = () => { const tab = state.activeMsgTab || 'outbox'; const p=(state.msgPage?.[tab]||0); renderMessages(tab, p+1) }
    $('[data-msg-prev]').onclick = msgPrev
    $('[data-msg-next]').onclick = msgNext
    $('#btnAddTpl').onclick = () => openTemplateModal()
    $('#btnAddContact').onclick = () => openContactModal()
    $('#btnImportCSV').onclick = () => toast('Impor CSV (simulasi)')
    $('#btnExportCSV').onclick = () => {
      const csv = ['name,phone,tags,optin,notes', ...state.contacts.map(c=>`${c.name},${c.phone},"${(c.tags||[]).join('|')}",${c.optin},"${(c.notes||'').replace(/"/g,'""')}"`)].join('\n')
      const blob = new Blob([csv], { type:'text/csv' }); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='contacts.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 500)
    }

    // AI Bot settings wiring
    const aiSel = document.getElementById('aiSession');
    if (aiSel) {
      aiSel.innerHTML='';
      for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; aiSel.append(o) }
      const loadAI = async ()=>{
        const sid = (document.getElementById('aiSession')||{}).value || '';
        if (!sid) return;
        try {
          const cfg = await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/ai`);
          (document.getElementById('aiEnabled')||{}).checked = !!cfg.enabled;
          (document.getElementById('aiModel')||{}).value = cfg.model || '';
          (document.getElementById('aiTemp')||{}).value = cfg.temp ?? '';
          (document.getElementById('aiPrompt')||{}).value = cfg.prompt || '';
          (document.getElementById('aiBaseUrl')||{}).value = cfg.providerBaseUrl || '';
          (document.getElementById('aiApiKey')||{}).value = cfg.providerApiKey || '';
          (document.getElementById('aiAuthHeader')||{}).value = cfg.authHeaderName || '';
          (document.getElementById('aiAuthScheme')||{}).value = cfg.authScheme || '';
          (document.getElementById('aiExtraHeaders')||{}).value = cfg.extraHeaders || '';
        } catch {}
      };
      aiSel.addEventListener('change', loadAI);
      loadAI();
      const aiSave = document.getElementById('aiSave'); if (aiSave) aiSave.onclick = async ()=>{
        const sid = (document.getElementById('aiSession')||{}).value || '';
        const body = {
          enabled: !!(document.getElementById('aiEnabled')||{}).checked,
          model: (document.getElementById('aiModel')||{}).value || undefined,
          temp: Number((document.getElementById('aiTemp')||{}).value || 0.7),
          prompt: (document.getElementById('aiPrompt')||{}).value || undefined,
          providerBaseUrl: (document.getElementById('aiBaseUrl')||{}).value || undefined,
          providerApiKey: (document.getElementById('aiApiKey')||{}).value || undefined,
          authHeaderName: (document.getElementById('aiAuthHeader')||{}).value || undefined,
          authScheme: (document.getElementById('aiAuthScheme')||{}).value || undefined,
          extraHeaders: (document.getElementById('aiExtraHeaders')||{}).value || undefined,
        };
        try {
          await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/ai`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
          toast('Pengaturan AI disimpan');
        } catch { toast('Gagal menyimpan','error') }
      };
      const aiTest = document.getElementById('aiTest'); if (aiTest) aiTest.onclick = async ()=>{
        const sid = (document.getElementById('aiSession')||{}).value || '';
        const text = (document.getElementById('aiTestText')||{}).value || '';
        if (!text) return;
        try {
          const r = await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/ai/test`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
          (document.getElementById('aiResult')||{}).textContent = r.reply || '';
        } catch { (document.getElementById('aiResult')||{}).textContent = 'Error' }
      }

      const providerSel = document.getElementById('aiProvider');
      if (providerSel) providerSel.addEventListener('change', ()=>{
        const v = providerSel.value;
        const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.value=val }
        if (v==='openai'){
          set('aiBaseUrl','https://api.openai.com/v1'); set('aiAuthHeader','Authorization'); set('aiAuthScheme','Bearer'); set('aiExtraHeaders',''); set('aiModel','gpt-4o-mini');
        } else if (v==='agentrouter_bearer'){
          set('aiBaseUrl','https://api.agentrouter.org/v1'); set('aiAuthHeader','Authorization'); set('aiAuthScheme','Bearer'); set('aiExtraHeaders','');
        } else if (v==='agentrouter_xapikey'){
          set('aiBaseUrl','https://api.agentrouter.org/v1'); set('aiAuthHeader','X-API-Key'); set('aiAuthScheme',''); set('aiExtraHeaders','');
        } else if (v==='openrouter'){
          set('aiBaseUrl','https://openrouter.ai/api/v1'); set('aiAuthHeader','Authorization'); set('aiAuthScheme','Bearer'); set('aiExtraHeaders','');
        } else if (v==='groq'){
          set('aiBaseUrl','https://api.groq.com/openai/v1'); set('aiAuthHeader','Authorization'); set('aiAuthScheme','Bearer'); set('aiExtraHeaders',''); set('aiModel','llama3-8b-8192');
        } else if (v==='ollama'){
          set('aiBaseUrl','http://localhost:11434/v1'); set('aiAuthHeader','none'); set('aiAuthScheme',''); set('aiExtraHeaders','{}'); set('aiModel','llama3.1');
        } else if (v==='lmstudio'){
          set('aiBaseUrl','http://localhost:1234/v1'); set('aiAuthHeader','none'); set('aiAuthScheme',''); set('aiExtraHeaders','{}');
        } else { /* custom */ }
      });
    }
  }

  function initTemplatesListInSend(){
    const wrap = $('#templatesList'); wrap.innerHTML=''
    for (const t of state.templates){ const b=document.createElement('button'); b.className='px-3 py-2 rounded border border-slate-200 dark:border-slate-700 w-full text-left hover:bg-slate-50 dark:hover:bg-slate-800'; b.textContent = `${t.name} (${t.category})`; b.onclick=()=>{ $('#sendText').value = t.body.replace(/\{\{(.*?)\}\}/g,(m,v)=>`<${v.trim()}>`); toast('Template dimuat') }; wrap.append(b) }
  }

  function initTemplatesListInBroadcast(){
    const wrap = document.getElementById('bcTemplatesList'); if (!wrap) return; wrap.innerHTML = '';
    for (const t of state.templates){
      const b = document.createElement('button');
      b.className = 'px-3 py-2 rounded border border-slate-200 dark:border-slate-700 w-full text-left hover:bg-slate-50 dark:hover:bg-slate-800';
      b.textContent = `${t.name} (${t.category})`;
      b.onclick = () => { const el = document.getElementById('bcText'); if (el) el.value = t.body; toast('Template dimuat') };
      wrap.append(b);
    }
  }

  function initGuide(){
    const sel = document.getElementById('guideSession'); if (!sel) return;
    sel.innerHTML = '';
    if (state.devices.length === 0){ const opt=document.createElement('option'); opt.textContent='Tidak ada sesi'; opt.disabled=true; opt.selected=true; sel.append(opt) }
    else { for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) } }

    const phone = document.getElementById('guidePhone'); const text = document.getElementById('guideText');
    const render = () => {
      const sid = (sel.value||'');
      const num = (phone||{}).value || '62812xxxxxxx';
      const msg = (text||{}).value || 'Halo dari API';
      const base = window.location.origin;
      const jid = `${num}@s.whatsapp.net`;
      const curl = [`curl -X POST "${base}/${encodeURIComponent(sid)}/messages/send" \\\n+  -H "Content-Type: application/json" \\\n+  -d '${JSON.stringify({ jid, type:'number', message:{ text: msg } })}'`].join('\n');
      const fetchCode = [
        `const res = await fetch('${base}/${encodeURIComponent(sid)}/messages/send', {`,
        `  method: 'POST',`,
        `  headers: { 'Content-Type': 'application/json' },`,
        `  body: JSON.stringify({ jid: '${jid}', type: 'number', message: { text: '${msg.replace(/'/g,"\\'")}' } })`,
        `});`,
        `const data = await res.json();`
      ].join('\n');
      const axiosCode = [
        `const axios = require('axios');`,
        `const body = { jid: '${jid}', type: 'number', message: { text: '${msg.replace(/'/g,"\\'")}' } };`,
        `const { data } = await axios.post('${base}/${encodeURIComponent(sid)}/messages/send', body);`
      ].join('\n');
      const set = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent = val };
      set('guideCurl', curl);
      set('guideFetch', fetchCode);
      set('guideAxios', axiosCode);
    };
    sel.addEventListener('change', render);
    if (phone) phone.addEventListener('input', render);
    if (text) text.addEventListener('input', render);
    render();
  }

  function initTicketsLive(){
    const section = document.querySelector('[data-page="tickets"]'); if (!section) return;
    const sel = document.getElementById('tkSession'); if (sel){ sel.innerHTML=''; for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) } }
    const statusSel = document.getElementById('tkStatus');
    const searchEl = document.getElementById('tkSearch');
    let cursor = null; const stack=[null]; let pos=0;

    async function loadTicketsAPI(mode='reset'){
      const sid = (document.getElementById('tkSession')||{}).value || '';
      if (!sid) return;
      try {
        if (mode==='reset'){ cursor=null; stack.length=0; stack.push(null); pos=0 }
        if (mode==='prev'){ if (pos>0) pos--; cursor = stack[pos] }
        const url = new URL(`${apiBase}/${encodeURIComponent(sid)}/tickets`);
        url.searchParams.set('limit','25');
        if (cursor && mode!=='reset') url.searchParams.set('cursor', String(cursor));
        const st = (statusSel instanceof HTMLSelectElement) ? statusSel.value : '';
        if (st) url.searchParams.set('status', st);
        const q = searchEl && 'value' in searchEl ? searchEl.value.trim() : '';
        if (q) url.searchParams.set('q', q);
        const res = await fetchJSON(url.toString());
        const tbody = document.getElementById('ticketsTable'); if (tbody) tbody.innerHTML='';
        for (const t of (res.data||[])){
          const tr = document.createElement('tr');
          const last = t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString() : '-';
          tr.innerHTML = `<td class="px-3 py-2">${t.pkId}</td><td class="px-3 py-2">${t.customerJid}</td><td class="px-3 py-2">${t.status}</td><td class="px-3 py-2">${t.assignedTo||'-'}</td><td class="px-3 py-2">${t.priority||'-'}</td><td class="px-3 py-2">${last}</td><td class="px-3 py-2 text-right"><button data-open="${t.pkId}" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">Buka</button></td>`;
          tbody && tbody.append(tr);
        }
        const next = res.cursor || null;
        if (mode==='next' && next){ stack.push(next); pos = stack.length-1 }
        if (mode!=='next') cursor = next;
        const info = document.getElementById('ticketsInfo'); if (info) info.textContent = `${(res.data||[]).length} item`;

        const table = document.getElementById('ticketsTable');
        if (table) table.onclick = (e)=>{
          const btn = e.target.closest('button[data-open]'); if(!btn) return;
          const id = btn.getAttribute('data-open');
          openTicketDetail(sid, id);
        }
      } catch { const tbody = document.getElementById('ticketsTable'); if (tbody) tbody.innerHTML=''; const info=document.getElementById('ticketsInfo'); if(info) info.textContent='0 item' }
    }

    async function openTicketDetail(sid, id){
      try {
        const res = await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}`);
        const t = res.data || {};
        const panel = document.getElementById('ticketDetail'); if (!panel) return;
        panel.classList.remove('hidden');
        panel.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between mb-2';
        header.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400">Tiket #${t.pkId} • ${t.customerJid} • ${t.status}</div>`;
        const body = document.createElement('div');
        body.className = 'space-y-2';
        const timeline = document.createElement('div'); timeline.className = 'border rounded p-2 max-h-72 overflow-auto';
        const ul = document.createElement('div'); ul.className = 'space-y-1 text-sm';
        for (const m of (t.messages||[])){
          const who = m.direction==='in' ? 'Pelanggan' : 'Agen';
          const time = m.ts ? new Date(m.ts).toLocaleString() : '';
          const el = document.createElement('div'); el.textContent = `[${time}] ${who}: ${m.text||'-'}`; ul.append(el);
        }
        timeline.append(ul);
        const form = document.createElement('div'); form.className = 'flex items-center gap-2';
        form.innerHTML = `<input id="tkReplyText" class="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2" placeholder="Ketik balasan"/><button id="tkReplySend" class="px-3 py-2 rounded bg-brand text-white text-sm hover:bg-brand-600">Kirim</button>`;
        body.append(timeline, form);
        panel.append(header, body);
        const btn = document.getElementById('tkReplySend'); if (btn) btn.onclick = async ()=>{
          const txtEl = document.getElementById('tkReplyText'); const v = (txtEl&&'value'in txtEl)?txtEl.value:''; if(!v) return;
          try { await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/reply`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: v }) }); toast('Terkirim'); openTicketDetail(sid,id) } catch { toast('Gagal mengirim','error') }
        };
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch { toast('Gagal memuat detail','error') }
    }

    const refresh = document.getElementById('tkRefresh'); if (refresh) refresh.onclick = ()=> loadTicketsAPI('reset');
    if (statusSel) statusSel.addEventListener('change', ()=> loadTicketsAPI('reset'));
    if (searchEl) searchEl.addEventListener('keyup', (e)=>{ if(e.key==='Enter') loadTicketsAPI('reset') });
    const prevBtn = section.querySelector('[data-tk-prev]'); const nextBtn = section.querySelector('[data-tk-next]');
    if (prevBtn) prevBtn.onclick = () => { if (pos===0) return toast('Sudah di halaman pertama'); loadTicketsAPI('prev') }
    if (nextBtn) nextBtn.onclick = () => { if (!cursor) return toast('Akhir daftar'); loadTicketsAPI('next') }
    loadTicketsAPI('reset');
  }
  function initialRender(){
    renderOverview();
    renderDevices();
    renderTemplates();
    initTemplatesListInSend();
    initTemplatesListInBroadcast();
    initGuide();
    initTicketsLive();
    initSend();
    initBroadcast();
    initLogInfinite();
    // If last saved page is one of the removed menus, fallback to overview
    const removedPages = new Set(['messages','contacts','chats','groups']);
    const page = state.page && !removedPages.has(state.page) ? state.page : 'overview'
    switchPage(page)
  }

  function hydrateLog(){
    const frag=document.createDocumentFragment();
    for (const d of state.logs.slice(0,30)){
      const el=document.createElement('div');
      el.textContent = `${fmtDate(d.ts)} - ${d.text}`;
      frag.append(el);
    }
    const list = document.getElementById('logsList'); if (list) list.append(frag);
    const loading = document.getElementById('logsLoading'); if (loading) loading.textContent = 'Scroll for more';
  }

  loadLocal(); seed();
  (async () => {
    await refreshDevicesFromAPI();
    saveLocal();
    initEvents(); initialRender(); hydrateLog();
    setInterval(async ()=>{
      await refreshDevicesFromAPI();
      renderDevices(); renderOverview();
      // keep messages session select in sync with devices
      const msgSelNodes = document.querySelectorAll('#msgSession');
      msgSelNodes.forEach((selEl)=>{
        const sel = selEl;
        const existing = Array.from(sel.options).filter(o=>!o.disabled).map(o=>o.value);
        const deviceIds = state.devices.map(d=>d.id);
        const changed = existing.length !== deviceIds.length || existing.some((v,i)=>v!==deviceIds[i]);
        if (changed){
          sel.innerHTML = '';
          if (deviceIds.length===0){ const opt=document.createElement('option'); opt.textContent='Tidak ada sesi'; opt.disabled=true; opt.selected=true; sel.append(opt) }
          else { for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) } }
        }
      });
    }, 5000)
  })();
})();




