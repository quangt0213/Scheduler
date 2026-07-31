<script>
/* ================= SETTINGS, IMPORT/EXPORT, INIT ================= */
App.renderSettings = function(){
  const c=state.config;
  const bo=c.mealBreakRules.blackoutHours;
  $("settingsGrid").innerHTML=`
  <div class="panel"><h3>1 · Shift thresholds</h3>
    <label class="fld">Morning cutoff (start at/before ⇒ morning staff) <input id="stMorning" value="${c.shiftThresholds.morningCutoff}"></label><br>
    <label class="fld">Night cutoff (start after ⇒ night staff) <input id="stNight" value="${c.shiftThresholds.nightCutoff}"></label><br>
    <label class="row" style="margin-top:8px;font-size:13px"><input type="checkbox" id="stMid" ${c.shiftThresholds.midShiftCounted?"checked":""}> Shifts crossing the cutoff count for BOTH morning &amp; night</label>
  </div>
  <div class="panel"><h3>2 · Store hours</h3>
    <table>${DAYS.map(d=>`<tr><td>${DAY_LABEL[d]}</td><td><input style="width:80px" id="oh_${d}_o" value="${c.storeHours[d].open}"></td><td><input style="width:80px" id="oh_${d}_c" value="${c.storeHours[d].close}"></td></tr>`).join("")}</table>
    <label class="fld" style="margin-top:8px">Closing buffer (min past close the closing crew is scheduled) <input id="ohBuf" type="number" step="15" value="${c.closingBuffer||30}"></label>
    <p class="tag">e.g. close 10:30 PM + 30 min → crew scheduled to 11:00 PM (may leave 11–11:30)</p>
  </div>
  <div class="panel"><h3>3 · Meal break rules</h3>
    <label class="fld">Min shift duration for meal break (hrs) <input id="mbMin" type="number" step="0.5" value="${c.mealBreakRules.minShiftDuration}"></label><br>
    <label class="fld">Break duration (min) <input id="mbDur" type="number" value="${c.mealBreakRules.breakDuration}"></label>
    <h3 style="margin-top:10px">Blackout hours (no breaks)</h3>
    <div id="blackoutList">${bo.map((b,i)=>`<div class="row" style="margin-bottom:6px"><input style="width:75px" id="bo_${i}_s" value="${b.start}"><span>→</span><input style="width:75px" id="bo_${i}_e" value="${b.end}"><input style="width:130px" id="bo_${i}_r" value="${b.reason}"><button class="btn small secondary" onclick="App.removeBlackout(${i})">✕</button></div>`).join("")}</div>
    <button class="btn small secondary" onclick="App.addBlackout()">+ Add blackout</button>
  </div>
  <div class="panel"><h3>4 · Special days</h3>
    <table><tr><th>Day</th><th>Extra early starters</th><th>Reason</th></tr>
    ${DAYS.map(d=>{const s=c.specialDays[d];return `<tr><td>${DAY_LABEL[d]}</td><td><input style="width:60px" type="number" id="sd_${d}_n" value="${s?s.extraEarlyStarters:0}"></td><td><input id="sd_${d}_r" value="${s?s.reason:""}"></td></tr>`;}).join("")}</table>
  </div>
  <div class="panel"><h3>5 · Busyness multipliers</h3>
    <label class="fld">Day (9 AM–5 PM) <input id="bmDay" type="number" step="0.1" value="${c.busynessMultipliers.day}"></label><br>
    <label class="fld">Night (5 PM–close) <input id="bmNight" type="number" step="0.1" value="${c.busynessMultipliers.night}"></label>
  </div>
  <div class="panel"><h3>6 · Payroll &amp; staffing bands</h3>
    <label class="fld">Average hourly wage ($) <input id="pyWage" type="number" step="0.5" value="${c.payroll.averageHourlyWage}"></label><br>
    <label class="fld">Red below (staff/hr) <input id="bandLow" type="number" value="${c.staffingBands.low}"></label><br>
    <label class="fld">Green at/above (staff/hr) <input id="bandHigh" type="number" value="${c.staffingBands.high}"></label>
  </div>`;
};
App.addBlackout=function(){ state.config.mealBreakRules.blackoutHours.push({start:"15:00",end:"16:00",reason:"Custom"}); App.renderSettings(); };
App.removeBlackout=function(i){ App.collectSettings(); state.config.mealBreakRules.blackoutHours.splice(i,1); App.renderSettings(); };
App.collectSettings=function(){
  const c=state.config;
  const v=id=>$(id)?$(id).value:null;
  if(v("stMorning")==null) return;
  c.shiftThresholds.morningCutoff=v("stMorning"); c.shiftThresholds.nightCutoff=v("stNight");
  c.shiftThresholds.midShiftCounted=$("stMid").checked;
  c.closingBuffer=+v("ohBuf")||0;
  for(const d of DAYS){ c.storeHours[d]={open:v("oh_"+d+"_o"),close:v("oh_"+d+"_c")};
    const n=+v("sd_"+d+"_n"); if(n>0) c.specialDays[d]={extraEarlyStarters:n,reason:v("sd_"+d+"_r")||"Special"}; else delete c.specialDays[d]; }
  c.mealBreakRules.minShiftDuration=+v("mbMin"); c.mealBreakRules.breakDuration=+v("mbDur");
  c.mealBreakRules.blackoutHours=c.mealBreakRules.blackoutHours.map((b,i)=>({start:v("bo_"+i+"_s")||b.start,end:v("bo_"+i+"_e")||b.end,reason:v("bo_"+i+"_r")||b.reason}));
  c.busynessMultipliers={day:+v("bmDay"),night:+v("bmNight")};
  c.payroll.averageHourlyWage=+v("pyWage");
  c.staffingBands={low:+v("bandLow"),high:+v("bandHigh")};
};
App.saveSettings=function(){
  App.collectSettings();
  state.shifts.forEach(s=>{ if(!s.override) autoAssign(s,state.config); });
  App.renderAll(); App.renderSettings();
  App.toast("✓ Settings saved & breaks re-validated");
};
App.resetSettings=function(){ state.config=JSON.parse(JSON.stringify(DEFAULT_CONFIG)); App.renderSettings(); App.renderAll(); App.toast("Settings reset to defaults"); };

/* ---------- schedule import ---------- */
App.importScheduleFile=function(file){
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:"array"});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false});
      let imported=0, skipped=[];
      const newShifts=[]; let nid=1;
      for(const row of rows){
        if(!row||!row[0]) continue;
        const name=String(row[0]).trim();
        if(/^name$/i.test(name)) continue;
        DAYS.forEach((d,i)=>{
          const cell=row[i+1];
          if(cell==null||String(cell).trim()===""||/^off$/i.test(String(cell).trim())) return;
          const p=parseShiftText(cell,d,state.config);
          if(p){ newShifts.push({id:nid++,employee:name,day:d,start:p.start,end:p.end,breakStart:null}); imported++; }
          else skipped.push(name+" "+DAY_LABEL[d]+' "'+cell+'"');
        });
      }
      if(!imported){ App.toast("⚠️ No shifts parsed. Expected: Name, Sun…Sat with times like 9-4."); return; }
      state.shifts=newShifts; state.nextId=nid;
      state.shifts.forEach(s=>autoAssign(s,state.config));
      App.renderAll(); App.switchTab("schedule");
      App.toast("✓ Imported "+imported+" shifts"+(skipped.length?" · ⚠️ skipped "+skipped.length+" unparseable: "+skipped.slice(0,3).join("; "):""));
    }catch(err){ App.toast("⚠️ Could not read file: "+err.message); }
  };
  rd.readAsArrayBuffer(file);
};
App.downloadScheduleTemplate=function(){
  const data=[["Name","Sun","Mon","Tue","Wed","Thu","Fri","Sat"],...SAMPLE_ROSTER];
  const ws=XLSX.utils.aoa_to_sheet(data); const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Schedule");
  XLSX.writeFile(wb,"schedule_template.xlsx");
};

/* ---------- sales import (PDF/CSV) ---------- */
App.importSalesFiles=async function(files){
  const status=$("salesImportStatus");
  const dayResults=[];
  for(const f of files){
    try{
      if(/\.csv$/i.test(f.name)) dayResults.push(...await App.parseSalesCSV(f));
      else if(/\.pdf$/i.test(f.name)) dayResults.push(await App.parseSalesPDF(f));
    }catch(err){ status.innerHTML+="<div class='alert-item warn'>⚠️ "+f.name+": "+err.message+"</div>"; }
  }
  const valid=dayResults.filter(Boolean);
  if(!valid.length){ status.innerHTML+="<div class='alert-item crit'>🔴 No sales data parsed. Try the CSV format: date,time_block,revenue,guests</div>"; return; }
  valid.sort((a,b)=>a.date.localeCompare(b.date));
  // validation
  const problems=[];
  for(const d of valid){ if(d.total<=0) problems.push(d.date+": non-positive total"); for(const h in d.hourly) if(d.hourly[h]<0) problems.push(d.date+" "+h+":00 negative revenue"); }
  const dates=valid.map(d=>d.date); if(new Set(dates).size!==dates.length) problems.push("Overlapping/duplicate dates detected");
  state.sales={label:dates[0]+" → "+dates[dates.length-1], days:valid.map(d=>({...d, day: DAYS[new Date(d.date+"T12:00:00").getDay()]}))};
  state.weekLabel="Week of "+dates[0]+" → "+dates[dates.length-1];
  persist();
  status.innerHTML="<div class='alert-item ok'>✓ Loaded "+valid.length+" day(s): "+dates.join(", ")+". Set as forecasting baseline.</div>"+
    (problems.length?"<div class='alert-item warn'>⚠️ "+problems.join("<br>")+"</div>":"");
  App.renderAll();
};
App.parseSalesCSV=function(file){
  return new Promise((res,rej)=>{
    const rd=new FileReader();
    rd.onload=e=>{
      const lines=String(e.target.result).split(/\r?\n/).filter(l=>l.trim());
      const byDate={};
      for(const line of lines){
        const c=line.split(",").map(x=>x.trim());
        if(!/^\d{4}-\d{2}-\d{2}$/.test(c[0])) continue;
        const [date,block,rev,guests]=c;
        const hm=block.match(/^(\d{1,2}):?(\d{2})?/); if(!hm) continue;
        const h=+hm[1];
        byDate[date]=byDate[date]||{date,hourly:{},total:0,guests:0};
        byDate[date].hourly[h]=(byDate[date].hourly[h]||0)+(+rev||0);
        byDate[date].total+=(+rev||0); byDate[date].guests+=(+guests||0);
      }
      const days=Object.values(byDate);
      days.length? res(days) : rej(new Error("no rows matched date,time_block,revenue,guests"));
    };
    rd.onerror=()=>rej(new Error("read failed"));
    rd.readAsText(file);
  });
};
App.parseSalesPDF=async function(file){
  if(!window.pdfjsLib) throw new Error("PDF library failed to load (offline?). Use CSV.");
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let text="";
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    text+=tc.items.map(i=>i.str).join(" ")+"\n";
  }
  // date from header
  const dm=text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const date=dm? dm[3]+"-"+dm[1]+"-"+dm[2] : null;
  if(!date) throw new Error("no date found in PDF header");
  // rows: "11:00 AM - 11:30 AM ... $245.67"
  const rowRe=/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM)[^$\n]*?(\d[\d,]*)\s*%?[^$\n]*?\$\s*([\d,]+(?:\.\d{2})?)/gi;
  const hourly={}; let total=0, guests=0, m;
  while((m=rowRe.exec(text))!==null){
    let h=+m[1]%12; if(m[3].toUpperCase()==="PM") h+=12;
    const rev=parseFloat(m[5].replace(/,/g,""));
    const g=parseInt(m[4].replace(/,/g,""))||0;
    if(!isFinite(rev)) continue;
    hourly[h]=(hourly[h]||0)+rev; total+=rev; guests+=g;
  }
  if(total<=0) throw new Error("no sales rows recognized — export the report as CSV instead");
  return {date,hourly,total,guests};
};

/* ---------- exports ---------- */
App.exportCSV=function(){
  const bd=state.config.mealBreakRules.breakDuration;
  let csv="employee_name,day,start_time,end_time,break_start,break_end,hours,meal_break_required,status\n";
  for(const s of state.shifts){
    const st=shiftStatus(s,state.config);
    const bs=s.breakStart?fmt12(toMin(s.breakStart)):"", be=s.breakStart?fmt12(toMin(s.breakStart)+bd):"";
    csv+=[s.employee,DAY_LABEL[s.day],fmt12(toMin(s.start)),fmt12(toMin(s.end)),bs,be,durH(s).toFixed(2),requiresBreak(s,state.config),st.level==="crit"?"CONFLICT":"approved"].join(",")+"\n";
  }
  App.download("schedule_export.csv",csv,"text/csv");
};
App.exportConfig=function(){
  App.download("panda2355_config.json",JSON.stringify({...state.config,created:new Date().toISOString()},null,2),"application/json");
};
App.importConfigFile=function(file){
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const c=JSON.parse(e.target.result);
      if(!c.mealBreakRules||!c.storeHours) throw new Error("not a valid config");
      state.config={...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),...c};
      state.shifts.forEach(s=>{ if(!s.override) autoAssign(s,state.config); });
      App.renderAll(); App.renderSettings();
      App.toast("✓ Config imported: "+(c.name||file.name));
    }catch(err){ App.toast("⚠️ Config import failed: "+err.message); }
  };
  rd.readAsText(file);
};
App.download=function(name,content,mime){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([content],{type:mime}));
  a.download=name; a.click(); URL.revokeObjectURL(a.href);
};
App.printSchedule=function(){
  const {crit}=App.conflictLists();
  if(crit.length && !confirm(crit.length+" critical conflict(s) unresolved. Print anyway?")) return;
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("print-me"));
  $("tab-schedule").classList.add("print-me");
  window.print();
};
App.printConflicts=function(){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("print-me"));
  $("tab-breaks").classList.add("print-me");
  App.renderBreaksTab();
  window.print();
};
App.loadSampleData=function(confirmIt){
  if(confirmIt && !confirm("Replace current schedule & sales with sample data?")) return;
  loadSample(); state.forecast=null; state.proposal=null;
  App.renderAll(); App.toast("✓ Sample data loaded");
};

/* ---------- wiring & init ---------- */
function wireDrop(dropId, inputId, handler){
  const d=$(dropId), inp=$(inputId);
  d.onclick=()=>inp.click();
  inp.onchange=()=>{ handler([...inp.files]); inp.value=""; };
  d.ondragover=e=>{e.preventDefault(); d.classList.add("over");};
  d.ondragleave=()=>d.classList.remove("over");
  d.ondrop=e=>{e.preventDefault(); d.classList.remove("over"); handler([...e.dataTransfer.files]);};
}
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>App.switchTab(b.dataset.tab));
  wireDrop("dropSchedule","fileSchedule",fs=>fs[0]&&App.importScheduleFile(fs[0]));
  wireDrop("dropSales","fileSales",fs=>App.importSalesFiles(fs));
  wireDrop("dropConfig","fileConfig",fs=>fs[0]&&App.importConfigFile(fs[0]));
  if(!restore()) loadSample();
  App.renderAll();
  App.renderSettings();
});
</script>
</body>
</html>
