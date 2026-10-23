import {readFileSync,writeFileSync} from 'node:fs';
import {digest} from '../src/model.ts';
const at=process.argv.indexOf('--block'),block=Number(process.argv[at+1]);if(at<0||!Number.isSafeInteger(block))throw Error('Use --block NUMBER after a one-block fork recheck');
const published=JSON.parse(readFileSync(`evidence/fork-size-route-${block}-2026-10-23.json`,'utf8')),raw=JSON.parse(readFileSync(`.release-private/fork-sizes-2026-10-23/raw-recheck-${block}.json`,'utf8')),fresh=raw.results.find((r:any)=>r.route.block===block);
if(!fresh||fresh.rows.length!==published.rows.length)throw Error('Fork replay incomplete');
for(const old of published.rows){const now=fresh.rows.find((r:any)=>r.sizeWei===old.sizeWei);for(const key of ['status','archiveAmountOutWei','actualAmountOutWei','beforeBalanceWei','afterBalanceWei','grossDeltaWei','executionGasUnits','effectiveGasPriceWei','afterExecutionGasWei'])if(now?.[key]!==old[key])throw Error('Fork replay differs at '+old.sizeWei+': '+key);}
const body={format:'mevy-fork-replay/v1',checkedAt:new Date().toISOString(),block,routeHash:published.routeHash,rows:fresh.rows.length,amountsAndTransactionGas:'MATCH',newRawHash:digest(fresh),localForkOnly:true},receipt={...body,replayHash:digest(body)};writeFileSync(`.release-private/fork-sizes-2026-10-23/replay-${block}.json`,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
