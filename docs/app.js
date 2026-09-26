const $=id=>document.getElementById(id);
const fmt=v=>v===null||v===undefined||v===""?"—":v;
const pct=v=>v===null||v===undefined?"—":`${v>0?"+":""}${Number(v).toFixed(2)}%`;
const money=v=>v===null||v===undefined?"—":"$"+Number(v).toFixed(2);

const dateOnly=v=>{
  if(!v)return "—";
  const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[1]}/${m[2]}/${m[3]}`:v;
};
const jst=v=>{
  if(!v)return "—";
  const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m?`${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]} JST`:v;
};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const compactNumber=v=>{
  if(v===null||v===undefined||Number.isNaN(Number(v)))return "—";
  const n=Math.round(Number(v)*100)/100;
  return Number.isInteger(n)?String(n):String(n).replace(/0+$/,"").replace(/\.$/,"");
};

const WORKFLOW_URL="https://github.com/nakayama2536-happy/us-stock-check/actions/workflows/shadow-update.yml";
const RECHECK_SLOTS_JST=[390,480,690]; // 06:30 / 08:00 / 11:30 JST
function tokyoClock(){
  const parts=Object.fromEntries(
    new Intl.DateTimeFormat("en-CA",{
      timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(new Date()).filter(p=>p.type!=="literal").map(p=>[p.type,p.value])
  );
  return {
    year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),
    hour:Number(parts.hour),minute:Number(parts.minute)
  };
}
function scheduleLabel(clock,slot,dayOffset=0){
  const d=new Date(Date.UTC(clock.year,clock.month-1,clock.day+dayOffset));
  const mm=String(d.getUTCMonth()+1).padStart(2,"0");
  const dd=String(d.getUTCDate()).padStart(2,"0");
  const hh=String(Math.floor(slot/60)).padStart(2,"0");
  const mi=String(slot%60).padStart(2,"0");
  return `${mm}/${dd} ${hh}:${mi} JST`;
}
function nextRecheckSchedule(){
  const clock=tokyoClock();
  const now=clock.hour*60+clock.minute;
  const future=RECHECK_SLOTS_JST.filter(x=>x>now);
  if(future.length>=2)return {next:scheduleLabel(clock,future[0]),backup:scheduleLabel(clock,future[1])};
  if(future.length===1)return {next:scheduleLabel(clock,future[0]),backup:scheduleLabel(clock,RECHECK_SLOTS_JST[0],1)};
  return {next:scheduleLabel(clock,RECHECK_SLOTS_JST[0],1),backup:scheduleLabel(clock,RECHECK_SLOTS_JST[1],1)};
}
function renderRecheckSchedule(){
  const s=nextRecheckSchedule();
  if($("recheckAt"))$("recheckAt").textContent=s.next;
  if($("backupRecheckAt"))$("backupRecheckAt").textContent=s.backup;
}

const TAB_IDS=["overview","stocks","market","quality"];
function activateTab(tab,{scroll=true}={}){
  const next=TAB_IDS.includes(tab)?tab:"overview";
  document.querySelectorAll("[data-tab-panel]").forEach(panel=>{
    panel.hidden=panel.dataset.tabPanel!==next;
  });
  document.querySelectorAll(".bottom-nav [data-tab]").forEach(button=>{
    const active=button.dataset.tab===next;
    button.classList.toggle("active",active);
    button.setAttribute("aria-selected",active?"true":"false");
    button.tabIndex=active?0:-1;
  });
  try{localStorage.setItem("usstock.activeTab",next);}catch(_){}
  if(scroll){
    const hero=document.querySelector(".hero");
    const top=hero?Math.max(0,hero.offsetTop):0;
    window.scrollTo({top,behavior:"smooth"});
  }
}
function setupTabs(){
  let initial="overview";
  try{
    const saved=localStorage.getItem("usstock.activeTab");
    if(TAB_IDS.includes(saved))initial=saved;
  }catch(_){}
  document.querySelectorAll(".bottom-nav [data-tab]").forEach(button=>{
    button.addEventListener("click",()=>activateTab(button.dataset.tab));
    button.addEventListener("keydown",event=>{
      if(!["ArrowLeft","ArrowRight"].includes(event.key))return;
      event.preventDefault();
      const current=TAB_IDS.indexOf(button.dataset.tab);
      const step=event.key==="ArrowRight"?1:-1;
      const next=TAB_IDS[(current+step+TAB_IDS.length)%TAB_IDS.length];
      activateTab(next,{scroll:false});
      document.querySelector(`.bottom-nav [data-tab="${next}"]`)?.focus();
    });
  });
  activateTab(initial,{scroll:false});
}

const chart28Svg=history=>{
  const xs=(history||[]).filter(p=>p&&/^\d{4}-\d{2}-\d{2}$/.test(String(p.date||""))&&Number.isFinite(Number(p.value))).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(xs.length<2)return '<div class="history-wait">28日履歴を準備中です。</div>';
  const day=86400000,w=640,h=150,pl=28,pr=18,pt=15,pb=24;
  const ms=d=>Date.parse(String(d)+"T00:00:00Z");
  const end=ms(xs[xs.length-1].date),start=end-27*day;
  const vis=xs.filter(p=>ms(p.date)>=start&&ms(p.date)<=end);
  const vals=vis.map(p=>Number(p.value));
  let lo=Math.min(...vals),hi=Math.max(...vals);if(lo===hi){lo-=1;hi+=1}
  const pad=(hi-lo)*.08;lo-=pad;hi+=pad;
  const x=d=>pl+(ms(d)-start)*(w-pl-pr)/(27*day),y=v=>pt+(hi-Number(v))*(h-pt-pb)/(hi-lo);
  const grid=[.25,.5,.75].map(t=>{const yy=(pt+t*(h-pt-pb)).toFixed(1);return '<line class="chart-grid" x1="'+pl+'" y1="'+yy+'" x2="'+(w-pr)+'" y2="'+yy+'"/>';}).join("");
  const sd=new Date(start);let sunday=start+((7-sd.getUTCDay())%7)*day,weeks="";
  for(;sunday<=end;sunday+=7*day){const xx=(pl+(sunday-start)*(w-pl-pr)/(27*day)).toFixed(1),d=new Date(sunday),lab=(d.getUTCMonth()+1)+"/"+d.getUTCDate();weeks+='<line class="chart-week" x1="'+xx+'" y1="'+pt+'" x2="'+xx+'" y2="'+(h-pb)+'"/><text x="'+xx+'" y="'+(h-5)+'" text-anchor="middle">'+lab+'</text>';}
  let path="";vis.forEach((p,i)=>{path+=(i?" L ":"M ")+x(p.date).toFixed(1)+","+y(p.value).toFixed(1);});
  return '<svg class="market-chart" viewBox="0 0 '+w+' '+h+'" role="img">'+grid+weeks+'<path class="chart-line" d="'+path+'"/></svg>';
};
function renderMarketCharts(items){
  const details=$("marketChartsDetails"),root=$("marketCharts");
  if(!details||!root)return;
  const ready=(items||[]).filter(m=>Array.isArray(m.history)&&m.history.length>=2);
  if(!ready.length){details.classList.add("hidden");root.innerHTML="";return;}
  root.innerHTML=ready.map(m=>'<div class="market-chart-card"><div class="market-chart-head"><b>'+fmt(m.name)+'</b><span>28日 / 最新 '+fmt(m.value)+'</span></div>'+chart28Svg(m.history)+'</div>').join("");
  details.classList.remove("hidden");
}


function commonStateClass(value){
  const v=String(value||"").toUpperCase();
  if(["PASS","FRESH","CURRENT","CONFIRMED","ELIGIBLE"].includes(v))return "common-ok";
  if(["FAIL","STALE","MISSING","BLOCKED","NOT_ELIGIBLE"].includes(v))return "common-ng";
  return "common-warn";
}
function commonStateLabel(value){
  const v=String(value||"").toUpperCase();
  return ({
    PASS:"正常",WARN:"注意",FAIL:"要確認",
    FRESH:"最新",PARTIAL:"一部確認",CURRENT:"最新",LAST_VALID:"直近有効値",
    CONFIRMED:"確認済み",UNKNOWN:"不明",MISSING:"未取得",
    ELIGIBLE:"判断可能",NOT_ELIGIBLE:"判断不可"
  })[v]||fmt(value);
}
function renderCommonDigest(common){
  const section=$("commonSection");
  const root=$("commonDigest");
  if(!section||!root)return;
  if(!common||common.schema_version!=="1.0"){
    section.classList.add("hidden");
    root.innerHTML="";
    return;
  }
  section.classList.remove("hidden");
  const q=common.data_quality||{};
  const items=common.decision_items||[];
  const snapshotState=String(common.snapshot?.state||"").toUpperCase();
  if(snapshotState==="NONE"||items.length===0){
    root.innerHTML=
      '<div class="common-head">'+
        '<div><div class="common-eyebrow">共通10秒確認</div>'+
        '<div class="common-title">Common判断スナップショット待ち</div></div>'+
        '<span class="common-pill '+commonStateClass(q.qc_state)+'">品質 '+commonStateLabel(q.qc_state)+'</span>'+
      '</div>'+
      '<div class="common-grid">'+
        '<div class="common-metric '+commonStateClass(q.data_state)+'"><span>データ</span><b>'+commonStateLabel(q.data_state)+'</b></div>'+
        '<div class="common-metric '+commonStateClass(common.market_state?.state)+'"><span>市場</span><b>'+commonStateLabel(common.market_state?.state)+'</b></div>'+
        '<div class="common-metric common-warn"><span>更新状態</span><b>'+commonStateLabel(common.snapshot?.state)+'</b></div>'+
        '<div class="common-metric common-warn"><span>判断対象</span><b>—</b></div>'+
      '</div>'+
      '<div class="common-blocker">新しいNORMAL/CURRENTスナップショット待ちです。0/0は「判断可能」を意味しません。</div>'+
      '<details class="app-disclosure compact-disclosure"><summary>基準時刻・共通仕様を見る</summary><div class="disclosure-body">基準 '+dateOnly(common.timestamps?.market_as_of)+' / 計算 '+jst(common.timestamps?.calculated_at)+' / 共通仕様 '+fmt(common.common_spec_version)+'</div></details>';
    return;
  }
  const eligible=items.filter(x=>x.eligibility==="ELIGIBLE").length;
  const blocked=items.length-eligible;
  const firstBlocker=items.flatMap(x=>x.blocking_conditions||[]).find(x=>x&&x.label);
  const itemRows=items.map(x=>{
    const blocker=(x.blocking_conditions||[]).find(y=>y&&y.label);
    return '<div class="common-stock-row">'+
      '<b>'+fmt(x.ticker||x.subject_id)+'</b>'+
      '<span class="'+commonStateClass(x.eligibility)+'">'+(x.eligibility==="ELIGIBLE"?"判断可能":"判断不可")+'</span>'+
      '<small>'+fmt(blocker&&blocker.label||"—")+'</small>'+
    '</div>';
  }).join("");
  root.innerHTML=
    '<div class="common-head">'+
      '<div><div class="common-eyebrow">共通10秒確認</div>'+
      '<div class="common-title">'+eligible+'/'+items.length+' 銘柄が正式判断可能</div></div>'+
      '<span class="common-pill '+commonStateClass(q.qc_state)+'">品質 '+commonStateLabel(q.qc_state)+'</span>'+
    '</div>'+
    '<div class="common-grid">'+
      '<div class="common-metric '+commonStateClass(q.data_state)+'"><span>データ</span><b>'+commonStateLabel(q.data_state)+'</b></div>'+
      '<div class="common-metric '+commonStateClass(common.market_state?.state)+'"><span>市場</span><b>'+commonStateLabel(common.market_state?.state)+'</b></div>'+
      '<div class="common-metric '+commonStateClass(common.snapshot?.state)+'"><span>更新状態</span><b>'+commonStateLabel(common.snapshot?.state)+'</b></div>'+
      '<div class="common-metric '+(blocked?"common-ng":"common-ok")+'"><span>要確認</span><b>'+blocked+'</b></div>'+
    '</div>'+
    '<div class="common-blocker">'+fmt(firstBlocker&&firstBlocker.label||"正式判断を妨げる条件はありません。")+'</div>'+
    '<details class="common-details"><summary>4銘柄の判断可否</summary>'+itemRows+'</details>'+
    '<details class="app-disclosure compact-disclosure"><summary>基準時刻・共通仕様を見る</summary><div class="disclosure-body">基準 '+dateOnly(common.timestamps?.market_as_of)+' / 計算 '+jst(common.timestamps?.calculated_at)+' / 共通仕様 '+fmt(common.common_spec_version)+'</div></details>';
}

function stateLabel(v){
  const s=(v||"").toUpperCase();
  if(s==="NORMAL")return "更新済み";
  if(s==="NO_CHANGE")return "更新なし";
  if(s==="HOLD")return "要確認";
  return fmt(v);
}
function appModeLabel(v,fallback){
  const s=(v||"").toUpperCase();
  if(s==="SHADOW")return "検証運用中";
  return fmt(fallback||v);
}
function stateClass(v){
  const s=(v||"").toUpperCase();
  if(s==="NORMAL")return "state-normal";
  if(s==="NO_CHANGE")return "state-nochange";
  if(s==="HOLD")return "state-hold";
  return "";
}
function badge(value){
  const v=(value||"").toUpperCase();
  const cls=
    v==="NORMAL"?"normal":
    v==="HOLD"?"hold":
    v==="NO_CHANGE"?"nochange":
    v==="SHADOW"?"shadow":"";
  const label=
    v==="NORMAL"?"更新済み":
    v==="HOLD"?"要確認":
    v==="NO_CHANGE"?"更新なし":
    v==="SHADOW"?"検証中":fmt(value);
  return `<span class="badge ${cls}">${label}</span>`;
}
function qualityPill(value){
  const v=(value||"").toUpperCase();
  const cls=v==="PASS"||v==="REGULAR"?"pass":v==="PENDING"?"pending":v==="FAIL"?"fail":"";
  const label=
    v==="PASS"?"正常":
    v==="REGULAR"?"通常":
    v==="PENDING"?"確認待ち":
    v==="FAIL"?"要確認":fmt(value);
  return `<span class="quality-pill ${cls}">${label}</span>`;
}
function deltaClass(v){
  if(v===null||v===undefined)return "flat";
  if(Number(v)>0)return "up";
  if(Number(v)<0)return "down";
  return "flat";
}
function healthPill(grade){
  const g=(grade||"N/A").toUpperCase();
  const cls=g==="A"?"health-a":g==="B"?"health-b":g==="C"?"health-c":"health-na";
  const label=g==="N/A"?"評価対象外":g;
  return `<span class="stage-pill ${cls}">${label}</span>`;
}
function scorePoints(scorePct,weight){
  if(scorePct===null||scorePct===undefined||weight===null||weight===undefined)return "未確認";
  const earned=Number(weight)*Number(scorePct)/100;
  return `${compactNumber(earned)}/${compactNumber(weight)}点`;
}
function decisionState(s){
  const trend=String(s.trend||"");
  const macd=String(s.macd_state||"");
  const ma=String(s.ma_state||"");
  const rsi=s.rsi14==null?null:Number(s.rsi14);

  let shortTerm="中立";
  if(trend.includes("上昇")&&macd.includes("強気"))shortTerm="上昇優勢";
  else if(trend.includes("下降")&&macd.includes("弱気"))shortTerm="下降優勢";
  else if(trend.includes("上昇"))shortTerm="上向き";
  else if(trend.includes("下降"))shortTerm="下向き";

  let midTerm="中立";
  if(ma.includes("50MA > 200MA"))midTerm="上昇基調";
  else if(ma.includes("50MA < 200MA"))midTerm="下降基調";

  let heat="中立";
  if(rsi!==null){
    if(rsi>=70)heat="過熱気味";
    else if(rsi>=60)heat="やや高め";
    else if(rsi<=30)heat="売られ過ぎ";
    else if(rsi<=40)heat="やや低め";
  }
  return {shortTerm,midTerm,heat};
}
function signalTone(value){
  const v=String(value||"");
  if(v.includes("上昇")||v==="上向き")return "signal-positive";
  if(v.includes("過熱")||v.includes("高め"))return "signal-caution";
  if(v.includes("下降")||v.includes("売られ")||v.includes("低め"))return "signal-negative";
  return "signal-neutral";
}
function decisionSummary(s){
  const d=decisionState(s);
  return `<div class="signal-summary">
    <div class="signal-item ${signalTone(d.shortTerm)}"><span class="signal-label">短期</span><strong>${d.shortTerm}</strong></div>
    <div class="signal-item ${signalTone(d.midTerm)}"><span class="signal-label">中長期</span><strong>${d.midTerm}</strong></div>
    <div class="signal-item ${signalTone(d.heat)}"><span class="signal-label">過熱度</span><strong>${d.heat}</strong></div>
  </div>`;
}
async function getJSON(path){
  const r=await fetch(path+`?t=${Date.now()}`,{cache:"no-store"});
  if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

function digestPanel(status,market){
  const stocks=market.stocks||[];
  const items=stocks.map(s=>{
    const growth=s.structural_growth;
    const d=decisionState(s);
    const sub=s.ticker==="SOXL"
      ? `局面 ${fmt(s.soxl_stage?.phase)}`
      : `成長スコア ${growth?.score==null?"—":Number(growth.score).toFixed(1)}`;
    return `<div class="digest-stock">
      <div class="digest-ticker">${fmt(s.ticker)}</div>
      <div class="digest-price">${money(s.close)}</div>
      <div class="digest-change ${deltaClass(s.change_pct)}">${pct(s.change_pct)}</div>
      <div class="digest-signal ${signalTone(d.shortTerm)}">${d.shortTerm}</div>
      <div class="digest-sub">${sub}</div>
    </div>`;
  }).join("");
  const q=status.quality||{};
  const state=(status.run_state||"").toUpperCase();
  const stateNote=state==="NO_CHANGE"
    ? '<div class="digest-state digest-state-neutral">前営業日の確定データを継続表示</div>'
    : state==="HOLD"
      ? `<div class="digest-state digest-state-warn">${fmt(status.message)}</div>`
      : "";
  const up=stocks.filter(s=>Number(s.change_pct)>0).length;
  const down=stocks.filter(s=>Number(s.change_pct)<0).length;
  return `
    <div class="digest-head">
      <div>
        <div class="digest-date">${dateOnly(status.us_trade_date)}</div>
        <div class="digest-market-count"><span class="up-dot"></span>上昇 ${up}　<span class="down-dot"></span>下落 ${down}</div>
      </div>
      <div class="digest-quality">
        <span class="quality-labeled"><small>品質確認</small>${qualityPill(q.qc)}</span>
        <span class="quality-labeled"><small>出典照合</small>${qualityPill(q.source_crosscheck)}</span>
      </div>
    </div>
    ${stateNote}
    <div class="digest-stocks">${items}</div>
    <div class="digest-foot"><span>更新 ${jst(status.generated_at_jst)}</span><strong>${fmt(q.completeness)}銘柄</strong></div>
  `;
}

function levelPanel(s){
  const l=s.levels;
  if(!l)return "";
  const pos=l.range_position_pct==null?0:clamp(Number(l.range_position_pct),0,100);
  return `<details class="expand-panel">
    <summary>テクニカル監視ライン</summary>
    <div class="level-grid">
      <div class="level-item"><span class="label">20日支持線</span><div class="level-value">${money(l.support20)}</div></div>
      <div class="level-item"><span class="label">20日抵抗線</span><div class="level-value">${money(l.resistance20)}</div></div>
      <div class="level-item"><span class="label">50MA</span><div class="level-value">${money(l.ma50)}</div></div>
      <div class="level-item"><span class="label">200MA</span><div class="level-value">${money(l.ma200)}</div></div>
      <div class="level-item"><span class="label">52週安値</span><div class="level-value">${money(l.low52)}</div></div>
      <div class="level-item"><span class="label">52週高値</span><div class="level-value">${money(l.high52)}</div></div>
    </div>
    <div class="range-wrap">
      <div class="range-labels"><span>支持線</span><span>抵抗線</span></div>
      <div class="range-track"><div class="range-fill" style="width:${pos}%"></div></div>
      <div class="range-note">
        20日レンジ位置 ${fmt(l.range_position_pct)}% ／
        支持線から ${pct(l.support_distance_pct)} ／
        抵抗線まで ${pct(l.resistance_distance_pct)}
      </div>
    </div>
  </details>`;
}

function growthPanel(s){
  const g=s.structural_growth;
  if(!g)return "";
  const health=g.new_high_health||{};
  const completion=clamp(Number(g.data_completeness_pct||0),0,100);
  const score=g.score==null?"確認不能":Number(g.score).toFixed(1)+"/100";
  const f=g.fundamentals||{};
  const axes=g.axes||{};

  const axisNames={
    structural_growth_4y:"中期構造成長（4年CAGR）",
    financial_growth_quality:"財務成長・質",
    competitive_advantage:"競争優位性",
    business_acceleration:"業績加速",
    valuation_reasonableness:"バリュエーション",
    price_confirmation:"株価確認",
    volume_confirmation:"出来高確認"
  };

  const axisRows=Object.entries(axisNames).map(([key,label])=>{
    const a=axes[key]||{};
    const scoreText=scorePoints(a.score_pct,a.weight);
    const cls=a.score_pct==null?"axis-score axis-unverified":"axis-score";
    return `<div class="axis-row">
      <span class="axis-name">${label}</span>
      <span class="${cls}">${scoreText}</span>
    </div>`;
  }).join("");

  return `<details class="expand-panel" open>
    <summary>構造的成長</summary>

    <div class="growth-grid">
      <div class="growth-item">
        <span class="label">定量スコア</span>
        <div class="score-big">${score}</div>
        <div class="score-sub">未確認軸は0点扱いせず除外</div>
      </div>
      <div class="growth-item">
        <span class="label">データ充足率</span>
        <div class="growth-value">${fmt(g.data_completeness_pct)}%</div>
        <div class="score-sub">確定基準 ${fmt(g.required_completeness_pct)}%</div>
      </div>
      <div class="growth-item">
        <span class="label">新高値の健全性</span>
        <div class="growth-value">${healthPill(health.grade)}</div>
        <div class="score-sub">${health.grade==="N/A"||health.grade==null?fmt(health.basis):""}</div>
      </div>
      <div class="growth-item">
        <span class="label">52週高値到達まで</span>
        <div class="growth-value">${health.distance_to_52w_high_pct==null?"—":Number(health.distance_to_52w_high_pct).toFixed(2)+"%"}</div>
        <div class="score-sub">現在値から52週高値までの上昇幅</div>
      </div>
    </div>

    <div class="completeness-track">
      <div class="completeness-fill" style="width:${completion}%"></div>
    </div>

    <div class="fund-grid">
      <div class="fund-item"><span class="label">売上成長 TTM</span><div class="fund-value">${pct(f.revenue_growth_ttm_pct)}</div></div>
      <div class="fund-item"><span class="label">EPS成長 TTM</span><div class="fund-value">${pct(f.eps_growth_ttm_pct)}</div></div>
      <div class="fund-item"><span class="label">FCF成長 TTM</span><div class="fund-value">${pct(f.fcf_growth_ttm_pct)}</div></div>
      <div class="fund-item"><span class="label">営業利益率 TTM</span><div class="fund-value">${f.operating_margin_ttm_pct==null?"—":Number(f.operating_margin_ttm_pct).toFixed(2)+"%"}</div></div>
      <div class="fund-item"><span class="label">Forward PE</span><div class="fund-value">${f.forward_pe==null?"—":Number(f.forward_pe).toFixed(2)}</div></div>
      <div class="fund-item"><span class="label">PEG</span><div class="fund-value">${f.peg_ratio==null?"—":Number(f.peg_ratio).toFixed(2)}</div></div>
    </div>

    <div class="axis-list">${axisRows}</div>
    <div class="source-note">競争優位性: ${fmt(g.competitive_advantage?.source)} ／ 基準日 ${fmt(g.competitive_advantage?.as_of)}</div>

    <div class="source-note">
      Fundamental: ${fmt(g.fundamental_source)} ／ Updated ${fmt(g.fundamental_last_updated)}
    </div>
    <div class="panel-note">${fmt(g.note)}</div>
  </details>`;
}

function soxlPanel(s){
  const st=s.soxl_stage;
  if(!st)return "";
  const a=st.market_alignment||{};
  const chips=Object.entries(a.symbols||{})
    .map(([k,v])=>`<span class="alignment-chip">${k} ${pct(v)}</span>`)
    .join("");

  return `<details class="expand-panel" open>
    <summary>SOXL参考ステージ</summary>
    <div class="stage-grid">
      <div class="stage-item">
        <span class="label">局面</span>
        <div class="stage-value"><span class="stage-pill stage-phase">${fmt(st.phase)}</span></div>
      </div>
      <div class="stage-item">
        <span class="label">売り側</span>
        <div class="stage-value"><span class="stage-pill stage-sell">${fmt(st.sell_stage)}</span></div>
      </div>
      <div class="stage-item">
        <span class="label">買い側</span>
        <div class="stage-value"><span class="stage-pill stage-buy">${fmt(st.buy_stage)}</span></div>
      </div>
      <div class="stage-item">
        <span class="label">関連市場整合</span>
        <div class="stage-value">${fmt(a.positive)}/${fmt(a.available)} positive</div>
      </div>
    </div>
    <div class="alignment-row">${chips}</div>
    <div class="panel-note">${fmt(st.note)}</div>
  </details>`;
}

function stockCard(s){
  return `<article class="card">
    <div class="stock-head">
      <div>
        <div class="ticker">${fmt(s.ticker)}</div>
        <div class="name">${fmt(s.name)}</div>
      </div>
      ${badge(s.signal)}
    </div>
    <div class="price">${money(s.close)}</div>
    <div class="delta ${deltaClass(s.change_pct)}">${pct(s.change_pct)}</div>
    ${decisionSummary(s)}
    <details class="technical-details">
      <summary>テクニカル詳細</summary>
      <div class="meta">
        <div><span class="label">Trend</span>${fmt(s.trend)}</div>
        <div><span class="label">MACD</span>${fmt(s.macd_state)}</div>
        <div><span class="label">RSI14</span>${fmt(s.rsi14)}</div>
        <div><span class="label">50 / 200MA</span>${fmt(s.ma_state)}</div>
      </div>
    </details>
    ${s.ticker==="SOXL"?soxlPanel(s):growthPanel(s)}
    ${levelPanel(s)}
  </article>`;
}

function marketCard(m){
  return `<article class="card">
    <div class="stock-head">
      <strong>${fmt(m.name)}</strong>
      <span class="name">${fmt(m.symbol)}</span>
    </div>
    <div class="price">${fmt(m.value)}</div>
    <div class="delta ${deltaClass(m.change_pct)}">${pct(m.change_pct)}</div>
    <div class="source-note">基準日 ${dateOnly(m.trade_date)}</div>
  </article>`;
}

function modelValidationPanel(v,stocks){
  if(!v||v.status!=="DIAGNOSTIC")return '<div class="muted">Point-in-Time検証データ待ちです。</div>';
  const corr=v.pooled_correlation||{};
  const freshness=(stocks||[]).filter(s=>["PLTR","LLY","BSY"].includes(s.ticker)).map(s=>{
    const f=s.point_in_time_validation?.freshness||{};
    const cls=f.review_due?"freshness-due":"freshness-current";
    return `<span class="freshness-chip ${cls}">${s.ticker} ${fmt(f.status)} / ${fmt(f.days_since_latest)}日</span>`;
  }).join("");
  const maturity=v.maturity||{};
  const cell=h=>{
    const x=corr[h]||{};
    return `<div class="validation-item">
      <span class="label">${h} Spearman</span>
      <div class="validation-value">${x.spearman_rho==null?"—":Number(x.spearman_rho).toFixed(3)}</div>
      <div class="score-sub">n=${fmt(x.n)}</div>
    </div>`;
  };
  const tickerRows=Object.entries(v.per_ticker_correlation||{}).map(([ticker,x])=>{
    const r=x["126d"]||{};
    return `<div class="validation-row">
      <strong>${ticker}</strong>
      <span>126日 ρ ${r.spearman_rho==null?"—":Number(r.spearman_rho).toFixed(3)}</span>
      <span>n=${fmt(r.n)}</span>
    </div>`;
  }).join("");
  return `
    <div class="validation-head">
      <div>
        <span class="stage-pill validation-pill">POINT-IN-TIME V2</span>
        <div class="validation-title">将来情報を使わない診断検証</div>
      </div>
      <div class="validation-events">${fmt(v.total_events)} events<br><span class="maturity-text">${fmt(maturity.status)}</span></div>
    </div>
    <div class="freshness-row">${freshness}</div>
    <div class="validation-grid">
      ${cell("63d")}${cell("126d")}${cell("252d")}
    </div>
    <div class="maturity-box">
      126日完了観測: PLTR ${fmt(maturity.completed_126d_by_ticker?.PLTR)} / LLY ${fmt(maturity.completed_126d_by_ticker?.LLY)} / BSY ${fmt(maturity.completed_126d_by_ticker?.BSY)}
      <br>レビュー目安: 各 ${fmt(maturity.target_completed_126d_per_ticker)} 件
    </div>
    <div class="validation-note">
      現時点では、スコアが高いほど将来リターンが高いという関係は確認できていません。
      このスコアは企業の成長・事業モメンタムを定量監視するもので、単独の買いタイミング指標ではありません。
    </div>
    <details class="expand-panel">
      <summary>銘柄別検証</summary>
      <div class="validation-list">${tickerRows}</div>
      <div class="panel-note">四半期イベントの観測期間は重複しており、3銘柄・各約12イベントの小標本です。相関は因果関係や予測精度を示しません。</div>
    </details>
  `;
}

function dataFreshnessPanel(status,market){
  const stocks=market.stocks||[];
  const env=market.market_environment||[];
  const q=status.quality||{};
  const stockDates=[...new Set(stocks.map(s=>s.trade_date).filter(Boolean))];
  const envDates=[...new Set(env.map(m=>m.trade_date).filter(Boolean))];
  const fundamentals=stocks
    .filter(s=>s.structural_growth?.fundamental_last_updated)
    .map(s=>`${s.ticker} ${s.structural_growth.fundamental_last_updated}`);
  const pit=stocks
    .filter(s=>s.point_in_time_validation?.freshness)
    .map(s=>{
      const f=s.point_in_time_validation.freshness||{};
      return `${s.ticker} ${fmt(f.days_since_latest)}日`;
    });

  return `<details class="app-disclosure freshness-details">
    <summary>参照データの日時・鮮度を見る</summary>
    <div class="disclosure-body">
      <div class="freshness-list">
        <div class="freshness-row-item"><span>株価（4銘柄）</span><b>${stockDates.length?stockDates.map(dateOnly).join(" / "):"—"}</b><small>REGULAR終値</small></div>
        <div class="freshness-row-item"><span>市場環境</span><b>${envDates.length?envDates.map(dateOnly).join(" / "):"—"}</b><small>${env.length}指標</small></div>
        <div class="freshness-row-item"><span>財務データ</span><b>${fundamentals.length?fundamentals.join(" / "):"—"}</b><small>各社の公開更新日</small></div>
        <div class="freshness-row-item"><span>モデル検証</span><b>${pit.length?pit.join(" / "):"—"}</b><small>最新イベントからの経過</small></div>
        <div class="freshness-row-item"><span>独立出典照合</span><b>${commonStateLabel(q.source_crosscheck)}</b><small>次回自動確認目安で再照合</small></div>
      </div>
    </div>
  </details>`;
}

function parseNotice(message,severity){
  const text=String(message||"");
  let m=text.match(/^([A-Z0-9.^-]+): independent close is not published for (\d{4}-\d{2}-\d{2})\.$/);
  if(m)return {kind:"independent",subject:m[1],date:m[2],severity};
  m=text.match(/^([A-Z0-9.^-]+): market environment value for confirmed trade date (\d{4}-\d{2}-\d{2}) is unavailable\.$/);
  if(m)return {kind:"market",subject:m[1],date:m[2],severity};
  return {kind:"other",message:text,severity};
}
function renderNotices(status){
  const warnings=(status.warnings||[]).map(x=>parseNotice(x,"warning"));
  const errors=(status.errors||[]).map(x=>parseNotice(x,"error"));
  const issues=[...errors,...warnings];
  const section=$("noticesSection");
  const target=$("notices");
  if(!issues.length){
    section.classList.add("hidden");
    target.innerHTML="";
    return;
  }

  const independent=issues.filter(x=>x.kind==="independent");
  const market=issues.filter(x=>x.kind==="market");
  const other=issues.filter(x=>x.kind==="other");
  const blocks=[];

  if(independent.length){
    const date=independent[0].date;
    blocks.push(`<div class="notice-group">
      <div class="notice-group-head"><b>独立終値の照合待ち</b><span>${independent.length}件</span></div>
      <div class="notice-subjects">${independent.map(x=>x.subject).join(" / ")}</div>
      <p>${dateOnly(date)} の独立終値がまだ公開されていないため、主データとの照合が未完了です。</p>
      <div class="notice-remedy"><b>対応</b> 主データの確定値は保持し、次回自動確認で独立終値を再取得・再照合します。</div>
    </div>`);
  }
  if(market.length){
    const date=market[0].date;
    blocks.push(`<div class="notice-group">
      <div class="notice-group-head"><b>市場環境の参考値が未取得</b><span>${market.length}件</span></div>
      <div class="notice-subjects">${market.map(x=>x.subject).join(" / ")}</div>
      <p>${dateOnly(date)} の関連市場データが一部取得できていません。</p>
      <div class="notice-remedy"><b>対応</b> 個別株の確定終値は変更せず、次回自動確認で参考値を再取得します。</div>
    </div>`);
  }
  other.forEach(x=>blocks.push(`<div class="notice-group ${x.severity==="error"?"is-error":""}">
    <div class="notice-group-head"><b>追加確認</b></div><p>${fmt(x.message)}</p>
  </div>`));

  target.innerHTML=`
    <div class="notice-summary">確認事項 ${issues.length}件を、原因別に${blocks.length}グループへ整理しています。</div>
    ${blocks.join("")}
    <a class="notice-action-btn" href="${WORKFLOW_URL}" target="_blank" rel="noopener">GitHubで再調査・再判定</a>
    <div class="notice-action-note">Workflowを実行した場合は、完了後にこのアプリへ戻り「公開データを再読込」を押してください。</div>
  `;
  section.classList.remove("hidden");
}

async function main(options={}){
  const button=$("refreshButton");
  const note=$("refreshNote");
  if(options.manual&&button){
    button.disabled=true;
    button.classList.add("refreshing");
    note.textContent="最新の公開データを確認しています…";
  }
  try{
    const [status,market,common]=await Promise.all([
      getJSON("./data/status.json"),
      getJSON("./data/market.json"),
      getJSON("./data/common_snapshot.json").catch(()=>null)
    ]);

    $("version").textContent="v"+fmt(status.app_version);

    const stateBox=$("stateBox");
    stateBox.className="status-box "+stateClass(status.run_state);
    $("appState").innerHTML=
      `${appModeLabel(status.app_state,status.app_state_ja)} <small style="font-size:.72em;opacity:.78">/ ${stateLabel(status.run_state)}</small>`;

    $("tradeDate").textContent=dateOnly(status.us_trade_date);
    $("updatedAt").textContent=jst(status.generated_at_jst);
    renderRecheckSchedule();
    renderCommonDigest(common);

    $("digest").classList.remove("muted");
    $("digest").innerHTML=digestPanel(status,market);

    $("stocks").innerHTML=
      (market.stocks||[]).map(stockCard).join("")||
      '<div class="card muted">主要銘柄データ待ち</div>';

    $("market").innerHTML=
      (market.market_environment||[]).map(marketCard).join("")||
      '<div class="card muted">市場データ待ち</div>';
    renderMarketCharts(market.market_environment||[]);

    const q=status.quality||{};
    $("quality").innerHTML=`
      <div class="quality-grid">
        <div class="quality-item"><span class="label">実行状態</span><div class="quality-value">${badge(status.run_state)}</div></div>
        <div class="quality-item"><span class="label">品質確認</span><div class="quality-value">${qualityPill(q.qc)}</div></div>
        <div class="quality-item"><span class="label">取引セッション</span><div class="quality-value">${qualityPill(q.session)}</div></div>
        <div class="quality-item"><span class="label">データ充足</span><div class="quality-value">${fmt(q.completeness)}</div></div>
        <div class="quality-item"><span class="label">出典照合</span><div class="quality-value">${qualityPill(q.source_crosscheck)}</div></div>
        <div class="quality-item"><span class="label">取引日経過</span><div class="quality-value">${q.trade_date_age_days==null?"—":fmt(q.trade_date_age_days)+"暦日"}</div></div>
      </div>
      ${dataFreshnessPanel(status,market)}`;

    $("modelValidation").classList.remove("muted");
    $("modelValidation").innerHTML=modelValidationPanel(market.model_validation,market.stocks);

    renderNotices(status);
    if(options.manual&&note) note.textContent=`取得完了：${jst(status.generated_at_jst)} の公開データ`;

  }catch(e){
    $("appState").textContent="読込エラー";
    if(note) note.textContent=e.message;
    $("quality").textContent="JSONの取得に失敗しました。";
    if(options.manual&&note) note.textContent="取得に失敗しました。通信状態を確認してください。";
  }finally{
    if(options.manual&&button){
      button.disabled=false;
      button.classList.remove("refreshing");
    }
  }
}
$("refreshButton")?.addEventListener("click",()=>main({manual:true}));
setupTabs();
main();

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    const reg=await navigator.serviceWorker.register("./sw.js?v=0.9.7",{updateViaCache:"none"});
    reg.update();
  });
}
