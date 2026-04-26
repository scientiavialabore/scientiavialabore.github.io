/* ================================================================
   cr-planner.js — Study Planner, Topic Selector, Session Tracking
   ─────────────────────────────────────────────────────────────────
   CONTENTS (in order):
     §PLANNER    Study Planner screen (topic picker + games tab + progress tab)
     §LAUNCHER   Universal game launcher / dispatcher
     §SESSION    Session bar, session report modal, weighted question picker

   UNIFIED TOPIC SELECTOR:
     The Study Planner IS the topic selector. There is no separate
     per-game chapter/topic picker anymore — all games launch from the
     planner's "🎮 Play" tab using studyPlan.selections.

     studyPlan.selections  — [{chKey, topicKey}] chosen by the student
     activeSelections      — mirror set just before each game launch
     boardQ()              — in cr-data.js, filters by activeSelections

   STUDY PLAN STATE (persisted in localStorage as 'chemq_plan'):
     {
       selections:  [{chKey, topicKey}],          // chosen topics
       results:     [{qid, q_text, correct, ...}], // all-time answer log
       performance: { [qid]: {seen,correct,wrong,lastCorrect,lastTs} },
       earnings:    { [gameName]: totalDollars },
       achievements: [{id, ts}]
     }

   DEPENDENCIES:
     cr-data.js    — CHAPTERS, allQ, boardQ, rebuildChapters
     cr-core.js    — showScreen
     cr-games-*.js — startJeopardyMulti, startPracticeMulti, startMillionaire, etc.

   KEY GLOBALS EXPORTED:
     studyPlan             — the persisted plan object (read by all game engines)
     spTrackResult(q, correct, game, earnings) — record a result + check achievements
     showPlanner(tab)      — navigate to planner screen
     plannerTab(tab)       — switch between planner tabs
     launchGame(gameId)    — entry point called by hub cards and hub widget buttons
     launcherGo()          — dispatch current game from planner selections
     openSessionReport()   — open the session report modal
     weightedPick(pool)    — pick next question using performance weights
     _updateSessionBar()   — refresh the persistent session bottom bar

   SESSION BAR:
     Shown while a game session is active. Displays active topics,
     session accuracy, and buttons to switch game or view report.
================================================================ */

// §PLANNER
/* ================================================================
   STUDY PLANNER ENGINE
   ─────────────────────────────────────────────────────────────────
   TODO — FUTURE ENHANCEMENTS (not yet implemented):

   UNIFIED HEADER BAR
   • Extract each game's header (back btn, title, score/streak, controls)
     into a single #game-header element that gets populated by each game
     on launch. Eliminates the ~9 duplicate .jeop-hdr/.mil-hdr/.fc-hdr etc.
     CSS classes and HTML blocks. Each game calls setGameHeader({title,
     controls:[]}) and the header injects them. Study plan summary strip
     lives in this header on all game screens.

   SPACED REPETITION SCHEDULER
   • After a correct answer schedule the question to reappear after
     1→3→7→14→30 days using lastTs + intervalDays in performance{}.
   • Show "Due today: N" count on hub and planner progress tab.

   MASTERY BADGES PER TOPIC
   • When a student hits ≥80% correct across all questions in a topic,
     award a ⭐ badge stored in studyPlan.achievements.
   • Show badge on topic chip in planner and on hub widget.

   CONNECTIONS GAME
   • Group vocab by connections_category into a NYT Connections-style
     board. Four groups of four words, colour-coded by difficulty.
   • vocabBank already has connections_category column populated.

   SPEED ROUND / BLITZ MODE
   • 30 questions, 20 seconds each, no hints.
   • Score = correct answers × time bonus. Leaderboard on completion.

   XP & LEVEL SYSTEM
   • Award XP per correct answer (difficulty × 10 XP).
   • Track totalXP in studyPlan, compute level (every 500 XP = +1 level).
   • Show level badge on hub. Never penalise for wrong answers.

   WEEKLY STREAK CALENDAR
   • GitHub-style heatmap grid on the Progress tab.
   • One cell per day, colour intensity = questions answered that day.
   • Stored as { [YYYY-MM-DD]: count } in studyPlan.

   PRINT / EXPORT STUDY SHEET
   • Generate a printable PDF/HTML of all missed questions with answers.
   • Button on Progress tab: "⬇ Download Review Sheet".

   ASSIGNMENT MODE
   • Teacher selects a question set, generates a shareable URL/code.
   • Students load that code and get exactly those questions in Practice.

   AI QUESTION GENERATOR (Claude API already integrated)
   • Teacher enters a topic, Claude generates 5 draft MC questions
     in the correct CSV format, ready to review and import.
================================================================ */

// ── Grade calculator ────────────────────────────────────────
// ── Study Plan — persisted state ────────────────────────────
// Loaded from localStorage on startup; saved by _spSave().
// Shape: { selections, results, performance, earnings, achievements }
let studyPlan = {
  selections:      [],   // [{chKey, topicKey}] — question games
  vocabSelections: {     // vocab games (Wordle, Connections, etc.)
    chapters: [],        // chKeys whose 'vocab'-type entries to include
    ions:     true,      // include all ion-type entries
    elements: false,     // include element-type entries
  },
  results:      [],
  performance:  {},
  earnings:     {},
  achievements: [],
};
try {
  const saved = JSON.parse(localStorage.getItem('chemq_plan') || 'null');
  if(saved && typeof saved === 'object'){
    studyPlan = { ...studyPlan, ...saved };
    if(!studyPlan.selections)   studyPlan.selections   = [];
    if(!studyPlan.results)      studyPlan.results      = [];
    if(!studyPlan.performance)  studyPlan.performance  = {};
    if(!studyPlan.earnings)     studyPlan.earnings     = {};
    if(!studyPlan.achievements) studyPlan.achievements = [];
    // Migration: vocabSelections added in v16 — rebuild from existing selections
    if(!studyPlan.vocabSelections){
      const existingChKeys = [...new Set(
        (studyPlan.selections||[]).map(s => s.chKey).filter(Boolean)
      )];
      studyPlan.vocabSelections = { chapters: existingChKeys, ions: true, elements: false };
    }
    const vs = studyPlan.vocabSelections;
    if(!Array.isArray(vs.chapters)) vs.chapters = [];
    if(vs.ions     === undefined)   vs.ions     = true;
    if(vs.elements === undefined)   vs.elements = false;
  }
} catch(e){}

function _spSave(){
  try { localStorage.setItem('chemq_plan', JSON.stringify(studyPlan)); } catch(e){}
}

// ── makeResult — typed factory for result objects ──────────
// All callers of spTrackResult should build the q-object normally;
// this factory ensures the stored record always has all required fields.
function makeResult(q, correct, game, earnings = 0) {
  return {
    qid:        q.id || ((q.chapter||'')+'|'+(q.cat||'')+'|'+(q.q||'').slice(0,40)),
    q_text:     (q.q||'').slice(0,120),
    chapter:    q.chapter    || '',
    topic:      q.topic      || '',
    cat:        q.cat        || '',
    difficulty: q.difficulty || 1,
    correct:    !!correct,
    game:       game         || '',
    earnings:   typeof earnings === 'number' ? earnings : 0,
    ts:         Date.now(),
  };
}

// Base spTrackResult — records earnings into studyPlan.
// cr-planner.js §SESSION wraps this to also update performance + achievements.
function spTrackResult(q, correct, game, earnings){
  if(!q) return;
  const result = makeResult(q, correct, game, earnings);
  studyPlan.results.push(result);
  // Accumulate earnings
  if(result.earnings > 0){
    studyPlan.earnings[game] = (studyPlan.earnings[game] || 0) + result.earnings;
  }
  _spSave();
}

// Weighted grade: each correct answer worth difficulty*1 pts out of difficulty*1 possible.
// Only counts questions in the current plan that have been attempted.
function _calcGrade(results){
  if(!results.length) return null;
  let earned = 0, possible = 0;
  results.forEach(r => {
    const w = r.difficulty || 1;
    possible += w;
    if(r.correct) earned += w;
  });
  if(!possible) return null;
  const pct = Math.round(earned / possible * 100);
  let letter, color;
  if(pct >= 93)      { letter='A+'; color='var(--green)'; }
  else if(pct >= 90) { letter='A';  color='var(--green)'; }
  else if(pct >= 87) { letter='B+'; color='#4ade80'; }
  else if(pct >= 83) { letter='B';  color='#4ade80'; }
  else if(pct >= 80) { letter='B-'; color='var(--cyan)'; }
  else if(pct >= 77) { letter='C+'; color='var(--cyan)'; }
  else if(pct >= 73) { letter='C';  color='var(--gold)'; }
  else if(pct >= 70) { letter='C-'; color='var(--gold)'; }
  else if(pct >= 60) { letter='D';  color='#f97316'; }
  else               { letter='F';  color='var(--red)'; }
  return { pct, letter, color, earned, possible };
}

// ── Achievement definitions ─────────────────────────────────
const ACHIEVEMENTS = [
  { id:'first_correct',  icon:'🎯', name:'First Blood',       desc:'Answer your first question correctly' },
  { id:'streak_5',       icon:'🔥', name:'On Fire',           desc:'Get 5 correct in a row in Practice' },
  { id:'streak_10',      icon:'🌋', name:'Unstoppable',       desc:'10-question correct streak in Practice' },
  { id:'perfect_board',  icon:'🏆', name:'Perfect Board',     desc:'Complete a Jeopardy board with no wrong answers' },
  { id:'mil_win',        icon:'💎', name:'Millionaire',       desc:'Win $1,000,000 in Who Wants to be a Millionaire' },
  { id:'earn_1000',      icon:'💰', name:'First Grand',       desc:'Earn $1,000 total across all games' },
  { id:'earn_10000',     icon:'🏦', name:'High Roller',       desc:'Earn $10,000 total across all games' },
  { id:'earn_100000',    icon:'🤑', name:'Tycoon',            desc:'Earn $100,000 total across all games' },
  { id:'grade_a',        icon:'⭐', name:'Honor Roll',        desc:'Achieve an A grade (≥90%) in your plan' },
  { id:'mastered_topic', icon:'🎓', name:'Topic Master',      desc:'Answer every question in a topic correctly at least once' },
  { id:'seen_50',        icon:'📚', name:'Studious',          desc:'Attempt 50 unique questions' },
  { id:'seen_100',       icon:'🔬', name:'Scholar',           desc:'Attempt 100 unique questions' },
  { id:'crossword_done', icon:'✏️', name:'Word Wizard',       desc:'Complete a crossword puzzle' },
  { id:'wordle_3',       icon:'🟩', name:'Wordle Wizard',     desc:'Solve Chem Wordle in 3 guesses or fewer' },
  { id:'wordle_streak5', icon:'🔗', name:'Wordle Streak',     desc:'Win 5 Wordle puzzles in a row' },
];

function _checkAchievements(){
  const earned = new Set(studyPlan.achievements.map(a=>a.id));
  const newlyEarned = [];
  const totalEarnings = Object.values(studyPlan.earnings||{}).reduce((a,b)=>a+b,0);
  const totalSeen = Object.keys(studyPlan.performance||{}).length;
  const allResults = studyPlan.results || [];
  const grade = _calcGrade(allResults);
  const perfValues = Object.values(studyPlan.performance||{});

  const checks = {
    first_correct:  allResults.some(r=>r.correct),
    earn_1000:      totalEarnings >= 1000,
    earn_10000:     totalEarnings >= 10000,
    earn_100000:    totalEarnings >= 100000,
    grade_a:        grade && grade.pct >= 90,
    seen_50:        totalSeen >= 50,
    seen_100:       totalSeen >= 100,
  };
  Object.entries(checks).forEach(([id, met]) => {
    if(met && !earned.has(id)){
      newlyEarned.push(id);
      studyPlan.achievements.push({id, ts: Date.now()});
    }
  });
  if(newlyEarned.length){ _spSave(); _showAchievementToast(newlyEarned); }
}

function _showAchievementToast(ids){
  ids.forEach((id, i) => {
    const def = ACHIEVEMENTS.find(a=>a.id===id);
    if(!def) return;
    setTimeout(()=>{
      const toast = document.createElement('div');
      toast.style.cssText = `position:fixed;bottom:70px;left:50%;transform:translateX(-50%);
        background:var(--surf);border:1px solid var(--gold);border-radius:12px;
        padding:10px 18px;z-index:400;display:flex;align-items:center;gap:10px;
        box-shadow:0 4px 24px rgba(0,0,0,.6);animation:fIn .3s ease;font-size:.82rem;
        max-width:320px;`;
      toast.innerHTML = `<span style="font-size:1.4rem">${def.icon}</span>
        <div><div style="color:var(--gold);font-weight:700;font-family:var(--mono);font-size:.65rem;text-transform:uppercase;letter-spacing:.1em">Achievement Unlocked!</div>
        <div style="color:var(--text)">${def.name}</div></div>`;
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(), 4000);
    }, i * 500);
  });
}

// ── Vocab pool helper (mirrors cr-data.js activeVocabPool) ──
function _getActiveVocabPool(filter) {
  const vs       = studyPlan.vocabSelections || {};
  const chapters = vs.chapters || [];
  const wantIons  = vs.ions  !== false;
  const wantElems = !!vs.elements;

  return vocabBank.filter(v => {
    if(v.enabled === false) return false;
    if(filter === 'wordle' && (v.wordle_eligible === false || v.is_multiword)) return false;
    if(v.type === 'ion')     return wantIons;
    if(v.type === 'element') return wantElems;
    return chapters.includes(v.chapter);
  });
}

// ── Vocab Sources picker (rendered into planner Topics tab) ─
function _renderVocabSelector(containerEl) {
  if(!containerEl) return;
  containerEl.innerHTML = '';

  const vs = studyPlan.vocabSelections;

  const hdr = document.createElement('div');
  hdr.style.cssText =
    'font-family:var(--mono);font-size:.6rem;text-transform:uppercase;' +
    'letter-spacing:.1em;color:var(--muted);margin:28px 0 10px;' +
    'padding-top:20px;border-top:1px solid var(--border);' +
    'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
  hdr.innerHTML =
    '<span style="color:var(--cyan)">🗂 Vocab Games — Word Sources</span>' +
    '<span style="font-size:.55rem;color:var(--muted);text-transform:none;font-weight:normal;">' +
    'Wordle · Connections · Crossword · Flashcards · WOF · Word Search</span>';
  containerEl.appendChild(hdr);

  const typeRow = document.createElement('div');
  typeRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;';
  [
    { key:'ions',     label:'⚗ Ions',     color:'#06b6d4' },
    { key:'elements', label:'🧪 Elements', color:'#a855f7' },
  ].forEach(({ key, label, color }) => {
    const isOn  = !!vs[key];
    const count = vocabBank.filter(v => v.type === key && v.enabled !== false).length;
    if(!count) return;
    const btn = document.createElement('button');
    btn.className = 'ctrl-btn';
    btn.style.cssText =
      'font-size:.65rem;padding:4px 14px;border-radius:14px;transition:all .15s;' +
      (isOn
        ? `border-color:${color};color:${color};background:${color}22;`
        : 'border-color:var(--border2);color:var(--muted);background:transparent;');
    btn.innerHTML = `${isOn ? '✓ ' : ''}${label} <span style="opacity:.65">(${count})</span>`;
    btn.addEventListener('click', () => {
      vs[key] = !vs[key];
      _spSave();
      _renderVocabSelector(containerEl);
    });
    typeRow.appendChild(btn);
  });
  containerEl.appendChild(typeRow);

  const entries = chEntries();
  const chaptersWithVocab = entries.filter(([chKey]) =>
    vocabBank.some(v => v.chapter === chKey && v.type === 'vocab' && v.enabled !== false)
  );

  if(chaptersWithVocab.length) {
    const chLabel = document.createElement('div');
    chLabel.style.cssText =
      'font-family:var(--mono);font-size:.58rem;color:var(--muted);margin-bottom:8px;';
    chLabel.textContent = 'Vocab words by chapter:';
    containerEl.appendChild(chLabel);

    const chGrid = document.createElement('div');
    chGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;';

    const allOn = chaptersWithVocab.every(([ck]) => vs.chapters.includes(ck));
    const allBtn = document.createElement('button');
    allBtn.className = 'ctrl-btn';
    allBtn.style.cssText =
      'font-size:.6rem;padding:3px 11px;border-radius:12px;' +
      (allOn
        ? 'border-color:#818cf8;color:#818cf8;background:rgba(129,140,248,.1);'
        : 'border-color:var(--border2);color:var(--muted);background:transparent;');
    allBtn.textContent = allOn ? '✓ All chapters' : '+ All chapters';
    allBtn.addEventListener('click', () => {
      if(allOn) {
        vs.chapters = vs.chapters.filter(ck => !chaptersWithVocab.some(([k]) => k === ck));
      } else {
        chaptersWithVocab.forEach(([ck]) => {
          if(!vs.chapters.includes(ck)) vs.chapters.push(ck);
        });
      }
      _spSave();
      _renderVocabSelector(containerEl);
    });
    chGrid.appendChild(allBtn);

    chaptersWithVocab.forEach(([chKey, ch]) => {
      const isOn  = vs.chapters.includes(chKey);
      const count = vocabBank.filter(
        v => v.chapter === chKey && v.type === 'vocab' && v.enabled !== false
      ).length;
      const btn = document.createElement('button');
      btn.className = 'ctrl-btn';
      btn.style.cssText =
        'font-size:.6rem;padding:3px 11px;border-radius:12px;transition:all .15s;' +
        (isOn
          ? `border-color:${ch.color};color:${ch.color};background:${ch.color}22;`
          : 'border-color:var(--border2);color:var(--muted);background:transparent;');
      btn.innerHTML =
        `${isOn ? '✓ ' : ''}${ch.icon} ${esc(ch.label)} ` +
        `<span style="opacity:.6">(${count})</span>`;
      btn.addEventListener('click', () => {
        if(isOn) {
          vs.chapters = vs.chapters.filter(k => k !== chKey);
        } else {
          vs.chapters.push(chKey);
        }
        _spSave();
        _renderVocabSelector(containerEl);
      });
      chGrid.appendChild(btn);
    });
    containerEl.appendChild(chGrid);
  }

  const pool    = _getActiveVocabPool();
  const wordleN = _getActiveVocabPool('wordle').length;
  const connN   = pool.filter(v => !!v.connections_group).length;
  const nothingSel = !pool.length;
  const preview = document.createElement('div');
  preview.style.cssText =
    'font-family:var(--mono);font-size:.6rem;border-radius:8px;padding:8px 12px;' +
    'display:flex;gap:14px;flex-wrap:wrap;align-items:center;' +
    (nothingSel
      ? 'background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);color:var(--red);'
      : 'background:var(--surf2);border:1px solid var(--border);color:var(--muted);');
  preview.innerHTML = nothingSel
    ? '⚠ No vocab sources selected — vocab games will show an empty pool.'
    : `<span>📦 ${pool.length} entries selected</span>` +
      `<span>🟩 ${wordleN} Wordle-eligible</span>` +
      `<span>🔗 ${connN} with Connections group</span>`;
  containerEl.appendChild(preview);
}

// ── Planner screen ─────────────────────────────────────────
function showPlanner(tab){
  // Auto-select everything on first open so planner isn't blank
  if(!studyPlan.selections.length){
    const allQTopics = chEntries().flatMap(([ck,ch]) =>
      Object.keys(ch.topics).filter(tk =>
        allQ().some(q=>q.chapter===ck&&q.topic===tk&&q.enabled!==false&&q.enabled!=='0'&&q.enabled!==0)
      ).map(tk=>({chKey:ck,topicKey:tk}))
    );
    const chaptersWithVocab = chEntries()
      .filter(([ck]) => vocabBank.some(v=>v.chapter===ck&&v.type==='vocab'&&v.enabled!==false))
      .map(([ck])=>ck);
    if(allQTopics.length){
      studyPlan.selections = allQTopics;
      studyPlan.vocabSelections.chapters = chaptersWithVocab;
      if(studyPlan.vocabSelections.ions === undefined) studyPlan.vocabSelections.ions = true;
      _spSave();
    }
  }
  renderPlannerScreen();
  plannerTab(tab || 'topics');
  showScreen('planner-screen');
}

function plannerTab(tab){
  ['topics','games','progress'].forEach(t => {
    document.getElementById('planner-tab-'+t).style.display = t===tab ? '' : 'none';
    const btn = document.getElementById('ptab-'+t);
    if(btn) btn.classList.toggle('active', t===tab);
  });
  if(tab === 'games')    renderPlannerGames();
  if(tab === 'progress') renderPlannerProgress();
}

function renderPlannerScreen(){
  const wrap = document.getElementById('planner-ch-list');
  wrap.innerHTML = '';
  const entries = chEntries();
  if(!entries.length){
    wrap.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px;font-family:var(--mono);font-size:.8rem;">No chapters loaded yet. Import questions.csv first.</div>';
    _plannerHdrStats();
    return;
  }

  // ── Global controls bar ──
  const vs = studyPlan.vocabSelections;
  const chaptersWithVocab = entries.filter(([ck]) =>
    vocabBank.some(v => v.chapter===ck && v.type==='vocab' && v.enabled!==false)
  );
  const allQTopics = entries.flatMap(([ck,ch]) =>
    Object.keys(ch.topics).filter(tk =>
      allQ().some(q=>q.chapter===ck&&q.topic===tk&&q.enabled!==false&&q.enabled!=='0'&&q.enabled!==0)
    ).map(tk=>({chKey:ck,topicKey:tk}))
  );
  const allQSel = allQTopics.length && allQTopics.every(({chKey:ck,topicKey:tk})=>
    studyPlan.selections.some(s=>s.chKey===ck&&s.topicKey===tk)
  );
  const allVSel = chaptersWithVocab.length && chaptersWithVocab.every(([ck])=>vs.chapters.includes(ck));

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px;padding:10px 14px;background:var(--surf);border:1px solid var(--border2);border-radius:10px;';

  const qAllBtn = document.createElement('button');
  qAllBtn.className = 'chip-q-btn' + (allQSel ? ' q-active' : '');
  qAllBtn.style.cssText = 'padding:5px 14px;border-radius:10px;font-size:.68rem;';
  qAllBtn.textContent = allQSel ? '✓ All Questions' : '+ All Questions';
  qAllBtn.addEventListener('click', () => {
    if(allQSel){ studyPlan.selections = []; }
    else { allQTopics.forEach(({chKey:ck,topicKey:tk}) => {
      if(!studyPlan.selections.some(s=>s.chKey===ck&&s.topicKey===tk))
        studyPlan.selections.push({chKey:ck, topicKey:tk});
    }); }
    _spSave(); renderPlannerScreen();
  });

  const vAllBtn = document.createElement('button');
  vAllBtn.className = 'chip-v-btn' + (allVSel ? ' v-active' : '');
  vAllBtn.style.cssText = 'padding:5px 14px;border-radius:10px;font-size:.68rem;';
  vAllBtn.textContent = allVSel ? '✓ All Vocab' : '+ All Vocab';
  vAllBtn.addEventListener('click', () => {
    if(allVSel){ vs.chapters = vs.chapters.filter(ck=>!chaptersWithVocab.some(([k])=>k===ck)); }
    else { chaptersWithVocab.forEach(([ck]) => { if(!vs.chapters.includes(ck)) vs.chapters.push(ck); }); }
    _spSave(); renderPlannerScreen();
  });

  controls.appendChild(qAllBtn);
  controls.appendChild(vAllBtn);

  const divider = document.createElement('div');
  divider.style.cssText = 'width:1px;height:22px;background:var(--border2);margin:0 4px;flex-shrink:0;';
  controls.appendChild(divider);

  [
    { key:'ions',     label:'⚗ Ions',     color:'#06b6d4' },
    { key:'elements', label:'🧪 Elements', color:'#a855f7' },
  ].forEach(({key, label, color}) => {
    const count = vocabBank.filter(v=>v.type===key&&v.enabled!==false).length;
    if(!count) return;
    const isOn = !!vs[key];
    const btn = document.createElement('button');
    btn.className = 'ctrl-btn';
    btn.style.cssText = 'font-size:.65rem;padding:4px 12px;border-radius:14px;transition:all .15s;' +
      (isOn ? `border-color:\${color};color:\${color};background:\${color}22;` : 'border-color:var(--border2);color:var(--muted);');
    btn.innerHTML = `\${isOn?'✓ ':''}\${label} <span style="opacity:.6">(\${count})</span>`;
    btn.addEventListener('click', () => { vs[key]=!vs[key]; _spSave(); renderPlannerScreen(); });
    controls.appendChild(btn);
  });

  const pool = _getActiveVocabPool();
  const previewSpan = document.createElement('span');
  previewSpan.style.cssText = 'font-family:var(--mono);font-size:.58rem;margin-left:auto;' +
    (pool.length ? 'color:var(--muted);' : 'color:var(--red);');
  previewSpan.textContent = pool.length
    ? `📦 \${pool.length} vocab · 🟩 \${_getActiveVocabPool('wordle').length} wordle · 🔗 \${pool.filter(v=>!!v.connections_group).length} conn`
    : '⚠ No vocab selected';
  controls.appendChild(previewSpan);
  wrap.appendChild(controls);

  entries.forEach(([chKey, ch]) => {
    const block = document.createElement('div');
    block.className = 'planner-ch-block';
    const allTopics = Object.keys(ch.topics);
    const selCount  = allTopics.filter(tk => studyPlan.selections.some(s => s.chKey===chKey && s.topicKey===tk)).length;

    const hdr = document.createElement('div');
    hdr.className = 'planner-ch-hdr';
    const allQSel = allTopics.every(tk => studyPlan.selections.some(s=>s.chKey===chKey&&s.topicKey===tk));
    const chHasVocab = vocabBank.some(v=>v.chapter===chKey&&v.type==='vocab'&&v.enabled!==false);
    const vChSel  = studyPlan.vocabSelections.chapters.includes(chKey);
    hdr.innerHTML = `
      <span style="font-size:1.4rem">${ch.icon}</span>
      <div>
        <div style="font-family:var(--disp);font-size:1.1rem;letter-spacing:.04em;color:var(--text)">${esc(ch.label)}: ${esc(ch.name)}</div>
        <div style="font-family:var(--mono);font-size:.6rem;color:var(--muted)" id="planner-ch-sub-${chKey}">${allTopics.length} topic${allTopics.length!==1?'s':''} · ${selCount} Q selected</div>
      </div>
      <div style="display:flex;gap:6px;margin-left:auto;margin-right:8px;">
        <button class="ctrl-btn chip-q-btn${allQSel?' q-active':''}" style="font-size:.6rem;padding:3px 9px;"
          onclick="event.stopPropagation();plannerToggleChapter('${chKey}')">
          ${allQSel?'✓':'+'} All Q
        </button>
        ${chHasVocab ? `<button class="ctrl-btn chip-v-btn${vChSel?' v-active':''}" style="font-size:.6rem;padding:3px 9px;"
          onclick="event.stopPropagation();plannerToggleChapterVocab('${chKey}')">
          ${vChSel?'✓':'+'} All V
        </button>` : ''}
      </div>
      <span class="planner-ch-expand open" id="planner-ch-arrow-${chKey}">▶</span>`;
    block.appendChild(hdr);

    const topicWrap = document.createElement('div');
    topicWrap.className = 'planner-ch-topics';
    topicWrap.id = 'planner-ch-topics-'+chKey;

    // Q cards — one per topic
    Object.entries(ch.topics).forEach(([topicKey, topic]) => {
      const qCount = allQ().filter(q => q.chapter===chKey && q.topic===topicKey && q.enabled!==false && q.enabled!=='0' && q.enabled!==0).length;
      if(!qCount) return;
      const qSel = studyPlan.selections.some(s => s.chKey===chKey && s.topicKey===topicKey);
      const topicResults = studyPlan.results.filter(r=>r.chapter===chKey&&r.topic===topicKey);
      const topicGrade   = _calcGrade(topicResults);
      const qCard = document.createElement('div');
      qCard.className = 'planner-topic-card planner-q-card' + (qSel ? ' q-active' : '');
      qCard.innerHTML = `
        <span class="ptc-icon">${topic.icon}</span>
        <div class="ptc-body">
          <div class="ptc-name">${esc(topic.label)}</div>
          <div class="ptc-count">${qCount} questions</div>
          ${topicGrade ? `<div class="ptc-grade" style="color:${topicGrade.color}">${topicGrade.letter} ${topicGrade.pct}%</div>` : ''}
        </div>`;
      qCard.addEventListener('click', () => {
        const idx = studyPlan.selections.findIndex(s=>s.chKey===chKey&&s.topicKey===topicKey);
        if(idx>=0){ studyPlan.selections.splice(idx,1); qCard.classList.remove('q-active'); }
        else { studyPlan.selections.push({chKey,topicKey}); qCard.classList.add('q-active'); }
        _plannerUpdateChHeader(chKey, ch);
        _plannerHdrStats();
        _spSave();
      });
      topicWrap.appendChild(qCard);
    });

    // V card — ONE per chapter (vocab is not split by topic in selection)
    const chVocabCount = vocabBank.filter(v=>v.chapter===chKey&&v.type==='vocab'&&v.enabled!==false).length;
    if(chVocabCount){
      const vSel = studyPlan.vocabSelections.chapters.includes(chKey);
      const vCard = document.createElement('div');
      vCard.className = 'planner-topic-card planner-v-card' + (vSel ? ' v-active' : '');
      vCard.innerHTML = `
        <span class="ptc-icon">${ch.icon}</span>
        <div class="ptc-body">
          <div class="ptc-name">${esc(ch.label)} Vocab</div>
          <div class="ptc-count">${chVocabCount} words</div>
        </div>`;
      vCard.addEventListener('click', () => {
        const vs = studyPlan.vocabSelections;
        if(vs.chapters.includes(chKey)){
          vs.chapters = vs.chapters.filter(k=>k!==chKey);
          vCard.classList.remove('v-active');
        } else {
          vs.chapters.push(chKey);
          vCard.classList.add('v-active');
        }
        _plannerHdrStats();
        _spSave();
      });
      topicWrap.appendChild(vCard);
    }

    hdr.addEventListener('click', (e) => {
      if(e.target.closest('.planner-topic-card') || e.target.closest('button')) return;
      const arrow = document.getElementById('planner-ch-arrow-'+chKey);
      const tw    = document.getElementById('planner-ch-topics-'+chKey);
      const isOpen = arrow.classList.contains('open');
      tw.style.display = isOpen ? 'none' : '';
      arrow.classList.toggle('open', !isOpen);
    });

    block.appendChild(topicWrap);
    wrap.appendChild(block);
  });

  _plannerHdrStats();
}

function plannerToggleChapter(chKey){
  const ch = CHAPTERS[chKey];
  if(!ch) return;
  const topicKeys = Object.keys(ch.topics).filter(tk =>
    allQ().some(q=>q.chapter===chKey&&q.topic===tk&&q.enabled!==false&&q.enabled!=='0'&&q.enabled!==0)
  );
  const allSel = topicKeys.every(tk => studyPlan.selections.some(s=>s.chKey===chKey&&s.topicKey===tk));
  if(allSel){
    studyPlan.selections = studyPlan.selections.filter(s => s.chKey!==chKey);
  } else {
    topicKeys.forEach(tk => {
      if(!studyPlan.selections.some(s=>s.chKey===chKey&&s.topicKey===tk))
        studyPlan.selections.push({chKey, topicKey:tk});
    });
  }
  _spSave();
  renderPlannerScreen();
}

function plannerToggleChapterVocab(chKey){
  const vs = studyPlan.vocabSelections;
  if(vs.chapters.includes(chKey)){
    vs.chapters = vs.chapters.filter(k=>k!==chKey);
  } else {
    vs.chapters.push(chKey);
  }
  _spSave();
  renderPlannerScreen();
}

function _plannerUpdateChHeader(chKey, ch){
  const allTopics = Object.keys(ch.topics);
  const selCount  = allTopics.filter(tk => studyPlan.selections.some(s=>s.chKey===chKey&&s.topicKey===tk)).length;
  const sub = document.getElementById('planner-ch-sub-'+chKey);
  if(sub) sub.textContent = `${allTopics.length} topic${allTopics.length!==1?'s':''} · ${selCount} Q selected`;
}

function _plannerHdrStats(){
  const el = document.getElementById('planner-hdr-stats');
  if(!el) return;
  const sel = studyPlan.selections;
  if(!sel.length){ el.style.display='none'; return; }
  el.style.display='flex';
  const totalQ = allQ().filter(q=>sel.some(s=>s.chKey===q.chapter&&s.topicKey===q.topic)).length;
  const planResults = studyPlan.results.filter(r=>sel.some(s=>s.chKey===r.chapter&&s.topicKey===r.topic));
  const grade = _calcGrade(planResults);
  el.innerHTML = `
    <span style="color:var(--muted)">${sel.length} topic${sel.length!==1?'s':''} · ${totalQ}q</span>
    ${grade ? `<span style="color:${grade.color};font-weight:700">${grade.letter} ${grade.pct}%</span>` : ''}`;
}

// ── GAME_REGISTRY — single source of truth for all games ──
// Adding a new game: add one entry here. needsQ/needsV control the canPlay
// check in the planner. launch(sel) is called by _dispatchGame().
// special:true gives the card a green border (daily/special games).
const GAME_REGISTRY = [
  { id:'jeopardy',    icon:'🎯', name:'Jeopardy',      needsQ:true,  needsV:false,
    launch: sel => startJeopardyMulti(sel) },
  { id:'practice',    icon:'🔁', name:'Practice',       needsQ:true,  needsV:false,
    launch: sel => startPracticeMulti(sel) },
  { id:'millionaire', icon:'💎', name:'Millionaire',    needsQ:true,  needsV:false,
    launch: sel => startMillionaire(sel && sel[0] ? sel[0].chKey : null) },
  { id:'flashcards',  icon:'📇', name:'Flashcards',     needsQ:false, needsV:true,
    launch: sel => startFlashcards(sel && sel[0] ? sel[0].chKey : null) },
  { id:'crossword',   icon:'✏️', name:'Crossword',      needsQ:false, needsV:true,
    launch: sel => startCrossword(sel && sel[0] ? sel[0].chKey : null) },
  { id:'wordsearch',  icon:'🔍', name:'Word Search',    needsQ:false, needsV:true,
    launch: sel => startWordSearch(sel && sel[0] ? sel[0].chKey : null) },
  { id:'wof',         icon:'🎡', name:'Wheel/Hangman',  needsQ:false, needsV:true,
    launch: sel => startWof(sel && sel[0] ? sel[0].chKey : null) },
  { id:'wordle',      icon:'🟩', name:'Chem Wordle',    needsQ:false, needsV:true,  special:true,
    launch: _sel => startWordle() },
  { id:'connections', icon:'🔗', name:'Connections',    needsQ:false, needsV:true,  special:true,
    launch: _sel => startConnections() },
  { id:'chemformula', icon:'⚗️', name:'Formula Lab',    needsQ:false, needsV:false,
    launch: _sel => startChemFormula('naming') },
  { id:'truefalse',   icon:'⚡', name:'True / False',   needsQ:true,  needsV:false,  special:true,
    launch: sel => (typeof startTrueFalseMulti === 'function')
      ? startTrueFalseMulti(sel)
      : console.warn('[cr-planner] startTrueFalseMulti not loaded') },
];

// ── Games tab ──────────────────────────────────────────────
function renderPlannerGames(){
  const panel = document.getElementById('planner-game-panel');
  const sel = studyPlan.selections;
  const hasSel = sel.length > 0;
  const totalQ   = hasSel ? allQ().filter(q=>sel.some(s=>s.chKey===q.chapter&&s.topicKey===q.topic) && q.type!=='tf').length : 0;
  const totalTF  = hasSel ? allQ().filter(q=>sel.some(s=>s.chKey===q.chapter&&s.topicKey===q.topic) && q.type==='tf' && q.true_false_stmt).length : 0;

  const GAMES = GAME_REGISTRY;

  panel.innerHTML = '';

  if(!hasSel){
    panel.innerHTML = '<div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;padding:20px;text-align:center;">Select topics in the <b>📚 Select Topics</b> tab first.</div>';
    return;
  }

  // Summary line
  const chips = sel.map(s=>{
    const ch=CHAPTERS[s.chKey]; const top=ch?.topics?.[s.topicKey];
    return `<span style="background:rgba(129,140,248,.12);border:1px solid rgba(129,140,248,.3);color:#a5b4fc;
      font-family:var(--mono);font-size:.6rem;padding:2px 8px;border-radius:10px;">${ch?.icon||'⚗'} ${esc(top?.label||ch?.name||s.chKey)}</span>`;
  }).join('');
  const qSummary = `${totalQ} Q${totalTF > 0 ? ` · ${totalTF} T/F` : ''}`;
  const sumDiv = document.createElement('div');
  sumDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;align-items:center;';
  sumDiv.innerHTML = `<span style="font-family:var(--mono);font-size:.65rem;color:var(--muted);">Active topics:</span>${chips}<span style="font-family:var(--mono);font-size:.6rem;color:var(--muted);margin-left:4px;">(${qSummary})</span>`;
  panel.appendChild(sumDiv);

  // Earnings summary
  const totalEarned = Object.values(studyPlan.earnings||{}).reduce((a,b)=>a+b,0);
  if(totalEarned > 0){
    const earn = document.createElement('div');
    earn.style.cssText = 'background:var(--surf);border:1px solid rgba(245,200,66,.25);border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap;';
    earn.innerHTML = `<div style="font-family:var(--mono);font-size:.6rem;color:var(--muted);">💰 TOTAL EARNINGS</div>` +
      Object.entries(studyPlan.earnings||{}).filter(([,v])=>v>0).map(([g,v])=>
        `<div><span style="font-family:var(--disp);font-size:1.2rem;color:var(--gold)">$${v.toLocaleString()}</span><span style="font-family:var(--mono);font-size:.58rem;color:var(--muted);margin-left:4px;">${g}</span></div>`
      ).join('');
    panel.appendChild(earn);
  }

  // Game grid
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;';
  const hasVocab = _getActiveVocabPool().length > 0;
  GAMES.forEach(g => {
    const card = document.createElement('button');
    card.className = 'planner-game-card';
    card.style.border = g.special ? '1.5px solid rgba(74,222,128,.3)' : '';
    const canPlay = (!g.needsQ || (g.id === 'truefalse' ? totalTF > 0 : totalQ > 0)) && (!g.needsV || hasVocab);
    if(!canPlay) card.disabled = true;
    card.innerHTML = `<div class="planner-game-icon">${g.icon}</div>
      <div class="planner-game-name">${g.name}</div>`;
    card.addEventListener('click', () => {
      _spSave(); // save selections before launching
      launchGame(g.id);
    });
    grid.appendChild(card);
  });
  panel.appendChild(grid);
}

// ── Progress tab ───────────────────────────────────────────
function renderPlannerProgress(){
  const panel = document.getElementById('planner-progress-panel');
  panel.innerHTML = '';

  const sel = studyPlan.selections;
  const planResults = sel.length
    ? studyPlan.results.filter(r=>sel.some(s=>s.chKey===r.chapter&&s.topicKey===r.topic))
    : studyPlan.results;

  // ── Grade ring ──
  const grade = _calcGrade(planResults);
  const totalEarned = Object.values(studyPlan.earnings||{}).reduce((a,b)=>a+b,0);
  const totalSeen   = Object.keys(studyPlan.performance||{}).length;

  const gradeSection = document.createElement('div');
  gradeSection.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:24px;';

  if(grade){
    const gradePct = grade.pct;
    gradeSection.innerHTML = `
      <div class="grade-ring" style="--grade-color:${grade.color};--grade-pct:${gradePct*3.6}deg;">
        <div class="grade-ring-inner">
          <div class="grade-letter" style="color:${grade.color}">${grade.letter}</div>
          <div class="grade-pct">${gradePct}%</div>
        </div>
      </div>
      <div style="flex:1;min-width:200px;">
        <div style="font-family:var(--disp);font-size:1.6rem;color:var(--text);margin-bottom:4px;">
          ${gradePct>=90?'Excellent!':gradePct>=80?'Great work!':gradePct>=70?'Getting there!':gradePct>=60?'Keep studying!':'Needs improvement'}
        </div>
        <div style="font-family:var(--mono);font-size:.7rem;color:var(--muted);line-height:1.9;">
          <div>Weighted score: <b style="color:var(--text)">${grade.earned.toFixed(1)} / ${grade.possible.toFixed(1)} pts</b></div>
          <div>Harder questions count more toward your grade.</div>
          <div style="margin-top:6px;">Questions attempted: <b style="color:var(--text)">${new Set(planResults.map(r=>r.qid)).size}</b></div>
          <div>Total unique seen: <b style="color:var(--text)">${totalSeen}</b></div>
          ${totalEarned>0?`<div style="color:var(--gold)">💰 Total earned: <b>$${totalEarned.toLocaleString()}</b></div>`:''}
        </div>
      </div>`;
  } else {
    gradeSection.innerHTML = `<div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;padding:16px;">
      No results yet — play some games to see your grade!</div>`;
  }
  panel.appendChild(gradeSection);

  // ── Per-topic breakdown ──
  if(sel.length){
    const topicDiv = document.createElement('div');
    topicDiv.style.cssText = 'margin-bottom:24px;';
    topicDiv.innerHTML = '<div style="font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:10px;">Topic Breakdown</div>';
    const topicTable = document.createElement('div');
    topicTable.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    sel.forEach(s => {
      const ch  = CHAPTERS[s.chKey];
      const top = ch?.topics?.[s.topicKey];
      if(!top) return;
      const tr = studyPlan.results.filter(r=>r.chapter===s.chKey&&r.topic===s.topicKey);
      const tg = _calcGrade(tr);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;background:var(--surf);border:1px solid var(--border);border-radius:8px;padding:8px 12px;';
      const barPct = tg ? tg.pct : 0;
      row.innerHTML = `
        <div style="font-size:1rem">${top.icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.78rem;color:var(--text);font-weight:600;">${esc(top.label)}</div>
          <div style="height:5px;background:var(--border2);border-radius:3px;margin-top:4px;overflow:hidden;">
            <div style="height:100%;width:${barPct}%;background:${tg?.color||'var(--border2)'};border-radius:3px;transition:width .4s;"></div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          ${tg ? `<div style="font-family:var(--disp);font-size:1.1rem;color:${tg.color}">${tg.letter}</div>
                  <div style="font-family:var(--mono);font-size:.58rem;color:var(--muted)">${tg.pct}% · ${new Set(tr.map(r=>r.qid)).size} q</div>`
               : '<div style="font-family:var(--mono);font-size:.6rem;color:var(--muted)">Not started</div>'}
        </div>`;
      topicTable.appendChild(row);
    });
    topicDiv.appendChild(topicTable);
    panel.appendChild(topicDiv);
  }

  // ── Earnings by game ──
  const earnEntries = Object.entries(studyPlan.earnings||{}).filter(([,v])=>v>0);
  if(earnEntries.length){
    const earnDiv = document.createElement('div');
    earnDiv.style.cssText = 'margin-bottom:24px;';
    earnDiv.innerHTML = '<div style="font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:10px;">Earnings by Game</div>';
    const earnGrid = document.createElement('div');
    earnGrid.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
    earnEntries.sort((a,b)=>b[1]-a[1]).forEach(([game,val])=>{
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--surf);border:1px solid rgba(245,200,66,.2);border-radius:10px;padding:10px 16px;min-width:120px;';
      card.innerHTML = `<div style="font-family:var(--disp);font-size:1.5rem;color:var(--gold);">$${val.toLocaleString()}</div>
        <div style="font-family:var(--mono);font-size:.6rem;color:var(--muted);text-transform:uppercase;">${game}</div>`;
      earnGrid.appendChild(card);
    });
    earnDiv.appendChild(earnGrid);
    panel.appendChild(earnDiv);
  }

  // ── Achievements ──
  const achDiv = document.createElement('div');
  achDiv.style.cssText = 'margin-bottom:24px;';
  achDiv.innerHTML = '<div style="font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:10px;">Achievements</div>';
  const achGrid = document.createElement('div');
  achGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;';
  const earnedIds = new Set(studyPlan.achievements.map(a=>a.id));
  ACHIEVEMENTS.forEach(def => {
    const isEarned = earnedIds.has(def.id);
    const achEntry = studyPlan.achievements.find(a=>a.id===def.id);
    const badge = document.createElement('div');
    badge.className = 'achievement-badge' + (isEarned?' earned':' locked');
    badge.innerHTML = `<div class="ach-icon">${def.icon}</div>
      <div>
        <div class="ach-name">${def.name}</div>
        <div class="ach-desc">${def.desc}</div>
        ${isEarned&&achEntry ? `<div class="ach-date">Earned ${new Date(achEntry.ts).toLocaleDateString()}</div>` : ''}
      </div>`;
    achGrid.appendChild(badge);
  });
  achDiv.appendChild(achGrid);
  panel.appendChild(achDiv);

  // ── Review list ──
  const qMap = new Map();
  planResults.forEach(r => {
    if(!qMap.has(r.qid)) qMap.set(r.qid,[]);
    qMap.get(r.qid).push(r);
  });
  const missed = [];
  qMap.forEach((attempts,qid) => {
    const last = attempts[attempts.length-1];
    const wrongCount = attempts.filter(a=>!a.correct).length;
    if(!last.correct || wrongCount >= 2) missed.push({...last, wrongCount, total:attempts.length});
  });
  missed.sort((a,b)=>b.wrongCount-a.wrongCount);

  if(missed.length){
    const revDiv = document.createElement('div');
    revDiv.innerHTML = `<div style="font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:10px;">Questions to Review (${missed.length})</div>`;
    const list = document.createElement('div');
    list.className = 'spw-miss-list';
    missed.slice(0,20).forEach(m => {
      const row = document.createElement('div');
      row.className = 'spw-miss-item';
      row.innerHTML = `<div class="spw-miss-q">${esc(m.q_text)}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;">
          <span class="spw-miss-badge">✗ ${m.wrongCount}× wrong</span>
          <span class="spw-miss-meta">diff ${m.difficulty||1} · ${esc(m.game||'')}</span>
        </div>`;
      list.appendChild(row);
    });
    if(missed.length>20) list.innerHTML += `<div class="spw-empty">+${missed.length-20} more — keep playing</div>`;
    revDiv.appendChild(list);
    panel.appendChild(revDiv);
  } else if(planResults.length){
    panel.innerHTML += '<div style="color:var(--green);font-family:var(--mono);font-size:.75rem;padding:12px;text-align:center;">✓ All attempted questions answered correctly!</div>';
  }
}

// Save & Clear buttons
document.getElementById('planner-save-btn').addEventListener('click', () => {
  _spSave();
  plannerTab('games');
});
document.getElementById('planner-clear-btn').addEventListener('click', () => {
  if(!confirm('Clear all history, earnings, and achievements? Topic selections are kept.')) return;
  studyPlan.results      = [];
  studyPlan.performance  = {};
  studyPlan.earnings     = {};
  studyPlan.achievements = [];
  _spSave();
  renderPlannerScreen();
  plannerTab('progress');
  setTimeout(()=>plannerTab('topics'),10);
});

// ── Hub widget (compact strip) ─────────────────────────────
function renderStudyPlanWidget(){
  const wrap = document.getElementById('study-plan-widget');
  if(!wrap) return;

  if(!studyPlan.selections.length){
    wrap.innerHTML = `<div style="text-align:center;padding:6px 0;">
      <button onclick="showPlanner()" style="font-size:.7rem;padding:6px 16px;border-radius:8px;
        border:1px solid rgba(129,140,248,.3);background:rgba(129,140,248,.06);color:#818cf8;cursor:pointer;font-family:var(--mono);">
        📋 Set up Study Plan →
      </button></div>`;
    return;
  }

  const sel = studyPlan.selections;
  const planResults = studyPlan.results.filter(r=>sel.some(s=>s.chKey===r.chapter&&s.topicKey===r.topic));
  const grade = _calcGrade(planResults);
  const totalEarned = Object.values(studyPlan.earnings||{}).reduce((a,b)=>a+b,0);
  const attempted = new Set(planResults.map(r=>r.qid)).size;
  const totalQ = allQ().filter(q=>sel.some(s=>s.chKey===q.chapter&&s.topicKey===q.topic)).length;

  const chips = sel.map(s=>{
    const ch=CHAPTERS[s.chKey]; const top=ch?.topics?.[s.topicKey];
    return `<span class="spw-chip">${ch?.icon||'⚗'} ${esc(top?.label||ch?.name||s.chKey)}</span>`;
  }).join('');

  wrap.innerHTML = `
    <div style="width:100%;max-width:860px;">
      <div class="spw-hdr">
        <div class="spw-title">📋 Study Plan</div>
        <button class="spw-edit" onclick="showPlanner('topics')">✎ Edit Topics</button>
        <button class="spw-edit" onclick="showPlanner('progress')" style="margin-left:4px;">📊 Progress</button>
      </div>
      <div class="spw-chips" style="margin-bottom:10px;">${chips}</div>
      <div class="spw-stats-row" style="margin-bottom:10px;">
        <div class="spw-stat-card">
          <div class="spw-stat-val">${totalQ}</div>
          <div class="spw-stat-lbl">In Plan</div>
        </div>
        <div class="spw-stat-card">
          <div class="spw-stat-val">${attempted}</div>
          <div class="spw-stat-lbl">Attempted</div>
        </div>
        ${grade ? `<div class="spw-stat-card">
          <div class="spw-stat-val" style="color:${grade.color}">${grade.letter}</div>
          <div class="spw-stat-lbl">Grade (${grade.pct}%)</div>
        </div>` : ''}
        ${totalEarned>0 ? `<div class="spw-stat-card">
          <div class="spw-stat-val" style="color:var(--gold);font-size:1.2rem;">$${totalEarned.toLocaleString()}</div>
          <div class="spw-stat-lbl">Total Earned</div>
        </div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${['🎯 Jeopardy:jeopardy','🔁 Practice:practice','💎 Millionaire:millionaire',
           '📇 Flashcards:flashcards','✏️ Crossword:crossword','🔍 Word Search:wordsearch',
           '🎡 Wheel/Hangman:wof','🟩 Wordle:wordle','🔗 Connections:connections'].map(s=>{
          const [label,game]=s.split(':');
          return `<button onclick="launchGame('${game}')" style="padding:5px 13px;border-radius:16px;font-size:.65rem;font-family:var(--mono);font-weight:700;cursor:pointer;border:1px solid rgba(129,140,248,.3);background:rgba(129,140,248,.08);color:#a5b4fc;transition:all .15s;"
            onmouseover="this.style.background='rgba(129,140,248,.2)'" onmouseout="this.style.background='rgba(129,140,248,.08)'">${label}</button>`;
        }).join('')}
      </div>
    </div>`;
}


// §LAUNCHER
/* ================================================================
   UNIVERSAL LAUNCHER — now routes to Study Planner games tab
================================================================ */
let launcherGame = 'jeopardy';
let launcherSels = [];

// openLauncher: all game back-buttons call this.
// Routes to the unified Study Planner (games tab).
function openLauncher(defaultGame){
  if(defaultGame) launcherGame = defaultGame;
  showPlanner('games');
}

// launcherSelectGame: kept for any inline calls
function launcherSelectGame(game){ launcherGame = game; }

// Stub: renderLauncherTopics, _launcherToggle, etc. — no longer used
// but kept as no-ops so any cached references don't hard-error
function renderLauncherTopics(){}
function _launcherToggle(){}
function _launcherUpdateSummary(){}
function _launcherSyncGame(){}

// launcherGo: kept as a dispatch point called from old code paths
function launcherGo(){
  const sel = studyPlan.selections;
  if(!sel.length){ showPlanner('topics'); return; }
  activeSelections = sel.map(s=>({chKey:s.chKey, topicKey:s.topicKey}));
  SessionState.active     = true;
  SessionState.selections = [...sel];
  _updateSessionBar();
  _dispatchGame(launcherGame, sel);
}


// §SESSION
/* ================================================================
   SESSION TRACKING & WEIGHTED QUESTION PICKER
   ─────────────────────────────────────────────────────────────────
   studyPlan.performance  (persists in localStorage via _spSave):
     { [qid]: { seen:N, correct:N, wrong:N, lastCorrect:bool, lastTs:ms } }

   SessionState (in-memory, reset each page load):
     { seenThisSession: Set<qid>, results: [{qid,correct,game,ts}] }
================================================================ */

// Extend studyPlan to hold performance data
if(!studyPlan.performance) studyPlan.performance = {};

// In-memory session state (not persisted)
const SessionState = {
  seenThisSession: new Set(),  // qid strings seen since page load
  results: [],                  // [{qid, q_text, cat, chapter, topic, correct, game, ts}]
  active: false,                // true once a game is launched via launcher
  selections: [],               // mirror of launcherSels at launch time
};

/* ── Weighted question picker ────────────────────────────────
   weight(q):
     base = 1
     +2 if never seen in any session
     +3 if last attempt was wrong
     +1 for each wrong attempt (capped at 3)
     -5 if seen this session (strongly de-prioritise repeats)
     floor at 0.1 so even mastered questions can appear
*/
function _qWeight(q){
  const qid = q.id || (q.chapter + '||' + q.cat + '||' + (q.q||'').slice(0,40));
  const perf = studyPlan.performance[qid];
  let w = 1;
  if(!perf){
    w += 2; // never seen
  } else {
    if(!perf.lastCorrect) w += 3;
    w += Math.min(perf.wrong || 0, 3);
    if(perf.lastCorrect && (perf.wrong || 0) === 0) w -= 0.5; // mastered
  }
  if(SessionState.seenThisSession.has(qid)) w -= 5;
  return Math.max(w, 0.1);
}

/* weightedPick(pool) — returns one question from pool using weights */
function weightedPick(pool){
  if(!pool.length) return null;
  const weights = pool.map(_qWeight);
  const total = weights.reduce((a,b) => a+b, 0);
  let r = Math.random() * total;
  for(let i=0; i<pool.length; i++){
    r -= weights[i];
    if(r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/* ── Override spTrackResult to also update performance + achievements ── */
const _origSpTrackResult = spTrackResult;
spTrackResult = function(q, correct, game, earnings){
  _origSpTrackResult(q, correct, game, earnings);
  if(!q) return;
  const qid = q.id || (q.chapter + '||' + q.cat + '||' + (q.q||'').slice(0,40));

  // Update persistent performance
  if(!studyPlan.performance[qid]){
    studyPlan.performance[qid] = { seen:0, correct:0, wrong:0, lastCorrect:false, lastTs:0 };
  }
  const perf = studyPlan.performance[qid];
  perf.seen++;
  perf.lastTs = Date.now();
  perf.lastCorrect = correct;
  if(correct) perf.correct++;
  else perf.wrong++;
  _spSave();

  // Update in-memory session state
  SessionState.seenThisSession.add(qid);
  SessionState.results.push({
    qid, q_text:(q.q||'').slice(0,120),
    cat:q.cat||'', chapter:q.chapter||'', topic:q.topic||'',
    correct, game, ts:Date.now(),
  });

  // Check for newly earned achievements
  _checkAchievements();
  // Refresh session bar stats
  _updateSessionBar();
};

/* ── Session Bar ─────────────────────────────────────────── */
function _updateSessionBar(){
  const bar = document.getElementById('session-bar');
  if(!bar) return;
  if(!SessionState.active || !SessionState.selections.length){
    bar.classList.remove('visible'); return;
  }
  bar.classList.add('visible');

  // Chips
  const chips = SessionState.selections.map(s => {
    const ch = CHAPTERS[s.chKey];
    const top = s.topicKey ? ch?.topics?.[s.topicKey] : null;
    return `<span class="sbar-chip">${ch?.icon||'⚗'} ${esc(top?.label || ch?.name || s.chKey)}</span>`;
  }).join('');
  document.getElementById('sbar-chips').innerHTML = chips;

  // Stats
  const r = SessionState.results;
  if(r.length){
    const ok = r.filter(x=>x.correct).length;
    document.getElementById('sbar-stats').innerHTML =
      `<b>${ok}</b>/${r.length} correct this session`;
  } else {
    document.getElementById('sbar-stats').textContent = '';
  }
}

function _showSessionBar(){ _updateSessionBar(); }
function _hideSessionBar(){
  const bar = document.getElementById('session-bar');
  if(bar) bar.classList.remove('visible');
}

/* ── Session Report Modal ────────────────────────────────── */
function openSessionReport(){
  const r = SessionState.results;
  const body = document.getElementById('srep-body');

  if(!r.length){
    body.innerHTML = '<div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;padding:24px;text-align:center;">No questions answered this session yet.</div>';
    document.getElementById('session-report-overlay').classList.add('open');
    return;
  }

  const total = r.length;
  const ok = r.filter(x=>x.correct).length;
  const pct = Math.round(ok/total*100);
  const pctColor = pct>=80?'var(--green)':pct>=60?'var(--gold)':'var(--red)';

  // Per-question: aggregate
  const qMap = new Map();
  r.forEach(entry => {
    if(!qMap.has(entry.qid)) qMap.set(entry.qid, []);
    qMap.get(entry.qid).push(entry);
  });

  const needsReview = [];
  const mastered = [];
  qMap.forEach((attempts, qid) => {
    const last = attempts[attempts.length-1];
    const wrongCount = attempts.filter(a=>!a.correct).length;
    if(!last.correct || wrongCount > 0) needsReview.push({...last, wrongCount, total:attempts.length});
    else mastered.push({...last, total:attempts.length});
  });
  needsReview.sort((a,b) => b.wrongCount - a.wrongCount);

  // All-time perf for context
  const allPerf = studyPlan.performance;
  const totalSeen = Object.keys(allPerf).length;
  const totalMastered = Object.values(allPerf).filter(p=>p.lastCorrect&&p.wrong===0).length;

  body.innerHTML = `
    <div class="srep-summary">
      <div class="srep-stat">
        <div class="srep-stat-val" style="color:${pctColor}">${pct}%</div>
        <div class="srep-stat-lbl">Session Accuracy</div>
      </div>
      <div class="srep-stat">
        <div class="srep-stat-val" style="color:var(--green)">${ok}</div>
        <div class="srep-stat-lbl">Correct</div>
      </div>
      <div class="srep-stat">
        <div class="srep-stat-val" style="color:var(--red)">${total-ok}</div>
        <div class="srep-stat-lbl">Incorrect</div>
      </div>
      <div class="srep-stat">
        <div class="srep-stat-val">${total}</div>
        <div class="srep-stat-lbl">Questions Answered</div>
      </div>
    </div>
    <div style="font-family:var(--mono);font-size:.65rem;color:var(--muted);margin-bottom:14px;
      padding:8px 12px;background:var(--surf2);border-radius:8px;border:1px solid var(--border);">
      All-time: <b style="color:var(--text)">${totalSeen}</b> unique questions seen ·
      <b style="color:var(--green)">${totalMastered}</b> mastered (correct, 0 wrong) ·
      Questions with past mistakes are shown more often.
    </div>
    ${needsReview.length ? `
    <div class="srep-section">
      <div class="srep-section-hdr">⚠ Needs Review (${needsReview.length})</div>
      ${needsReview.slice(0,20).map(m => {
        const perf = allPerf[m.qid];
        const allWrong = perf?.wrong||0;
        const allSeen = perf?.seen||0;
        return `<div class="srep-q-row no">
          <div class="srep-q-icon">✗</div>
          <div class="srep-q-text">${esc(m.q_text)}</div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
            <div class="srep-q-meta">${m.wrongCount}× wrong this session</div>
            <div class="srep-q-meta" style="color:var(--red)">${allWrong} wrong all-time / ${allSeen} seen</div>
          </div>
        </div>`;
      }).join('')}
      ${needsReview.length>20?`<div style="font-family:var(--mono);font-size:.65rem;color:var(--muted);padding:6px 0;">+${needsReview.length-20} more…</div>`:''}
    </div>` : ''}
    ${mastered.length ? `
    <div class="srep-section">
      <div class="srep-section-hdr">✓ Got Right This Session (${mastered.length})</div>
      ${mastered.slice(0,10).map(m => {
        const perf = allPerf[m.qid];
        return `<div class="srep-q-row ok">
          <div class="srep-q-icon">✓</div>
          <div class="srep-q-text">${esc(m.q_text)}</div>
          <div class="srep-q-meta" style="flex-shrink:0">${perf?.seen||1} seen all-time</div>
        </div>`;
      }).join('')}
      ${mastered.length>10?`<div style="font-family:var(--mono);font-size:.65rem;color:var(--muted);padding:6px 0;">+${mastered.length-10} more</div>`:''}
    </div>` : ''}
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
      <button class="ctrl-btn" onclick="document.getElementById('session-report-overlay').classList.remove('open')" style="font-size:.78rem">Close</button>
      <button class="ctrl-btn" onclick="showPlanner('games');document.getElementById('session-report-overlay').classList.remove('open')" style="background:rgba(129,140,248,.1);border-color:#818cf8;color:#818cf8;font-size:.78rem">⇄ Switch Game</button>
      <button class="ctrl-btn" onclick="_clearSessionPerf()" style="border-color:rgba(239,68,68,.3);color:#f87171;font-size:.78rem">✕ Reset All-time Performance</button>
    </div>`;

  document.getElementById('session-report-overlay').classList.add('open');
}

function _clearSessionPerf(){
  if(!confirm('Reset all performance data? This clears wrong/correct counts for all questions. Topic selections are kept.')) return;
  studyPlan.performance = {};
  _spSave();
  openSessionReport();
}

/* ── launchGame — called by hub game cards ───────────────────
   If study plan has selections → launch directly into that game.
   Otherwise → open the launcher (topic picker) for that game.
─────────────────────────────────────────────────────────────── */
function launchGame(game){
  let sel = studyPlan.selections;

  // Auto-select everything if nothing is selected yet
  if(!sel.length){
    const allQTopics = chEntries().flatMap(([ck,ch]) =>
      Object.keys(ch.topics).filter(tk =>
        allQ().some(q=>q.chapter===ck&&q.topic===tk&&q.enabled!==false&&q.enabled!=='0'&&q.enabled!==0)
      ).map(tk=>({chKey:ck,topicKey:tk}))
    );
    const chaptersWithVocab = chEntries()
      .filter(([ck]) => vocabBank.some(v=>v.chapter===ck&&v.type==='vocab'&&v.enabled!==false))
      .map(([ck])=>ck);

    studyPlan.selections = allQTopics;
    studyPlan.vocabSelections.chapters = chaptersWithVocab;
    if(!studyPlan.vocabSelections.ions) studyPlan.vocabSelections.ions = true;
    _spSave();
    sel = studyPlan.selections;
  }

  // Validate selections still match loaded data
  const valid = sel.filter(s =>
    CHAPTERS[s.chKey] && (s.topicKey === null || CHAPTERS[s.chKey].topics?.[s.topicKey])
  );
  if(!valid.length){
    launcherGame = game;
    showPlanner('topics');
    return;
  }

  launcherGame = game;
  activeSelections = valid.map(s => ({chKey:s.chKey, topicKey:s.topicKey}));

  SessionState.active = true;
  SessionState.selections = [...valid];
  _updateSessionBar();

  _dispatchGame(game, valid);
}

/* ── Shared game dispatch — driven by GAME_REGISTRY ── */
function _dispatchGame(game, sel){
  const entry = GAME_REGISTRY.find(g => g.id === game);
  if(entry){ entry.launch(sel); return; }
  console.warn('[cr-planner] _dispatchGame: unknown game id:', game);
}

/* ── Patch launcherGo to activate session on launch ─────── */
const _origLauncherGo = launcherGo;
// launcherGo patched in LAUNCHER section above


/* ── Hide session bar on hub/admin/planner ───────────────── */
const _origShowScreen = showScreen;
showScreen = function(id){
  _origShowScreen(id);
  const noBar = ['hub-screen','admin-screen','planner-screen',
                 'vlab-screen','vlab-detail-screen'];
  if(noBar.includes(id)){
    _hideSessionBar();
  } else if(SessionState.active){
    _updateSessionBar();
  }
};

// Re-initialise session bar after DOM is fully parsed
// (#session-bar lives after the script tag so we must wait)
document.addEventListener('DOMContentLoaded', () => { _updateSessionBar(); });

