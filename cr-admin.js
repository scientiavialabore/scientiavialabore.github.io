/* ================================================================
   cr-admin.js — Admin Panel (Question List, Reassign, Vocab, Add/Edit Form)
   ─────────────────────────────────────────────────────────────────
   CONTENTS (in order):
     §ADMIN_LIST    Question list tab — filters, cards, toggle/edit/delete
     §REASSIGN      Reassign Topics tab — move topic between chapters
     §ADMIN_VOCAB   Vocab Manager tab — enable/disable vocab entries
     §ADMIN_FORM    Add/Edit Question form — MC + numeric, given values, solution steps

   DEPENDENCIES:  cr-data.js, cr-core.js (showAdminTab, esc, rebuildChapters)
   CONSUMERS:     showAdmin() called from hub

   KEY GLOBALS EXPORTED:
     showAdminTab(tab)   — switch between list/vocab/reassign/add tabs
     renderQList()       — refresh question list with active filters
     renderVocabList()   — refresh vocab list with active filters
     editQ(idx)          — load question into form for editing
     delQ(idx)           — delete question at index
     toggleQ(idx)        — enable/disable question at index
     toggleVocab(idx)    — enable/disable vocab at index
     vocabToggleAll(bool)— enable/disable all filtered vocab
     saveQ()             — save new/edited question from form
================================================================ */

// §ADMIN_LIST
/* ================================================================
   ADMIN — LIST
================================================================ */
function showAdminTab(tab){
  document.getElementById('admin-list').style.display     = tab==='list'     ? '' : 'none';
  document.getElementById('admin-vocab').style.display    = tab==='vocab'    ? '' : 'none';
  document.getElementById('admin-reassign').style.display = tab==='reassign' ? '' : 'none';
  document.getElementById('admin-boards').style.display   = tab==='boards'   ? '' : 'none';
  document.getElementById('admin-add').style.display      = tab==='add'      ? '' : 'none';
  document.getElementById('tab-list').className     = 'a-tab'+(tab==='list'     ? ' on' : '');
  document.getElementById('tab-vocab').className    = 'a-tab'+(tab==='vocab'    ? ' on' : '');
  document.getElementById('tab-reassign').className = 'a-tab'+(tab==='reassign' ? ' on' : '');
  document.getElementById('tab-boards').className   = 'a-tab'+(tab==='boards'   ? ' on' : '');
  document.getElementById('tab-add').className      = 'a-tab'+(tab==='add'      ? ' on' : '');
  if(tab==='list')     renderQList();
  if(tab==='vocab')    renderVocabList();
  if(tab==='reassign') renderReassignTable();
  if(tab==='boards')   renderBoardsTab();
  if(tab==='add')      initForm();
}

// §REASSIGN
/* ================================================================
   REASSIGN TOPICS TAB
================================================================ */
// Holds pending changes: { topicKey_fromChKey: { topicKey, fromChKey, toChKey, toChLabel, toChName } }
let _reassignPending = {};

function renderReassignTable(){
  _reassignPending = {};
  const wrap = document.getElementById('reassign-table');
  wrap.innerHTML = '';

  // Collect all topic→chapter mappings from data
  const rows = []; // { chKey, topicKey, topicLabel, cats, qCount }
  chEntries().forEach(([chKey, ch]) => {
    Object.entries(ch.topics).forEach(([topicKey, topic]) => {
      const qCount = allQ().filter(q=>q.chapter===chKey&&q.topic===topicKey).length;
      const vCount = vocabBank.filter(v=>v.chapter===chKey&&v.topic===topicKey).length;
      rows.push({ chKey, topicKey, topicLabel: topic.label, cats: topic.cats||[], qCount, vCount });
    });
  });

  if(!rows.length){
    wrap.innerHTML = '<div class="empty-state"><div style="font-size:2rem">📭</div><p>No topics found. Import questions.csv first.</p></div>';
    document.getElementById('reassign-actions').style.display = 'none';
    return;
  }

  // Chapter options string (for all selects)
  const chOptBase = chEntries().map(([k,v])=>`<option value="${k}">${esc(v.label)}: ${esc(v.name)}</option>`).join('');
  const newChOpt  = '<option value="__new__">+ New chapter…</option>';

  const table = document.createElement('table');
  table.className = 'ra-table';
  table.innerHTML = `<thead><tr>
    <th>Topic</th><th>Current Chapter</th><th>Categories</th>
    <th>Questions</th><th>Vocab</th><th>Move To Chapter</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.topic = row.topicKey;
    tr.dataset.from  = row.chKey;
    const catPreview = row.cats.slice(0,3).join(', ') + (row.cats.length>3?` +${row.cats.length-3} more`:'');
    tr.innerHTML = `
      <td><div class="ra-topic-name">${esc(row.topicLabel)}</div>
          <div class="ra-cat-list">${esc(row.topicKey)}</div></td>
      <td>${esc(CHAPTERS[row.chKey]?.label||row.chKey)}<br>
          <span style="font-size:.62rem;color:var(--muted);font-family:var(--mono)">${esc(CHAPTERS[row.chKey]?.name||'')}</span></td>
      <td class="ra-cat-list">${esc(catPreview)||'—'}</td>
      <td class="ra-count">${row.qCount}</td>
      <td class="ra-count">${row.vCount}</td>
      <td>
        <select class="ra-ch-sel" data-topic="${row.topicKey}" data-from="${row.chKey}">
          ${chOptBase}${newChOpt}
        </select>
        <div class="ra-new-ch-row" id="newch-${row.topicKey}-${row.chKey}">
          <div><label class="f-label">Chapter Key <span class="sec-hint">(e.g. ch3)</span></label>
               <input class="f-input" id="newkey-${row.topicKey}-${row.chKey}" placeholder="ch3" style="width:80px"></div>
          <div><label class="f-label">Label <span class="sec-hint">(e.g. Chapter 3)</span></label>
               <input class="f-input" id="newlbl-${row.topicKey}-${row.chKey}" placeholder="Chapter 3" style="width:120px"></div>
          <div><label class="f-label">Name <span class="sec-hint">(e.g. Atomic Structure)</span></label>
               <input class="f-input" id="newnm-${row.topicKey}-${row.chKey}" placeholder="Atomic Structure" style="width:160px"></div>
        </div>
      </td>`;
    tbody.appendChild(tr);

    // Set select to current chapter
    const sel = tr.querySelector('.ra-ch-sel');
    sel.value = row.chKey;

    sel.addEventListener('change', () => {
      const newVal = sel.value;
      const newChRow = document.getElementById(`newch-${row.topicKey}-${row.chKey}`);
      if(newVal === '__new__'){
        newChRow.classList.add('show');
        sel.classList.add('changed');
      } else {
        newChRow.classList.remove('show');
        sel.classList.toggle('changed', newVal !== row.chKey);
      }
      _updateReassignPending(row.topicKey, row.chKey, sel, row.chKey);
      _syncReassignActions();
    });
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  document.getElementById('reassign-actions').style.display = 'flex';
  document.getElementById('reassign-msg').style.display = 'none';
}

function _updateReassignPending(topicKey, fromChKey, sel, origChKey){
  const pendingKey = topicKey + '||' + fromChKey;
  const newVal = sel.value;
  if(newVal === origChKey){
    delete _reassignPending[pendingKey];
    return;
  }
  if(newVal === '__new__'){
    // Not ready until user fills in key+label+name — handled at apply time
    _reassignPending[pendingKey] = { topicKey, fromChKey, toChKey:'__new__' };
  } else {
    const ch = CHAPTERS[newVal];
    _reassignPending[pendingKey] = {
      topicKey, fromChKey,
      toChKey: newVal, toChLabel: ch?.label||newVal, toChName: ch?.name||newVal
    };
  }
}

function _syncReassignActions(){
  const count = Object.keys(_reassignPending).length;
  const btn = document.getElementById('reassign-apply-btn');
  btn.textContent = count ? `Apply ${count} Change${count!==1?'s':''}` : 'Apply Changes';
  btn.disabled = count === 0;
}

document.getElementById('reassign-apply-btn').addEventListener('click', () => {
  const pending = Object.values(_reassignPending);
  if(!pending.length) return;

  let totalMoved = 0;
  const errors = [];

  pending.forEach(p => {
    let toChKey = p.toChKey, toChLabel = p.toChLabel, toChName = p.toChName;

    if(toChKey === '__new__'){
      const safeTopic = p.topicKey.replace(/[^a-z0-9]/gi,'');
      const fromTopic = p.fromChKey;
      const keyEl  = document.getElementById(`newkey-${p.topicKey}-${p.fromChKey}`);
      const lblEl  = document.getElementById(`newlbl-${p.topicKey}-${p.fromChKey}`);
      const nmEl   = document.getElementById(`newnm-${p.topicKey}-${p.fromChKey}`);
      toChKey   = (keyEl?.value||'').trim().replace(/\s+/g,'').toLowerCase();
      toChLabel = (lblEl?.value||'').trim();
      toChName  = (nmEl?.value||'').trim();
      if(!toChKey || !toChLabel || !toChName){
        errors.push(`Topic "${p.topicKey}": fill in all three new-chapter fields.`);
        return;
      }
    }

    const moved = reassignTopic(p.topicKey, p.fromChKey, toChKey, toChLabel, toChName);
    totalMoved += moved;
  });

  if(errors.length){ alert('Fix these before applying:\n\n'+errors.join('\n')); return; }

  const msg = document.getElementById('reassign-msg');
  msg.textContent = `✓ Moved ${totalMoved} question${totalMoved!==1?'s':''}. Export CSVs to save changes.`;
  msg.style.display = 'flex';
  renderReassignTable(); // re-render with new state
});

document.getElementById('reassign-reset-btn').addEventListener('click', renderReassignTable);
function renderQList(){
  const fch = document.getElementById('filter-chapter').value;
  const fto = document.getElementById('filter-topic').value;
  const fc  = document.getElementById('filter-cat').value;
  const fp  = document.getElementById('filter-pts').value;
  const ft  = document.getElementById('filter-type').value;
  const fen = document.getElementById('filter-enabled').value; // '' | '1' | '0'

  // Populate chapter filter dynamically
  const chSel = document.getElementById('filter-chapter');
  const prevCh = chSel.value;
  chSel.innerHTML = '<option value="">All Chapters</option>'+
    chEntries().map(([k,v]) =>
      `<option value="${k}"${k===prevCh?' selected':''}>${esc(v.label)}: ${esc(v.name)}</option>`).join('');

  // Populate topic filter from all known topics across all chapters
  const toSel = document.getElementById('filter-topic');
  const prevTo = toSel.value;
  const topicMap = new Map();
  chEntries().forEach(([,ch])=>Object.entries(ch.topics).forEach(([k,t])=>topicMap.set(k,t.label)));
  toSel.innerHTML = '<option value="">All Topics</option>'+
    [...topicMap.entries()].map(([k,v])=>
      `<option value="${k}"${k===prevTo?' selected':''}>${esc(v)}</option>`).join('');

  // Populate category filter dynamically from all questions
  const catSel = document.getElementById('filter-cat');
  const prevCat = catSel.value;
  const allCats = [...new Set(allQ().map(q => q.cat))].sort();
  catSel.innerHTML = '<option value="">All Categories</option>'+
    allCats.map(c => `<option value="${esc(c)}"${c===prevCat?' selected':''}>${esc(c)}</option>`).join('');

  const qs = allQ().filter(q =>
    (!fch || q.chapter===fch) &&
    (!fto || q.topic===fto) &&
    (!fc  || q.cat===fc) &&
    (!fp  || q.pts==fp) &&
    (!ft  || q.type===ft) &&
    (!fen || (fen==='1' ? q.enabled!==false : q.enabled===false)));
  document.getElementById('q-count').textContent = qs.length+' question'+(qs.length!==1?'s':'');

  const wrap = document.getElementById('q-cards');
  if(!qs.length){ wrap.innerHTML = '<div class="empty-state"><div style="font-size:2rem">🔬</div><p>No questions match this filter.</p></div>'; return; }
  wrap.innerHTML = '';
  qs.forEach(q => {
    const ci = customBank.indexOf(q);
    const isGen = typeof q.generate === 'function';
    const isEnabled = q.enabled !== false;
    const chLabel  = CHAPTERS[q.chapter]?.label || q.chapter_label || q.chapter || '';
    const tLabel   = topicLabel(q.topic);
    const card = document.createElement('div');
    card.className = 'q-card' + (isEnabled ? '' : ' qdisabled');
    card.innerHTML = `
      <div class="q-card-left">
        <div class="q-card-meta">
          ${!isEnabled ? '<span class="qbadge" style="background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.25)">✕ Disabled</span>' : ''}
          ${chLabel?`<span class="qbadge" style="background:rgba(245,200,66,.1);color:var(--gold);border:1px solid rgba(245,200,66,.3)">${esc(chLabel)}</span>`:''}
          ${tLabel?`<span class="qbadge" style="background:rgba(168,85,247,.1);color:#c084fc;border:1px solid rgba(168,85,247,.3)">${esc(tLabel)}</span>`:''}
          <span class="qbadge qb-cat">${esc(q.cat)}</span>
          <span class="qbadge qb-pts">$${q.pts}</span>
          <span class="qbadge qb-type">${q.type==='mc'?'MC':q.type==='tf'?'⚡ T/F':'Numeric'}</span>
          ${isGen?'<span class="qbadge qb-gen">⚙ Randomized</span>':''}
        </div>
        <div class="q-text">${isGen ? '(Randomized) '+esc(q.q||'') : esc(q.q||'')}</div>
      </div>
      <div class="q-card-actions">
        ${ci>=0 ?
          `<button class="qa-btn qa-toggle ${isEnabled?'on':'off'}" data-idx="${ci}">${isEnabled?'✓ On':'✕ Off'}</button>
           <button class="qa-btn qa-edit" data-idx="${ci}">Edit</button>
           <button class="qa-btn qa-del" data-idx="${ci}">Delete</button>` :
          '<span style="font-size:.6rem;color:var(--muted);font-family:var(--mono)">read-only</span>'}
      </div>`;
    card.querySelectorAll('.qa-toggle').forEach(b => b.addEventListener('click', () => { toggleQ(+b.dataset.idx); }));
    card.querySelectorAll('.qa-edit').forEach(b => b.addEventListener('click', () => { editQ(+b.dataset.idx); }));
    card.querySelectorAll('.qa-del').forEach(b  => b.addEventListener('click', () => { delQ(+b.dataset.idx); }));
    wrap.appendChild(card);
  });
}
function editQ(idx){ showAdminTab('add'); setTimeout(() => loadForm(customBank[idx], idx), 50); }
function delQ(idx){ if(!confirm('Delete this question?')) return; customBank.splice(idx,1); _saveCustom(); rebuildChapters(); renderQList(); }
function toggleQ(idx){
  const q = customBank[idx];
  if(!q) return;
  q.enabled = q.enabled === false ? true : false; // flip
  _saveCustom();
  renderQList();
}

// §ADMIN_VOCAB
/* ================================================================
   VOCAB ADMIN TAB
================================================================ */
function renderVocabList(){
  const fch  = document.getElementById('vocab-filter-chapter').value;
  const fen  = document.getElementById('vocab-filter-enabled').value;
  const fsrch = (document.getElementById('vocab-search').value||'').trim().toUpperCase();

  // Populate chapter filter
  const chSel = document.getElementById('vocab-filter-chapter');
  const prev  = chSel.value;
  chSel.innerHTML = '<option value="">All Chapters</option>' +
    chEntries().map(([k,v]) =>
      `<option value="${k}"${k===prev?' selected':''}>${esc(v.label)}: ${esc(v.name)}</option>`).join('');

  // Filter vocabBank
  const items = vocabBank.filter(v =>
    (!fch  || v.chapter === fch) &&
    (!fen  || (fen==='1' ? v.enabled!==false : v.enabled===false)) &&
    (!fsrch || v.word?.toUpperCase().includes(fsrch) || v.definition?.toUpperCase().includes(fsrch))
  );

  document.getElementById('vocab-count').textContent =
    items.length + ' term' + (items.length!==1?'s':'');

  const wrap = document.getElementById('vocab-cards');
  if(!items.length){
    wrap.innerHTML = '<div class="empty-state"><div style="font-size:2rem">📖</div><p>No vocab matches this filter.</p></div>';
    return;
  }
  wrap.innerHTML = '';
  items.forEach(v => {
    const isEnabled = v.enabled !== false;
    const vbIdx = vocabBank.indexOf(v);
    const chLabel = CHAPTERS[v.chapter]?.label || v.chapter_label || v.chapter || '';
    const card = document.createElement('div');
    card.className = 'vocab-card' + (isEnabled ? '' : ' vdisabled');
    card.innerHTML = `
      <div class="vocab-word">${esc(v.word)}</div>
      <div class="vocab-def">${esc(v.definition)}</div>
      <div class="vocab-meta">${esc(chLabel)}</div>
      <button class="qa-btn qa-toggle ${isEnabled?'on':'off'}" data-vidx="${vbIdx}">${isEnabled?'✓ On':'✕ Off'}</button>`;
    card.querySelector('.qa-toggle').addEventListener('click', (e) => {
      toggleVocab(+e.currentTarget.dataset.vidx);
    });
    wrap.appendChild(card);
  });
}

function toggleVocab(idx){
  const v = vocabBank[idx];
  if(!v) return;
  v.enabled = v.enabled === false ? true : false;
  _saveVocab();
  rebuildChapters();
  renderVocabList();
}

function vocabToggleAll(enabled){
  const fch = document.getElementById('vocab-filter-chapter').value;
  vocabBank.forEach(v => {
    if(!fch || v.chapter === fch) v.enabled = enabled;
  });
  _saveVocab();
  rebuildChapters();
  renderVocabList();
}

// §ADMIN_FORM
/* ================================================================
   ADMIN — FORM
================================================================ */
document.getElementById('add-given-btn').addEventListener('click', () => addGivenRow());
document.getElementById('add-mc-btn').addEventListener('click', addMCOpt);
document.getElementById('add-step-btn').addEventListener('click', () => addStep());
document.getElementById('form-save-btn').addEventListener('click', saveQ);
document.getElementById('form-cancel-btn').addEventListener('click', () => { initForm(); showAdminTab('list'); });
document.getElementById('f-type').addEventListener('change', onTypeChange);
document.getElementById('f-cat').addEventListener('change', onCatChange);

function populateFormSelects(){
  // Chapter select — dynamic from CHAPTERS
  const chSel = document.getElementById('f-chapter');
  chSel.innerHTML = chEntries().map(([k,v]) =>
    `<option value="${k}">${esc(v.label)}: ${esc(v.name)}</option>`).join('') ||
    '<option value="ch1">Chapter 1</option>';

  // Topic select — all known topics across all chapters
  const toSel = document.getElementById('f-topic');
  const topicMap = new Map();
  chEntries().forEach(([,ch])=>Object.entries(ch.topics).forEach(([k,t])=>topicMap.set(k,t.label)));
  toSel.innerHTML = [...topicMap.entries()].map(([k,v])=>
    `<option value="${k}">${esc(v)}</option>`).join('') ||
    '<option value="general">General</option>';

  // Category select — dynamic from all known cats + custom option
  const catSel = document.getElementById('f-cat');
  const prevVal = catSel.value;
  const allCats = [...new Set(allQ().map(q=>q.cat))].sort();
  catSel.innerHTML = allCats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('') +
    '<option value="__custom__">+ New category…</option>';
  if(allCats.includes(prevVal)) catSel.value = prevVal;
}

function onChapterChange(){ /* future: filter topics by chapter */ }
function onCatChange(){
  const v = document.getElementById('f-cat').value;
  document.getElementById('f-custom-wrap').style.display = v==='__custom__' ? 'block' : 'none';
}
function onTypeChange(){
  const t = document.getElementById('f-type').value;
  document.getElementById('mc-section').style.display  = t==='mc'      ? '' : 'none';
  document.getElementById('num-section').style.display = t==='numeric' ? '' : 'none';
  const tfSec = document.getElementById('tf-section');
  if(tfSec) tfSec.style.display = t==='tf' ? '' : 'none';
  // Hide Given Values and Solution Steps for T/F — not relevant
  const givenSec = document.getElementById('add-given-btn')?.closest?.('.form-section');
  const stepsSec = document.getElementById('add-step-btn')?.closest?.('.form-section');
  if(givenSec) givenSec.style.display = t==='tf' ? 'none' : '';
  if(stepsSec) stepsSec.style.display = t==='tf' ? 'none' : '';
}
function initForm(){
  populateFormSelects();
  document.getElementById('f-edit-idx').value = '';
  // Set first available chapter/topic as default
  const firstCh  = chEntries()[0];
  if(firstCh){ document.getElementById('f-chapter').value = firstCh[0]; }
  const topicMap = new Map();
  chEntries().forEach(([,ch])=>Object.entries(ch.topics).forEach(([k,t])=>topicMap.set(k,t.label)));
  const firstTopic = [...topicMap.keys()][0];
  if(firstTopic){ document.getElementById('f-topic').value = firstTopic; }
  document.getElementById('f-custom-wrap').style.display = 'none';
  document.getElementById('f-pts').value = '600';
  document.getElementById('f-type').value = 'mc';
  document.getElementById('f-q').value = '';
  document.getElementById('f-hint').value = '';
  document.getElementById('f-answer').value = '';
  document.getElementById('f-tol').value = '0.1';
  document.getElementById('f-unit').value = '';
  document.getElementById('given-rows').innerHTML = '';
  document.getElementById('form-msg').style.display = 'none';
  initMCBuilder([{t:'',ok:true},{t:'',ok:false},{t:'',ok:false},{t:'',ok:false}]);
  initSteps(['','']);
  const tfStmt = document.getElementById('f-tf-stmt');
  const tfAns  = document.getElementById('f-tf-answer');
  const tfExpl = document.getElementById('f-tf-explanation');
  if(tfStmt) tfStmt.value = '';
  if(tfAns)  tfAns.value  = 'true';
  if(tfExpl) tfExpl.value = '';
  onTypeChange();
}
function loadForm(q, idx){
  populateFormSelects();
  document.getElementById('f-edit-idx').value = idx;
  if(q.chapter) document.getElementById('f-chapter').value = q.chapter;
  if(q.topic)   document.getElementById('f-topic').value   = q.topic;
  // Category: it'll be in the dynamic list since it came from data, else custom
  const catSel = document.getElementById('f-cat');
  const catOpts = Array.from(catSel.options).map(o => o.value);
  if(catOpts.includes(q.cat)){
    catSel.value = q.cat;
    document.getElementById('f-custom-wrap').style.display = 'none';
  } else {
    catSel.value = '__custom__';
    document.getElementById('f-custom-wrap').style.display = 'block';
    document.getElementById('f-cat-custom').value = q.cat;
  }
  document.getElementById('f-pts').value = q.pts;
  document.getElementById('f-type').value = q.type;
  document.getElementById('f-q').value = q.q || '';
  // T/F fields
  const tfStmtEl = document.getElementById('f-tf-stmt');
  const tfAnsEl  = document.getElementById('f-tf-answer');
  const tfExplEl = document.getElementById('f-tf-explanation');
  if(tfStmtEl) tfStmtEl.value = q.true_false_stmt || '';
  if(tfAnsEl)  tfAnsEl.value  = (q.tf_answer === 'false' || String(q.tf_answer).toUpperCase() === 'FALSE') ? 'false' : 'true';
  if(tfExplEl) tfExplEl.value = q.explanation || '';
  document.getElementById('f-hint').value = q.hint || '';
  document.getElementById('f-answer').value = q.answer != null ? q.answer : '';
  document.getElementById('f-tol').value = q.tolerance != null ? q.tolerance : '0.1';
  document.getElementById('f-unit').value = q.unit || '';
  document.getElementById('given-rows').innerHTML = '';
  if(q.given) Object.entries(q.given).forEach(([k,v]) => addGivenRow(k,v));
  if(q.type==='mc'){
    const opts = (q.options||[]).map(o => ({t:o, ok:o===q.answer}));
    initMCBuilder(opts);
  } else if(q.type !== 'tf'){
    initMCBuilder([{t:'',ok:true},{t:'',ok:false},{t:'',ok:false},{t:'',ok:false}]);
  }
  if(q.type !== 'tf') initSteps(q.solution || ['']);
  else initSteps(['']);
  onTypeChange();
  document.getElementById('form-msg').style.display = 'none';
}

function addGivenRow(k='',v=''){
  const wrap = document.getElementById('given-rows');
  const row = document.createElement('div');
  row.className = 'given-row';
  const k_in = document.createElement('input');
  k_in.className = 'f-input'; k_in.placeholder = 'Label (e.g. P\u2081)'; k_in.value = k;
  k_in.style.flex = '1';
  const v_in = document.createElement('input');
  v_in.className = 'f-input'; v_in.placeholder = 'Value (e.g. 2.5 atm)'; v_in.value = v;
  v_in.style.flex = '2';
  const del = document.createElement('button');
  del.className = 'x-btn'; del.textContent = '✕';
  del.addEventListener('click', () => row.remove());
  row.appendChild(k_in); row.appendChild(v_in); row.appendChild(del);
  wrap.appendChild(row);
}

function initMCBuilder(opts){ document.getElementById('mc-builder').innerHTML = ''; opts.forEach(o => addMCRow(o.t, o.ok)); }
function addMCOpt(){ addMCRow('', false); }
function addMCRow(text, isCorrect){
  const wrap = document.getElementById('mc-builder');
  const row = document.createElement('div');
  row.className = 'mc-opt-row';
  const inp = document.createElement('input');
  inp.className = 'mc-opt-inp'+(isCorrect?' is-ans':''); inp.placeholder = 'Answer option\u2026'; inp.value = text;
  const markBtn = document.createElement('button');
  markBtn.type = 'button';
  markBtn.className = 'mark-btn '+(isCorrect?'marked':'unmarked');
  markBtn.textContent = isCorrect ? '\u2713 Correct' : 'Mark Correct';
  markBtn.addEventListener('click', () => {
    document.querySelectorAll('#mc-builder .mc-opt-inp').forEach(i => i.classList.remove('is-ans'));
    document.querySelectorAll('#mc-builder .mark-btn').forEach(b => { b.className='mark-btn unmarked'; b.textContent='Mark Correct'; });
    inp.classList.add('is-ans');
    markBtn.className = 'mark-btn marked'; markBtn.textContent = '\u2713 Correct';
  });
  const del = document.createElement('button');
  del.type='button'; del.className='x-btn'; del.textContent='✕';
  del.addEventListener('click', () => row.remove());
  row.appendChild(inp); row.appendChild(markBtn); row.appendChild(del);
  wrap.appendChild(row);
}

function initSteps(steps){ document.getElementById('steps-builder').innerHTML = ''; steps.forEach(s => addStep(s)); }
function addStep(text=''){
  const wrap = document.getElementById('steps-builder');
  const row = document.createElement('div');
  row.className = 'step-row';
  const ta = document.createElement('textarea');
  ta.className = 'step-ta'; ta.rows = 1;
  ta.placeholder = 'e.g. P\u2082 = P\u2081 \u00d7 V\u2081 / V\u2082 = 3.25 atm'; ta.value = text;
  ta.oninput = function(){ this.style.height='auto'; this.style.height=this.scrollHeight+'px'; };
  const del = document.createElement('button');
  del.type='button'; del.className='step-del'; del.textContent='✕';
  del.addEventListener('click', () => row.remove());
  row.appendChild(ta); row.appendChild(del);
  wrap.appendChild(row);
  setTimeout(() => { ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; }, 10);
}

function saveQ(){
  const idx = document.getElementById('f-edit-idx').value;
  const catSel = document.getElementById('f-cat').value;
  const cat = catSel==='__custom__' ? document.getElementById('f-cat-custom').value.trim() : catSel;
  const pts = parseInt(document.getElementById('f-pts').value);
  const type = document.getElementById('f-type').value;
  const qText = document.getElementById('f-q').value.trim();
  const hint = document.getElementById('f-hint').value.trim();
  if(!cat){ alert('Category is required.'); return; }
  if(type !== 'tf' && !qText){ alert('Question text is required.'); return; }
  if(type === 'tf'){
    const tfStmtCheck = (document.getElementById('f-tf-stmt')?.value || '').trim();
    if(!tfStmtCheck){ alert('A True/False statement is required.'); return; }
  }

  const given = {};
  document.querySelectorAll('#given-rows .given-row').forEach(row => {
    const ins = row.querySelectorAll('input');
    const k=ins[0].value.trim(), v=ins[1].value.trim();
    if(k&&v) given[k]=v;
  });

  const solution = Array.from(document.querySelectorAll('#steps-builder .step-ta'))
    .map(t => t.value.trim()).filter(Boolean);

  const chKey   = document.getElementById('f-chapter').value || 'ch1';
  const topKey  = document.getElementById('f-topic').value   || 'general';
  const ch  = CHAPTERS[chKey];
  const top = ch?.topics?.[topKey];
  const q = { cat, pts, type, q:qText, hint, solution,
    chapter:       chKey,
    chapter_label: ch?.label  || chKey,
    chapter_name:  ch?.name   || chKey,
    topic:         topKey,
    topic_label:   top?.label || topKey,
  };
  if(Object.keys(given).length) q.given = given;

  if(type==='mc'){
    const rows = document.querySelectorAll('#mc-builder .mc-opt-row');
    const options=[]; let answer='';
    rows.forEach(row => {
      const v = row.querySelector('.mc-opt-inp').value.trim();
      if(v){ options.push(v); if(row.querySelector('.mark-btn').classList.contains('marked')) answer=v; }
    });
    if(options.length < 2){ alert('Add at least 2 answer options.'); return; }
    if(!answer){ alert('Mark one option as the correct answer.'); return; }
    q.options = options; q.answer = answer;
  } else if(type === 'tf'){
    q.true_false_stmt = (document.getElementById('f-tf-stmt')?.value || '').trim();
    q.tf_answer       = document.getElementById('f-tf-answer')?.value || 'true';
    q.explanation     = (document.getElementById('f-tf-explanation')?.value || '').trim();
    q.answer          = q.tf_answer; // keep answer field consistent
  } else {
    const ans = parseFloat(document.getElementById('f-answer').value);
    const tol = parseFloat(document.getElementById('f-tol').value);
    if(isNaN(ans)){ alert('Enter a numeric answer.'); return; }
    q.answer = ans; q.tolerance = isNaN(tol) ? 0.1 : tol;
    const unit = document.getElementById('f-unit').value.trim();
    if(unit) q.unit = unit;
  }

  if(idx !== '') customBank[+idx] = q; else customBank.push(q);
  _saveCustom();
  rebuildChapters();
  const msg = document.getElementById('form-msg');
  msg.style.display = 'flex';
  setTimeout(() => { msg.style.display='none'; }, 2500);
  initForm();
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }


// ── Visual question helpers ───────────────────────────────────
// parseVP: parse pipe-separated "key:value|key:value" visual_params string
function parseVP(str){
  if(!str) return {};
  const obj = {};
  str.split('|').forEach(pair => {
    const idx = pair.indexOf(':');
    if(idx < 0) return;
    obj[pair.slice(0,idx).trim()] = pair.slice(idx+1).trim();
  });
  return obj;
}

// _renderDataTable: render semicolon/pipe encoded data table to HTML string
// Format: "H1|H2|H3;R1C1|R1C2|R1C3;R2C1|R2C2|R2C3"
function _renderDataTable(raw){
  if(!raw) return '';
  const rows = raw.split(';').map(r => r.split('|'));
  if(!rows.length) return '';
  const header = rows[0].map(h => `<th>${esc(h.trim())}</th>`).join('');
  const body   = rows.slice(1).map(r =>
    `<tr>${r.map(c => `<td>${esc(c.trim())}</td>`).join('')}</tr>`
  ).join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:.82rem;">
    <thead style="background:var(--surf2)"><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

// renderQuestionVisual: draw a visual into the modal's canvas area.
// Canvas-drawing sub-functions (particle diagrams, burets, etc.) live in
// cr-games-vocab.js / the Visual Lab. This dispatcher calls them if available,
// otherwise hides the visual wrap gracefully so questions still work.
function renderQuestionVisual(q, targetCanvas, targetCap){
  // Resolve DOM elements (legacy modal IDs or caller-supplied elements)
  const wrap   = targetCanvas
    ? targetCanvas.closest?.('.modal-visual') ?? null
    : document.getElementById('m-visual');
  const cap    = targetCap    || document.getElementById('m-visual-caption');
  const canvas = targetCanvas || document.getElementById('m-canvas');

  if(!q || !q.visual_type){
    if(wrap) wrap.style.display = 'none';
    return;
  }
  if(wrap) wrap.style.display = '';
  if(cap)  cap.textContent = '';

  // Dispatch table — populated by each draw function if it exists globally.
  // Functions are defined in cr-games-vocab.js (Visual Lab section).
  const allDrawFns = {
    particle_diagram: typeof drawParticleDiagram  !== 'undefined' ? drawParticleDiagram  : null,
    buret:            typeof drawBuret             !== 'undefined' ? drawBuret             : null,
    particle_phase:   typeof drawParticlePhase     !== 'undefined' ? drawParticlePhase     : null,
    graph_sketch:     typeof drawGraphSketch       !== 'undefined' ? drawGraphSketch       : null,
    beaker_mix:       typeof drawBeakerMix         !== 'undefined' ? drawBeakerMix         : null,
    orbital_diagram:  typeof drawOrbitalDiagram    !== 'undefined' ? drawOrbitalDiagram    : null,
    molecule_view:    typeof drawMoleculeView      !== 'undefined' ? drawMoleculeView      : null,
    electrolyte:      typeof drawElectrolyte       !== 'undefined' ? drawElectrolyte       : null,
    grad_cylinder:    typeof drawGradCylinder      !== 'undefined' ? drawGradCylinder      : null,
    balance:          typeof drawBalance           !== 'undefined' ? drawBalance           : null,
    labeled_flask:    typeof drawLabeledFlask      !== 'undefined' ? drawLabeledFlask      : null,
    dilution:         typeof drawDilution          !== 'undefined' ? drawDilution          : null,
    energy_diagram:   typeof drawEnergyDiagram     !== 'undefined' ? drawEnergyDiagram     : null,
    titration_curve:  typeof drawTitrationCurve    !== 'undefined' ? drawTitrationCurve    : null,
    kinetics_graph:   typeof drawKineticsGraph     !== 'undefined' ? drawKineticsGraph     : null,
    maxwell_boltzmann:typeof drawMaxwellBoltzmann  !== 'undefined' ? drawMaxwellBoltzmann  : null,
    galvanic_cell:    typeof drawGalvanicCell      !== 'undefined' ? drawGalvanicCell      : null,
    heating_curve:    typeof drawHeatingCurve      !== 'undefined' ? drawHeatingCurve      : null,
    mass_spectrum:    typeof drawMassSpectrum      !== 'undefined' ? drawMassSpectrum      : null,
  };

  const fn = allDrawFns[q.visual_type];
  if(fn && canvas){
    try { fn(canvas, parseVP(q.visual_params || ''), cap); }
    catch(e){ console.warn('renderQuestionVisual draw error:', q.visual_type, e); }
  } else {
    // Draw function not available (Visual Lab removed) — hide gracefully
    if(wrap) wrap.style.display = 'none';
  }
}

// Colour palette used by particle draw functions (available globally)
const PCOL = {
  R:'#ef4444', B:'#3d8bff', G:'#22c55e', Y:'#f5c842',
  P:'#a855f7', O:'#f97316', W:'rgba(240,244,255,0.85)', K:'#374151',
};
function pcol(code){ return PCOL[(code||'').toUpperCase()] || '#888'; }

// ================================================================
// §CONN_BOARDS  —  Connections Board Builder
// ================================================================

const CB_COLORS = [
  { name:'🟡 Yellow', cls:'conn-c0', colorIdx:0 },
  { name:'🟢 Green',  cls:'conn-c1', colorIdx:1 },
  { name:'🔵 Blue',   cls:'conn-c2', colorIdx:2 },
  { name:'🟣 Purple', cls:'conn-c3', colorIdx:3 },
];

// ── Render the builder form ───────────────────────────────────────
function renderBoardsTab(){
  _cbRenderGroups();
  _cbRenderBank();
}

function _cbRenderGroups(){
  const wrap = document.getElementById('cb-groups');
  wrap.innerHTML = '';
  CB_COLORS.forEach((c, gi) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:6px;background:var(--bg);border:1px solid var(--border2);border-radius:10px;padding:14px 16px;';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
        <div class="${c.cls}" style="width:14px;height:14px;border-radius:3px;flex-shrink:0;"></div>
        <label style="font-family:var(--mono);font-size:.65rem;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);">${c.name} — Category Label</label>
        <input id="cb-g${gi}-label" class="f-input" placeholder="e.g. Charles's Law" style="flex:1;min-width:0;">
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
        ${[0,1,2,3].map(wi => `<input id="cb-g${gi}-w${wi}" class="f-input" placeholder="Word ${wi+1}">`).join('')}
      </div>`;
    wrap.appendChild(row);
  });
}

// ── Read builder form values ──────────────────────────────────────
function _cbReadForm(){
  const name = document.getElementById('cb-name').value.trim();
  const groups = CB_COLORS.map((c, gi) => {
    const label = document.getElementById(`cb-g${gi}-label`).value.trim();
    const words = [0,1,2,3].map(wi => {
      const v = document.getElementById(`cb-g${gi}-w${wi}`).value.trim().toUpperCase();
      return v;
    }).filter(Boolean);
    return { label, words, colorIdx: c.colorIdx };
  });
  return { name, groups };
}

function _cbValidate(board){
  if(!board.name) return 'Please enter a board name.';
  for(let i=0;i<4;i++){
    const g = board.groups[i];
    if(!g.label) return `Group ${i+1}: please enter a category label.`;
    if(g.words.length < 4) return `Group ${i+1} (${g.label}): need exactly 4 words (${g.words.length} entered).`;
  }
  return null;
}

function _cbShowMsg(msg, isErr){
  const el = document.getElementById('cb-msg');
  el.textContent = msg;
  el.style.color = isErr ? 'var(--red)' : 'var(--green)';
  el.style.display = '';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function _cbClear(){
  document.getElementById('cb-name').value = '';
  CB_COLORS.forEach((c, gi) => {
    document.getElementById(`cb-g${gi}-label`).value = '';
    [0,1,2,3].forEach(wi => { document.getElementById(`cb-g${gi}-w${wi}`).value = ''; });
  });
}

// ── Load a saved board back into the builder form ─────────────────
function _cbLoadIntoForm(board){
  document.getElementById('cb-name').value = board.name;
  board.groups.forEach((g, gi) => {
    const labelEl = document.getElementById(`cb-g${gi}-label`);
    if(labelEl) labelEl.value = g.label;
    g.words.forEach((w, wi) => {
      const wEl = document.getElementById(`cb-g${gi}-w${wi}`);
      if(wEl) wEl.value = w;
    });
  });
  _cbShowMsg('Loaded into builder — edit then save.', false);
}

// ── Board bank storage ────────────────────────────────────────────
function _cbLoadBank(){
  try { return JSON.parse(localStorage.getItem('chemq_conn_boards') || '[]'); }
  catch(e){ return []; }
}

function _cbSaveBank(bank){
  localStorage.setItem('chemq_conn_boards', JSON.stringify(bank));
}

function saveBoardToBank(){
  const board = _cbReadForm();
  const err = _cbValidate(board);
  if(err){ _cbShowMsg(err, true); return; }
  board.id = 'board_' + Date.now();
  board.created = new Date().toLocaleDateString();
  const bank = _cbLoadBank();
  // Replace if same name exists
  const existing = bank.findIndex(b => b.name === board.name);
  if(existing >= 0){ bank[existing] = board; }
  else { bank.push(board); }
  _cbSaveBank(bank);
  _cbShowMsg(`✓ Saved "${board.name}" to board bank!`, false);
  _cbRenderBank();
}

function deleteBoardFromBank(id){
  const bank = _cbLoadBank().filter(b => b.id !== id);
  _cbSaveBank(bank);
  _cbRenderBank();
}

// ── Launch current builder board directly in the game ─────────────
function launchCustomBoard(board){
  const b = board || _cbReadForm();
  if(!board){
    const err = _cbValidate(b);
    if(err){ _cbShowMsg(err, true); return; }
  }
  window._activeConnBoard = b;
  if(typeof startConnections === 'function') startConnections();
  else if(typeof showScreen === 'function') showScreen('conn-screen');
}

// ── Render the board bank list ────────────────────────────────────
function _cbRenderBank(){
  const wrap = document.getElementById('cb-bank');
  const bank = _cbLoadBank();
  if(!bank.length){
    wrap.innerHTML = '<div style="font-family:var(--mono);font-size:.72rem;color:var(--muted);padding:14px 0;">No saved boards yet. Build one above and click Save.</div>';
    return;
  }
  wrap.innerHTML = '';
  bank.forEach(board => {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surf);border:1px solid var(--border2);border-radius:10px;padding:14px 18px;';
    const swatches = board.groups.map((g,i) =>
      `<span class="conn-c${g.colorIdx}" style="display:inline-block;padding:3px 10px;border-radius:6px;font-family:var(--mono);font-size:.6rem;margin-right:4px;margin-bottom:3px;">${g.label || '?'}: ${g.words.slice(0,4).join(', ')}</span>`
    ).join('');
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="font-family:var(--disp);font-size:.95rem;letter-spacing:.04em;color:var(--text);flex:1;">${esc(board.name)}</div>
        <div style="font-family:var(--mono);font-size:.58rem;color:var(--muted);">Saved ${board.created||''}</div>
        <button class="ctrl-btn" onclick="launchCustomBoard(${JSON.stringify(board).replace(/"/g,'&quot;')})"
          style="background:rgba(244,114,182,.08);border-color:rgba(244,114,182,.3);color:#f472b6;">▶ Play</button>
        <button class="ctrl-btn" onclick="_cbLoadIntoForm(JSON.parse(this.dataset.b))" data-b='${JSON.stringify(board)}'
          style="background:rgba(245,200,66,.08);border-color:rgba(245,200,66,.3);color:var(--gold);">✎ Edit</button>
        <button class="ctrl-btn" onclick="exportConnStandalone(JSON.parse(this.dataset.b))" data-b='${JSON.stringify(board)}'
          style="background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.3);color:var(--green);">⬇ Export HTML</button>
        <button class="ctrl-btn" onclick="deleteBoardFromBank('${board.id}')"
          style="border-color:rgba(239,68,68,.3);color:var(--red);">✕</button>
      </div>
      <div>${swatches}</div>`;
    wrap.appendChild(card);
  });
}

// ── Export a board as standalone HTML ────────────────────────────
function exportConnStandalone(board){
  const boardJSON = JSON.stringify(board);

  const CONN_EMOJIS = ['🟡','🟢','🔵','🟣'];
  const MAX_MISTAKES = 4;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${board.name} — Connections</title>
<style>
  :root{
    --bg:#0a0c14;--surf:#111827;--surf2:#1a2235;
    --border:#1e293b;--border2:#2d3f5c;
    --text:#e2e8f0;--muted:#64748b;
    --gold:#f5c842;--green:#22c55e;--red:#ef4444;
    --blue:#3d8bff;--cyan:#06b6d4;
    --disp:'Trebuchet MS',sans-serif;
    --mono:'Courier New',monospace;
    --sans:system-ui,sans-serif;
    --r:10px;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);
    min-height:100vh;display:flex;flex-direction:column;align-items:center;}
  .hdr{width:100%;background:var(--surf);border-bottom:1px solid var(--border);
    padding:14px 20px;display:flex;align-items:center;gap:14px;flex-shrink:0;}
  .hdr-title{font-family:var(--disp);font-size:1.4rem;letter-spacing:.08em;
    background:linear-gradient(135deg,#f472b6,#818cf8);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  .hdr-sub{font-family:var(--mono);font-size:.65rem;color:var(--muted);}
  .ctrl-btn{padding:6px 14px;border-radius:7px;font-family:var(--mono);font-size:.68rem;
    font-weight:700;cursor:pointer;transition:all .15s;border:1px solid var(--border2);
    background:var(--surf2);color:var(--text);}
  .ctrl-btn:hover{border-color:var(--text);}
  .body{flex:1;width:100%;max-width:680px;display:flex;flex-direction:column;
    align-items:center;padding:20px 16px;gap:14px;overflow-y:auto;}
  .mistakes{display:flex;gap:8px;align-items:center;font-family:var(--mono);font-size:.65rem;color:var(--muted);}
  .dot{width:12px;height:12px;border-radius:50%;background:var(--muted);transition:background .3s;}
  .dot.used{background:var(--red);}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%;}
  .tile{background:var(--surf2);border:2px solid var(--border2);border-radius:10px;
    padding:14px 8px;text-align:center;cursor:pointer;transition:all .15s;
    font-family:var(--mono);font-size:.8rem;font-weight:700;color:var(--text);
    letter-spacing:.04em;line-height:1.3;min-height:64px;display:flex;
    align-items:center;justify-content:center;user-select:none;}
  .tile:hover{border-color:var(--text);}
  .tile.selected{border-color:var(--gold);background:rgba(245,200,66,.15);color:var(--gold);}
  @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
  .tile.shake{animation:shake .4s ease;}
  .solved-row{width:100%;border-radius:10px;padding:14px 16px;text-align:center;}
  @keyframes mIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:none}}
  .solved-row{animation:mIn .3s ease;}
  .solved-title{font-family:var(--disp);font-size:1.1rem;letter-spacing:.05em;margin-bottom:3px;}
  .solved-words{font-family:var(--mono);font-size:.7rem;opacity:.85;line-height:1.6;}
  .actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
  .btn{padding:10px 22px;border-radius:9px;font-family:var(--sans);font-weight:700;
    font-size:.82rem;cursor:pointer;transition:all .15s;border:1px solid;}
  .btn-shuffle{background:var(--surf2);border-color:var(--border2);color:var(--text);}
  .btn-shuffle:hover{border-color:var(--text);}
  .btn-deselect{background:transparent;border-color:var(--border2);color:var(--muted);}
  .btn-deselect:hover{border-color:var(--text);color:var(--text);}
  .btn-submit{background:var(--text);border-color:var(--text);color:var(--bg);}
  .btn-submit:hover{background:var(--gold);border-color:var(--gold);}
  .btn-submit:disabled{opacity:.3;cursor:not-allowed;}
  .result{text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;}
  .result-title{font-family:var(--disp);font-size:2.2rem;letter-spacing:.06em;}
  .result-sub{font-size:.88rem;color:var(--muted);}
  .emoji-grid{display:flex;flex-direction:column;gap:4px;align-items:center;font-size:1.4rem;letter-spacing:2px;}
  .c0{background:linear-gradient(135deg,#854d0e,#713f12);color:#fef9c3;}
  .c1{background:linear-gradient(135deg,#166534,#14532d);color:#dcfce7;}
  .c2{background:linear-gradient(135deg,#1e3a8a,#1e40af);color:#dbeafe;}
  .c3{background:linear-gradient(135deg,#6b21a8,#7e22ce);color:#f3e8ff;}
  .one-away{font-family:var(--mono);font-size:.68rem;color:var(--gold);text-align:center;}
</style>
</head>
<body>
<div class="hdr">
  <div style="flex:1;">
    <div class="hdr-title">CONNECTIONS</div>
    <div class="hdr-sub" id="hdr-sub"></div>
  </div>
  <button class="ctrl-btn" onclick="newGame()">↺ New Game</button>
</div>
<div class="body" id="body"></div>
<script>
const BOARD = ${boardJSON};
const EMOJIS = ${JSON.stringify(CONN_EMOJIS)};
const MAX_MISTAKES = ${MAX_MISTAKES};
let state = null;

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
  return arr;
}

function newGame(){
  const groups = BOARD.groups.map((g,i) => ({
    label: g.label,
    words: shuffle([...g.words]).slice(0,4),
    colorIdx: g.colorIdx !== undefined ? g.colorIdx : i,
    solved: false,
  }));
  const tiles = shuffle(groups.flatMap(g => g.words.map(w => ({word:w, group:g.label, solved:false}))));
  state = {
    groups, tiles,
    selected: new Set(),
    mistakes: 0, maxMistakes: MAX_MISTAKES,
    gameOver: false, won: false,
    solvedGroups: [], _oneAway: false,
  };
  document.getElementById('hdr-sub').textContent = BOARD.name;
  render();
}

function render(){
  const s = state;
  const body = document.getElementById('body');
  body.innerHTML = '';

  s.solvedGroups.forEach(g => {
    const row = document.createElement('div');
    row.className = 'solved-row c'+g.colorIdx;
    row.innerHTML = '<div class="solved-title">'+g.label+'</div><div class="solved-words">'+g.words.join(', ')+'</div>';
    body.appendChild(row);
  });

  if(s.gameOver){ renderResult(body); return; }

  const dots = document.createElement('div');
  dots.className = 'mistakes';
  dots.innerHTML = '<span>Mistakes:</span>' +
    Array.from({length:s.maxMistakes},(_,i) =>
      '<div class="dot'+(i<s.mistakes?' used':'')+'"></div>').join('');
  body.appendChild(dots);

  const grid = document.createElement('div');
  grid.className = 'grid';
  s.tiles.filter(t=>!t.solved).forEach(t => {
    const tile = document.createElement('div');
    tile.className = 'tile'+(s.selected.has(t.word)?' selected':'');
    tile.textContent = t.word;
    tile.dataset.word = t.word;
    tile.addEventListener('click', () => toggle(t.word));
    grid.appendChild(tile);
  });
  body.appendChild(grid);

  if(s._oneAway){
    const h = document.createElement('div');
    h.className = 'one-away';
    h.textContent = '🔥 One away!';
    body.appendChild(h);
    s._oneAway = false;
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.innerHTML =
    '<button class="btn btn-shuffle" onclick="doShuffle()">🔀 Shuffle</button>'+
    '<button class="btn btn-deselect" onclick="deselect()">Deselect All</button>'+
    '<button class="btn btn-submit" id="sub-btn" onclick="submit()"'+(s.selected.size!==4?' disabled':'')+'>Submit</button>';
  body.appendChild(actions);
}

function renderResult(body){
  const s = state;
  const won = s.won;
  const result = document.createElement('div');
  result.className = 'result';
  result.innerHTML =
    '<div class="result-title" style="color:'+(won?'var(--green)':'var(--red)')+'">'+
      (won ? '🎉 Solved!' : '💀 Better luck next time')+'</div>'+
    '<div class="result-sub">'+(won ? 'Solved with '+s.mistakes+' mistake'+(s.mistakes!==1?'s':'')+'!' : 'The categories were:')+'</div>';

  s.groups.forEach(g => {
    const row = document.createElement('div');
    row.className = 'solved-row c'+g.colorIdx;
    row.style.cssText = 'width:100%;margin-bottom:6px;';
    row.innerHTML = '<div class="solved-title">'+g.label+'</div><div class="solved-words">'+g.words.join(', ')+'</div>';
    result.appendChild(row);
  });

  const eg = document.createElement('div');
  eg.className = 'emoji-grid';
  s.solvedGroups.forEach(g => {
    eg.appendChild(Object.assign(document.createElement('div'),{textContent:EMOJIS[g.colorIdx].repeat(4)}));
  });
  const rem = 4 - s.solvedGroups.length;
  for(let i=0;i<rem;i++) eg.appendChild(Object.assign(document.createElement('div'),{textContent:'⬛⬛⬛⬛'}));
  result.appendChild(eg);

  const btns = document.createElement('div');
  btns.className = 'actions';
  btns.innerHTML = '<button class="btn btn-submit" onclick="newGame()">▶ Play Again</button>';
  result.appendChild(btns);
  body.appendChild(result);
}

function toggle(word){
  const s = state;
  if(s.gameOver) return;
  if(s.selected.has(word)) s.selected.delete(word);
  else { if(s.selected.size>=4) return; s.selected.add(word); }
  render();
}

function doShuffle(){ shuffle(state.tiles); render(); }
function deselect(){ state.selected.clear(); render(); }

function submit(){
  const s = state;
  if(s.selected.size!==4||s.gameOver) return;
  const sel = [...s.selected];
  const match = s.groups.find(g => !g.solved && sel.every(w => g.words.includes(w)));
  if(match){
    match.solved = true;
    sel.forEach(w => { const t=s.tiles.find(t=>t.word===w); if(t) t.solved=true; });
    s.solvedGroups.push(match);
    s.selected.clear();
    if(s.solvedGroups.length===4){ s.gameOver=true; s.won=true; }
  } else {
    const oneAway = s.groups.some(g => !g.solved && sel.filter(w=>g.words.includes(w)).length===3);
    s._oneAway = oneAway;
    s.mistakes++;
    render();
    sel.forEach(w => {
      const el = document.querySelector('.tile[data-word="'+CSS.escape(w)+'"]');
      if(el){ el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    });
    if(s.mistakes>=s.maxMistakes){
      setTimeout(()=>{
        s.gameOver=true; s.won=false;
        s.groups.filter(g=>!g.solved).forEach(g=>{
          g.solved=true;
          g.words.forEach(w=>{const t=s.tiles.find(t=>t.word===w);if(t)t.solved=true;});
          s.solvedGroups.push(g);
        });
        render();
      },600);
    }
    return;
  }
  render();
}

newGame();
<\/script>
</body>
</html>`;

  const blob = new Blob([html], {type:'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = board.name.replace(/[^a-z0-9]/gi,'_').toLowerCase() + '_connections.html';
  a.click();
  URL.revokeObjectURL(a.href);
}
