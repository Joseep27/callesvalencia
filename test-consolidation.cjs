const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const original = cp.execFileSync('git', ['show', '6e4aad79101c6aadb48b0051c6e45e8726b36be2:index.html'], {encoding:'utf8'}).replace(/\r\n/g, '\n');
function extract(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  const line = source.slice(start, source.indexOf('\n', start));
  return line.endsWith('}') ? line : source.slice(start, source.indexOf('\n}', start) + 2);
}
const names = ['consolidationKey','loadConsolidation','saveConsolidation','consolidationEntries',
  'recordConsolidation','renderConsolidation','mergeConsolidation','shuffle','uniqueStreetEntries',
  'isFailedRec','isGlobalQuestionMode','checkAnswer','getFilteredEntries'];
function env(source = html, saved = new Map()) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {value:'',style:{},classList:{add(){},remove(){},toggle(){}},textContent:''});
    return nodes.get(id);
  };
  const entries = Array.from({length:724}, (_,i)=>({calle:'Calle '+i,origZone:'Norte',zone:'Norte'}));
  const s = {console, CURRENT_USER:'Josep',currentZone:'consolidacion',store:{},queue:[],qIndex:0,
    answered:false,sessionOk:0,sessionFail:0,answerMode:'text',activePlanReviewGroup:null,onlyFailed:false,
    activeEntries:()=>entries,parseJSONStorage:k=>JSON.parse(saved.get(k)||'null'),
    localStorage:{setItem:(k,v)=>saved.set(k,v)},todayISO:()=> '2026-10-30',
    document:{getElementById:node,querySelectorAll:()=>[]},alert:m=>{throw Error(m)},
    getRecord:k=>s.store[k],getGrupoSel:()=> 'todas',
    validAnswersForQuestion:()=>[['Norte','Central']],addRecentAttempt(){},advancePersistentAllQueue(){},
    showFeedback(){},entryVariantId:e=>e.calle+'|||'+e.origZone,grupoFiltroActivo:()=>null,
    saveRecord:(k,r)=>s.store[k]=r,updateAprendidaBtn(){},updateHeaderStats(){},renderMastery(){},nextQuestion(){}};
  for (const e of entries) s.store[e.calle]={ok:10,fail:0,streak:5,aprendida:true,manual:false,porGrupo:{}};
  vm.createContext(s);
  for(const name of names) if(source.includes('function '+name+'(')) vm.runInContext(extract(source,name),s);
  return {s,node,saved,entries};
}
function answer(e, correct) {
  e.node('sel-primero').value=correct?'Norte':'Oeste'; e.node('sel-apoyo').value='Central';
  e.s.answered=false; e.s.checkAnswer();
}
const e=env();
e.s.queue=e.s.consolidationEntries();
assert.equal(e.s.queue.length,724);
assert.equal(new Set(e.s.queue.map(x=>x.calle)).size,724);
const first=e.s.queue[0];
answer(e,false);
assert.equal(e.s.queue.length,724,'failure must not reinsert');
assert.equal(e.s.store[first.calle].aprendida,false);
assert.equal(e.s.isFailedRec(e.s.store[first.calle]),true);
assert(e.s.getFilteredEntries('no-aprendidas').some(x=>x.calle===first.calle));
assert(e.s.getFilteredEntries('repaso').some(x=>x.calle===first.calle));
// Same failure payload as the unchanged production learning code.
const old=env(original); old.s.currentZone='todas';old.s.queue=[first]; answer(old,false);
assert.equal(JSON.stringify(e.s.store[first.calle]),JSON.stringify(old.s.store[first.calle]));
// Recovery uses the real Repaso handler, then No aprendidas, without bypassing learning.
e.s.currentZone='repaso';e.s.queue=[first];answer(e,true);
assert.equal(e.s.isFailedRec(e.s.store[first.calle]),false);
assert.equal(e.s.store[first.calle].aprendida,false);
e.s.currentZone='no-aprendidas';for(let i=0;i<4;i++)answer(e,true);
assert.equal(e.s.store[first.calle].aprendida,true);
e.s.currentZone='consolidacion';
assert(!e.s.consolidationEntries().some(x=>x.calle===first.calle));
// A fresh runtime sees exactly the remaining order, including after recovery.
const restored=env(html,e.saved);restored.s.store=JSON.parse(JSON.stringify(e.s.store));
assert.equal(JSON.stringify(restored.s.consolidationEntries()),JSON.stringify(e.s.consolidationEntries()));
let remaining=e.s.consolidationEntries();
for(const street of remaining)e.s.recordConsolidation(street,true);
assert.equal(e.s.loadConsolidation().done.length,724);
assert.equal(e.s.consolidationEntries().length,724);
assert.equal(e.s.loadConsolidation().round,2);
assert(e.s.consolidationEntries().some(x=>x.calle===first.calle));
// Not learned at round creation: do not append mid-round.
const f=env();f.s.store['Calle 0'].aprendida=false;
assert.equal(f.s.consolidationEntries().length,723);
f.s.store['Calle 0'].aprendida=true;
assert.equal(f.s.consolidationEntries().length,723);
// Eligibility lost before answering: skip for the rest of this round.
f.s.store['Calle 1'].aprendida=false;f.s.consolidationEntries();
f.s.store['Calle 1'].aprendida=true;
assert(!f.s.consolidationEntries().some(x=>x.calle==='Calle 1'));
const snapshot=JSON.stringify(f.s.store);f.s.consolidationEntries();assert.equal(JSON.stringify(f.s.store),snapshot);
f.s.CURRENT_USER='Tudón';assert.equal(f.s.loadConsolidation().round,0);
f.s.store={};assert.equal(f.s.consolidationEntries().length,0);
const a=e.s.loadConsolidation();const b=JSON.parse(JSON.stringify(a));
a.done=[a.order[0]]; b.done=[b.order[1]];
assert.equal(e.s.mergeConsolidation(a,b).done.length,2);
// Existing learning predicates and other queue algorithms remain byte-for-byte unchanged.
for(const name of ['isFailedRec','masteryScore','getRecord','saveRecord','persistentAllEntries','advancePersistentAllQueue'])
  assert.equal(extract(html,name),extract(original,name),name);
assert(html.includes("zone === 'consolidacion' ? entries"));
console.log('PASS: 724 streets, no repeats, persistence, exact failure penalty, recovery, next round, eligibility, profiles, merge and legacy regression.');
