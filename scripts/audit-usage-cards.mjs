import { USAGE_CARDS, usageCardIssues, resolveUsageCard, usageCardItem, usageCardClassRequirements } from '../app/lib/usage-cards.mjs';

const issues = usageCardIssues(USAGE_CARDS, {requireCoverage: !process.argv.includes('--draft'), requireClassCoverage: !process.argv.includes('--draft')});
const approved = USAGE_CARDS.filter(card => card.review === 'approved');
console.log(JSON.stringify({cards: USAGE_CARDS.length, approved: approved.length,
  approvedForms: new Set(approved.map(card => card.form)).size,
  approvedFormClasses: new Set(approved.map(card => `${card.form}/${usageCardItem(card.senseId)?.class}`)).size,
  requiredFormClasses: usageCardClassRequirements().length, issues}, null, 2));
if (process.argv.includes('--sentences')) for (const card of USAGE_CARDS) {
  const resolved = resolveUsageCard(card);
  console.log([card.id, card.scene, resolved ? card.before.map(p => p.text).join('') + resolved.target.text + card.after.map(p => p.text).join('') : '(invalid)', card.translation, card.note ?? ''].join('\t'));
}
if (issues.length) process.exitCode = 1;
