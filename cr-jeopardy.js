/* ================================================================
   cr-jeopardy.js — Jeopardy Board + Modal, wired to QuestionEngine
   ─────────────────────────────────────────────────────────────────
   CONTENTS (in order):
     §LAUNCH     startJeopardyWith / startJeopardyMulti
     §BOARD      buildBoard / renderBoard / renderProg / _makeCellEl
     §MODAL      openQ / openReview / closeModal
     §ENGINE     _openQWithEngine — QuestionEngine-backed modal renderer
     §SELECTOR   openJeopardySelector / renderJeopardySelector
     §CONTROLS   randomizeBoard / resetBoard / checkGameOver

   DEPENDENCIES:
     cr-data.js            — CHAPTERS, boardQ, allQ, chEntries,
                             activeSelections, activeChapter, activeTopic,
                             gameState, esc
     cr-core.js            — showScreen, showHub, renderChapterSelector,
                             generateVariant (§RANDOMIZER)
     cr-question-engine.js — QuestionEngine
     cr-planner.js         — spTrackResult, weightedPick, showPlanner

   GLOBALS EXPORTED:
     startJeopardyWith(chKey, topicKey)
     startJeopardyMulti(selections)
     buildBoard()
     renderBoard()
     randomizeBoard()
     randomizeBoard2()
     resetBoard()
     openQ(key)
     openReview(key)
     closeModal()
     openJeopardySelector()
     renderJeopardySelector()
     checkGameOver()

   LOAD ORDER (cr-shell.html):
     cr-data.js → cr-core.js → cr-admin.js
     → cr-question-engine.js → cr-jeopardy.js
     → cr-games-questions.js → cr-games-vocab.js → cr-planner.js
================================================================ */


// §LAUNCH
/* ================================================================
   LAUNCH ENTRY POINTS
================================================================ */

function startJeopardyWith(chKey, topicKey) {
  activeSelections = [{ chKey, topicKey }];
  const ch    = CHAPTERS[chKey];
  const topic = ch?.topics?.[topicKey];
  document.getElementById('jeop-title').textContent =
    topic ? `${ch.label}: ${topic.label}` : (ch?.label || chKey);
  document.getElementById('jeop-sub').textContent =
    `${ch?.name || chKey} · Jeopardy`;
  showScreen('jeopardy-screen');
  buildBoard();
  renderBoard();
}

function startJeopardyMulti(selections) {
  activeSelections = selections;
  const labels = selections.map(s => {
    const ch  = CHAPTERS[s.chKey];
    const top = ch?.topics?.[s.topicKey];
    return top ? top.label : (ch?.name || s.chKey);
  });
  const shortTitle = labels.length <= 2
    ? labels.join(' + ')
    : `${labels.length} Topics`;
  document.getElementById('jeop-title').textContent = `🎯 ${shortTitle}`;
  document.getElementById('jeop-sub').textContent =
    `${selections.length} topic${selections.length !== 1 ? 's' : ''} · Jeopardy`;
  showScreen('jeopardy-screen');
  buildBoard();
  renderBoard();
}


// §BOARD
/* ================================================================
   BOARD BUILD & RENDER
   gameState is a bare global declared in cr-data.js and assigned here.
================================================================ */

function buildBoard() {
  gameState = { cells: {}, score: 0 };
  const bq  = boardQ();

  let cats = [...new Set(bq.map(q => q.cat).filter(Boolean))];
  if (cats.length > 14) {
    for (let i = cats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cats[i], cats[j]] = [cats[j], cats[i]];
    }
    cats = cats.slice(0, 14);
  }

  cats.forEach(cat => {
    const catQs    = bq.filter(q => q.cat === cat);
    const ptsInCat = [...new Set(catQs.map(q => q.pts))].filter(Boolean);
    ptsInCat.forEach(pts => {
      const pool = catQs.filter(q => q.pts === pts);
      const _wp = (typeof weightedPick === 'function') ? weightedPick : p => p[Math.floor(Math.random()*p.length)];
      const tmpl = _wp(pool) || pool[0];
      const q    = typeof tmpl.generate === 'function'
        ? { ...tmpl, ...tmpl.generate() }
        : { ...tmpl };
      gameState.cells[cat + '||' + pts] = { q, answered: false, correct: null };
    });
  });

  gameState._cats = cats;
}

function renderBoard() {
  const board = document.getElementById('jeop-board');
  board.innerHTML = '';
  document.querySelectorAll('.board-warn').forEach(w => w.remove());

  const cats = gameState._cats || [];

  if (!cats.length || !Object.keys(gameState.cells).length) {
    board.innerHTML =
      '<div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;' +
      'padding:40px;text-align:center;grid-column:1/-1;">' +
      'No questions found for selected topics. Try a different selection or import more questions.</div>';
    board.style.gridTemplateColumns = '1fr';
    return;
  }

  const catPtsMap = {};
  cats.forEach(cat => {
    catPtsMap[cat] = [...new Set(
      Object.keys(gameState.cells)
        .filter(k => k.startsWith(cat + '||'))
        .map(k => parseInt(k.split('||')[1]))
    )].sort((a, b) => a - b);
  });

  const maxPtsPerCat  = Math.max(...cats.map(c => catPtsMap[c].length));
  const allPtsValues  = [...new Set(cats.flatMap(c => catPtsMap[c]))].sort((a, b) => a - b);
  const useFlatLayout = maxPtsPerCat === 1;

  if (useFlatLayout) {
    const sortedCats = [...cats].sort(
      (a, b) => (catPtsMap[a][0] || 0) - (catPtsMap[b][0] || 0)
    );
    const cols = Math.min(sortedCats.length, 7);
    board.style.gridTemplateColumns = `repeat(${cols},1fr)`;

    for (let rowStart = 0; rowStart < sortedCats.length; rowStart += cols) {
      const rowCats = sortedCats.slice(rowStart, rowStart + cols);
      while (rowCats.length < cols) rowCats.push(null);

      // Header row
      rowCats.forEach(cat => {
        const el = document.createElement('div');
        el.className   = 'cat-hdr';
        el.textContent = cat || '';
        board.appendChild(el);
      });

      // Single question tile per cat
      rowCats.forEach(cat => {
        board.appendChild(
          _makeCellEl(cat ? cat + '||' + catPtsMap[cat][0] : null)
        );
      });
    }

  } else {
    const displayCats = cats.slice(0, 7);
    board.style.gridTemplateColumns = `repeat(${displayCats.length},1fr)`;

    displayCats.forEach(cat => {
      const el = document.createElement('div');
      el.className   = 'cat-hdr';
      el.textContent = cat;
      board.appendChild(el);
    });

    allPtsValues.forEach(pts => {
      displayCats.forEach(cat => {
        board.appendChild(_makeCellEl(cat + '||' + pts));
      });
    });
  }

  renderProg();
  document.getElementById('score-val').textContent = '$' + gameState.score.toLocaleString();
}

/** Build a single board cell element for the given key (null → blank tile). */
function _makeCellEl(key) {
  const el = document.createElement('div');
  el.className = 'jeop-cell';

  if (!key) {
    el.className += ' no';
    el.innerHTML  = '<div class="cell-ico" style="opacity:.08">—</div>';
    return el;
  }

  const cell = gameState.cells[key];
  const pts  = key.split('||')[1];

  if (!cell) {
    el.className += ' no';
    el.innerHTML  = '<div class="cell-ico" style="opacity:.18">—</div>';
  } else if (!cell.answered) {
    el.className += ' open';
    el.innerHTML  = `<div class="cell-pts">$${pts}</div>`;
    el.addEventListener('click', () => openQ(key));
  } else {
    el.className += cell.correct ? ' ok' : ' no';
    el.innerHTML  = `<div class="cell-ico">${cell.correct ? '✓' : '✗'}</div>`;
    el.addEventListener('click', () => openReview(key));
  }
  return el;
}

function renderProg() {
  const bar = document.getElementById('prog-bar');
  bar.innerHTML = '';
  Object.values(gameState.cells).forEach(c => {
    const d = document.createElement('div');
    d.className = 'prog-dot' + (c.answered ? (c.correct ? ' ok' : ' no') : '');
    bar.appendChild(d);
  });
}


// §MODAL
/* ================================================================
   MODAL — public entry points
================================================================ */

// Active QuestionEngine for the currently open modal question.
let _jeopQE  = null;
// Key of the currently open cell.
let _jeopKey = null;
// Whether the current open is a review (already-answered) cell.
let _jeopIsReview = false;

function openQ(key) {
  const cell = gameState.cells[key];
  if (!cell || cell.answered) return;
  _openQWithEngine(key, false);
}

function openReview(key) {
  const cell = gameState.cells[key];
  if (!cell) return;
  _openQWithEngine(key, true);
}

function closeModal() {
  document.getElementById('q-modal').classList.remove('open');
  _jeopQE       = null;
  _jeopKey      = null;
  _jeopIsReview = false;
}


// §ENGINE
/* ================================================================
   QuestionEngine integration
   ─────────────────────────────────────────────────────────────────
   The existing #q-modal HTML is reused for its chrome (header,
   footer, backdrop). Body content is owned by QuestionEngine via
   a single injected container div (#jeop-qe-container).

   On first call the legacy static-ID children of .modal-body are
   hidden and the QE container is appended. Subsequent calls just
   clear and re-render into the same container.

   Footer buttons are clone-replaced on every open to prevent
   listener accumulation across repeated openQ() calls.
================================================================ */

function _getQEContainer() {
  let el = document.getElementById('jeop-qe-container');
  if (!el) {
    const modalBody = document.querySelector('#q-modal .modal-body');
    if (!modalBody) return null;

    // Hide legacy static elements — QE renders its own equivalents
    [
      'm-context', 'm-reaction', 'm-datatable',
      'm-visual',  'm-visual-2',
      'm-q',       'm-given',
      'hint-box',  'feedback',
      'mc-opts',   'num-area',
      'sol-box',
    ].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.style.display = 'none';
    });

    el    = document.createElement('div');
    el.id = 'jeop-qe-container';
    modalBody.appendChild(el);
  }
  return el;
}

function _openQWithEngine(key, isReview) {
  const cell = gameState.cells[key];
  const pts  = parseInt(key.split('||')[1]);
  const cat  = key.split('||')[0];

  _jeopKey      = key;
  _jeopIsReview = isReview;

  // ── Modal header ─────────────────────────────────────────────
  document.getElementById('m-cat').textContent = isReview ? `${cat} — Review` : cat;
  document.getElementById('m-pts').textContent = `$${pts}`;

  // ── Build QuestionEngine ─────────────────────────────────────
  _jeopQE = new QuestionEngine([cell.q], {
    game:          'jeopardy',
    sigFigPenalty: true,

    onResult: ({ correct, earnings }) => {
      cell.answered = true;
      cell.correct  = correct;

      if (correct)      gameState.score += pts;
      if (earnings < 0) gameState.score += earnings;   // sig-fig −$100

      document.getElementById('score-val').textContent =
        '$' + gameState.score.toLocaleString();

      renderBoard();
      checkGameOver();

      // Flip footer to post-answer state (newly answered, not review)
      _jeopSetFooter(true, false);
    },
  });

  // Force exactly this question — no pool picking needed
  _jeopQE.next(cell.q);

  // ── Render card into modal body ───────────────────────────────
  const container = _getQEContainer();
  if (!container) return;

  _jeopQE.render(container, {
    showMeta:    true,
    answered:    isReview,
    wasCorrect:  isReview ? !!cell.correct : false,
    submitLabel: 'Lock In Answer',
    // Suppress QE's auto-rerender after grade() — footer manages state here
    onSubmit: () => {},
  });

  // ── Wire footer ───────────────────────────────────────────────
  _jeopSetFooter(isReview, true /* isReview means it was already answered */);

  // ── Open overlay ──────────────────────────────────────────────
  document.getElementById('q-modal').classList.add('open');
}

/**
 * Clone-replace each footer button then attach fresh listeners.
 * Call this once on open and once more after grading fires.
 *
 * @param {boolean} isAnswered   — true if the question is now answered
 * @param {boolean} wasReview    — true if the modal was opened as a review
 *                                 (i.e. cell was already answered before opening)
 */
function _jeopSetFooter(isAnswered, wasReview) {
  function fresh(id) {
    const old = document.getElementById(id);
    if (!old) return null;
    const neo = old.cloneNode(true);
    old.parentNode.replaceChild(neo, old);
    return neo;
  }

  const hint   = fresh('btn-hint');
  const submit = fresh('btn-submit');
  const sol    = fresh('btn-sol');
  const regen  = fresh('btn-regen');
  const close  = fresh('btn-close');

  if (close) close.addEventListener('click', closeModal);

  if (!isAnswered) {
    // ── Unanswered ─────────────────────────────────────────────
    if (hint)   { hint.style.display   = ''; }
    if (submit) { submit.style.display = ''; submit.disabled = false; }
    if (sol)    { sol.style.display    = 'none'; }
    if (regen)  { regen.style.display  = 'none'; }

    if (hint) {
      hint.addEventListener('click', () => _jeopQE?.showHint());
    }
    if (submit) {
      submit.addEventListener('click', () => {
        if (!_jeopQE || _jeopQE.answered) return;
        _jeopQE.grade();
        // onResult callback fires synchronously inside grade() and calls
        // _jeopSetFooter(true, false) to flip to the answered state.
      });
    }

  } else {
    // ── Answered / review ──────────────────────────────────────
    if (hint)   { hint.style.display   = 'none'; }
    if (submit) { submit.style.display = 'none'; }
    if (sol)    { sol.style.display    = ''; }
    if (regen) {
      regen.style.display =
        (_jeopQE?.currentQ?.randomizer_type || _jeopQE?.template?.randomizer_type) ? '' : 'none';
    }

    if (sol) {
      if (wasReview) {
        // Opened as review — solution is already shown by QE render(); hide button
        sol.style.display = 'none';
      } else {
        // Just answered — solution button reveals on click
        sol.addEventListener('click', () => {
          _jeopQE?.showSolution();
          sol.style.display = 'none';
        });
      }
    }

    if (regen && (_jeopQE?.currentQ?.randomizer_type || _jeopQE?.template?.randomizer_type)) {
      regen.addEventListener('click', () => {
        const key  = _jeopKey;
        const cell = key ? gameState.cells[key] : null;
        if (!cell) return;
        const newQ = generateVariant(_jeopQE.template || _jeopQE.currentQ);
        if (!newQ) return;
        cell.q        = newQ;
        cell.answered = false;
        cell.correct  = null;
        renderBoard();
        _openQWithEngine(key, false);
      });
    }
  }
}

// One-time: backdrop click-to-close and ✕ button
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('q-modal');
  if (overlay) overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });
  const xBtn = document.getElementById('modal-x-btn');
  if (xBtn) xBtn.addEventListener('click', closeModal);
});


// §SELECTOR
/* ================================================================
   JEOPARDY SELECTOR
   Fully defined here, overwriting the stub in cr-core.js.
================================================================ */

function openJeopardySelector() {
  renderJeopardySelector();
  showScreen('selector-screen');
}

function renderJeopardySelector() {
  const wrap = document.getElementById('sel-chapters');
  if (!wrap) return;
  wrap.innerHTML = '';
  const entries = chEntries();
  if (!entries.length) {
    wrap.innerHTML =
      '<div style="color:var(--muted);text-align:center;padding:40px">' +
      'No chapters yet — import questions.csv in Question Manager.</div>';
    return;
  }
  entries.forEach(([chKey, ch]) => {
    const chHead = document.createElement('div');
    chHead.className = 'sel-ch-head';
    chHead.innerHTML =
      `<span class="sel-ch-icon">${ch.icon}</span>` +
      `<div><div class="sel-ch-label">${esc(ch.label)}</div>` +
      `<div class="sel-ch-name">${esc(ch.name)}</div></div>`;
    wrap.appendChild(chHead);

    const topicRow = document.createElement('div');
    topicRow.className = 'sel-topics';
    Object.entries(ch.topics).forEach(([topicKey, topic]) => {
      const count = allQ().filter(
        q => q.chapter === chKey && q.topic === topicKey
      ).length;
      const btn = document.createElement('button');
      btn.className      = 'sel-topic-btn' + (count === 0 ? ' sel-coming' : '');
      btn.style.borderColor = ch.color;
      btn.innerHTML =
        `<div class="sel-topic-icon">${topic.icon}</div>` +
        `<div class="sel-topic-label">${esc(topic.label)}</div>` +
        `<div class="sel-topic-count">${count} question${count !== 1 ? 's' : ''}</div>`;
      if (count > 0) btn.addEventListener('click', () => startJeopardyWith(chKey, topicKey));
      topicRow.appendChild(btn);
    });
    wrap.appendChild(topicRow);
  });
}


// §CONTROLS
/* ================================================================
   BOARD CONTROLS & GAME-OVER
================================================================ */

function randomizeBoard() { buildBoard(); renderBoard(); }

function randomizeBoard2() {
  document.getElementById('board-wrap').innerHTML =
    '<div class="jeop-board" id="jeop-board"></div>';
  randomizeBoard();
}

function resetBoard() {
  Object.values(gameState.cells).forEach(c => {
    c.answered = false;
    c.correct  = null;
  });
  gameState.score = 0;
  const bw = document.getElementById('board-wrap');
  if (!bw.querySelector('#jeop-board')) {
    bw.innerHTML = '<div class="jeop-board" id="jeop-board"></div>';
  }
  renderBoard();
}

function checkGameOver() {
  if (!Object.values(gameState.cells).every(c => c.answered)) return;
  setTimeout(() => {
    const cells = Object.values(gameState.cells);
    const ok    = cells.filter(c => c.correct).length;
    const tot   = cells.length;
    const pct   = Math.round(ok / tot * 100);
    const grade =
      pct === 100 ? '🏆 Perfect!'
      : pct >= 80  ? 'Excellent!'
      : pct >= 60  ? 'Good Work!'
      :               'Keep Studying!';
    document.getElementById('board-wrap').innerHTML = `
      <div class="end-wrap">
        <div class="end-title">${grade}</div>
        <div class="end-score">Final Score: $${gameState.score.toLocaleString()}</div>
        <div class="end-stats">
          <div class="end-stat">
            <div class="end-val g">${ok}</div>
            <div class="end-lbl">Correct</div>
          </div>
          <div class="end-stat">
            <div class="end-val r">${tot - ok}</div>
            <div class="end-lbl">Incorrect</div>
          </div>
          <div class="end-stat">
            <div class="end-val" style="color:var(--gold)">${pct}%</div>
            <div class="end-lbl">Accuracy</div>
          </div>
        </div>
        <div class="end-btns">
          <button class="e-btn e-pri" onclick="randomizeBoard2()">🔀 New Game</button>
          <button class="e-btn e-sec" onclick="showHub()">← Hub</button>
        </div>
      </div>`;
  }, 700);
}
