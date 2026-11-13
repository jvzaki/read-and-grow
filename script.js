'use strict';
(() => {
  const STORAGE_KEY = 'read-and-grow.v1';
  const STATUSES = { want: 'Want to Read', reading: 'Currently Reading', finished: 'Finished' };
  const MAX = 1000000;
  const $ = (selector, root = document) => root.querySelector(selector);
  const main = $('#main');
  const fresh = () => ({ version: 1, books: [], sessions: [], goal: 20 });
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const shiftDate = (date, delta) => { const [y,m,d] = date.split('-').map(Number); const value = new Date(y,m-1,d,12); value.setDate(value.getDate()+delta); return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`; };
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= today() && shiftDate(value,0) === value;
  const prettyDate = value => { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d,12).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const int = (value,min=1,max=MAX) => Number.isSafeInteger(value) && value >= min && value <= max;
  const textValid = (s,max) => typeof s === 'string' && !!s.trim() && s.length <= max;
  const safeCover = value => { if (!value) return true; try { return ['https:','http:'].includes(new URL(value).protocol); } catch { return false; } };
  const pagesFor = (bookId, sessions) => sessions.filter(s => s.bookId === bookId).reduce((sum,s) => sum+s.pages,0);
  const bookStatus = (book, sessions) => pagesFor(book.id,sessions) >= book.total ? 'finished' : book.status === 'want' && sessions.some(s=>s.bookId===book.id) ? 'reading' : book.status;
  function validate(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.books) || !Array.isArray(data.sessions) || !int(data.goal,1,1440)) throw new Error('This is not a valid Read & Grow backup (version 1).');
    if (data.books.length > 10000 || data.sessions.length > 100000) throw new Error('This backup is too large.');
    const ids = new Set();
    const books = data.books.map(b => {
      if (!b || !textValid(b.id,100) || ids.has(b.id) || !textValid(b.title,200) || !textValid(b.author,200) || !int(b.total) || !Object.hasOwn(STATUSES,b.status) || typeof b.cover !== 'string' || b.cover.length > 2000 || !safeCover(b.cover)) throw new Error('A book has missing or invalid information.');
      ids.add(b.id); return {id:b.id,title:b.title.trim(),author:b.author.trim(),total:b.total,status:b.status,cover:b.cover};
    });
    const sessionIds = new Set();
    const sessions = data.sessions.map(s => {
      if (!s || !textValid(s.id,100) || sessionIds.has(s.id) || !ids.has(s.bookId) || !validDate(s.date) || !int(s.pages) || !int(s.minutes,1,1440) || !textValid(s.learned,10000) || typeof s.apply !== 'string' || s.apply.length>10000) throw new Error('A reading session has invalid values, a missing reflection, an invalid date, or a missing book.');
      sessionIds.add(s.id); return {id:s.id,bookId:s.bookId,date:s.date,pages:s.pages,minutes:s.minutes,learned:s.learned.trim(),apply:s.apply.trim()};
    });
    if (books.some(b => pagesFor(b.id,sessions)>b.total)) throw new Error('Recorded pages exceed a book’s total. Please correct the backup.');
    return {version:1, books, sessions, goal:data.goal};
  }
  function stats(data, date=today()) {
    const days = new Set(data.sessions.map(s=>s.date));
    let cursor = days.has(date) ? date : shiftDate(date,-1), streak = 0;
    while (days.has(cursor)) { streak++; cursor = shiftDate(cursor,-1); }
    return { finished:data.books.filter(b=>bookStatus(b,data.sessions)==='finished').length, pages:data.sessions.reduce((n,s)=>n+s.pages,0), minutes:data.sessions.reduce((n,s)=>n+s.minutes,0), streak, todayMinutes:data.sessions.filter(s=>s.date===date).reduce((n,s)=>n+s.minutes,0) };
  }
  let data = fresh(), storageIssue = '', libraryFilter = 'all', search = '', vaultBook = 'all', vaultOrder = 'newest', editingSession = null, selectedBook = '', pendingConfirm = null, toastTimer;
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) data = validate(JSON.parse(saved)); } catch { storageIssue = 'Your saved data could not be loaded. It has not been overwritten. Export the original data in Settings before restoring a valid backup.'; }
  function commit(next) {
    try { const checked = validate(next); localStorage.setItem(STORAGE_KEY,JSON.stringify(checked)); data = checked; storageIssue = ''; return true; }
    catch (error) { toast(`Could not save: ${error.message}`); return false; }
  }
  const clone = () => JSON.parse(JSON.stringify(data));
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('visible'),4500); }
  function confirmAction(title,message,label,callback) { $('#confirm-title').textContent=title; $('#confirm-message').textContent=message; $('#confirm-yes').textContent=label; pendingConfirm=callback; $('#confirm-dialog').showModal(); }
  const empty = (title,message,action='',icon='❧') => `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon}</div><h3>${title}</h3><p>${message}</p>${action}</div>`;
  const addButton = '<button class="button" data-action="add-book">＋ <span>Add a book</span></button>';
  const heading = (eyebrow,title,subtitle,action='') => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  function cover(book) {
    const colors = [['#d6d7bb','#3c513b'],['#d8bda0','#4c4936'],['#bccac2','#244c42'],['#e6dba9','#5c542d'],['#d1c8ba','#4c4350']];
    let hash=0; for(const c of book.id) hash=(hash+c.charCodeAt(0))%colors.length;
    const [bg,ink]=colors[hash];
    return `<div class="cover" style="--cover-bg:${bg};--cover-ink:${ink}"><span class="cover-title">${esc(book.title)}</span><span class="cover-ornament" aria-hidden="true">❧</span><span class="cover-author">${esc(book.author)}</span>${book.cover ? `<img src="${esc(book.cover)}" alt="Cover of ${esc(book.title)}" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
  }
  function progress(book) { const pages=pagesFor(book.id,data.sessions), percent=Math.round(pages/book.total*100); return `<div class="progress-meta"><span>${pages.toLocaleString()} / ${book.total.toLocaleString()} pages</span><strong>${percent}%</strong></div><div class="progress-bar" role="progressbar" aria-label="${esc(book.title)} reading progress" aria-valuenow="${pages}" aria-valuemin="0" aria-valuemax="${book.total}"><span style="width:${pages/book.total*100}%"></span></div>`; }
  const logLink = book => `<a class="text-button" href="#log" data-log-book="${esc(book.id)}">Log a little progress <span aria-hidden="true">↗</span></a>`;
  function readingCard(book) { return `<article class="reading-card">${cover(book)}<div class="book-content"><h3>${esc(book.title)}</h3><p class="author">${esc(book.author)}</p>${progress(book)}${logLink(book)}</div></article>`; }
  function reflection(session,compact=false) {
    const book=data.books.find(b=>b.id===session.bookId);
    return `<article class="reflection"><div class="reflection-top"><div><h3>${esc(book.title)}</h3><div class="reflection-date">${prettyDate(session.date)} <span aria-hidden="true">·</span> ${session.pages} pages <span aria-hidden="true">·</span> ${session.minutes} min</div></div>${compact ? '<span class="tag">A new perspective</span>' : `<div class="reflection-actions"><button class="text-button" data-edit-session="${esc(session.id)}" aria-label="Edit session for ${esc(book.title)} on ${prettyDate(session.date)}">Edit</button><button class="text-button" data-delete-session="${esc(session.id)}" aria-label="Delete session for ${esc(book.title)} on ${prettyDate(session.date)}">Delete</button></div>`}</div><span class="eyebrow">WHAT I LEARNED</span><p>${esc(session.learned)}</p>${session.apply ? `<span class="eyebrow">PUTTING IT INTO PRACTICE</span><p>${esc(session.apply)}</p>` : ''}</article>`;
  }
  function sortedSessions() { return [...data.sessions].sort((a,b)=>b.date.localeCompare(a.date)||data.sessions.indexOf(b)-data.sessions.indexOf(a)); }
  function dashboard() {
    const s=stats(data), percent=Math.min(100,Math.round(s.todayMinutes/data.goal*100));
    const reading=data.books.filter(b=>bookStatus(b,data.sessions)==='reading');
    const time=s.minutes>=60 ? `${Math.floor(s.minutes/60)}<small>h ${s.minutes%60} min</small>` : `${s.minutes}<small>min</small>`;
    const metrics=[['Books finished',s.finished,'Stories completed, ideas collected','▤'],['Pages read',s.pages.toLocaleString(),'One page at a time','▥'],['Time well spent',time,'An investment in yourself','◷'],['Reading streak',`${s.streak}<small>${s.streak===1?'day':'days'}</small>`,s.streak?'Keep your curiosity growing':'Your next chapter starts today','♧']];
    return heading('YOUR PERSONAL READING COMPANION','A good day to grow.','Make a little time for a book. Keep a little of what you learn.','<a class="button" href="#log">＋ <span>Log reading</span></a>')+
      `<section class="hero" aria-label="Reading inspiration"><div><div class="eyebrow">SMALL HABITS. LASTING IDEAS.</div><h2>Read a little.<br>Become a little more.</h2><p>Don't just read. Retain, reflect, and apply.</p></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><span class="hero-spark">✧</span><div class="art-book">The art<br>of noticing<span>❧</span></div><div class="art-book two">A world<br>of ideas<span>✳</span></div></div></section>`+
      `<section class="stats-grid" aria-label="Reading statistics">${metrics.map(([label,value,note,icon])=>`<div class="stat"><div class="stat-label">${label}<span class="stat-icon" aria-hidden="true">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`).join('')}</section>`+
      `<div class="dashboard-grid"><div><section><div class="section-heading"><h2>On your nightstand</h2><a class="text-button" href="#library">View library ↗</a></div><div class="book-list">${reading.length ? reading.slice(0,3).map(readingCard).join('') : empty('Your next chapter awaits.','Add a book and turn a few pages. Your reading journey starts here.',addButton)}</div></section><section class="recent-section"><div class="section-heading"><h2>Ideas worth keeping</h2><a class="text-button" href="#vault">Open vault ↗</a></div>${data.sessions.length ? sortedSessions().slice(0,2).map(s=>reflection(s,true)).join('') : empty('Make your reading stay with you.','Your reflections will live here, ready to revisit when you need them.','<a class="text-button" href="#log">Record your first insight ↗</a>','◇')}</section></div><aside><section class="panel goal-panel"><div class="section-heading"><h2>Today’s intention</h2><a class="text-button" href="#settings" aria-label="Edit daily reading goal">Edit</a></div><div class="goal-ring" style="--progress:${percent}%" role="img" aria-label="Daily reading goal ${percent}% complete"><div><strong>${s.todayMinutes}<small style="font-size:17px;color:#7a846d"> / ${data.goal}</small></strong><span>MINUTES READ</span></div></div><strong class="goal-caption">${percent>=100?'A little promise, kept.':s.todayMinutes?'You’re making room to grow.':'A few quiet minutes, just for you.'}</strong><p>${percent>=100?'You’ve reached your reading goal today.':`${Math.max(0,data.goal-s.todayMinutes)} minutes to your daily goal`}</p><a class="button secondary" href="#log">${percent>=100?'Keep the pages turning':'Make time for a chapter'} ↗</a></section><div class="daily-quote"><div class="eyebrow">A THOUGHT TO TAKE WITH YOU</div><blockquote>“Reading is to the mind what exercise is to the body.”</blockquote><p>— JOSEPH ADDISON</p></div></aside></div>`;
  }
  function library() {
    const books=data.books.filter(b=>(libraryFilter==='all'||bookStatus(b,data.sessions)===libraryFilter)&&`${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));
    return heading('A HOME FOR YOUR CURIOSITY','My Library','The books you’ve met. The ideas still waiting.',addButton)+
      `<div class="filters"><div class="tabs" role="group" aria-label="Filter books">${[['all','All books'],...Object.entries(STATUSES)].map(([key,label])=>`<button data-filter="${key}" class="${key===libraryFilter?'active':''}" aria-pressed="${key===libraryFilter}">${label}</button>`).join('')}</div><input class="search-input" id="book-search" type="search" placeholder="Search titles or authors…" aria-label="Search books" value="${esc(search)}"></div><div id="library-results">${libraryResults(books)}</div>`;
  }
  function libraryResults(books) { return books.length ? `<div class="library-grid">${books.map(b=>`<article class="library-card"><div class="book-stage"><span class="tag">${STATUSES[bookStatus(b,data.sessions)]}</span>${cover(b)}</div><div class="book-content"><h3>${esc(b.title)}</h3><p class="author">${esc(b.author)}</p>${progress(b)}${bookStatus(b,data.sessions)!=='finished'?logLink(b):'<span class="tag">A chapter of your life, complete</span>'}</div><div class="card-actions"><button class="text-button" data-edit-book="${esc(b.id)}" aria-label="Edit ${esc(b.title)}">Edit book</button><button class="text-button delete" data-delete-book="${esc(b.id)}" aria-label="Delete ${esc(b.title)}">Delete</button></div></article>`).join('')}</div>` : empty(data.books.length?'No books on this shelf yet.':'Every reader starts with one book.',data.books.length?'Try another filter or search for a different title.':'Add your first book. A whole world of ideas is waiting.',addButton); }
  function logPage() {
    if (!data.books.length) return heading('A SMALL HABIT, A LASTING DIFFERENCE','Log Reading','A few pages. A little reflection. A step forward.')+empty('First, find your next read.','Add a book to your library, then come back to record your reading.',addButton);
    const session=data.sessions.find(s=>s.id===editingSession), selected=session?.bookId || selectedBook || '';
    return heading('A SMALL HABIT, A LASTING DIFFERENCE',session?'Edit your reading session':'A moment to reflect.','Capture the pages you read and the ideas that stayed.')+
      `<div class="form-layout"><form class="panel form-panel" id="session-form"><h2>${session?'Revisit this chapter':'What did you read today?'}</h2><p class="form-intro">Progress is measured in pages. Growth begins with reflection.</p><label>Choose a book<select name="bookId" required><option value="">Select from your library</option>${data.books.map(b=>`<option value="${esc(b.id)}" ${selected===b.id?'selected':''}>${esc(b.title)}</option>`).join('')}</select></label><p class="field-help" id="remaining-pages"></p><div class="form-grid three"><label>Reading date<input name="date" type="date" min="1900-01-01" max="${today()}" value="${session?.date||today()}" required></label><label>Pages read<input name="pages" type="number" min="1" max="1000000" step="1" required placeholder="e.g. 15" value="${session?.pages||''}"></label><label>Minutes read<input name="minutes" type="number" min="1" max="1440" step="1" required placeholder="e.g. 20" value="${session?.minutes||''}"></label></div><label>What did you learn today? <span class="optional">required</span><textarea name="learned" required maxlength="10000" placeholder="An idea that surprised you, a lesson to remember, a new way of seeing…">${esc(session?.learned||'')}</textarea></label><label>How can you apply this knowledge? <span class="optional">optional</span><textarea name="apply" maxlength="10000" placeholder="One small way to put this idea into practice…">${esc(session?.apply||'')}</textarea></label><p class="field-help">Your reflections will be saved in your Knowledge Vault.</p><p id="session-error" class="form-error" role="alert"></p><div class="form-actions">${session?'<button type="button" class="button secondary" data-action="cancel-session">Cancel</button>':''}<button class="button" type="submit">${session?'Save changes':'Save reading session'} <span aria-hidden="true">↗</span></button></div></form><aside class="journal-note"><span class="sprout" aria-hidden="true">❧</span><h2>Let a good idea<br>take root.</h2><p>You don’t have to remember every word. Start with one idea that made you pause.</p><div class="numbered-tip"><span>1</span>What challenged the way you think?</div><div class="numbered-tip"><span>2</span>What would you tell a friend?</div><div class="numbered-tip"><span>3</span>What could you try tomorrow?</div></aside></div>`;
  }
  function vault() {
    let sessions=sortedSessions().filter(s=>vaultBook==='all'||s.bookId===vaultBook); if(vaultOrder==='oldest') sessions.reverse();
    return heading('READ. REFLECT. RETURN.','Knowledge Vault','A growing collection of ideas you’ve made your own.')+
    `<div class="vault-filters"><label><span class="skip-label">Filter by book</span><select id="vault-book" aria-label="Filter reflections by book"><option value="all">All books</option>${data.books.map(b=>`<option value="${esc(b.id)}" ${b.id===vaultBook?'selected':''}>${esc(b.title)}</option>`).join('')}</select></label><label><span class="skip-label">Sort reflections</span><select id="vault-order" aria-label="Sort reflections"><option value="newest" ${vaultOrder==='newest'?'selected':''}>Newest first</option><option value="oldest" ${vaultOrder==='oldest'?'selected':''}>Oldest first</option></select></label><span class="count">${sessions.length} ${sessions.length===1?'reflection':'reflections'} to grow with</span></div>${sessions.length?sessions.map(s=>reflection(s)).join(''):empty('Give your ideas a place to grow.','Every reading session adds a reflection here. Start with one thing you learned.','<a class="button" href="#log">Log reading ↗</a>','◇')}`;
  }
  function settings() { return heading('MAKE THIS SPACE YOURS','Settings & backup','Small intentions. A library that stays with you.')+
    `<div class="settings-grid"><section class="panel"><h2>Your daily intention</h2><p>A manageable goal makes it easier to come back tomorrow.</p><form id="goal-form"><label>Daily reading goal (minutes)<input name="goal" type="number" min="1" max="1440" step="1" required value="${data.goal}"></label><p class="form-error" id="goal-error" role="alert"></p><button class="button">Save daily goal ↗</button></form></section><section class="panel"><h2>Keep your story safe</h2><p>Export all your books, reading sessions, reflections, and goal as a JSON backup. Import it to restore your library in another browser.</p><div class="backup-actions"><button class="button secondary" data-action="export">↓ Export data</button><button class="button secondary" data-action="import">↑ Import data</button><input id="import-file" type="file" accept=".json,application/json" hidden></div><p style="margin-top:18px;font-size:10px">Importing replaces your current library after confirmation. Export a backup first.</p></section></div><div class="privacy-note"><span aria-hidden="true">♧</span><div><h3>A personal space, on this browser.</h3><p>Your data is stored locally in this browser. It does not automatically sync across devices. Clearing browser data or using private browsing can remove it. Keep a regular backup of the ideas you care about.</p></div></div>`; }
  const route = () => ['dashboard','library','log','vault','settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
  function render() {
    const page=route();
    const names={dashboard:'Dashboard',library:'My Library',log:'Log Reading',vault:'Knowledge Vault',settings:'Settings & backup'};
    document.title=`${names[page]} — Read & Grow`;
    document.querySelectorAll('[data-nav]').forEach(el=>{el.classList.toggle('active',el.dataset.nav===page);if(el.dataset.nav===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    $('#breadcrumb').innerHTML=`Your reading space <span>/</span> ${names[page]}`;
    $('#library-count').textContent=data.books.length;
    main.innerHTML=(storageIssue?`<p class="storage-warning" role="alert">${esc(storageIssue)}</p>`:'')+({dashboard,library,log:logPage,vault,settings}[page])();
    main.classList.remove('page-enter'); void main.offsetWidth; main.classList.add('page-enter');
    attachImageFallbacks();
    if(page==='log' && data.books.length) updateRemaining();
  }
  function attachImageFallbacks() { main.querySelectorAll('.cover img').forEach(img=>{img.addEventListener('error',()=>img.remove(),{once:true}); if(img.complete&&!img.naturalWidth) img.remove();}); }
  function updateRemaining() { const form=$('#session-form'); if(!form)return;const b=data.books.find(b=>b.id===form.elements.bookId.value); const remaining=b?b.total-pagesFor(b.id,data.sessions.filter(s=>s.id!==editingSession)):0;$('#remaining-pages').textContent=b?`${remaining.toLocaleString()} pages remaining · ${b.total.toLocaleString()} pages in this book`:'';form.elements.pages.max=b?remaining:MAX; }
  function openBook(id) {
    if(storageIssue){toast('Restore a valid backup before changing your library.');return;}
    const b=data.books.find(b=>b.id===id), form=$('#book-form'); form.reset();
    form.elements.recordId.value=b?.id||'';
    for(const key of ['title','author','total','status','cover']) if(b) form.elements[key].value=b[key];
    $('#book-dialog-title').textContent=b?'Edit book':'Add a book';$('#book-error').textContent='';$('#book-dialog').showModal();
  }
  function saveBook(event) {
    event.preventDefault();const f=event.target.elements, id=f.recordId.value, next=clone();
    const book={id:id||uid(),title:f.title.value.trim(),author:f.author.value.trim(),total:Number(f.total.value),status:f.status.value,cover:f.cover.value.trim()};
    if(!book.title||!book.author){$('#book-error').textContent='Please enter a title and author.';return;}
    if(!int(book.total)){$('#book-error').textContent='Total pages must be a whole number between 1 and 1,000,000.';return;}
    if(!safeCover(book.cover)){$('#book-error').textContent='Use a valid http:// or https:// cover URL.';return;}
    if(pagesFor(book.id,next.sessions)>book.total){$('#book-error').textContent='Total pages cannot be less than the pages already logged. Edit the reading sessions first.';return;}
    const index=next.books.findIndex(b=>b.id===id);if(index>=0)next.books[index]=book;else next.books.push(book);
    if(commit(next)){$('#book-dialog').close();render();toast(id?'Book updated.':'A new chapter, added to your library.');}
  }
  function saveSession(event) {
    event.preventDefault();if(storageIssue){toast('Restore a valid backup before saving.');return;}
    const f=event.target.elements,next=clone(), error=$('#session-error');
    const session={id:editingSession||uid(),bookId:f.bookId.value,date:f.date.value,pages:Number(f.pages.value),minutes:Number(f.minutes.value),learned:f.learned.value.trim(),apply:f.apply.value.trim()};
    const book=next.books.find(b=>b.id===session.bookId);
    if(!book){error.textContent='Choose a book from your library.';return;}
    if(!validDate(session.date)){error.textContent='Choose a valid date from 1900 through today.';return;}
    if(!int(session.pages)||!int(session.minutes,1,1440)){error.textContent='Enter whole, positive numbers for pages and minutes (up to 1,440 minutes).';return;}
    if(!session.learned){error.textContent='Take a moment to write what you learned before saving.';f.learned.focus();return;}
    const remaining=book.total-pagesFor(book.id,next.sessions.filter(s=>s.id!==session.id));
    if(session.pages>remaining){error.textContent=`This book has ${remaining} pages remaining. Reduce the pages read or edit the book’s total.`;return;}
    const index=next.sessions.findIndex(s=>s.id===session.id);if(index>=0)next.sessions[index]=session;else next.sessions.push(session);
    if(commit(next)){editingSession=null;selectedBook='';location.hash='vault';toast(index>=0?'Session updated. Your progress is up to date.':'Reading saved. An idea worth keeping.');}
  }
  function exportData() {
    let raw;
    try {raw=storageIssue?localStorage.getItem(STORAGE_KEY):JSON.stringify(data,null,2);}catch{toast('Browser storage is unavailable.');return;}
    if(!raw){toast('No saved data is available to export.');return;}
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`read-and-grow-${today()}${storageIssue?'-recovery':''}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exported. Keep it somewhere safe.');
  }
  async function importData(file) {
    if(!file)return;
    if(file.size>20*1024*1024){toast('Choose a JSON backup smaller than 20 MB.');return;}
    try {const checked=validate(JSON.parse(await file.text()));confirmAction('Restore your library?',`This backup contains ${checked.books.length} books and ${checked.sessions.length} reading sessions. It will replace all books, sessions, reflections, and your daily goal currently saved in this browser. This cannot be undone. Export your current data first if you want to keep it.`,'Replace & restore',()=>{if(commit(checked)){editingSession=null;libraryFilter='all';vaultBook='all';search='';selectedBook='';render();toast('Your library has been restored. Welcome back.');}});}
    catch(error){toast(`Backup not imported: ${error instanceof SyntaxError?'Choose a valid JSON backup.':error.message}`);}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button,a');if(!button)return;
    if(button.matches('[data-close]'))$('#book-dialog').close();
    if(button.dataset.logBook){selectedBook=button.dataset.logBook;editingSession=null;if(route()==='log')render();}
    if(button.dataset.filter){libraryFilter=button.dataset.filter;render();}
    if(button.dataset.editBook)openBook(button.dataset.editBook);
    if(button.dataset.deleteBook){const b=data.books.find(b=>b.id===button.dataset.deleteBook);if(!b)return;const count=data.sessions.filter(s=>s.bookId===b.id).length;confirmAction('Remove this book?',`Delete “${b.title}”? ${count?`Its ${count} reading session${count===1?'':'s'} and all associated reflections will also be permanently deleted. Your reading statistics will change.`:'This book will be permanently removed from your library.'}`,'Delete book',()=>{const next=clone();next.books=next.books.filter(x=>x.id!==b.id);next.sessions=next.sessions.filter(x=>x.bookId!==b.id);if(commit(next)){if(vaultBook===b.id)vaultBook='all';render();toast('Book and its reading history removed.');}});}
    if(button.dataset.editSession){editingSession=button.dataset.editSession;if(route()==='log')render();else location.hash='log';}
    if(button.dataset.deleteSession){const id=button.dataset.deleteSession;confirmAction('Delete this reflection?','This reading session and its reflection will be permanently removed. Book progress, reading time, and streaks will be recalculated.','Delete session',()=>{const next=clone();next.sessions=next.sessions.filter(s=>s.id!==id);if(commit(next)){render();toast('Session removed. Your progress has been updated.');}});}
    switch(button.dataset.action){case 'add-book':openBook();break;case 'cancel-session':editingSession=null;location.hash='vault';break;case 'export':exportData();break;case 'import':$('#import-file').click();break;}
  });
  document.addEventListener('submit',event=>{
    if(event.target.getAttribute('id')==='book-form')saveBook(event);
    if(event.target.getAttribute('id')==='session-form')saveSession(event);
    if(event.target.getAttribute('id')==='goal-form'){event.preventDefault();if(storageIssue){toast('Restore a valid backup before saving.');return;}const goal=Number(event.target.elements.goal.value);if(!int(goal,1,1440)){$('#goal-error').textContent='Enter a whole number from 1 to 1,440 minutes.';return;}const next=clone();next.goal=goal;if(commit(next)){render();toast('Your daily intention is set.');}}
  });
  document.addEventListener('change',event=>{switch(event.target.id){case 'vault-book':vaultBook=event.target.value;render();break;case 'vault-order':vaultOrder=event.target.value;render();break;case 'import-file':importData(event.target.files[0]);event.target.value='';break;}if(event.target.name==='bookId')updateRemaining();});
  document.addEventListener('input',event=>{if(event.target.id==='book-search'){search=event.target.value;const books=data.books.filter(b=>(libraryFilter==='all'||bookStatus(b,data.sessions)===libraryFilter)&&`${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));$('#library-results').innerHTML=libraryResults(books);attachImageFallbacks();}});
  $('#confirm-cancel').addEventListener('click',()=>{$('#confirm-dialog').close();pendingConfirm=null;});
  $('#confirm-yes').addEventListener('click',()=>{const callback=pendingConfirm;pendingConfirm=null;$('#confirm-dialog').close();callback?.();});
  $('#confirm-dialog').addEventListener('cancel',()=>{pendingConfirm=null;});
  window.addEventListener('hashchange',()=>{if(route()!=='log')editingSession=null;render();window.scrollTo(0,0);main.focus();});
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY){try{data=event.newValue?validate(JSON.parse(event.newValue)):fresh();storageIssue='';}catch{storageIssue='Another tab saved invalid data. Reload or restore a valid backup before making changes.';}editingSession=null;render();toast('Your library was updated in another tab.');}});
  let lastDate=today();window.addEventListener('focus',()=>{if(today()!==lastDate){lastDate=today();render();}});
  // Pure calculations are exposed for verification without changing saved application data.
  window.ReadGrow=Object.freeze({validate,stats,pagesFor,bookStatus,today,shiftDate,validDate,storageKey:STORAGE_KEY});
  render();
})();
