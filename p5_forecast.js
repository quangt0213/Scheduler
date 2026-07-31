<script>
/* ================= SALES, FORECAST, COVERAGE, COMPARE ================= */
App._charts = {};

App.renderSales = function(){
  const cfg=state.config;
  $("multDayLbl").textContent=cfg.busynessMultipliers.day;
  $("multNightLbl").textContent=cfg.busynessMultipliers.night;
  if(!state.sales){ $("salesCards").innerHTML="<div class='card'><h4>No sales data</h4><div class='sub'>Import PDFs/CSV in Import/Export tab.</div></div>"; return; }
  const days=state.sales.days;
  const total=days.reduce((a,d)=>a+d.total,0);
  const peak=days.reduce((a,d)=>d.total>a.total?d:a);
  const slow=days.reduce((a,d)=>d.total<a.total?d:a);
  const guests=days.reduce((a,d)=>a+(d.guests||0),0);
  const hourly=App.hourlySalesAvg();
  const peakHour=Object.entries(hourly).sort((a,b)=>b[1]-a[1])[0];
  $("salesCards").innerHTML=`
    <div class="card"><h4>Weekly total</h4><div class="big">${money(total)}</div><div class="sub">${state.sales.label}</div></div>
    <div class="card"><h4>Daily average</h4><div class="big">${money(total/7)}</div><div class="sub">Avg ticket: ${guests?"$"+(total/guests).toFixed(2):"—"}</div></div>
    <div class="card"><h4>Peak day</h4><div class="big">${DAY_LABEL[peak.day]} ${money(peak.total)}</div><div class="sub">Slowest: ${DAY_LABEL[slow.day]} ${money(slow.total)}</div></div>
    <div class="card"><h4>Peak hour</h4><div class="big">${peakHour?fmt12(+peakHour[0]*60):"—"}</div><div class="sub">${peakHour?"avg "+money(peakHour[1])+"/day":""}</div></div>`;

  const mkChart=(id,cfgc)=>{ if(App._charts[id])App._charts[id].destroy(); App._charts[id]=new Chart($(id),cfgc); };
  const gridCol="rgba(139,147,165,.15)", tickCol="#8b93a5";
  mkChart("dailyChart",{type:"bar",data:{labels:days.map(d=>DAY_LABEL[d.day]),datasets:[{data:days.map(d=>Math.round(d.total)),backgroundColor:"rgba(214,43,43,.65)",borderRadius:6}]},
    options:{plugins:{legend:{display:false}},scales:{x:{grid:{color:gridCol},ticks:{color:tickCol}},y:{grid:{color:gridCol},ticks:{color:tickCol,callback:v=>"$"+(v/1000)+"k"}}},maintainAspectRatio:false}});
  const hrs=Object.keys(hourly).map(Number).sort((a,b)=>a-b);
  mkChart("hourlyChart",{type:"line",data:{labels:hrs.map(h=>fmt12(h*60)),datasets:[{data:hrs.map(h=>Math.round(hourly[h])),borderColor:"#ff6b4a",backgroundColor:"rgba(255,107,74,.15)",fill:true,tension:.35,pointRadius:3}]},
    options:{plugins:{legend:{display:false}},scales:{x:{grid:{color:gridCol},ticks:{color:tickCol,maxRotation:60}},y:{grid:{color:gridCol},ticks:{color:tickCol,callback:v=>"$"+v}}},maintainAspectRatio:false}});
};

/* ---------- forecast ---------- */
App.runForecast = function(){
  if(!state.sales){ App.toast("⚠️ Import sales data first."); return; }
  const mode=$("fcMode").value, val=+$("fcValue").value, adj=+$("fcAdjust").value;
  const baseTotal=state.sales.days.reduce((a,d)=>a+d.total,0);
  const target=(mode==="growth"? baseTotal*(1+val/100) : val)*adj;
  const growth=target/baseTotal;
  const cfg=state.config, wage=cfg.payroll.averageHourlyWage;
  const hourly=App.hourlySalesAvg();               // avg $ per hour-of-day per day
  const hrs=Object.keys(hourly).map(Number).sort((a,b)=>a-b);
  // revenue-per-staff-hour baseline per hour of day (avg across week)
  const rows=hrs.map(h=>{
    const t=h*60;
    const avgStaff = DAYS.reduce((a,d)=>a+staffAt(d,t),0)/7;
    const mult = t>=17*60 ? cfg.busynessMultipliers.night : cfg.busynessMultipliers.day;
    const baseRev=hourly[h]||0;
    const fcRev=baseRev*growth;
    const rpsh = avgStaff>0 ? baseRev/avgStaff : baseRev; // revenue per staff-hour
    const recommended = Math.max(avgStaff>0?1:0, Math.ceil(fcRev*mult/Math.max(rpsh*mult,1)/1));
    // simpler robust heuristic: scale current staffing by demand growth, weighted by multiplier
    const rec2 = Math.ceil(avgStaff * growth * (mult/cfg.busynessMultipliers.day) - 0.25);
    const rec = Math.max(recommended>0?Math.min(recommended,rec2):rec2, Math.round(avgStaff));
    const gap = rec - Math.round(avgStaff);
    const lossPerMissing = fcRev*0.12; // est. 12% of hour revenue at risk per missing head
    return {h, current:Math.round(avgStaff), recommended:rec, gap, fcRev, loss: gap>0? gap*lossPerMissing:0,
      risk: gap>=2?"CRITICAL": gap===1?"UNDER": gap<0?"OVER":"OK"};
  });
  state.forecast={target, baseTotal, growth, rows, label:(mode==="growth"? "+"+val+"%":"target "+money(val))+(adj!==1?" with adjustment":"")};
  App.renderForecast();
  persist();
};

App.renderForecast = function(){
  const f=state.forecast; if(!f) return;
  $("forecastPanel").style.display="";
  $("forecastTitle").textContent="Forecast Results: "+f.label+" → weekly target "+money(f.target)+" (baseline "+money(f.baseTotal)+")";
  let html="<tr><th>Hour</th><th>Current avg</th><th>Recommended</th><th>Gap</th><th>Fcst $/hr (day avg)</th><th>Risk</th></tr>";
  for(const r of f.rows){
    html+="<tr><td class='mono'>"+fmt12(r.h*60)+"</td><td>"+r.current+"</td><td>"+r.recommended+"</td><td class='mono'>"+(r.gap>0?"+"+r.gap:r.gap)+"</td><td class='mono'>"+money(r.fcRev)+"</td>"+
      "<td class='risk-"+r.risk+"'>"+(r.risk==="CRITICAL"?"🔴 CRITICAL "+(r.loss?"(−"+money(r.loss)+" at risk)":""):r.risk==="UNDER"?"🟡 UNDER "+(r.loss?"(−"+money(r.loss)+" at risk)":""):r.risk==="OVER"?"🔵 over-staffed":"✓ OK")+"</td></tr>";
  }
  $("forecastTable").innerHTML=html;
  const gapHrs=f.rows.reduce((a,r)=>a+Math.max(0,r.gap),0);
  const wage=state.config.payroll.averageHourlyWage;
  const cost=gapHrs*wage*7, risk=f.rows.reduce((a,r)=>a+r.loss,0)*7;
  const roi=cost>0?(risk/cost):0;
  $("forecastSummary").innerHTML=`
    <div class="grid c4">
      <div class="card"><h4>Total gap</h4><div class="big">${gapHrs} hrs/day</div><div class="sub">${gapHrs*7} hrs/week</div></div>
      <div class="card"><h4>Cost to fill</h4><div class="big">${money(cost)}/wk</div><div class="sub">${gapHrs*7} hrs × $${wage}/hr</div></div>
      <div class="card"><h4>Revenue at risk</h4><div class="big">${money(risk)}/wk</div><div class="sub">if left understaffed</div></div>
      <div class="card"><h4>ROI of filling gaps</h4><div class="big">${roi?roi.toFixed(1)+"×":"—"}</div><div class="sub">${roi>1?"✓ Recommended":"review"}</div></div>
    </div>
    <p class="muted" style="margin-top:10px">Next: open <b>A/B Compare</b> → “Build proposal from forecast”.</p>`;
};

/* ---------- coverage analysis ---------- */
App.renderCoverage = function(){
  const blocks=[
    {name:"Morning rush", s:9*60, e:11*60, note:"Light traffic; opening prep."},
    {name:"Early lunch", s:11*60, e:12*60, note:"Transition before lunch rush."},
    {name:"Lunch rush ⭐", s:12*60, e:14*60, note:"Blackout: meal breaks NOT allowed (protects coverage)."},
    {name:"Mid-shift", s:14*60, e:17*60, note:"Optimal meal-break window — utilize."},
    {name:"Dinner rush ⭐⭐", s:17*60, e:20*60, note:"Blackout: meal breaks NOT allowed. Highest revenue block."},
    {name:"Evening wind-down", s:20*60, e:22*60, note:"Thin out after 9 PM (closing team)."}
  ];
  const hourly=App.hourlySalesAvg();
  const totalAvg=Object.values(hourly).reduce((a,b)=>a+b,0)||1;
  let html="";
  for(const b of blocks){
    let staffMin=99, staffMax=0, rev=0;
    for(let t=b.s;t<b.e;t+=60){
      const counts=DAYS.map(d=>staffAt(d,t));
      staffMin=Math.min(staffMin,...counts); staffMax=Math.max(staffMax,...counts);
      rev+=hourly[t/60]||0;
    }
    const pct=(rev/totalAvg*100);
    const low=state.config.staffingBands.low;
    const status = staffMin<low ? (b.name.includes("⭐")?"<span class='badge b-crit'>🔴 Under at peak</span>":"<span class='badge b-warn'>🟡 Marginal</span>")
      : staffMin<state.config.staffingBands.high?"<span class='badge b-warn'>🟡 On-target</span>":"<span class='badge b-ok'>✓ Good</span>";
    html+=`<div class="alert-item ${staffMin<low?"crit":"ok"}"><div style="min-width:170px"><b>${b.name}</b><br><span class="tag">${fmt12(b.s)}–${fmt12(b.e)}</span></div>
      <div>Staff: ${staffMin===staffMax?staffMin:staffMin+"–"+staffMax} across week · Sales: ${pct.toFixed(0)}% of daily total (~${money(rev)}/day) · ${status}<br><span class="muted">${b.note}</span></div></div>`;
  }
  $("coverageBlocks").innerHTML=html;
  App.renderAlerts();
};

App.renderAlerts = function(){
  const alerts=[];
  const {crit,warn}=App.conflictLists();
  crit.forEach(c=>alerts.push({lvl:"crit",msg:c.s.employee+" ("+DAY_LABEL[c.s.day]+" "+fmt12(toMin(c.s.start))+"–"+fmt12(toMin(c.s.end))+"): "+c.msg}));
  warn.forEach(c=>alerts.push({lvl:"warn",msg:c.s.employee+" ("+DAY_LABEL[c.s.day]+"): "+c.msg}));
  // coverage vs peaks
  const low=state.config.staffingBands.low;
  for(const d of DAYS){
    for(const t of [12*60,13*60,17*60,18*60,19*60]){
      const n=staffAt(d,t);
      const open=toMin(state.config.storeHours[d].open), close=toMin(state.config.storeHours[d].close);
      if(t>=open&&t<close&&n<low) alerts.push({lvl:"crit",msg:DAY_LABEL[d]+" "+fmt12(t)+": only "+n+" staff during peak. Benchmark: "+state.config.staffingBands.high+"+."});
    }
    const sd=state.config.specialDays[d];
    if(sd){
      const early=state.shifts.filter(s=>s.day===d&&toMin(s.start)<=toMin("10:00")).length;
      if(early<sd.extraEarlyStarters+1) alerts.push({lvl:"warn",msg:DAY_LABEL[d]+" morning: "+early+" early starter(s); "+sd.reason.toLowerCase()+" expects +"+sd.extraEarlyStarters+"."});
    }
  }
  if(state.forecast){
    const gapHrs=state.forecast.rows.reduce((a,r)=>a+Math.max(0,r.gap),0);
    if(gapHrs>0) alerts.push({lvl:"info",msg:"Forecast "+state.forecast.label+": feasible with +"+gapHrs*7+" labor hours/week (see A/B Compare)."});
  }
  if(!crit.length) alerts.push({lvl:"ok",msg:"All meal breaks scheduled; no critical conflicts."});
  const icon={crit:"🔴",warn:"🟡",info:"ℹ️",ok:"✓"};
  $("alertsList").innerHTML=alerts.sort((a,b)=>({crit:0,warn:1,info:2,ok:3})[a.lvl]-({crit:0,warn:1,info:2,ok:3})[b.lvl])
    .map(a=>"<div class='alert-item "+a.lvl+"'>"+icon[a.lvl]+"<div>"+a.msg+"</div></div>").join("");
};

/* ---------- A/B comparison ---------- */
App.buildProposal = function(){
  if(!state.forecast){ App.toast("⚠️ Run a forecast first."); return; }
  // proposal = per-day extra hours at gap hours
  const adds=[];
  for(const r of state.forecast.rows) if(r.gap>0) adds.push({hour:r.h, people:r.gap});
  state.proposal={adds, extraHoursPerDay: adds.reduce((a,x)=>a+x.people,0)};
  App.renderCompare(); persist();
  $("applyBtn").disabled=false;
};
App.clearProposal = function(){ state.proposal=null; $("applyBtn").disabled=true; App.renderCompare(); persist(); };
App.applyProposal = function(){
  if(!state.proposal) return;
  // create "Flex" cover shifts grouping contiguous gap hours per day
  const spans=[]; let cur=null;
  for(const a of state.proposal.adds.sort((x,y)=>x.hour-y.hour)){
    for(let i=0;i<a.people;i++){
      const sp=spans.find(s=>s.end===a.hour&&s.slot===i);
      if(sp) sp.end=a.hour+1; else spans.push({start:a.hour,end:a.hour+1,slot:i});
    }
  }
  let n=1;
  for(const d of DAYS){
    for(const sp of spans){
      state.shifts.push({id:state.nextId++,employee:"Flex-"+(n++),day:d,start:toHM(sp.start*60),end:toHM(sp.end*60),breakStart:null});
    }
  }
  state.shifts.forEach(s=>{ if(s.employee.startsWith("Flex-")) autoAssign(s,state.config); });
  App.clearProposal();
  App.renderAll();
  App.toast("✓ Proposal applied — Flex cover shifts added for every day");
};

App.renderCompare = function(){
  const box=$("compareBody");
  if(!state.forecast){ box.innerHTML="<p class='muted'>Run a forecast first (Sales & Forecast tab), then click “Build proposal from forecast”.</p>"; return; }
  if(!state.proposal){ box.innerHTML="<p class='muted'>Forecast ready ("+state.forecast.label+"). Click “Build proposal from forecast”.</p>"; return; }
  const wage=state.config.payroll.averageHourlyWage;
  const curHrs=totalLaborHours();
  const addPerDay=state.proposal.extraHoursPerDay;
  const propHrs=curHrs+addPerDay*7;
  const curCost=curHrs*wage, propCost=propHrs*wage;
  const risk=state.forecast.rows.reduce((a,r)=>a+r.loss,0)*7;
  const net=risk-(propCost-curCost);
  const {crit}=App.conflictLists();
  let rows="";
  for(const d of DAYS){
    const c=laborHours(d);
    rows+="<tr><td>"+DAY_LABEL[d]+"</td><td class='mono'>"+c.toFixed(1)+"</td><td class='mono'>"+(c+addPerDay).toFixed(1)+"</td><td class='mono'>"+(addPerDay?"+"+addPerDay:"—")+"</td></tr>";
  }
  box.innerHTML=`
  <div class="grid c2">
    <div>
      <h3>Labor hours by day</h3>
      <table><tr><th>Day</th><th>Current</th><th>Proposed</th><th>Δ</th></tr>${rows}
      <tr><td><b>Total</b></td><td class='mono'><b>${curHrs.toFixed(0)}</b></td><td class='mono'><b>${propHrs.toFixed(0)}</b></td><td class='mono'><b>+${(addPerDay*7).toFixed(0)}</b></td></tr></table>
      <h3 style="margin-top:14px">Staffing additions (from forecast gaps)</h3>
      <p class="mono">${state.proposal.adds.map(a=>"+"+a.people+" @ "+fmt12(a.hour*60)).join(" · ")||"none"}</p>
    </div>
    <div>
      <h3>Financial impact</h3>
      <table>
        <tr><td>Weekly labor cost (current)</td><td class="mono">${money(curCost)}</td></tr>
        <tr><td>Weekly labor cost (proposed)</td><td class="mono">${money(propCost)}</td></tr>
        <tr><td>Added cost</td><td class="mono">+${money(propCost-curCost)} (${curCost?((propCost-curCost)/curCost*100).toFixed(1):0}%)</td></tr>
        <tr><td>Revenue protected (fcst)</td><td class="mono">${money(risk)}</td></tr>
        <tr><td><b>Net gain</b></td><td class="mono"><b>${net>=0?"+":""}${money(net)}/week (${(propCost-curCost)>0?(risk/(propCost-curCost)).toFixed(1):"∞"}× ROI)</b></td></tr>
      </table>
      <h3 style="margin-top:14px">Meal break status</h3>
      <p>Current: ${state.shifts.filter(s=>requiresBreak(s,state.config)&&shiftStatus(s,state.config).code==="scheduled").length}/${state.shifts.filter(s=>requiresBreak(s,state.config)).length} valid ${crit.length?"· 🔴 "+crit.length+" conflict(s) to resolve":"✓"}</p>
      <p class="muted">Proposed Flex shifts get breaks auto-assigned on apply.</p>
    </div>
  </div>`;
};
</script>
