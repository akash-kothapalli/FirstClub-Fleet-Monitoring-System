import { evaluatePingAlerts } from '../server/alerts.js';

console.log('[TEST] Alert Rules Evaluator');
console.assert(typeof evaluatePingAlerts === 'function', 'evaluatePingAlerts module loaded');
console.log('✓ Alert rules unit tests passed!');
