/* ================================================================
   cr-data.js — ChemReview Data Layer
   ─────────────────────────────────────────────────────────────────
   CONTENTS (in order):
     §DATA_LAYER   CHAPTERS registry + rebuild logic
     §STATE        customBank, vocabBank, gameState, activeSelections
     §CSV_IMPORT   Import / export questions CSV
     §VOCAB_CSV    Import / export unified vocab CSV (vocab|ion|element)
     §LEGACY_STUBS clearIons / clearElements stubs
     §VOCAB_ACCESS allVocab(), activeVocab(), getWordlePool()
     §TOPIC_REASSIGN  Move topic between chapters (updates IDs)

   DEPENDENCIES:  None (pure data, no DOM)
   CONSUMERS:     All other cr-*.js files

   KEY GLOBALS EXPORTED:
     CHAPTERS          — runtime chapter registry (rebuilt on every import)
     customBank        — imported questions array (persisted in localStorage)
     vocabBank         — imported vocab/ion/element array (localStorage)
     activeSelections  — [{chKey, topicKey}] set by planner before launching a game
     activeChapter     — legacy single-chapter key (kept for compat)
     activeTopic       — legacy single-topic key
     studyPlan         — { selections, results, performance, earnings, achievements }
     allQ()            — returns customBank (all imported questions)
     boardQ()          — filters allQ() by activeSelections
     boardCats()       — unique categories from boardQ()
     activeVocab(ch)   — enabled vocab entries for a chapter key or object
     allVocab(filter)  — all enabled vocabBank entries, optionally filtered
     getWordlePool(mode) — wordle-ready word objects from vocabBank
     rebuildChapters() — call after any import/clear/reassign
     importCSV(file)   — questions CSV file input handler
     importVocabCSV(file) — vocab CSV file input handler
     exportCSV()       — download questions CSV
     exportVocabCSV()  — download vocab CSV
     clearImported()   — wipe questions bank
     clearVocab()      — wipe vocab bank
     reassignTopic(...)  — move topic to a different chapter
================================================================ */

// §DATA_LAYER
/* ================================================================
   DATA LAYER — fully dynamic, driven by imported CSVs
================================================================ */

// Runtime chapter registry — built from imported data, never hardcoded.
// Shape: { [chKey]: { label, name, icon, color, order, topics: { [topicKey]: { label, icon, cats:[] } }, vocab:[] } }
let CHAPTERS = {};

// Stable colour palette cycled for auto-generated chapters
const CH_COLORS = ['#3d8bff','#a855f7','#22c55e','#f5c842','#ef4444','#06b6d4',
                   '#ff8c42','#e879f9','#34d399','#fb923c','#818cf8','#f472b6',
                   '#facc15','#4ade80','#38bdf8'];
const CH_ICONS  = ['🧪','🧫','⚗️','🔬','📐','🧲','💡','🌡️','⚡','🧬','💎','🌊','🔥','❄️','🎯'];

// Chapter sort order derived from label — "Chapter 9" → 9, "Chapter 10" → 10
function chSortKey(ch){ const m = ch.label.match(/\d+/); return m ? parseInt(m[0]) : 999; }

// Rebuild CHAPTERS entirely from imported question + vocab banks.
// Called after every import/clear/reassign.
function rebuildChapters(){
  const palette = (arr, i) => arr[i % arr.length];
  const newCh = {};

  // 1. Pass over questions to discover all chapter/topic/cat combos
  allQ().forEach(q => {
    const chKey  = q.chapter  || 'unknown';
    const tKey   = q.topic    || 'general';
    const cat    = q.cat      || 'General';

    if(!newCh[chKey]){
      // Count existing chapters to assign palette index
      const idx = Object.keys(newCh).length;
      newCh[chKey] = {
        label:  q.chapter_label || _guessChLabel(chKey),
        name:   q.chapter_name  || _guessChName(chKey),
        icon:   q.chapter_icon  || palette(CH_ICONS,  idx),
        color:  palette(CH_COLORS, idx),
        order:  _chOrder(q.chapter_label || chKey),
        topics: {},
        vocab:  [],
      };
    }
    const ch = newCh[chKey];
    // Keep better label/name/icon if available on later rows
    if(q.chapter_label) ch.label = q.chapter_label;
    if(q.chapter_name)  ch.name  = q.chapter_name;
    if(q.chapter_icon)  ch.icon  = q.chapter_icon;

    if(!ch.topics[tKey]){
      ch.topics[tKey] = {
        label: q.topic_label || _guessTopicLabel(tKey),
        icon:  q.topic_icon  || '⚗️',
        cats:  [],
      };
    }
    const topic = ch.topics[tKey];
    if(q.topic_label) topic.label = q.topic_label;
    if(q.topic_icon)  topic.icon  = q.topic_icon;
    if(cat && !topic.cats.includes(cat)) topic.cats.push(cat);
  });

  // 2. Pass over unified vocabBank (type=vocab|ion|element) to register chapters/topics
  vocabBank.forEach(v => {
    const chKey = v.chapter || 'unknown';
    const tKey  = v.topic   || 'general';
    if(!newCh[chKey]){
      const idx = Object.keys(newCh).length;
      newCh[chKey] = {
        label:  v.chapter_label || _guessChLabel(chKey),
        name:   v.chapter_name  || _guessChName(chKey),
        icon:   v.chapter_icon  || palette(CH_ICONS,  idx),
        color:  palette(CH_COLORS, idx),
        order:  _chOrder(v.chapter_label || chKey),
        topics: {},
        vocab:  [],
      };
    }
    const ch = newCh[chKey];
    if(v.chapter_label) ch.label = v.chapter_label;
    if(v.chapter_name)  ch.name  = v.chapter_name;
    if(v.chapter_icon)  ch.icon  = v.chapter_icon;
    // Register topic so vocab-only chapters appear in all game selectors
    if(!ch.topics[tKey]){
      ch.topics[tKey] = {
        label: v.topic_label || _guessTopicLabel(tKey),
        icon:  v.topic_icon  || '⚗️',
        cats:  [],
      };
    }
    if(v.topic_label) ch.topics[tKey].label = v.topic_label;
    if(v.topic_icon)  ch.topics[tKey].icon  = v.topic_icon;
    // Attach to vocab array (used by crossword, flashcards, WOF, word search)
    if(v.word && v.definition && v.enabled !== false){
      if(!ch.vocab.find(x => x.word === v.word)){
        ch.vocab.push({ word: v.word, def: v.definition, enabled: true, type: v.type||'vocab' });
      }
    }
  });

  // 3. Sort chapters by numeric order in label
  CHAPTERS = Object.fromEntries(
    Object.entries(newCh).sort((a,b) => a[1].order - b[1].order)
  );
}

function _chOrder(labelOrKey){
  const m = String(labelOrKey).match(/\d+/);
  return m ? parseInt(m[0]) : 999;
}
function _guessChLabel(key){
  // "ch9" → "Chapter 9", "ch10" → "Chapter 10", else title-case the key
  const m = key.match(/^ch(\d+)$/i);
  return m ? `Chapter ${m[1]}` : key.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function _guessChName(key){
  return key.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function _guessTopicLabel(key){
  return key.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

// Helper: get sorted chapter entries
function chEntries(){ return Object.entries(CHAPTERS).sort((a,b)=>a[1].order-b[1].order); }
// Helper: get all known topic keys across all chapters
function allTopicKeys(){
  const set = new Set();
  Object.values(CHAPTERS).forEach(ch => Object.keys(ch.topics).forEach(k=>set.add(k)));
  return [...set];
}
// Helper: get topic label by key (search all chapters)
function topicLabel(key){
  for(const ch of Object.values(CHAPTERS)){
    if(ch.topics[key]) return ch.topics[key].label;
  }
  return _guessTopicLabel(key);
}

// §STATE
/* ================================================================
   STATE
================================================================ */
const PTS = [200,400,600,800,1000];
const DB  = []; // empty — all questions come from CSV imports

let customBank = [];
// vocabBank: unified store — type=vocab, type=ion, type=element all in one CSV
let vocabBank  = [];
try { customBank = JSON.parse(localStorage.getItem('chemq_custom') || '[]'); } catch(e){}
try { vocabBank  = JSON.parse(localStorage.getItem('chemq_vocab')  || '[]'); } catch(e){}
// Migrate: merge any legacy ionBank/elementBank into vocabBank on first load
try {
  const oldIons = JSON.parse(localStorage.getItem('chemq_ions') || '[]');
  const oldEls  = JSON.parse(localStorage.getItem('chemq_elements') || '[]');
  if(oldIons.length || oldEls.length){
    const existWords = new Set(vocabBank.map(v => v.chapter+'||'+v.word));
    oldIons.forEach(ion => {
      const word = ion.name ? ion.name.toUpperCase() : '';
      if(word && !existWords.has((ion.chapter||'')+'||'+word)){
        vocabBank.push({ type:'ion', word, definition: ion.hint || (ion.formula_display||ion.formula_raw)+' — charge: '+(ion.charge_display||ion.charge),
          chapter:ion.chapter||'ch4', chapter_label:ion.chapter_label||'', chapter_name:ion.chapter_name||'',
          topic:ion.topic||'ions', topic_label:ion.topic_label||'',
          formula:ion.formula_display||ion.formula_raw||'', charge:ion.charge||0,
          charge_display:ion.charge_display||'', category:ion.category||'',
          mnemonic:ion.mnemonic||'', common_compounds:ion.common_compounds||'',
          wordle_eligible:ion.wordle_eligible!==false, enabled:ion.enabled!==false,
          is_multiword:word.includes(' '), name_upper:word.replace(/[^A-Z]/g,'') });
      }
    });
    oldEls.forEach(el => {
      const word = el.word || (el.name ? el.name.toUpperCase() : '');
      if(word && !existWords.has((el.chapter||'')+'||'+word)){
        vocabBank.push({ type:'element', word, definition: el.definition || el.hint || el.name,
          chapter:el.chapter||'ch1', chapter_label:el.chapter_label||'', chapter_name:el.chapter_name||'',
          topic:el.topic||'elements', topic_label:el.topic_label||'',
          symbol:el.formula_raw||el.symbol||'', atomic_num:el.num||el.protons||0,
          mass:el.mass||0, family:el.family||'', period:el.period||0,
          wordle_eligible:el.wordle_eligible!==false, enabled:el.enabled!==false,
          is_multiword:(word.includes(' ')), connections_group:el.connections_group||''});
      }
    });
    if(oldIons.length || oldEls.length){
      localStorage.setItem('chemq_vocab', JSON.stringify(vocabBank));
      localStorage.removeItem('chemq_ions');
      localStorage.removeItem('chemq_elements');
    }
  }
} catch(e){}

// Build CHAPTERS on startup from whatever is already stored
rebuildChapters();

// §CSV_IMPORT
/* ================================================================
   CSV IMPORT / EXPORT
================================================================ */

// ── QUESTIONS CSV ──────────────────────────────────────────
// New columns added to the existing format:
//   chapter_label  e.g. "Chapter 9"
//   chapter_name   e.g. "Gas Laws"
//   topic_label    e.g. "Gas Laws"   (human name for the topic key)
//   topic_icon     e.g. "⚗️"         (optional emoji)
// All other columns unchanged — IDs/variant groups stay as teacher built them.

function csvToQuestions(csvText){
  const lines = csvText.trim().split(/\r?\n/);
  if(lines.length < 2) return [];
  // Strip empty trailing column headers (Excel often adds blank columns)
  const headers = lines[0].split(',').map(h => h.trim()).filter((h,i,a) => {
    // keep all non-empty headers and only stop stripping from the right
    return true; // we filter per-row below
  });
  // Find index of last non-empty header
  let lastHeaderIdx = headers.length - 1;
  while(lastHeaderIdx > 0 && !headers[lastHeaderIdx]) lastHeaderIdx--;
  const cleanHeaders = headers.slice(0, lastHeaderIdx + 1);

  const questions = [];
  for(let i = 1; i < lines.length; i++){
    const vals = parseCSVLine(lines[i]);
    if(vals.length < 3) continue;
    const obj = {};
    cleanHeaders.forEach((h, idx) => { if(h) obj[h] = (vals[idx] || '').trim(); });

    // Skip blank rows and stray repeated-header rows
    if(!obj.chapter || obj.chapter === 'chapter') continue;
    if(!obj.q) continue;
    // Honour explicit skip flag
    if(obj.skip && obj.skip.toLowerCase() === 'skip') continue;

    obj.pts             = parseInt(obj.pts) || 200;
    obj.millionaire_val = obj.millionaire_val ? parseInt(obj.millionaire_val) : null;
    obj.difficulty      = obj.difficulty ? parseInt(obj.difficulty) : 1;
    obj.bloom_level     = obj.bloom_level ? parseInt(obj.bloom_level) : null;
    obj.variant_num     = parseInt(obj.variant_num) || 1;
    obj.answer_sig_figs = obj.answer_sig_figs !== '' ? parseInt(obj.answer_sig_figs) : null;
    obj.tolerance       = obj.tolerance !== '' ? parseFloat(obj.tolerance) : 0.5;

    // answer_raw: prefer answer_raw column, fall back to answer_display, then answer
    if(obj.answer_raw && obj.answer_raw !== ''){
      obj.answer_raw = parseFloat(obj.answer_raw);
    } else if(obj.answer_display && obj.answer_display !== ''){
      obj.answer_raw = parseFloat(obj.answer_display);
    } else if(obj.answer && obj.answer !== '' && obj.type === 'numeric'){
      obj.answer_raw = parseFloat(obj.answer);
    } else {
      obj.answer_raw = undefined;
    }

    obj.enabled    = !(obj.enabled === '0' || obj.enabled === 'false' || obj.enabled === 'FALSE');
    obj.xp_value   = obj.xp_value   ? parseInt(obj.xp_value)   : null;
    obj.time_limit = obj.time_limit ? parseInt(obj.time_limit) : 0;
    // Normalise tf_answer: accept 'true'/'false'/'TRUE'/'FALSE'/'1'/'0'
    if(obj.tf_answer !== undefined && obj.tf_answer !== ''){
      const tfa = obj.tf_answer.toString().toLowerCase().trim();
      obj.tf_answer = (tfa === 'false' || tfa === '0') ? 'false' : 'true';
    } else if(obj.true_false_stmt){
      // No tf_answer provided — default to true (statement as written is correct)
      obj.tf_answer = 'true';
    } else {
      obj.tf_answer = '';
    }
    if(obj.type === 'mc'){
      obj.options = [obj.option_a, obj.option_b, obj.option_c, obj.option_d].filter(Boolean);
    }
    questions.push(obj);
  }
  return questions;
}

// §VOCAB_CSV
// ── UNIFIED VOCAB CSV ─────────────────────────────────────
// One CSV handles type=vocab, type=ion, and type=element rows.
// Required columns for all types: chapter, chapter_label, chapter_name,
//   topic, topic_label, type, enabled, word, definition
// Ion extras:     formula, charge, charge_display, category, mnemonic, common_compounds
// Element extras: symbol, atomic_num, mass, family, period, group, common_charge

function csvToVocab(csvText){
  const lines = csvText.trim().split(/\r?\n/);
  if(lines.length < 2) return [];
  const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase());
  let lastIdx = rawHeaders.length - 1;
  while(lastIdx > 0 && !rawHeaders[lastIdx]) lastIdx--;
  const headers = rawHeaders.slice(0, lastIdx + 1);

  const vocab = [];
  for(let i = 1; i < lines.length; i++){
    const vals = parseCSVLine(lines[i]);
    if(vals.length < 2) continue;
    const obj = {};
    headers.forEach((h, idx) => { if(h) obj[h] = (vals[idx] || '').trim(); });

    if(!obj.word || obj.word.toLowerCase() === 'word') continue;
    if(!obj.definition && !obj.hint) continue;

    const type = (obj.type || 'vocab').toLowerCase();
    obj.type = type;
    obj.enabled = !(obj.enabled === '0' || obj.enabled === 'false' || obj.enabled === 'FALSE');
    obj.word = obj.word.toUpperCase();
    if(!obj.definition && obj.hint) obj.definition = obj.hint;

    obj.connections_category = obj.connections_category || '';
    obj.connections_group    = obj.connections_category.split('|')[0].trim() || '';
    obj.is_multiword = obj.word.includes(' ');
    const clean = obj.word.replace(/[^A-Za-z]/g, '');

    // wordle_eligible: honour CSV if explicit, otherwise auto-compute
    const we = (obj.wordle_eligible || '').toUpperCase();
    if(we === 'TRUE' || we === '1')        obj.wordle_eligible = !obj.is_multiword && clean.length >= 4 && clean.length <= 12;
    else if(we === 'FALSE' || we === '0')   obj.wordle_eligible = false;
    else                                     obj.wordle_eligible = !obj.is_multiword && clean.length >= 4 && clean.length <= 12;

    if(type === 'ion'){
      obj.charge         = parseInt(obj.charge) || 0;
      obj.formula        = obj.formula || '';
      obj.charge_display = obj.charge_display || (obj.charge > 0 ? obj.charge+'+' : obj.charge < 0 ? Math.abs(obj.charge)+'-' : '');
      obj.category       = obj.category || '';
      obj.mnemonic       = obj.mnemonic || '';
      obj.common_compounds = obj.common_compounds || '';
      obj.name_upper     = obj.word.replace(/[^A-Z]/g, '');
    }
    if(type === 'element'){
      obj.symbol      = obj.symbol || obj.formula || '';
      obj.atomic_num  = parseInt(obj.atomic_num) || 0;
      obj.mass        = parseFloat(obj.mass) || 0;
      obj.family      = obj.family || '';
      obj.period      = parseInt(obj.period) || 0;
      obj.group       = parseInt(obj.group) || 0;
      obj.common_charge = obj.common_charge || '';
    }

    vocab.push(obj);
  }
  return vocab;
}

function vocabToCSV(vocab){
  const COLS = ['chapter','chapter_label','chapter_name','chapter_icon',
    'topic','topic_label','topic_icon',
    'type','enabled','word','definition','wordle_eligible','connections_category',
    'formula','charge','charge_display','category','mnemonic','common_compounds',
    'symbol','atomic_num','mass','family','period','group','common_charge','hint'];
  const escv = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  return [COLS.join(','),
    ...vocab.map(v => COLS.map(c => {
      if(c==='enabled') return escv(v.enabled===false ? '0' : '1');
      if(c==='wordle_eligible') return escv(v.wordle_eligible ? 'TRUE' : 'FALSE');
      if(c==='chapter_icon') return escv(v.chapter_icon || CHAPTERS[v.chapter]?.icon || '');
      if(c==='topic_icon')   return escv(v.topic_icon   || CHAPTERS[v.chapter]?.topics?.[v.topic]?.icon || '');
      return escv(v[c]||'');
    }).join(','))
  ].join('\r\n');
}

function parseCSVLine(line){
  const result = [];
  let cur = '', inQ = false;
  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if(ch === '"'){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if(ch === ',' && !inQ){
      result.push(cur); cur = '';
    } else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function questionsToCSV(qs){
  const COLS = ["id","variant_group","variant_num","chapter","chapter_label","chapter_name","chapter_icon",
    "topic","topic_label","topic_icon","cat",
    "pts","millionaire_val","difficulty","bloom_level","type","standard","learning_objective","tags","enabled",
    "context_paragraph","reaction_equation","reaction_type","data_table",
    "visual_type","visual_params","visual_type_2","visual_params_2",
    "q",
    "option_a","option_b","option_c","option_d","answer",
    "answer_raw","answer_display","answer_sig_figs","tolerance","unit","answer_unit_type",
    "given_keys","given_vals_display",
    "randomizer_type",
    "hint","sol_1","sol_2","sol_3","sol_4","notes","image_url",
    "xp_value","time_limit","true_false_stmt","tf_answer","distractor_note","explanation"];
  const esc = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const rows = [COLS.join(',')];
  qs.forEach(q => {
    const opts = q.options || [];
    const sols = Array.isArray(q.solution) ? q.solution : [];
    // Derive chapter_label / chapter_name / topic_label from CHAPTERS if not on the object
    const ch   = CHAPTERS[q.chapter];
    const top  = ch?.topics?.[q.topic];
    rows.push(COLS.map(c => {
      if(c==='option_a') return esc(opts[0]||'');
      if(c==='option_b') return esc(opts[1]||'');
      if(c==='option_c') return esc(opts[2]||'');
      if(c==='option_d') return esc(opts[3]||'');
      if(c==='sol_1') return esc(q.sol_1 || sols[0]||'');
      if(c==='sol_2') return esc(q.sol_2 || sols[1]||'');
      if(c==='sol_3') return esc(q.sol_3 || sols[2]||'');
      if(c==='sol_4') return esc(q.sol_4 || sols[3]||'');
      if(c==='answer_raw') return esc(q.answer_raw !== undefined ? q.answer_raw : q.answer);
      if(c==='answer_display') return esc(q.answer_display || q.answer || '');
      if(c==='chapter_label') return esc(q.chapter_label || ch?.label || '');
      if(c==='chapter_name')  return esc(q.chapter_name  || ch?.name  || '');
      if(c==='chapter_icon')  return esc(q.chapter_icon  || ch?.icon  || '');
      if(c==='topic_label')   return esc(q.topic_label   || top?.label || '');
      if(c==='topic_icon')    return esc(q.topic_icon    || top?.icon  || '');
      if(c==='enabled')       return esc(q.enabled === false ? '0' : '1');
      if(c==='bloom_level')   return esc(q.bloom_level   || '');
      if(c==='answer_unit_type') return esc(q.answer_unit_type || '');
      return esc(q[c]);
    }).join(','));
  });
  return rows.join('\r\n');
}

function exportCSV(){
  _downloadText(questionsToCSV(allQ()), 'chemreview-questions.csv');
}
function exportVocabCSV(){
  _downloadText(vocabToCSV(vocabBank), 'chemreview-vocab.csv');
}
function _downloadText(text, filename){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function importCSV(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = csvToQuestions(e.target.result);
      if(!imported.length){ alert('No questions found in CSV. Check format.'); return; }
      // Replace entire bank (don't merge — avoids stale questions from old imports)
      customBank = imported;
      _saveCustom();
      rebuildChapters();
      // Clear any study plan selections that no longer match loaded chapters
      studyPlan.selections = studyPlan.selections.filter(s =>
        CHAPTERS[s.chKey] && (s.topicKey === null || CHAPTERS[s.chKey].topics?.[s.topicKey])
      );
      _spSave();
      alert(`✓ Imported ${imported.length} questions across ${Object.keys(CHAPTERS).length} chapter(s).`);
      if(document.getElementById('admin-screen').classList.contains('active')) renderQList();
      showHub();
    } catch(err){ alert('Import error: ' + err.message); }
  };
  reader.readAsText(file);
}

function importVocabCSV(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = csvToVocab(e.target.result);
      if(!imported.length){
        alert('No entries found.\nExpected columns: chapter, chapter_label, chapter_name, chapter_icon, topic, topic_label, topic_icon, type, word, definition\ntype must be: vocab, ion, or element');
        return;
      }
      // Replace entirely — re-import always wins
      vocabBank = imported;
      _saveVocab();
      rebuildChapters();
      const counts = {vocab:0, ion:0, element:0};
      imported.forEach(v => { if(counts[v.type] !== undefined) counts[v.type]++; else counts.vocab++; });

      // P1-5: Validate wordle/connections pools at parse time so silent empties are caught early
      const wordlePool = imported.filter(v => v.enabled !== false && v.wordle_eligible && !v.is_multiword);
      const connGroups = [...new Set(imported.filter(v => v.enabled !== false && v.connections_group).map(v => v.connections_group))];
      console.info(`[cr-data] Vocab import: ${imported.length} entries — ${counts.vocab} vocab · ${counts.ion} ions · ${counts.element} elements`);
      if(!wordlePool.length) console.warn('[cr-data] Wordle pool: 0 eligible words. Words need to be single, 4-12 clean letters, wordle_eligible not FALSE.');
      else console.info(`[cr-data] Wordle pool: ${wordlePool.length} eligible words`);
      if(!connGroups.length) console.warn('[cr-data] Connections: 0 groups found. Ensure connections_category column is populated, or cr-vocab-engine will fall back to topic_label.');
      else console.info(`[cr-data] Connections groups: ${connGroups.length} groups — ${connGroups.slice(0,5).join(', ')}${connGroups.length>5?' …':''}`);

      alert(`✓ Imported ${imported.length} entries:\n  ${counts.vocab} vocab · ${counts.ion} ions · ${counts.element} elements`);
      if(document.getElementById('admin-screen').classList.contains('active')) renderQList();
      showHub();
    } catch(err){ alert('Vocab import error: ' + err.message); }
  };
  reader.readAsText(file);
}

function clearImported(){
  if(!confirm('Remove all imported questions? Vocab is kept.')) return;
  customBank = [];
  _saveCustom();
  rebuildChapters();
  // Prune study plan selections — no chapters left
  studyPlan.selections = [];
  _spSave();
  if(document.getElementById('admin-screen').classList.contains('active')) renderQList();
  showHub();
}
function clearVocab(){
  if(!confirm('Remove all imported vocabulary (vocab, ions, and elements)?')) return;
  vocabBank = [];
  _saveVocab();
  rebuildChapters();
  if(document.getElementById('admin-screen').classList.contains('active')) renderQList();
}
function _saveCustom(){ try { localStorage.setItem('chemq_custom', JSON.stringify(customBank)); } catch(e){} }
function _saveVocab(){  try { localStorage.setItem('chemq_vocab',  JSON.stringify(vocabBank));  } catch(e){} }

// §LEGACY_STUBS
// ── Legacy stubs (old separate CSV buttons removed) ──────
// ionBank/elementBank are now part of vocabBank (type=ion/element).
// These stubs exist so any saved bookmarks or cached code don't hard-error.
function clearIons(){    clearVocab(); }
function clearElements(){ clearVocab(); }


// §VOCAB_ACCESS
/* ================================================================
   UNIFIED VOCAB ACCESSORS
   allVocab(chKey?) — returns all enabled entries from vocabBank
     (type=vocab, type=ion, type=element) optionally filtered by chapter.
   activeVocab(ch)  — accepts chKey string or CHAPTERS object.
   Used by: Crossword, Flashcards, Word Search, Wheel/Hangman, Wordle.
================================================================ */
function allVocab(chKeyFilter){
  return vocabBank.filter(v => {
    if(v.enabled === false) return false;
    if(chKeyFilter && v.chapter !== chKeyFilter) return false;
    return true;
  });
}

function activeVocab(ch){
  if(!ch) return [];
  const key = typeof ch === 'string' ? ch : Object.keys(CHAPTERS).find(k => CHAPTERS[k] === ch);
  return allVocab(key);
}

// getWordlePool(mode) — returns Wordle-ready objects from vocabBank
function getWordlePool(mode){
  if(mode === 'ions'){
    return vocabBank.filter(v =>
      v.enabled !== false && v.type === 'ion' &&
      v.wordle_eligible !== false && !v.is_multiword
    ).map(v => ({
      word:        v.word,
      displayWord: v.word.toLowerCase(),
      clue:        v.definition,
      meta:{ type:'ion', formula:v.formula||'', charge:v.charge_display||String(v.charge||''),
             category:v.category||'', mnemonic:v.mnemonic||'', commonCompounds:v.common_compounds||'' }
    }));
  }
  return vocabBank.filter(v =>
    v.enabled !== false && v.wordle_eligible !== false && !v.is_multiword
  ).map(v => ({
    word:        v.word,
    displayWord: v.word.toLowerCase(),
    clue:        v.definition,
    meta:{ type:v.type||'vocab', formula:v.formula||'', charge:'',
           category:v.category||'', mnemonic:v.mnemonic||'', commonCompounds:'' }
  }));
}


// §TOPIC_REASSIGN
// ── TOPIC REASSIGNMENT ─────────────────────────────────────
// Moves all questions (and vocab) for a given topic from one chapter to another.
// Updates: q.chapter, q.chapter_label, q.chapter_name, and regenerates q.id + q.variant_group
// to match the new chapter key, preserving all other fields.

function reassignTopic(topicKey, fromChKey, toChKey, toChLabel, toChName){
  const toSlug = toChKey; // already validated
  let changed = 0;
  customBank.forEach(q => {
    if(q.topic !== topicKey || q.chapter !== fromChKey) return;
    q.chapter       = toChKey;
    q.chapter_label = toChLabel;
    q.chapter_name  = toChName;
    // Rebuild id and variant_group by swapping the chapter prefix
    // id format: ch9-boyles-400-001 → newkey-boyles-400-001
    if(q.id){
      q.id            = q.id.replace(/^[^-]+/, toSlug);
      q.variant_group = q.variant_group ? q.variant_group.replace(/^[^-]+/, toSlug) : q.id.replace(/-\d{3}$/, '');
    }
    changed++;
  });
  // Also update vocab entries for this topic
  vocabBank.forEach(v => {
    if(v.topic !== topicKey || v.chapter !== fromChKey) return;
    v.chapter       = toChKey;
    v.chapter_label = toChLabel;
    v.chapter_name  = toChName;
  });
  if(changed || vocabBank.some(v=>v.topic===topicKey)){
    _saveCustom(); _saveVocab();
    rebuildChapters();
  }
  return changed;
}
let gameState = { cells:{}, score:0 };
let currentQ  = null;
let selMC     = null;
let isAnswered = false;

// Selection state set from the selector screen
/** @deprecated Use activeSelections instead */
let activeChapter = null;
/** @deprecated Use activeSelections instead */
let activeTopic   = null;
// Multi-selection. Array of {chKey, topicKey} objects. Set by cr-planner before every game launch.
let activeSelections = []; // [{chKey:'ch9', topicKey:'gas-laws'}, ...]

function allQ() { return customBank; }
// Returns only enabled vocab for a chapter
/* activeVocab defined above */
function boardQ() {
  const active = allQ().filter(q => q.enabled !== false && q.enabled !== '0' && q.enabled !== 0);
  if(!activeSelections.length) return []; // No selections → empty board; callers should show "no topics selected"
  return active.filter(q =>
    activeSelections.some(s =>
      s.chKey === q.chapter && (s.topicKey === null || s.topicKey === q.topic)
    )
  );
}
function boardCats() {
  const bq = boardQ();
  // Only cats that have at least one question at any point value
  const cats = [...new Set(bq.map(q => q.cat))].filter(Boolean);
  // Shuffle for variety when > MAX_CATS
  const MAX_CATS = 7;
  if(cats.length > MAX_CATS){
    for(let i=cats.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [cats[i],cats[j]]=[cats[j],cats[i]];
    }
    return cats.slice(0, MAX_CATS);
  }
  return cats;
}


// ── Shared utility: HTML-escape a string ─────────────────────────
// Defined here (first file to load) so all other files can use it.
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// §AUTO_LOAD
// ── Auto-load CSVs from same directory ───────────────────────────
// On page load, fetch questions.csv and vocab.csv from the same
// directory as the HTML file. Silently skips if not found (404)
// or if running from file:// (fetch blocked).
// Only loads if localStorage is currently empty for that data type,
// so a manual import always takes precedence.
async function autoLoadCSVs(){
  if(location.protocol === 'file:') return; // fetch doesn't work over file://

  const tryFetch = async (filename) => {
    try {
      const res = await fetch(filename);
      if(!res.ok) return null;
      return await res.text();
    } catch(e){ return null; }
  };

  // Use origin + repo-root path so this works on GitHub Pages subdomains
  // and local dev servers equally. Strips any trailing filename from pathname
  // so /index.html → / and / → /
  const base = window.location.origin + '/';

  let didLoad = false;

  // Questions — only auto-load if bank is empty
  if(!customBank.length){
    const text = await tryFetch(base + 'questions.csv');
    if(text){
      try {
        const imported = csvToQuestions(text);
        if(imported.length){
          customBank = imported;
          _saveCustom();
          rebuildChapters();
          console.info(`[cr-data] Auto-loaded questions.csv — ${imported.length} questions`);
          didLoad = true;
        }
      } catch(e){ console.warn('[cr-data] Auto-load questions.csv failed:', e.message); }
    }
  }

  // Vocab — only auto-load if bank is empty
  if(!vocabBank.length){
    const text = await tryFetch(base + 'vocab.csv');
    if(text){
      try {
        const imported = csvToVocab(text);
        if(imported.length){
          vocabBank = imported;
          _saveVocab();
          rebuildChapters();
          console.info(`[cr-data] Auto-loaded vocab.csv — ${imported.length} entries`);
          didLoad = true;
        }
      } catch(e){ console.warn('[cr-data] Auto-load vocab.csv failed:', e.message); }
    }
  }

  // Re-render hub widget if anything loaded
  if(didLoad && typeof renderStudyPlanWidget === 'function') renderStudyPlanWidget();
}

// Auto-load CSVs when the DOM is ready (or immediately if already loaded)
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', autoLoadCSVs);
} else {
  autoLoadCSVs();
}
