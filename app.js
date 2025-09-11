// Romantic site with hero + renamed galleries
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

document.addEventListener('DOMContentLoaded', async () => {
  bindTabs();
  $('#refreshPhotos').addEventListener('click', async () => {
    await loadHero();
    await loadPhotos();
  });
  $('#refreshLetters').addEventListener('click', loadLetters);
  $('#closeReader').addEventListener('click', closeReader);

  await loadHero();
  await loadPhotos();
  await loadLetters();
});

function bindTabs(){
  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    $$('.section').forEach(sec => sec.classList.remove('active'));
    $('#' + tab).classList.add('active');
  }));
}

// ---------------- HERO
async function loadHero(){
  const imgEl = $('#heroImg');
  try{
    const res = await fetch('images/hero/manifest.json', {cache:'no-store'});
    if(!res.ok) throw new Error('no hero manifest');
    const data = await res.json();
    const files = (data.files||[]).filter(f => /(jpe?g|png|webp|gif)$/i.test(f)).sort();
    if(files.length){
      imgEl.src = 'images/hero/' + encodeURIComponent(files[0]);
      return;
    }
    imgEl.src = '';
  }catch(e){
    imgEl.src = '';
  }
}

// ---------------- Photos (renamed)
async function loadPhotos(){
  await loadOneGallery('images/Most_Beautiful_Girl_In_The_World/manifest.json', '#galleryHer', 'images/Most_Beautiful_Girl_In_The_World/');
  await loadOneGallery('images/The_Beauti\'ful_Hey/manifest.json', '#galleryUs', 'images/The_Beauti\'ful_Hey/');
}

async function loadOneGallery(manifestPath, containerSel, baseUrl){
  const wrap = $(containerSel);
  wrap.innerHTML = '<div class="card">Loading…</div>';
  try{
    const res = await fetch(manifestPath, {cache:'no-store'});
    if(!res.ok) throw new Error('no manifest');
    const data = await res.json();
    const files = (data.files||[]).filter(f => /(jpe?g|png|webp|gif)$/i.test(f)).sort();
    renderGallery(wrap, files, baseUrl);
  }catch(e){
    wrap.innerHTML = '<div class="card">No manifest yet. Add images and wait for the Action to run.</div>';
  }
}

function renderGallery(wrap, files, baseUrl){
  wrap.innerHTML = '';
  if(!files.length){
    wrap.innerHTML = '<div class="card">No photos yet. Upload to the folder.</div>';
    return;
  }
  for(const fn of files){
    const url = baseUrl + encodeURIComponent(fn);
    const fig = document.createElement('figure');
    fig.className = 'ph';
    fig.innerHTML = `<img src="${url}" alt="${escapeHTML(fn)}"><figcaption class="cap">${escapeHTML(fn)}</figcaption>`;
    wrap.appendChild(fig);
  }
}

// ---------------- Letters (text files in /texts)
async function loadLetters(){
  const list = $('#lettersList');
  list.innerHTML = '<div class="card">Loading letters…</div>';
  try{
    const res = await fetch('texts/manifest.json', {cache:'no-store'});
    if(!res.ok) throw new Error('no manifest');
    const data = await res.json();
    const files = (data.files||[]).filter(f => /(txt|md)$/i.test(f)).sort();
    renderLetters(files);
  }catch(e){
    list.innerHTML = '<div class="card">No manifest yet. Add <code>.txt</code> or <code>.md</code> files to <code>texts/</code> and wait for the Action to run.</div>';
  }
}

function renderLetters(files){
  const list = $('#lettersList');
  list.innerHTML = '';
  if(!files.length){
    list.innerHTML = '<div class="card">No letters yet. Upload files to <code>texts/</code>.</div>';
    return;
  }
  for(const fn of files){
    const row = document.createElement('div');
    row.className = 'letter';
    const pretty = prettifyFilename(fn);
    row.innerHTML = `
      <span class="dot" aria-hidden="true"></span>
      <div>
        <h3 class="title">${escapeHTML(pretty.title)}</h3>
        <div class="meta">${escapeHTML(pretty.date || '')}</div>
      </div>
      <button class="btn open">Open</button>
    `;
    row.querySelector('.open').addEventListener('click', () => openLetter(fn, pretty));
    list.appendChild(row);
  }
}

async function openLetter(filename, pretty){
  const res = await fetch('texts/' + encodeURIComponent(filename), {cache:'no-store'});
  const raw = await res.text();
  $('#readerTitle').textContent = pretty.title;
  $('#readerBody').innerHTML = renderMarkdown(raw);
  $('#reader').classList.remove('hidden');
  $('#reader').scrollIntoView({behavior:'smooth', block:'start'});
}
function closeReader(){
  $('#reader').classList.add('hidden');
  $('#readerTitle').textContent = 'Letter';
  $('#readerBody').innerHTML = '';
}

// Helpers
function escapeHTML(str){
  return (str||'').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// Minimal MD renderer
function renderMarkdown(src){
  let s = src.replace(/\r\n?/g,'\n').trim();
  s = escapeHTML(s);
  s = s.replace(/^######\s?(.+)$/gm, '<h6>$1</h6>')
       .replace(/^#####\s?(.+)$/gm, '<h5>$1</h5>')
       .replace(/^####\s?(.+)$/gm, '<h4>$1</h4>')
       .replace(/^###\s?(.+)$/gm, '<h3>$1</h3>')
       .replace(/^##\s?(.+)$/gm, '<h2>$1</h2>')
       .replace(/^#\s?(.+)$/gm, '<h1>$1</h1>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('\n');
  return s;
}

function prettifyFilename(fn){
  const m = fn.match(/^(\d{4})-(\d{2})-(\d{2})[-_\s]?(.*)\.(txt|md)$/i);
  if(m){
    const [_, y, mo, d, rest] = m;
    const title = (rest || 'Letter').replace(/[-_]/g, ' ').trim() || 'Letter';
    const date = new Date(`${y}-${mo}-${d}T00:00:00`).toLocaleDateString(undefined, {year:'numeric', month:'long', day:'numeric'});
    return { title, date };
  }
  return { title: fn.replace(/\.(txt|md)$/i, '').replace(/[-_]/g, ' ').trim() || 'Letter', date: '' };
}
