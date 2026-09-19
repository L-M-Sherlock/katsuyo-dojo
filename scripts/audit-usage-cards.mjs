import { USAGE_CARDS, usageCardIssues, resolveUsageCard, usageCardItem, usageCardClassRequirements, basicUsageCardRequirements, usageCardStageRequirements, usageCardWritingReview } from '../app/lib/usage-cards.mjs';

const strict = !process.argv.includes('--draft');
const issues = usageCardIssues(USAGE_CARDS, {requireCoverage: strict, requireClassCoverage: strict, requireBasicCoverage: strict, requireStageCoverage: strict ? ['voice', 'linking', 'intentions'] : []});
const approved = USAGE_CARDS.filter(card => card.review === 'approved');
const basic = new Set(basicUsageCardRequirements());
const voice = new Set(usageCardStageRequirements('voice'));
const linking = new Set(usageCardStageRequirements('linking'));
const intentions = new Set(usageCardStageRequirements('intentions'));
const actions = new Set(usageCardStageRequirements('actions'));
console.log(JSON.stringify({cards: USAGE_CARDS.length, approved: approved.length,
  approvedForms: new Set(approved.map(card => card.form)).size,
  approvedFormClasses: new Set(approved.map(card => `${card.form}/${usageCardItem(card.senseId)?.class}`)).size,
  requiredFormClasses: usageCardClassRequirements().length,
  approvedBasicPairs: approved.filter(card => basic.has(`${card.senseId}/${card.form}`)).length,
  requiredBasicPairs: basic.size,
  approvedVoicePairs: approved.filter(card => voice.has(`${card.senseId}/${card.form}`)).length,
  requiredVoicePairs: voice.size,
  approvedLinkingPairs: approved.filter(card => linking.has(`${card.senseId}/${card.form}`)).length,
  requiredLinkingPairs: linking.size,
  approvedIntentionPairs: approved.filter(card => intentions.has(`${card.senseId}/${card.form}`)).length,
  requiredIntentionPairs: intentions.size,
  approvedActionPairs: approved.filter(card => actions.has(`${card.senseId}/${card.form}`)).length,
  requiredActionPairs: actions.size,
  missingActionPairs: [...actions].filter(pair => !approved.some(card => `${card.senseId}/${card.form}` === pair)),
  writingReview: usageCardWritingReview(USAGE_CARDS), issues}, null, 2));
if (process.argv.includes('--sentences')) for (const card of USAGE_CARDS) {
  const resolved = resolveUsageCard(card);
  console.log([card.id, card.scene, resolved ? card.before.map(p => p.text).join('') + resolved.target.text + card.after.map(p => p.text).join('') : '(invalid)', card.translation, card.note ?? ''].join('\t'));
}
if (issues.length) process.exitCode = 1;
