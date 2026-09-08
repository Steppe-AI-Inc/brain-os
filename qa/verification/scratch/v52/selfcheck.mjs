import * as H from './harness.mjs';
console.log('harness self-check:', H.selfCheck);
console.log('candidate', H.SRC, H.sha256(H.SRC));
console.log('v92 (download)', H.V92, H.sha256(H.V92));
console.log('lifecycleIdentical', H.lifecycleIdentical, 'arms', JSON.stringify(H.CAND_LIFE.arms));
console.log('V92_FUTURE', H.V92_FUTURE.source.slice(0, 40));
console.log('CAND_FUTURE', H.CAND_FUTURE.source.slice(0, 40));
console.log('gate present:', H.gateFor(H.SRC).present.join(','));
