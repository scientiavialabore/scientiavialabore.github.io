// cr-chem-formula.js
// Chemical Formula Lab — full self-contained module mounted into #formula-screen
// Extracted from chem-formula-lab__2_.html and adapted for StudyReview shell.
// Depends on: cr-core.js (showScreen, showHub)
// Load order: after cr-vocab-engine.js, before cr-planner.js

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// IIFE — all state and helpers are private; only startChemFormula is exported
// ═══════════════════════════════════════════════════════════════════════════════
(function () {

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────

const POLY_CATIONS = [
  { id:'nh4',  name:'Ammonium',             formula:'NH₄',  charge:+1, chargeStr:'+1' },
  { id:'h3o',  name:'Hydronium',            formula:'H₃O⁺', charge:+1, chargeStr:'+1' },
  { id:'hg22', name:'Mercury(I) diatomic',  formula:'Hg₂',  charge:+2, chargeStr:'+2' },
];

const ANION_GROUPS = [
  { id:'hydride', name:'Hydride', members:[
    { id:'hydride1', name:'Hydride', formula:'H', charge:-1, chargeStr:'−1' },
  ]},
  { id:'nitrogen', name:'Nitrogen Oxyanions', members:[
    { id:'no3', name:'Nitrate',   formula:'NO₃', charge:-1, chargeStr:'−1' },
    { id:'no2', name:'Nitrite',   formula:'NO₂', charge:-1, chargeStr:'−1' },
  ]},
  { id:'chlorine', name:'Chlorine Oxyanions', members:[
    { id:'clo4', name:'Perchlorate',  formula:'ClO₄', charge:-1, chargeStr:'−1' },
    { id:'clo3', name:'Chlorate',     formula:'ClO₃', charge:-1, chargeStr:'−1' },
    { id:'clo2', name:'Chlorite',     formula:'ClO₂', charge:-1, chargeStr:'−1' },
    { id:'clo',  name:'Hypochlorite', formula:'ClO',  charge:-1, chargeStr:'−1' },
  ]},
  { id:'sulfur', name:'Sulfur Oxyanions', members:[
    { id:'so4',  name:'Sulfate',     formula:'SO₄',  charge:-2, chargeStr:'−2' },
    { id:'so3',  name:'Sulfite',     formula:'SO₃',  charge:-2, chargeStr:'−2' },
    { id:'s2o3', name:'Thiosulfate', formula:'S₂O₃', charge:-2, chargeStr:'−2' },
  ]},
  { id:'phosphorus', name:'Phosphorus Oxyanions', members:[
    { id:'po4',   name:'Phosphate',           formula:'PO₄',   charge:-3, chargeStr:'−3' },
    { id:'po3',   name:'Phosphite',            formula:'PO₃',   charge:-3, chargeStr:'−3' },
    { id:'hpo4',  name:'Hydrogen Phosphate',   formula:'HPO₄',  charge:-2, chargeStr:'−2' },
    { id:'h2po4', name:'Dihydrogen Phosphate', formula:'H₂PO₄', charge:-1, chargeStr:'−1' },
  ]},
  { id:'carbon', name:'Carbon-based', members:[
    { id:'co3',    name:'Carbonate',   formula:'CO₃',     charge:-2, chargeStr:'−2' },
    { id:'hco3',   name:'Bicarbonate', formula:'HCO₃',    charge:-1, chargeStr:'−1' },
    { id:'c2h3o2', name:'Acetate',     formula:'C₂H₃O₂', charge:-1, chargeStr:'−1' },
    { id:'cn',     name:'Cyanide',     formula:'CN',       charge:-1, chargeStr:'−1' },
  ]},
  { id:'other', name:'Other', members:[
    { id:'oh',   name:'Hydroxide',    formula:'OH',    charge:-1, chargeStr:'−1' },
    { id:'mno4', name:'Permanganate', formula:'MnO₄',  charge:-1, chargeStr:'−1' },
    { id:'cr2o7',name:'Dichromate',   formula:'Cr₂O₇', charge:-2, chargeStr:'−2' },
    { id:'cro4', name:'Chromate',     formula:'CrO₄',  charge:-2, chargeStr:'−2' },
    { id:'o2',   name:'Peroxide',     formula:'O₂',    charge:-2, chargeStr:'−2' },
    { id:'sio4', name:'Silicate',     formula:'SiO₄',  charge:-4, chargeStr:'−4' },
    { id:'aso4', name:'Arsenate',     formula:'AsO₄',  charge:-3, chargeStr:'−3' },
  ]},
];

const TRANSITION_METALS = [
  { id:'fe2', name:'Iron(II)',       symbol:'Fe', atomicNum:26, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'fe3', name:'Iron(III)',      symbol:'Fe', atomicNum:26, charge:+3, chargeStr:'+3', roman:'III' },
  { id:'cu1', name:'Copper(I)',      symbol:'Cu', atomicNum:29, charge:+1, chargeStr:'+1', roman:'I'   },
  { id:'cu2', name:'Copper(II)',     symbol:'Cu', atomicNum:29, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'sn2', name:'Tin(II)',        symbol:'Sn', atomicNum:50, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'sn4', name:'Tin(IV)',        symbol:'Sn', atomicNum:50, charge:+4, chargeStr:'+4', roman:'IV'  },
  { id:'pb2', name:'Lead(II)',       symbol:'Pb', atomicNum:82, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'pb4', name:'Lead(IV)',       symbol:'Pb', atomicNum:82, charge:+4, chargeStr:'+4', roman:'IV'  },
  { id:'mn2', name:'Manganese(II)',  symbol:'Mn', atomicNum:25, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'mn4', name:'Manganese(IV)',  symbol:'Mn', atomicNum:25, charge:+4, chargeStr:'+4', roman:'IV'  },
  { id:'mn7', name:'Manganese(VII)', symbol:'Mn', atomicNum:25, charge:+7, chargeStr:'+7', roman:'VII' },
  { id:'cr2', name:'Chromium(II)',   symbol:'Cr', atomicNum:24, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'cr3', name:'Chromium(III)',  symbol:'Cr', atomicNum:24, charge:+3, chargeStr:'+3', roman:'III' },
  { id:'co2', name:'Cobalt(II)',     symbol:'Co', atomicNum:27, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'co3x',name:'Cobalt(III)',    symbol:'Co', atomicNum:27, charge:+3, chargeStr:'+3', roman:'III' },
  { id:'ni2', name:'Nickel(II)',     symbol:'Ni', atomicNum:28, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'hg1', name:'Mercury(I)',     symbol:'Hg', atomicNum:80, charge:+1, chargeStr:'+1', roman:'I'   },
  { id:'hg2', name:'Mercury(II)',    symbol:'Hg', atomicNum:80, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'au1', name:'Gold(I)',        symbol:'Au', atomicNum:79, charge:+1, chargeStr:'+1', roman:'I'   },
  { id:'au3', name:'Gold(III)',      symbol:'Au', atomicNum:79, charge:+3, chargeStr:'+3', roman:'III' },
  { id:'ag1', name:'Silver',         symbol:'Ag', atomicNum:47, charge:+1, chargeStr:'+1', roman:''    },
  { id:'zn2', name:'Zinc',           symbol:'Zn', atomicNum:30, charge:+2, chargeStr:'+2', roman:''    },
  { id:'ti3', name:'Titanium(III)',  symbol:'Ti', atomicNum:22, charge:+3, chargeStr:'+3', roman:'III' },
  { id:'ti4', name:'Titanium(IV)',   symbol:'Ti', atomicNum:22, charge:+4, chargeStr:'+4', roman:'IV'  },
  { id:'v2',  name:'Vanadium(II)',   symbol:'V',  atomicNum:23, charge:+2, chargeStr:'+2', roman:'II'  },
  { id:'v3',  name:'Vanadium(III)',  symbol:'V',  atomicNum:23, charge:+3, chargeStr:'+3', roman:'III' },
  { id:'v5',  name:'Vanadium(V)',    symbol:'V',  atomicNum:23, charge:+5, chargeStr:'+5', roman:'V'   },
];

const EL = {
  1:['H','Hydrogen','nonmetal'],2:['He','Helium','noble'],3:['Li','Lithium','alkali'],
  4:['Be','Beryllium','alkaline'],5:['B','Boron','metalloid'],6:['C','Carbon','nonmetal'],
  7:['N','Nitrogen','nonmetal'],8:['O','Oxygen','nonmetal'],9:['F','Fluorine','halogen'],
  10:['Ne','Neon','noble'],11:['Na','Sodium','alkali'],12:['Mg','Magnesium','alkaline'],
  13:['Al','Aluminum','post'],14:['Si','Silicon','metalloid'],15:['P','Phosphorus','nonmetal'],
  16:['S','Sulfur','nonmetal'],17:['Cl','Chlorine','halogen'],18:['Ar','Argon','noble'],
  19:['K','Potassium','alkali'],20:['Ca','Calcium','alkaline'],21:['Sc','Scandium','transition'],
  22:['Ti','Titanium','transition'],23:['V','Vanadium','transition'],24:['Cr','Chromium','transition'],
  25:['Mn','Manganese','transition'],26:['Fe','Iron','transition'],27:['Co','Cobalt','transition'],
  28:['Ni','Nickel','transition'],29:['Cu','Copper','transition'],30:['Zn','Zinc','transition'],
  31:['Ga','Gallium','post'],32:['Ge','Germanium','metalloid'],33:['As','Arsenic','metalloid'],
  34:['Se','Selenium','nonmetal'],35:['Br','Bromine','halogen'],36:['Kr','Krypton','noble'],
  37:['Rb','Rubidium','alkali'],38:['Sr','Strontium','alkaline'],39:['Y','Yttrium','transition'],
  40:['Zr','Zirconium','transition'],41:['Nb','Niobium','transition'],42:['Mo','Molybdenum','transition'],
  43:['Tc','Technetium','transition'],44:['Ru','Ruthenium','transition'],45:['Rh','Rhodium','transition'],
  46:['Pd','Palladium','transition'],47:['Ag','Silver','transition'],48:['Cd','Cadmium','transition'],
  49:['In','Indium','post'],50:['Sn','Tin','post'],51:['Sb','Antimony','metalloid'],
  52:['Te','Tellurium','metalloid'],53:['I','Iodine','halogen'],54:['Xe','Xenon','noble'],
  55:['Cs','Cesium','alkali'],56:['Ba','Barium','alkaline'],57:['La','Lanthanum','lanthanide'],
  58:['Ce','Cerium','lanthanide'],59:['Pr','Praseodymium','lanthanide'],60:['Nd','Neodymium','lanthanide'],
  61:['Pm','Promethium','lanthanide'],62:['Sm','Samarium','lanthanide'],63:['Eu','Europium','lanthanide'],
  64:['Gd','Gadolinium','lanthanide'],65:['Tb','Terbium','lanthanide'],66:['Dy','Dysprosium','lanthanide'],
  67:['Ho','Holmium','lanthanide'],68:['Er','Erbium','lanthanide'],69:['Tm','Thulium','lanthanide'],
  70:['Yb','Ytterbium','lanthanide'],71:['Lu','Lutetium','lanthanide'],72:['Hf','Hafnium','transition'],
  73:['Ta','Tantalum','transition'],74:['W','Tungsten','transition'],75:['Re','Rhenium','transition'],
  76:['Os','Osmium','transition'],77:['Ir','Iridium','transition'],78:['Pt','Platinum','transition'],
  79:['Au','Gold','transition'],80:['Hg','Mercury','transition'],81:['Tl','Thallium','post'],
  82:['Pb','Lead','post'],83:['Bi','Bismuth','post'],84:['Po','Polonium','metalloid'],
  85:['At','Astatine','halogen'],86:['Rn','Radon','noble'],87:['Fr','Francium','alkali'],
  88:['Ra','Radium','alkaline'],89:['Ac','Actinium','actinide'],90:['Th','Thorium','actinide'],
  91:['Pa','Protactinium','actinide'],92:['U','Uranium','actinide'],93:['Np','Neptunium','actinide'],
  94:['Pu','Plutonium','actinide'],95:['Am','Americium','actinide'],96:['Cm','Curium','actinide'],
  97:['Bk','Berkelium','actinide'],98:['Cf','Californium','actinide'],99:['Es','Einsteinium','actinide'],
  100:['Fm','Fermium','actinide'],101:['Md','Mendelevium','actinide'],102:['No','Nobelium','actinide'],
  103:['Lr','Lawrencium','actinide'],104:['Rf','Rutherfordium','transition'],105:['Db','Dubnium','transition'],
  106:['Sg','Seaborgium','transition'],107:['Bh','Bohrium','transition'],108:['Hs','Hassium','transition'],
  109:['Mt','Meitnerium','transition'],110:['Ds','Darmstadtium','transition'],111:['Rg','Roentgenium','transition'],
  112:['Cn','Copernicium','transition'],113:['Nh','Nihonium','post'],114:['Fl','Flerovium','post'],
  115:['Mc','Moscovium','post'],116:['Lv','Livermorium','post'],117:['Ts','Tennessine','halogen'],
  118:['Og','Oganesson','noble'],
};

const SIMPLE_CATIONS = {1:1,3:1,11:1,19:1,37:1,55:1,87:1,4:2,12:2,20:2,38:2,56:2,88:2,13:3};
const SIMPLE_ANIONS  = {8:-2,16:-2,34:-2,7:-3,15:-3,6:-4,9:-1,17:-1,35:-1,53:-1,85:-1};

const PT_LAYOUT = [
  [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,'H-', 2],
  [ 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 9,10],
  [11,12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,13,14,15,16,17,18],
  [19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36],
  [37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54],
  [55,56,57,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86],
  [87,88,89,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118],
];

const SUB = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
const SUP = ['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹'];

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

const ST = {
  mode:'naming', studyMode:'browse',
  cation:null, anion:null,
  answer:'', result:null, score:0, total:0, streak:0, showHint:false,
  showIons:false,
  showNames:false,
  enabledCations: new Set(POLY_CATIONS.map(x=>x.id)),
  enabledAnions:  new Set(ANION_GROUPS.flatMap(g=>g.members).map(x=>x.id)),
  enabledTrans:   new Set(TRANSITION_METALS.map(x=>x.id)),
  openGroups:     new Set(),
};

const QZ = {
  problems:[], idx:0, score:0, answers:[], answer:'', result:null, showHint:false, count:10,
  quizType:'naming',   // 'naming' | 'formula'
  filterSimple:true,
  filterTrans:false,
  filterAcids:false,
  filterPoly:false,
};

let _cpOpen = false;

// ─────────────────────────────────────────────────────────────────────────────
// MATH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b];}return a;}
function lcm(a,b){return(a*b)/gcd(a,b);}
function toRoman(n){const m=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let r='';for(const[v,s]of m){while(n>=v){r+=s;n-=v;}}return r;}
function numSub(n){return String(n).split('').map(d=>SUB[+d]).join('');}
function numSup(n){return String(n).split('').map(d=>SUP[+d]).join('');}
function stripUni(s){let r=s;SUB.forEach((c,i)=>{r=r.split(c).join(i);});SUP.forEach((c,i)=>{r=r.split(c).join(i);});return r.replace(/⁺/g,'+').replace(/⁻/g,'-');}
function normF(s){return stripUni(s).replace(/\s/g,'');}
function normN(s){return s.toLowerCase().replace(/\s+/g,' ').trim();}
function rf(f){return String(f).replace(/[₀₁₂₃₄₅₆₇₈₉]+/g,m=>`<sub style="font-size:.72em">${m}</sub>`);}

// ─────────────────────────────────────────────────────────────────────────────
// ION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function ionFormula(ion){
  if(!ion)return '';
  if(ion.id==='el1h-')return 'H';
  if(ion.type==='poly'||ion.type==='polyCat')return ion.formula;
  if(ion.type==='transition')return ion.symbol;
  return EL[ion.atomicNum]?.[0]||'';
}
function ionName(ion){return ion?ion.name:'';}
function ionCharge(ion){return ion?ion.charge:0;}
function isPoly(ion){return ion&&(ion.type==='poly'||ion.type==='polyCat');}

function buildFormula(cat,an){
  if(!cat||!an)return '';
  const cC=Math.abs(ionCharge(cat)),aC=Math.abs(ionCharge(an));
  if(!cC||!aC)return '?';
  const L=lcm(cC,aC),cS=L/cC,aS=L/aC;
  const cF=ionFormula(cat),aF=ionFormula(an);
  const cp=cS>1&&isPoly(cat)?`(${cF})${numSub(cS)}`:cF+(cS>1?numSub(cS):'');
  const ap=aS>1&&isPoly(an)?`(${aF})${numSub(aS)}`:aF+(aS>1?numSub(aS):'');
  return cp+ap;
}

function buildName(cat,an){
  if(!cat||!an)return '';
  if(an.id==='el1h-'){return ionName(cat)+' Hydride';}
  if((cat.type==='element'&&cat.atomicNum===1&&cat.charge===1)||(cat.type==='polyCat'&&cat.id==='h3o')){
    return buildAcidName(an);
  }
  return ionName(cat)+' '+anionSuffix(an);
}

function buildAcidName(an){
  if(!an)return '';
  if(an.type==='poly'){
    const nm=an.name.toLowerCase();
    if(nm.endsWith('ate'))return nm.slice(0,-3)+'ic acid';
    if(nm.endsWith('ite'))return nm.slice(0,-3)+'ous acid';
    return nm+' acid';
  }
  const raw=EL[an.atomicNum]?.[1]||an.name;
  const lower=raw.toLowerCase();
  const stems={'oxygen':'ox','sulfur':'sulf','phosphorus':'phosph','nitrogen':'nitr','fluorine':'fluor','chlorine':'chlor','bromine':'brom','iodine':'iod','astatine':'astat','carbon':'carb','hydrogen':'hydr','selenium':'selen','tellurium':'tellur','arsenic':'arsen','silicon':'silic'};
  const stem=stems[lower]||(lower.replace(/ine$/,'').replace(/ogen$/,'').replace(/on$/,'').replace(/ur$/,'').replace(/[aeiou]+$/,''));
  return 'hydro'+stem+'ic acid';
}

function anionSuffix(an){
  if(!an)return '';
  if(an.type==='poly')return an.name;
  const raw=EL[an.atomicNum]?.[1]||an.name;
  const lower=raw.toLowerCase();
  const stems={'oxygen':'ox','sulfur':'sulf','phosphorus':'phosph','nitrogen':'nitr','fluorine':'fluor','chlorine':'chlor','bromine':'brom','iodine':'iod','astatine':'astat','carbon':'carb','hydrogen':'hydr','selenium':'selen','tellurium':'tellur','arsenic':'arsen','silicon':'silic'};
  const stem=stems[lower]||(lower.replace(/ine$/,'').replace(/ogen$/,'').replace(/on$/,'').replace(/ur$/,'').replace(/[aeiou]+$/,''));
  return stem.charAt(0).toUpperCase()+stem.slice(1)+'ide';
}

function POLY_ANIONS_FLAT(){return ANION_GROUPS.flatMap(g=>g.members);}

// ─────────────────────────────────────────────────────────────────────────────
// GETTERS (scoped to the formula-screen DOM subtree)
// ─────────────────────────────────────────────────────────────────────────────

function $fl(id){return document.getElementById('fl-'+id);}

// ─────────────────────────────────────────────────────────────────────────────
// CSS — injected once into <head>
// ─────────────────────────────────────────────────────────────────────────────

function _injectCSS(){
  if(document.getElementById('fl-styles'))return;
  const s=document.createElement('style');
  s.id='fl-styles';
  s.textContent=`
/* ══ Formula Lab — scoped under #formula-screen ══════════════════════════════
   Font scaling: --fl-scale drives calc() on every px value.
   The slider sets --fl-scale on #formula-screen directly.
   All font-sizes, padding, etc. below multiply by var(--fl-scale,1).
══════════════════════════════════════════════════════════════════════════════ */
#formula-screen {
  --fl-scale: 1.5;
  font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
  background:#0f1117;
  color:#f1f5f9;
  position:fixed;
  inset:0;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  font-size:calc(13px * var(--fl-scale));
  box-sizing:border-box;
  z-index:100;
}
/* HEADER */
#fl-header {
  background:#0d1120;
  color:white;
  padding:calc(6px * var(--fl-scale)) calc(12px * var(--fl-scale));
  display:flex;
  align-items:center;
  gap:calc(6px * var(--fl-scale));
  flex-shrink:0;
  border-bottom:2px solid #3b82f6;
  flex-wrap:wrap;
  row-gap:4px;
}
#fl-header h1 {
  font-size:calc(14px * var(--fl-scale));
  font-weight:700;
  letter-spacing:-0.02em;
  flex:1;
  white-space:nowrap;
  color:#f1f5f9;
}
.fl-back-btn {
  background:rgba(255,255,255,0.07);
  border:1px solid rgba(255,255,255,0.15);
  border-radius:calc(5px * var(--fl-scale));
  padding:calc(4px * var(--fl-scale)) calc(9px * var(--fl-scale));
  color:rgba(255,255,255,0.65);
  font-size:calc(10px * var(--fl-scale));
  cursor:pointer;
  white-space:nowrap;
}
.fl-back-btn:hover{background:rgba(255,255,255,0.13);color:white;}
.fl-hdr-tabs,.fl-study-tabs{display:flex;gap:2px;}
.fl-hdr-tab,.fl-study-tab{
  padding:calc(4px * var(--fl-scale)) calc(10px * var(--fl-scale));
  border-radius:5px;
  border:1px solid rgba(255,255,255,0.12);
  background:transparent;
  color:rgba(255,255,255,0.5);
  font-size:calc(11px * var(--fl-scale));
  font-weight:600;
  cursor:pointer;
  transition:all 0.12s;
  white-space:nowrap;
}
.fl-hdr-tab.active{background:#3b82f6;color:white;border-color:#3b82f6;}
.fl-study-tab.active{background:#1a3a5c;color:#93c5fd;border-color:#2563eb;}
.fl-hdr-tab:hover:not(.active),.fl-study-tab:hover:not(.active){background:rgba(255,255,255,0.08);color:white;}
.fl-hdr-div{width:1px;height:22px;background:rgba(255,255,255,0.12);flex-shrink:0;}
.fl-manage-btn{
  background:rgba(255,255,255,0.07);
  border:1px solid rgba(255,255,255,0.15);
  border-radius:5px;
  padding:calc(4px * var(--fl-scale)) calc(9px * var(--fl-scale));
  color:rgba(255,255,255,0.65);
  font-size:calc(10px * var(--fl-scale));
  cursor:pointer;
}
.fl-manage-btn:hover{background:rgba(255,255,255,0.13);color:white;}
.fl-score-bar{display:flex;align-items:center;gap:5px;font-size:calc(10px * var(--fl-scale));color:rgba(255,255,255,0.45);margin-left:4px;}
.fl-score-chip{background:rgba(255,255,255,0.1);border-radius:4px;padding:2px 7px;font-weight:700;color:white;font-size:calc(11px * var(--fl-scale));}
.fl-slider-wrap{display:flex;align-items:center;gap:5px;flex-shrink:0;}
.fl-slider-wrap span{font-size:calc(10px * var(--fl-scale));color:rgba(255,255,255,0.4);font-weight:700;}
#fl-font-slider{width:60px;cursor:pointer;accent-color:#3b82f6;}

/* LAYOUT */
#fl-main{flex:1;display:grid;grid-template-rows:2fr 1fr;min-height:0;overflow:hidden;}
#fl-top-half{display:grid;grid-template-columns:calc(160px * var(--fl-scale)) 1fr calc(240px * var(--fl-scale));min-height:0;border-bottom:2px solid #2d3348;overflow:hidden;}
.fl-col{display:flex;flex-direction:column;min-height:0;overflow:hidden;min-width:0;}
.fl-col-left{border-right:1px solid #2d3348;}
.fl-col-mid{border-right:1px solid #2d3348;background:#181c27;}
.fl-col-label{
  padding:calc(5px * var(--fl-scale)) calc(9px * var(--fl-scale));
  font-size:calc(9.5px * var(--fl-scale));
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.08em;
  display:flex;
  align-items:center;
  justify-content:space-between;
  flex-shrink:0;
  border-bottom:1px solid rgba(0,0,0,0.3);
}
.fl-col-label.cat-lbl{background:#0d1f3a;color:#93c5fd;}
.fl-col-label.pt-lbl{background:#131720;color:#94a3b8;}
.fl-col-label.an-lbl{background:#1f0808;color:#fca5a5;}
.fl-col-sublabel{font-size:calc(8px * var(--fl-scale));font-weight:400;opacity:0.7;text-transform:none;letter-spacing:0;}
.fl-rnd-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:2px 6px;font-size:calc(9px * var(--fl-scale));cursor:pointer;color:inherit;}
.fl-rnd-btn:hover{background:rgba(255,255,255,0.15);}
.fl-col-scroll{flex:1;overflow-y:auto;padding:5px;background:#181c27;}
.fl-col-scroll::-webkit-scrollbar{width:3px;}
.fl-col-scroll::-webkit-scrollbar-thumb{background:#3d4560;border-radius:2px;}

/* ION BUTTONS */
.fl-ion-btn{
  display:flex;align-items:center;width:100%;
  padding:calc(7px * var(--fl-scale)) calc(9px * var(--fl-scale));
  margin-bottom:3px;border-radius:7px;border:1.5px solid transparent;
  cursor:pointer;font-size:calc(11.5px * var(--fl-scale));
  font-family:inherit;text-align:left;transition:all 0.1s;gap:8px;
}
.fl-ion-btn-info{flex:1;min-width:0;}
.fl-ion-btn-name{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:calc(11.5px * var(--fl-scale));}
.fl-ion-btn-formula{display:block;font-family:'Consolas','Courier New',monospace;font-size:calc(10px * var(--fl-scale));opacity:0.55;margin-top:1px;}
.fl-ion-btn-charge{font-size:calc(11px * var(--fl-scale));font-weight:800;font-family:'Consolas','Courier New',monospace;flex-shrink:0;}
.fl-cation-btn{background:#1a2d4a;color:#93c5fd;border-color:#2d5a8e;}
.fl-cation-btn:hover{background:#1e3e60;border-color:#3b82f6;}
.fl-cation-btn.sel{background:#3b82f6;color:white;border-color:#2563eb;box-shadow:0 2px 8px rgba(59,130,246,0.4);}
.fl-anion-btn{background:#3b1111;color:#fca5a5;border-color:#7f1d1d;}
.fl-anion-btn:hover{background:#4a1515;border-color:#ef4444;}
.fl-anion-btn.sel{background:#ef4444;color:white;border-color:#dc2626;box-shadow:0 2px 8px rgba(239,68,68,0.4);}
.fl-masked-val{color:rgba(255,255,255,0.18);font-style:italic;}

/* ANION ACCORDION */
.fl-anion-group{margin-bottom:4px;border-radius:7px;overflow:hidden;border:1px solid #7f2020;}
.fl-anion-group-hdr{display:flex;align-items:center;gap:5px;padding:calc(5px * var(--fl-scale)) 7px;background:#2a0d0d;border-bottom:1px solid #7f2020;cursor:pointer;user-select:none;transition:background 0.1s;}
.fl-anion-group-hdr:hover{background:#3a1010;}
.fl-anion-group-hdr.has-sel{background:#3a1010;border-color:#ef4444;}
.fl-grp-arrow{font-size:calc(8px * var(--fl-scale));color:#fca5a5;transition:transform 0.15s;flex-shrink:0;line-height:1;}
.fl-grp-arrow.open{transform:rotate(90deg);}
.fl-grp-name{font-size:calc(10px * var(--fl-scale));font-weight:700;color:#fca5a5;white-space:nowrap;}
.fl-grp-chips{display:flex;flex-wrap:wrap;gap:2px;flex:1;justify-content:flex-end;}
.fl-grp-chip{font-size:calc(9px * var(--fl-scale));font-family:'Consolas','Courier New',monospace;padding:1px 5px;border-radius:3px;background:#3b1111;color:#fca5a5;border:1px solid #7f2020;font-weight:700;cursor:pointer;white-space:nowrap;transition:all 0.1s;}
.fl-grp-chip.sel-chip{background:#ef4444;color:white;border-color:#dc2626;}
.fl-grp-chip:hover:not(.sel-chip){background:#4a1515;border-color:#ef4444;}
.fl-anion-group-body{display:none;padding:4px;background:#1e2333;}
.fl-anion-group-body.open{display:block;}

/* PERIODIC TABLE */
#fl-pt-wrap{padding:4px 4px 2px;flex:1;min-height:0;display:grid;grid-template-rows:1fr;overflow:hidden;}
#fl-pt-grid{display:grid;grid-template-columns:repeat(18,1fr);grid-template-rows:repeat(8,1fr);gap:2px;width:100%;height:100%;}
.fl-pt-cell{
  border-radius:3px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;cursor:pointer;line-height:1;border:1.5px solid transparent;
  transition:transform 0.1s, box-shadow 0.1s;position:relative;overflow:hidden;
  min-width:0;min-height:0;
}
.fl-pt-cell:hover{transform:scale(1.22);z-index:15;box-shadow:0 4px 14px rgba(0,0,0,0.6);overflow:visible;}
.fl-pt-cell.sel{border-color:rgba(255,255,255,0.7) !important;transform:scale(1.14);z-index:12;box-shadow:0 3px 14px rgba(0,0,0,0.6);overflow:visible;}
/* PT cell text — sized by JS _updatePTFontSize() after render */
.fl-pt-cell .an{position:absolute;top:8%;left:8%;font-size:var(--pt-an-size,7px);font-weight:700;opacity:0.75;line-height:1;}
.fl-pt-cell .sy-wrap{display:flex;align-items:flex-start;justify-content:center;font-size:var(--pt-sy-size,16px);font-weight:900;line-height:1;margin-top:15%;}
.fl-pt-cell .sy{font-size:1em;font-weight:900;line-height:1;}
.fl-pt-cell .sy.sy-name{font-size:calc(var(--pt-an-size,7px) * 1.1);font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;width:90%;text-align:center;}
.fl-pt-cell .sy-charge{font-size:0.45em;font-weight:900;line-height:1;align-self:flex-start;margin-top:0.05em;opacity:0.95;}
.fl-pt-cell .nm{font-size:var(--pt-nm-size,6px);opacity:0.8;line-height:1;white-space:nowrap;overflow:hidden;width:95%;text-align:center;font-weight:600;margin-top:4%;}
.fl-pt-multi-dot{position:absolute;bottom:5%;right:5%;width:9%;height:9%;background:#60a5fa;border-radius:50%;pointer-events:none;z-index:2;opacity:0.85;}
/* PT colors */
.fl-el-alkali{background:#1a2d4a;color:#93c5fd;border-color:#2d5a8e;}
.fl-el-alkaline{background:#1a2d4a;color:#93c5fd;border-color:#2d5a8e;}
.fl-el-transition{background:#152840;color:#7dd3fc;border-color:#1e4a7a;}
.fl-el-post{background:#1a2d4a;color:#93c5fd;border-color:#2d5a8e;}
.fl-el-metalloid{background:#1a1a35;color:#c4b5fd;border-color:#3730a3;pointer-events:none;cursor:default;}
.fl-el-nonmetal{background:#3b1111;color:#fca5a5;border-color:#7f2020;}
.fl-el-halogen{background:#3b1111;color:#fca5a5;border-color:#7f2020;}
.fl-el-noble{background:#1a1f2e;color:#475569;border-color:#2d3348;pointer-events:none;cursor:default;}
.fl-el-lanthanide{background:#2a1f0a;color:#fde68a;border-color:#78350f;}
.fl-el-actinide{background:#2a1500;color:#fdba74;border-color:#7c2d12;}
.fl-el-empty{background:transparent;border-color:transparent;cursor:default;pointer-events:none;}
.fl-el-h-cation{background:#1a2d4a;color:#93c5fd;border-color:#2d5a8e;}
.fl-el-h-anion{background:#3b1111;color:#fca5a5;border-color:#7f2020;}
/* Selected states */
.fl-el-alkali.sel,.fl-el-alkaline.sel,.fl-el-transition.sel,.fl-el-post.sel{background:#3b82f6;color:white;border-color:#60a5fa;}
.fl-el-nonmetal.sel,.fl-el-halogen.sel{background:#ef4444;color:white;border-color:#f87171;}
.fl-el-h-cation.sel{background:#3b82f6 !important;color:white !important;border-color:#60a5fa !important;}
.fl-el-h-anion.sel{background:#ef4444 !important;color:white !important;border-color:#f87171 !important;}
.fl-pt-cell.anion-sel{background:#ef4444 !important;color:white !important;border-color:#f87171 !important;}
.fl-pt-cell.cation-sel{background:#3b82f6 !important;color:white !important;border-color:#60a5fa !important;}

/* PT toggle */
.fl-pt-toggle-wrap{display:flex;align-items:center;gap:4px;flex-shrink:0;}
.fl-pt-toggle-lbl{font-size:calc(9px * var(--fl-scale));font-weight:600;color:rgba(255,255,255,0.6);white-space:nowrap;}
.fl-pt-toggle-track{width:28px;height:15px;border-radius:8px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);position:relative;transition:background 0.2s;flex-shrink:0;cursor:pointer;}
.fl-pt-toggle-track.on{background:#3b82f6;border-color:#60a5fa;}
.fl-pt-toggle-thumb{width:11px;height:11px;border-radius:50%;background:white;position:absolute;top:1px;left:1px;transition:left 0.2s;pointer-events:none;}
.fl-pt-toggle-track.on .fl-pt-toggle-thumb{left:14px;}

/* CHARGE PICKER */
#fl-charge-picker{
  position:fixed;z-index:9000;display:none;
  background:#1e2333;border:2px solid #3b82f6;border-radius:10px;
  box-shadow:0 8px 40px rgba(0,0,0,0.8);
  padding:calc(10px * var(--fl-scale)) calc(11px * var(--fl-scale));
  min-width:200px;
}
#fl-charge-picker.show{display:block;}
#fl-cp-title{font-size:calc(12px * var(--fl-scale));font-weight:700;color:#93c5fd;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;}
#fl-cp-title span{font-size:calc(9px * var(--fl-scale));color:#475569;font-weight:400;}
.fl-cp-btn-wrap{display:flex;flex-wrap:wrap;gap:5px;}
.fl-cp-btn{padding:calc(6px * var(--fl-scale)) calc(10px * var(--fl-scale));border-radius:6px;font-size:calc(12px * var(--fl-scale));font-weight:800;border:1.5px solid #2d5a8e;background:#1a2d4a;color:#93c5fd;cursor:pointer;font-family:monospace;transition:all 0.1s;text-align:center;line-height:1.3;}
.fl-cp-btn:hover{background:#3b82f6;color:white;border-color:#3b82f6;}
.fl-cp-btn.cp-sel{background:#3b82f6;color:white;border-color:#60a5fa;}
.fl-cp-close{font-size:calc(9.5px * var(--fl-scale));background:none;border:none;color:#475569;cursor:pointer;margin-top:7px;width:100%;text-align:center;padding-top:5px;border-top:1px solid #2d3348;}
.fl-cp-close:hover{color:#94a3b8;}

/* BOTTOM HALF */
#fl-bottom-half{min-height:0;background:#1e2333;display:grid;grid-template-columns:1fr calc(375px * var(--fl-scale));overflow:hidden;border-top:1px solid #2d3348;}
#fl-formula-display{min-height:0;padding:calc(10px * var(--fl-scale)) calc(14px * var(--fl-scale));display:flex;align-items:center;gap:12px;border-right:1px solid #2d3348;flex-wrap:wrap;overflow:hidden;}
.fl-ion-badge{display:flex;flex-direction:column;align-items:center;border-radius:8px;padding:calc(7px * var(--fl-scale)) calc(11px * var(--fl-scale));min-width:64px;border:2px solid;}
.fl-ion-badge.cat{background:#1a2d4a;border-color:#2d5a8e;color:#93c5fd;}
.fl-ion-badge.ani{background:#3b1111;border-color:#7f2020;color:#fca5a5;}
.fl-ion-badge.empty{background:#181c27;border-color:#2d3348;color:#475569;}
.fl-badge-fm{font-family:monospace;font-size:calc(16px * var(--fl-scale));font-weight:800;}
.fl-badge-nm{font-size:calc(9px * var(--fl-scale));margin-top:2px;opacity:0.7;text-align:center;}
.fl-badge-ch{font-size:calc(9px * var(--fl-scale));opacity:0.5;}
.fl-plus-sign{font-size:calc(18px * var(--fl-scale));color:#475569;font-weight:300;flex-shrink:0;}
.fl-arrow-sign{font-size:calc(15px * var(--fl-scale));color:#475569;flex-shrink:0;}
.fl-compound-result{display:flex;flex-direction:column;gap:2px;}
.fl-cpd-label{font-size:calc(8.5px * var(--fl-scale));text-transform:uppercase;letter-spacing:0.07em;color:#475569;}
.fl-cpd-formula{font-family:monospace;font-size:calc(24px * var(--fl-scale));font-weight:800;color:#f1f5f9;line-height:1;}
.fl-cpd-name{font-size:calc(14px * var(--fl-scale));font-weight:600;color:#94a3b8;margin-top:2px;}
.fl-cpd-placeholder{font-size:calc(11px * var(--fl-scale));color:#475569;font-style:italic;}

/* ANSWER AREA */
#fl-answer-area{min-height:0;overflow-y:auto;padding:calc(9px * var(--fl-scale)) calc(13px * var(--fl-scale));display:flex;flex-direction:column;gap:5px;position:relative;background:#1e2333;}
.fl-answer-label{font-size:calc(9px * var(--fl-scale));font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#475569;}
.fl-sub-toolbar{display:flex;flex-direction:column;gap:2px;}
.fl-sub-row{display:flex;gap:2px;align-items:center;}
.fl-sub-lbl{font-size:calc(8px * var(--fl-scale));color:#475569;text-transform:uppercase;width:60px;flex-shrink:0;letter-spacing:0.04em;}
.fl-sub-btn{flex:1;padding:calc(4px * var(--fl-scale)) 2px;border-radius:4px;border:1px solid #3d4560;background:#181c27;cursor:pointer;font-size:calc(11px * var(--fl-scale));font-weight:700;text-align:center;min-width:25px;font-family:monospace;transition:background 0.1s;color:#94a3b8;}
.fl-sub-btn:hover{background:#252b3b;border-color:#3b82f6;}
.fl-sub-btn.pos{color:#60a5fa;}
.fl-sub-btn.neg{color:#f87171;}
.fl-answer-input{width:100%;font-size:calc(14px * var(--fl-scale));padding:calc(7px * var(--fl-scale)) calc(10px * var(--fl-scale));border:2px solid #3d4560;border-radius:7px;background:#181c27;color:#f1f5f9;font-family:monospace;outline:none;transition:border-color 0.15s;}
.fl-answer-input:focus{border-color:#3b82f6;}
.fl-answer-input.correct{border-color:#16a34a;background:#071f0f;color:#4ade80;}
.fl-answer-input.incorrect{border-color:#ef4444;background:#1f0707;color:#f87171;}
.fl-btn-row{display:flex;gap:4px;flex-wrap:wrap;}
.fl-btn{padding:calc(5px * var(--fl-scale)) calc(11px * var(--fl-scale));border-radius:5px;font-size:calc(11px * var(--fl-scale));cursor:pointer;font-family:inherit;border:1px solid #3d4560;background:#181c27;color:#94a3b8;transition:background 0.1s;}
.fl-btn:hover{background:#252b3b;color:#f1f5f9;}
.fl-btn.primary{background:#3b82f6;color:white;border-color:#60a5fa;font-weight:700;}
.fl-btn.primary:hover{background:#60a5fa;}
.fl-result-box{position:absolute;bottom:100%;left:0;right:0;padding:calc(7px * var(--fl-scale)) calc(12px * var(--fl-scale));font-size:calc(11px * var(--fl-scale));line-height:1.5;border-top:2px solid;z-index:5;}
.fl-result-box.correct{background:#071f0f;color:#4ade80;border-color:#16a34a;}
.fl-result-box.incorrect{background:#1f0707;color:#f87171;border-color:#ef4444;}
.fl-hint-box{position:absolute;bottom:100%;left:0;right:0;background:#1f1a07;border-top:2px solid #ca8a04;padding:calc(6px * var(--fl-scale)) calc(12px * var(--fl-scale));font-size:calc(11px * var(--fl-scale));color:#fde68a;z-index:5;line-height:1.5;}
.fl-browse-compound{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center;flex:1;}
.fl-browse-formula{font-family:monospace;font-size:calc(26px * var(--fl-scale));font-weight:800;color:#f1f5f9;}
.fl-browse-name{font-size:calc(15px * var(--fl-scale));font-weight:600;color:#94a3b8;}

/* MANAGE MODAL */
#fl-manage-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:8000;align-items:center;justify-content:center;}
#fl-manage-overlay.open{display:flex;}
#fl-manage-panel{background:#1e2333;border-radius:12px;width:620px;max-width:95vw;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.7);border:1px solid #3d4560;}
#fl-manage-header{background:#0d1120;color:white;padding:calc(12px * var(--fl-scale)) 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #3d4560;}
#fl-manage-header h2{font-size:calc(13px * var(--fl-scale));color:#f1f5f9;}
#fl-manage-body{flex:1;overflow-y:auto;padding:12px 14px;background:#1e2333;}
.fl-manage-section{margin-bottom:14px;}
.fl-manage-section h3{font-size:calc(10px * var(--fl-scale));font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#475569;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #2d3348;}
.fl-manage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:3px;}
.fl-manage-row{display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:5px;background:#181c27;border:1px solid #2d3348;font-size:calc(11px * var(--fl-scale));cursor:pointer;color:#94a3b8;}
.fl-manage-row:hover{background:#252b3b;color:#f1f5f9;}
.fl-manage-row input[type=checkbox]{cursor:pointer;width:13px;height:13px;accent-color:#3b82f6;flex-shrink:0;}
.fl-manage-row-formula{font-family:monospace;font-size:calc(9.5px * var(--fl-scale));color:#475569;margin-left:auto;}
.fl-manage-row-charge{font-size:calc(9.5px * var(--fl-scale));font-weight:700;color:#475569;margin-left:4px;}
.fl-close-btn{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:5px;padding:4px 11px;color:white;cursor:pointer;font-size:calc(11px * var(--fl-scale));}

/* QUIZ OVERLAY */
#fl-quiz-overlay{display:none;position:fixed;inset:0;background:#0f1117;z-index:8500;flex-direction:column;overflow:hidden;}
#fl-quiz-overlay.open{display:flex;}
#fl-quiz-header{background:#0d1120;padding:12px 20px;display:flex;align-items:center;gap:12px;border-bottom:2px solid #3b82f6;flex-shrink:0;}
#fl-quiz-header h2{font-size:calc(15px * var(--fl-scale));font-weight:700;color:#f1f5f9;flex:1;}
.fl-quiz-progress{font-size:calc(12px * var(--fl-scale));color:#94a3b8;}
.fl-quiz-score-chip{background:#3b82f6;color:white;border-radius:5px;padding:3px 10px;font-weight:700;font-size:calc(12px * var(--fl-scale));}
#fl-quiz-body{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;align-items:center;}
#fl-quiz-problem{width:100%;max-width:640px;}
.fl-quiz-card{background:#1e2333;border:1px solid #3d4560;border-radius:14px;padding:28px 32px;display:flex;flex-direction:column;gap:16px;}
.fl-quiz-prompt-label{font-size:calc(10px * var(--fl-scale));text-transform:uppercase;letter-spacing:0.1em;color:#475569;}
.fl-quiz-prompt{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.fl-quiz-ion-badge{display:flex;flex-direction:column;align-items:center;border-radius:9px;padding:10px 16px;border:2px solid;min-width:80px;}
.fl-quiz-ion-badge.cat{background:#1a2d4a;border-color:#2d5a8e;color:#93c5fd;}
.fl-quiz-ion-badge.ani{background:#3b1111;border-color:#7f2020;color:#fca5a5;}
.fl-quiz-badge-fm{font-family:monospace;font-size:calc(22px * var(--fl-scale));font-weight:800;}
.fl-quiz-badge-nm{font-size:calc(10px * var(--fl-scale));margin-top:3px;opacity:0.7;}
.fl-quiz-badge-ch{font-size:calc(10px * var(--fl-scale));opacity:0.5;margin-top:1px;}
.fl-quiz-plus{font-size:calc(24px * var(--fl-scale));color:#475569;}
.fl-quiz-arrow{font-size:calc(20px * var(--fl-scale));color:#475569;}
.fl-quiz-answer-label{font-size:calc(11px * var(--fl-scale));font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#475569;}
.fl-quiz-input{width:100%;font-size:calc(18px * var(--fl-scale));padding:10px 14px;border:2px solid #3d4560;border-radius:8px;background:#181c27;color:#f1f5f9;font-family:monospace;outline:none;transition:border-color 0.15s;}
.fl-quiz-input:focus{border-color:#3b82f6;}
.fl-quiz-input.correct{border-color:#16a34a;background:#071f0f;color:#4ade80;}
.fl-quiz-input.incorrect{border-color:#ef4444;background:#1f0707;color:#f87171;}
.fl-quiz-sub-toolbar{display:flex;flex-direction:column;gap:3px;}
.fl-quiz-sub-row{display:flex;gap:3px;align-items:center;}
.fl-quiz-sub-lbl{font-size:calc(9px * var(--fl-scale));color:#475569;width:65px;text-transform:uppercase;letter-spacing:0.04em;}
.fl-quiz-sub-btn{flex:1;padding:5px 3px;border-radius:5px;border:1px solid #3d4560;background:#181c27;cursor:pointer;font-size:calc(13px * var(--fl-scale));font-weight:700;text-align:center;font-family:monospace;color:#94a3b8;transition:background 0.1s;}
.fl-quiz-sub-btn:hover{background:#252b3b;}
.fl-quiz-sub-btn.pos{color:#60a5fa;}
.fl-quiz-sub-btn.neg{color:#f87171;}
.fl-quiz-result-box{border-radius:8px;padding:10px 14px;font-size:calc(12px * var(--fl-scale));line-height:1.6;border:1px solid;}
.fl-quiz-result-box.correct{background:#071f0f;color:#4ade80;border-color:#16a34a;}
.fl-quiz-result-box.incorrect{background:#1f0707;color:#f87171;border-color:#ef4444;}
.fl-quiz-btn-row{display:flex;gap:8px;flex-wrap:wrap;}
.fl-quiz-btn{padding:calc(9px * var(--fl-scale)) calc(18px * var(--fl-scale));border-radius:7px;font-size:calc(13px * var(--fl-scale));cursor:pointer;border:1px solid #3d4560;background:#181c27;color:#94a3b8;font-family:inherit;font-weight:600;transition:all 0.1s;}
.fl-quiz-btn:hover{background:#252b3b;color:#f1f5f9;}
.fl-quiz-btn.primary{background:#3b82f6;color:white;border-color:#60a5fa;}
.fl-quiz-btn.primary:hover{background:#60a5fa;}
/* Quiz filter bar */
#fl-quiz-filters{display:flex;align-items:center;gap:calc(6px * var(--fl-scale));flex-wrap:wrap;padding:calc(8px * var(--fl-scale)) calc(20px * var(--fl-scale));background:#131720;border-bottom:1px solid #2d3348;flex-shrink:0;}
.fl-quiz-filter-label{font-size:calc(9px * var(--fl-scale));font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#475569;margin-right:2px;}
.fl-quiz-filter-chip{display:flex;align-items:center;gap:5px;padding:calc(4px * var(--fl-scale)) calc(10px * var(--fl-scale));border-radius:20px;border:1.5px solid #3d4560;background:#181c27;color:#64748b;font-size:calc(11px * var(--fl-scale));cursor:pointer;font-family:inherit;font-weight:600;transition:all 0.15s;user-select:none;}
.fl-quiz-filter-chip:hover{border-color:#60a5fa;color:#93c5fd;}
.fl-quiz-filter-chip.on{background:#1a3a5c;border-color:#3b82f6;color:#93c5fd;}
.fl-quiz-filter-chip.on-trans{background:#1a2d1a;border-color:#16a34a;color:#4ade80;}
.fl-quiz-filter-chip.on-acid{background:#3b1f00;border-color:#d97706;color:#fbbf24;}
.fl-quiz-filter-chip.on-poly{background:#2a0d2a;border-color:#9333ea;color:#c084fc;}
.fl-quiz-filter-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;}
.fl-quiz-type-bar{display:flex;gap:4px;margin-left:auto;}
.fl-quiz-type-btn{padding:calc(5px * var(--fl-scale)) calc(14px * var(--fl-scale));border-radius:6px;border:1.5px solid #3d4560;background:#181c27;color:#64748b;font-size:calc(11px * var(--fl-scale));font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.12s;}
.fl-quiz-type-btn.active-naming{background:#3b82f6;color:white;border-color:#60a5fa;}
.fl-quiz-type-btn.active-formula{background:#7c3aed;color:white;border-color:#a78bfa;}
.fl-quiz-type-btn:hover:not(.active-naming):not(.active-formula){background:#252b3b;color:#f1f5f9;}
.fl-quiz-count-wrap{display:flex;align-items:center;gap:5px;font-size:calc(11px * var(--fl-scale));color:#64748b;}
.fl-quiz-count-wrap select{background:#181c27;border:1px solid #3d4560;border-radius:4px;color:#94a3b8;font-size:calc(11px * var(--fl-scale));padding:2px 5px;cursor:pointer;}

.fl-quiz-summary{width:100%;max-width:640px;background:#1e2333;border:1px solid #3d4560;border-radius:14px;padding:32px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;}
.fl-quiz-summary-score{font-size:calc(52px * var(--fl-scale));font-weight:900;color:#60a5fa;line-height:1;}
.fl-quiz-summary-label{font-size:calc(14px * var(--fl-scale));color:#94a3b8;}
.fl-quiz-summary-list{width:100%;text-align:left;display:flex;flex-direction:column;gap:4px;max-height:340px;overflow-y:auto;}
.fl-quiz-summary-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;font-size:calc(11px * var(--fl-scale));background:#181c27;border:1px solid #2d3348;}
.fl-quiz-summary-row.ok{border-color:#16a34a44;}
.fl-quiz-summary-row.bad{border-color:#dc262644;}
.fl-quiz-summary-icon{font-size:calc(13px * var(--fl-scale));flex-shrink:0;}
.fl-quiz-summary-compound{font-family:monospace;font-weight:700;color:#f1f5f9;flex:1;}
.fl-quiz-summary-name{color:#94a3b8;}
.fl-quiz-summary-given{color:#f87171;font-family:monospace;}
`;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// MOUNT — build the skeleton HTML into #formula-screen once
// ─────────────────────────────────────────────────────────────────────────────

function _mount(){
  const screen = document.getElementById('formula-screen');
  if(!screen) return;

  screen.innerHTML = `
<!-- CHARGE PICKER -->
<div id="fl-charge-picker">
  <div id="fl-cp-title">Iron <span>select a charge</span></div>
  <div class="fl-cp-btn-wrap" id="fl-cp-btns"></div>
  <button class="fl-cp-close" onclick="window._flCloseChargePicker()">✕ dismiss</button>
</div>

<!-- MANAGE OVERLAY -->
<div id="fl-manage-overlay">
  <div id="fl-manage-panel">
    <div id="fl-manage-header">
      <h2>⚙️ Manage Ions — check to enable</h2>
      <button class="fl-close-btn" onclick="window._flCloseManage()">✕ Close</button>
    </div>
    <div id="fl-manage-body"></div>
  </div>
</div>

<!-- QUIZ OVERLAY -->
<div id="fl-quiz-overlay">
  <div id="fl-quiz-header">
    <h2 id="fl-quiz-title">📋 Name It Quiz</h2>
    <span class="fl-quiz-progress" id="fl-quiz-progress">Problem 1 of 10</span>
    <span class="fl-quiz-score-chip" id="fl-quiz-score-chip">0/0</span>
    <button class="fl-close-btn" onclick="window._flCloseQuizMode()" style="margin-left:8px;">✕ Exit Quiz</button>
  </div>
  <div id="fl-quiz-filters">
    <span class="fl-quiz-filter-label">Include:</span>
    <button class="fl-quiz-filter-chip on" id="fl-qf-simple" onclick="window._flToggleQFilter('simple')">
      <span class="fl-quiz-filter-dot"></span>Simple ions
    </button>
    <button class="fl-quiz-filter-chip" id="fl-qf-trans" onclick="window._flToggleQFilter('trans')">
      <span class="fl-quiz-filter-dot"></span>Transition metals
    </button>
    <button class="fl-quiz-filter-chip" id="fl-qf-acids" onclick="window._flToggleQFilter('acids')">
      <span class="fl-quiz-filter-dot"></span>Acids (H⁺)
    </button>
    <button class="fl-quiz-filter-chip" id="fl-qf-poly" onclick="window._flToggleQFilter('poly')">
      <span class="fl-quiz-filter-dot"></span>Polyatomic cations
    </button>
    <div class="fl-quiz-count-wrap" style="margin-left:8px;">
      Questions:
      <select id="fl-quiz-count" onchange="window._flQZ.count=+this.value">
        <option value="5">5</option>
        <option value="10" selected>10</option>
        <option value="15">15</option>
        <option value="20">20</option>
      </select>
    </div>
    <div class="fl-quiz-type-bar">
      <button class="fl-quiz-type-btn active-naming" id="fl-qt-naming" onclick="window._flSetQuizType('naming')">🔡 Name It</button>
      <button class="fl-quiz-type-btn" id="fl-qt-formula" onclick="window._flSetQuizType('formula')">🔢 Write Formula</button>
    </div>
  </div>
  <div id="fl-quiz-body">
    <div id="fl-quiz-problem"></div>
  </div>
</div>

<div id="fl-header">
  <h1>⚗️ Chemical Formula Lab</h1>
  <div class="fl-hdr-tabs">
    <button class="fl-hdr-tab active" id="fl-tab-naming"  onclick="window._flSetMode('naming')">Naming</button>
    <button class="fl-hdr-tab"        id="fl-tab-formula" onclick="window._flSetMode('formula')">Formula</button>
    <button class="fl-hdr-tab"        id="fl-tab-charge"  onclick="window._flSetMode('charge')">Charge ID</button>
  </div>
  <div class="fl-hdr-div"></div>
  <div class="fl-study-tabs">
    <button class="fl-study-tab active" id="fl-sm-browse" onclick="window._flSetStudy('browse')">👁 Browse</button>
    <button class="fl-study-tab" id="fl-sm-maskF" onclick="window._flSetStudy('maskFormulas')">?→🔢 Write Formula</button>
    <button class="fl-study-tab" id="fl-sm-maskN" onclick="window._flSetStudy('maskNames')">🔡→? Write Name</button>
  </div>
  <div class="fl-hdr-div"></div>
  <button class="fl-manage-btn" onclick="window._flOpenManage()">⚙️ Manage Ions</button>
  <button class="fl-manage-btn" onclick="window._flOpenQuizMode('naming')" title="Quiz: given ions, write the name">🔡 Name It</button>
  <button class="fl-manage-btn" onclick="window._flOpenQuizMode('formula')" title="Quiz: given ions, write the formula">🔢 Formula Quiz</button>
  <label class="fl-slider-wrap" title="Adjust UI font size">
    <span>Aa</span>
    <input type="range" id="fl-font-slider" min="0.8" max="2.0" step="0.05" value="1.5"
      oninput="document.getElementById('formula-screen').style.setProperty('--fl-scale',this.value)"
      style="width:60px;cursor:pointer;accent-color:#3b82f6;">
  </label>
  <div class="fl-score-bar">
    Score <span class="fl-score-chip" id="fl-score-display">0/0</span>
    🔥 <span class="fl-score-chip" id="fl-streak-display">0</span>
  </div>
  <button class="fl-back-btn" onclick="window._flGoBack()">← Hub</button>
</div>

<div id="fl-main">
  <div id="fl-top-half">
    <div class="fl-col fl-col-left">
      <div class="fl-col-label cat-lbl">
        <span>Cations (+) <span class="fl-col-sublabel">Polyatomic only</span></span>
        <button class="fl-rnd-btn" onclick="window._flRandomCation()">🎲</button>
      </div>
      <div class="fl-col-scroll" id="fl-cation-list"></div>
    </div>
    <div class="fl-col fl-col-mid">
      <div class="fl-col-label pt-lbl" style="gap:6px;">
        <span style="flex:1;">Periodic Table <span class="fl-col-sublabel">🔵 cations &nbsp;·&nbsp; 🔴 anions</span></span>
        <label class="fl-pt-toggle-wrap" title="Show charge superscript on each element">
          <span class="fl-pt-toggle-lbl">Ions</span>
          <div class="fl-pt-toggle-track" id="fl-show-ions-track" onclick="window._flToggleShowIons()">
            <div class="fl-pt-toggle-thumb"></div>
          </div>
        </label>
        <label class="fl-pt-toggle-wrap" title="Show element/ion names in cells">
          <span class="fl-pt-toggle-lbl">Names</span>
          <div class="fl-pt-toggle-track" id="fl-show-names-track" onclick="window._flToggleShowNames()">
            <div class="fl-pt-toggle-thumb"></div>
          </div>
        </label>
        <button class="fl-rnd-btn" style="background:rgba(0,0,0,0.07);border-color:rgba(0,0,0,0.15);color:#94a3b8;" onclick="window._flRandomBoth()">🎲</button>
      </div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div id="fl-pt-wrap"><div id="fl-pt-grid"></div></div>
        <div id="fl-pt-legend"></div>
      </div>
    </div>
    <div class="fl-col">
      <div class="fl-col-label an-lbl">
        <span>Anions (−) <span class="fl-col-sublabel">Polyatomic · grouped</span></span>
        <button class="fl-rnd-btn" onclick="window._flRandomAnion()">🎲</button>
      </div>
      <div class="fl-col-scroll" id="fl-anion-list"></div>
    </div>
  </div>
  <div id="fl-bottom-half">
    <div id="fl-formula-display"></div>
    <div id="fl-answer-area"></div>
  </div>
</div>`;

  // Attach manage-overlay click-outside close
  document.getElementById('fl-manage-overlay').addEventListener('click', function(e){
    if(e.target===this) _closeManage();
  });
  // Attach global click-outside charge picker close
  document.addEventListener('click', function(e){
    if(_cpOpen && !document.getElementById('fl-charge-picker')?.contains(e.target)){
      _closeChargePicker();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER — five panels
// ─────────────────────────────────────────────────────────────────────────────

function _render(){
  _renderCationList();
  _renderAnionList();
  _renderPeriodicTable();
  _renderFormulaDisplay();
  _renderAnswerArea();
  // Update PT font sizes after layout settles
  requestAnimationFrame(_updatePTFontSize);
  if(ST.studyMode!=='browse'&&!ST.result){
    setTimeout(()=>document.getElementById('fl-answer-input')?.focus(),30);
  }
}

function _renderCationList(){
  const el=document.getElementById('fl-cation-list');
  if(!el)return;
  const maskN=ST.studyMode==='maskNames',maskF=ST.studyMode==='maskFormulas';
  const active=POLY_CATIONS.filter(c=>ST.enabledCations.has(c.id));
  if(!active.length){
    el.innerHTML='<div style="padding:14px 8px;text-align:center;font-size:10.5px;color:#475569;font-style:italic;">No cations enabled.<br>Use ⚙️ Manage Ions.</div>';
    return;
  }
  el.innerHTML=active.map(c=>{
    const ion={...c,type:'polyCat'};
    const sel=ST.cation?.id===c.id?'sel':'';
    const n=maskN?'<span class="fl-masked-val">???</span>':c.name;
    const fm=maskF?'<span class="fl-masked-val">?</span>':rf(c.formula);
    return `<button class="fl-ion-btn fl-cation-btn ${sel}" onclick='window._flSelCation(${JSON.stringify(ion)})'>
      <span class="fl-ion-btn-info"><span class="fl-ion-btn-name">${n}</span><span class="fl-ion-btn-formula">${fm}</span></span>
      <span class="fl-ion-btn-charge">${c.chargeStr}</span>
    </button>`;
  }).join('');
}

function _renderAnionList(){
  const el=document.getElementById('fl-anion-list');
  if(!el)return;
  const maskN=ST.studyMode==='maskNames',maskF=ST.studyMode==='maskFormulas';
  let html='';
  for(const grp of ANION_GROUPS){
    if(grp.id==='hydride') continue;
    const active=grp.members.filter(m=>ST.enabledAnions.has(m.id));
    if(!active.length) continue;
    const isOpen=ST.openGroups.has(grp.id);
    const hasSel=active.some(m=>ST.anion?.id===m.id);
    const chips=active.map(m=>{
      const ion={...m,type:'poly'};
      const fm=maskF?'?':m.formula;
      const isSel=ST.anion?.id===m.id;
      return `<span class="fl-grp-chip ${isSel?'sel-chip':''}" onclick='event.stopPropagation();window._flSelAnion(${JSON.stringify(ion)})' title="${m.name} ${m.chargeStr}">${rf(fm)}</span>`;
    }).join('');
    html+=`<div class="fl-anion-group">
      <div class="fl-anion-group-hdr ${hasSel?'has-sel':''}" onclick="window._flToggleGroup('${grp.id}')">
        <span class="fl-grp-arrow ${isOpen?'open':''}">▶</span>
        <span class="fl-grp-name">${grp.name}</span>
        <span class="fl-grp-chips">${chips}</span>
      </div>
      <div class="fl-anion-group-body ${isOpen?'open':''}">
        ${active.map(m=>{
          const ion={...m,type:'poly'};
          const sel=ST.anion?.id===m.id?'sel':'';
          const n=maskN?'<span class="fl-masked-val">???</span>':m.name;
          const fm=maskF?'<span class="fl-masked-val">?</span>':rf(m.formula);
          return `<button class="fl-ion-btn fl-anion-btn ${sel}" onclick='window._flSelAnion(${JSON.stringify(ion)})'>
            <span class="fl-ion-btn-info"><span class="fl-ion-btn-name">${n}</span><span class="fl-ion-btn-formula">${fm}</span></span>
            <span class="fl-ion-btn-charge">${m.chargeStr}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }
  el.innerHTML=html||'<div style="padding:10px 6px;text-align:center;font-size:10.5px;color:#475569;font-style:italic;">No anions enabled.</div>';
}

function _updatePTFontSize(){
  // Measure one real cell to get actual pixel dimensions, then set CSS custom
  // properties on the grid so .an / .sy-wrap / .nm fill the cell properly.
  const grid = document.getElementById('fl-pt-grid');
  if(!grid) return;
  const cell = grid.querySelector('.fl-pt-cell:not(.fl-el-empty)');
  if(!cell) return;
  const w = cell.offsetWidth;
  const h = cell.offsetHeight;
  const sz = Math.min(w, h); // smaller of width/height
  if(sz < 2) return; // not laid out yet
  // Symbol: fill ~55% of the cell's shorter dimension
  const sySize  = Math.round(sz * 0.55);
  // Atomic number: ~17% of cell
  const anSize  = Math.round(sz * 0.20);
  // Name label: ~15% of cell
  const nmSize  = Math.round(sz * 0.15);
  grid.style.setProperty('--pt-sy-size', sySize+'px');
  grid.style.setProperty('--pt-an-size', anSize+'px');
  grid.style.setProperty('--pt-nm-size', nmSize+'px');
}

function _getTransLookup(){
  const t={};
  for(const m of TRANSITION_METALS){
    if(!ST.enabledTrans.has(m.id))continue;
    if(!t[m.atomicNum])t[m.atomicNum]=[];
    t[m.atomicNum].push(m);
  }
  return t;
}

function _renderPeriodicTable(){
  const grid=document.getElementById('fl-pt-grid');
  if(!grid)return;
  const transL=_getTransLookup();
  const sm=ST.studyMode;
  const maskF=sm==='maskFormulas';
  const showIons=ST.showIons;
  const showNames=ST.showNames;

  function chargeToSup(ch){
    const abs=Math.abs(ch),sign=ch>0?'⁺':'⁻';
    const digits=['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹'];
    const num=abs===1?'':String(abs).split('').map(d=>digits[+d]).join('');
    return num+sign;
  }

  let html='';
  for(const row of PT_LAYOUT){
    for(const n of row){
      if(!n){html+='<div class="fl-pt-cell fl-el-empty"></div>';continue;}
      if(n==='H-'){
        const hydrideIon={type:'element',atomicNum:1,name:'Hydride',charge:-1,chargeStr:'−1',symbol:'H',id:'el1h-'};
        const isSelAnion=ST.anion?.id==='el1h-';
        const selCls=isSelAnion?'sel':'';
        const chargeSup=showIons?'⁻':null;
        const nameStr=showNames&&!maskF?'Hydride':null;
        const hSymPart=maskF
          ?`<span class="sy sy-name">Hydride</span>`
          :`<span class="sy-wrap"><span class="sy">H</span>${chargeSup?`<span class="sy-charge">${chargeSup}</span>`:''}</span>`;
        html+=`<div class="fl-pt-cell fl-el-h-anion ${selCls}" onclick='window._flSelAnion(${JSON.stringify(hydrideIon)})' title="Hydride (H⁻) — anion">
          <span class="an">1</span>${hSymPart}
          ${nameStr?`<span class="nm">${nameStr}</span>`:''}
        </div>`;
        continue;
      }
      const [sym,name,fam]=EL[n]||['?','?','noble'];
      const hasTrans=!!transL[n];
      const isCatSel=(ST.cation?.atomicNum===n&&ST.cation?.type==='element'&&ST.cation?.id!=='el1h-')
                   ||(ST.cation?.atomicNum===n&&ST.cation?.type==='transition');
      const isAnSel=ST.anion?.atomicNum===n&&ST.anion?.type==='element'&&ST.anion?.id!=='el1h-';
      const selCls=isCatSel?'cation-sel':isAnSel?'anion-sel':'';
      const symDisp=maskF?name.substring(0,5):sym;
      let chargeSup=null;
      if(showIons){
        if(hasTrans){
          const opts=transL[n]||[];
          const active=ST.cation?.type==='transition'&&ST.cation?.atomicNum===n?ST.cation:opts[0];
          if(active)chargeSup=chargeToSup(active.charge);
        } else if(n===1&&SIMPLE_CATIONS[1]){
          chargeSup=chargeToSup(SIMPLE_CATIONS[1]);
        } else if(SIMPLE_CATIONS[n]){
          chargeSup=chargeToSup(SIMPLE_CATIONS[n]);
        } else if(SIMPLE_ANIONS[n]){
          chargeSup=chargeToSup(SIMPLE_ANIONS[n]);
        }
      }
      let nameStr=null;
      if(showNames&&!maskF){
        if(showIons&&hasTrans){
          const opts=transL[n]||[];
          const active=ST.cation?.type==='transition'&&ST.cation?.atomicNum===n?ST.cation:opts[0];
          nameStr=active?(active.name.length>8?active.name.substring(0,8):active.name):name.substring(0,7);
        } else { nameStr=name.substring(0,7); }
      }
      let cls;
      if(fam==='metalloid')        cls='fl-el-metalloid';
      else if(fam==='noble')       cls='fl-el-noble';
      else if(fam==='lanthanide')  cls='fl-el-lanthanide';
      else if(fam==='actinide')    cls='fl-el-actinide';
      else if(SIMPLE_ANIONS[n]&&!SIMPLE_CATIONS[n]&&fam!=='transition') cls='fl-el-nonmetal';
      else if(n===1)               cls='fl-el-h-cation';
      else                         cls='fl-el-alkali';
      if(fam==='transition'&&cls==='fl-el-alkali') cls='fl-el-transition';
      const dot=hasTrans&&(transL[n]?.length||0)>1?'<span class="fl-pt-multi-dot"></span>':'';
      let handler='';
      if(fam==='metalloid'||fam==='noble'){
        handler='';
      } else if(hasTrans){
        const opts=transL[n]||[];
        if(opts.length===1){
          const ion={...opts[0],type:'transition'};
          handler=`onclick='window._flSelCation(${JSON.stringify(ion)})'`;
        } else {
          const defaultIon={...opts[0],type:'transition'};
          handler=`onclick='window._flSelCationAndPick(event,${n},${JSON.stringify(defaultIon)})'`;
        }
      } else if(SIMPLE_CATIONS[n]){
        const ch=SIMPLE_CATIONS[n];
        const ion={type:'element',atomicNum:n,name,charge:ch,chargeStr:`+${ch}`,symbol:sym,id:`el${n}`};
        handler=`onclick='window._flSelCation(${JSON.stringify(ion)})'`;
      } else if(n===1){
        const ch=SIMPLE_CATIONS[1];
        const ion={type:'element',atomicNum:1,name,charge:ch,chargeStr:`+${ch}`,symbol:sym,id:'el1'};
        handler=`onclick='window._flSelCation(${JSON.stringify(ion)})'`;
      } else if(SIMPLE_ANIONS[n]){
        const ch=SIMPLE_ANIONS[n];
        const ion={type:'element',atomicNum:n,name,charge:ch,chargeStr:`${ch}`,symbol:sym,id:`el${n}`};
        handler=`onclick='window._flSelAnion(${JSON.stringify(ion)})'`;
      } else if(fam==='post'||fam==='alkali'||fam==='alkaline'){
        const ion={type:'element',atomicNum:n,name,charge:3,chargeStr:'+3',symbol:sym,id:`el${n}`};
        handler=`onclick='window._flSelCation(${JSON.stringify(ion)})'`;
      }
      const symSection=maskF
        ?`<span class="sy sy-name">${symDisp}</span>`
        :`<span class="sy-wrap"><span class="sy">${sym}</span>${chargeSup?`<span class="sy-charge">${chargeSup}</span>`:''}</span>`;
      html+=`<div class="fl-pt-cell ${cls} ${selCls}" ${handler} title="${name} (#${n})">
        ${dot}<span class="an">${n}</span>${symSection}
        ${nameStr?`<span class="nm">${nameStr}</span>`:''}
      </div>`;
    }
  }
  grid.innerHTML=html;
}

function _renderFormulaDisplay(){
  const cat=ST.cation,an=ST.anion,sm=ST.studyMode;
  const formula=(cat&&an)?buildFormula(cat,an):null;
  const name=(cat&&an)?buildName(cat,an):null;
  const maskN=sm==='maskNames',maskF=sm==='maskFormulas';
  const el=document.getElementById('fl-formula-display');
  if(!el)return;
  el.innerHTML=`
    <div class="fl-ion-badge ${cat?'cat':'empty'}">
      <div class="fl-badge-fm">${maskF?'?':rf(cat?ionFormula(cat):'?')}</div>
      <div class="fl-badge-nm">${maskN?'???':(cat?ionName(cat):'Pick cation')}</div>
      <div class="fl-badge-ch">${cat?cat.chargeStr:''}</div>
    </div>
    <div class="fl-plus-sign">+</div>
    <div class="fl-ion-badge ${an?'ani':'empty'}">
      <div class="fl-badge-fm">${maskF?'?':rf(an?ionFormula(an):'?')}</div>
      <div class="fl-badge-nm">${maskN?'???':(an?ionName(an):'Pick anion')}</div>
      <div class="fl-badge-ch">${an?an.chargeStr:''}</div>
    </div>
    <div class="fl-arrow-sign">→</div>
    ${formula?`
    <div class="fl-compound-result">
      <div class="fl-cpd-label">${sm==='maskFormulas'?'Name shown — write formula →':sm==='maskNames'?'Formula shown — write name →':'Compound'}</div>
      <div class="fl-cpd-formula">${maskF?'?':rf(formula)}</div>
      <div class="fl-cpd-name">${maskN?'?':name}</div>
    </div>
    <button onclick="window._flClearSel()" style="margin-left:auto;padding:4px 8px;font-size:9.5px;background:#252b3b;border:1px solid #3d4560;border-radius:4px;cursor:pointer;color:#94a3b8;">✕ Clear</button>
    `:`<div class="fl-cpd-placeholder">Click a cation (left panel or periodic table) and an anion to build a compound<br><small>Multi-charge metals: click to auto-select, picker opens to change</small></div>`}`;
}

function _renderAnswerArea(){
  const cat=ST.cation,an=ST.anion,sm=ST.studyMode;
  const el=document.getElementById('fl-answer-area');
  if(!el)return;
  if(!cat||!an){
    el.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;flex:1;color:#475569;font-size:11px;font-style:italic;text-align:center;padding:8px;">Select a cation<br>and an anion</div>`;
    return;
  }
  const formula=buildFormula(cat,an),name=buildName(cat,an);
  if(sm==='browse'){
    el.innerHTML=`<div class="fl-browse-compound">
      <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:0.07em;color:#475569;margin-bottom:3px;">Compound</div>
      <div class="fl-browse-formula">${rf(formula)}</div>
      <div class="fl-browse-name">${name}</div>
      <div class="fl-btn-row" style="margin-top:7px;justify-content:center;">
        <button class="fl-btn" onclick="window._flClearSel()">✕ Clear</button>
        <button class="fl-btn primary" onclick="window._flRandomBoth()">🎲 New Random</button>
      </div>
    </div>`;
    return;
  }
  const doF=sm==='maskFormulas'||(ST.mode==='formula');
  const lbl=doF?'Type the formula:':'Type the name:';
  const phld=doF?'e.g. Fe₂O₃':'e.g. Iron (III) Oxide';
  const inpCls=ST.result||'';
  const subBtns=[1,2,3,4,5,6].map(n=>`<button class="fl-sub-btn" onclick="window._flIns('${SUB[n]}')" tabindex="-1">${SUB[n]}</button>`).join('');
  const posBtns=[1,2,3,4,5,6].map(n=>`<button class="fl-sub-btn pos" onclick="window._flIns('${SUP[n]}⁺')" tabindex="-1">${SUP[n]}⁺</button>`).join('');
  const negBtns=[1,2,3,4,5,6].map(n=>`<button class="fl-sub-btn neg" onclick="window._flIns('${SUP[n]}⁻')" tabindex="-1">${SUP[n]}⁻</button>`).join('');
  el.innerHTML=`
    ${ST.result?`<div class="fl-result-box ${ST.result}">${ST.result==='correct'?`✅ <strong>Correct!</strong> ${rf(formula)} — ${name}`:`❌ <strong>Incorrect.</strong> Answer: <strong>${doF?rf(formula):name}</strong>`}</div>`:''}
    ${ST.showHint&&!ST.result?`<div class="fl-hint-box">💡 ${_getHint(cat,an,doF)}</div>`:''}
    <div class="fl-answer-label">${lbl}</div>
    ${doF?`<div class="fl-sub-toolbar">
      <div class="fl-sub-row"><span class="fl-sub-lbl">+ charge</span>${posBtns}</div>
      <div class="fl-sub-row"><span class="fl-sub-lbl">− charge</span>${negBtns}</div>
    </div>`:''}
    <input class="fl-answer-input ${inpCls}" id="fl-answer-input" type="text"
      placeholder="${phld}" value="${ST.answer}"
      onkeydown="if(event.key==='Enter')window._flCheckAnswer()"
      oninput="window._flST.answer=this.value"
      ${ST.result?'readonly':''} autocomplete="off"/>
    ${doF?`<div class="fl-sub-toolbar" style="margin-top:3px;">
      <div class="fl-sub-row"><span class="fl-sub-lbl">Subscripts</span>${subBtns}</div>
    </div>`:''}
    <div class="fl-btn-row">
      ${!ST.result?`
        <button class="fl-btn primary" onclick="window._flCheckAnswer()">Check ✓</button>
        <button class="fl-btn" onclick="window._flST.showHint=!window._flST.showHint;window._flRenderAnswerArea()">Hint 💡</button>
        <button class="fl-btn" onclick="window._flRevealAnswer()">Reveal</button>
      `:`
        <button class="fl-btn primary" onclick="window._flRandomBoth()">Next / Random →</button>
        <button class="fl-btn" onclick="window._flClearSel()">Back</button>
      `}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

function _goBack(){
  // Hide the fixed-position screen, disconnect observer, then return to hub
  const scr = document.getElementById('formula-screen');
  if(scr) scr.style.display = 'none';
  if(window._flResizeObs){ window._flResizeObs.disconnect(); window._flResizeObs = null; }
  if(typeof showHub === 'function') showHub();
}

function _selCation(ion){ST.cation=typeof ion==='string'?JSON.parse(ion):ion;ST.result=null;ST.answer='';ST.showHint=false;_render();}
function _selAnion(ion) {ST.anion =typeof ion==='string'?JSON.parse(ion):ion;ST.result=null;ST.answer='';ST.showHint=false;_render();}
function _selCationAndPick(evt,atomicNum,defaultIon){_selCation(defaultIon);_openChargePicker(evt,atomicNum);}
function _clearSel(){ST.cation=null;ST.anion=null;ST.result=null;ST.answer='';ST.showHint=false;_render();}

function _randomCation(){
  const poly=POLY_CATIONS.filter(c=>ST.enabledCations.has(c.id)).map(c=>({...c,type:'polyCat'}));
  const trans=TRANSITION_METALS.filter(t=>ST.enabledTrans.has(t.id)).map(t=>({...t,type:'transition'}));
  const simple=Object.entries(SIMPLE_CATIONS).map(([n,ch])=>{const[sym,name]=EL[n];return{type:'element',atomicNum:+n,name,charge:ch,chargeStr:`+${ch}`,symbol:sym,id:`el${n}`};});
  const pool=[...poly,...trans,...simple];
  if(pool.length)_selCation(pool[Math.floor(Math.random()*pool.length)]);
}
function _randomAnion(){
  const simple=Object.entries(SIMPLE_ANIONS).map(([n,ch])=>{const[sym,name]=EL[n];return{type:'element',atomicNum:+n,name,charge:ch,chargeStr:`${ch}`,symbol:sym,id:`el${n}`};});
  const hydride={type:'element',atomicNum:1,name:'Hydride',charge:-1,chargeStr:'−1',symbol:'H',id:'el1h-'};
  const poly=POLY_ANIONS_FLAT().filter(a=>ST.enabledAnions.has(a.id)).map(a=>({...a,type:'poly'}));
  const pool=[...poly,...simple,hydride];
  if(pool.length)_selAnion(pool[Math.floor(Math.random()*pool.length)]);
}
function _randomBoth(){
  const poly=POLY_CATIONS.filter(c=>ST.enabledCations.has(c.id)).map(c=>({...c,type:'polyCat'}));
  const trans=TRANSITION_METALS.filter(t=>ST.enabledTrans.has(t.id)).map(t=>({...t,type:'transition'}));
  const simpleC=Object.entries(SIMPLE_CATIONS).map(([n,ch])=>{const[sym,name]=EL[n];return{type:'element',atomicNum:+n,name,charge:ch,chargeStr:`+${ch}`,symbol:sym,id:`el${n}`};});
  const poolC=[...poly,...trans,...simpleC];
  if(poolC.length)ST.cation=poolC[Math.floor(Math.random()*poolC.length)];
  const polyA=POLY_ANIONS_FLAT().filter(a=>ST.enabledAnions.has(a.id)).map(a=>({...a,type:'poly'}));
  const simpleA=Object.entries(SIMPLE_ANIONS).map(([n,ch])=>{const[sym,name]=EL[n];return{type:'element',atomicNum:+n,name,charge:ch,chargeStr:`${ch}`,symbol:sym,id:`el${n}`};});
  const hydride={type:'element',atomicNum:1,name:'Hydride',charge:-1,chargeStr:'−1',symbol:'H',id:'el1h-'};
  const poolA=[...polyA,...simpleA,hydride];
  if(poolA.length)ST.anion=poolA[Math.floor(Math.random()*poolA.length)];
  ST.result=null;ST.answer='';ST.showHint=false;
  _render();
}

function _ins(text){
  const inp=document.getElementById('fl-answer-input');
  if(!inp){ST.answer+=text;return;}
  const s=inp.selectionStart,e=inp.selectionEnd;
  inp.value=inp.value.slice(0,s)+text+inp.value.slice(e);
  inp.selectionStart=inp.selectionEnd=s+text.length;
  ST.answer=inp.value;inp.focus();
}

function _checkAnswer(){
  if(!ST.cation||!ST.anion)return;
  const inp=document.getElementById('fl-answer-input');
  const ans=(inp?inp.value:ST.answer).trim();
  ST.answer=ans;
  if(!ans)return;
  const doF=ST.studyMode==='maskFormulas'||(ST.mode==='formula');
  ST.total++;
  const ok=doF?normF(ans)===normF(buildFormula(ST.cation,ST.anion)):normN(ans)===normN(buildName(ST.cation,ST.anion));
  ST.result=ok?'correct':'incorrect';
  if(ok){ST.score++;ST.streak++;}else{ST.streak=0;}
  const sd=document.getElementById('fl-score-display');
  const stk=document.getElementById('fl-streak-display');
  if(sd)sd.textContent=`${ST.score}/${ST.total}`;
  if(stk)stk.textContent=ST.streak;
  _renderFormulaDisplay();_renderAnswerArea();
}

function _revealAnswer(){
  if(!ST.cation||!ST.anion)return;
  const doF=ST.studyMode==='maskFormulas'||(ST.mode==='formula');
  ST.answer=doF?buildFormula(ST.cation,ST.anion):buildName(ST.cation,ST.anion);
  ST.result='incorrect';ST.total++;ST.streak=0;
  const sd=document.getElementById('fl-score-display');
  const stk=document.getElementById('fl-streak-display');
  if(sd)sd.textContent=`${ST.score}/${ST.total}`;
  if(stk)stk.textContent=ST.streak;
  _renderFormulaDisplay();_renderAnswerArea();
}

function _getHint(cat,an,doF){
  const cC=Math.abs(ionCharge(cat)),aC=Math.abs(ionCharge(an));
  if(doF)return `Criss-cross: cation charge (${cC}) → anion subscript; anion charge (${aC}) → cation subscript. Simplify to lowest ratio. Polyatomics with subscript >1 get parentheses.`;
  const isHplus=(cat.type==='element'&&cat.atomicNum===1&&cat.charge===1);
  if(isHplus){
    if(an.type==='poly'){
      const nm=an.name.toLowerCase();
      if(nm.endsWith('ate'))return `Acid naming: "-ate" anions → "-ic acid". ${an.name} → ${buildAcidName(an)}.`;
      if(nm.endsWith('ite'))return `Acid naming: "-ite" anions → "-ous acid". ${an.name} → ${buildAcidName(an)}.`;
      return `Acid naming: use the anion name with "acid".`;
    }
    return `Binary acid: "hydro" + stem + "ic acid". No oxygen → hydro___ prefix.`;
  }
  const rm=cat.type==='transition'?` Add Roman numeral (${toRoman(cC)}) after the cation.`:'';
  return `Cation: "${ionName(cat)}".${rm} Anion: ${isPoly(an)?`keeps full name "${an.name}"`:'monatomic → stem + "-ide"'}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE / STUDY TOGGLES
// ─────────────────────────────────────────────────────────────────────────────

function _setMode(m){
  ST.mode=m;ST.result=null;ST.answer='';
  ['naming','formula','charge'].forEach(id=>document.getElementById('fl-tab-'+id)?.classList.toggle('active',id===m));
  _render();
}
function _setStudy(s){
  ST.studyMode=s;ST.result=null;ST.answer='';
  document.getElementById('fl-sm-browse')?.classList.toggle('active',s==='browse');
  document.getElementById('fl-sm-maskF')?.classList.toggle('active',s==='maskFormulas');
  document.getElementById('fl-sm-maskN')?.classList.toggle('active',s==='maskNames');
  _render();
}
function _toggleShowIons(){
  ST.showIons=!ST.showIons;
  document.getElementById('fl-show-ions-track')?.classList.toggle('on',ST.showIons);
  _renderPeriodicTable();
}
function _toggleShowNames(){
  ST.showNames=!ST.showNames;
  document.getElementById('fl-show-names-track')?.classList.toggle('on',ST.showNames);
  _renderPeriodicTable();
}
function _toggleGroup(id){ST.openGroups.has(id)?ST.openGroups.delete(id):ST.openGroups.add(id);_renderAnionList();}

// ─────────────────────────────────────────────────────────────────────────────
// CHARGE PICKER
// ─────────────────────────────────────────────────────────────────────────────

function _openChargePicker(evt,atomicNum){
  evt.stopPropagation();
  const transL=_getTransLookup();
  const opts=transL[atomicNum]||[];
  if(!opts.length)return;
  const [sym,name]=EL[atomicNum]||['?','?'];
  document.getElementById('fl-cp-title').innerHTML=`${name} (${sym}) <span>select a charge</span>`;
  const wrap=document.getElementById('fl-cp-btns');
  wrap.innerHTML=opts.map(t=>{
    const ion={...t,type:'transition'};
    const isSel=ST.cation?.id===t.id;
    return `<button class="fl-cp-btn ${isSel?'cp-sel':''}" onclick='window._flSelCation(${JSON.stringify(ion)});window._flCloseChargePicker()'>
      ${t.chargeStr}${t.roman?`<br><span style="font-size:9px;font-weight:400">(${t.roman})</span>`:''}
    </button>`;
  }).join('');
  const picker=document.getElementById('fl-charge-picker');
  picker.classList.add('show');
  requestAnimationFrame(()=>{
    const ptWrap=document.getElementById('fl-pt-wrap');
    const ptRect=ptWrap?ptWrap.getBoundingClientRect():{top:100,left:window.innerWidth/2,width:0};
    const pw=picker.offsetWidth;
    const cx=ptRect.left+ptRect.width/2;
    const left=Math.max(8,Math.min(cx-pw/2,window.innerWidth-pw-8));
    picker.style.left=left+'px';
    picker.style.top=(ptRect.top+8)+'px';
  });
  _cpOpen=true;
}
function _closeChargePicker(){
  document.getElementById('fl-charge-picker')?.classList.remove('show');
  _cpOpen=false;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE MODAL
// ─────────────────────────────────────────────────────────────────────────────

function _openManage(){
  let html='';
  html+=`<div class="fl-manage-section"><h3>Polyatomic Cations</h3><div class="fl-manage-grid">`;
  for(const c of POLY_CATIONS){
    html+=`<label class="fl-manage-row"><input type="checkbox" ${ST.enabledCations.has(c.id)?'checked':''} onchange="window._flToggleIon('cat','${c.id}',this.checked)"><span style="flex:1">${c.name}</span><span class="fl-manage-row-formula">${c.formula}</span><span class="fl-manage-row-charge">${c.chargeStr}</span></label>`;
  }
  html+=`</div></div>`;
  html+=`<div class="fl-manage-section"><h3>Transition Metals (Variable Charge)</h3><div class="fl-manage-grid">`;
  for(const t of TRANSITION_METALS){
    html+=`<label class="fl-manage-row"><input type="checkbox" ${ST.enabledTrans.has(t.id)?'checked':''} onchange="window._flToggleIon('trans','${t.id}',this.checked)"><span style="flex:1">${t.name}</span><span class="fl-manage-row-formula">${t.symbol}</span><span class="fl-manage-row-charge">${t.chargeStr}</span></label>`;
  }
  html+=`</div></div>`;
  for(const grp of ANION_GROUPS){
    html+=`<div class="fl-manage-section"><h3>${grp.name}</h3><div class="fl-manage-grid">`;
    for(const m of grp.members){
      html+=`<label class="fl-manage-row"><input type="checkbox" ${ST.enabledAnions.has(m.id)?'checked':''} onchange="window._flToggleIon('ani','${m.id}',this.checked)"><span style="flex:1">${m.name}</span><span class="fl-manage-row-formula">${m.formula}</span><span class="fl-manage-row-charge">${m.chargeStr}</span></label>`;
    }
    html+=`</div></div>`;
  }
  document.getElementById('fl-manage-body').innerHTML=html;
  document.getElementById('fl-manage-overlay').classList.add('open');
}
function _closeManage(){document.getElementById('fl-manage-overlay').classList.remove('open');_render();}
function _toggleIon(type,id,on){
  if(type==='cat')on?ST.enabledCations.add(id):ST.enabledCations.delete(id);
  if(type==='ani')on?ST.enabledAnions.add(id):ST.enabledAnions.delete(id);
  if(type==='trans')on?ST.enabledTrans.add(id):ST.enabledTrans.delete(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ MODE
// ─────────────────────────────────────────────────────────────────────────────

function _toggleQFilter(key){
  const map = {simple:'filterSimple', trans:'filterTrans', acids:'filterAcids', poly:'filterPoly'};
  const prop = map[key];
  if(!prop) return;
  QZ[prop] = !QZ[prop];
  // Update chip appearance
  const chipMap = {simple:'fl-qf-simple', trans:'fl-qf-trans', acids:'fl-qf-acids', poly:'fl-qf-poly'};
  const onClass = {simple:'on', trans:'on-trans', acids:'on-acid', poly:'on-poly'};
  const chip = document.getElementById(chipMap[key]);
  if(chip){
    // Remove all on-* classes first
    chip.classList.remove('on','on-trans','on-acid','on-poly');
    if(QZ[prop]) chip.classList.add(onClass[key]);
  }
}

function _setQuizType(type){
  QZ.quizType = type;
  document.getElementById('fl-qt-naming')?.classList.toggle('active-naming', type==='naming');
  document.getElementById('fl-qt-formula')?.classList.toggle('active-formula', type==='formula');
  const title = document.getElementById('fl-quiz-title');
  if(title) title.textContent = type==='naming' ? '📋 Name It Quiz' : '📋 Write Formula Quiz';
}

function _buildQuizPool(){
  // Cations — gated by QZ filter flags
  let cations = [];
  if(QZ.filterSimple){
    // Simple main-group cations (not H+ for acids, not transition)
    const simpleC = Object.entries(SIMPLE_CATIONS)
      .filter(([n])=>+n!==1)
      .map(([n,ch])=>{ const[sym,name]=EL[n]; return{type:'element',atomicNum:+n,name,charge:ch,chargeStr:`+${ch}`,symbol:sym,id:`el${n}`}; });
    cations.push(...simpleC);
  }
  if(QZ.filterTrans){
    const trans = TRANSITION_METALS.filter(t=>ST.enabledTrans.has(t.id)).map(t=>({...t,type:'transition'}));
    cations.push(...trans);
  }
  if(QZ.filterAcids){
    // H+ cation — produces acid names
    const hIon = {type:'element',atomicNum:1,name:'Hydrogen',charge:1,chargeStr:'+1',symbol:'H',id:'el1'};
    cations.push(hIon);
  }
  if(QZ.filterPoly){
    const poly = POLY_CATIONS.filter(c=>ST.enabledCations.has(c.id)).map(c=>({...c,type:'polyCat'}));
    cations.push(...poly);
  }
  // If nothing is toggled, fall back to all simple cations so quiz always works
  if(!cations.length){
    const simpleC = Object.entries(SIMPLE_CATIONS)
      .map(([n,ch])=>{ const[sym,name]=EL[n]; return{type:'element',atomicNum:+n,name,charge:ch,chargeStr:`+${ch}`,symbol:sym,id:`el${n}`}; });
    cations = simpleC;
  }
  // Anions — always use enabled pool
  const polyA = POLY_ANIONS_FLAT().filter(a=>ST.enabledAnions.has(a.id)).map(a=>({...a,type:'poly'}));
  const simpleA = Object.entries(SIMPLE_ANIONS).map(([n,ch])=>{ const[sym,name]=EL[n]; return{type:'element',atomicNum:+n,name,charge:ch,chargeStr:`${ch}`,symbol:sym,id:`el${n}`}; });
  const hydride = {type:'element',atomicNum:1,name:'Hydride',charge:-1,chargeStr:'−1',symbol:'H',id:'el1h-'};
  // For acid quiz, use only oxyanions + halides (no hydride — would just be HH)
  const anions = QZ.filterAcids && !QZ.filterSimple && !QZ.filterTrans && !QZ.filterPoly
    ? [...polyA, ...simpleA]
    : [...polyA, ...simpleA, hydride];
  return {cations, anions};
}

function _generateQuizProblems(count=10){
  const {cations,anions} = _buildQuizPool();
  if(!cations.length||!anions.length) return [];
  const doFormula = QZ.quizType === 'formula';
  const problems = [];
  for(let i=0;i<count;i++){
    const cat = cations[Math.floor(Math.random()*cations.length)];
    const an  = anions[Math.floor(Math.random()*anions.length)];
    problems.push({cat, an, doFormula});
  }
  return problems;
}

function _openQuizMode(type){
  if(type) _setQuizType(type);
  const count = QZ.count;
  const probs = _generateQuizProblems(count);
  if(!probs.length){ alert('No ions match the current filter. Enable more filters or use Manage Ions.'); return; }
  QZ.problems=probs; QZ.idx=0; QZ.score=0; QZ.answers=[]; QZ.answer=''; QZ.result=null; QZ.showHint=false;
  document.getElementById('fl-quiz-overlay').classList.add('open');
  _renderQuizProblem();
}
function _closeQuizMode(){ document.getElementById('fl-quiz-overlay').classList.remove('open'); }



function _renderQuizProblem(){
  const total=QZ.problems.length,i=QZ.idx;
  const prog=document.getElementById('fl-quiz-progress');
  const chip=document.getElementById('fl-quiz-score-chip');
  if(prog)prog.textContent=i<total?`Problem ${i+1} of ${total}`:'Quiz Complete';
  if(chip)chip.textContent=`${QZ.score}/${i<total?i:total}`;
  if(i>=total){_renderQuizSummary();return;}
  const {cat,an,doFormula}=QZ.problems[i];
  const formula=buildFormula(cat,an);
  const name=buildName(cat,an);
  const inpCls=QZ.result||'';
  const subBtns=[1,2,3,4,5,6].map(n=>`<button class="fl-quiz-sub-btn" onclick="window._flQIns('${SUB[n]}')" tabindex="-1">${SUB[n]}</button>`).join('');
  const posBtns=[1,2,3,4,5,6].map(n=>`<button class="fl-quiz-sub-btn pos" onclick="window._flQIns('${SUP[n]}⁺')" tabindex="-1">${SUP[n]}⁺</button>`).join('');
  const negBtns=[1,2,3,4,5,6].map(n=>`<button class="fl-quiz-sub-btn neg" onclick="window._flQIns('${SUP[n]}⁻')" tabindex="-1">${SUP[n]}⁻</button>`).join('');
  document.getElementById('fl-quiz-problem').innerHTML=`
    <div class="fl-quiz-card">
      <div>
        <div class="fl-quiz-prompt-label">${doFormula?'Given these ions — write the formula':'Given these ions — write the name'}</div>
        <div class="fl-quiz-prompt" style="margin-top:10px;">
          <div class="fl-quiz-ion-badge cat">
            <div class="fl-quiz-badge-fm">${rf(ionFormula(cat))}</div>
            <div class="fl-quiz-badge-nm">${ionName(cat)}</div>
            <div class="fl-quiz-badge-ch">${cat.chargeStr}</div>
          </div>
          <div class="fl-quiz-plus">+</div>
          <div class="fl-quiz-ion-badge ani">
            <div class="fl-quiz-badge-fm">${rf(ionFormula(an))}</div>
            <div class="fl-quiz-badge-nm">${ionName(an)}</div>
            <div class="fl-quiz-badge-ch">${an.chargeStr}</div>
          </div>
          ${QZ.result?`<div class="fl-quiz-arrow">→</div>
            <div style="display:flex;flex-direction:column;gap:2px;">
              <div style="font-family:monospace;font-size:22px;font-weight:800;color:#f1f5f9;">${rf(formula)}</div>
              <div style="font-size:13px;color:#94a3b8;">${name}</div>
            </div>`:''}
        </div>
      </div>
      ${QZ.result?`<div class="fl-quiz-result-box ${QZ.result}">
        ${QZ.result==='correct'
          ?`✅ <strong>Correct!</strong>`
          :`❌ <strong>Incorrect.</strong> Answer: <strong>${doFormula?rf(formula):name}</strong>${QZ.answers[i]?.given?` &nbsp;·&nbsp; You wrote: <span style="font-family:monospace">${QZ.answers[i].given}</span>`:''}`}
      </div>`:''}
      <div>
        <div class="fl-quiz-answer-label">${doFormula?'Type the formula:':'Type the name:'}</div>
        ${doFormula?`<div class="fl-quiz-sub-toolbar" style="margin-bottom:5px;">
          <div class="fl-quiz-sub-row"><span class="fl-quiz-sub-lbl">+ charge</span>${posBtns}</div>
          <div class="fl-quiz-sub-row"><span class="fl-quiz-sub-lbl">− charge</span>${negBtns}</div>
        </div>`:''}
        <input class="fl-quiz-input ${inpCls}" id="fl-quiz-input" type="text"
          placeholder="${doFormula?'e.g. Fe₂O₃':'e.g. Iron (III) Oxide'}" value="${QZ.answer}"
          onkeydown="if(event.key==='Enter')window._flQuizCheck()"
          oninput="window._flQZ.answer=this.value"
          ${QZ.result?'readonly':''} autocomplete="off" style="margin-bottom:5px;"/>
        ${doFormula?`<div class="fl-quiz-sub-toolbar">
          <div class="fl-quiz-sub-row"><span class="fl-quiz-sub-lbl">Subscripts</span>${subBtns}</div>
        </div>`:''}
      </div>
      <div class="fl-quiz-btn-row">
        ${!QZ.result?`
          <button class="fl-quiz-btn primary" onclick="window._flQuizCheck()">Check ✓</button>
          <button class="fl-quiz-btn" onclick="window._flQuizReveal()">Reveal</button>
          <button class="fl-quiz-btn" onclick="window._flQuizSkip()" style="margin-left:auto;">Skip →</button>
        `:`
          <button class="fl-quiz-btn primary" onclick="window._flQuizNext()">${QZ.idx+1>=QZ.problems.length?'See Results →':'Next →'}</button>
        `}
      </div>
    </div>`;
  if(!QZ.result)setTimeout(()=>document.getElementById('fl-quiz-input')?.focus(),30);
}

function _qIns(text){
  const inp=document.getElementById('fl-quiz-input');
  if(!inp){QZ.answer+=text;return;}
  const s=inp.selectionStart,e=inp.selectionEnd;
  inp.value=inp.value.slice(0,s)+text+inp.value.slice(e);
  inp.selectionStart=inp.selectionEnd=s+text.length;
  QZ.answer=inp.value;inp.focus();
}
function _quizCheck(){
  const i=QZ.idx;
  if(i>=QZ.problems.length)return;
  const inp=document.getElementById('fl-quiz-input');
  const ans=(inp?inp.value:QZ.answer).trim();
  if(!ans)return;
  const {cat,an,doFormula}=QZ.problems[i];
  const formula=buildFormula(cat,an),name=buildName(cat,an);
  const ok=doFormula?normF(ans)===normF(formula):normN(ans)===normN(name);
  QZ.result=ok?'correct':'incorrect';
  if(ok)QZ.score++;
  QZ.answers[i]={correct:ok,given:ans,expected:doFormula?formula:name};
  _renderQuizProblem();
}
function _quizReveal(){
  const i=QZ.idx;
  if(i>=QZ.problems.length)return;
  const {cat,an,doFormula}=QZ.problems[i];
  QZ.answer=doFormula?buildFormula(cat,an):buildName(cat,an);
  QZ.result='incorrect';
  QZ.answers[i]={correct:false,given:'(revealed)',expected:QZ.answer};
  _renderQuizProblem();
}
function _quizSkip(){
  const i=QZ.idx;
  const {cat,an,doFormula}=QZ.problems[i];
  QZ.answers[i]={correct:false,given:'(skipped)',expected:doFormula?buildFormula(cat,an):buildName(cat,an)};
  QZ.idx++;QZ.answer='';QZ.result=null;
  _renderQuizProblem();
}
function _quizNext(){QZ.idx++;QZ.answer='';QZ.result=null;_renderQuizProblem();}

function _renderQuizSummary(){
  const total=QZ.problems.length;
  const pct=Math.round(QZ.score/total*100);
  const emoji=pct>=90?'🏆':pct>=70?'🎉':pct>=50?'👍':'💪';
  const rows=QZ.problems.map((p,i)=>{
    const {cat,an,doFormula}=p;
    const formula=buildFormula(cat,an),name=buildName(cat,an);
    const info=QZ.answers[i]||{correct:false,given:'—'};
    return `<div class="fl-quiz-summary-row ${info.correct?'ok':'bad'}">
      <span class="fl-quiz-summary-icon">${info.correct?'✅':'❌'}</span>
      <span class="fl-quiz-summary-compound">${rf(formula)}</span>
      <span class="fl-quiz-summary-name">${name}</span>
      ${!info.correct?`<span class="fl-quiz-summary-given">↳ ${info.given}</span>`:''}
    </div>`;
  }).join('');
  document.getElementById('fl-quiz-problem').innerHTML=`
    <div class="fl-quiz-summary">
      <div style="font-size:40px;">${emoji}</div>
      <div class="fl-quiz-summary-score">${QZ.score}/${total}</div>
      <div class="fl-quiz-summary-label">${pct}% correct</div>
      <div class="fl-quiz-summary-list">${rows}</div>
      <div class="fl-quiz-btn-row" style="justify-content:center;margin-top:8px;">
        <button class="fl-quiz-btn primary" onclick="window._flOpenQuizMode()">🔄 New Quiz</button>
        <button class="fl-quiz-btn" onclick="window._flCloseQuizMode()">✕ Close</button>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

let _mounted = false;

function startChemFormula(){
  _injectCSS();
  if(!_mounted){
    _mount();
    _mounted=true;
  }
  // Reset score/streak but keep enabled ions
  ST.mode='naming';ST.studyMode='browse';
  ST.cation=null;ST.anion=null;
  ST.answer='';ST.result=null;ST.showHint=false;
  ST.showIons=false;ST.showNames=false;
  // Sync toggles off
  document.getElementById('fl-show-ions-track')?.classList.remove('on');
  document.getElementById('fl-show-names-track')?.classList.remove('on');
  // Sync mode tabs
  ['naming','formula','charge'].forEach(id=>{
    document.getElementById('fl-tab-'+id)?.classList.toggle('active',id==='naming');
  });
  document.getElementById('fl-sm-browse')?.classList.add('active');
  document.getElementById('fl-sm-maskF')?.classList.remove('active');
  document.getElementById('fl-sm-maskN')?.classList.remove('active');
  if(typeof showScreen==='function') showScreen('formula-screen');
  // Restore display in case _goBack hid it
  const scr = document.getElementById('formula-screen');
  if(scr){ scr.style.display = 'flex'; scr.style.setProperty('--fl-scale','1.5'); }
  _render();
  // Watch for resize to keep PT font sizes correct
  if(window._flResizeObs) window._flResizeObs.disconnect();
  const grid = document.getElementById('fl-pt-grid');
  if(grid && typeof ResizeObserver !== 'undefined'){
    window._flResizeObs = new ResizeObserver(()=>_updatePTFontSize());
    window._flResizeObs.observe(grid);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW EXPORTS — called from inline onclick handlers
// ─────────────────────────────────────────────────────────────────────────────

window.startChemFormula        = startChemFormula;
window._flGoBack               = _goBack;
window._flSelCation            = _selCation;
window._flSelAnion             = _selAnion;
window._flSelCationAndPick     = _selCationAndPick;
window._flClearSel             = _clearSel;
window._flRandomCation         = _randomCation;
window._flRandomAnion          = _randomAnion;
window._flRandomBoth           = _randomBoth;
window._flIns                  = _ins;
window._flCheckAnswer          = _checkAnswer;
window._flRevealAnswer         = _revealAnswer;
window._flRenderAnswerArea     = _renderAnswerArea;
window._flSetMode              = _setMode;
window._flSetStudy             = _setStudy;
window._flToggleShowIons       = _toggleShowIons;
window._flToggleShowNames      = _toggleShowNames;
window._flToggleGroup          = _toggleGroup;
window._flOpenManage           = _openManage;
window._flCloseManage          = _closeManage;
window._flToggleIon            = _toggleIon;
window._flOpenChargePicker     = _openChargePicker;
window._flCloseChargePicker    = _closeChargePicker;
window._flOpenQuizMode         = _openQuizMode;
window._flCloseQuizMode        = _closeQuizMode;
window._flToggleQFilter        = _toggleQFilter;
window._flSetQuizType          = _setQuizType;
window._flQIns                 = _qIns;
window._flQuizCheck            = _quizCheck;
window._flQuizReveal           = _quizReveal;
window._flQuizSkip             = _quizSkip;
window._flQuizNext             = _quizNext;
// State refs for inline oninput handlers
window._flST                   = ST;
window._flQZ                   = QZ;

})(); // end IIFE
