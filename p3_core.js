<script>
"use strict";
/* ================= CORE: state, config, utils, break engine ================= */
const DAYS = ["sun","mon","tue","wed","thu","fri","sat"];
const DAY_LABEL = {sun:"Sun",mon:"Mon",tue:"Tue",wed:"Wed",thu:"Thu",fri:"Fri",sat:"Sat"};

const DEFAULT_CONFIG = {
  name: "Panda Express #2355 — Config",
  shiftThresholds: { morningCutoff: "12:00", nightCutoff: "12:00", midShiftCounted: true },
  storeHours: {
    sun:{open:"09:00",close:"22:30"}, mon:{open:"09:00",close:"22:00"},
    tue:{open:"09:00",close:"22:00"}, wed:{open:"09:00",close:"22:00"},
    thu:{open:"09:00",close:"22:00"}, fri:{open:"09:00",close:"22:00"},
    sat:{open:"09:00",close:"22:30"}
  },
  mealBreakRules: {
    minShiftDuration: 6.0,
    breakDuration: 30,
    blackoutHours: [
      {start:"12:00", end:"14:00", reason:"Lunch rush"},
      {start:"17:00", end:"20:00", reason:"Dinner rush"}
    ]
  },
  specialDays: { wed:{extraEarlyStarters:2,reason:"Delivery day"}, sat:{extraEarlyStarters:2,reason:"Weekend prep"} },
  busynessMultipliers: { day:1.0, night:1.5 },
  payroll: { averageHourlyWage: 18.00 },
  staffingBands: { low:3, high:5 } // <low = red, >=high = green
};

let state = {
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
  shifts: [],           // {id, employee, day, start, end, breakStart|null, override:false}
  sales: null,          // {label, days:[{day,date,total,hourly:{[h]:revenue}}], guests}
  forecast: null,       // output of runForecast
  proposal: null,       // proposed staffing changes
  nextId: 1,
  weekLabel: "Week of 07/19–07/25/2026"
};

/* ---------- time utils (minutes since midnight) ---------- */
function toMin(t){ if(t==null||t==="")return null; const m=String(t).match(/^(\d{1,2}):(\d{2})$/); if(!m)return null; return (+m[1])*60+(+m[2]); }
function toHM(min){ min=Math.round(min); const h=Math.floor(min/60)%24, m=min%60; return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"); }
function fmt12(min){ if(min==null)return "—"; let h=Math.floor(min/60), m=min%60; const ap=h>=12?"PM":"AM"; h=h%12||12; return h+(m?":"+String(m).padStart(2,"0"):"")+" "+ap; }
function fmt12r(a,b){ return fmt12(a)+"–"+fmt12(b); }
function durH(s){ return (toMin(s.end)-toMin(s.start))/60; }
function money(n){ return "$"+Math.round(n).toLocaleString(); }

/* Parse "9-4", "3:30-10:30", "7:30-3" -> {start,end} 24h, choosing most plausible AM/PM */
function parseShiftText(txt, day, cfg){
  if(!txt) return null;
  const t = String(txt).trim().toLowerCase();
  if(t===""||t==="off"||t==="-"||t==="x") return null;
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(a|am|p|pm)?\s*[-–—to]+\s*(\d{1,2})(?::(\d{2}))?\s*(a|am|p|pm)?/);
  if(!m) return null;
  let h1=+m[1], m1=+(m[2]||0), ap1=m[3], h2=+m[4], m2=+(m[5]||0), ap2=m[6];
  const open = toMin(cfg.storeHours[day]?.open||"09:00"), close = toMin(cfg.storeHours[day]?.close||"22:30");
  function cand(a,b){ return {s:a,e:b}; }
  const opts=[];
  const s12 = h1%12*60+m1, e12 = h2%12*60+m2;
  const combos = [];
  if(ap1&&ap2){ combos.push([s12+(ap1[0]==="p"?720:0), e12+(ap2[0]==="p"?720:0)]); }
  else { for(const pa of [0,720]) for(const pb of [0,720]) combos.push([s12+pa, e12+pb]); }
  for(const [a,b] of combos){
    if(b<=a) continue;
    const d=(b-a)/60;
    if(d<2||d>12) continue;
    let score=0;
    if(a>=open-120 && b<=close+30) score+=10;          // fits store hours-ish
    if(d>=4&&d<=9) score+=4;
    if(a>=open) score+=2;
    opts.push({...cand(a,b),score});
  }
  if(!opts.length) return null;
  opts.sort((x,y)=>y.score-x.score);
  return { start: toHM(opts[0].s), end: toHM(opts[0].e) };
}

/* ---------- meal break engine ---------- */
function blackoutsMin(cfg){ return cfg.mealBreakRules.blackoutHours.map(b=>({s:toMin(b.start),e:toMin(b.end),reason:b.reason})); }

function requiresBreak(shift, cfg){ return durH(shift) > cfg.mealBreakRules.minShiftDuration; }

// Returns list of candidate windows {s,e,priority} sorted best-first
function validBreakWindows(shift, cfg){
  const bd = cfg.mealBreakRules.breakDuration;
  const S = toMin(shift.start), E = toMin(shift.end);
  const bos = blackoutsMin(cfg);
  const wins = [];
  for(let t=S; t+bd<=E; t+=15){
    const clash = bos.some(b => t < b.e && t+bd > b.s);
    if(clash) continue;
    const mid = t > S+60 && t+bd < E-60;   // prefer not first/last hour
    wins.push({s:t, e:t+bd, priority: mid?2:1});
  }
  // rank: mid-shift first, then closeness to shift midpoint with a bias toward
  // post-rush (later-half) windows, matching manager preference
  const midShift=(S+E)/2;
  const score=w=>{ const m=(w.s+w.e)/2; return Math.abs(m-midShift)*(m<midShift?3:1); };
  wins.sort((a,b)=> b.priority-a.priority || score(a)-score(b));
  return wins;
}

// Distinct display options (start of each free block, mid, post-rush)
function displayWindows(shift, cfg){
  const all = validBreakWindows(shift, cfg);
  if(!all.length) return [];
  const picks=[]; const seen=new Set();
  const add=w=>{ const k=w.s; if(!seen.has(k)){seen.add(k);picks.push(w);} };
  add(all[0]); // best (suggested)
  // earliest and latest valid
  const chrono=[...all].sort((a,b)=>a.s-b.s);
  add(chrono[0]); add(chrono[chrono.length-1]);
  // one after each blackout end
  for(const b of blackoutsMin(cfg)){ const w=chrono.find(w=>w.s>=b.e && w.s<=b.e+30); if(w) add(w); }
  return picks.sort((a,b)=>a.s-b.s).slice(0,5).map(w=>({...w, suggested: w.s===all[0].s}));
}

function shiftStatus(shift, cfg){
  if(!requiresBreak(shift,cfg)) return {code:"no_break_needed", label:"≤"+cfg.mealBreakRules.minShiftDuration+"h — 10-min breaks only", level:"ok"};
  const wins = validBreakWindows(shift,cfg);
  if(!wins.length) return {code:"no_valid_break_window", label:"No valid break window", level:"crit"};
  if(shift.breakStart!=null){
    const bs=toMin(shift.breakStart), bd=cfg.mealBreakRules.breakDuration;
    const stillValid = !blackoutsMin(cfg).some(b=> bs < b.e && bs+bd > b.s) && bs>=toMin(shift.start) && bs+bd<=toMin(shift.end);
    if(stillValid) return {code:"scheduled", label:"Break "+fmt12r(bs,bs+bd), level:"ok"};
    return {code:"invalid_assignment", label:"Assigned break now invalid", level:"crit"};
  }
  const distinctBlocks = new Set(wins.map(w=>Math.floor(w.s/60))).size;
  if(distinctBlocks<=1) return {code:"single_window", label:"Unassigned — only one narrow window", level:"warn"};
  return {code:"unassigned", label:"Break not yet assigned", level:"warn"};
}

function autoAssign(shift, cfg){
  if(!requiresBreak(shift,cfg)){ shift.breakStart=null; return; }
  const wins = validBreakWindows(shift,cfg);
  shift.breakStart = wins.length ? toHM(wins[0].s) : null;
}

/* ---------- coverage ---------- */
function staffAt(day, hourMin){
  return state.shifts.filter(s=> s.day===day && toMin(s.start)<=hourMin && toMin(s.end)>hourMin).length;
}
function hoursRange(){ // union of store hours across week, whole hours
  let lo=24*60, hi=0;
  for(const d of DAYS){ lo=Math.min(lo,toMin(state.config.storeHours[d].open)); hi=Math.max(hi,toMin(state.config.storeHours[d].close)); }
  const out=[]; for(let t=Math.floor(lo/60)*60; t<hi; t+=60) out.push(t);
  return out;
}
function laborHours(day){ return state.shifts.filter(s=>s.day===day).reduce((a,s)=>a+durH(s),0); }
function totalLaborHours(){ return DAYS.reduce((a,d)=>a+laborHours(d),0); }

/* ---------- classification ---------- */
function classify(){
  const cut = toMin(state.config.shiftThresholds.morningCutoff);
  const morning=new Set(), night=new Set(), mid=new Set();
  for(const s of state.shifts){
    const st=toMin(s.start), en=toMin(s.end);
    if(st<=cut) morning.add(s.employee);
    if(st>cut) night.add(s.employee);
    if(st<=cut && en>cut) mid.add(s.employee);
    if(state.config.shiftThresholds.midShiftCounted && st<=cut && en>cut) night.add(s.employee);
  }
  return {morning, night, mid};
}

/* ---------- sample data ---------- */
const SAMPLE_ROSTER = [
  ["Thuy",     "9-4",  "3:30-10:30","12-8", "12-8", "",     "",         ""      ],
  ["Quang",    "12-8", "",          "",     "",     "12-8", "3:30-10:30","2-10:30"],
  ["Dixi",     "",     "9-4",       "9-4",  "7:30-3","",    "9-4",      ""      ],
  ["Laura",    "",     "",          "3:30-10:30","", "3:30-10:30","",   "3:30-10:30"],
  ["James",    "9:30-3","",         "",     "9:30-3","",    "9:30-3",   ""      ],
  ["Maria",    "",     "11-7:30",   "",     "11-7:30","11-7:30","",     "11-7:30"],
  ["Kevin",    "4-10", "",          "4-10", "",     "4-10", "4-10:30",  ""      ],
  ["Ana",      "",     "9-2",       "9-2",  "",     "9-2",  "",         "9-2"   ],
  ["Marcus",   "2-10:30","",        "",     "2-10", "",     "2-10:30",  "2-10:30"],
  ["Priya",    "",     "4:30-10",   "",     "4:30-10","4:30-10","",     "4:30-10"]
];
// hourly sales % shape (9AM..21PM) — normalized in code
const SAMPLE_SHAPE = {9:1.2,10:2.2,11:4.6,12:9.4,13:9.0,14:6.8,15:5.6,16:6.2,17:9.8,18:11.6,19:11.0,20:8.6,21:5.6,22:2.4};
const SAMPLE_TOTALS = {sun:9800,mon:9200,tue:9400,wed:11523,thu:9900,fri:8649,sat:11299};
const SAMPLE_DATES = {sun:"2026-07-19",mon:"2026-07-20",tue:"2026-07-21",wed:"2026-07-22",thu:"2026-07-23",fri:"2026-07-24",sat:"2026-07-25"};

function buildSampleSales(){
  const shapeSum = Object.values(SAMPLE_SHAPE).reduce((a,b)=>a+b,0);
  const days = DAYS.map(d=>{
    const hourly={};
    for(const h in SAMPLE_SHAPE) hourly[h] = SAMPLE_TOTALS[d]*SAMPLE_SHAPE[h]/shapeSum;
    return {day:d, date:SAMPLE_DATES[d], total:SAMPLE_TOTALS[d], hourly, guests: Math.round(SAMPLE_TOTALS[d]/18.92)};
  });
  return {label:"07/19–07/25 (sample)", days};
}

function loadSample(){
  state.shifts=[]; state.nextId=1;
  SAMPLE_ROSTER.forEach(row=>{
    const name=row[0];
    DAYS.forEach((d,i)=>{
      const parsed = parseShiftText(row[i+1], d, state.config);
      if(parsed) state.shifts.push({id:state.nextId++, employee:name, day:d, start:parsed.start, end:parsed.end, breakStart:null});
    });
  });
  state.shifts.forEach(s=>autoAssign(s,state.config));
  state.sales = buildSampleSales();
}

/* ---------- persistence ---------- */
const LS_KEY="panda2355_v1";
function persist(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify({config:state.config, shifts:state.shifts, sales:state.sales, nextId:state.nextId, weekLabel:state.weekLabel})); }catch(e){}
}
function restore(){
  try{
    const raw=localStorage.getItem(LS_KEY); if(!raw) return false;
    const d=JSON.parse(raw);
    if(!d.shifts||!d.shifts.length) return false;
    state.config={...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),...d.config};
    state.shifts=d.shifts; state.sales=d.sales; state.nextId=d.nextId||1000; state.weekLabel=d.weekLabel||state.weekLabel;
    return true;
  }catch(e){ return false; }
}
</script>
