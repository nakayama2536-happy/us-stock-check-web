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

function stateLabel(v){
  const s=(v||"").toUpperCase();
  if(s==="NORMAL")return "NORMAL";
  if(s==="NO_CHANGE")return "NO CHANGE";
  if(s==="HOLD")return "HOLD";
  return fmt(v);
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
  return `<span class="badge ${cls}">${fmt(value)}</span>`;
}
function qualityPill(value){
  const v=(value||"").toUpperCase();
  const cls=v==="PASS"||v==="REGULAR"?"pass":v==="PENDING"?"pending":v==="FAIL"?"fail":"";
  return `<span class="quality-pill ${cls}">${fmt(value)}</span>`;
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
  return `<span class="stage-pill ${cls}">${g}</span>`;
}
async function getJSON(path){
  const r=await fetch(path+`?t=${Date.now()}`,{cache:"no-store"});
  if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
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
  const score=g.score==null?"確認不能":Number(g.score).toFixed(0);

  return `<details class="expand-panel">
    <summary>構造的成長</summary>
    <div class="growth-grid">
      <div class="growth-item">
        <span class="label">構造的成長スコア</span>
        <div class="growth-value">${score}</div>
      </div>
      <div class="growth-item">
        <span class="label">データ充足率</span>
        <div class="growth-value">${fmt(g.data_completeness_pct)}%</div>
      </div>
      <div class="growth-item">
        <span class="label">新高値の健全性</span>
        <div class="growth-value">${healthPill(health.grade)}</div>
      </div>
      <div class="growth-item">
        <span class="label">52週高値まで</span>
        <div class="growth-value">${health.distance_to_52w_high_pct==null?"—":Number(health.distance_to_52w_high_pct).toFixed(2)+"%"}</div>
      </div>
      <div class="growth-item">
        <span class="label">20日出来高比</span>
        <div class="growth-value">${g.volume_confirmation?.volume_ratio20==null?"—":Number(g.volume_confirmation.volume_ratio20).toFixed(2)+"x"}</div>
      </div>
      <div class="growth-item">
        <span class="label">確定基準</span>
        <div class="growth-value">${fmt(g.required_completeness_pct)}%</div>
      </div>
    </div>
    <div class="completeness-track">
      <div class="completeness-fill" style="width:${completion}%"></div>
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
    <div class="meta">
      <div><span class="label">Trend</span>${fmt(s.trend)}</div>
      <div><span class="label">MACD</span>${fmt(s.macd_state)}</div>
      <div><span class="label">RSI14</span>${fmt(s.rsi14)}</div>
      <div><span class="label">50 / 200MA</span>${fmt(s.ma_state)}</div>
    </div>
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
  </article>`;
}

function renderNotices(status){
  const warnings=status.warnings||[];
  const errors=status.errors||[];
  const section=$("noticesSection");
  const target=$("notices");
  if(!warnings.length&&!errors.length){
    section.classList.add("hidden");
    target.innerHTML="";
    return;
  }
  const items=[
    ...errors.map(x=>`<li class="notice-error">${x}</li>`),
    ...warnings.map(x=>`<li class="notice-warning">${x}</li>`)
  ];
  target.innerHTML=`<ul class="notice-list">${items.join("")}</ul>`;
  section.classList.remove("hidden");
}

async function main(){
  try{
    const [status,market]=await Promise.all([
      getJSON("./data/status.json"),
      getJSON("./data/market.json")
    ]);

    $("version").textContent="v"+fmt(status.app_version);

    const stateBox=$("stateBox");
    stateBox.className="status-box "+stateClass(status.run_state);
    $("appState").innerHTML=
      `${fmt(status.app_state_ja)} <small style="font-size:.72em;opacity:.78">/ ${stateLabel(status.run_state)}</small>`;

    $("tradeDate").textContent=dateOnly(status.us_trade_date);
    $("updatedAt").textContent=jst(status.generated_at_jst);
    $("statusMessage").textContent=fmt(status.message);
    $("summary").textContent=market.summary||"データ待ちです。";

    $("stocks").innerHTML=
      (market.stocks||[]).map(stockCard).join("")||
      '<div class="card muted">主要銘柄データ待ち</div>';

    $("market").innerHTML=
      (market.market_environment||[]).map(marketCard).join("")||
      '<div class="card muted">市場データ待ち</div>';

    const q=status.quality||{};
    $("quality").innerHTML=`
      <div class="quality-grid">
        <div class="quality-item"><span class="label">Run state</span><div class="quality-value">${badge(status.run_state)}</div></div>
        <div class="quality-item"><span class="label">QC</span><div class="quality-value">${qualityPill(q.qc)}</div></div>
        <div class="quality-item"><span class="label">Session</span><div class="quality-value">${qualityPill(q.session)}</div></div>
        <div class="quality-item"><span class="label">Completeness</span><div class="quality-value">${fmt(q.completeness)}</div></div>
        <div class="quality-item"><span class="label">Source check</span><div class="quality-value">${qualityPill(q.source_crosscheck)}</div></div>
      </div>`;

    renderNotices(status);

  }catch(e){
    $("appState").textContent="読込エラー";
    $("statusMessage").textContent=e.message;
    $("quality").textContent="JSONの取得に失敗しました。";
  }
}
main();

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    const reg=await navigator.serviceWorker.register("./sw.js?v=0.5.0",{updateViaCache:"none"});
    reg.update();
  });
}
