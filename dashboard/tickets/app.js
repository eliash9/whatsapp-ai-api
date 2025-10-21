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

  // lightweight toast helper
  function toast(message, kind='info'){
    try {
      let host = document.getElementById('toastHost')
      if (!host){ host = document.createElement('div'); host.id='toastHost'; host.className='fixed bottom-4 left-1/2 -translate-x-1/2 z-50 space-y-2'; document.body.append(host) }
      const el = document.createElement('div')
      const base='px-3 py-2 rounded shadow text-sm'
      const cls = kind==='error' ? 'bg-red-600 text-white' : kind==='success' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'
      el.className = `${base} ${cls}`
      el.textContent = String(message||'')
      host.append(el)
      setTimeout(()=>{ el.remove() }, 2200)
    } catch { try { alert(message) } catch {} }
  }

  const state = { devices: [], open: { sid: '', id: null }, cursor: null, stack:[null], pos:0, lastCount: -1 }

  function setTheme(){ const dark = document.documentElement.classList.contains('dark'); localStorage.theme = dark?'dark':'light' }
  $('#toggleTheme')?.addEventListener('click', ()=>{ document.documentElement.classList.toggle('dark'); setTheme() })

  async function refreshDevices(){
    try {
      const sessions = await fetchJSON(`${apiBase}/sessions`)
      state.devices = sessions.map(id => ({ id, name: id }))
      const sel = $('#tkSession'); if (sel){
        const prev = sel.value || ''
        sel.innerHTML=''
        for (const d of state.devices){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.append(o) }
        // auto-select first session if none selected
        if (!prev && state.devices.length){ sel.value = state.devices[0].id }
      }
    } catch { state.devices = [] }
  }
  async function loadAgents(){
    try {
      const res = await fetchJSON(`${apiBase}/agents`);
      const sel = document.getElementById('tkAgentSel'); if (sel){ sel.innerHTML='';
        const opt0=document.createElement('option'); opt0.value=''; opt0.textContent='(pilih agen)'; sel.append(opt0);
        for (const a of (res.data||[])){ const o=document.createElement('option'); o.value=a.id; o.textContent=a.name; sel.append(o) }
        const wrap = document.getElementById('tkAgentWrap'); if (wrap) wrap.classList.toggle('hidden', (res.data||[]).length===0)
      }
    } catch { const sel=document.getElementById('tkAgentSel'); if (sel) sel.innerHTML='<option value="">(tidak ada daftar)</option>'; const wrap=document.getElementById('tkAgentWrap'); if (wrap) wrap.classList.add('hidden') }
  }

  async function loadTickets(mode='reset'){
    const sid = ($('#tkSession')||{}).value || '';
    if (!sid) return;
    try {
      if (mode==='reset'){ state.cursor=null; state.stack.length=0; state.stack.push(null); state.pos=0 }
      if (mode==='prev'){ if (state.pos>0) state.pos--; state.cursor = state.stack[state.pos] }
      const url = new URL(`${apiBase}/${encodeURIComponent(sid)}/tickets`)
      url.searchParams.set('limit','25')
      if (mode!=='reset' && state.cursor) url.searchParams.set('cursor', state.cursor)
      const st = ($('#tkStatus') instanceof HTMLSelectElement) ? $('#tkStatus').value : ''
      if (st) url.searchParams.set('status', st)
      const qEl = $('#tkSearch'); const q = qEl && 'value' in qEl ? qEl.value.trim() : ''
      if (q) url.searchParams.set('q', q)
      const res = await fetchJSON(url.toString())
      const list = $('#tkList'); if (list) list.innerHTML=''
      for (const t of (res.data||[])){
        const item = document.createElement('button')
        item.className = 'w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800'
        const last = t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString() : '-'
        const badge = (txt, cls) => `<span class="inline-block px-2 py-0.5 rounded text-[10px] ${cls}">${txt}</span>`
        const stCls = t.status==='closed' ? 'bg-slate-200 dark:bg-slate-800' : t.status==='escalated' ? 'bg-amber-200 dark:bg-amber-600/40' : 'bg-emerald-200 dark:bg-emerald-600/40'
        const prCls = t.priority==='urgent' ? 'bg-red-200 dark:bg-red-600/40' : 'bg-slate-200 dark:bg-slate-800'
        item.innerHTML = `<div class="flex items-center justify-between text-sm font-medium"><div class="truncate">#${t.pkId} • ${t.customerJid}</div><div class="space-x-1">${badge(t.status||'-', stCls)}${t.priority?badge(t.priority, prCls):''}</div></div><div class="text-xs text-slate-500 dark:text-slate-400">${t.assignedTo||'-'} • ${last}</div>`
        // override rendering with number-only JID and last message preview
        const num = (t.customerJid||'').replace(/@.+$/, '')
        const preview = (t.lastText||'').toString().trim() || '-'
        item.innerHTML = `<div class="flex items-center justify-between text-sm font-medium"><div class="truncate">#${t.pkId}  ${num}${t.displayName ? ' - ' + t.displayName : ''}</div><div class="space-x-1">${badge(t.status||'-', stCls)}${t.priority?badge(t.priority, prCls):''}</div></div><div class="text-xs text-slate-500 dark:text-slate-400 truncate">${preview}</div><div class="text-xs text-slate-500 dark:text-slate-400">${t.assignedTo||'-'}  ${last}</div>`
        const right = item.querySelector('.space-x-1');
        if (right && (t.unreadCount||0) > 0) {
          const b = document.createElement('span');
          b.className = 'inline-block px-2 py-0.5 rounded text-[10px] bg-blue-200 dark:bg-blue-600/40';
          b.textContent = String(t.unreadCount);
          right.append(b);
        }
        item.addEventListener('click', ()=> openTicket(sid, t.pkId))
        list && list.append(item)
      }
      const next = res.cursor || null
      if (mode==='next' && next){ state.stack.push(next); state.pos = state.stack.length-1 }
      if (mode!=='next') state.cursor = next
      const info = $('#ticketsInfo'); if (info) info.textContent = `${(res.data||[]).length} item`
    } catch { const list=$('#tkList'); if(list) list.innerHTML=''; const info=$('#ticketsInfo'); if(info) info.textContent='0 item' }
  }

  async function openTicket(sid, id){
    state.open = { sid, id }
    state.lastCount = -1
    await renderTicket(true)
    // mark as read (explicit model) and refresh list
    try { await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/read`, { method:'POST' }); loadTickets('reset') } catch {}
    startAutoRefresh()
  }

  async function renderTicket(scroll=false){
    const { sid, id } = state.open; if (!sid || !id) return;
    try {
      const res = await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}`)
      const t = res.data || {}
      const header = $('#ticketHeader'); if (header) header.textContent = `Tiket #${t.pkId} • ${t.customerJid} • ${t.status}`
      // bind status/agent fields
      const stSel = $('#tkStatusDetail'); if (stSel) stSel.value = t.status || 'open'
      const agSel = $('#tkAgentSel'); if (agSel) agSel.value = t.assignedTo || ''
      const slaEl = $('#tkSla'); if (slaEl) { if (t.slaDueAt){ const d=new Date(t.slaDueAt); const pad=(n)=> String(n).padStart(2,'0'); const v=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; slaEl.value=v } else slaEl.value='' }
      // enable/disable destructive actions depending on status
      const isClosed = String(t.status||'').toLowerCase() === 'closed'
      const clrBtn = document.getElementById('tkClear'); if (clrBtn) clrBtn.disabled = !isClosed
      const delBtn = document.getElementById('tkDelete'); if (delBtn) delBtn.disabled = !isClosed
      try { const ai = await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/ai`); const btn = document.getElementById('tkAiToggle'); if (btn) btn.textContent = ai.enabled ? 'AI: Aktif' : 'AI: Nonaktif' } catch {}
      const msgsEl = $('#ticketMessages'); if (msgsEl){
        const count = (t.messages||[]).length
        if (count !== state.lastCount){
          msgsEl.innerHTML=''
          for (const m of (t.messages||[])){
            const inbound = m.direction === 'in'
            const time = m.ts ? new Date(m.ts).toLocaleTimeString() : ''
            const row = document.createElement('div')
            row.className = `flex ${inbound ? 'justify-start' : 'justify-end'} my-1`
            const bubble = document.createElement('div')
            bubble.className = `${inbound ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700' : 'bg-brand text-white'} rounded-2xl px-3 py-2 max-w-[75%] shadow-sm space-y-2`
            
            // media preview if linked
            if (m.messagePkId){
              const metaUrl = `${apiBase}/${encodeURIComponent(state.open.sid)}/tickets/${encodeURIComponent(state.open.id)}/media/${encodeURIComponent(m.messagePkId)}/meta`
              try {
                const meta = await fetchJSON(metaUrl)
                const mediaUrl = `${apiBase}/${encodeURIComponent(state.open.sid)}/tickets/${encodeURIComponent(state.open.id)}/media/${encodeURIComponent(m.messagePkId)}`
                if ((meta.type||'').startsWith('image')){
                  const img = document.createElement('img'); img.src = mediaUrl; img.alt = 'gambar'; img.className='max-w-full rounded-md border border-slate-200 dark:border-slate-700 cursor-zoom-in'; img.addEventListener('click', ()=> openLightbox(mediaUrl)); bubble.append(img)
                } else if ((meta.type||'').startsWith('video')){
                  const vid = document.createElement('video'); vid.src = mediaUrl; vid.controls = true; vid.className='max-w-full rounded-md border border-slate-200 dark:border-slate-700'; bubble.append(vid)
                } else {
                 // const a=document.createElement('a'); a.href=mediaUrl; a.textContent='Unduh media'; a.target='_blank'; bubble.append(a)
                }
              } catch {}
            }
            // text content if any
            if (m.text){ const p=document.createElement('div'); p.textContent = m.text; bubble.append(p) }
            // timestamp inside bubble
            const ts = document.createElement('div'); ts.className = `text-[10px] ${inbound ? 'text-slate-500' : 'text-white/80'} text-right`
            ts.textContent = time; bubble.append(ts)
            row.append(bubble)
            msgsEl.append(row)
          }
          if (scroll) msgsEl.scrollTop = msgsEl.scrollHeight
          state.lastCount = count
        }
      }
    } catch {}
  }

  let refreshTimer = null
  function startAutoRefresh(){ if (refreshTimer) clearInterval(refreshTimer); refreshTimer = setInterval(()=> renderTicket(true), 5000) }

  // auto refresh ticket list periodically
  let ticketsRefreshTimer = null
  function startTicketsAutoRefresh(){ if (ticketsRefreshTimer) clearInterval(ticketsRefreshTimer); ticketsRefreshTimer = setInterval(()=> loadTickets('reset'), 7000) }

  async function sendReply(){
    const { sid, id } = state.open; if (!sid || !id) return;
    const inp = $('#tkReplyText'); const v = inp && 'value' in inp ? inp.value : '';
    const fileInput = document.getElementById('tkReplyFile');
    const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (!v && !file) return;
    try {
      let body = {};
      let optimistic = null;
      if (file){
        const dataUrl = await new Promise((resolve, reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=()=>reject(new Error('gagal baca file')); fr.readAsDataURL(file) })
        const mime = file.type || ''
        if (mime.startsWith('image/')) { body = { image: { dataUrl, mimetype: mime, caption: v } }; optimistic = { kind:'image', dataUrl, caption: v } }
        else if (mime.startsWith('video/')) { body = { video: { dataUrl, mimetype: mime, caption: v } }; optimistic = { kind:'video', dataUrl, caption: v } }
        else { body = { document: { dataUrl, mimetype: mime }, text: v } }
      } else {
        body = { text: v }
      }

      // optimistic render for outgoing media
      if (optimistic){
        const msgsEl = $('#ticketMessages');
        if (msgsEl){
          const row = document.createElement('div'); row.className='flex justify-end my-1';
          const bubble = document.createElement('div'); bubble.className='bg-brand text-white rounded-2xl px-3 py-2 max-w-[75%] shadow-sm space-y-2';
          if (optimistic.kind==='image'){
            const img=document.createElement('img'); img.src = optimistic.dataUrl; img.alt='gambar'; img.className='max-w-full rounded-md border border-slate-200/20 cursor-zoom-in'; img.addEventListener('click', ()=> openLightbox(optimistic.dataUrl)); bubble.append(img)
          } else if (optimistic.kind==='video'){
            const vid=document.createElement('video'); vid.src = optimistic.dataUrl; vid.controls=true; vid.className='max-w-full rounded-md border border-slate-200/20'; bubble.append(vid)
          }
          if (optimistic.caption){ const p=document.createElement('div'); p.textContent = optimistic.caption; bubble.append(p) }
          const ts=document.createElement('div'); ts.className='text-[10px] text-white/80 text-right'; ts.textContent = new Date().toLocaleTimeString(); bubble.append(ts)
          row.append(bubble);
          msgsEl.append(row); msgsEl.scrollTop = msgsEl.scrollHeight;
        }
      }

      await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/reply`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      if (inp) inp.value='';
      if (fileInput) { fileInput.value=''; const fn=$('#tkReplyFileName'); if (fn) fn.textContent='' }
      // re-sync after a short delay to let server persist and link messagePkId
      setTimeout(()=>{ renderTicket(true) }, 800);
    } catch {}
  }
  const sendBtn = $('#tkReplySend'); if (sendBtn) sendBtn.addEventListener('click', sendReply)
  const replyInput = $('#tkReplyText'); if (replyInput) replyInput.addEventListener('keydown', (e)=>{
    if (typeof qrMenuVisible !== 'undefined' && qrMenuVisible) return; // when slash menu open, defer to menu handler
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendReply() }
  })

  // Quick Replies state & helpers
  let quickReplies = [];
  let qrMenuVisible = false;
  let qrFiltered = [];
  let qrSel = -1;
  let qrEditingId = null;

  async function loadQuickReplies(q=''){
    try {
      const url = new URL(`${apiBase}/api/quick-replies`);
      if (q) url.searchParams.set('q', q);
      const res = await fetchJSON(url.toString());
      quickReplies = res.data || [];
    } catch { quickReplies = [] }
  }

  function renderQrMenu(){
    const wrap = document.getElementById('qrMenu'); const list = document.getElementById('qrMenuList');
    if (!wrap || !list) return;
    list.innerHTML = '';
    if (!qrFiltered.length){ wrap.classList.add('hidden'); qrMenuVisible=false; return; }
    qrFiltered.slice(0, 20).forEach((it, idx) => {
      const btn = document.createElement('button');
      btn.className = `block w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${idx===qrSel?'bg-slate-100 dark:bg-slate-700':''}`;
      const prev = (it.text||'').toString().replace(/\s+/g, ' ').slice(0, 80);
      btn.innerHTML = `<div class="font-medium text-sm">${it.title||'(tanpa judul)'}</div><div class="text-xs text-slate-500 dark:text-slate-400 truncate">${prev}</div>`;
      btn.addEventListener('click', ()=> selectQr(idx));
      list.append(btn);
    })
    wrap.classList.remove('hidden');
    qrMenuVisible = true;
  }

  function hideQrMenu(){ const wrap = document.getElementById('qrMenu'); if (wrap){ wrap.classList.add('hidden') } qrMenuVisible=false; qrSel=-1 }

  function normTitle(s){ return String(s||'').toLowerCase().trim().replace(/\s+/g,'-') }
  function refreshQrFilter(){
    const inp = document.getElementById('tkReplyText'); const v = inp && 'value' in inp ? String(inp.value) : '';
    if (!v || v[0] !== '/') { hideQrMenu(); return; }
    const after = v.slice(1);
    const token = after.split(/\s/)[0].toLowerCase();
    const src = quickReplies || [];
    const exact = src.find(it => normTitle(it.title) === normTitle(token));
    if (exact && (after === token || after === token + '')){
      if (inp && 'value' in inp){ inp.value = exact.text || ''; }
      hideQrMenu();
      return;
    }
    const q = token;
    qrFiltered = q ? src.filter(it => normTitle(it.title).includes(q) || (it.text||'').toLowerCase().includes(q)) : src.slice();
    qrSel = qrFiltered.length ? 0 : -1;
    renderQrMenu();
  }

  function selectQr(idx){
    if (idx < 0 || idx >= qrFiltered.length) return;
    const it = qrFiltered[idx];
    const inp = document.getElementById('tkReplyText');
    if (inp && 'value' in inp){ inp.value = it.text || ''; hideQrMenu(); sendReply(); }
  }

  // Bind input events for slash menu
  if (replyInput){
    replyInput.addEventListener('input', async ()=>{ if (!quickReplies.length) await loadQuickReplies(''); refreshQrFilter(); })
    replyInput.addEventListener('keydown', (e)=>{
      if (!qrMenuVisible) return;
      if (e.key === 'ArrowDown'){ e.preventDefault(); if (qrFiltered.length){ qrSel = (qrSel+1) % qrFiltered.length; renderQrMenu() } }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); if (qrFiltered.length){ qrSel = (qrSel-1+qrFiltered.length) % qrFiltered.length; renderQrMenu() } }
      else if (e.key === 'Enter'){ e.preventDefault(); if (qrSel>=0) selectQr(qrSel) }
      else if (e.key === 'Escape'){ e.preventDefault(); hideQrMenu() }
    })
  }

  // Preload quick replies on page load for faster slash matching
  ;(async () => { try { await loadQuickReplies('') } catch {} })()

  // Quick Replies Manager modal logic
  function openQrModal(){ const m=document.getElementById('qrModal'); if (!m) return; m.classList.remove('hidden'); m.classList.add('flex'); renderQrList(); }
  function closeQrModal(){ const m=document.getElementById('qrModal'); if (!m) return; m.classList.add('hidden'); m.classList.remove('flex'); }

  async function renderQrList(q=''){
    await loadQuickReplies(q);
    const list = document.getElementById('qrList'); if (!list) return;
    list.innerHTML='';
    for (const it of (quickReplies||[])){
      const row = document.createElement('button');
      row.className = 'w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800';
      row.innerHTML = `<div class="font-medium text-sm">${it.title||'(tanpa judul)'} <span class="text-[10px] text-slate-500">${new Date(it.updatedAt||it.createdAt||Date.now()).toLocaleString()}</span></div><div class="text-xs text-slate-500 truncate">${(it.text||'').toString().replace(/\s+/g,' ').slice(0,120)}</div>`;
      row.addEventListener('click', ()=>{ qrEditingId = it.id; const t=$('#qrTitle'); const b=$('#qrText'); if (t) t.value = it.title||''; if (b) b.value = it.text||''; const h=$('#qrHint'); if (h) h.textContent = 'Edit item terpilih.'; });
      list.append(row);
    }
  }

  async function saveQr(){
    const titleEl = document.getElementById('qrTitle'); const textEl = document.getElementById('qrText');
    const title = titleEl && 'value' in titleEl ? titleEl.value.trim() : '';
    const text = textEl && 'value' in textEl ? textEl.value.trim() : '';
    if (!title || !text) return;
    try {
      if (qrEditingId){
        await fetchJSON(`${apiBase}/quick-replies/${encodeURIComponent(qrEditingId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, text }) });
      } else {
        await fetchJSON(`${apiBase}/quick-replies`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, text }) });
      }
      qrEditingId = null; if (titleEl) titleEl.value=''; if (textEl) textEl.value=''; await renderQrList('');
    } catch {}
  }

  async function deleteQr(){ if (!qrEditingId) return; try { await fetchJSON(`${apiBase}/quick-replies/${encodeURIComponent(qrEditingId)}`, { method:'DELETE' }); qrEditingId=null; const t=$('#qrTitle'); if (t) t.value=''; const b=$('#qrText'); if (b) b.value=''; await renderQrList('') } catch {} }

  document.getElementById('qrManageBtn')?.addEventListener('click', async ()=>{ await renderQrList(''); openQrModal(); })
  document.getElementById('qrClose')?.addEventListener('click', closeQrModal)
  document.getElementById('qrNew')?.addEventListener('click', ()=>{ qrEditingId=null; const t=$('#qrTitle'); if (t) t.value=''; const b=$('#qrText'); if (b) b.value=''; const h=$('#qrHint'); if (h) h.textContent='Buat item baru.' })
  document.getElementById('qrSave')?.addEventListener('click', saveQr)
  document.getElementById('qrDelete')?.addEventListener('click', deleteQr)
  document.getElementById('qrSearch')?.addEventListener('input', (e)=>{ const q = e && e.target && 'value' in e.target ? e.target.value : ''; renderQrList(q) })

  // attachment picker
  const pickBtn = document.getElementById('tkReplyPick'); const fileInput = document.getElementById('tkReplyFile'); const fileName = document.getElementById('tkReplyFileName');
  if (pickBtn && fileInput){ pickBtn.addEventListener('click', ()=> fileInput.click()); fileInput.addEventListener('change', ()=>{ const f=fileInput.files&&fileInput.files[0]; if (fileName) fileName.textContent = f ? `${f.name} (${f.type||'unknown'})` : '' }) }

  // Lightbox handlers
  function openLightbox(src){ const lb=document.getElementById('mediaLightbox'); const img=document.getElementById('mediaLightboxImg'); if (img) img.src = src; if (lb){ lb.classList.remove('hidden'); lb.classList.add('flex') } }
  function closeLightbox(){ const lb=document.getElementById('mediaLightbox'); if (!lb) return; lb.classList.add('hidden'); lb.classList.remove('flex') }
  window.openLightbox = openLightbox; // used by render
  document.getElementById('mediaLightboxClose')?.addEventListener('click', closeLightbox)
  document.getElementById('mediaLightbox')?.addEventListener('click', (e)=>{ if (e.target && e.target.id === 'mediaLightbox') closeLightbox() })
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeLightbox() })

  // save meta handlers
  $('#tkSaveMeta')?.addEventListener('click', async ()=>{
    const { sid, id } = state.open; if (!sid || !id) return;
    const status = ($('#tkStatusDetail')||{}).value || '';
    const assignedTo = ($('#tkAgentSel')||{}).value || '';
    const slaDueAt = ($('#tkSla')||{}).value || '';
    try { await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status, assignedTo, slaDueAt: slaDueAt||undefined }) }); toast('Disimpan'); await renderTicket(false); await loadTickets('reset') } catch { toast('Gagal simpan','error') }
  })
  $('#tkClose')?.addEventListener('click', async ()=>{
    const { sid, id } = state.open; if (!sid || !id) return;
    try { await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/close`, { method:'POST' }); toast('Ditutup'); await renderTicket(false); await loadTickets('reset') } catch { toast('Gagal tutup','error') }
  })
  $('#tkRemind')?.addEventListener('click', async ()=>{
    const { sid, id } = state.open; if (!sid || !id) return;
    try { await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/remind`, { method:'POST' }); toast('Pengingat terkirim'); await renderTicket(true); await loadTickets('reset') } catch { toast('Gagal kirim pengingat','error') }
  })
  $('#tkEscalate')?.addEventListener('click', async ()=>{
    const { sid, id } = state.open; if (!sid || !id) return;
    try { await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/escalate`, { method:'POST' }); toast('Tiket dieskalasi'); await renderTicket(true); await loadTickets('reset') } catch { toast('Gagal eskalasi','error') }
  })

  // Clear chat (only if closed)
  document.getElementById('tkClear')?.addEventListener('click', async ()=>{
    const { sid, id } = state.open; if (!sid || !id) return;
    try { await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/messages`, { method:'DELETE' }); toast('Chat dibersihkan'); await renderTicket(true); await loadTickets('reset') } catch { toast('Gagal bersihkan','error') }
  })

  // Delete ticket (only if closed)
  document.getElementById('tkDelete')?.addEventListener('click', async ()=>{
    const { sid, id } = state.open; if (!sid || !id) return;
    if (!confirm('Yakin hapus tiket ini? Tindakan tidak bisa dibatalkan.')) return;
    try { await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}`, { method:'DELETE' }); toast('Tiket dihapus'); state.open = { sid:'', id:null }; const msgs=document.getElementById('ticketMessages'); if (msgs) msgs.innerHTML=''; const hdr=document.getElementById('ticketHeader'); if (hdr) hdr.textContent='Pilih tiket dari sidebar untuk mulai percakapan.'; await loadTickets('reset') } catch { toast('Gagal hapus tiket','error') }
  })

  // Toggle AI per-ticket
  document.getElementById('tkAiToggle')?.addEventListener('click', async ()=>{
    const { sid, id } = state.open; if (!sid || !id) return;
    try {
      const cur = await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/ai`);
      const enabled = !(cur.enabled === true);
      await fetchJSON(`${apiBase}/${encodeURIComponent(sid)}/tickets/${encodeURIComponent(id)}/ai`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ enabled }) })
      const btn = document.getElementById('tkAiToggle'); if (btn) btn.textContent = enabled ? 'AI: Aktif' : 'AI: Nonaktif'
      toast(enabled ? 'AI diaktifkan untuk tiket ini' : 'AI dinonaktifkan untuk tiket ini')
    } catch { toast('Gagal mengubah AI','error') }
  })

  // Bindings
  $('#tkRefresh')?.addEventListener('click', ()=> loadTickets('reset'))
  $('#tkStatus')?.addEventListener('change', ()=> loadTickets('reset'))
  $('#tkSession')?.addEventListener('change', ()=> loadTickets('reset'))
  $('#tkSearch')?.addEventListener('keyup', (e)=>{ if (e.key==='Enter') loadTickets('reset') })
  $('[data-tk-prev]')?.addEventListener('click', ()=>{ if (state.pos===0) return; loadTickets('prev') })
  $('[data-tk-next]')?.addEventListener('click', ()=>{ if (!state.cursor) return; state.pos=state.stack.length-1; loadTickets('next') })

  ;(async () => { await refreshDevices(); await loadAgents();
    // Show SLA controls only if SLA is enabled via env (inferred by presence of global marker or query)
    const enableSla = new URLSearchParams(location.search).get('sla') === '1';
    if (enableSla) { const w=document.getElementById('tkSlaWrap'); if (w) w.classList.remove('hidden') }
    await loadTickets('reset')
    startTicketsAutoRefresh()
  })()
})()
