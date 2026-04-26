/* ================================================================
   cr-vocab-engine.js — Unified Vocab Pool Manager
   ─────────────────────────────────────────────────────────────────
   PURPOSE
     Single source of truth for which vocab entries are "active"
     for the current student session. All vocab games call
     getVocabPool() instead of touching vocabBank directly.

     Also owns the "Vocab Sources" UI section rendered inside the
     Planner's Topics tab, and patches cr-games-vocab.js entry
     points to respect the selection.

   WHAT THIS REPLACES
     • The ad-hoc studyPlan.selections → firstChKey pass-through
       in _dispatchGame() for vocab games.
     • getWordlePool(mode) — still callable but now delegates here.
     • The manual studyPlan.selections filter in _connBuildPuzzle().

   CONTENTS
     §STATE        vocabPlan — persisted vocab selection state
     §POOL         getVocabPool() — the one accessor all games use
     §PLANNER_UI   renderVocabSourcesSection() — Topics tab section
     §WORDLE_MODE  Available Wordle modes derived from loaded data
     §PATCHES      Monkey-patches startWordle/_wdlPickWord/_connBuildPuzzle

   DEPENDENCIES (load after these)
     cr-data.js    — vocabBank, CHAPTERS, chEntries, allVocab, esc
     cr-planner.js — studyPlan, _spSave (called at end of load order
                     BUT vocabPlan is its own localStorage key so
                     this file is safe to load before cr-planner.js)

   LOAD ORDER in cr-shell.html:
     cr-data.js → cr-core.js → cr-admin.js → cr-question-engine.js
     → cr-jeopardy.js → cr-vocab-engine.js
     → cr-games-questions.js → cr-games-vocab.js → cr-planner.js

   KEY GLOBALS EXPORTED
     getVocabPool(filter?)     — primary pool accessor for all games
     vocabPlan                 — the persisted selection object
     renderVocabSourcesSection(containerEl)  — called by planner
     getAvailableWordleModes() — returns array of usable mode ids
================================================================ */


// §STATE
/* ================================================================
   VOCAB PLAN — persisted selection state
   ─────────────────────────────────────────────────────────────────
   Stored in localStorage as 'chemq_vocab_plan' (separate key from
   studyPlan so it survives a studyPlan clear).

   Shape:
   {
     chapters:  ['ch0','ch1', ...],  // chKeys whose vocab rows to include
     types:     ['vocab','ion','element'],  // which type values to include
   }

   'vocab' type   — standard chapter vocab rows
   'ion' type     — ion name rows (may be in same CSV or separate)
   'element' type — element name rows

   Default: all chapters selected, all types selected.
   If the vocabBank has no ions or elements, the toggles for those
   types are simply hidden — no dead UI.
================================================================ */

let vocabPlan = {
  chapters: [],        // [] means "all available chapters"
  types:    ['vocab'], // start with just vocab; extended when data exists
};

try {
  const saved = JSON.parse(localStorage.getItem('chemq_vocab_plan') || 'null');
  if(saved && typeof saved === 'object'){
    if(Array.isArray(saved.chapters)) vocabPlan.chapters = saved.chapters;
    if(Array.isArray(saved.types))    vocabPlan.types    = saved.types;
  }
} catch(e){}

function _saveVocabPlan(){
  try { localStorage.setItem('chemq_vocab_plan', JSON.stringify(vocabPlan)); } catch(e){}
}

/** Auto-extend type selections when new data is loaded */
function _syncVocabPlanTypes(){
  const hasIons  = vocabBank.some(v => v.type === 'ion'     && v.enabled !== false);
  const hasElems = vocabBank.some(v => v.type === 'element' && v.enabled !== false);
  if(hasIons  && !vocabPlan.types.includes('ion'))     vocabPlan.types.push('ion');
  if(hasElems && !vocabPlan.types.includes('element')) vocabPlan.types.push('element');
}


// §POOL
/* ================================================================
   getVocabPool(filter?) — primary accessor for all vocab games
   ─────────────────────────────────────────────────────────────────
   Returns vocabBank entries matching the current vocabPlan.

   filter values:
     'wordle'      — strips multiword + non-wordle_eligible entries
     'connections' — strips entries without connections_group
     'crossword'   — strips multiword and non-alpha words
     undefined     — return all matching entries

   vocabPlan.chapters = [] means "all available chapters" (default
   state for new users). Once a student explicitly deselects a
   chapter the array will be non-empty and act as a whitelist.

   If the pool comes back empty, the caller should show an
   appropriate empty-state UI rather than crashing.
================================================================ */
function getVocabPool(filter){
  _syncVocabPlanTypes();

  const allChapters = chEntries().map(([k]) => k);
  // Empty array = all chapters selected (default)
  const activeChapters = vocabPlan.chapters.length
    ? vocabPlan.chapters
    : allChapters;
  const activeTypes = vocabPlan.types.length
    ? vocabPlan.types
    : ['vocab'];

  let pool = vocabBank.filter(v => {
    if(v.enabled === false) return false;
    if(!activeTypes.includes(v.type || 'vocab')) return false;
    // ions and elements: include if their type is selected
    // (they live in chapters too but students think of them globally)
    if(v.type === 'ion' || v.type === 'element'){
      return activeTypes.includes(v.type);
    }
    // vocab type: filter by chapter
    return activeChapters.includes(v.chapter);
  });

  if(filter === 'wordle'){
    pool = pool.filter(v =>
      v.wordle_eligible !== false &&
      !v.is_multiword &&
      // Require at least 4 alphabetic characters for Wordle grid
      (v.word || '').replace(/[^A-Za-z]/g, '').length >= 4
    );
  }

  if(filter === 'connections'){
    pool = pool.filter(v => v.connections_group && v.connections_group.trim() !== '');
  }

  if(filter === 'crossword'){
    pool = pool.filter(v =>
      !v.is_multiword &&
      /^[A-Z]+$/.test((v.word || '').trim())
    );
  }

  return pool;
}

/**
 * getVocabForChapter(chKey) — single-chapter accessor used by
 * Crossword, Flashcards, WOF, Word Search. Respects the type
 * filter but ignores the chapter whitelist (the game already
 * knows which chapter it wants).
 */
function getVocabForChapter(chKey, filter){
  _syncVocabPlanTypes();
  const activeTypes = vocabPlan.types.length ? vocabPlan.types : ['vocab'];
  let pool = vocabBank.filter(v =>
    v.enabled !== false &&
    v.chapter === chKey &&
    activeTypes.includes(v.type || 'vocab')
  );
  if(filter === 'crossword'){
    pool = pool.filter(v => !v.is_multiword && /^[A-Z]+$/.test((v.word||'').trim()));
  }
  return pool;
}


// §WORDLE_MODE
/* ================================================================
   AVAILABLE WORDLE MODES
   ─────────────────────────────────────────────────────────────────
   Only advertise modes that actually have eligible words.
   This prevents dead buttons when a teacher hasn't loaded ions.
================================================================ */
function getAvailableWordleModes(){
  _syncVocabPlanTypes();
  const modes = [];

  const hasVocab = vocabBank.some(v =>
    v.enabled !== false && (v.type === 'vocab' || !v.type) &&
    v.wordle_eligible !== false && !v.is_multiword &&
    (v.word||'').replace(/[^A-Za-z]/g,'').length >= 4
  );
  const hasIons = vocabBank.some(v =>
    v.enabled !== false && v.type === 'ion' &&
    v.wordle_eligible !== false && !v.is_multiword
  );
  const hasElements = vocabBank.some(v =>
    v.enabled !== false && v.type === 'element' &&
    v.wordle_eligible !== false && !v.is_multiword
  );

  if(hasVocab)    modes.push({ id:'vocab',    label:'📖 Vocab',    color:'#34d399' });
  if(hasIons)     modes.push({ id:'ions',     label:'⚗ Ions',      color:'#06b6d4' });
  if(hasElements) modes.push({ id:'elements', label:'🧪 Elements', color:'#a855f7' });

  return modes;
}


// §PLANNER_UI
/* ================================================================
   VOCAB SOURCES SECTION — rendered inside Planner Topics tab
   ─────────────────────────────────────────────────────────────────
   Call renderVocabSourcesSection(containerEl) from the end of
   renderPlannerScreen() in cr-planner.js:

     const vocabWrap = document.createElement('div');
     vocabWrap.id = 'planner-vocab-section';
     wrap.appendChild(vocabWrap);
     renderVocabSourcesSection(vocabWrap);

   The section re-renders itself on each toggle.
================================================================ */
function renderVocabSourcesSection(containerEl){
  if(!containerEl) return;
  containerEl.innerHTML = '';

  _syncVocabPlanTypes();

  const allChapters   = chEntries().map(([k]) => k);
  const chaptersWithV = chEntries().filter(([chKey]) =>
    vocabBank.some(v => v.chapter === chKey && v.enabled !== false)
  );
  const hasIons  = vocabBank.some(v => v.type === 'ion'     && v.enabled !== false);
  const hasElems = vocabBank.some(v => v.type === 'element' && v.enabled !== false);

  // Nothing loaded at all — don't render
  if(!chaptersWithV.length && !hasIons && !hasElems) return;

  // ── Section header ──────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.style.cssText =
    'margin:28px 0 12px;padding-top:20px;border-top:1px solid var(--border);' +
    'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
  hdr.innerHTML =
    '<span style="font-family:var(--mono);font-size:.6rem;text-transform:uppercase;' +
    'letter-spacing:.1em;color:var(--cyan);">🗂 Vocab Game Sources</span>' +
    '<span style="font-family:var(--mono);font-size:.55rem;color:var(--muted);">' +
    'Wordle · Connections · Crossword · Flashcards · Word Search · WOF</span>';
  containerEl.appendChild(hdr);

  // ── Chapter chips ────────────────────────────────────────────
  if(chaptersWithV.length){
    const chapLabel = document.createElement('div');
    chapLabel.style.cssText =
      'font-family:var(--mono);font-size:.58rem;color:var(--muted);margin-bottom:8px;';
    chapLabel.textContent = 'Chapters:';
    containerEl.appendChild(chapLabel);

    const chipRow = document.createElement('div');
    chipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;';

    // Empty chapters array = all selected
    const isAllMode = vocabPlan.chapters.length === 0;
    const allBtn = document.createElement('button');
    allBtn.className = 'ctrl-btn';
    allBtn.style.cssText =
      'font-size:.6rem;padding:3px 11px;border-radius:12px;transition:all .15s;' +
      (isAllMode
        ? 'border-color:#818cf8;color:#818cf8;background:rgba(129,140,248,.12);'
        : 'border-color:var(--border2);color:var(--muted);');
    allBtn.textContent = isAllMode ? '✓ All chapters' : '+ All chapters';
    allBtn.addEventListener('click', () => {
      // Toggle: if anything is deselected go to all, otherwise clear to explicit none
      vocabPlan.chapters = [];
      _saveVocabPlan();
      renderVocabSourcesSection(containerEl);
    });
    chipRow.appendChild(allBtn);

    chaptersWithV.forEach(([chKey, ch]) => {
      const isOn = isAllMode || vocabPlan.chapters.includes(chKey);
      const vCount = vocabBank.filter(
        v => v.chapter === chKey && v.enabled !== false
      ).length;
      const btn = document.createElement('button');
      btn.className = 'ctrl-btn';
      btn.style.cssText =
        'font-size:.6rem;padding:3px 11px;border-radius:12px;transition:all .15s;' +
        (isOn
          ? `border-color:${ch.color};color:${ch.color};background:${ch.color}22;`
          : 'border-color:var(--border2);color:var(--muted);');
      btn.innerHTML =
        `${isOn ? '✓ ' : ''}${ch.icon} ${esc(ch.label)} ` +
        `<span style="opacity:.6;">(${vCount})</span>`;
      btn.addEventListener('click', () => {
        // Switching from "all" mode to explicit selection
        if(isAllMode){
          // Start explicit: all on except this one
          vocabPlan.chapters = chaptersWithV
            .map(([k]) => k)
            .filter(k => k !== chKey);
        } else if(isOn){
          vocabPlan.chapters = vocabPlan.chapters.filter(k => k !== chKey);
        } else {
          vocabPlan.chapters.push(chKey);
          // If all are now on, revert to "all" mode for cleanliness
          if(chaptersWithV.every(([k]) => vocabPlan.chapters.includes(k))){
            vocabPlan.chapters = [];
          }
        }
        _saveVocabPlan();
        renderVocabSourcesSection(containerEl);
      });
      chipRow.appendChild(btn);
    });
    containerEl.appendChild(chipRow);
  }

  // ── Type toggles (only if ions/elements exist) ───────────────
  if(hasIons || hasElems){
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;';

    [
      hasIons  && { key:'ion',     label:'⚗ Ions',     color:'#06b6d4' },
      hasElems && { key:'element', label:'🧪 Elements', color:'#a855f7' },
    ].filter(Boolean).forEach(({ key, label, color }) => {
      const isOn  = vocabPlan.types.includes(key);
      const count = vocabBank.filter(v => v.type === key && v.enabled !== false).length;
      const btn   = document.createElement('button');
      btn.className = 'ctrl-btn';
      btn.style.cssText =
        'font-size:.65rem;padding:4px 14px;border-radius:14px;transition:all .15s;' +
        (isOn
          ? `border-color:${color};color:${color};background:${color}22;`
          : 'border-color:var(--border2);color:var(--muted);');
      btn.innerHTML =
        `${isOn ? '✓ ' : ''}${label} <span style="opacity:.65">(${count})</span>`;
      btn.addEventListener('click', () => {
        if(isOn){
          vocabPlan.types = vocabPlan.types.filter(t => t !== key);
        } else {
          vocabPlan.types.push(key);
        }
        _saveVocabPlan();
        renderVocabSourcesSection(containerEl);
      });
      typeRow.appendChild(btn);
    });
    containerEl.appendChild(typeRow);
  }

  // ── Live pool preview ─────────────────────────────────────────
  const total   = getVocabPool().length;
  const wordle  = getVocabPool('wordle').length;
  const conn    = getVocabPool('connections').length;
  const preview = document.createElement('div');
  preview.style.cssText =
    'font-family:var(--mono);font-size:.6rem;border-radius:8px;padding:8px 12px;' +
    'display:flex;gap:14px;flex-wrap:wrap;align-items:center;' +
    (total === 0
      ? 'background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);color:var(--red);'
      : 'background:var(--surf2);border:1px solid var(--border);color:var(--muted);');
  if(total === 0){
    preview.textContent = '⚠ No vocab sources selected — vocab games need at least one chapter or type.';
  } else {
    const wdlModes = getAvailableWordleModes();
    preview.innerHTML =
      `<span style="color:var(--cyan)">📦 ${total} entries</span>` +
      `<span>🟩 ${wordle} Wordle-ready</span>` +
      (conn > 0 ? `<span>🔗 ${conn} Connections-grouped</span>` : '') +
      (wdlModes.length > 0
        ? `<span>Wordle modes: ${wdlModes.map(m=>m.label).join(', ')}</span>`
        : '');
  }
  containerEl.appendChild(preview);
}


// §PATCHES
/* ================================================================
   PATCHES — applied after cr-games-vocab.js loads
   ─────────────────────────────────────────────────────────────────
   We wait for DOMContentLoaded so cr-games-vocab.js has run first
   and the functions exist. Then we replace the three key functions.
================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  // ── Patch startWordle ─────────────────────────────────────────
  // Override the cr-games-vocab.js version with one that uses
  // getAvailableWordleModes() and hides dead mode buttons.
  if(typeof startWordle === 'function'){
    const _origStartWordle = startWordle;
    startWordle = function(){
      showScreen('wordle-screen');
      _updateWordleModeButtons();
      const modes    = getAvailableWordleModes();
      const preferred = modes.find(m => m.id === 'ions') || modes[0];
      if(preferred){
        _wdlSetModeUI(preferred.id);
      }
      wdlNewGame();
    };
  }

  // ── Patch _wdlPickWord ────────────────────────────────────────
  // Replace with version that uses getVocabPool('wordle') for
  // 'vocab' mode and falls back to full vocabBank for ions/elements.
  if(typeof _wdlPickWord !== 'undefined' || true){ // always patch
    window._wdlPickWord = function(mode){
      let pool;

      if(mode === 'ions'){
        pool = vocabBank
          .filter(v =>
            v.enabled !== false && v.type === 'ion' &&
            v.wordle_eligible !== false && !v.is_multiword
          )
          .map(v => ({
            word:        v.word,
            displayWord: v.word.toLowerCase(),
            clue:        v.definition,
            meta: {
              type:            'ion',
              formula:         v.formula        || '',
              charge:          v.charge_display || String(v.charge || ''),
              category:        v.category       || '',
              mnemonic:        v.mnemonic        || '',
              commonCompounds: v.common_compounds || '',
            },
          }));

      } else if(mode === 'elements'){
        pool = vocabBank
          .filter(v =>
            v.enabled !== false && v.type === 'element' &&
            v.wordle_eligible !== false && !v.is_multiword
          )
          .map(v => ({
            word:        v.word,
            displayWord: v.word.toLowerCase(),
            clue:        v.definition,
            meta: {
              type:            'element',
              formula:         v.symbol        || '',
              charge:          v.common_charge || '',
              category:        v.family        || '',
              mnemonic:        '',
              commonCompounds: '',
            },
          }));

      } else {
        // 'vocab' mode — respect the student's chapter selection
        pool = getVocabPool('wordle').map(v => ({
          word:        v.word,
          displayWord: v.word.toLowerCase(),
          clue:        v.definition,
          meta: {
            type:            v.type || 'vocab',
            formula:         '',
            charge:          '',
            category:        v.topic_label || v.category || '',
            mnemonic:        v.mnemonic    || '',
            commonCompounds: '',
          },
        }));
      }

      if(!pool.length) return null;
      const prev     = wdlState?.word;
      const filtered = pool.length > 1 ? pool.filter(p => p.word !== prev) : pool;
      return filtered[Math.floor(Math.random() * filtered.length)];
    };
  }

  // ── Patch wdlNewGame empty-state message ──────────────────────
  // Wrap wdlNewGame to intercept the null-pick case and show a
  // helpful "edit vocab sources" message.
  if(typeof wdlNewGame === 'function'){
    const _origWdlNewGame = wdlNewGame;
    wdlNewGame = function(){
      // Update mode buttons before each game in case data changed
      _updateWordleModeButtons();
      _origWdlNewGame();
      // If body shows the "no words" message, enhance it
      const body = document.getElementById('wdl-body');
      if(body && body.querySelector('div') &&
         body.textContent.includes('No') || body.textContent.includes('no')){
        const mode = wdlState?.mode || 'vocab';
        const hint =
          mode === 'ions'
            ? 'No ions loaded. Import a vocab.csv with <b>type=ion</b> rows.'
            : mode === 'elements'
              ? 'No elements loaded. Import a vocab.csv with <b>type=element</b> rows.'
              : 'No Wordle-eligible words in the selected chapters.<br>' +
                'Edit vocab sources in the Study Planner, or check that your words are 4–12 letters.';
        const editBtn =
          `<br><br><button onclick="showPlanner('topics')"
            style="padding:6px 16px;border-radius:8px;cursor:pointer;
              border:1px solid rgba(129,140,248,.4);background:rgba(129,140,248,.08);
              color:#a5b4fc;font-family:var(--mono);font-size:.72rem;">
            ✎ Edit Vocab Sources
          </button>`;
        body.innerHTML =
          `<div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;
            text-align:center;padding:40px;line-height:1.9;">
            ⚗ ${hint}${editBtn}
          </div>`;
      }
    };
  }

  // ── Patch _connBuildPuzzle ────────────────────────────────────
  // Replace the pool-collection block to use getVocabPool().
  // Also: if connections_group is missing from ALL entries,
  // auto-generate it from topic_label so Connections can work
  // with standard vocab CSVs that don't have the column.
  if(typeof _connBuildPuzzle !== 'undefined' || true){
    window._connBuildPuzzle = function(){
      // Auto-generate connections_group from topic_label if missing
      _ensureConnectionsGroups();

      const byGroup        = {};
      const chapterByGroup = {};

      // Primary: use getVocabPool() — respects chapter + type selections
      getVocabPool('connections').forEach(v => {
        const g = v.connections_group;
        if(!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(v.word);
        chapterByGroup[g] = v.chapter;
      });

      let validGroups = Object.keys(byGroup).filter(g => byGroup[g].length >= 4);

      // Fallback: if selection yields < 4 groups, use everything
      if(validGroups.length < 4){
        const allByGroup = {};
        vocabBank.filter(v => v.enabled !== false && v.connections_group).forEach(v => {
          const g = v.connections_group;
          if(!allByGroup[g]) allByGroup[g] = [];
          allByGroup[g].push(v.word);
          chapterByGroup[g] = v.chapter;
        });
        const allValid = Object.keys(allByGroup).filter(g => allByGroup[g].length >= 4);
        if(allValid.length < 4) return null;
        Object.assign(byGroup, allByGroup);
        validGroups = allValid;
        const chosen = _shuffle(validGroups.slice()).slice(0, 4);
        return _connMakeGroups(chosen, byGroup, chapterByGroup);
      }

      // Pick 4 groups, prefer same chapter for coherence
      const activeChapters = vocabPlan.chapters.length
        ? vocabPlan.chapters
        : chEntries().map(([k]) => k);

      const byChapter = {};
      validGroups.forEach(g => {
        const ch = chapterByGroup[g] || 'unknown';
        if(!byChapter[ch]) byChapter[ch] = [];
        byChapter[ch].push(g);
      });

      const chaptersWithEnough = Object.keys(byChapter).filter(
        ch => byChapter[ch].length >= 4
      );
      let chosen, chosenCh;

      if(chaptersWithEnough.length){
        const preferred = chaptersWithEnough.filter(c => activeChapters.includes(c));
        chosenCh = preferred.length
          ? preferred[Math.floor(Math.random() * preferred.length)]
          : chaptersWithEnough[Math.floor(Math.random() * chaptersWithEnough.length)];
        chosen = _shuffle(byChapter[chosenCh].slice()).slice(0, 4);
      } else {
        chosen   = _shuffle(validGroups.slice()).slice(0, 4);
        chosenCh = null;
      }

      return _connMakeGroups(chosen, byGroup, chapterByGroup, chosenCh);
    };
  }

  // ── Patch startConnections ────────────────────────────────────
  if(typeof startConnections === 'function'){
    const _origStartConnections = startConnections;
    startConnections = function(){
      _ensureConnectionsGroups();
      _origStartConnections();
    };
  }

});  // end DOMContentLoaded


// §HELPERS
/* ================================================================
   INTERNAL HELPERS
================================================================ */

/**
 * Dynamically show/hide Wordle mode buttons based on what data
 * is actually loaded. Prevents dead buttons.
 */
function _updateWordleModeButtons(){
  const modes     = getAvailableWordleModes();
  const modeIds   = modes.map(m => m.id);
  const btnIds    = { vocab:'wdl-mode-vocab', ions:'wdl-mode-ions', elements:'wdl-mode-elements' };

  Object.entries(btnIds).forEach(([modeId, btnId]) => {
    const btn = document.getElementById(btnId);
    if(!btn) return;
    if(modeIds.includes(modeId)){
      btn.style.display = '';
      btn.textContent   = modes.find(m => m.id === modeId)?.label || btn.textContent;
    } else {
      btn.style.display = 'none';
    }
  });

  // If current mode has no data, switch to first available
  const curMode = wdlState?.mode;
  if(curMode && !modeIds.includes(curMode) && modes.length){
    _wdlSetModeUI(modes[0].id);
  }
}

/**
 * Auto-generate connections_group from topic_label for vocab entries
 * that don't have one. This lets standard vocab CSVs (like the
 * teacher's CSV which has no connections_category column) work with
 * the Connections game without needing a CSV update.
 *
 * Groups need ≥ 4 words — topic_label grouping gives that naturally
 * since each topic has multiple words.
 *
 * Only runs once per vocabBank load (idempotent).
 */
function _ensureConnectionsGroups(){
  // Check if any entries have connections_group already
  const hasAny = vocabBank.some(v => v.connections_group && v.connections_group.trim());
  if(hasAny) return; // don't override explicit groups

  // Auto-generate from topic_label (or topic key as fallback)
  vocabBank.forEach(v => {
    if(!v.connections_group || v.connections_group.trim() === ''){
      v.connections_group = v.topic_label || v.topic || 'General';
    }
  });
}
