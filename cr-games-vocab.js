/* ================================================================
   cr-games-vocab.js — Vocab-Based Game Engines
   ─────────────────────────────────────────────────────────────────
   GAMES IN THIS FILE:
     §CROSSWORD     Crossword puzzle generator + grid interaction
     §FLASHCARD     Flip-card study deck with know/again/skip tracking
     §WOF           Wheel of Fortune (spinner) + Hangman (SVG gallows)
     §WORDSEARCH    Word search grid generator + drag-to-select interaction
     §WORDLE        Chemistry Wordle (ions / vocab / elements modes)
     §CONNECTIONS   NYT Connections-style grouping game

   ALL GAMES HERE use vocabBank (type=vocab|ion|element) via activeVocab().
   None use the question modal or questions.csv.

   DEPENDENCIES:
     cr-data.js    — CHAPTERS, vocabBank, activeVocab, allVocab, getWordlePool
     cr-core.js    — renderChapterSelector, showScreen
     cr-planner.js — studyPlan, spTrackResult, showPlanner

   ENTRY POINTS (called by launchGame / _dispatchGame in cr-planner.js):
     startCrossword(chKey)
     startFlashcards(chKey)
     startWof(chKey)
     startWordSearch(chKey)
     startWordle()          — picks from vocabBank based on active mode
     startConnections()     — picks from vocabBank connections_group

   SELECTOR HELPERS (open their selector screens):
     openCrosswordSelector()
     openFlashcardSelector()
     openWofSelector()
     openWsSelector()

   NOTE ON WORDLE / CONNECTIONS:
     These two games are "daily-style" — they do not require a chapter
     selection. Wordle picks from all enabled wordle_eligible vocab.
     Connections picks from all vocab with a connections_group value,
     preferring the currently-selected chapters.
================================================================ */

// §CROSSWORD
/* ================================================================
   CROSSWORD ENGINE
================================================================ */
let cwChapterKey = null;
let cwPlaced     = [];   // [{word,def,row,col,dir,number}]
let cwGrid       = [];   // 2D array of {letter,inputs,number}
let cwActive     = null; // {index,dir}  currently highlighted word
let cwSize       = 0;

function startCrossword(chKey){
  cwChapterKey = chKey;
  const ch = CHAPTERS[chKey];
  document.getElementById('cw-title').textContent = `✏️ ${ch.label}: ${ch.name} Crossword`;
  showScreen('cw-screen');
  buildCrossword();
}

function buildCrossword(){
  const ch = CHAPTERS[cwChapterKey];
  const vocab = getVocabForChapter(cwChapterKey, 'crossword').filter(v => /^[A-Z]+$/.test(v.word));

  if(vocab.length < 5){
    document.getElementById('cw-grid').innerHTML = '';
    document.getElementById('cw-clues-across').innerHTML = '';
    document.getElementById('cw-clues-down').innerHTML = '';
    document.getElementById('cw-found').textContent = '0';
    document.getElementById('cw-total').textContent = '0';
    document.getElementById('cw-grid').innerHTML =
      `<div style="color:var(--muted);font-size:.8rem;font-family:var(--mono);padding:28px;text-align:center;line-height:1.8;">
        ⚗ Not enough vocab to build a crossword.<br>
        Need at least 5 single-word terms — only ${vocab.length} found for ${ch.name}.<br>
        <span style="color:var(--muted);font-size:.72rem">Import a vocab.csv with more entries for this chapter.</span>
      </div>`;
    return;
  }

  // Shuffle and pick up to 18 words, prefer longer words first for better grid density
  vocab.sort((a,b) => b.word.length - a.word.length);
  const pool = vocab.slice(0, 18);

  const result = placeWords(pool);
  cwPlaced = result.placed;
  cwSize   = result.size;
  cwGrid   = result.grid;

  if(cwPlaced.length < 3){
    // Placement algorithm couldn't find enough intersections — give a helpful message
    document.getElementById('cw-grid').innerHTML =
      `<div style="color:var(--muted);font-size:.8rem;font-family:var(--mono);padding:28px;text-align:center;line-height:1.8;">
        ⚗ Couldn't build a connected puzzle from the current vocab (${vocab.length} words).<br>
        Try adding more variety — words with shared letters help. Pressing 🔀 New Puzzle will retry.
      </div>`;
    return;
  }

  numberClues(cwGrid, cwPlaced, cwSize);
  renderCWGrid();
  renderCWClues();
  cwActive = null;
  updateCWProgress();
}

// ── Crossword placement algorithm ──
function placeWords(pool){
  const MAX = 21;
  // Start with largest word centered
  let placed = [];
  let grid = makeGrid(MAX);

  const first = pool[0];
  const startC = Math.floor((MAX - first.word.length) / 2);
  const startR = Math.floor(MAX / 2);
  placeWord(grid, first.word, startR, startC, 'across');
  placed.push({...first, row:startR, col:startC, dir:'across'});

  // Try to place remaining words by finding intersections
  for(let attempt = 0; attempt < 6; attempt++){
    for(let wi = 1; wi < pool.length; wi++){
      if(placed.find(p => p.word === pool[wi].word)) continue;
      const w = pool[wi];
      let bestPlace = null;
      let bestScore = -1;

      for(const placed_w of placed){
        const crosses = findCrosses(w.word, placed_w, grid, MAX);
        for(const cross of crosses){
          if(cross.score > bestScore && !collides(grid, w.word, cross.row, cross.col, cross.dir, MAX)){
            bestScore = cross.score;
            bestPlace = cross;
          }
        }
      }
      if(bestPlace){
        placeWord(grid, w.word, bestPlace.row, bestPlace.col, bestPlace.dir);
        placed.push({...w, row:bestPlace.row, col:bestPlace.col, dir:bestPlace.dir});
      }
    }
  }

  // Crop to bounding box
  let minR=MAX,maxR=0,minC=MAX,maxC=0;
  placed.forEach(p => {
    minR = Math.min(minR, p.row);
    maxR = Math.max(maxR, p.row + (p.dir==='down'  ? p.word.length-1 : 0));
    minC = Math.min(minC, p.col);
    maxC = Math.max(maxC, p.col + (p.dir==='across'? p.word.length-1 : 0));
  });
  const pad = 1;
  minR=Math.max(0,minR-pad); minC=Math.max(0,minC-pad);
  maxR=Math.min(MAX-1,maxR+pad); maxC=Math.min(MAX-1,maxC+pad);
  const size = Math.max(maxR-minR+1, maxC-minC+1);

  // Rebuild cropped grid
  const cgrid = makeGrid(size);
  placed = placed.map(p => ({...p, row:p.row-minR, col:p.col-minC}));
  placed.forEach(p => placeWord(cgrid, p.word, p.row, p.col, p.dir));

  return {placed, grid:cgrid, size};
}

function makeGrid(n){ return Array.from({length:n}, ()=>Array.from({length:n}, ()=>({letter:'',black:true}))); }

function placeWord(grid, word, row, col, dir){
  for(let i=0;i<word.length;i++){
    const r = dir==='down' ? row+i : row;
    const c = dir==='across' ? col+i : col;
    if(r>=0&&r<grid.length&&c>=0&&c<grid[0].length){
      grid[r][c].letter = word[i];
      grid[r][c].black  = false;
    }
  }
}

function findCrosses(word, placed_w, grid, MAX){
  const results = [];
  const dir = placed_w.dir === 'across' ? 'down' : 'across';
  for(let pi=0; pi<placed_w.word.length; pi++){
    const sharedLetter = placed_w.word[pi];
    for(let wi=0; wi<word.length; wi++){
      if(word[wi] !== sharedLetter) continue;
      let row, col;
      if(dir === 'down'){
        row = placed_w.row - wi;
        col = placed_w.col + pi;
      } else {
        row = placed_w.row + pi;
        col = placed_w.col - wi;
      }
      if(row<0||col<0||row+( dir==='down'?word.length:1)>MAX||col+(dir==='across'?word.length:1)>MAX) continue;
      results.push({row, col, dir, score: 1 + Math.random()*0.1});
    }
  }
  return results;
}

function collides(grid, word, row, col, dir, MAX){
  const n = grid.length;
  for(let i=0;i<word.length;i++){
    const r = dir==='down' ? row+i : row;
    const c = dir==='across'? col+i : col;
    if(r<0||r>=n||c<0||c>=n) return true;
    const cell = grid[r][c];
    if(!cell.black && cell.letter !== word[i]) return true;
    // Check for parallel adjacency (word running alongside another)
    if(cell.black){
      if(dir==='across'){
        if(r>0 && !grid[r-1][c].black && grid[r-1][c].letter !== '') return true;
        if(r<n-1 && !grid[r+1][c].black && grid[r+1][c].letter !== '') return true;
      } else {
        if(c>0 && !grid[r][c-1].black && grid[r][c-1].letter !== '') return true;
        if(c<n-1 && !grid[r][c+1].black && grid[r][c+1].letter !== '') return true;
      }
    }
  }
  // Check ends
  if(dir==='across'){
    if(col>0 && !grid[row][col-1].black) return true;
    if(col+word.length<n && !grid[row][col+word.length].black) return true;
  } else {
    if(row>0 && !grid[row-1][col].black) return true;
    if(row+word.length<n && !grid[row+word.length][col].black) return true;
  }
  return false;
}

function numberClues(grid, placed, size){
  let num = 1;
  for(let r=0;r<size;r++){
    for(let c=0;c<size;c++){
      if(grid[r][c].black) continue;
      const startsAcross = placed.some(p=>p.dir==='across'&&p.row===r&&p.col===c);
      const startsDown   = placed.some(p=>p.dir==='down'  &&p.row===r&&p.col===c);
      if(startsAcross||startsDown){
        grid[r][c].number = num;
        placed.filter(p=>(p.dir==='across'&&p.row===r&&p.col===c)||(p.dir==='down'&&p.row===r&&p.col===c))
              .forEach(p=>p.number=num);
        num++;
      }
    }
  }
}

// ── Render ──
function renderCWGrid(){
  const grid = document.getElementById('cw-grid');
  grid.style.gridTemplateColumns = `repeat(${cwSize},34px)`;
  grid.innerHTML = '';
  for(let r=0;r<cwSize;r++){
    for(let c=0;c<cwSize;c++){
      const cell = cwGrid[r][c];
      const div  = document.createElement('div');
      div.className = 'cw-cell' + (cell.black?' black':'');
      div.dataset.r = r; div.dataset.c = c;
      if(!cell.black){
        if(cell.number){
          const num = document.createElement('span');
          num.className = 'cw-num';
          num.textContent = cell.number;
          div.appendChild(num);
        }
        const inp = document.createElement('input');
        inp.maxLength = 1;
        inp.dataset.r = r; inp.dataset.c = c;
        inp.addEventListener('click',  ()=>onCWCellClick(r,c));
        inp.addEventListener('keydown', e=>onCWKey(e,r,c));
        inp.addEventListener('input',   e=>onCWInput(e,r,c));
        div.appendChild(inp);
      }
      grid.appendChild(div);
    }
  }
}

function renderCWClues(){
  const across = cwPlaced.filter(p=>p.dir==='across').sort((a,b)=>a.number-b.number);
  const down   = cwPlaced.filter(p=>p.dir==='down')  .sort((a,b)=>a.number-b.number);
  ['across','down'].forEach(dir=>{
    const list = dir==='across'?across:down;
    const el   = document.getElementById('cw-clues-'+dir);
    el.innerHTML = '';
    list.forEach(w=>{
      const d = document.createElement('div');
      d.className = 'cw-clue';
      d.dataset.word = w.word; d.dataset.dir = dir;
      d.innerHTML = `<span class="cw-clue-num">${w.number}</span><span>${w.def}</span>`;
      d.addEventListener('click',()=>activateWord(w));
      el.appendChild(d);
    });
  });
}

function activateWord(w){
  cwActive = {word:w.word, dir:w.dir, row:w.row, col:w.col, number:w.number};
  highlightWord();
  // Focus first empty cell in word
  for(let i=0;i<w.word.length;i++){
    const r = w.dir==='down'?w.row+i:w.row;
    const c = w.dir==='across'?w.col+i:w.col;
    const inp = getCWInput(r,c);
    if(inp && !inp.value){ inp.focus(); return; }
  }
  getCWInput(w.row, w.col)?.focus();
}

function highlightWord(){
  // Clear all
  document.querySelectorAll('.cw-cell').forEach(d=>{ d.classList.remove('active','word-hi'); });
  document.querySelectorAll('.cw-clue').forEach(d=>d.classList.remove('active'));
  if(!cwActive) return;
  const w = cwActive;
  for(let i=0;i<w.word.length;i++){
    const r = w.dir==='down'?w.row+i:w.row;
    const c = w.dir==='across'?w.col+i:w.col;
    getCWCell(r,c)?.classList.add('word-hi');
  }
  // Highlight active clue
  document.querySelectorAll('.cw-clue').forEach(d=>{
    if(d.dataset.word===w.word&&d.dataset.dir===w.dir) d.classList.add('active');
  });
}

function onCWCellClick(r,c){
  // Find which word(s) this cell belongs to
  const words = cwPlaced.filter(p=>{
    for(let i=0;i<p.word.length;i++){
      if((p.dir==='across'&&p.row===r&&p.col+i===c)||(p.dir==='down'&&p.col===c&&p.row+i===r)) return true;
    }
    return false;
  });
  if(!words.length) return;
  // Toggle between across/down if two words share cell
  if(words.length>1 && cwActive && words.some(w=>w.word===cwActive?.word&&w.dir===cwActive?.dir)){
    const other = words.find(w=>!(w.word===cwActive?.word&&w.dir===cwActive?.dir));
    if(other) activateWord(other);
  } else {
    activateWord(words[0]);
  }
}

function onCWKey(e,r,c){
  if(!cwActive) return;
  const {dir} = cwActive;
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='ArrowDown'){
    e.preventDefault();
    const dr = (e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0);
    const dc = (e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0);
    getCWInput(r+dr,c+dc)?.focus();
  }
  if(e.key==='Backspace'){
    const inp = getCWInput(r,c);
    if(inp&&inp.value){ inp.value=''; checkWordSolved(); updateCWProgress(); return; }
    // Move back
    const pr = dir==='down'?r-1:r, pc=dir==='across'?c-1:c;
    const prev = getCWInput(pr,pc);
    if(prev){ prev.value=''; prev.focus(); checkWordSolved(); updateCWProgress(); }
  }
  if(e.key==='Tab'){ e.preventDefault(); advanceWord(e.shiftKey); }
}

function onCWInput(e,r,c){
  const inp = e.target;
  const val = inp.value.replace(/[^a-zA-Z]/g,'').toUpperCase();
  inp.value = val;
  if(val){ advanceCursor(r,c); }
  checkWordSolved();
  updateCWProgress();
}

function advanceCursor(r,c){
  if(!cwActive) return;
  const {dir} = cwActive;
  const nr = dir==='down'?r+1:r, nc=dir==='across'?c+1:c;
  const next = getCWInput(nr,nc);
  if(next) next.focus();
}

function advanceWord(back){
  const dirs = ['across','down'];
  const allWords = cwPlaced.slice().sort((a,b)=>a.number-b.number||(a.dir==='across'?-1:1));
  const idx = allWords.findIndex(w=>w.word===cwActive?.word&&w.dir===cwActive?.dir);
  const next = allWords[(idx+(back?-1:1)+allWords.length)%allWords.length];
  if(next) activateWord(next);
}

function checkWordSolved(){
  cwPlaced.forEach(w=>{
    let correct = true;
    for(let i=0;i<w.word.length;i++){
      const r=w.dir==='down'?w.row+i:w.row, c=w.dir==='across'?w.col+i:w.col;
      const inp=getCWInput(r,c);
      if(!inp||inp.value.toUpperCase()!==w.word[i]){ correct=false; break; }
    }
    // Color cells
    for(let i=0;i<w.word.length;i++){
      const r=w.dir==='down'?w.row+i:w.row, c=w.dir==='across'?w.col+i:w.col;
      const cell=getCWCell(r,c);
      if(cell){ cell.classList.toggle('correct', correct); }
    }
    // Mark clue solved
    document.querySelectorAll('.cw-clue').forEach(d=>{
      if(d.dataset.word===w.word&&d.dataset.dir===w.dir) d.classList.toggle('solved',correct);
    });
  });
}

function updateCWProgress(){
  const solved = cwPlaced.filter(w=>{
    for(let i=0;i<w.word.length;i++){
      const r=w.dir==='down'?w.row+i:w.row, c=w.dir==='across'?w.col+i:w.col;
      const inp=getCWInput(r,c);
      if(!inp||inp.value.toUpperCase()!==w.word[i]) return false;
    }
    return true;
  }).length;
  document.getElementById('cw-found').textContent = solved;
  document.getElementById('cw-total').textContent = cwPlaced.length;
}

function revealAll(){
  cwPlaced.forEach(w=>{
    for(let i=0;i<w.word.length;i++){
      const r=w.dir==='down'?w.row+i:w.row, c=w.dir==='across'?w.col+i:w.col;
      const inp=getCWInput(r,c);
      if(inp) inp.value=w.word[i];
    }
  });
  checkWordSolved(); updateCWProgress();
}

function getCWCell(r,c){ return document.querySelector(`.cw-cell[data-r="${r}"][data-c="${c}"]`); }
function getCWInput(r,c){ return document.querySelector(`.cw-cell input[data-r="${r}"][data-c="${c}"]`); }

// §FLASHCARD
/* ================================================================
   FLASHCARD ENGINE
================================================================ */
let fcChapterKey = null;
let fcDeck       = [];
let fcIndex      = 0;
let fcFlipped    = false;
let fcResults    = [];  // 'k'=know, 'a'=again, 's'=skip per card

function startFlashcards(chKey){
  fcChapterKey = chKey;
  const ch = CHAPTERS[chKey];
  document.getElementById('fc-title').textContent = `📇 ${ch.label}: ${ch.name}`;
  fcDeck    = getVocabForChapter(fcChapterKey).sort(()=>Math.random()-.5);
  fcIndex   = 0;
  fcFlipped = false;
  fcResults = new Array(fcDeck.length).fill(null);
  showScreen('fc-screen');
  renderFlashcard();
}

function shuffleFlashcards(){
  fcDeck  = getVocabForChapter(fcChapterKey).sort(()=>Math.random()-.5);
  fcIndex = 0; fcFlipped = false;
  fcResults = new Array(fcDeck.length).fill(null);
  renderFlashcard();
}

function renderFlashcard(){
  const body = document.getElementById('fc-body');
  if(fcIndex >= fcDeck.length){ renderFCResults(); return; }
  const card = fcDeck[fcIndex];
  const pct  = Math.round(fcIndex/fcDeck.length*100);
  body.innerHTML = `
    <div class="fc-progress-row">
      <div class="fc-prog-track"><div class="fc-prog-fill" style="width:${pct}%"></div></div>
      <div class="fc-prog-label">${fcIndex+1} / ${fcDeck.length}</div>
    </div>
    <div class="fc-card-wrap" id="fc-card-wrap" onclick="flipCard()">
      <div class="fc-card" id="fc-card">
        <div class="fc-face fc-front">
          <div class="fc-face-label">Term</div>
          <div class="fc-word">${card.word}</div>
          <div class="fc-tap-hint">tap to reveal definition</div>
        </div>
        <div class="fc-face fc-back">
          <div class="fc-face-label">Definition</div>
          <div class="fc-def">${card.def}</div>
        </div>
      </div>
    </div>
    <div class="fc-controls" id="fc-controls" style="opacity:0;pointer-events:none;transition:opacity .3s">
      <button class="fc-btn fc-btn-again" onclick="fcAnswer('a')">✗ Study Again</button>
      <button class="fc-btn fc-btn-skip"  onclick="fcAnswer('s')">→ Skip</button>
      <button class="fc-btn fc-btn-know"  onclick="fcAnswer('k')">✓ Got It</button>
    </div>
    <div class="fc-controls">
      <button class="fc-btn fc-btn-flip" onclick="flipCard()">↩ Flip Card</button>
    </div>`;
}

function flipCard(){
  const card = document.getElementById('fc-card');
  if(!card) return;
  fcFlipped = !fcFlipped;
  card.classList.toggle('flipped', fcFlipped);
  const ctrl = document.getElementById('fc-controls');
  if(fcFlipped && ctrl){ ctrl.style.opacity='1'; ctrl.style.pointerEvents=''; }
}

function fcAnswer(result){
  fcResults[fcIndex] = result;
  fcIndex++;
  fcFlipped = false;
  renderFlashcard();
}

function renderFCResults(){
  const know  = fcResults.filter(r=>r==='k').length;
  const again = fcResults.filter(r=>r==='a').length;
  const skip  = fcResults.filter(r=>r==='s').length;
  const pct   = Math.round(know/fcDeck.length*100);
  const grade = pct===100?'🏆 Perfect!':pct>=80?'Great job!':pct>=60?'Good effort!':'Keep studying!';
  const dots  = fcResults.map(r=>`<div class="fc-dot ${r||'s'}"></div>`).join('');
  document.getElementById('fc-body').innerHTML = `
    <div class="fc-results">
      <div class="fc-results-title">${grade}</div>
      <div class="fc-results-sub">${know} known · ${again} to review · ${skip} skipped</div>
      <div class="fc-dot-row">${dots}</div>
      <div class="fc-controls">
        <button class="fc-btn fc-btn-again" onclick="startFlashcards('${fcChapterKey}')">↺ Restart</button>
        <button class="fc-btn fc-btn-know"  onclick="reviewMissed()">📚 Study Missed (${again})</button>
        <button class="fc-btn fc-btn-skip"  onclick="showPlanner('games')">← Chapters</button>
      </div>
    </div>`;
}


// §WOF
/* ================================================================
   WHEEL OF FORTUNE / HANGMAN ENGINE
================================================================ */

const WOF_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Spinner zones — values and colors
const WOF_ZONES = [
  { label:'SPIN AGAIN', color:'#e63946', action:'spin' },
  { label:'FREE LETTER', color:'#457b9d', action:'free' },
  { label:'LOSE TURN',  color:'#1d1d1d', action:'lose' },
  { label:'FREE LETTER', color:'#2a9d8f', action:'free' },
  { label:'SPIN AGAIN', color:'#e9c46a', action:'spin' },
  { label:'FREE LETTER', color:'#6a4c93', action:'free' },
  { label:'LOSE TURN',  color:'#1d1d1d', action:'lose' },
  { label:'FREE LETTER', color:'#f4a261', action:'free' },
  { label:'SPIN AGAIN', color:'#264653', action:'spin' },
  { label:'FREE LETTER', color:'#e76f51', action:'free' },
  { label:'LOSE TURN',  color:'#1d1d1d', action:'lose' },
  { label:'FREE LETTER', color:'#023e8a', action:'free' },
];
const WOF_ZONE_COUNT = WOF_ZONES.length;

let wofState = {
  chapter: null,
  mode: 'wheel',        // 'wheel' | 'hangman'
  clueType: 'definition', // 'definition' | 'topic'
  hangDiff: 5,          // max wrong guesses
  word: '',
  clue: '',
  guessed: new Set(),
  wrongGuesses: [],
  gameOver: false,
  // Wheel-specific
  canGuess: false,      // true after landing on FREE LETTER
  spinning: false,
  spinAngle: 0,
  spinVel: 0,
  spinRAF: null,
  landedZone: null,
};

function openWofSelector(){
  renderChapterSelector('wof-sel-chapters', startWof, true);
  showScreen('wof-sel-screen');
}

function startWof(chKey){
  wofState.chapter = chKey;
  wofState.mode = 'wheel';
  wofState.clueType = 'definition';
  wofState.hangDiff = 5;
  showScreen('wof-screen');
  document.getElementById('wof-title').textContent = 'WHEEL OF FORTUNE';
  _wofSyncToggles();
  wofNewWord();
}

function wofSetMode(m){
  wofState.mode = m;
  document.getElementById('wof-title').textContent = m === 'wheel' ? 'WHEEL OF FORTUNE' : 'HANGMAN';
  document.getElementById('wof-diff-group').style.display = m === 'hangman' ? '' : 'none';
  _wofSyncToggles();
  wofNewWord();
}

function wofSetClue(t){
  wofState.clueType = t;
  _wofSyncToggles();
  wofRender(); // just re-render clue
}

function wofSetDiff(d){
  wofState.hangDiff = d;
  _wofSyncToggles();
  wofNewWord();
}

function _wofSyncToggles(){
  // Mode
  document.getElementById('tog-wheel').className = 'wof-tog' + (wofState.mode==='wheel' ? ' active-pink' : '');
  document.getElementById('tog-hang').className  = 'wof-tog' + (wofState.mode==='hangman' ? ' active-pink' : '');
  // Clue
  document.getElementById('tog-def').className   = 'wof-tog' + (wofState.clueType==='definition' ? ' active' : '');
  document.getElementById('tog-topic').className = 'wof-tog' + (wofState.clueType==='topic' ? ' active' : '');
  // Diff
  [3,5,7].forEach(d => {
    const el = document.getElementById(`tog-d${d}`);
    if(el) el.className = 'wof-tog' + (wofState.hangDiff===d ? ' active-blue' : '');
  });
  document.getElementById('wof-diff-group').style.display = wofState.mode==='hangman' ? '' : 'none';
}

function wofNewWord(){
  // Cancel any running spin
  if(wofState.spinRAF){ cancelAnimationFrame(wofState.spinRAF); wofState.spinRAF=null; }

  const ch = CHAPTERS[wofState.chapter];
  const vocab = getVocabForChapter(wofState.chapter);
  if(!vocab.length){
    document.getElementById('wof-body').innerHTML =
      '<div style="color:var(--muted);padding:40px;text-align:center">No vocabulary for this chapter.</div>';
    return;
  }

  const item = vocab[Math.floor(Math.random()*vocab.length)];
  wofState.word = item.word.toUpperCase().replace(/[^A-Z ]/g,'');
  wofState.clue = wofState.clueType === 'definition'
    ? item.def
    : `${CHAPTERS[wofState.chapter]?.name || 'Chemistry'} term`;
  wofState.guessed = new Set();
  wofState.wrongGuesses = [];
  wofState.gameOver = false;
  wofState.canGuess = false;
  wofState.spinning = false;
  wofState.spinAngle = Math.random() * Math.PI * 2;
  wofState.spinVel = 0;
  wofState.landedZone = null;

  wofRender();
}

// ── RENDER ──────────────────────────────────────────────────
function wofRender(){
  const word = wofState.word;
  const guessed = wofState.guessed;
  const wrong = wofState.wrongGuesses;
  const over = wofState.gameOver;
  const mode = wofState.mode;
  const isHang = mode === 'hangman';

  // Check win/lose
  const letters = word.replace(/ /g,'').split('');
  const allRevealed = letters.every(l => guessed.has(l));
  const lost = isHang && wrong.length >= wofState.hangDiff;

  // Build letter board
  const boardHTML = word.split('').map(ch => {
    if(ch === ' ') return '<div class="wof-tile space"></div>';
    const show = guessed.has(ch) || (lost && !allRevealed);
    const cls = show ? (guessed.has(ch) ? 'revealed' : 'wrong-reveal') : '';
    return `<div class="wof-tile ${cls}"><span>${show ? ch : ''}</span></div>`;
  }).join('');

  // Build clue HTML
  const clueHTML = `<div class="wof-clue"><strong>Clue:</strong> ${wofState.clue}</div>`;

  // Build keyboard
  const wrongSet = new Set(wrong);
  const keyboardHTML = `<div class="wof-keyboard">
    ${['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].map(row =>
      `<div class="wof-key-row">${row.split('').map(l => {
        const used = guessed.has(l);
        const isWrong = wrongSet.has(l);
        let cls = '';
        if(used && !isWrong) cls = 'used-correct';
        else if(isWrong) cls = 'used-wrong';
        else if(!isHang && !wofState.canGuess && !over) cls = 'locked-spin';
        const disabled = used || isWrong || over || lost ? 'disabled' : '';
        return `<button class="wof-key ${cls}" ${disabled}
          onclick="wofGuessLetter('${l}')">${l}</button>`;
      }).join('')}</div>`
    ).join('')}
  </div>`;

  // Status
  let statusHTML = '';
  if(allRevealed && !over){
    wofState.gameOver = true;
    statusHTML = `<div class="wof-status win">🎉 Correct! The word was <strong>${word}</strong></div>`;
  } else if(lost){
    wofState.gameOver = true;
    statusHTML = `<div class="wof-status lose">💀 The word was: <strong>${word}</strong></div>`;
  } else if(isHang){
    statusHTML = `<div class="wof-wrong-letters">${wrong.length ? 'Wrong: '+wrong.join(' ') : '&nbsp;'}</div>`;
  } else if(wofState.canGuess){
    statusHTML = `<div class="wof-status info">✓ Pick a letter!</div>`;
  } else if(wofState.landedZone){
    const z = WOF_ZONES[wofState.landedZone];
    statusHTML = `<div class="wof-zone-label">${z.label}</div>`;
  }

  // New word button (always shown)
  const newBtnHTML = `<button class="wof-new-btn" onclick="wofNewWord()">↺ New Word</button>`;

  // Assemble based on mode
  if(isHang){
    // Hangman layout: gallows SVG + board + keyboard
    const maxWrong = wofState.hangDiff;
    const wrongCount = wrong.length;
    document.getElementById('wof-body').innerHTML = `
      ${clueHTML}
      <div class="wof-board">${boardHTML}</div>
      <div class="wof-hangman-wrap">
        ${hangmanSVG(wrongCount, maxWrong)}
        <div class="wof-wrong-count">${wrongCount} / ${maxWrong} wrong</div>
      </div>
      ${statusHTML}
      ${keyboardHTML}
      ${newBtnHTML}`;
  } else {
    // Wheel layout: spinner + board + keyboard
    const spinBtnDisabled = over || wofState.spinning ? 'disabled' : '';
    document.getElementById('wof-body').innerHTML = `
      ${clueHTML}
      <div class="wof-board">${boardHTML}</div>
      <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;justify-content:center;">
        <div class="wof-spin-area">
          <div class="wof-spinner-wrap">
            <div class="wof-spinner-needle"></div>
            <canvas class="wof-spinner-canvas" id="wof-canvas" width="220" height="220"></canvas>
          </div>
          <button class="wof-spin-btn" id="wof-spin-btn" onclick="wofSpin()" ${spinBtnDisabled}>
            ${over ? 'GAME OVER' : '▶ SPIN'}
          </button>
          ${statusHTML}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;align-items:center;">
          ${keyboardHTML}
          ${newBtnHTML}
        </div>
      </div>`;
    wofDrawSpinner();
  }
}

// ── SPINNER CANVAS ───────────────────────────────────────────
function wofDrawSpinner(){
  const canvas = document.getElementById('wof-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 110, cy = 110, r = 105;
  const slice = (Math.PI*2) / WOF_ZONE_COUNT;
  ctx.clearRect(0,0,220,220);

  WOF_ZONES.forEach((zone, i) => {
    const start = wofState.spinAngle + i * slice;
    const end   = start + slice;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = zone.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label text
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + slice/2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px monospace';
    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowBlur = 3;
    const words = zone.label.split(' ');
    words.forEach((w,wi) => {
      ctx.fillText(w, r - 8, (wi - (words.length-1)/2)*11);
    });
    ctx.restore();
  });

  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI*2);
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,0,.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,215,0,.4)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function wofSpin(){
  if(wofState.spinning || wofState.gameOver) return;
  wofState.spinning = true;
  wofState.canGuess = false;
  wofState.landedZone = null;
  document.getElementById('wof-spin-btn').disabled = true;

  // Random velocity 8–14 full rotations worth
  wofState.spinVel = (Math.PI * 2) * (8 + Math.random()*6) / 80;

  function tick(){
    wofState.spinAngle += wofState.spinVel;
    wofState.spinVel *= 0.97; // friction
    wofDrawSpinner();

    if(wofState.spinVel > 0.01){
      wofState.spinRAF = requestAnimationFrame(tick);
    } else {
      // Landed — find which zone the needle (top = -π/2 from center) points to
      wofState.spinning = false;
      const needle = Math.PI * 1.5; // top of circle
      const slice  = (Math.PI*2) / WOF_ZONE_COUNT;
      // Normalise angle
      const norm = ((needle - wofState.spinAngle) % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
      const zoneIdx = Math.floor(norm / slice) % WOF_ZONE_COUNT;
      wofState.landedZone = zoneIdx;
      wofHandleLanding(WOF_ZONES[zoneIdx]);
    }
  }
  requestAnimationFrame(tick);
}

function wofHandleLanding(zone){
  if(zone.action === 'free'){
    wofState.canGuess = true;
    wofRender();
  } else if(zone.action === 'spin'){
    // Re-render to show SPIN AGAIN, then re-enable spin button
    wofRender();
    const btn = document.getElementById('wof-spin-btn');
    if(btn) btn.disabled = false;
  } else if(zone.action === 'lose'){
    wofState.canGuess = false;
    wofRender();
    const btn = document.getElementById('wof-spin-btn');
    if(btn) btn.disabled = false;
  }
}

// ── GUESS LOGIC ──────────────────────────────────────────────
function wofGuessLetter(letter){
  const state = wofState;
  if(state.gameOver) return;
  if(state.mode === 'wheel' && !state.canGuess) return;
  if(state.guessed.has(letter) || state.wrongGuesses.includes(letter)) return;

  const inWord = state.word.includes(letter);

  if(inWord){
    state.guessed.add(letter);
    if(state.mode === 'wheel'){
      state.canGuess = false; // must spin again
    }
  } else {
    state.wrongGuesses.push(letter);
    if(state.mode === 'wheel'){
      state.canGuess = false;
    }
  }

  wofRender();

  // Re-enable spin button after guess in wheel mode
  if(state.mode === 'wheel' && !state.gameOver){
    const btn = document.getElementById('wof-spin-btn');
    if(btn) btn.disabled = false;
  }
}

// ── HANGMAN SVG ──────────────────────────────────────────────
function hangmanSVG(wrongCount, maxWrong){
  // Scale the 8 body parts to maxWrong guesses
  // Parts: gallows(always), head, body, leftArm, rightArm, leftLeg, rightLeg, face
  const parts = ['head','body','leftArm','rightArm','leftLeg','rightLeg','face'];
  // Map wrongCount/maxWrong ratio to parts revealed
  const partsToShow = maxWrong <= 0 ? parts.length
    : Math.floor((wrongCount / maxWrong) * parts.length + 0.01);
  const show = new Set(parts.slice(0, partsToShow));

  const s = (id) => show.has(id);
  const head = s('head'), body = s('body'),
        lArm = s('leftArm'), rArm = s('rightArm'),
        lLeg = s('leftLeg'), rLeg = s('rightLeg'),
        face = s('face');

  // Color: grey until last part (face), then red when losing
  const bodyColor = wrongCount >= maxWrong ? '#f87171' : '#aac4e8';
  const faceCol   = wrongCount >= maxWrong ? '#f87171' : '#ffd700';

  return `<svg class="wof-hangman-svg" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg">
    <!-- Gallows (always shown) -->
    <line x1="20" y1="190" x2="140" y2="190" stroke="#888" stroke-width="4" stroke-linecap="round"/>
    <line x1="50" y1="190" x2="50" y2="20"   stroke="#888" stroke-width="4" stroke-linecap="round"/>
    <line x1="50" y1="20"  x2="100" y2="20"  stroke="#888" stroke-width="4" stroke-linecap="round"/>
    <line x1="100" y1="20" x2="100" y2="42"  stroke="#888" stroke-width="3" stroke-linecap="round"/>
    <!-- Head -->
    ${head ? `<circle cx="100" cy="55" r="13" fill="none" stroke="${bodyColor}" stroke-width="3"/>` : ''}
    <!-- Face details (last part) -->
    ${face && head ? `
      <circle cx="96" cy="52" r="2" fill="${faceCol}"/>
      <circle cx="104" cy="52" r="2" fill="${faceCol}"/>
      <path d="M96,61 Q100,57 104,61" fill="none" stroke="${faceCol}" stroke-width="1.5" stroke-linecap="round"/>
    ` : ''}
    <!-- Body -->
    ${body ? `<line x1="100" y1="68" x2="100" y2="120" stroke="${bodyColor}" stroke-width="3" stroke-linecap="round"/>` : ''}
    <!-- Left arm -->
    ${lArm ? `<line x1="100" y1="80" x2="78"  y2="102" stroke="${bodyColor}" stroke-width="3" stroke-linecap="round"/>` : ''}
    <!-- Right arm -->
    ${rArm ? `<line x1="100" y1="80" x2="122" y2="102" stroke="${bodyColor}" stroke-width="3" stroke-linecap="round"/>` : ''}
    <!-- Left leg -->
    ${lLeg ? `<line x1="100" y1="120" x2="78"  y2="150" stroke="${bodyColor}" stroke-width="3" stroke-linecap="round"/>` : ''}
    <!-- Right leg -->
    ${rLeg ? `<line x1="100" y1="120" x2="122" y2="150" stroke="${bodyColor}" stroke-width="3" stroke-linecap="round"/>` : ''}
  </svg>`;
}

function reviewMissed(){
  const missed = fcDeck.filter((_,i)=>fcResults[i]==='a');
  if(!missed.length){ startFlashcards(fcChapterKey); return; }
  fcDeck    = missed.sort(()=>Math.random()-.5);
  fcIndex   = 0; fcFlipped = false;
  fcResults = new Array(fcDeck.length).fill(null);
  renderFlashcard();
}


// §WORDSEARCH
/* ================================================================
   WORD SEARCH ENGINE
================================================================ */

// Fill alphabet: clean letters only — no X, Q, Z, J, K (avoid odd patterns)
const WS_FILL = 'ADEFGHILMNOPRSTUVWY';

// All 8 orientations as [dx, dy]
const WS_DIRS = {
  right:      [ 1,  0],
  down:       [ 0,  1],
  left:       [-1,  0],   // backwards horizontal
  up:         [ 0, -1],   // backwards vertical
  diagDR:     [ 1,  1],   // diagonal down-right
  diagDL:     [-1,  1],   // diagonal down-left
  diagUR:     [ 1, -1],   // diagonal up-right  (backwards diagonal)
  diagUL:     [-1, -1],   // diagonal up-left   (backwards diagonal)
};

let wsState = {
  chapter: null,
  opts: { backwards: true, diagonal: true },
  grid: [],          // 2D array of letters
  size: 0,
  placed: [],        // [{word, def, cells:[{r,c}], found:false}]
  // interaction
  selecting: false,
  selStart: null,    // {r,c}
  selEnd: null,      // {r,c}
  selCells: [],      // [{r,c}] current drag selection
  foundCells: new Set(), // "r,c" strings of cells belonging to found words
};

/* ── Selector ─────────────────────────────────────────────── */
function openWsSelector(){
  renderChapterSelector('ws-sel-chapters', startWordSearch, true);
  showScreen('ws-sel-screen');
}

function startWordSearch(chKey){
  wsState.chapter = chKey;
  const ch = CHAPTERS[chKey];
  document.getElementById('ws-title').textContent = '🔍 ' + ch.label + ': ' + ch.name;
  showScreen('ws-screen');
  wsBuild();
}

function wsSetOption(key, val){
  wsState.opts[key] = val;
  // Sync toggle button states
  if(key === 'backwards'){
    document.getElementById('ws-tog-back-on').className  = 'ws-tog'+(val?' active':'');
    document.getElementById('ws-tog-back-off').className = 'ws-tog'+(!val?' active':'');
  } else {
    document.getElementById('ws-tog-diag-on').className  = 'ws-tog'+(val?' active':'');
    document.getElementById('ws-tog-diag-off').className = 'ws-tog'+(!val?' active':'');
  }
  wsBuild();
}

/* ── Build puzzle ─────────────────────────────────────────── */
function wsBuild(){
  const ch = CHAPTERS[wsState.chapter];
  if(!ch) return;

  // Get vocab: single uppercase words only, enabled only, sorted longest-first
  const vocab = getVocabForChapter(wsState.chapter)
    .filter(v => /^[A-Z]{3,}$/.test(v.word))
    .sort((a,b) => b.word.length - a.word.length);

  if(vocab.length < 4){
    document.getElementById('ws-grid').innerHTML =
      '<div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;padding:28px;text-align:center;line-height:1.8;">Not enough vocab for this chapter.<br>Need at least 4 single-word terms.</div>';
    document.getElementById('ws-word-list').innerHTML = '';
    return;
  }

  // Pick up to 18 words
  const pool = _wsShuffled(vocab).slice(0, 18);

  // Determine grid size: start at word-length + buffer, grow if needed
  const longestWord = Math.max(...pool.map(v => v.word.length));
  let size = Math.max(longestWord + 4, Math.ceil(Math.sqrt(pool.length * longestWord * 1.6)));
  size = Math.min(size, 22); // cap at 22×22

  let result = null;
  // Try up to 5 times with different shuffles
  for(let attempt = 0; attempt < 5 && !result; attempt++){
    const shuffled = _wsShuffled(pool);
    result = _wsPlace(shuffled, size);
    if(!result && attempt === 2) size = Math.min(size + 2, 24); // grow grid on 3rd attempt
  }

  if(!result){
    // Final fallback: tiny word set
    const tiny = _wsShuffled(pool).slice(0, 8);
    result = _wsPlace(tiny, Math.min(size + 4, 26));
  }

  if(!result){
    document.getElementById('ws-grid').innerHTML =
      '<div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;padding:28px;text-align:center">Could not place words — try toggling options or use a larger word list.</div>';
    return;
  }

  wsState.grid    = result.grid;
  wsState.size    = result.size;
  wsState.placed  = result.placed;
  wsState.foundCells = new Set();
  wsState.selecting = false;
  wsState.selStart = wsState.selEnd = null;
  wsState.selCells = [];

  _wsFillGrid(wsState.grid, wsState.size);
  wsRenderGrid();
  wsRenderWordList();
  wsUpdateCount();
  document.getElementById('ws-def-bar').textContent = 'Click and drag to select a word in the grid.';
  document.getElementById('ws-sub').textContent =
    `${result.placed.length} words hidden in a ${result.size}×${result.size} grid`;
}

/* ── Placement algorithm ──────────────────────────────────── */
function _wsPlace(words, size){
  // Build empty grid
  const grid = Array.from({length: size}, () => Array(size).fill(''));

  // Which directions are allowed?
  const allowedDirs = [];
  allowedDirs.push('right', 'down');
  if(wsState.opts.backwards) allowedDirs.push('left', 'up');
  if(wsState.opts.diagonal)  allowedDirs.push('diagDR', 'diagDL');
  if(wsState.opts.diagonal && wsState.opts.backwards) allowedDirs.push('diagUR', 'diagUL');

  const placed = [];

  for(const vocab of words){
    const word = vocab.word;
    // Collect all valid (x, y, dir) placements
    const candidates = [];
    for(const dir of _wsShuffled(allowedDirs)){
      const [dx, dy] = WS_DIRS[dir];
      // Compute valid starting positions
      // Last cell: (x+(len-1)*dx, y+(len-1)*dy) must be in [0,size)
      for(let r = 0; r < size; r++){
        for(let c = 0; c < size; c++){
          const endR = r + (word.length - 1) * dy;
          const endC = c + (word.length - 1) * dx;
          if(endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
          // Check overlap compatibility
          let overlap = 0;
          let ok = true;
          for(let i = 0; i < word.length; i++){
            const cr = r + i * dy, cc = c + i * dx;
            const existing = grid[cr][cc];
            if(existing === ''){
              // empty — fine
            } else if(existing === word[i]){
              overlap++; // shared letter — bonus
            } else {
              ok = false; break;
            }
          }
          if(ok) candidates.push({r, c, dir, overlap});
        }
      }
    }
    if(!candidates.length) continue; // skip this word if no room

    // Prefer placements with higher overlap (encourages denser puzzles)
    candidates.sort((a,b) => b.overlap - a.overlap + (Math.random() - 0.5) * 0.5);
    const best = candidates[0];
    const [dx, dy] = WS_DIRS[best.dir];
    const cells = [];
    for(let i = 0; i < word.length; i++){
      const cr = best.r + i * dy;
      const cc = best.c + i * dx;
      grid[cr][cc] = word[i];
      cells.push({r: cr, c: cc});
    }
    placed.push({word: vocab.word, def: vocab.def, cells, found: false});
  }

  if(placed.length < Math.min(words.length, 4)) return null;
  return {grid, size, placed};
}

/* ── Fill empty cells with clean letters ─────────────────── */
function _wsFillGrid(grid, size){
  for(let r = 0; r < size; r++){
    for(let c = 0; c < size; c++){
      if(!grid[r][c]){
        grid[r][c] = WS_FILL[Math.floor(Math.random() * WS_FILL.length)];
      }
    }
  }
}

/* ── Render grid ──────────────────────────────────────────── */
function wsRenderGrid(){
  const wrap = document.getElementById('ws-grid');
  const size = wsState.size;
  wrap.style.cssText = `display:grid;grid-template-columns:repeat(${size},32px);gap:2px;`;
  wrap.innerHTML = '';

  for(let r = 0; r < size; r++){
    for(let c = 0; c < size; c++){
      const cell = document.createElement('div');
      cell.className = 'ws-cell';
      cell.id = `wsc-${r}-${c}`;
      cell.textContent = wsState.grid[r][c];

      // Mark already-found cells
      if(wsState.foundCells.has(`${r},${c}`)) cell.classList.add('found');

      cell.addEventListener('mousedown', e => { e.preventDefault(); wsStartSelect(r, c); });
      cell.addEventListener('mouseover', () => { if(wsState.selecting) wsMoveSelect(r, c); });
      cell.addEventListener('touchstart', e => { e.preventDefault(); wsStartSelect(r, c); }, {passive:false});
      cell.addEventListener('touchmove',  e => {
        e.preventDefault();
        const t = e.touches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if(el && el.id && el.id.startsWith('wsc-')){
          const [,tr,tc] = el.id.split('-').map(Number);
          wsMoveSelect(tr, tc);
        }
      }, {passive:false});

      wrap.appendChild(cell);
    }
  }

  document.addEventListener('mouseup', wsEndSelect, {once:false});
  document.addEventListener('touchend', wsEndSelect, {once:false});
}

/* ── Render word list ─────────────────────────────────────── */
function wsRenderWordList(){
  const wrap = document.getElementById('ws-word-list');
  wrap.innerHTML = '';
  wsState.placed.forEach(p => {
    const item = document.createElement('div');
    item.className = 'ws-word-item' + (p.found ? ' found' : '');
    item.id = `wsw-${p.word}`;
    item.innerHTML = `
      <div class="ws-check">${p.found ? '✓' : ''}</div>
      <div>
        <div class="ws-word-text">${p.word}</div>
        <div class="ws-word-def">${esc(p.def)}</div>
      </div>`;
    // Click word → flash its cells and show definition
    item.addEventListener('click', () => wsHintWord(p));
    wrap.appendChild(item);
  });
}

function wsUpdateCount(){
  const found = wsState.placed.filter(p => p.found).length;
  document.getElementById('ws-found-val').textContent = found;
  document.getElementById('ws-total-val').textContent = wsState.placed.length;
}

/* ── Selection interaction ────────────────────────────────── */
function wsStartSelect(r, c){
  wsState.selecting = true;
  wsState.selStart = {r, c};
  wsState.selEnd = {r, c};
  wsState.selCells = [{r, c}];
  wsHighlightSelection();
}

function wsMoveSelect(r, c){
  if(!wsState.selecting) return;
  wsState.selEnd = {r, c};
  // Compute the straight-line cells between start and current
  wsState.selCells = wsGetLineCells(wsState.selStart, {r, c});
  wsHighlightSelection();
}

function wsEndSelect(){
  if(!wsState.selecting) return;
  wsState.selecting = false;
  wsCheckSelection();
  // Clear highlights (found cells keep their class)
  document.querySelectorAll('.ws-cell.selecting').forEach(el => el.classList.remove('selecting'));
  wsState.selCells = [];
}

// Returns cells along a straight line (H, V, or diagonal) from start to end.
// If end is not on a valid straight line, returns just [start].
function wsGetLineCells(start, end){
  const dr = end.r - start.r;
  const dc = end.c - start.c;
  const len = Math.max(Math.abs(dr), Math.abs(dc));
  if(len === 0) return [start];

  // Valid directions: horizontal, vertical, or 45° diagonal
  const isDiag   = Math.abs(dr) === Math.abs(dc);
  const isHoriz  = dr === 0;
  const isVert   = dc === 0;
  if(!isDiag && !isHoriz && !isVert) return [start]; // off-axis — don't show selection

  const stepR = len ? dr / len : 0;
  const stepC = len ? dc / len : 0;
  const cells = [];
  for(let i = 0; i <= len; i++){
    cells.push({r: start.r + Math.round(i * stepR), c: start.c + Math.round(i * stepC)});
  }
  return cells;
}

function wsHighlightSelection(){
  // Clear old selecting highlights
  document.querySelectorAll('.ws-cell.selecting').forEach(el => el.classList.remove('selecting'));
  wsState.selCells.forEach(({r, c}) => {
    const el = document.getElementById(`wsc-${r}-${c}`);
    if(el && !el.classList.contains('found')) el.classList.add('selecting');
  });
}

function wsCheckSelection(){
  if(!wsState.selCells.length) return;
  // Build the selected string
  const selected = wsState.selCells.map(({r, c}) => wsState.grid[r][c]).join('');

  for(const p of wsState.placed){
    if(p.found) continue;
    if(selected === p.word || selected === p.word.split('').reverse().join('')){
      // Make sure cell set matches exactly
      const matches = wsState.selCells.length === p.cells.length &&
        wsState.selCells.every(({r, c}, i) =>
          (p.cells[i].r === r && p.cells[i].c === c) ||
          (p.cells[p.cells.length - 1 - i].r === r && p.cells[p.cells.length - 1 - i].c === c));
      if(!matches) continue;

      p.found = true;
      // Mark cells
      p.cells.forEach(({r, c}) => {
        wsState.foundCells.add(`${r},${c}`);
        const el = document.getElementById(`wsc-${r}-${c}`);
        if(el){ el.classList.remove('selecting'); el.classList.add('found'); }
      });
      // Update word list
      const wItem = document.getElementById(`wsw-${p.word}`);
      if(wItem){
        wItem.classList.add('found');
        wItem.querySelector('.ws-check').textContent = '✓';
      }
      // Show definition
      document.getElementById('ws-def-bar').innerHTML =
        `<span style="color:#f472b6;font-weight:700">${p.word}</span> — ${esc(p.def)}`;
      wsUpdateCount();
      wsCheckComplete();
      return;
    }
  }
}

function wsCheckComplete(){
  const allFound = wsState.placed.every(p => p.found);
  if(!allFound) return;
  setTimeout(() => {
    document.getElementById('ws-def-bar').innerHTML =
      `<span style="color:#34d399;font-weight:700">🏆 Puzzle complete!</span> You found all ${wsState.placed.length} words.`;
    document.getElementById('ws-grid').insertAdjacentHTML('afterend',
      `<div class="ws-complete" style="position:absolute;inset:0;background:rgba(10,12,20,.85);
        display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;border-radius:8px;">
        <div class="ws-complete-title">🏆 Complete!</div>
        <div class="ws-complete-sub" style="margin-bottom:18px">All ${wsState.placed.length} words found</div>
        <button class="ctrl-btn" onclick="wsBuild()" style="background:rgba(244,114,182,.15);border-color:#f472b6;color:#f472b6;">
          🔀 New Puzzle</button>
      </div>`);
  }, 400);
}

function wsRevealAll(){
  wsState.placed.forEach(p => {
    if(p.found) return;
    p.found = true;
    p.cells.forEach(({r, c}) => {
      wsState.foundCells.add(`${r},${c}`);
      const el = document.getElementById(`wsc-${r}-${c}`);
      if(el){ el.classList.remove('selecting'); el.classList.add('found', 'reveal'); }
    });
    const wItem = document.getElementById(`wsw-${p.word}`);
    if(wItem){ wItem.classList.add('found'); wItem.querySelector('.ws-check').textContent = '✓'; }
  });
  wsUpdateCount();
  document.getElementById('ws-def-bar').textContent = 'All words revealed.';
}

// Flash a hint for an unfound word
function wsHintWord(p){
  document.getElementById('ws-def-bar').innerHTML =
    `<span style="color:#f9a8d4;font-weight:700">${p.word}</span> — ${esc(p.def)}`;
  if(p.found) return;
  // Briefly highlight its cells
  p.cells.forEach(({r, c}) => {
    const el = document.getElementById(`wsc-${r}-${c}`);
    if(el){
      el.style.background = 'rgba(244,114,182,.3)';
      el.style.color = '#f9a8d4';
      setTimeout(() => { el.style.background=''; el.style.color=''; }, 900);
    }
  });
}

function _wsShuffled(arr){
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


// §WORDLE
/* ================================================================
   WORDLE ENGINE — Chemistry Wordle
   ─────────────────────────────────────────────────────────────────
   Modes:
     'ions'  — guess the ION NAME from ionBank (e.g. "SULFATE")
     'vocab' — guess the VOCAB WORD from chapter vocab bank

   Word length: variable (4–12 letters). Grid tiles auto-size.
   Guesses: 6 always.
   Hints: after guess 2 → charge/formula; after guess 4 → mnemonic.
   Keyboard: on-screen + physical keyboard.

   State shape: wdlState = {
     mode, word, meta, guesses:[], currentRow, currentInput,
     gameOver, won, hintsShown, streak, bestStreak,
     usedLetters:{}  ← key→'correct'|'present'|'absent'
   }
================================================================ */

let wdlState = null;
const WDL_MAX_GUESSES = 6;

// Persist streak in localStorage
let wdlStreak     = 0;
let wdlBestStreak = 0;
try {
  const s = JSON.parse(localStorage.getItem('chemq_wdl_streak') || '{}');
  wdlStreak     = s.streak     || 0;
  wdlBestStreak = s.best       || 0;
} catch(e){}
function _wdlSaveStreak(){
  try { localStorage.setItem('chemq_wdl_streak', JSON.stringify({streak:wdlStreak, best:wdlBestStreak})); } catch(e){}
}

// ── Entry point ─────────────────────────────────────────────
function startWordle(){
  wdlState = { mode: 'vocab' };
  showScreen('wordle-screen');
  wdlNewGame();
}

function wdlSetMode(mode){
  _wdlSetModeUI(mode);
  wdlNewGame();
}

function _wdlSetModeUI(mode){
  wdlState = wdlState || {};
  wdlState.mode = mode;
  const ionsBtn = document.getElementById('wdl-mode-ions');
  const vocabBtn = document.getElementById('wdl-mode-vocab');
  const elBtn = document.getElementById('wdl-mode-elements');
  if(ionsBtn)  ionsBtn.classList.toggle('active', mode==='ions');
  if(vocabBtn) vocabBtn.classList.toggle('active', mode==='vocab');
  if(elBtn)    elBtn.classList.toggle('active', mode==='elements');
}

// ── Pick a word ──────────────────────────────────────────────
function _wdlPickWord(mode){
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
          mnemonic:        v.mnemonic       || '',
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
    // vocab mode — try active pool first, fall back to full vocabBank
    let vocabPool = (typeof _getActiveVocabPool === 'function')
      ? _getActiveVocabPool('wordle')
      : [];
    // Fallback 1: wordle-eligible vocab from full bank
    if(!vocabPool.length){
      vocabPool = vocabBank.filter(v =>
        v.enabled !== false && v.type !== 'ion' && v.type !== 'element' &&
        v.wordle_eligible !== false
      );
    }
    // Fallback 2: any vocab (ignore wordle_eligible flag)
    if(!vocabPool.length){
      vocabPool = vocabBank.filter(v =>
        v.enabled !== false && v.type !== 'ion' && v.type !== 'element'
      );
    }
    pool = vocabPool.map(v => ({
        word:        v.word,
        displayWord: v.word.toLowerCase(),
        clue:        v.definition,
        meta: {
          type:            'vocab',
          formula:         '',
          charge:          '',
          category:        v.category || '',
          mnemonic:        v.mnemonic || '',
          commonCompounds: '',
        },
      }));
  }

  if(!pool.length) return null;
  const prev     = wdlState?.word;
  const filtered = pool.length > 1 ? pool.filter(p => p.word !== prev) : pool;
  return filtered[Math.floor(Math.random() * filtered.length)];
}
// ── New game ─────────────────────────────────────────────────
function wdlNewGame(){
  const mode = 'vocab';
  if(!wdlState) wdlState = { mode };
  wdlState.mode = mode;
  const picked = _wdlPickWord(mode);
  if(!picked){
    document.getElementById('wdl-body').innerHTML = `
      <div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;text-align:center;padding:40px;line-height:1.9;">
        📖 No vocab words found.<br>Import a vocab.csv via ✎ Manage Questions → ⬆ Vocab CSV.
      </div>`;
    return;
  }

  wdlState = {
    mode,
    word: picked.word,        // uppercase, letters only, e.g. "SULFATE"
    displayWord: picked.displayWord,
    clue: picked.clue,
    meta: picked.meta,
    guesses: [],              // array of {guess:string, result:[...]}
    currentRow: 0,
    currentInput: [],         // letters typed so far
    gameOver: false,
    won: false,
    hintsShown: 0,            // 0=none, 1=formula/charge shown, 2=mnemonic shown
    usedLetters: {},          // letter → 'correct'|'present'|'absent'
  };

  _wdlRender();
  _wdlAttachKeyboard();
  _wdlUpdateStreakHdr();
}

// ── Render ───────────────────────────────────────────────────
function _wdlRender(){
  const s = wdlState;
  if(!s) return;
  const wordLen = s.word.length;             // total chars incl. spaces
  const letterLen = s.word.replace(/ /g,'').length; // only letter positions
  const tileSize = letterLen <= 6 ? 52 : letterLen <= 9 ? 44 : 38;
  const fontSize = letterLen <= 6 ? '1.3rem' : letterLen <= 9 ? '1.1rem' : '.95rem';

  const body = document.getElementById('wdl-body');
  body.innerHTML = '';

  // ── Clue card
  const clueCard = document.createElement('div');
  clueCard.className = 'wdl-clue-card';
  let propsHTML = '';
  if(s.meta.type === 'ion'){
    if(s.hintsShown >= 1 || s.guesses.length >= 2){
      propsHTML += `<span class="wdl-prop wdl-prop-ion">Formula: ${esc(s.meta.formula)}</span>`;
      propsHTML += `<span class="wdl-prop wdl-prop-charge">Charge: ${esc(s.meta.charge)}</span>`;
      if(s.meta.category) propsHTML += `<span class="wdl-prop wdl-prop-cat">${esc(s.meta.category)}</span>`;
      s.hintsShown = Math.max(s.hintsShown, 1);
    }
    if(s.hintsShown >= 2 || s.guesses.length >= 4){
      if(s.meta.mnemonic) propsHTML += `<span class="wdl-prop" style="background:rgba(245,200,66,.1);color:var(--gold);border:1px solid rgba(245,200,66,.25);">💡 ${esc(s.meta.mnemonic)}</span>`;
      s.hintsShown = Math.max(s.hintsShown, 2);
    }
  }
  const guessesLeft = WDL_MAX_GUESSES - s.guesses.length;
  const hintTeaser = s.meta.type==='ion' && s.hintsShown < 1 && !s.gameOver
    ? `<div class="wdl-hint-unlock" onclick="_wdlShowHint()">💡 Reveal formula & charge hint</div>` : '';
  const hint2teaser = s.meta.type==='ion' && s.hintsShown >= 1 && s.hintsShown < 2 && !s.gameOver
    ? `<div class="wdl-hint-unlock" onclick="_wdlShowHint2()">💡 Reveal mnemonic hint</div>` : '';

  clueCard.innerHTML = `
    <div class="wdl-clue-label">${s.meta.type === 'ion' ? 'Ion clue' : 'Vocab clue'}</div>
    <div class="wdl-clue-text">${esc(s.clue)}</div>
    ${propsHTML ? `<div class="wdl-clue-props">${propsHTML}</div>` : ''}
    ${hintTeaser}${hint2teaser}`;
  body.appendChild(clueCard);

  // ── Word length hint
  const lenHint = document.createElement('div');
  lenHint.className = 'wdl-length-hint';
  lenHint.textContent = `${letterLen} letter${letterLen!==1?'s':''} · ${WDL_MAX_GUESSES - s.guesses.length} guess${WDL_MAX_GUESSES-s.guesses.length!==1?'es':''} remaining`;
  body.appendChild(lenHint);

  // ── Guess grid
  const grid = document.createElement('div');
  grid.className = 'wdl-grid';
  grid.id = 'wdl-grid';

  for(let r = 0; r < WDL_MAX_GUESSES; r++){
    const row = document.createElement('div');
    row.className = 'wdl-row';
    row.id = `wdl-row-${r}`;

    // Build an index mapping: tilePos (0..wordLen-1) → letterIdx (0..letterLen-1)
    // Space positions have letterIdx = -1
    let letterIdx = 0;
    const tileLetterIdx = s.word.split('').map(ch => ch === ' ' ? -1 : letterIdx++);

    for(let c = 0; c < wordLen; c++){
      const isSpace = s.word[c] === ' ';
      const tile = document.createElement('div');
      tile.id = `wdl-tile-${r}-${c}`;

      if(isSpace){
        tile.className = 'wdl-tile wdl-space';
        tile.style.cssText = `width:${Math.round(tileSize*0.4)}px;height:${tileSize}px;`;
      } else {
        tile.className = 'wdl-tile';
        tile.style.cssText = `width:${tileSize}px;height:${tileSize}px;font-size:${fontSize};`;
        const li = tileLetterIdx[c];
        if(r < s.guesses.length){
          // Committed guess — g.guess is packed (no spaces), index by letterIdx
          const g = s.guesses[r];
          tile.textContent = g.guess[li] || '';
          tile.dataset.state = g.result[li] || 'absent';
          tile.classList.add('flip');
          tile.style.animationDelay = `${li * 80}ms`;
        } else if(r === s.currentRow && !s.gameOver){
          // Active row — currentInput is packed letters
          tile.textContent = s.currentInput[li] || '';
          tile.classList.toggle('filled', !!s.currentInput[li]);
          tile.classList.add('active-row');
        }
      }
      row.appendChild(tile);
    }
    grid.appendChild(row);
  }
  body.appendChild(grid);

  // ── Result card (if game over)
  if(s.gameOver){
    const resultCard = document.createElement('div');
    resultCard.className = 'wdl-result';
    const won = s.won;
    resultCard.innerHTML = `
      <div class="wdl-result-verdict" style="color:${won?'var(--green)':'var(--red)'}">
        ${won ? '🎉 Correct!' : '💀 Game Over'}
      </div>
      <div class="wdl-result-word">${s.displayWord.toUpperCase()}</div>
      <div class="wdl-result-props">
        ${s.meta.formula  ? `<div class="wdl-result-prop-row"><span class="wdl-result-prop-lbl">Formula</span>${esc(s.meta.formula)}</div>` : ''}
        ${s.meta.charge   ? `<div class="wdl-result-prop-row"><span class="wdl-result-prop-lbl">Charge</span>${esc(s.meta.charge)}</div>` : ''}
        ${s.meta.category ? `<div class="wdl-result-prop-row"><span class="wdl-result-prop-lbl">Type</span>${esc(s.meta.category)}</div>` : ''}
        ${s.meta.mnemonic ? `<div class="wdl-result-prop-row"><span class="wdl-result-prop-lbl">Mnemonic</span><em style="color:var(--gold)">${esc(s.meta.mnemonic)}</em></div>` : ''}
        ${s.meta.commonCompounds ? `<div class="wdl-result-prop-row"><span class="wdl-result-prop-lbl">In compounds</span><span style="font-family:var(--mono);font-size:.72rem;color:var(--cyan)">${esc(s.meta.commonCompounds.replace(/\|/g,', '))}</span></div>` : ''}
      </div>
      <div class="wdl-streak" style="margin:4px 0;">
        Streak: <b>${wdlStreak}</b> · Best: <b>${wdlBestStreak}</b>
      </div>
      <div class="wdl-result-btns">
        <button class="wdl-r-btn wdl-r-next" onclick="wdlNewGame()">▶ Next Word</button>
        <button class="wdl-r-btn wdl-r-hub" onclick="showHub()">← Hub</button>
      </div>`;
    body.appendChild(resultCard);
  } else {
    // ── On-screen keyboard
    body.appendChild(_wdlBuildKeyboard());
  }
}

function _wdlShowHint() { wdlState.hintsShown = Math.max(wdlState.hintsShown, 1); _wdlRender(); }
function _wdlShowHint2(){ wdlState.hintsShown = Math.max(wdlState.hintsShown, 2); _wdlRender(); }

// ── On-screen keyboard ────────────────────────────────────────
const WDL_ROWS = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
function _wdlBuildKeyboard(){
  const kb = document.createElement('div');
  kb.className = 'wdl-keyboard';
  kb.id = 'wdl-keyboard';
  WDL_ROWS.forEach((row, ri) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'wdl-key-row';
    if(ri === 2){
      const enter = _wdlKey('ENTER','ENTER','wide');
      rowEl.appendChild(enter);
    }
    row.split('').forEach(letter => {
      rowEl.appendChild(_wdlKey(letter, letter));
    });
    if(ri === 2){
      rowEl.appendChild(_wdlKey('⌫','BACKSPACE','wide'));
    }
    kb.appendChild(rowEl);
  });
  return kb;
}

function _wdlKey(label, value, extra=''){
  const btn = document.createElement('button');
  btn.className = 'wdl-key' + (extra ? ' '+extra : '');
  btn.textContent = label;
  btn.dataset.key = value;
  // Apply used-letter colour
  const state = wdlState?.usedLetters?.[value];
  if(state) btn.dataset.state = state;
  btn.addEventListener('click', () => _wdlHandleKey(value));
  return btn;
}

// ── Keyboard input ────────────────────────────────────────────
function _wdlAttachKeyboard(){
  // Remove old listener by replacing with bound ref stored on window
  if(window._wdlKeyHandler) document.removeEventListener('keydown', window._wdlKeyHandler);
  window._wdlKeyHandler = (e) => {
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(e.key === 'Enter')     { e.preventDefault(); _wdlHandleKey('ENTER'); }
    else if(e.key === 'Backspace'){ e.preventDefault(); _wdlHandleKey('BACKSPACE'); }
    else if(/^[a-zA-Z]$/.test(e.key)){ _wdlHandleKey(e.key.toUpperCase()); }
  };
  document.addEventListener('keydown', window._wdlKeyHandler);
}

function _wdlHandleKey(key){
  const s = wdlState;
  if(!s || s.gameOver) return;
  const letterLen = s.word.replace(/ /g,'').length;

  if(key === 'BACKSPACE'){
    if(s.currentInput.length > 0){ s.currentInput.pop(); _wdlUpdateActiveTiles(); }
    return;
  }
  if(key === 'ENTER'){
    _wdlSubmitGuess();
    return;
  }
  if(s.currentInput.length < letterLen && /^[A-Z]$/.test(key)){
    s.currentInput.push(key);
    _wdlUpdateActiveTiles();
    // Pop animation on filled tile — find the tile position for this letter index
    const li = s.currentInput.length - 1;
    let letterIdx = 0;
    for(let c = 0; c < s.word.length; c++){
      if(s.word[c] === ' ') continue;
      if(letterIdx === li){
        const tile = document.getElementById(`wdl-tile-${s.currentRow}-${c}`);
        if(tile){ tile.classList.remove('pop'); void tile.offsetWidth; tile.classList.add('pop'); }
        break;
      }
      letterIdx++;
    }
  }
}

function _wdlUpdateActiveTiles(){
  const s = wdlState;
  const wordLen = s.word.length;
  let letterIdx = 0;
  for(let c = 0; c < wordLen; c++){
    if(s.word[c] === ' ') continue;
    const li = letterIdx++;
    const tile = document.getElementById(`wdl-tile-${s.currentRow}-${c}`);
    if(!tile) continue;
    tile.textContent = s.currentInput[li] || '';
    tile.classList.toggle('filled', !!s.currentInput[li]);
  }
}

// ── Submit a guess ────────────────────────────────────────────
function _wdlSubmitGuess(){
  const s = wdlState;
  const wordLen   = s.word.length;
  const letterLen = s.word.replace(/ /g,'').length;
  if(s.currentInput.length !== letterLen){
    _wdlShakeRow(s.currentRow);
    _wdlToast(`Need ${letterLen} letters`);
    return;
  }
  const guess      = s.currentInput.join('');           // packed, no spaces
  const wordPacked = s.word.replace(/ /g,'');            // target, no spaces
  const result     = _wdlEvaluate(guess, wordPacked);

  s.guesses.push({ guess, result });
  s.currentRow++;
  s.currentInput = [];

  // Update used-letters map (don't downgrade: correct > present > absent)
  const rank = { correct:3, present:2, absent:1 };
  guess.split('').forEach((letter, i) => {
    const cur = s.usedLetters[letter];
    const newState = result[i];
    if(!cur || rank[newState] > rank[cur]) s.usedLetters[letter] = newState;
  });

  const won = result.every(r => r === 'correct');
  if(won || s.currentRow >= WDL_MAX_GUESSES){
    s.gameOver = true;
    s.won = won;
    if(won){ wdlStreak++; wdlBestStreak = Math.max(wdlBestStreak, wdlStreak); }
    else    { wdlStreak = 0; }
    _wdlSaveStreak();
    // Small delay so flip animation plays before result card appears
    setTimeout(() => { _wdlRender(); _wdlUpdateStreakHdr(); }, letterLen * 80 + 350);
  } else {
    // Hint auto-unlock after guess 2 and 4
    if(s.guesses.length >= 2) s.hintsShown = Math.max(s.hintsShown, 1);
    if(s.guesses.length >= 4) s.hintsShown = Math.max(s.hintsShown, 2);
    setTimeout(() => { _wdlRender(); }, letterLen * 80 + 50);
  }

  // Immediately update committed tiles with flip animation (skip space tiles)
  let letterIdx = 0;
  for(let c = 0; c < wordLen; c++){
    if(s.word[c] === ' ') continue;
    const li = letterIdx++;
    const tile = document.getElementById(`wdl-tile-${s.currentRow-1}-${c}`);
    if(!tile) continue;
    tile.style.animationDelay = `${li*80}ms`;
    tile.dataset.state = result[li];
    tile.classList.add('flip');
  }
}

// ── Evaluate guess ────────────────────────────────────────────
// Standard Wordle algorithm: correct first, then present (no double-counting)
function _wdlEvaluate(guess, word){
  const result = Array(word.length).fill('absent');
  const wordArr  = word.split('');
  const guessArr = guess.split('');
  const remaining = [...wordArr];

  // Pass 1: mark correct
  guessArr.forEach((l, i) => {
    if(l === wordArr[i]){ result[i] = 'correct'; remaining[i] = null; }
  });
  // Pass 2: mark present
  guessArr.forEach((l, i) => {
    if(result[i] === 'correct') return;
    const idx = remaining.indexOf(l);
    if(idx !== -1){ result[i] = 'present'; remaining[idx] = null; }
  });
  return result;
}

function _wdlShakeRow(row){
  const rowEl = document.getElementById(`wdl-row-${row}`);
  if(!rowEl) return;
  rowEl.querySelectorAll('.wdl-tile').forEach(t => {
    t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
  });
}

// ── Toast notification ────────────────────────────────────────
let _wdlToastTimer = null;
function _wdlToast(msg){
  const el = document.getElementById('wdl-toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_wdlToastTimer);
  _wdlToastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ── Streak header ─────────────────────────────────────────────
function _wdlUpdateStreakHdr(){
  const el = document.getElementById('wdl-streak-hdr');
  if(el) el.innerHTML = `🔥 <b>${wdlStreak}</b> streak · best <b>${wdlBestStreak}</b>`;
}

// §CONNECTIONS
/* ================================================================
   CONNECTIONS ENGINE
   ─────────────────────────────────────────────────────────────────
   Data source: vocabBank entries with connections_group set.
   Groups 4 categories of 4 words each (16 words total) from the
   same chapter. Categories are the connections_group values.

   State:
     connState = {
       chapter, groups:[{label,words:[],colorIdx,solved}],
       tiles:[{word,group,solved}], selected:Set<word>,
       mistakes:0, maxMistakes:4, gameOver:bool, won:bool
     }
================================================================ */

const CONN_MAX_MISTAKES = 4;
const CONN_EMOJIS = ['🟨','🟩','🟦','🟪']; // per colorIdx

let connState = null;

// ── Entry point ──────────────────────────────────────────────
function startConnections(){
  showScreen('conn-screen');
  connNewGame();
}

function connNewGame(){
  // Use a custom board if one has been set by the board builder
  if(window._activeConnBoard){
    const board = window._activeConnBoard;
    window._activeConnBoard = null; // consume it
    const groups = board.groups.map((g,i) => ({
      label: g.label,
      words: _shuffle([...g.words]).slice(0,4),
      colorIdx: g.colorIdx !== undefined ? g.colorIdx : i,
      solved: false,
    }));
    const allTiles = _shuffle(groups.flatMap(g => g.words.map(w => ({word:w, group:g.label, solved:false}))));
    connState = {
      chapter: 'custom',
      chapterLabel: board.name,
      groups, tiles: allTiles,
      selected: new Set(),
      mistakes: 0, maxMistakes: CONN_MAX_MISTAKES,
      gameOver: false, won: false, solvedGroups: [],
    };
    document.getElementById('conn-chapter-lbl').textContent = board.name;
    _connRender();
    return;
  }

  // Build puzzle from vocabBank using connections_group
  const puzzle = _connBuildPuzzle();
  if(!puzzle){
    document.getElementById('conn-body').innerHTML = `
      <div style="color:var(--muted);font-family:var(--mono);font-size:.8rem;text-align:center;padding:40px;line-height:1.9;">
        📖 Not enough grouped vocab to build a puzzle.<br>
        Need at least 4 categories with 4 words each in your vocab.csv.<br>
        Make sure the <b>connections_category</b> column is filled in.
      </div>`;
    return;
  }

  // Assign colour indices by difficulty (shuffle group order for variety)
  const shuffledGroups = puzzle.groups.slice().sort(() => Math.random() - 0.5);
  shuffledGroups.forEach((g, i) => { g.colorIdx = i; });

  // Flatten & shuffle tiles
  const allTiles = shuffledGroups.flatMap(g => g.words.map(w => ({word:w, group:g.label, solved:false})));
  _shuffle(allTiles);

  connState = {
    chapter: puzzle.chapter,
    chapterLabel: puzzle.chapterLabel,
    groups: shuffledGroups,
    tiles: allTiles,
    selected: new Set(),
    mistakes: 0,
    maxMistakes: CONN_MAX_MISTAKES,
    gameOver: false,
    won: false,
    solvedGroups: [],
  };

  document.getElementById('conn-chapter-lbl').textContent = puzzle.chapterLabel || '';
  _connRender();
}

// ── Build puzzle from vocabBank ───────────────────────────────
function _connBuildPuzzle(){
  // Collect all vocab with a connections_group
  const byGroup = {};
  const chapterByGroup = {};

  // Prefer selected chapters via vocabSelections; fall back to all vocab
  const selChapters = studyPlan.vocabSelections?.chapters || studyPlan.selections.map(s => s.chKey);
  const activePool  = (typeof _getActiveVocabPool === 'function')
    ? _getActiveVocabPool()
    : allVocab().filter(v => selChapters.includes(v.chapter));

  activePool.forEach(v => {
    if(!v.connections_group || v.enabled === false) return;
    if(!byGroup[v.connections_group]) byGroup[v.connections_group] = [];
    byGroup[v.connections_group].push(v.word);
    chapterByGroup[v.connections_group] = v.chapter;
  });

  // Filter to groups with at least 4 words
  const validGroups = Object.keys(byGroup).filter(g => byGroup[g].length >= 4);
  if(validGroups.length < 4) {
    // Try without chapter filter
    if(selChapters) {
      const allByGroup = {};
      allVocab().forEach(v => {
        if(!v.connections_group || v.enabled === false) return;
        if(!allByGroup[v.connections_group]) allByGroup[v.connections_group] = [];
        allByGroup[v.connections_group].push(v.word);
        chapterByGroup[v.connections_group] = v.chapter;
      });
      const allValid = Object.keys(allByGroup).filter(g => allByGroup[g].length >= 4);
      if(allValid.length < 4) return null;
      Object.assign(byGroup, allByGroup);
      const chosen = _shuffle(allValid).slice(0, 4);
      return _connMakeGroups(chosen, byGroup, chapterByGroup);
    }
    return null;
  }

  // Pick 4 groups at random, prefer groups from the same chapter for coherence
  // Group by chapter
  const byChapter = {};
  validGroups.forEach(g => {
    const ch = chapterByGroup[g] || 'unknown';
    if(!byChapter[ch]) byChapter[ch] = [];
    byChapter[ch].push(g);
  });

  // Try to find a chapter with 4+ valid groups
  const chapters = Object.keys(byChapter).filter(ch => byChapter[ch].length >= 4);
  let chosen, chosenCh;
  if(chapters.length){
    // Prefer selected chapters
    const preferred = selChapters ? chapters.filter(c => selChapters.includes(c)) : chapters;
    chosenCh = preferred.length ? preferred[Math.floor(Math.random()*preferred.length)] : chapters[Math.floor(Math.random()*chapters.length)];
    chosen = _shuffle(byChapter[chosenCh]).slice(0, 4);
  } else {
    // Mix from multiple chapters
    chosen = _shuffle(validGroups).slice(0, 4);
    chosenCh = null;
  }

  return _connMakeGroups(chosen, byGroup, chapterByGroup, chosenCh);
}

function _connMakeGroups(chosen, byGroup, chapterByGroup, chosenCh){
  const groups = chosen.map(g => ({
    label: g,
    words: _shuffle(byGroup[g]).slice(0, 4),
    colorIdx: 0,
    solved: false,
  }));
  // Find chapter label
  const ch = chosenCh || chapterByGroup[chosen[0]];
  const chObj = CHAPTERS[ch];
  return {
    chapter: ch,
    chapterLabel: chObj ? `${chObj.label}: ${chObj.name}` : ch,
    groups,
  };
}

// ── Render ───────────────────────────────────────────────────
function _connRender(){
  const s = connState;
  const body = document.getElementById('conn-body');
  body.innerHTML = '';

  // Solved group banners (top)
  s.solvedGroups.forEach(g => {
    const row = document.createElement('div');
    row.className = `conn-solved-row conn-c${g.colorIdx}`;
    row.innerHTML = `
      <div class="conn-solved-title">${_connFmtLabel(g.label)}</div>
      <div class="conn-solved-words">${g.words.join(', ')}</div>`;
    body.appendChild(row);
  });

  if(s.gameOver){
    _connRenderResult(body);
    return;
  }

  // Mistake dots
  const dots = document.createElement('div');
  dots.className = 'conn-mistakes';
  dots.innerHTML = '<span>Mistakes:</span>' +
    Array.from({length: s.maxMistakes}, (_,i) =>
      `<div class="conn-dot${i < s.mistakes ? ' used' : ''}"></div>`
    ).join('');
  body.appendChild(dots);

  // Tile grid (only unsolved tiles)
  const grid = document.createElement('div');
  grid.className = 'conn-grid';
  s.tiles.filter(t => !t.solved).forEach(t => {
    const tile = document.createElement('div');
    tile.className = 'conn-tile' + (s.selected.has(t.word) ? ' selected' : '');
    tile.textContent = t.word;
    tile.dataset.word = t.word;
    tile.addEventListener('click', () => _connToggle(t.word));
    grid.appendChild(tile);
  });
  body.appendChild(grid);

  // One-away hint
  if(s._oneAway){
    const hint = document.createElement('div');
    hint.style.cssText = 'font-family:var(--mono);font-size:.68rem;color:var(--gold);text-align:center;';
    hint.textContent = '🔥 One away!';
    body.appendChild(hint);
    s._oneAway = false;
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'conn-actions';
  actions.innerHTML = `
    <button class="conn-btn conn-btn-shuffle" onclick="_connShuffle()">🔀 Shuffle</button>
    <button class="conn-btn conn-btn-deselect" onclick="_connDeselect()">Deselect All</button>
    <button class="conn-btn conn-btn-submit" id="conn-submit-btn"
      onclick="_connSubmit()" ${s.selected.size !== 4 ? 'disabled' : ''}>Submit</button>`;
  body.appendChild(actions);
}

function _connRenderResult(body){
  const s = connState;
  const won = s.won;
  const emoji = s.solvedGroups.map(g =>
    CONN_EMOJIS[g.colorIdx].repeat(4)
  ).join('\n');

  const result = document.createElement('div');
  result.className = 'conn-result';
  result.innerHTML = `
    <div class="conn-result-title" style="color:${won?'var(--green)':'var(--red)'}">
      ${won ? '🎉 Solved!' : '💀 Better luck next time'}
    </div>
    <div class="conn-result-sub">
      ${won ? `Solved with ${s.mistakes} mistake${s.mistakes!==1?'s':''}!`
             : `The categories were:` }
    </div>`;

  // Show all groups with their colours
  s.groups.forEach(g => {
    const row = document.createElement('div');
    row.className = `conn-solved-row conn-c${g.colorIdx}`;
    row.style.cssText = 'width:100%;margin-bottom:6px;';
    row.innerHTML = `
      <div class="conn-solved-title">${_connFmtLabel(g.label)}</div>
      <div class="conn-solved-words">${g.words.join(', ')}</div>`;
    result.appendChild(row);
  });

  // Emoji share grid
  const emojiDiv = document.createElement('div');
  emojiDiv.className = 'conn-emoji-grid';
  s.solvedGroups.forEach(g => {
    emojiDiv.appendChild(Object.assign(document.createElement('div'), {textContent: CONN_EMOJIS[g.colorIdx].repeat(4)}));
  });
  // Fill remaining rows with grey if lost
  const remaining = 4 - s.solvedGroups.length;
  for(let i=0;i<remaining;i++){
    emojiDiv.appendChild(Object.assign(document.createElement('div'), {textContent: '⬛⬛⬛⬛'}));
  }
  result.appendChild(emojiDiv);

  const btns = document.createElement('div');
  btns.className = 'conn-actions';
  btns.innerHTML = `
    <button class="conn-btn conn-btn-submit" onclick="connNewGame()">▶ New Game</button>
    <button class="conn-btn conn-btn-shuffle" onclick="showHub()">← Hub</button>`;
  result.appendChild(btns);
  body.appendChild(result);
}

// ── Interaction ───────────────────────────────────────────────
function _connToggle(word){
  const s = connState;
  if(s.gameOver) return;
  if(s.selected.has(word)){
    s.selected.delete(word);
  } else {
    if(s.selected.size >= 4) return; // max 4
    s.selected.add(word);
  }
  _connRender();
}

function _connShuffle(){
  _shuffle(connState.tiles);
  _connRender();
}

function _connDeselect(){
  connState.selected.clear();
  _connRender();
}

function _connSubmit(){
  const s = connState;
  if(s.selected.size !== 4 || s.gameOver) return;
  const sel = [...s.selected];

  // Check if all 4 belong to the same group
  const matchGroup = s.groups.find(g =>
    !g.solved && sel.every(w => g.words.includes(w))
  );

  if(matchGroup){
    // Correct!
    matchGroup.solved = true;
    sel.forEach(w => {
      const tile = s.tiles.find(t => t.word === w);
      if(tile) tile.solved = true;
    });
    s.solvedGroups.push(matchGroup);
    s.selected.clear();
    spTrackResult({q:`Connections: ${matchGroup.label}`, chapter:s.chapter, cat:'connections', id:`conn-${matchGroup.label}`}, true, 'connections');

    if(s.solvedGroups.length === 4){
      s.gameOver = true;
      s.won = true;
    }
  } else {
    // Wrong — check for one-away
    const oneAway = s.groups.some(g =>
      !g.solved && sel.filter(w => g.words.includes(w)).length === 3
    );
    s._oneAway = oneAway;
    s.mistakes++;
    spTrackResult({q:`Connections guess: ${sel.join(', ')}`, chapter:s.chapter, cat:'connections', id:`conn-miss`}, false, 'connections');

    // Shake animation
    _connRender();
    sel.forEach(w => {
      const el = document.querySelector(`.conn-tile[data-word="${CSS.escape(w)}"]`);
      if(el){ el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    });

    if(s.mistakes >= s.maxMistakes){
      setTimeout(() => {
        s.gameOver = true;
        s.won = false;
        // Auto-solve remaining
        s.groups.filter(g=>!g.solved).forEach(g => {
          g.solved = true;
          g.words.forEach(w => { const t = s.tiles.find(t=>t.word===w); if(t) t.solved=true; });
          s.solvedGroups.push(g);
        });
        _connRender();
      }, 600);
    }
  }

  _connRender();
}

// ── Helpers ───────────────────────────────────────────────────
function _shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function _connFmtLabel(label){
  // Convert kebab-case to Title Case
  return label.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

// ── launchGame hook (see _dispatchGame above) ──

// Re-initialise session bar after DOM is fully parsed
document.addEventListener('DOMContentLoaded', () => { _updateSessionBar(); });
