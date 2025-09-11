// Static site that reads photos from /images/manifest.json (built by GitHub Actions)
// Conversation is stored locally; you can export/import JSON to keep in /data.

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

document.addEventListener('DOMContentLoaded', async () => {
  bindUI();
  await loadSettings();
  await loadManifestAndRender();
  await loadConversation();
});

function bindUI(){
  // Tabs
  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    $$('.section').forEach(sec => sec.classList.remove('active'));
    $('#' + tab).classList.add('active');
  }));

  // Photos
  $('#refreshBtn').addEventListener('click', loadManifestAndRender);

  // Chat
  $('#chatForm').addEventListener('submit', onAddMessage);
  $('#clearChatBtn').addEventListener('click', () => {
    if(confirm('Clear the entire conversation?')){
      saveConversation([]);
      renderMessages([]);
    }
  });
  $('#exportChatBtn').addEventListener('click', exportConversation);
  $('#importChatInput').addEventListener('change', importConversation);

  // Settings
  $('#settingsBtn').addEventListener('click', () => $('#settingsModal').classList.remove('hidden'));
  $('#closeSettings').addEventListener('click', () => $('#settingsModal').classList.add('hidden'));
  $('#saveSettings').addEventListener('click', saveSettings);
}

// ---------------- Settings
function loadSettings(){
  const s = JSON.parse(localStorage.getItem('us_settings') || '{}');
  const nameA = s.nameA || 'Me';
  const nameB = s.nameB || 'Partner';
  $('#nameA').value = nameA;
  $('#nameB').value = nameB;
  $('#nameALabel').textContent = nameA;
  $('#nameBLabel').textContent = nameB;
  const theme = s.theme || 'dark';
  document.documentElement.classList.toggle('light', theme === 'light');
  $('#themeToggle').checked = theme === 'light';
}

function saveSettings(){
  const s = {
    nameA: $('#nameA').value.trim() || 'Me',
    nameB: $('#nameB').value.trim() || 'Partner',
    theme: $('#themeToggle').checked ? 'light' : 'dark'
  };
  localStorage.setItem('us_settings', JSON.stringify(s));
  $('#nameALabel').textContent = s.nameA;
  $('#nameBLabel').textContent = s.nameB;
  document.documentElement.classList.toggle('light', s.theme === 'light');
  $('#settingsModal').classList.add('hidden');
}

// ---------------- Photos — manifest
async function loadManifestAndRender(){
  const gallery = $('#gallery');
  gallery.innerHTML = '<div class="hint">Loading images…</div>';
  try{
    const res = await fetch('images/manifest.json', {cache:'no-store'});
    if(!res.ok) throw new Error('manifest not found');
    const manifest = await res.json();
    const files = (manifest.files || []).filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));
    renderGallery(files);
  }catch(e){
    gallery.innerHTML = '<div class="hint">No manifest yet. Add images in <code>images/</code> and wait for GitHub Actions to generate <code>manifest.json</code>.</div>';
  }
}

function renderGallery(files){
  const g = $('#gallery');
  g.innerHTML = '';
  if(!files.length){
    g.innerHTML = '<div class="hint">No photos yet. Commit images to <code>images/</code>.</div>';
    return;
  }
  for(const fn of files){
    const url = 'images/' + encodeURIComponent(fn);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${url}" alt="Photo ${fn}">
      <div class="small">${escapeHTML(fn)}</div>
    `;
    g.appendChild(card);
  }
}

// ---------------- Conversation (local)
function loadConversation(){
  const raw = localStorage.getItem('us_conversation');
  let msgs = [];
  if(raw){
    try{ msgs = JSON.parse(raw) || []; } catch{ msgs = []; }
  }
  renderMessages(msgs);
}
function saveConversation(msgs){
  localStorage.setItem('us_conversation', JSON.stringify(msgs));
}
function onAddMessage(e){
  e.preventDefault();
  const from = (new FormData(e.target)).get('from') || 'A';
  const text = $('#messageInput').value.trim();
  if(!text) return;
  const raw = localStorage.getItem('us_conversation');
  const msgs = raw ? (JSON.parse(raw)||[]) : [];
  msgs.push({ id: Date.now(), from, text, ts: Date.now() });
  saveConversation(msgs);
  $('#messageInput').value='';
  renderMessages(msgs);
}
function renderMessages(msgs){
  const names = getNames();
  const ul = $('#messages'); ul.innerHTML = '';
  for(const m of msgs.sort((a,b)=>a.ts-b.ts)){
    const li = document.createElement('li');
    li.className = 'msg';
    const who = m.from === 'A' ? names.A : names.B;
    li.innerHTML = `
      <div class="avatar">${initials(who)}</div>
      <div>
        <div class="meta">${escapeHTML(who)} <span class="time">· ${new Date(m.ts).toLocaleString()}</span></div>
        <div class="text">${escapeHTML(m.text)}</div>
      </div>
      <div class="row">
        <button class="link" title="Edit">✏️</button>
        <button class="link" title="Delete">🗑️</button>
      </div>
    `;
    const [btnEdit, btnDelete] = li.querySelectorAll('.row .link');
    btnDelete.addEventListener('click', () => {
      if(confirm('Delete this message?')){
        const next = msgs.filter(x => x.id !== m.id);
        saveConversation(next); renderMessages(next);
      }
    });
    btnEdit.addEventListener('click', () => {
      const textDiv = li.querySelector('.text');
      const textarea = document.createElement('textarea');
      textarea.value = m.text;
      textarea.style.minHeight = '80px';
      textDiv.replaceWith(textarea);
      const row = li.querySelector('.row');
      row.innerHTML = '';
      const saveBtn = document.createElement('button'); saveBtn.className='link'; saveBtn.textContent='💾 Save';
      const cancelBtn = document.createElement('button'); cancelBtn.className='link'; cancelBtn.textContent='✖️ Cancel';
      row.append(saveBtn, cancelBtn);
      saveBtn.addEventListener('click', ()=>{
        const val = textarea.value.trim();
        if(!val){ alert('Message cannot be empty.'); return; }
        m.text = val;
        const next = msgs.map(x => x.id===m.id ? m : x);
        saveConversation(next); renderMessages(next);
      });
      cancelBtn.addEventListener('click', ()=> renderMessages(msgs));
    });
    ul.appendChild(li);
  }
}
function getNames(){
  const s = JSON.parse(localStorage.getItem('us_settings') || '{}');
  return { A: s.nameA || 'Me', B: s.nameB || 'Partner' };
}

// Export / Import JSON for conversation
function exportConversation(){
  const data = {
    v: 1,
    exportedAt: Date.now(),
    messages: JSON.parse(localStorage.getItem('us_conversation')||'[]'),
    settings: JSON.parse(localStorage.getItem('us_settings')||'{}')
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'conversation.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importConversation(e){
  const f = e.target.files?.[0]; e.target.value='';
  if(!f) return;
  f.text().then(txt => {
    const data = JSON.parse(txt);
    const msgs = data.messages || [];
    saveConversation(msgs);
    renderMessages(msgs);
    alert('Conversation imported.');
  }).catch(err => alert('Import failed: ' + err.message));
}

// Utils
function initials(name){
  const parts = (name||'').split(/\s+/).filter(Boolean);
  const i = parts.slice(0,2).map(p=>p[0].toUpperCase()).join('');
  return i || 'U';
}
function escapeHTML(str){
  return (str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
