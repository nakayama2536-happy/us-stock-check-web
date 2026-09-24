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

function digestPanel(status,market){
  const stocks=market.stocks||[];
  const items=stocks.map(s=>{
    const growth=s.structural_growth;
    const sub=s.ticker==="SOXL"
      ? `局面 ${fmt(s.soxl_stage?.phase)}`
      : `成長スコア ${growth?.score==null?"—":Number(growth.score).toFixed(1)}`;
    return `<div class="digest-stock">
      <div class="digest-ticker">${fmt(s.ticker)}</div>
      <div class="digest-price">${money(s.close)}</div>
      <div class="digest-change ${deltaClass(s.change_pct)}">${pct(s.change_pct)}</div>
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
        <span class="quality-labeled"><small>QC</small>${qualityPill(q.qc)}</span>
        <span class="quality-labeled"><small>SOURCE</small>${qualityPill(q.source_crosscheck)}</span>
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
    const scoreText=a.score_pct==null?"未確認":Number(a.score_pct).toFixed(0);
    const cls=a.score_pct==null?"axis-score axis-unverified":"axis-score";
    return `<div class="axis-row">
      <span class="axis-name">${label}（${fmt(a.weight)}点）</span>
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
      </div>
      <div class="growth-item">
        <span class="label">52週高値まで</span>
        <div class="growth-value">${health.distance_to_52w_high_pct==null?"—":Number(health.distance_to_52w_high_pct).toFixed(2)+"%"}</div>
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

async function main(options={}){
  const button=$("refreshButton");
  const note=$("refreshNote");
  if(options.manual&&button){
    button.disabled=true;
    button.classList.add("refreshing");
    note.textContent="最新の公開データを確認しています…";
  }
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
    $("digest").classList.remove("muted");
    $("digest").innerHTML=digestPanel(status,market);

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
main();

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    const reg=await navigator.serviceWorker.register("./sw.js?v=0.9.3",{updateViaCache:"none"});
    reg.update();
  });
}
