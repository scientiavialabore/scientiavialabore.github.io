/* ================================================================
   cr-core.js — Navigation, Shared Selector, Randomizer
   ─────────────────────────────────────────────────────────────────
   CONTENTS (in order):
     §NAVIGATION    showScreen, showHub, screen-routing helpers
     §CH_SELECTOR   Shared chapter selector renderer (crossword, flashcards, wof, ws)
     §RANDOMIZER    Randomizer engine + RANDOMIZER_REGISTRY (Boyle's, pH, etc.)

   DEPENDENCIES:
     cr-data.js          — CHAPTERS, boardQ, allQ, chEntries, weightedPick,
                           activeSelections, vocabBank, activeVocab, esc
     cr-question-engine.js — QuestionEngine (loaded after this file)
     cr-jeopardy.js      — buildBoard, renderBoard, openQ, closeModal,
                           startJeopardyWith, startJeopardyMulti,
                           renderJeopardySelector, openJeopardySelector
     cr-planner.js       — renderStudyPlanWidget, spTrackResult, showPlanner

   LOAD ORDER (cr-shell.html):
     cr-data.js → cr-core.js → cr-admin.js
     → cr-question-engine.js → cr-jeopardy.js
     → cr-games-questions.js → cr-games-vocab.js → cr-planner.js

   KEY GLOBALS EXPORTED:
     showScreen(id)
     showHub()
     showAdmin()
     openCrosswordSelector()
     openFlashcardSelector()
     renderChapterSelector(containerId, callback, requireVocab)
     generateVariant(templateQ)
     toSigFigs / randFloat / randPick / numericDistractors
     RANDOMIZER_REGISTRY
================================================================ */

// §NAVIGATION
/* ================================================================
   NAVIGATION
================================================================ */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showHub(){
  // closeModal is defined in cr-jeopardy.js — guard with typeof for load order
  if(typeof closeModal === 'function') closeModal();
  showScreen('hub-screen');
  if(typeof renderStudyPlanWidget === 'function') renderStudyPlanWidget();
  const n = document.getElementById('hub-notice');
  const total = allQ().length;
  const chCount = Object.keys(CHAPTERS).length;
  const vCount  = vocabBank.length;
  if(total === 0 && vCount === 0){
    n.style.color = '';
    n.innerHTML = '⚠ No data loaded. Go to <b style="color:var(--gold)">✎ Manage Questions</b> → import <b>questions.csv</b> and <b>vocab.csv</b>.';
  } else {
    n.style.color = 'var(--green)';
    const _vc = vocabBank.filter(v=>v.type==='vocab').length;
    const _ic = vocabBank.filter(v=>v.type==='ion').length;
    const _ec = vocabBank.filter(v=>v.type==='element').length;
    const _pts = [];
    if(total)   _pts.push(total + (total!==1?' questions':' question'));
    if(_vc)     _pts.push(_vc + ' vocab');
    if(_ic)     _pts.push(_ic + ' ions');
    if(_ec)     _pts.push(_ec + ' elements');
    _pts.push(chCount + (chCount!==1?' chapters':' chapter'));
    n.innerHTML = '✓ ' + _pts.join(' · ') + ' loaded.';
  }
}

function showAdmin(){ showScreen('admin-screen'); showAdminTab('list'); }

// openJeopardySelector is fully defined in cr-jeopardy.js (loaded after this).
// This stub handles any early HTML onclick references before that file loads.
function openJeopardySelector(){
  if(typeof renderJeopardySelector === 'function') renderJeopardySelector();
  showScreen('selector-screen');
}

function openCrosswordSelector(){
  renderChapterSelector('cw-sel-chapters', startCrossword, true);
  showScreen('cw-sel-screen');
}

function openFlashcardSelector(){
  renderChapterSelector('fc-sel-chapters', startFlashcards, true);
  showScreen('fc-sel-screen');
}

document.getElementById('admin-back-btn').addEventListener('click', showHub);

// Init — show hub notice on load.
// renderStudyPlanWidget is defined later in cr-planner.js; showHub guards with typeof.
showHub();


// §CH_SELECTOR
/* ================================================================
   SHARED CHAPTER SELECTOR RENDERER
   Used by: Crossword, Flashcards, Wheel of Fortune, Word Search.
   Jeopardy uses its own selector defined in cr-jeopardy.js.
================================================================ */
function renderChapterSelector(containerId, onClickFn, requireVocab){
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  const entries = chEntries();
  if(!entries.length){
    wrap.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px">No chapters yet — import data in Question Manager.</div>';
    return;
  }
  entries.forEach(([chKey, ch]) => {
    const hasVocab = (ch.vocab||[]).length > 0;
    if(requireVocab && !hasVocab){
      const chHead = document.createElement('div');
      chHead.className = 'sel-ch-head';
      chHead.innerHTML =
        `<span class="sel-ch-icon" style="opacity:.4">${ch.icon}</span>
        <div>
          <div class="sel-ch-label" style="opacity:.4">${esc(ch.label)}</div>
          <div class="sel-ch-name"  style="opacity:.4">${esc(ch.name)}</div>
          <div style="font-size:.62rem;color:var(--muted);font-family:var(--mono);margin-top:2px">⚗ No vocab loaded — import vocab.csv</div>
        </div>`;
      wrap.appendChild(chHead);
      return;
    }
    const chHead = document.createElement('div');
    chHead.className = 'sel-ch-head';
    chHead.innerHTML =
      `<span class="sel-ch-icon">${ch.icon}</span>
      <div>
        <div class="sel-ch-label">${esc(ch.label)}</div>
        <div class="sel-ch-name">${esc(ch.name)}</div>
      </div>`;
    wrap.appendChild(chHead);

    const row = document.createElement('div');
    row.className = 'sel-topics';
    const btn = document.createElement('button');
    btn.className = 'sel-topic-btn';
    btn.style.borderColor = ch.color;
    const count = requireVocab
      ? activeVocab(ch).length
      : Object.keys(ch.topics||{}).length;
    btn.innerHTML =
      `<div class="sel-topic-icon">${ch.icon}</div>
      <div class="sel-topic-label">${esc(ch.name)}</div>
      <div class="sel-topic-count">${count} ${requireVocab?'terms':'topics'}</div>`;
    btn.addEventListener('click', () => onClickFn(chKey));
    row.appendChild(btn);
    wrap.appendChild(row);
  });
}


// §RANDOMIZER
/* ================================================================
   RANDOMIZER ENGINE

   Each registry entry generates fresh random values, computes the
   correct answer, and returns an object whose keys overwrite the
   matching CSV template fields (q, given_keys, given_vals_display,
   answer_raw, answer_display, answer_sig_figs, tolerance, unit,
   type, hint, sol_1…sol_4).

   CSV usage: add column  randomizer_type  with a registry key.
   generateVariant(templateQ) applies the registry entry and returns
   a new question object without mutating the original.

   To add a new question type: add a new key to RANDOMIZER_REGISTRY.
================================================================ */

/** Round val to sf significant figures, return formatted string. */
function toSigFigs(val, sf){
  if(val === 0) return '0';
  const d     = Math.ceil(Math.log10(Math.abs(val)));
  const power = sf - d;
  const mag   = Math.pow(10, power);
  const rounded = Math.round(val * mag) / mag;
  if(power > 0) return rounded.toFixed(power);
  return String(Math.round(rounded));
}

/** Random float in [min, max] rounded to `decimals` decimal places. */
function randFloat(min, max, decimals){
  const val = min + Math.random() * (max - min);
  return parseFloat(val.toFixed(decimals));
}

/** Pick a random element from an array. */
function randPick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Build `count` plausible wrong MC answers around a correct numeric value.
 * Returns a shuffled array of strings including the correct answer.
 */
function numericDistractors(correct, tolerance, unit, count){
  const fmt = v => String(parseFloat(v.toFixed(4))) + (unit?' '+unit:'');
  const opts = [fmt(correct)];
  const variants = [
    correct * 2, correct / 2, correct * 1.5,
    correct * 0.75, correct * 1.3, correct * 0.8, correct * 3,
  ].filter(v => v > 0 && Math.abs(v - correct) > tolerance * 2);
  variants.sort(() => Math.random() - 0.5);
  for(const v of variants){
    if(opts.length >= count) break;
    const s = fmt(v);
    if(!opts.includes(s)) opts.push(s);
  }
  while(opts.length < count){
    opts.push(fmt(correct * (0.4 + Math.random() * 1.5)));
  }
  return opts.sort(() => Math.random() - 0.5);
}

const RANDOMIZER_REGISTRY = {

  /* ── Boyle's Law: P₁V₁ = P₂V₂ ─────────────────────────── */
  boyles_law: () => {
    const sf = 3;
    const P1 = randFloat(0.50, 5.00, 2);
    const V1 = randFloat(1.0, 20.0, 1);
    const V2 = randFloat(1.0, 20.0, 1);
    const P2 = parseFloat((P1 * V1 / V2).toFixed(2));
    const ans = toSigFigs(P2, sf);
    return {
      q: `A gas has a pressure of ${P1} atm and a volume of ${V1} L. If the volume changes to ${V2} L at constant temperature, what is the new pressure?`,
      given_keys: 'P₁|V₁|V₂',
      given_vals_display: `${P1} atm|${V1} L|${V2} L`,
      answer_raw: P2, answer_display: ans, answer_sig_figs: sf, tolerance: 0.05,
      unit: 'atm', type: 'numeric',
      hint: 'Use P₁V₁ = P₂V₂. Multiply P₁ × V₁ then divide by V₂.',
      sol_1: `Boyle's Law: P₁V₁ = P₂V₂`,
      sol_2: `P₂ = P₁ × V₁ / V₂ = ${P1} × ${V1} / ${V2}`,
      sol_3: `P₂ = ${ans} atm`,
    };
  },

  /* ── Charles's Law: V₁/T₁ = V₂/T₂ ─────────────────────── */
  charles_law: () => {
    const sf = 3;
    const T1 = randFloat(200, 400, 0);
    const V1 = randFloat(1.0, 15.0, 1);
    const T2 = randFloat(200, 500, 0);
    const V2 = parseFloat((V1 * T2 / T1).toFixed(2));
    const ans = toSigFigs(V2, sf);
    return {
      q: `A gas occupies ${V1} L at ${T1} K. What volume will it occupy at ${T2} K (constant pressure)?`,
      given_keys: 'V₁|T₁|T₂',
      given_vals_display: `${V1} L|${T1} K|${T2} K`,
      answer_raw: V2, answer_display: ans, answer_sig_figs: sf, tolerance: 0.05,
      unit: 'L', type: 'numeric',
      hint: "Charles\u2019s Law: V\u2081/T\u2081 = V\u2082/T\u2082. Solve for V\u2082.",
      sol_1: `V₂ = V₁ × T₂ / T₁`,
      sol_2: `V₂ = ${V1} × ${T2} / ${T1}`,
      sol_3: `V₂ = ${ans} L`,
    };
  },

  /* ── Gay-Lussac's Law: P₁/T₁ = P₂/T₂ ──────────────────── */
  gay_lussac_law: () => {
    const sf = 3;
    const P1 = randFloat(1.0, 4.0, 2);
    const T1 = randFloat(250, 400, 0);
    const T2 = randFloat(250, 600, 0);
    const P2 = parseFloat((P1 * T2 / T1).toFixed(3));
    const ans = toSigFigs(P2, sf);
    return {
      q: `A rigid container holds gas at ${P1} atm and ${T1} K. The temperature is raised to ${T2} K. What is the new pressure?`,
      given_keys: 'P₁|T₁|T₂',
      given_vals_display: `${P1} atm|${T1} K|${T2} K`,
      answer_raw: P2, answer_display: ans, answer_sig_figs: sf, tolerance: 0.05,
      unit: 'atm', type: 'numeric',
      hint: "Gay-Lussac\u2019s Law: P\u2081/T\u2081 = P\u2082/T\u2082. Volume is constant.",
      sol_1: `P₂ = P₁ × T₂ / T₁`,
      sol_2: `P₂ = ${P1} × ${T2} / ${T1}`,
      sol_3: `P₂ = ${ans} atm`,
    };
  },

  /* ── Combined Gas Law ───────────────────────────────────── */
  combined_gas_law: () => {
    const sf = 3;
    const P1=randFloat(1.0,4.0,2), V1=randFloat(2.0,15.0,1), T1=randFloat(250,400,0);
    const P2=randFloat(1.0,5.0,2), T2=randFloat(250,500,0);
    const V2 = parseFloat((P1 * V1 * T2 / (T1 * P2)).toFixed(2));
    const ans = toSigFigs(V2, sf);
    return {
      q: `A gas is at ${P1} atm, ${V1} L, and ${T1} K. Conditions change to ${P2} atm and ${T2} K. Find the new volume.`,
      given_keys: 'P₁|V₁|T₁|P₂|T₂',
      given_vals_display: `${P1} atm|${V1} L|${T1} K|${P2} atm|${T2} K`,
      answer_raw: V2, answer_display: ans, answer_sig_figs: sf, tolerance: 0.1,
      unit: 'L', type: 'numeric',
      hint: 'Combined Gas Law: (P₁V₁)/T₁ = (P₂V₂)/T₂. Solve for V₂.',
      sol_1: `V₂ = P₁V₁T₂ / (T₁P₂)`,
      sol_2: `V₂ = ${P1}×${V1}×${T2} / (${T1}×${P2})`,
      sol_3: `V₂ = ${ans} L`,
    };
  },

  /* ── Ideal Gas Law: PV = nRT ────────────────────────────── */
  ideal_gas_law: () => {
    const R=0.08206, sf=3;
    const mode=randPick(['findP','findV','findN','findT']);
    const n=randFloat(0.5,5.0,2), V=randFloat(2.0,20.0,1);
    const T=randFloat(250,500,0), P=randFloat(0.5,5.0,2);
    if(mode==='findP'){
      const r=parseFloat((n*R*T/V).toFixed(4)); const ans=toSigFigs(r,sf);
      return { q:`${n} mol of gas occupies ${V} L at ${T} K. What is the pressure?`,
        given_keys:'n|V|T|R', given_vals_display:`${n} mol|${V} L|${T} K|0.08206 L·atm/mol·K`,
        answer_raw:r, answer_display:ans, answer_sig_figs:sf, tolerance:0.05, unit:'atm', type:'numeric',
        hint:'PV = nRT → P = nRT/V',
        sol_1:'P = nRT/V', sol_2:`P = ${n}×0.08206×${T}/${V}`, sol_3:`P = ${ans} atm` };
    } else if(mode==='findV'){
      const r=parseFloat((n*R*T/P).toFixed(3)); const ans=toSigFigs(r,sf);
      return { q:`${n} mol of gas at ${P} atm and ${T} K. What is the volume?`,
        given_keys:'n|P|T|R', given_vals_display:`${n} mol|${P} atm|${T} K|0.08206 L·atm/mol·K`,
        answer_raw:r, answer_display:ans, answer_sig_figs:sf, tolerance:0.05, unit:'L', type:'numeric',
        hint:'PV = nRT → V = nRT/P',
        sol_1:'V = nRT/P', sol_2:`V = ${n}×0.08206×${T}/${P}`, sol_3:`V = ${ans} L` };
    } else if(mode==='findN'){
      const r=parseFloat((P*V/(R*T)).toFixed(4)); const ans=toSigFigs(r,sf);
      return { q:`A gas occupies ${V} L at ${P} atm and ${T} K. How many moles are present?`,
        given_keys:'P|V|T|R', given_vals_display:`${P} atm|${V} L|${T} K|0.08206 L·atm/mol·K`,
        answer_raw:r, answer_display:ans, answer_sig_figs:sf, tolerance:0.02, unit:'mol', type:'numeric',
        hint:'PV = nRT → n = PV/RT',
        sol_1:'n = PV/RT', sol_2:`n = ${P}×${V}/(0.08206×${T})`, sol_3:`n = ${ans} mol` };
    } else {
      const r=parseFloat((P*V/(n*R)).toFixed(1)); const ans=toSigFigs(r,3);
      return { q:`${n} mol of gas at ${P} atm occupies ${V} L. What is the temperature?`,
        given_keys:'n|P|V|R', given_vals_display:`${n} mol|${P} atm|${V} L|0.08206 L·atm/mol·K`,
        answer_raw:r, answer_display:ans, answer_sig_figs:3, tolerance:1, unit:'K', type:'numeric',
        hint:'PV = nRT → T = PV/(nR)',
        sol_1:'T = PV/(nR)', sol_2:`T = ${P}×${V}/(${n}×0.08206)`, sol_3:`T = ${ans} K` };
    }
  },

  /* ── Molarity / Concentration ───────────────────────────── */
  molarity: () => {
    const sf=3, mode=randPick(['findM','findMoles','findVol']);
    const moles=randFloat(0.10,5.00,2), vol_L=randFloat(0.100,2.000,3);
    const vol_mL=Math.round(vol_L*1000), M=parseFloat((moles/vol_L).toFixed(4));
    if(mode==='findM'){
      const ans=toSigFigs(M,sf);
      return { q:`${moles} mol of solute is dissolved in ${vol_mL} mL of solution. What is the molarity?`,
        given_keys:'moles|volume', given_vals_display:`${moles} mol|${vol_mL} mL`,
        answer_raw:M, answer_display:ans, answer_sig_figs:sf, tolerance:0.01, unit:'M', type:'numeric',
        hint:'M = moles / volume(L). Convert mL → L first.',
        sol_1:`Convert: ${vol_mL} mL = ${vol_L} L`, sol_2:'M = moles / V(L)', sol_3:`M = ${moles}/${vol_L} = ${ans} M` };
    } else if(mode==='findMoles'){
      const ans=toSigFigs(moles,sf);
      return { q:`How many moles of solute are in ${vol_mL} mL of a ${toSigFigs(M,sf)} M solution?`,
        given_keys:'M|volume', given_vals_display:`${toSigFigs(M,sf)} M|${vol_mL} mL`,
        answer_raw:moles, answer_display:ans, answer_sig_figs:sf, tolerance:0.01, unit:'mol', type:'numeric',
        hint:'moles = M × V(L). Convert mL → L.',
        sol_1:`V = ${vol_mL} mL = ${vol_L} L`, sol_2:`moles = ${toSigFigs(M,sf)} × ${vol_L}`, sol_3:`moles = ${ans} mol` };
    } else {
      const ans=toSigFigs(vol_L,sf);
      return { q:`What volume (in L) of a ${toSigFigs(M,sf)} M solution contains ${moles} mol of solute?`,
        given_keys:'M|moles', given_vals_display:`${toSigFigs(M,sf)} M|${moles} mol`,
        answer_raw:vol_L, answer_display:ans, answer_sig_figs:sf, tolerance:0.005, unit:'L', type:'numeric',
        hint:'V = moles / M.',
        sol_1:`V = moles / M`, sol_2:`V = ${moles} / ${toSigFigs(M,sf)}`, sol_3:`V = ${ans} L` };
    }
  },

  /* ── Dilution: M₁V₁ = M₂V₂ ─────────────────────────────── */
  dilution: () => {
    const sf=3;
    const M1=randFloat(1.0,10.0,2);
    const V1_mL=randPick([10,15,20,25,50]);
    const V2_mL=randPick([100,150,200,250,500,1000].filter(v=>v>V1_mL));
    const M2=parseFloat((M1*V1_mL/V2_mL).toFixed(4));
    const ans=toSigFigs(M2,sf);
    return {
      q:`${V1_mL} mL of a ${M1} M solution is diluted to a total volume of ${V2_mL} mL. What is the new molarity?`,
      given_keys:'M₁|V₁|V₂', given_vals_display:`${M1} M|${V1_mL} mL|${V2_mL} mL`,
      answer_raw:M2, answer_display:ans, answer_sig_figs:sf, tolerance:0.005,
      unit:'M', type:'numeric',
      hint:'M₁V₁ = M₂V₂. No need to convert if both volumes use the same unit.',
      sol_1:'M₁V₁ = M₂V₂ → M₂ = M₁V₁/V₂',
      sol_2:`M₂ = ${M1} × ${V1_mL} / ${V2_mL}`,
      sol_3:`M₂ = ${ans} M`,
    };
  },

  /* ── Titration: Monoprotic (strong acid + strong base) ──── */
  titration_monoprotic: () => {
    const sf=3;
    const pairs=[
      {acid:'HCl', base:'NaOH',product:'NaCl + H₂O'},
      {acid:'HNO₃',base:'KOH', product:'KNO₃ + H₂O'},
      {acid:'HBr', base:'NaOH',product:'NaBr + H₂O'},
      {acid:'HCl', base:'LiOH',product:'LiCl + H₂O'},
    ];
    const pair=randPick(pairs);
    const M_acid=randFloat(0.100,2.000,3), V_acid_mL=randPick([10,15,20,25]);
    const M_base=randFloat(0.100,2.000,3);
    const V_base_mL=parseFloat((M_acid*V_acid_mL/M_base).toFixed(2));
    const ans=toSigFigs(V_base_mL,sf);
    return {
      q:`In a titration, ${V_acid_mL} mL of ${M_acid} M ${pair.acid} is titrated with ${M_base} M ${pair.base}. What volume of ${pair.base} is needed to reach the equivalence point?`,
      given_keys:`M(${pair.acid})|V(${pair.acid})|M(${pair.base})`,
      given_vals_display:`${M_acid} M|${V_acid_mL} mL|${M_base} M`,
      answer_raw:V_base_mL, answer_display:ans, answer_sig_figs:sf, tolerance:0.1,
      unit:'mL', type:'numeric',
      hint:`At equivalence: moles acid = moles base (1:1 ratio). moles = M × V.`,
      sol_1:`Balanced equation: ${pair.acid} + ${pair.base} → ${pair.product}  (1:1 ratio)`,
      sol_2:`moles ${pair.acid} = ${M_acid} M × ${V_acid_mL}/1000 L = ${toSigFigs(M_acid*V_acid_mL/1000,sf)} mol`,
      sol_3:`V(${pair.base}) = moles / M = ${toSigFigs(M_acid*V_acid_mL/1000,sf)} / ${M_base} = ${toSigFigs(V_base_mL/1000,sf)} L`,
      sol_4:`V(${pair.base}) = ${ans} mL`,
    };
  },

  /* ── Titration: Diprotic acid ───────────────────────────── */
  titration_diprotic: () => {
    const sf=3;
    const acids=[
      {acid:'H₂SO₄', base:'NaOH',   ratio:2, product:'Na₂SO₄ + 2H₂O'},
      {acid:'H₂C₂O₄',base:'NaOH',   ratio:2, product:'Na₂C₂O₄ + 2H₂O'},
      {acid:'H₂SO₄', base:'Ca(OH)₂',ratio:1, product:'CaSO₄ + 2H₂O'},
      {acid:'H₂C₂O₄',base:'KOH',    ratio:2, product:'K₂C₂O₄ + 2H₂O'},
    ];
    const a=randPick(acids);
    const M_acid=randFloat(0.100,1.500,3), V_acid_mL=randPick([10,15,20,25]);
    const M_base=randFloat(0.100,2.000,3);
    const V_base_mL=parseFloat((a.ratio*M_acid*V_acid_mL/M_base).toFixed(2));
    const ans=toSigFigs(V_base_mL,sf);
    return {
      q:`${V_acid_mL} mL of ${M_acid} M ${a.acid} is titrated with ${M_base} M ${a.base}. What volume of ${a.base} is needed to fully neutralise the diprotic acid?`,
      given_keys:`M(${a.acid})|V(${a.acid})|M(${a.base})|ratio`,
      given_vals_display:`${M_acid} M|${V_acid_mL} mL|${M_base} M|${a.ratio}:1`,
      answer_raw:V_base_mL, answer_display:ans, answer_sig_figs:sf, tolerance:0.1,
      unit:'mL', type:'numeric',
      hint:`${a.acid} is diprotic — each mole reacts with ${a.ratio} moles of ${a.base}.`,
      sol_1:`${a.acid} + ${a.ratio}${a.base} → ${a.product}  (${a.ratio}:1 ratio)`,
      sol_2:`moles ${a.acid} = ${M_acid} × ${V_acid_mL}/1000 = ${toSigFigs(M_acid*V_acid_mL/1000,sf)} mol`,
      sol_3:`moles ${a.base} needed = ${a.ratio} × ${toSigFigs(M_acid*V_acid_mL/1000,sf)} = ${toSigFigs(a.ratio*M_acid*V_acid_mL/1000,sf)} mol`,
      sol_4:`V = ${ans} mL`,
    };
  },

  /* ── Stoichiometry: Mole–Mole ───────────────────────────── */
  stoichiometry_mole: () => {
    const rxns=[
      {eq:'2H₂ + O₂ → 2H₂O',        A:'H₂', B:'O₂',  cA:2, cB:1},
      {eq:'N₂ + 3H₂ → 2NH₃',         A:'N₂', B:'H₂',  cA:1, cB:3},
      {eq:'2Na + Cl₂ → 2NaCl',       A:'Na', B:'NaCl', cA:2, cB:2},
      {eq:'CH₄ + 2O₂ → CO₂ + 2H₂O', A:'CH₄',B:'CO₂', cA:1, cB:1},
      {eq:'2H₂O → 2H₂ + O₂',        A:'H₂O',B:'H₂',  cA:2, cB:2},
      {eq:'2Al + 3Cl₂ → 2AlCl₃',    A:'Al', B:'AlCl₃',cA:2, cB:2},
    ];
    const r=randPick(rxns), sf=3;
    const molesA=randFloat(0.50,10.0,2);
    const molesB=parseFloat((molesA*r.cB/r.cA).toFixed(4));
    const ans=toSigFigs(molesB,sf);
    return {
      q:`Given the reaction: ${r.eq} — how many moles of ${r.B} are produced/consumed when ${molesA} mol of ${r.A} reacts completely?`,
      given_keys:`moles ${r.A}|ratio ${r.A}:${r.B}`,
      given_vals_display:`${molesA} mol|${r.cA}:${r.cB}`,
      answer_raw:molesB, answer_display:ans, answer_sig_figs:sf, tolerance:0.02,
      unit:`mol ${r.B}`, type:'numeric',
      hint:`Use the mole ratio: ${r.cA} mol ${r.A} : ${r.cB} mol ${r.B}`,
      sol_1:`Balanced: ${r.eq}`,
      sol_2:`Mole ratio: ${r.cA} mol ${r.A} = ${r.cB} mol ${r.B}`,
      sol_3:`moles ${r.B} = ${molesA} × ${r.cB}/${r.cA} = ${ans} mol`,
    };
  },

  /* ── pH Calculations ────────────────────────────────────── */
  ph_calc: () => {
    const sf=2, mode=randPick(['from_H','from_pH','pOH']);
    if(mode==='from_H'){
      const exp=randPick([-1,-2,-3,-4,-5,-6]), coef=randFloat(1.0,9.9,1);
      const H=coef*Math.pow(10,exp), pH=parseFloat((-Math.log10(H)).toFixed(2));
      return {
        q:`Calculate the pH of a solution with [H⁺] = ${coef} × 10^${exp} M.`,
        given_keys:'[H⁺]', given_vals_display:`${coef}×10^${exp} M`,
        answer_raw:pH, answer_display:String(pH), answer_sig_figs:sf, tolerance:0.02, unit:'', type:'numeric',
        hint:'pH = –log[H⁺].',
        sol_1:`pH = –log(${coef} × 10^${exp})`, sol_2:`pH = –(log(${coef}) + ${exp})`, sol_3:`pH = ${pH}`,
      };
    } else if(mode==='from_pH'){
      const pH=randFloat(1.0,13.0,1), H=parseFloat(Math.pow(10,-pH).toExponential(2));
      return {
        q:`A solution has pH = ${pH}. Calculate [H⁺].`,
        given_keys:'pH', given_vals_display:String(pH),
        answer_raw:H, answer_display:H.toExponential(2), answer_sig_figs:sf, tolerance:H*0.1, unit:'M', type:'numeric',
        hint:'[H⁺] = 10^(−pH)',
        sol_1:`[H⁺] = 10^(−${pH})`, sol_2:`[H⁺] = ${H.toExponential(2)} M`, sol_3:'',
      };
    } else {
      const pOH=randFloat(1.0,13.0,1), pH=parseFloat((14-pOH).toFixed(1));
      return {
        q:`A solution has pOH = ${pOH} at 25 °C. What is the pH?`,
        given_keys:'pOH', given_vals_display:String(pOH),
        answer_raw:pH, answer_display:String(pH), answer_sig_figs:sf, tolerance:0.02, unit:'', type:'numeric',
        hint:'At 25 °C: pH + pOH = 14',
        sol_1:'pH + pOH = 14', sol_2:`pH = 14 − ${pOH}`, sol_3:`pH = ${pH}`,
      };
    }
  },

  /* ── Percent Composition ────────────────────────────────── */
  percent_composition: () => {
    const compounds=[
      {name:'H₂O',  elements:[{el:'H',n:2,mass:1.008},{el:'O',n:1,mass:15.999}]},
      {name:'CO₂',  elements:[{el:'C',n:1,mass:12.011},{el:'O',n:2,mass:15.999}]},
      {name:'NH₃',  elements:[{el:'N',n:1,mass:14.007},{el:'H',n:3,mass:1.008}]},
      {name:'NaCl', elements:[{el:'Na',n:1,mass:22.990},{el:'Cl',n:1,mass:35.453}]},
      {name:'CaCO₃',elements:[{el:'Ca',n:1,mass:40.078},{el:'C',n:1,mass:12.011},{el:'O',n:3,mass:15.999}]},
      {name:'Fe₂O₃',elements:[{el:'Fe',n:2,mass:55.845},{el:'O',n:3,mass:15.999}]},
    ];
    const c=randPick(compounds);
    const molarMass=c.elements.reduce((s,e)=>s+e.n*e.mass,0);
    const target=randPick(c.elements);
    const pct=parseFloat((target.n*target.mass/molarMass*100).toFixed(2));
    const ans=toSigFigs(pct,3);
    return {
      q:`What is the percent composition by mass of ${target.el} in ${c.name}?`,
      given_keys:`Molar mass ${c.name}|mass ${target.el}`,
      given_vals_display:`${molarMass.toFixed(3)} g/mol|${(target.n*target.mass).toFixed(3)} g/mol`,
      answer_raw:pct, answer_display:ans, answer_sig_figs:3, tolerance:0.1,
      unit:'%', type:'numeric',
      hint:`%comp = (mass of element / molar mass of compound) × 100`,
      sol_1:`Molar mass ${c.name} = ${molarMass.toFixed(3)} g/mol`,
      sol_2:`Mass of ${target.el} = ${target.n} × ${target.mass} = ${(target.n*target.mass).toFixed(3)} g/mol`,
      sol_3:`%${target.el} = ${(target.n*target.mass).toFixed(3)} / ${molarMass.toFixed(3)} × 100 = ${ans}%`,
    };
  },

};

/**
 * Generate a randomised question variant from a template question object.
 * Returns a new question object; does not mutate the original.
 * Returns null if no randomizer is registered for templateQ.randomizer_type.
 */
function generateVariant(templateQ){
  const type = templateQ?.randomizer_type;
  if(!type || !RANDOMIZER_REGISTRY[type]) return null;
  const overrides = RANDOMIZER_REGISTRY[type]();
  return {
    ...templateQ,
    ...overrides,
    // Preserve identity fields from the template
    id:             templateQ.id,
    variant_group:  templateQ.variant_group,
    chapter:        templateQ.chapter,
    topic:          templateQ.topic,
    cat:            templateQ.cat,
    pts:            templateQ.pts,
    randomizer_type: type,
    _is_generated:  true,
  };
}
