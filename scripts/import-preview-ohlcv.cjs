'use strict';
// Explicit reviewed artifact import; never fetches prices or edits the old snapshot.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../docs/preview/s1'),P=require(path.join(root,'preview.js'));
function exactKeys(value,keys){if(!value||Object.keys(value).sort().join(',')!==keys.split(' ').sort().join(','))throw new Error('Unreviewed fields in OHLCV artifact');}
function validate(raw,expected){
 if(!/^[a-f0-9]{64}$/.test(expected)||crypto.createHash('sha256').update(raw).digest('hex')!==expected)throw new Error('Reviewed artifact digest mismatch');
 const c=JSON.parse(raw),market=JSON.parse(fs.readFileSync(path.join(root,'data/market.json'),'utf8'));
 exactKeys(c,'schema basis_date generated_at_jst capture price_basis scope securities');exactKeys(c.capture,'repository code_sha run_id');
 exactKeys(c.securities,'PLTR LLY BSY MSTR SOXL');
 for(const stock of market.stocks){
  const item=c.securities[stock.ticker];exactKeys(item,'snapshot calculation_rows calculation_input_sha256 rows zero_volume_rows');
  exactKeys(item.snapshot,'ticker trade_date close ma50 ma200 macd macd_signal rsi14');
  for(const row of item.rows)exactKeys(row,'date open high low close volume source');
  const h=P.ohlcvFor(stock,c);if(!h.available||h.zero_volume_rows!==item.zero_volume_rows)throw new Error(stock.ticker+': '+(h.reason||'zero-volume count mismatch'));
 }
 return c;
}
if(require.main===module){
 const [input,expected]=process.argv.slice(2);if(!input||!expected)throw new Error('Usage: node scripts/import-preview-ohlcv.cjs artifact.json reviewed-sha256');
 const raw=fs.readFileSync(input);validate(raw,expected);
 const hash=crypto.createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
 const loaderPath=path.join(root,'preview.js'),loader=fs.readFileSync(loaderPath,'utf8');
 if((loader.match(/'data\/ohlcv-history.json':'[a-f0-9]{40}'/g)||[]).length!==1)throw new Error('Unreviewed PINS boundary');
 fs.writeFileSync(path.join(root,'data/ohlcv-history.json'),raw);
 fs.writeFileSync(loaderPath,loader.replace(/('data\/ohlcv-history.json':')[a-f0-9]{40}/,(_,prefix)=>prefix+hash));
 console.log('Validated frozen OHLCV import: five securities, original snapshots unchanged.');
}
module.exports={validate};
