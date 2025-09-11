// Us — Photos & Conversation
// Static site that stores data locally via IndexedDB. Export/Import enables moving data across devices.

const DB_NAME = 'usApp';
const DB_VERSION = 1;
let db;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

document.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  await ensureStores();
  bindUI();
  await loadSettings();
  await renderAll();
});

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('photos')){
        const store = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_date','addedAt');
      }
      if(!db.objectStoreNames.contains('messages')){
        const store = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_date','ts');
      }
      if(!db.objectStoreNames.contains('settings')){
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(); };
  });
}

function ensureStores(){ return Promise.resolve(); }

// ---------- IndexedDB helpers
function tx(store, mode='readonly'){
  const t = db.transaction(store, mode);
  return { t, s: t.objectStore(store) };
}

function add(store, value){
  return new Promise((resolve, reject) => {
    const {s} = tx(store, 'readwrite');
    const req = s.add(value);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
function put(store, value){
  return new Promise((resolve, reject) => {
    const {s} = tx(store, 'readwrite');
    const req = s.put(value);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
function del(store, key){
  return new Promise((resolve, reject) => {
    const {s} = tx(store, 'readwrite');
    const req = s.delete(key);
    req.onsuccess = ()=> resolve();
    req.onerror = ()=> reject(req.error);
  });
}
function getAll(store, index=null){
  return new Promise((resolve, reject) => {
    const {s} = tx(store);
    const src = index ? s.index(index) : s;
    const req = src.getAll();
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
function clearStore(store){
  return new Promise((resolve, reject) => {
    const {s} = tx(store, 'readwrite');
    const req = s.clear();
    req.onsuccess = ()=> resolve();
    req.onerror = ()=> reject(req.error);
  });
}

// ---------- UI bindings
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
  $('#photoInput').addEventListener('change', onAddPhotos);
  $('#clearPhotosBtn').addEventListener('click', async () => {
    if(confirm('Clear ALL photos? This cannot be undone.')){
      await clearStore('photos');
      await renderGallery();
    }
  });

  // Export/Import
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importInput').addEventListener('change', importBackup);

  // Chat
  $('#chatForm').addEventListener('submit', onAddMessage);
  $('#clearChatBtn').addEventListener('click', async () => {
    if(confirm('Clear the entire conversation?')){
      await clearStore('messages');
      await renderMessages();
    }
  });

  // Settings
  $('#settingsBtn').addEventListener('click', () => $('#settingsModal').classList.remove('hidden'));
  $('#closeSettings').addEventListener('click', () => $('#settingsModal').classList.add('hidden'));
  $('#saveSettings').addEventListener('click', saveSettings);
}

async function renderAll(){
  await renderGallery();
  await renderMessages();
}

// ---------- Settings & Theme
async function loadSettings(){
  const list = await getAll('settings');
  const s = Object.fromEntries(list.map(i => [i.key, i.value]));
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

async function saveSettings(){
  const nameA = $('#nameA').value.trim() || 'Me';
  const nameB = $('#nameB').value.trim() || 'Partner';
  await put('settings', {key:'nameA', value:nameA});
  await put('settings', {key:'nameB', value:nameB});
  const theme = $('#themeToggle').checked ? 'light' : 'dark';
  await put('settings', {key:'theme', value:theme});

  $('#nameALabel').textContent = nameA;
  $('#nameBLabel').textContent = nameB;
  document.documentElement.classList.toggle('light', theme === 'light');
  $('#settingsModal').classList.add('hidden');
}

// ---------- Photos
async function onAddPhotos(e){
  const files = Array.from(e.target.files || []);
  if(!files.length) return;
  for(const file of files){
    try{
      const blob = await maybeResize(file, 1920);
      await add('photos', { blob, addedAt: Date.now(), name: file.name });
    }catch(err){ console.error(err); }
  }
  e.target.value = '';
  await renderGallery();
}

async function renderGallery(){
  const photos = await getAll('photos','by_date');
  const g = $('#gallery');
  g.innerHTML = '';
  for(const p of photos.sort((a,b)=>b.addedAt-a.addedAt)){
    const url = URL.createObjectURL(p.blob);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${url}" alt="Photo">
      <div class="actions">
        <button class="link" title="Download">⬇️</button>
        <button class="link" title="Delete">🗑️</button>
      </div>
      <div class="small">${escapeHTML(p.name || 'photo')}</div>
    `;
    const [btnDownload, btnDelete] = card.querySelectorAll('.actions .link');
    btnDownload.addEventListener('click', () => downloadBlob(p.blob, p.name || 'photo.jpg'));
    btnDelete.addEventListener('click', async () => {
      if(confirm('Delete this photo?')){
        await del('photos', p.id);
        await renderGallery();
      }
    });
    g.appendChild(card);
  }
}

// Resize large images to save space (keeps EXIF orientation via canvas draw)
function maybeResize(file, maxDim=1920){
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = ()=>{
      let {width:w, height:h} = img;
      if(Math.max(w,h) <= maxDim){
        URL.revokeObjectURL(url);
        resolve(file);
        return;
      }
      const scale = maxDim / Math.max(w,h);
      const nw = Math.round(w*scale);
      const nh = Math.round(h*scale);
      const canvas = document.createElement('canvas');
      canvas.width = nw; canvas.height = nh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, nw, nh);
      canvas.toBlob(b => {
        URL.revokeObjectURL(url);
        resolve(b);
      }, 'image/jpeg', 0.9);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ---------- Chat
async function onAddMessage(e){
  e.preventDefault();
  const from = (new FormData(e.target)).get('from') || 'A';
  const text = $('#messageInput').value.trim();
  if(!text) return;
  await add('messages', { from, text, ts: Date.now() });
  $('#messageInput').value='';
  await renderMessages();
}

async function renderMessages(){
  const msgs = (await getAll('messages','by_date')).sort((a,b)=>a.ts-b.ts);
  const names = await getNames();
  const ul = $('#messages'); ul.innerHTML = '';
  for(const m of msgs){
    const li = document.createElement('li');
    li.className = 'msg';
    const who = m.from === 'A' ? names.A : names.B;
    li.innerHTML = `
      <div class="avatar">${initials(who)}</div>
      <div>
        <div class="meta">${escapeHTML(who)} <span class="time">· ${fmtTime(m.ts)}</span></div>
        <div class="text">${escapeHTML(m.text)}</div>
      </div>
      <div class="row">
        <button class="link" title="Edit">✏️</button>
        <button class="link" title="Delete">🗑️</button>
      </div>
    `;
    const [btnEdit, btnDelete] = li.querySelectorAll('.row .link');
    btnDelete.addEventListener('click', async ()=>{
      if(confirm('Delete this message?')){
        await del('messages', m.id);
        await renderMessages();
      }
    });
    btnEdit.addEventListener('click', ()=> editMessage(li, m));
    ul.appendChild(li);
  }
}

function editMessage(li, m){
  const textDiv = li.querySelector('.text');
  const original = m.text;
  const textarea = document.createElement('textarea');
  textarea.value = original;
  textarea.style.minHeight = '80px';
  textDiv.replaceWith(textarea);
  const row = li.querySelector('.row');
  row.innerHTML = '';
  const saveBtn = document.createElement('button'); saveBtn.className='link'; saveBtn.textContent='💾 Save';
  const cancelBtn = document.createElement('button'); cancelBtn.className='link'; cancelBtn.textContent='✖️ Cancel';
  row.append(saveBtn, cancelBtn);
  saveBtn.addEventListener('click', async ()=>{
    const val = textarea.value.trim();
    if(!val){ alert('Message cannot be empty.'); return; }
    m.text = val;
    await put('messages', m);
    await renderMessages();
  });
  cancelBtn.addEventListener('click', async ()=>{
    await renderMessages();
  });
}

// ---------- Export / Import
async function exportBackup(){
  const [photos, messages, settingsArr] = await Promise.all([
    getAll('photos'), getAll('messages'), getAll('settings')
  ]);
  const settings = Object.fromEntries(settingsArr.map(i=>[i.key, i.value]));
  // Convert photo blobs to data URLs
  const photosSerialized = await Promise.all(photos.map(async p => ({
    id: p.id, name: p.name, addedAt: p.addedAt,
    dataURL: await blobToDataURL(p.blob)
  })));
  const payload = { v:1, exportedAt: Date.now(), photos: photosSerialized, messages, settings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const stamp = new Date().toISOString().slice(0,10);
  downloadBlob(blob, `us-backup-${stamp}.json`);
}

async function importBackup(e){
  const file = e.target.files?.[0];
  e.target.value = '';
  if(!file) return;
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    if(!data || data.v !== 1) throw new Error('Unsupported backup format');
    if(!confirm('Import will MERGE with existing data. Continue?')) return;
    // Photos
    for(const p of data.photos || []){
      const blob = await dataURLToBlob(p.dataURL);
      await add('photos', { blob, addedAt: p.addedAt || Date.now(), name: p.name || 'photo' });
    }
    // Messages
    for(const m of data.messages || []){
      await add('messages', { from: m.from || 'A', text: m.text || '', ts: m.ts || Date.now() });
    }
    // Settings
    const s = data.settings || {};
    if(s.nameA) await put('settings', {key:'nameA', value:s.nameA});
    if(s.nameB) await put('settings', {key:'nameB', value:s.nameB});
    if(s.theme) await put('settings', {key:'theme', value:s.theme});
    await loadSettings();
    await renderAll();
    alert('Import complete.');
  }catch(err){
    console.error(err);
    alert('Import failed: ' + err.message);
  }
}

// ---------- Utils
async function getNames(){
  const list = await getAll('settings');
  const s = Object.fromEntries(list.map(i => [i.key, i.value]));
  return { A: s.nameA || 'Me', B: s.nameB || 'Partner' };
}

function initials(name){
  const parts = (name||'').split(/\s+/).filter(Boolean);
  const i = parts.slice(0,2).map(p=>p[0].toUpperCase()).join('');
  return i || 'U';
}
function fmtTime(ts){
  const d = new Date(ts);
  return d.toLocaleString();
}
function escapeHTML(str){
  return (str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function blobToDataURL(blob){
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.readAsDataURL(blob);
  });
}
function dataURLToBlob(dataURL){
  return fetch(dataURL).then(r => r.blob());
}
