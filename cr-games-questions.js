/* ================================================================
   cr-games-questions.js — Question-Based Game Engines
   ─────────────────────────────────────────────────────────────────
   GAMES IN THIS FILE:
     §MILLIONAIRE   Who Wants to Be a Millionaire (15-level, 3 lifelines)
     §PRACTICE      Practice Mode (infinite drill, per-topic, with regen)

   GAMES NOT HERE:
     Jeopardy board + modal → cr-jeopardy.js
     Vocab games            → cr-games-vocab.js

   DEPENDENCIES:
     cr-data.js            — CHAPTERS, boardQ, allQ, chEntries,
                             activeSelections, activeChapter, activeTopic,
                             vocabBank, esc
     cr-core.js            — showScreen, showHub, generateVariant
     cr-question-engine.js — QuestionEngine, weightedPick (re-exported
                             by cr-planner.js but available globally after
                             cr-planner.js loads)
     cr-planner.js         — studyPlan, spTrackResult, showPlanner,
                             weightedPick

   KEY GLOBALS EXPORTED:
     openMillionaireSelector()
     startMillionaire(chKey)
     milSelectOpt(idx)
     milLifeline(type)
     milSubmit()
     openPracticeSelector()
     startPractice(chKey, topicKey)
     startPracticeMulti(selections)
     pracNextQuestion()
================================================================ */


// §MILLIONAIRE
/* ================================================================
   MILLIONAIRE ENGINE
================================================================ */

// Prize ladder — 15 levels. Safe havens at $1,000 and $32,000.
const MIL_LADDER = [
  { val:1000000, label:'$1,000,000', safe:false },
  { val:500000,  label:'$500,000',   safe:false },
  { val:250000,  label:'$250,000',   safe:false },
  { val:125000,  label:'$125,000',   safe:false },
  { val:64000,   label:'$64,000',    safe:false },
  { val:32000,   label:'$32,000',    safe:true  },
  { val:16000,   label:'$16,000',    safe:false },
  { val:8000,    label:'$8,000',     safe:false },
  { val:4000,    label:'$4,000',     safe:false },
  { val:2000,    label:'$2,000',     safe:false },
  { val:1000,    label:'$1,000',     safe:true  },
  { val:500,     label:'$500',       safe:false },
  { val:300,     label:'$300',       safe:false },
  { val:200,     label:'$200',       safe:false },
  { val:100,     label:'$100',       safe:false },
];
// Index 0 = top ($1M), index 14 = bottom ($100).
// Current question = MIL_LADDER[milState.level].
// Level starts at 14 (easiest) and decrements toward 0.

/** Return difficulty bands [min, max] for the given level. */
function milDifficultyForLevel(level){
  if(level >= 10) return [1, 2];
  if(level >= 5)  return [2, 3];
  return [4, 5];
}

let milState = {
  chapter: null,
  topic: null,
  level: 14,
  banked: 0,
  lifelines: { fifty:false, phone:false, audience:false },
  currentQ: null,
  shuffledOpts: [],
  selectedOpt: null,
  answered: false,
  eliminated: [],
  friendCheck: null,
};

function openMillionaireSelector(){
  const wrap = document.getElementById('mil-sel-chapters');
  wrap.innerHTML = '';
  const entries = chEntries();
  if(!entries.length){
    wrap.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px">No chapters yet — import questions.csv first.</div>';
    showScreen('mil-sel-screen');
    return;
  }
  entries.forEach(([chKey, ch]) => {
    const qCount = allQ().filter(q => q.chapter===chKey && q.type==='mc').length;
    const chHead = document.createElement('div');
    chHead.className = 'sel-ch-head';
    chHead.innerHTML =
      `<span class="sel-ch-icon">${ch.icon}</span>
      <div><div class="sel-ch-label">${esc(ch.label)}</div><div class="sel-ch-name">${esc(ch.name)}</div></div>`;
    wrap.appendChild(chHead);
    const row = document.createElement('div');
    row.className = 'sel-topics';
    const btn = document.createElement('button');
    btn.className = 'sel-topic-btn' + (qCount===0 ? ' sel-coming' : '');
    btn.style.borderColor = ch.color;
    btn.innerHTML =
      `<div class="sel-topic-icon">${ch.icon}</div>
      <div class="sel-topic-label">${esc(ch.name)}</div>
      <div class="sel-topic-count">${qCount} MC question${qCount!==1?'s':''}</div>`;
    if(qCount > 0) btn.addEventListener('click', () => startMillionaire(chKey));
    row.appendChild(btn);
    wrap.appendChild(row);
  });
  showScreen('mil-sel-screen');
}

function startMillionaire(chKey){
  if(chKey && (!activeSelections.length || activeSelections[0].chKey !== chKey)){
    activeSelections = [{chKey, topicKey: null}];
  }
  milState = {
    chapter: chKey, topic: null,
    level: 14, banked: 0,
    lifelines: { fifty:false, phone:false, audience:false },
    currentQ: null, shuffledOpts: [], selectedOpt: null,
    answered: false, eliminated: [], friendCheck: null,
  };
  showScreen('mil-screen');
  milRenderLadder();
  milLoadQuestion();
}

function milGetPool(level){
  const diffs = milDifficultyForLevel(level);
  const base  = boardQ().filter(q => q.type === 'mc');
  const strict = base.filter(q => diffs.includes(parseInt(q.difficulty) || 1));
  if(strict.length >= 2) return strict;
  const loose = base.filter(q => {
    const d = parseInt(q.difficulty) || 1;
    return d >= Math.max(1, diffs[0]-1) && d <= Math.min(5, diffs[diffs.length-1]+1);
  });
  if(loose.length >= 2) return loose;
  return base; // fallback: any MC question
}

function milLoadQuestion(){
  milState.selectedOpt  = null;
  milState.answered     = false;
  milState.eliminated   = [];
  milState.friendCheck  = null;

  const pool = milGetPool(milState.level);
  if(!pool.length){
    document.getElementById('mil-question-area').innerHTML = `
      <div class="mil-end">
        <div class="mil-end-icon">📭</div>
        <div class="mil-end-title" style="font-size:1.6rem">No Questions Found</div>
        <div class="mil-end-sub">This chapter has no multiple-choice questions loaded yet. Import a questions.csv with type=mc entries for this chapter.</div>
        <div class="mil-end-btns">
          <button class="mil-walkaway" onclick="showHub()">← Hub</button>
        </div>
      </div>`;
    return;
  }

  const tmpl = pool[Math.floor(Math.random() * pool.length)];
  milState.currentQ = { ...tmpl };

  // Shuffle options
  const opts = [...(tmpl.options || [tmpl.option_a, tmpl.option_b, tmpl.option_c, tmpl.option_d].filter(Boolean))];
  for(let i = opts.length-1; i > 0; i--){
    const j = Math.floor(Math.random() * (i+1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  milState.shuffledOpts = opts;

  milRenderQuestion();
  milRenderLadder();
}

function milRenderQuestion(){
  const q       = milState.currentQ;
  const rung    = MIL_LADDER[milState.level];
  const letters = ['A','B','C','D'];

  const html = `
    <div class="mil-level-badge">${rung.label} — Question ${15 - milState.level} of 15</div>
    <div class="mil-q-box">
      <div class="mil-q-text">${q.q}</div>
    </div>
    <div class="mil-options" id="mil-opts">
      ${milState.shuffledOpts.map((opt,i) => {
        const elim   = milState.eliminated.includes(i) ? 'eliminated' : '';
        const fcheck = milState.friendCheck === i ? 'friend-check' : '';
        return `<button class="mil-opt ${elim} ${fcheck}" id="mil-opt-${i}"
          onclick="milSelectOpt(${i})"
          ${elim ? 'disabled' : ''}>
          <span class="mil-opt-letter">${letters[i]}</span>${opt}
        </button>`;
      }).join('')}
    </div>
    <div class="mil-lifelines">
      <button class="mil-ll ${milState.lifelines.fifty  ?'used':''}" id="ll-fifty"
        onclick="milLifeline('fifty')"    ${milState.lifelines.fifty  ?'disabled':''}>50:50</button>
      <button class="mil-ll ${milState.lifelines.phone  ?'used':''}" id="ll-phone"
        onclick="milLifeline('phone')"    ${milState.lifelines.phone  ?'disabled':''}">📞 Phone a Friend</button>
      <button class="mil-ll ${milState.lifelines.audience?'used':''}" id="ll-audience"
        onclick="milLifeline('audience')" ${milState.lifelines.audience?'disabled':''}>👥 Ask the Audience</button>
    </div>
    <div class="mil-feedback" id="mil-feedback"></div>
    <div class="mil-action-row">
      <button class="mil-submit" id="mil-submit" onclick="milSubmit()" disabled>Lock In Answer</button>
      <button class="mil-walkaway" onclick="milShowEnd('walkaway')">Walk Away (${fmt$(milState.banked)})</button>
    </div>`;

  document.getElementById('mil-question-area').innerHTML = html;
}

function milSelectOpt(idx){
  if(milState.answered || milState.eliminated.includes(idx)) return;
  milState.selectedOpt = idx;
  document.querySelectorAll('.mil-opt').forEach((b, i) => {
    b.classList.toggle('selected', i === idx);
  });
  document.getElementById('mil-submit').disabled = false;
}

function milLifeline(type){
  if(milState.lifelines[type] || milState.answered) return;
  milState.lifelines[type] = true;

  const q          = milState.currentQ;
  const correctIdx = milState.shuffledOpts.indexOf(q.answer);
  const wrongIdxs  = milState.shuffledOpts.map((_,i) => i)
    .filter(i => i !== correctIdx && !milState.eliminated.includes(i));

  if(type === 'fifty'){
    const toRemove = wrongIdxs.sort(() => Math.random()-.5).slice(0, 2);
    milState.eliminated = [...milState.eliminated, ...toRemove];
    milShowFeedback('50:50 — two wrong answers removed.', 'warn');

  } else if(type === 'phone'){
    const friendRight = Math.random() < 0.5;
    let friendPick;
    if(friendRight){
      friendPick = correctIdx;
    } else {
      const available = wrongIdxs.filter(i => !milState.eliminated.includes(i));
      friendPick = available.length
        ? available[Math.floor(Math.random() * available.length)]
        : correctIdx;
    }
    milState.friendCheck = friendPick;
    const letters = ['A','B','C','D'];
    milShowFeedback(`📞 Your friend says: "I'm pretty sure it's ${letters[friendPick]}..." (right ~50% of the time)`, 'warn');

  } else if(type === 'audience'){
    const toRemove = wrongIdxs.length
      ? wrongIdxs[Math.floor(Math.random() * wrongIdxs.length)]
      : null;
    if(toRemove !== null){
      milState.eliminated = [...milState.eliminated, toRemove];
      const letters = ['A','B','C','D'];
      milShowFeedback(`👥 The audience points away from ${letters[toRemove]} — they think that one's wrong.`, 'warn');
    }
  }

  milRenderQuestion();
  // Restore selected highlight if still valid after re-render
  if(milState.selectedOpt !== null && !milState.eliminated.includes(milState.selectedOpt)){
    const btn = document.getElementById(`mil-opt-${milState.selectedOpt}`);
    if(btn){ btn.classList.add('selected'); document.getElementById('mil-submit').disabled = false; }
  }
}

function milSubmit(){
  if(milState.answered || milState.selectedOpt === null) return;
  milState.answered = true;

  const q          = milState.currentQ;
  const correctIdx = milState.shuffledOpts.indexOf(q.answer);
  const chosen     = milState.selectedOpt;
  const correct    = chosen === correctIdx;

  spTrackResult(q, correct, 'millionaire', correct ? MIL_LADDER[milState.level].val : 0);

  document.querySelectorAll('.mil-opt').forEach(b => b.disabled = true);
  document.getElementById('mil-submit').disabled = true;
  document.querySelectorAll('.mil-ll').forEach(b => b.disabled = true);

  const chosenBtn  = document.getElementById(`mil-opt-${chosen}`);
  const correctBtn = document.getElementById(`mil-opt-${correctIdx}`);

  if(correct){
    chosenBtn.classList.add('correct');
    const rung = MIL_LADDER[milState.level];
    if(rung.safe) milState.banked = rung.val;
    document.getElementById('mil-banked').textContent = fmt$(milState.banked);

    if(milState.level === 0){
      setTimeout(() => milShowEnd('win'), 1200);
    } else {
      milShowFeedback('✓ Correct!', 'ok');
      setTimeout(() => {
        milState.level--;
        milLoadQuestion();
      }, 1400);
    }
  } else {
    chosenBtn.classList.add('wrong');
    correctBtn.classList.add('correct');
    milShowFeedback(`✗ Wrong! The answer was: ${q.answer}`, 'no');
    setTimeout(() => milShowEnd('wrong'), 1800);
  }
}

function milShowFeedback(msg, cls){
  const el = document.getElementById('mil-feedback');
  if(el){ el.textContent = msg; el.className = `mil-feedback ${cls}`; }
}

/** Format a dollar amount for display. */
function fmt$(n){ return n ? '$' + n.toLocaleString() : '$0'; }

function milRenderLadder(){
  const ladder = document.getElementById('mil-ladder');
  if(!ladder) return;
  ladder.innerHTML = MIL_LADDER.map((rung, i) => {
    let cls = '';
    if(i === milState.level)       cls = 'current';
    else if(i > milState.level)    cls = 'completed';
    else if(rung.safe)             cls = 'safe';
    const safeMarker = rung.safe ? '<span class="mil-safe-marker">⬛ SAFE</span>' : '';
    return `<div class="mil-rung ${cls}">
      <span>${15 - i}</span>
      <span class="mil-rung-val">${rung.label}${safeMarker}</span>
    </div>`;
  }).join('');
}

function milShowEnd(reason){
  let won = 0;
  if(reason === 'win')      won = 1000000;
  else if(reason === 'walkaway') won = milState.banked || 0;
  else                       won = milState.banked; // wrong → fall to safe haven

  const icons  = { win:'🏆', walkaway:'🚶', wrong:'💥' };
  const titles = { win:'YOU WIN!', walkaway:'You Walked Away', wrong:'Wrong Answer!' };
  const subs   = {
    win:      'Incredible! A perfect run through all 15 questions!',
    walkaway: 'You locked in your winnings and walked away safely.',
    wrong:    'You fall back to your last safe haven.',
  };

  document.getElementById('mil-question-area').innerHTML = `
    <div class="mil-end">
      <div class="mil-end-icon">${icons[reason]}</div>
      <div class="mil-end-title">${titles[reason]}</div>
      <div class="mil-end-won">${fmt$(won)}</div>
      <div class="mil-end-sub">${subs[reason]}</div>
      <div class="mil-end-btns">
        <button class="mil-submit" onclick="launcherGame='millionaire';launcherGo()">▶ Play Again</button>
        <button class="mil-walkaway" onclick="showHub()">← Hub</button>
      </div>
    </div>`;
  document.getElementById('mil-ladder').innerHTML = '';
}


// §PRACTICE
/* ================================================================
   PRACTICE MODE ENGINE
   ─────────────────────────────────────────────────────────────────
   Practice uses QuestionEngine (cr-question-engine.js) for all
   question rendering and grading. pracState tracks session counters;
   pracQE is the live engine instance.
================================================================ */

let pracState = {
  chapter:    null,
  topic:      null,
  topicLabel: '',
  questions:  [],
  streak:     0,
  correct:    0,
  total:      0,
};

let pracQE = null; // active QuestionEngine instance

function openPracticeSelector(){
  const wrap = document.getElementById('prac-sel-chapters');
  wrap.innerHTML = '';
  const entries = chEntries();
  if(!entries.length){
    wrap.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px">No chapters yet — import questions.csv in Question Manager.</div>';
    showScreen('prac-sel-screen');
    return;
  }
  entries.forEach(([chKey, ch]) => {
    const chHead = document.createElement('div');
    chHead.className = 'sel-ch-head';
    chHead.innerHTML =
      `<span class="sel-ch-icon">${ch.icon}</span>
      <div><div class="sel-ch-label">${esc(ch.label)}</div><div class="sel-ch-name">${esc(ch.name)}</div></div>`;
    wrap.appendChild(chHead);

    const topicRow = document.createElement('div');
    topicRow.className = 'sel-topics';
    Object.entries(ch.topics).forEach(([topicKey, topic]) => {
      const pool   = allQ().filter(q => q.chapter===chKey && q.topic===topicKey);
      const hasRng = pool.some(q => q.randomizer_type);
      const count  = pool.length;
      if(!count) return;
      const btn = document.createElement('button');
      btn.className = 'sel-topic-btn';
      btn.style.borderColor = ch.color;
      btn.innerHTML =
        `<div class="sel-topic-icon">${topic.icon}</div>
        <div class="sel-topic-label">${esc(topic.label)}</div>
        <div class="sel-topic-count">${count} questions${hasRng ? '<span class="rng-tag">∞ variants</span>' : ''}</div>`;
      btn.addEventListener('click', () => startPractice(chKey, topicKey));
      topicRow.appendChild(btn);
    });
    if(topicRow.children.length) wrap.appendChild(topicRow);
  });
  showScreen('prac-sel-screen');
}

function startPractice(chKey, topicKey){
  activeSelections = [{chKey, topicKey}];
  startPracticeMulti(activeSelections);
}

function startPracticeMulti(selections){
  activeSelections = selections;
  const questions  = boardQ();

  const labelParts = selections.map(s => {
    const ch = CHAPTERS[s.chKey];
    return ch?.topics?.[s.topicKey]?.label || ch?.name || s.chKey;
  });
  const label = labelParts.length <= 2
    ? labelParts.join(' + ')
    : `${labelParts.length} Topics`;

  pracState = {
    chapter:    selections[0]?.chKey,
    topic:      selections[0]?.topicKey,
    topicLabel: label,
    questions,
    streak: 0, correct: 0, total: 0,
  };

  document.getElementById('prac-title').textContent = `🔁 ${label}`;
  document.getElementById('prac-sub').textContent   = `Practice · ${questions.length} questions in pool`;
  showScreen('prac-screen');

  pracQE = new QuestionEngine(questions, {
    game: 'practice',
    onResult: (r) => {
      if(r.correct) pracState.streak++;
      else          pracState.streak = 0;
      pracState.correct += r.correct ? 1 : 0;
      pracState.total++;
      pracUpdateCounters();
    },
  });

  pracNextQuestion();
}

function pracNextQuestion(){
  if(!pracQE) return;
  pracQE.next();
  pracQE.render(document.getElementById('prac-body'), {
    onNext: pracNextQuestion,
    onBack: () => showPlanner('games'),
  });
  pracUpdateCounters();
}

function pracUpdateCounters(){
  const streakEl  = document.getElementById('prac-streak');
  const correctEl = document.getElementById('prac-correct-count');
  const totalEl   = document.getElementById('prac-total-count');
  if(streakEl)  streakEl.textContent  = pracState.streak;
  if(correctEl) correctEl.textContent = pracState.correct;
  if(totalEl)   totalEl.textContent   = pracState.total;
}
