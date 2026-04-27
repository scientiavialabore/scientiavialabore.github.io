/* ================================================================
   cr-games-tf.js — True / False Rapid Fire Game Engine
   ─────────────────────────────────────────────────────────────────
   GAME: TRUE / FALSE RAPID FIRE
     A quickfire game mode — a statement is shown full-screen, the
     player taps TRUE or FALSE before time runs out. Points start
     at 1000 and decay linearly after 1 second, reaching 100 at
     10 seconds. Unanswered at 10s = auto-wrong (0 pts).

   DATA SOURCE:
     Any question where true_false_stmt is non-blank AND is enabled.
     Falls back to the MC question stem (q) with answer inferred
     from the correct option (the statement is "true" as written
     when the correct MC option is true, false otherwise).
     Teacher sets tf_answer = "true" or "tf_answer = "false" in CSV.
     For MC questions without tf_answer, defaults to "true" (the
     statement as written IS the correct answer restated).

   SCORING (per question):
     1000 pts at answer time ≤ 1 s
     Linear decay from 1000 → 100 between 1 s and 10 s
     0 pts if time expires or wrong answer

   DEPENDENCIES:
     cr-data.js    — boardQ, activeSelections, CHAPTERS, esc
     cr-core.js    — showScreen, showHub, SCREENS
     cr-planner.js — studyPlan, spTrackResult, _updateSessionBar

   KEY GLOBALS EXPORTED:
     startTrueFalse(selections?)  — entry point; accepts optional
                                    selections override (used by planner)
     startTrueFalseMulti(sel)     — alias used by GAME_REGISTRY launch()
     tfAnswer(isTrue)             — called by the TRUE / FALSE buttons
================================================================ */

// ── State ──────────────────────────────────────────────────────
let tfState = {
  pool:        [],   // full shuffled question pool for this session
  idx:         0,    // current position in pool
  score:       0,
  correct:     0,
  total:       0,
  streak:      0,
  currentQ:    null, // { stmt, answer:'true'|'false', source:question }
  startTs:     0,    // Date.now() when current question was shown
  timerRaf:    null, // requestAnimationFrame handle
  timerTO:    null, // setTimeout handle for auto-expire
  answered:    false,
};

// ── Pool builder ───────────────────────────────────────────────
/**
 * Build a T/F item list from the active board question pool.
 * Returns an array of { stmt, answer:'true'|'false', source }
 *
 * Uses ONLY questions with a populated true_false_stmt column
 * (type=tf rows, or any type where teacher added true_false_stmt).
 * Questions without true_false_stmt are skipped — no auto-generation
 * from MC options, since those often require calculation context.
 */
function _tfBuildPool(questions){
  const items = [];

  questions.forEach(q => {
    const tfStmt = (q.true_false_stmt || '').trim();
    if(!tfStmt) return; // skip any question without an explicit T/F statement

    const rawAns = (q.tf_answer || 'true').toString().toLowerCase().trim();
    items.push({
      stmt:   tfStmt,
      answer: (rawAns === 'false' || rawAns === '0') ? 'false' : 'true',
      source: q,
    });
  });

  // Shuffle
  for(let i = items.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ── Entry points ───────────────────────────────────────────────
function startTrueFalseMulti(selections){
  if(selections && selections.length) activeSelections = selections;
  startTrueFalse();
}

function startTrueFalse(selections){
  if(selections && selections.length) activeSelections = selections;

  // Use boardQ() if selections active; fall back to all enabled TF questions
  let questions = boardQ();
  if(!questions.length){
    questions = allQ().filter(q => q.enabled !== false && q.true_false_stmt);
  }
  const pool = _tfBuildPool(questions);

  if(!pool.length){
    _tfShowEmpty();
    return;
  }

  tfState = {
    pool,
    idx:      0,
    score:    0,
    correct:  0,
    total:    0,
    streak:   0,
    currentQ: null,
    startTs:  0,
    timerRaf: null,
    timerTO:  null,
    answered: false,
  };

  _updateSessionBar && _updateSessionBar();

  showScreen('tf-screen');
  _tfUpdateScore();
  // Defer one frame so showScreen's DOM changes settle before we write into #tf-body
  requestAnimationFrame(() => _tfShowQuestion());
}

// ── Question display ───────────────────────────────────────────
function _tfShowQuestion(){
  _tfClearTimers();

  if(tfState.idx >= tfState.pool.length){
    _tfShowEnd();
    return;
  }

  tfState.currentQ = tfState.pool[tfState.idx];
  tfState.answered = false;
  tfState.startTs  = Date.now();

  const q        = tfState.currentQ;
  const progress = `${tfState.idx + 1} / ${tfState.pool.length}`;
  const ch       = q.source ? CHAPTERS[q.source.chapter] : null;
  const topicLbl = ch && q.source.topic ? (ch.topics?.[q.source.topic]?.label || '') : '';

  // Render statement card
  const body = document.getElementById('tf-body');
  if(!body){ console.error('[cr-games-tf] #tf-body not found — tf-screen HTML missing from cr-shell.html'); return; }

  body.innerHTML = `
    <div class="tf-meta">
      <span class="tf-progress">${esc(progress)}</span>
      ${topicLbl ? `<span class="tf-topic-lbl">${esc(topicLbl)}</span>` : ''}
      <span class="tf-streak-lbl" id="tf-streak-lbl">${tfState.streak > 1 ? '🔥 ×' + tfState.streak : ''}</span>
    </div>
    <div class="tf-timer-wrap">
      <div class="tf-timer-bar" id="tf-timer-bar"></div>
    </div>
    <div class="tf-pts-badge" id="tf-pts-badge">1000</div>
    <div class="tf-card" id="tf-card">
      <div class="tf-stmt" id="tf-stmt">${esc(q.stmt)}</div>
    </div>
    <div class="tf-btns">
      <button class="tf-btn tf-true"  id="tf-btn-true"  onclick="tfAnswer(true)">✓ TRUE</button>
      <button class="tf-btn tf-false" id="tf-btn-false" onclick="tfAnswer(false)">✗ FALSE</button>
    </div>
    <div class="tf-explanation" id="tf-explanation" style="display:none"></div>
  `;

  // Animate card in
  requestAnimationFrame(() => {
    const card = document.getElementById('tf-card');
    if(card) card.classList.add('tf-card-in');
  });

  // Start timer animation
  _tfStartTimer();
}

// ── Timer ──────────────────────────────────────────────────────
const TF_TOTAL_SECS    = 12;  // total time to answer
const TF_DECAY_START   = 2;   // seconds before decay begins
const TF_MAX_PTS       = 1000;
const TF_MIN_PTS       = 100;

function _tfCalcPoints(elapsedMs){
  const s = elapsedMs / 1000;
  if(s <= TF_DECAY_START) return TF_MAX_PTS;
  if(s >= TF_TOTAL_SECS)  return 0;
  const frac = (s - TF_DECAY_START) / (TF_TOTAL_SECS - TF_DECAY_START);
  return Math.round(TF_MAX_PTS - frac * (TF_MAX_PTS - TF_MIN_PTS));
}

function _tfStartTimer(){
  const barEl   = document.getElementById('tf-timer-bar');
  const ptsEl   = document.getElementById('tf-pts-badge');
  const startTs = tfState.startTs;

  // Auto-expire after TF_TOTAL_SECS
  tfState.timerTO = setTimeout(() => {
    if(!tfState.answered) _tfExpire();
  }, TF_TOTAL_SECS * 1000);

  // rAF loop for smooth bar + pts counter
  function tick(){
    if(tfState.answered) return;
    const elapsed = Date.now() - startTs;
    const ratio   = Math.min(elapsed / (TF_TOTAL_SECS * 1000), 1);
    const pts     = _tfCalcPoints(elapsed);

    if(barEl){
      barEl.style.width = `${(1 - ratio) * 100}%`;
      // Colour shifts: green → gold → red
      if(ratio < 0.4)      barEl.style.background = 'var(--green)';
      else if(ratio < 0.7) barEl.style.background = 'var(--gold)';
      else                 barEl.style.background = 'var(--red)';
    }
    if(ptsEl) ptsEl.textContent = pts > 0 ? pts : '—';

    if(ratio < 1) tfState.timerRaf = requestAnimationFrame(tick);
  }
  tfState.timerRaf = requestAnimationFrame(tick);
}

function _tfClearTimers(){
  if(tfState.timerRaf) cancelAnimationFrame(tfState.timerRaf);
  if(tfState.timerTO)  clearTimeout(tfState.timerTO);
  tfState.timerRaf = null;
  tfState.timerTO  = null;
}

function _tfExpire(){
  tfState.answered = true;
  _tfClearTimers();

  const card    = document.getElementById('tf-card');
  const trueBtn = document.getElementById('tf-btn-true');
  const falseBtn= document.getElementById('tf-btn-false');
  const ptsEl   = document.getElementById('tf-pts-badge');
  const expl    = document.getElementById('tf-explanation');
  const barEl   = document.getElementById('tf-timer-bar');

  if(barEl)  { barEl.style.width = '0'; barEl.style.background = 'var(--red)'; }
  if(ptsEl)  { ptsEl.textContent = '0'; ptsEl.classList.add('tf-pts-zero'); }
  if(card)   { card.classList.add('tf-wrong'); }
  if(trueBtn)  trueBtn.disabled  = true;
  if(falseBtn) falseBtn.disabled = true;

  tfState.streak = 0;

  const q = tfState.currentQ;
  const correctLabel = q.answer === 'true' ? 'TRUE ✓' : 'FALSE ✗';
  _tfShowExplanation(expl, `⏰ Time's up! The answer was ${correctLabel}.`, q);

  spTrackResult(q.source, false, 'truefalse', 0);
  tfState.total++;
  _tfUpdateScore();

  setTimeout(() => {
    tfState.idx++;
    _tfShowQuestion();
  }, 2000);
}

// ── Answer handler ─────────────────────────────────────────────
function tfAnswer(isTrue){
  if(tfState.answered) return;
  tfState.answered = true;
  _tfClearTimers();

  const elapsed  = Date.now() - tfState.startTs;
  const q        = tfState.currentQ;
  const correct  = (isTrue ? 'true' : 'false') === q.answer;
  const pts      = correct ? _tfCalcPoints(elapsed) : 0;

  const card     = document.getElementById('tf-card');
  const trueBtn  = document.getElementById('tf-btn-true');
  const falseBtn = document.getElementById('tf-btn-false');
  const ptsEl    = document.getElementById('tf-pts-badge');
  const expl     = document.getElementById('tf-explanation');
  const barEl    = document.getElementById('tf-timer-bar');

  if(trueBtn)  trueBtn.disabled  = true;
  if(falseBtn) falseBtn.disabled = true;

  // Freeze bar
  if(barEl){
    const ratio = Math.min(elapsed / (TF_TOTAL_SECS * 1000), 1);
    barEl.style.width = `${(1 - ratio) * 100}%`;
    barEl.style.background = correct ? 'var(--green)' : 'var(--red)';
  }

  // Highlight the pressed button
  const pressedBtn = isTrue ? trueBtn : falseBtn;
  if(pressedBtn){
    pressedBtn.classList.add(correct ? 'tf-btn-correct' : 'tf-btn-wrong');
  }
  // Show correct button if they got it wrong
  if(!correct){
    const correctBtn = (q.answer === 'true') ? trueBtn : falseBtn;
    if(correctBtn) correctBtn.classList.add('tf-btn-correct');
  }

  if(card) card.classList.add(correct ? 'tf-correct' : 'tf-wrong');

  // Points badge
  if(ptsEl){
    if(correct){
      ptsEl.textContent = `+${pts}`;
      ptsEl.classList.add('tf-pts-gained');
    } else {
      ptsEl.textContent = '0';
      ptsEl.classList.add('tf-pts-zero');
    }
  }

  // Update state
  if(correct){
    tfState.score  += pts;
    tfState.correct++;
    tfState.streak++;
  } else {
    tfState.streak = 0;
  }
  tfState.total++;

  _tfUpdateScore();
  _tfShowExplanation(expl, null, q);
  spTrackResult(q.source, correct, 'truefalse', pts);

  // Advance
  const delay = correct ? 1200 : 1800;
  setTimeout(() => {
    tfState.idx++;
    _tfShowQuestion();
  }, delay);
}

// ── Explanation helper ─────────────────────────────────────────
function _tfShowExplanation(el, overrideMsg, q){
  if(!el) return;
  const explanation = q.source ? (q.source.explanation || q.source.hint || '') : '';
  const msg = overrideMsg
    || (explanation ? explanation : `The statement is ${q.answer.toUpperCase()}.`);

  el.textContent = msg;
  el.style.display = 'block';
  el.classList.add('tf-expl-in');
}

// ── Score display ──────────────────────────────────────────────
function _tfUpdateScore(){
  const scoreEl  = document.getElementById('tf-score-val');
  const correctEl= document.getElementById('tf-correct-val');
  const totalEl  = document.getElementById('tf-total-val');
  if(scoreEl)   scoreEl.textContent  = tfState.score.toLocaleString();
  if(correctEl) correctEl.textContent= tfState.correct;
  if(totalEl)   totalEl.textContent  = tfState.total;
}

// ── Empty state ────────────────────────────────────────────────
function _tfShowEmpty(){
  showScreen('tf-screen');
  const body = document.getElementById('tf-body');
  if(body) body.innerHTML = `
    <div class="tf-end">
      <div class="tf-end-icon">📭</div>
      <div class="tf-end-title">No Questions Found</div>
      <div class="tf-end-sub">
        No true/false questions available for the selected topics.<br>
        Add a <code>true_false_stmt</code> column to your questions.csv,
        or select topics with multiple-choice questions.
      </div>
      <button class="tf-play-again" onclick="showHub()">← Back to Hub</button>
    </div>`;
}

// ── End screen ─────────────────────────────────────────────────
function _tfShowEnd(){
  const body = document.getElementById('tf-body');
  if(!body) return;

  const pct      = tfState.total ? Math.round((tfState.correct / tfState.total) * 100) : 0;
  const grade    = pct >= 90 ? { letter:'A', color:'var(--green)' }
                 : pct >= 80 ? { letter:'B', color:'#4ade80' }
                 : pct >= 70 ? { letter:'C', color:'var(--gold)' }
                 : pct >= 60 ? { letter:'D', color:'#fb923c' }
                 :             { letter:'F', color:'var(--red)' };

  const emoji    = pct === 100 ? '🏆'
                 : pct >= 80  ? '🎉'
                 : pct >= 60  ? '👍'
                 : '💪';

  body.innerHTML = `
    <div class="tf-end">
      <div class="tf-end-icon">${emoji}</div>
      <div class="tf-end-title">Round Complete!</div>
      <div class="tf-end-score">${tfState.score.toLocaleString()} pts</div>
      <div class="tf-end-stats">
        <div class="tf-end-stat">
          <div class="tf-end-stat-val" style="color:${grade.color}">${grade.letter}</div>
          <div class="tf-end-stat-lbl">Grade</div>
        </div>
        <div class="tf-end-stat">
          <div class="tf-end-stat-val">${tfState.correct}/${tfState.total}</div>
          <div class="tf-end-stat-lbl">Correct</div>
        </div>
        <div class="tf-end-stat">
          <div class="tf-end-stat-val">${pct}%</div>
          <div class="tf-end-stat-lbl">Accuracy</div>
        </div>
      </div>
      <div class="tf-end-btns">
        <button class="tf-play-again" onclick="startTrueFalse()">↺ Play Again</button>
        <button class="tf-back-hub"   onclick="showHub()">← Hub</button>
      </div>
    </div>`;
}
