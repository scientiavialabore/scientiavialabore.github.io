/* ================================================================
   cr-question-engine.js — Universal Question Engine
   ─────────────────────────────────────────────────────────────────
   Implements §TODO_QUESTION_ENGINE from cr-todo.md.

   CONTENTS:
     §ENGINE     QuestionEngine class
     §RENDER     renderQuestionCard(q, containerEl, options)
                 — shared card DOM builder used by all games
     §SIGFIG     Sig-fig helpers (moved from cr-core.js, kept in sync)

   DEPENDENCIES:
     cr-data.js    — CHAPTERS, allQ, boardQ, weightedPick (from cr-planner)
     cr-core.js    — generateVariant, renderQuestionVisual, _renderDataTable
     cr-planner.js — spTrackResult, weightedPick

   LOAD ORDER (in HTML shell):
     cr-data.js → cr-core.js → cr-admin.js → cr-question-engine.js
     → cr-games-questions.js → cr-games-vocab.js → cr-planner.js

   ── API ──────────────────────────────────────────────────────────
   const qe = new QuestionEngine(pool, options);

   Options:
     game        {string}   — 'jeopardy' | 'practice' | 'millionaire'
                             Used for spTrackResult and sig-fig behaviour.
     sigFigPenalty {bool}   — If true, sig-fig error costs pts (Jeopardy).
                             Default: false (Practice / Millionaire just warn).
     onResult    {fn}       — Callback fired after each grade:
                               onResult({ q, correct, sigFigWarning, earnings })

   Methods:
     qe.next()              → question object (weighted pick + variant)
     qe.render(containerEl) → builds question card DOM into containerEl,
                               returns { submitFn, hintFn, solutionFn }
     qe.grade(answer)       → { correct, sigFigWarning, feedback }
                               answer = string (selected MC option OR numeric string)
     qe.showHint()          → reveals hint text in last rendered card
     qe.showSolution()      → reveals solution steps in last rendered card
     qe.regen()             → replaces currentQ with a new variant of the
                               same template, re-renders into same container

   State (read-only):
     qe.currentQ            — the live question object
     qe.template            — the original template (for regen)
     qe.answered            — true once grade() has been called for this q
     qe.selMC               — currently selected MC option string

   ── Games become thin wrappers ───────────────────────────────────
     Jeopardy  → qe.render() inside existing modal shell (#q-modal)
     Millionaire → replace milRenderQuestion / milSubmit
     Practice  → replace pracRender / pracSubmit
     Speed Round (future) → wrap qe.render() with a countdown timer
     True/False (future)  → restrict pool to MC, show only 2 options
================================================================ */

// §SIGFIG
/* ================================================================
   SIG-FIG HELPERS
   Kept here so the engine is self-contained. cr-core.js calls
   these too — they are safe to re-declare because JS function
   declarations are hoisted and the values are identical.
   (If you prefer, delete from cr-core.js and rely on this file.)
================================================================ */

/**
 * Count the number of significant figures in a numeric string.
 * Returns null if the string is not a valid number.
 */
function qeCountSigFigs(str) {
  str = String(str).trim().replace(/^-/, '');
  if (!str || isNaN(parseFloat(str))) return null;
  if (str.includes('.')) {
    return str.replace('.', '').replace(/^0+/, '').length || 1;
  }
  // No decimal — strip leading and trailing zeros
  return str.replace(/^0+/, '').replace(/0+$/, '').length || 1;
}


// §ENGINE
/* ================================================================
   QuestionEngine CLASS
================================================================ */

class QuestionEngine {
  /**
   * @param {Array}  pool     — Array of question objects from boardQ() / allQ()
   * @param {Object} options  — { game, sigFigPenalty, onResult }
   */
  constructor(pool, options = {}) {
    // Filter out type=tf — those only belong in cr-games-tf.js
    this.pool        = pool.filter(q => q.type !== 'tf'); // full question pool
    this.game        = options.game || 'practice';
    this.sigFigPenalty = !!options.sigFigPenalty; // Jeopardy deducts pts
    this.onResult    = options.onResult || null;  // callback

    // Per-question state — reset by next() / regen()
    this.currentQ    = null;
    this.template    = null;
    this.answered    = false;
    this.selMC       = null;
    this._lastCorrect = false;

    // Internal refs to live DOM elements (set by render())
    this._container   = null;
    this._hintEl      = null;
    this._feedbackEl  = null;
    this._solEl       = null;
    this._mcEl        = null;
    this._numInputEl  = null;
    this._shuffledOpts = [];
  }

  // ── next() ──────────────────────────────────────────────────
  /**
   * Pick the next question from the pool using weighted sampling,
   * apply the randomizer/variant if available, and return the
   * live question object. Also sets this.currentQ and this.template.
   *
   * @param {Object|null} forcedTemplate  — skip picking, use this template
   * @returns {Object} question object
   */
  next(forcedTemplate = null) {
    const pick = (typeof weightedPick === 'function') ? weightedPick : (pool => { console.warn('[cr-question-engine] weightedPick not available — using randPick fallback'); return pool[Math.floor(Math.random() * pool.length)]; });
    const tmpl = forcedTemplate || pick(this.pool) || this.pool[Math.floor(Math.random() * this.pool.length)];
    const q    = generateVariant(tmpl) || { ...tmpl };
    this.template     = tmpl;
    this.currentQ     = q;
    this.answered     = false;
    this.selMC        = null;
    this._lastCorrect = false;
    return q;
  }

  // ── regen() ─────────────────────────────────────────────────
  /**
   * Generate a new variant from the current template and re-render
   * into the same container. No-op if no template or no randomizer.
   */
  regen() {
    if (!this.template) return;
    const q = generateVariant(this.template) || { ...this.template };
    this.currentQ     = q;
    this.answered     = false;
    this.selMC        = null;
    this._lastCorrect = false;
    if (this._container) this.render(this._container, this._renderOptions);
  }

  // ── render() ─────────────────────────────────────────────────
  /**
   * Build the question card DOM into containerEl.
   * Clears the container first, then appends the card.
   *
   * @param {HTMLElement} containerEl
   * @param {Object}      renderOptions
   *   {
   *     showMeta    {bool}   — show cat/pts badges (default true)
   *     showRegen   {bool}   — show regen button after answer (default: auto)
   *     onSubmit    {fn}     — called after grade() fires (in addition to onResult)
   *     onNext      {fn}     — called when "Next Question" button is clicked
   *     onBack      {fn}     — called when "← Topics" / back button is clicked
   *     backLabel   {string} — label for back button (default '← Topics')
   *     submitLabel {string} — label for submit button (default 'Submit Answer')
   *     nextLabel   {string} — label for next button (default '→ Next Question')
   *     answered    {bool}   — render in already-answered state (review mode)
   *     wasCorrect  {bool}   — used with answered:true for review colouring
   *   }
   */
  render(containerEl, renderOptions = {}) {
    this._container     = containerEl;
    this._renderOptions = renderOptions;

    const q           = this.currentQ;
    const answered    = renderOptions.answered ?? this.answered;
    const wasCorrect  = renderOptions.wasCorrect ?? this._lastCorrect;
    const showMeta    = renderOptions.showMeta  !== false;
    const backLabel   = renderOptions.backLabel   || '← Topics';
    const submitLabel = renderOptions.submitLabel || 'Submit Answer';
    const nextLabel   = renderOptions.nextLabel   || '→ Next Question';

    containerEl.innerHTML = '';

    // ── Hint box ──────────────────────────────────────────────
    const hintEl = document.createElement('div');
    hintEl.className = 'prac-hint-box' + (this._hintShown ? ' show' : '');
    if (q.hint) hintEl.textContent = '💡 ' + q.hint;
    this._hintEl = hintEl;
    containerEl.appendChild(hintEl);

    // ── Card shell ────────────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'prac-card';
    if (answered) card.classList.add(wasCorrect ? 'answered-ok' : 'answered-no');

    // ── Meta badges ───────────────────────────────────────────
    if (showMeta) {
      const meta = document.createElement('div');
      meta.className = 'prac-meta';
      meta.innerHTML =
        `<span class="prac-cat-badge">${esc(q.cat || '')}</span>` +
        `<span class="prac-pts-badge">$${q.pts}</span>` +
        (q._is_generated  ? '<span class="prac-rng-badge">⚙ generated</span>' : '') +
        (q.randomizer_type ? `<span class="prac-rng-badge">🔁 ${q.randomizer_type}</span>` : '');
      card.appendChild(meta);
    }

    // ── Visual ────────────────────────────────────────────────
    if (q.visual_type) {
      const vizWrap = document.createElement('div');
      vizWrap.style.cssText =
        'background:var(--surf2);border:1px solid var(--border2);border-radius:10px;' +
        'padding:10px;margin-bottom:12px;display:flex;flex-direction:column;align-items:center;gap:4px;';
      const tmpCanvas = document.createElement('canvas');
      const tmpCap    = document.createElement('div');
      tmpCap.style.cssText = 'font-family:var(--mono);font-size:.62rem;color:var(--muted);';
      vizWrap.appendChild(tmpCanvas);
      vizWrap.appendChild(tmpCap);
      card.appendChild(vizWrap);
      // renderQuestionVisual expects the canvas as the target element
      setTimeout(() => renderQuestionVisual(q, tmpCanvas, tmpCap), 0);
    }

    // ── Context paragraph ─────────────────────────────────────
    if (q.context_paragraph) {
      const ctx = document.createElement('div');
      ctx.className = 'prac-context';
      ctx.textContent = q.context_paragraph;
      card.appendChild(ctx);
    }

    // ── Reaction equation ─────────────────────────────────────
    if (q.reaction_equation) {
      const rxn = document.createElement('div');
      rxn.className = 'prac-reaction';
      rxn.textContent = q.reaction_equation;
      card.appendChild(rxn);
    }

    // ── Data table ────────────────────────────────────────────
    if (q.data_table) {
      const dt = document.createElement('div');
      dt.className = 'm-datatable';
      dt.innerHTML = _renderDataTable(q.data_table);
      card.appendChild(dt);
    }

    // ── Given values ──────────────────────────────────────────
    if ((q.given && Object.keys(q.given).length) || (q.given_keys && q.given_vals_display)) {
      let givenData = q.given || {};
      if (q.given_keys && q.given_vals_display) {
        const keys = q.given_keys.split('|');
        const vals = q.given_vals_display.split('|');
        givenData = {};
        keys.forEach((k, i) => { givenData[k] = vals[i] || ''; });
      }
      const givenEl = document.createElement('div');
      givenEl.className = 'prac-given';
      let inner = '<div class="prac-given-lbl">Given</div>';
      Object.entries(givenData).forEach(([k, v]) => {
        inner += `<span style="color:var(--muted)">${k}:</span> <span style="color:var(--cyan)">${v}</span><br>`;
      });
      givenEl.innerHTML = inner;
      card.appendChild(givenEl);
    }

    // ── Question text ─────────────────────────────────────────
    const qEl = document.createElement('div');
    qEl.className = 'prac-q';
    qEl.textContent = q.q || '';
    card.appendChild(qEl);

    // ── Feedback ──────────────────────────────────────────────
    const fbEl = document.createElement('div');
    fbEl.className = 'prac-feedback';
    this._feedbackEl = fbEl;
    card.appendChild(fbEl);

    // ── Answer area ───────────────────────────────────────────
    if (q.type === 'mc') {
      const mcEl = document.createElement('div');
      mcEl.className = 'prac-mc';
      this._mcEl = mcEl;

      const rawOpts = q.options || [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
      // Shuffle once per question; preserve order when re-rendering answered state
      if (!answered) {
        this._shuffledOpts = [...rawOpts].sort(() => Math.random() - 0.5);
      } else if (!this._shuffledOpts.length) {
        this._shuffledOpts = rawOpts;
      }
      const letters = ['A', 'B', 'C', 'D', 'E'];

      this._shuffledOpts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'prac-opt';
        btn.dataset.opt = opt;
        btn.innerHTML = `<span class="prac-opt-letter">${letters[i]}</span>${esc(opt)}`;

        if (answered) {
          btn.disabled = true;
          if (opt === q.answer) btn.classList.add('ok');
          else if (opt === this.selMC && opt !== q.answer) btn.classList.add('no');
        } else {
          if (opt === this.selMC) btn.classList.add('sel');
          btn.addEventListener('click', () => {
            if (this.answered) return;
            this.selMC = opt;
            mcEl.querySelectorAll('.prac-opt').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
          });
        }
        mcEl.appendChild(btn);
      });
      card.appendChild(mcEl);

    } else {
      // Numeric
      const numEl = document.createElement('div');
      numEl.className = 'prac-num';
      numEl.innerHTML = `<div class="prac-num-lbl">Your Answer${q.unit ? ' (' + q.unit + ')' : ''}</div>`;
      const inp = document.createElement('input');
      inp.className  = 'prac-num-input';
      inp.type       = 'text';
      inp.inputMode  = 'decimal';
      inp.placeholder = 'Enter a number…';
      if (answered) {
        inp.disabled   = true;
        inp.className += ' ' + (wasCorrect ? 'ok' : 'no');
      }
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') this.grade(); });
      numEl.appendChild(inp);
      this._numInputEl = inp;
      card.appendChild(numEl);
    }

    // ── Solution box ──────────────────────────────────────────
    const solEl = document.createElement('div');
    solEl.className = 'prac-sol';
    this._solEl = solEl;
    if (answered) this._buildSolution(solEl, q);
    card.appendChild(solEl);

    containerEl.appendChild(card);

    // ── Action buttons ────────────────────────────────────────
    const actRow = document.createElement('div');
    actRow.className = 'prac-actions';

    if (!answered) {
      // Hint button
      if (q.hint) {
        const btnHint = document.createElement('button');
        btnHint.className = 'prac-btn prac-btn-hint';
        btnHint.textContent = '💡 Hint';
        btnHint.addEventListener('click', () => this.showHint());
        actRow.appendChild(btnHint);
      }

      // Submit button
      const btnSubmit = document.createElement('button');
      btnSubmit.className  = 'prac-btn prac-btn-submit';
      btnSubmit.textContent = submitLabel;
      btnSubmit.addEventListener('click', () => {
        const result = this.grade();
        if (result && renderOptions.onSubmit) renderOptions.onSubmit(result);
      });
      actRow.appendChild(btnSubmit);

    } else {
      // Next button
      if (renderOptions.onNext) {
        const btnNext = document.createElement('button');
        btnNext.className   = 'prac-btn prac-btn-next';
        btnNext.textContent = nextLabel;
        btnNext.addEventListener('click', () => renderOptions.onNext());
        actRow.appendChild(btnNext);
      }

      // Solution button (if not already shown)
      if (!solEl.classList.contains('show')) {
        const btnSol = document.createElement('button');
        btnSol.className   = 'prac-btn prac-btn-sol';
        btnSol.textContent = '📖 Solution';
        btnSol.addEventListener('click', () => {
          this.showSolution();
          btnSol.style.display = 'none';
        });
        actRow.appendChild(btnSol);
      }

      // Regen button
      const hasRegen = this.template?.randomizer_type || this.currentQ?.randomizer_type;
      const showRegen = renderOptions.showRegen !== undefined ? renderOptions.showRegen : !!hasRegen;
      if (showRegen) {
        const btnRegen = document.createElement('button');
        btnRegen.className   = 'prac-btn prac-btn-regen';
        btnRegen.textContent = '🔁 New Variant';
        btnRegen.addEventListener('click', () => this.regen());
        actRow.appendChild(btnRegen);
      }
    }

    // Back / Topics button (always shown)
    if (renderOptions.onBack) {
      const btnBack = document.createElement('button');
      btnBack.className  = 'prac-btn';
      btnBack.style.cssText = 'background:transparent;border-color:var(--border2);color:var(--muted);margin-left:auto;';
      btnBack.textContent = backLabel;
      btnBack.addEventListener('click', () => renderOptions.onBack());
      actRow.appendChild(btnBack);
    }

    containerEl.appendChild(actRow);

    // ── Regen info line ───────────────────────────────────────
    if (this.template?.randomizer_type) {
      const info = document.createElement('div');
      info.className   = 'prac-regen-info';
      info.textContent = `⚙ This question type has infinite variants. Randomizer: ${this.template.randomizer_type}`;
      containerEl.appendChild(info);
    }
  }

  // ── grade() ──────────────────────────────────────────────────
  /**
   * Grade the current question using the answer already set on this.selMC
   * (for MC) or read from this._numInputEl (for numeric).
   *
   * For MC callers that already know the answer (e.g. Millionaire which
   * manages its own option buttons), pass the answer string directly.
   *
   * @param {string|null} answerOverride — optional: grade this instead of
   *                                       reading from DOM. For MC: the
   *                                       option string. For numeric: the
   *                                       raw input string.
   * @returns {{ correct, sigFigWarning, sigFigDetails, feedback, earnings }}
   *          or null if validation fails (no answer selected / non-numeric).
   */
  grade(answerOverride = null) {
    if (this.answered) return null;
    const q = this.currentQ;
    let ok = false;
    let sigFigWarning = false;
    let sigFigDetails = null;
    let earnings = 0;

    if (q.type === 'mc') {
      const chosen = answerOverride ?? this.selMC;
      if (!chosen) {
        this._setFeedback('warn', 'Select an answer first.');
        setTimeout(() => { if (this._feedbackEl) this._feedbackEl.className = 'prac-feedback'; }, 1800);
        return null;
      }
      this.selMC = chosen;
      ok = (chosen === q.answer);

      // Mark MC buttons
      if (this._mcEl) {
        this._mcEl.querySelectorAll('.prac-opt').forEach(b => {
          b.disabled = true;
          const opt = b.dataset.opt;
          if (opt === q.answer)                       b.classList.add('ok');
          else if (opt === chosen && !ok)             b.classList.add('no');
          else                                        b.classList.remove('sel');
        });
      }

    } else {
      // Numeric
      const rawInput = answerOverride ?? this._numInputEl?.value ?? '';
      const val = parseFloat(rawInput);
      if (isNaN(val)) {
        if (this._numInputEl) this._numInputEl.style.borderColor = 'var(--gold)';
        return null;
      }
      const correctVal = (q.answer_raw !== undefined && q.answer_raw !== '')
        ? parseFloat(q.answer_raw)
        : parseFloat(q.answer);
      const displayVal  = q.answer_display || String(q.answer);
      const tol         = parseFloat(q.tolerance) || 0.5;
      ok = Math.abs(val - correctVal) <= tol;

      if (this._numInputEl) {
        this._numInputEl.disabled   = true;
        this._numInputEl.className  = 'prac-num-input ' + (ok ? 'ok' : 'no');
      }

      // Sig-fig check
      if (ok && q.answer_sig_figs) {
        const expectedSF = parseInt(q.answer_sig_figs);
        const userSF     = qeCountSigFigs(String(rawInput));
        if (userSF !== null && userSF !== expectedSF) {
          sigFigWarning = true;
          sigFigDetails = { userSF, expectedSF, rawInput, displayVal };
          if (this.sigFigPenalty) {
            // Jeopardy mode: still correct but penalise $100, handled by caller
            earnings = -100;
          }
        }
      }
    }

    this.answered      = true;
    this._lastCorrect  = ok;

    // Build feedback text
    const feedbackText = ok
      ? (sigFigWarning
          ? `✓ Correct value — but sig figs off (${sigFigDetails.userSF} given, ${sigFigDetails.expectedSF} expected).`
          : '✓ Correct!')
      : `✗ Incorrect. ${q.type === 'mc' ? 'The answer was: ' + q.answer : 'Expected: ' + (q.answer_display || q.answer) + (q.unit ? ' ' + q.unit : '')}`;
    this._setFeedback(ok ? (sigFigWarning ? 'warn' : 'ok') : 'no', feedbackText);

    // Show solution automatically on wrong
    if (!ok) this.showSolution();

    // Fire spTrackResult (from cr-planner.js)
    spTrackResult(q, ok, this.game, earnings);

    const result = { q, correct: ok, sigFigWarning, sigFigDetails, earnings, feedback: feedbackText };
    if (this.onResult) this.onResult(result);

    // Trigger sig-fig overlay if Jeopardy penalty mode
    if (sigFigWarning && this.sigFigPenalty && sigFigDetails) {
      setTimeout(() => {
        const msg = document.getElementById('sf-msg');
        const ov  = document.getElementById('sf-overlay');
        if (msg && ov) {
          msg.textContent =
            `You entered ${sigFigDetails.userSF} significant figure${sigFigDetails.userSF !== 1 ? 's' : ''}, ` +
            `but the answer requires ${sigFigDetails.expectedSF}.\n\n` +
            `Your answer: ${sigFigDetails.rawInput}\n` +
            `Expected: ${sigFigDetails.displayVal} (${sigFigDetails.expectedSF} sig fig${sigFigDetails.expectedSF !== 1 ? 's' : ''})\n\n` +
            `This costs $100.`;
          ov.classList.add('open');
        }
      }, 400);
    }

    // Re-render card shell to show answered state (solution, next button etc.)
    if (this._renderOptions?.onSubmit) {
      // Caller wants to control re-render (e.g. Millionaire manages its own UI)
    } else {
      this.render(this._container, { ...this._renderOptions, answered: true, wasCorrect: ok });
      // Restore feedback (render() clears it)
      this._setFeedback(ok ? (sigFigWarning ? 'warn' : 'ok') : 'no', feedbackText);
    }

    return result;
  }

  // ── showHint() ───────────────────────────────────────────────
  showHint() {
    this._hintShown = true;
    if (this._hintEl) {
      this._hintEl.className = 'prac-hint-box show';
    }
  }

  // ── showSolution() ───────────────────────────────────────────
  showSolution() {
    if (!this._solEl || !this.currentQ) return;
    this._buildSolution(this._solEl, this.currentQ);
  }

  // ── Internal helpers ─────────────────────────────────────────

  _setFeedback(cls, text) {
    if (!this._feedbackEl) return;
    this._feedbackEl.className  = 'prac-feedback ' + cls;
    this._feedbackEl.textContent = text;
  }

  _buildSolution(solEl, q) {
    const steps = [];
    if (Array.isArray(q.solution) && q.solution.length) {
      steps.push(...q.solution);
    } else {
      ['sol_1', 'sol_2', 'sol_3', 'sol_4'].forEach(k => { if (q[k]) steps.push(q[k]); });
    }
    if (!steps.length) return;
    solEl.className = 'prac-sol show';
    solEl.innerHTML =
      '<div class="prac-sol-hdr">Solution</div>' +
      steps.map((s, i) =>
        `<div style="display:flex;gap:7px;margin-bottom:5px">` +
        `<span style="font-family:var(--mono);font-size:.6rem;color:var(--cyan);background:rgba(6,182,212,.12);` +
        `border:1px solid rgba(6,182,212,.25);border-radius:3px;padding:1px 5px;flex-shrink:0;margin-top:2px">${i + 1}</span>` +
        `<span>${s}</span></div>`
      ).join('');
  }
}


/* ================================================================
   CONVENIENCE FACTORY
   ─────────────────────────────────────────────────────────────────
   createQuestionEngine(pool, options) is a thin factory so callers
   don't need `new` syntax if they prefer a functional style.
================================================================ */
function createQuestionEngine(pool, options) {
  return new QuestionEngine(pool, options);
}


/* ================================================================
   HOW TO MIGRATE EACH GAME
   ─────────────────────────────────────────────────────────────────

   ── PRACTICE (cr-games-questions.js) ────────────────────────────

   Replace pracRender / pracSubmit / pracNextQuestion / pracRegenCurrent
   with a single QuestionEngine instance:

     let pracQE = null;

     function startPracticeMulti(selections) {
       activeSelections = selections;
       const questions  = boardQ();
       const label      = buildLabel(selections);          // existing code
       pracState        = { ...defaults, questions, topicLabel: label };
       pracQE           = new QuestionEngine(questions, {
         game:     'practice',
         onResult: (r) => {
           if(r.correct) pracState.streak++;
           else pracState.streak = 0;
           pracState.correct += r.correct ? 1 : 0;
           pracState.total++;
           pracUpdateCounters();
         }
       });
       document.getElementById('prac-title').textContent = `🔁 ${label}`;
       showScreen('prac-screen');
       pracQENext();
     }

     function pracQENext() {
       pracQE.next();
       pracQE.render(document.getElementById('prac-body'), {
         onNext: pracQENext,
         onBack: () => showPlanner('games'),
       });
     }

     // pracNextQuestion, pracRender, pracSubmit, pracRegenCurrent → DELETE


   ── JEOPARDY (cr-core.js) ────────────────────────────────────────

   Jeopardy uses a modal (#q-modal) rather than an inline card.
   The engine's render() can target the modal body container
   (#m-body or a dedicated container inside the modal).

   // In openQ(key):
     const cell  = gameState.cells[key];
     const pool  = [cell.q];
     const jeopQE = new QuestionEngine(pool, {
       game: 'jeopardy',
       sigFigPenalty: true,
       onResult: ({ correct, earnings }) => {
         const pts = parseInt(key.split('||')[1]);
         cell.answered = true;
         cell.correct  = correct;
         gameState.score += correct ? pts : 0;
         if(earnings < 0) gameState.score += earnings; // sig-fig penalty
         document.getElementById('score-val').textContent = '$'+gameState.score.toLocaleString();
         renderBoard();
         checkGameOver();
       }
     });
     jeopQE.next(cell.q);          // forced template — no new pick
     jeopQE.render(modalBodyEl, {
       answered:   false,
       showMeta:   true,
       backLabel:  '✕ Close',
       onBack:     closeModal,
       submitLabel:'Lock In Answer',
     });
     currentJeopQE = jeopQE;       // keep ref so closeModal can call it

   The existing modal HTML and CSS stay untouched — only
   the DOM builder (renderModal) is replaced by qe.render().


   ── MILLIONAIRE (cr-games-questions.js) ─────────────────────────

   Millionaire manages its own option buttons and lifelines, so
   it uses a lighter integration:

     let milQE = null;

     function milLoadQuestion() {
       const pool = milGetPool(milState.level);
       milQE = new QuestionEngine(pool, {
         game: 'millionaire',
         onResult: ({ correct }) => {
           spTrackResult(milState.currentQ, correct, 'millionaire',
             correct ? MIL_LADDER[milState.level].val : 0);
           if(correct) { ...advance level... }
           else { ...show end screen... }
         }
       });
       milQE.next();
       milState.currentQ    = milQE.currentQ;
       milState.shuffledOpts = milQE._shuffledOpts; // engine shuffled them
       milRenderQuestion();   // keeps its own UI, calls milQE.grade() on submit
     }

     function milSubmit() {
       const result = milQE.grade(milState.shuffledOpts[milState.selectedOpt]);
       // The engine fires onResult; milSubmit just handles the UI response.
     }

================================================================ */
