<script>
/* ================= UI: schedule tab, breaks tab, modal ================= */
const App = {};
const $ = id => document.getElementById(id);

App.toast = function(msg){
  const t=$("toast"); t.textContent=msg; t.style.display="block";
  clearTimeout(App._tt); App._tt=setTimeout(()=>t.style.display="none", 3200);
};

App.switchTab = function(name){
  document.querySelectorAll(".tab").forEach(el=>el.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(el=>el.classList.toggle("active", el.dataset.tab===name));
  $("tab-"+name).classList.add("active");
  if(name==="sales") App.renderSales();
  if(name==="coverage") App.renderCoverage();
  if(name==="breaks") App.renderBreaksTab();
  if(name==="compare") App.renderCompare();
  if(name==="settings") App.renderSettings();
};

App.renderAll = function(){
  $("weekLabel").textContent = state.weekLabel;
  App.renderSummaryCards();
  App.renderHeatMap();
  App.renderEmpTable();
  App.renderBreaksTab();
  persist();
};

/* ---------- summary cards ---------- */
App.renderSummaryCards = function(){
  const cls = classify();
  const cfg = state.config;
  const shifts = state.shifts;
  const needs = shifts.filter(s=>requiresBreak(s,cfg));
  const assigned = needs.filter(s=>shiftStatus(s,cfg).code==="scheduled");
  const crits = shifts.filter(s=>shiftStatus(s,cfg).level==="crit");
  const morningStarts = shifts.filter(s=>toMin(s.start)<=toMin(cfg.shiftThresholds.morningCutoff));
  const avgStart = a => a.length? fmt12(a.reduce((x,s)=>x+toMin(s.start),0)/a.length) : "—";
  const nightShifts = shifts.filter(s=>toMin(s.start)>toMin(cfg.shiftThresholds.morningCutoff));
  $("summaryCards").innerHTML = `
    <div class="card"><h4>Morning coverage (≤${fmt12(toMin(cfg.shiftThresholds.morningCutoff))} start)</h4>
      <div class="big">${cls.morning.size} <span class="tag">employees</span></div>
      <div class="sub">Avg shift start: ${avgStart(morningStarts)} · Wed+Sat: +${cfg.specialDays.wed?.extraEarlyStarters||0} expected (delivery)</div></div>
    <div class="card"><h4>Night coverage</h4>
      <div class="big">${cls.night.size} <span class="tag">employees</span></div>
      <div class="sub">Avg shift start: ${avgStart(nightShifts)}</div></div>
    <div class="card"><h4>Mid-shift overlap (crosses cutoff)</h4>
      <div class="big">${cls.mid.size} <span class="tag">employees</span></div>
      <div class="sub">Bridges morning ↔ night${cfg.shiftThresholds.midShiftCounted?" (counted in both)":""}</div></div>
    <div class="card"><h4>Meal break status</h4>
      <div class="big">${assigned.length}/${needs.length} <span class="tag">assigned</span></div>
      <div class="sub">${crits.length? '🔴 '+crits.length+' conflict(s) — resolve before export' : '✓ No conflicts'}</div></div>`;
};

/* ---------- heat map ---------- */
App.cellClass = function(n, day, hourMin){
  const cfg=state.config;
  const open=toMin(cfg.storeHours[day].open), close=toMin(cfg.storeHours[day].close);
  if(hourMin<open||hourMin>=close) return "cell-off";
  if(n>=cfg.staffingBands.high) return "cell-g";
  if(n>=cfg.staffingBands.low) return "cell-y";
  return "cell-r";
};

App.renderHeatMap = function(){
  const hrs = hoursRange();
  const salesByHour = App.hourlySalesAvg();
  const maxSales = Math.max(1,...Object.values(salesByHour));
  let html = "<tr><th>Hour</th>"+DAYS.map(d=>"<th>"+DAY_LABEL[d]+"</th>").join("")+"<th>Sales intensity</th></tr>";
  for(const t of hrs){
    const h=t/60;
    const pct = (salesByHour[h]||0)/maxSales;
    const dots = "●".repeat(Math.max(0,Math.round(pct*7)))||"·";
    html += "<tr><td class='mono'>"+fmt12(t)+"</td>";
    for(const d of DAYS){
      const open=toMin(state.config.storeHours[d].open), close=toMin(state.config.storeHours[d].close);
      const inHours = t>=open && t<close;
      const n = inHours? staffAt(d,t) : null;
      html += "<td class='"+App.cellClass(n??0,d,t)+"'>"+(inHours? n : "–")+"</td>";
    }
    html += "<td class='muted mono' style='text-align:left'>"+dots+"</td></tr>";
  }
  $("heatMap").innerHTML = html;
};

App.hourlySalesAvg = function(){
  const out={};
  if(!state.sales) return out;
  for(const d of state.sales.days) for(const h in d.hourly) out[h]=(out[h]||0)+d.hourly[h]/state.sales.days.length;
  return out;
};

/* ---------- employee table ---------- */
App.renderEmpTable = function(){
  const emps=[...new Set(state.shifts.map(s=>s.employee))];
  let html="<tr><th>Name</th>"+DAYS.map(d=>"<th>"+DAY_LABEL[d]+"</th>").join("")+"<th>Hours</th></tr>";
  for(const e of emps){
    let tot=0;
    html+="<tr><td><b>"+e+"</b></td>";
    for(const d of DAYS){
      const s=state.shifts.find(x=>x.employee===e&&x.day===d);
      if(!s){ html+="<td class='muted'>off</td>"; continue; }
      tot+=durH(s);
      const st=shiftStatus(s,state.config);
      let brk="";
      if(requiresBreak(s,state.config)){
        if(st.code==="scheduled") brk="<div class='brk'>🍽 "+fmt12(toMin(s.breakStart))+"</div>";
        else if(st.level==="crit") brk="<div class='brk crit'>🔴 no window</div>";
        else brk="<div class='brk warn'>⚠️ "+ (st.code==="single_window"?"1 window":"unassigned") +"</div>";
      }
      html+="<td><div class='shift-cell' onclick='App.openShiftModal("+s.id+")'><span class='mono'>"+fmt12(toMin(s.start))+"–"+fmt12(toMin(s.end))+"</span> <span class='tag'>("+durH(s).toFixed(1).replace(/\.0$/,"")+"h)</span>"+brk+"</div></td>";
    }
    html+="<td class='mono'>"+tot.toFixed(1)+"</td></tr>";
  }
  html+="<tr><td class='muted'>Daily labor hrs</td>"+DAYS.map(d=>"<td class='mono muted'>"+laborHours(d).toFixed(1)+"</td>").join("")+"<td class='mono'><b>"+totalLaborHours().toFixed(1)+"</b></td></tr>";
  $("empTable").innerHTML=html;
};

/* ---------- shift modal ---------- */
App._editing=null;
App.openShiftModal = function(id){
  App._editing = id==null? null : state.shifts.find(s=>s.id===id);
  $("modalTitle").textContent = App._editing? "Edit Shift" : "Add Shift";
  $("mDelete").style.display = App._editing? "" : "none";
  $("empNames").innerHTML=[...new Set(state.shifts.map(s=>s.employee))].map(e=>"<option value='"+e+"'>").join("");
  $("mEmp").value=App._editing?.employee||"";
  $("mDay").value=App._editing?.day||"mon";
  $("mStart").value=App._editing?.start||"";
  $("mEnd").value=App._editing?.end||"";
  App.updateModalBreakInfo();
  $("mStart").oninput=$("mEnd").oninput=App.updateModalBreakInfo;
  $("modalBg").classList.add("open");
};
App.updateModalBreakInfo = function(){
  const s={start:$("mStart").value,end:$("mEnd").value};
  const box=$("mBreakInfo");
  if(toMin(s.start)==null||toMin(s.end)==null||toMin(s.end)<=toMin(s.start)){ box.innerHTML="<span class='muted'>Enter valid start/end times (24h).</span>"; return; }
  if(!requiresBreak(s,state.config)){ box.innerHTML="<span class='badge b-ok'>"+durH(s).toFixed(1)+"h — no meal break required</span>"; return; }
  const wins=displayWindows(s,state.config);
  if(!wins.length){ box.innerHTML="<span class='badge b-crit'>⚠️ "+durH(s).toFixed(1)+"h — NO valid break window with current blackouts</span>"; return; }
  box.innerHTML="<span class='badge b-info'>"+durH(s).toFixed(1)+"h — break required.</span> <span class='muted'>Valid windows: "+wins.map(w=>fmt12(w.s)).join(", ")+" (auto-assigned on save; adjust in Meal Breaks tab)</span>";
};
App.closeModal = function(){ $("modalBg").classList.remove("open"); };
App.saveShift = function(){
  const emp=$("mEmp").value.trim(), day=$("mDay").value, start=$("mStart").value.trim(), end=$("mEnd").value.trim();
  if(!emp||toMin(start)==null||toMin(end)==null||toMin(end)<=toMin(start)){ App.toast("⚠️ Check employee name and HH:MM times."); return; }
  if(App._editing){ Object.assign(App._editing,{employee:emp,day,start,end}); autoAssign(App._editing,state.config); }
  else{
    const dup=state.shifts.find(s=>s.employee===emp&&s.day===day);
    if(dup){ App.toast("⚠️ "+emp+" already has a "+DAY_LABEL[day]+" shift. Edit it instead."); return; }
    const s={id:state.nextId++,employee:emp,day,start,end,breakStart:null};
    autoAssign(s,state.config); state.shifts.push(s);
  }
  App.closeModal(); App.renderAll(); App.toast("✓ Shift saved");
};
App.deleteShift = function(){
  state.shifts=state.shifts.filter(s=>s!==App._editing);
  App.closeModal(); App.renderAll(); App.toast("Shift deleted");
};
App.autoAssignAll = function(){
  state.shifts.forEach(s=>{ if(!s.override) autoAssign(s,state.config); });
  App.renderAll(); App.toast("✓ Breaks auto-assigned to best valid windows");
};

/* ---------- breaks tab ---------- */
App.renderBreaksTab = function(){
  const sel=$("breakShiftSelect");
  const cur=sel.value;
  sel.innerHTML=state.shifts
    .filter(s=>requiresBreak(s,state.config))
    .map(s=>"<option value='"+s.id+"'>"+s.employee+" — "+DAY_LABEL[s.day]+" "+fmt12(toMin(s.start))+"–"+fmt12(toMin(s.end))+"</option>").join("");
  if(cur && [...sel.options].some(o=>o.value===cur)) sel.value=cur;
  App.renderBreakPanel();
  App.renderConflictReport();
};

App.renderBreakPanel = function(){
  const id=+$("breakShiftSelect").value;
  const s=state.shifts.find(x=>x.id===id);
  const box=$("breakPanel");
  if(!s){ box.innerHTML="<p class='muted'>No shifts over "+state.config.mealBreakRules.minShiftDuration+"h — nothing to schedule.</p>"; return; }
  const cfg=state.config, S=toMin(s.start), E=toMin(s.end), span=E-S;
  const pos=t=>((t-S)/span*100).toFixed(1)+"%";
  const wid=(a,b)=>((b-a)/span*100).toFixed(1)+"%";
  let tl="<div class='timeline'><div class='tl-seg tl-shift' style='left:0;width:100%'></div>";
  for(const b of blackoutsMin(cfg)){
    const a=Math.max(S,b.s), z=Math.min(E,b.e);
    if(z>a) tl+="<div class='tl-seg tl-blackout' style='left:"+pos(a)+";width:"+wid(a,z)+"' title='"+b.reason+"'></div>";
  }
  if(s.breakStart!=null){ const bs=toMin(s.breakStart); tl+="<div class='tl-seg tl-break' style='left:"+pos(bs)+";width:"+wid(bs,bs+cfg.mealBreakRules.breakDuration)+"'></div>"; }
  tl+="<div class='tl-label' style='left:2px'>"+fmt12(S)+"</div><div class='tl-label' style='right:2px'>"+fmt12(E)+"</div></div>";

  const wins=displayWindows(s,cfg);
  const st=shiftStatus(s,cfg);
  let winsHtml;
  if(!wins.length){
    winsHtml="<div class='alert-item crit'>⚠️ <div><b>No valid break window.</b><br>Options: extend the shift past a blackout, split the shift, or acknowledge a manager override.<br><button class='btn small secondary' style='margin-top:6px' onclick='App.overrideBreak("+s.id+")'>Acknowledge override (no break)</button></div></div>";
  } else {
    winsHtml="<div class='row'>"+wins.map(w=>{
      const selCls = s.breakStart!=null&&toMin(s.breakStart)===w.s?" selected":"";
      return "<button class='win-btn"+selCls+(w.suggested?" suggested":"")+"' onclick='App.assignBreak("+s.id+","+w.s+")'>"+fmt12r(w.s,w.e)+"</button>";
    }).join("")+"</div><p class='tag' style='margin-top:6px'>★ = suggested (mid-shift, outside rushes)</p>";
  }
  box.innerHTML =
    "<b>"+s.employee+"</b> — "+DAY_LABEL[s.day]+" "+fmt12(S)+"–"+fmt12(E)+" ("+durH(s).toFixed(1)+"h) "+
    "<span class='badge b-"+(st.level==="ok"?"ok":st.level==="warn"?"warn":"crit")+"'>"+st.label+"</span>"+
    tl+
    "<div class='legend'><span><span class='sw' style='background:rgba(255,90,90,.5)'></span>Blackout (rush)</span><span><span class='sw' style='background:var(--green)'></span>Assigned break</span></div>"+
    "<h3 style='margin-top:12px'>Valid break windows</h3>"+winsHtml;
};

App.assignBreak = function(id,startMin){
  const s=state.shifts.find(x=>x.id===id);
  s.breakStart=toHM(startMin); s.override=true;
  App.renderAll(); App.renderBreakPanel();
  App.toast("✓ Break locked: "+s.employee+" "+fmt12(startMin));
};
App.overrideBreak = function(id){
  const s=state.shifts.find(x=>x.id===id);
  s.breakStart=null; s.override=true; s.ack=true;
  App.renderAll(); App.renderBreakPanel();
  App.toast("Override acknowledged — logged for audit");
};

App.conflictLists = function(){
  const cfg=state.config, crit=[],warn=[],ok=[];
  for(const s of state.shifts){
    const st=shiftStatus(s,cfg);
    const d=durH(s);
    if(st.level==="crit" && !s.ack) crit.push({s,msg:st.code==="no_valid_break_window"?"No valid break window — blackouts cover the whole shift. ACTION: extend/split shift or override.":"Assigned break is now inside a blackout. ACTION: re-assign."});
    else if(st.level==="warn") warn.push({s,msg:st.code==="single_window"?"Only one narrow break window available — verify acceptable.":"Break required but not yet assigned."});
    else if(!requiresBreak(s,cfg) && d>cfg.mealBreakRules.minShiftDuration-0.5) warn.push({s,msg:"Shift "+d.toFixed(1)+"h — close to "+cfg.mealBreakRules.minShiftDuration+"h threshold. Overtime would require a meal break."});
    else ok.push(s);
  }
  return {crit,warn,ok};
};

App.renderConflictReport = function(){
  const {crit,warn,ok}=App.conflictLists();
  const item=(c,cls,icon)=>"<div class='alert-item "+cls+"'>"+icon+"<div><b>"+c.s.employee+"</b> ("+DAY_LABEL[c.s.day]+" "+fmt12(toMin(c.s.start))+"–"+fmt12(toMin(c.s.end))+"): "+c.msg+"</div></div>";
  $("conflictReport").innerHTML =
    "<h3>🔴 Critical ("+crit.length+")</h3>"+(crit.map(c=>item(c,"crit","🔴")).join("")||"<p class='muted'>None</p>")+
    "<h3 style='margin-top:10px'>🟡 Warning ("+warn.length+")</h3>"+(warn.map(c=>item(c,"warn","🟡")).join("")||"<p class='muted'>None</p>")+
    "<h3 style='margin-top:10px'>✓ OK ("+ok.length+")</h3><p class='muted'>"+ok.length+" shifts have valid break status.</p>";
};
</script>
