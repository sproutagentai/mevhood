import {readFileSync} from 'node:fs';
import {digest} from '../src/model.ts';
import {verifyGraph, verifyFrame} from '../src/frontier-source.ts';
import {selectLearningCells} from '../src/learning-runtime.ts';
import {clusterId} from '../src/failure-learning.ts';

const receipt = JSON.parse(readFileSync('evidence/failure-learning-live-2026-10-25.json', 'utf8'));
if (receipt.format !== 'mevy-failure-learning-live/v1') throw Error('Wrong receipt');
const {analysisHash, ...analysis} = receipt.modelAnalysis;
const {graph, guide, frames, mandatory} = receipt.allocation.evidence;
verifyGraph(graph);
for (const frame of frames) verifyFrame(frame, graph);
if (digest(analysis) !== analysisHash || guide.analysisHash !== analysisHash ||
    guide.directionId !== analysis.analysis.nextSearch.directionId) throw Error('Decision mismatch');
const last = frames.at(-1);
const expected = selectLearningCells(graph, frames.slice(0, -1), mandatory, guide);
const actual = last.quotes.map((q: any) => ({routeId:q.routeId, sizeWei:q.sizeWei}));
const keys = (cells: any[]) => cells.map(c => digest(c)).sort().join();
if (keys(expected) !== keys(actual) || last.frameHash !== receipt.allocation.check.frameHash ||
    last.control.block !== receipt.allocation.check.block) throw Error('Allocation mismatch');
const sentinels = actual.filter((c: any) => guide.suspendedClusters.includes(clusterId(graph, c.routeId))).length;
if (sentinels !== 1 || actual.length !== 6) throw Error('Unexpected allocation');
console.log(JSON.stringify({verified:true, block:last.control.block, frameHash:last.frameHash,
  actualCells:actual.length, suspendedSentinels:sentinels, otherClusterCells:actual.length-sentinels,
  liveTrading:false, profitImprovement:'UNPROVEN'}, null, 2));
