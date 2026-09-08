import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { deriveUnified, unifiedDiagnosticSteps, diagnoseUnified, diagnoseUnifiedStep } from '../app/lib/unified-knowledge.mjs';
import { UNIFIED_COURSES, COURSE_ORDER, COURSE_STAGES, STAGES, CURRICULUM_VERSION } from '../app/lib/unified-curriculum.mjs';
import { COURSES, ADJECTIVE_COURSES } from '../app/lib/curriculum.mjs';
import { deriveExercise, auditKnowledgeModel } from '../app/lib/knowledge-model.mjs';
import { updateKnowledgeStats, isComponentMastered, advanceIntroductions, emptySkillStats, filterReadyExercises } from '../app/lib/adaptive.mjs';
import { assignPracticeExercises, recordRecentWord, wordKey } from '../app/lib/exercise-selection.mjs';
import { parseUnifiedImport, createUnifiedExport } from '../app/lib/unified-profile.mjs';
import { deriveAdjectiveExercise } from '../app/lib/adjective-knowledge-model.mjs';
import { summarizeUnifiedCourse } from '../app/lib/unified-progress.mjs';

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
let page;
try { page = await server.ssrLoadModule('/app/page.tsx'); } finally { await server.close(); }
const model = page.KNOWLEDGE;
const byId = new Map(model.components.map(k => [k.id,k]));
const options = { today: '2026-09-07', components: model.components, legacyComponents: [...page.VERB_KNOWLEDGE.components,...page.ADJECTIVE_KNOWLEDGE.components] };
const verb = { domain: 'verb', surface: '読む', reading: 'よむ', class: 'godan' };
const adjective = { domain: 'adjective', surface: '高い', reading: 'たかい', class: 'i' };
const mastered = { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1 };
const profile = overrides => ({ version: 5, date: options.today, attempted: 4, correct: 3, streak: 0, rotation: 2, introducedKcIds: ['class.godan'], byKc: {}, ...overrides });

test('word history survives export/import without changing mastery or treating completion evidence as chronology', () => {
  const old = parseUnifiedImport(profile(), options);
  assert.deepEqual(old.recentWordKeys, []);
  const withHistory = { ...old, recentWordKeys: ['verb:包む', 'adjective:早い', 'verb:包む'] };
  assert.deepEqual(parseUnifiedImport(createUnifiedExport(withHistory), options), withHistory);
  const beforeHistory = { ...withHistory };
  delete beforeHistory.recentWordKeys;
  assert.deepEqual(parseUnifiedImport({ ...beforeHistory, coursePractice: { desire: ['verb:tai:包む'] } }, options).recentWordKeys, []);
  assert.deepEqual(parseUnifiedImport({ ...old, recentWordKeys: ['verb:包む', null, 12, 'invalid'] }, options).recentWordKeys, ['verb:包む']);
});

test('all real continuation pools cover missing endings and avoid round and recent word repeats', () => {
  const applications = model.components.filter(k => k.id.startsWith('apply.') && k.id.endsWith('.continuation'));
  assert.ok(applications.length >= 20);
  for (const focus of applications) {
    const byKc = Object.fromEntries(model.components.map(k => [k.id, mastered]));
    for (const id of [focus.id, ...focus.coverageKcIds]) byKc[id] = emptySkillStats();
    const pool = filterReadyExercises(model.exercises.filter(e => e.courseId === focus.firstCourseId && e.kcIds.includes(focus.id)), focus.id, model.components, byKc);
    assert.ok(new Set(pool.map(wordKey)).size >= 48, focus.id);
    let recentWordKeys = [];
    for (let seed = 0; seed < 8; seed++) {
      const assigned = assignPracticeExercises(Array(12).fill(focus), { candidatesFor: () => pool, alternativesFor: () => [], byKc, seed, recentWordKeys });
      const words = assigned.map(({ candidate }) => wordKey(candidate));
      assert.equal(new Set(words).size, 12, `${focus.id}: repeated word in round ${seed}`);
      assert.ok(words.every(word => !recentWordKeys.includes(word)), `${focus.id}: recent word repeat in round ${seed}`);
      for (const facet of focus.coverageKcIds) {
        assert.ok(assigned.slice(0, focus.coverageKcIds.length).some(({ candidate }) => candidate.kcIds.includes(facet)), `${focus.id}: missing ${facet}`);
      }
      for (const { candidate } of assigned) recentWordKeys = recordRecentWord(recentWordKeys, candidate);
    }
  }
});

test('the unified curriculum keeps all 43 courses and 131 forms in prerequisite order', () => {
  assert.equal(UNIFIED_COURSES.length, 43);
  assert.equal(new Set(COURSE_ORDER).size, 43);
  const oldForms = new Set([...COURSES,...ADJECTIVE_COURSES].flatMap(c => c.forms));
  assert.equal(oldForms.size, 131);
  assert.deepEqual(new Set(model.exercises.map(e => e.form).filter(Boolean)), oldForms);
  assert.ok(COURSE_ORDER.indexOf('adjectiveIBase') < COURSE_ORDER.indexOf('basicCompound'));
  assert.ok(UNIFIED_COURSES.find(c => c.id === 'desire').forms.includes('taiNegativePast'));
  assert.deepEqual(UNIFIED_COURSES.at(-1).forms, ['passiveDesireNegativePast']);
  assert.deepEqual(auditKnowledgeModel(model), []);
});

test('explicit stages cover every original course exactly once and supply consistent display metadata', () => {
  const originalIds = [...COURSES, ...ADJECTIVE_COURSES].map(course => course.id);
  const groupedIds = COURSE_STAGES.flatMap(stage => stage.courseIds);
  assert.equal(groupedIds.length, originalIds.length);
  assert.deepEqual(new Set(groupedIds), new Set(originalIds));
  assert.deepEqual(COURSE_STAGES.map(stage => stage.id), ['basics', 'voice', 'linking', 'intentions', 'actions', 'integration']);
  assert.equal(new Set(COURSE_STAGES.map(stage => stage.id)).size, COURSE_STAGES.length);
  assert.deepEqual(STAGES, COURSE_STAGES.map(stage => stage.label));
  // Group membership and route order are separate contracts. Changing a
  // display group must not implicitly specify a new learning route.
  assert.equal(COURSE_ORDER.length, originalIds.length);
  assert.deepEqual(new Set(COURSE_ORDER), new Set(originalIds));
  assert.deepEqual(UNIFIED_COURSES.map(course => course.id), COURSE_ORDER);
  for (const [index, stage] of COURSE_STAGES.entries()) {
    assert.match(stage.id, /^[a-z][a-z-]*$/);
    assert.ok(stage.label.trim().length > 0, stage.id);
    assert.ok(stage.objective.trim().length > 0, stage.id);
    assert.ok(stage.courseIds.length > 0, stage.id);
    for (const id of stage.courseIds) {
      const course = UNIFIED_COURSES.find(course => course.id === id);
      assert.equal(course.stage, index, id);
      assert.equal(course.stageId, stage.id, id);
      assert.equal(course.stageLabel, stage.label, id);
      assert.equal(course.stageObjective, stage.objective, id);
    }
  }
});

test('stages group the main learning objective while keeping reusable adjective forms near their foundations', () => {
  const stageFor = id => UNIFIED_COURSES.find(course => course.id === id).stageId;
  const earlier = (first, later) => assert.ok(COURSE_ORDER.indexOf(first) < COURSE_ORDER.indexOf(later), `${first} before ${later}`);
  assert.equal(stageFor('adjectiveAdverb'), 'basics');
  earlier('adjectiveIBase', 'adjectiveAdverb');
  earlier('adjectiveNaBase', 'adjectiveAdverb');
  earlier('adjectiveAdverb', 'negative');
  for (const id of ['imperative', 'volitional']) assert.equal(stageFor(id), 'intentions');
  assert.equal(stageFor('concurrent'), 'linking');
  for (const id of ['potential', 'passive', 'causative', 'causativePassive']) assert.equal(stageFor(id), 'voice');
  earlier('volitional', 'youtosuru');
  earlier('causative', 'causativePassive');
  assert.deepEqual(COURSE_STAGES.find(stage => stage.id === 'integration').courseIds, ['voiceCompound', 'multiStepCompound']);
  assert.deepEqual(COURSE_ORDER.slice(-2), ['voiceCompound', 'multiStepCompound']);
  assert.equal(COURSE_STAGES.at(-1).id, 'integration');
});

test('the route reuses foundational stem rules in potential and voice forms before later expressions', () => {
  assert.equal(COURSE_ORDER.slice(0, 11).every(id => UNIFIED_COURSES.find(course => course.id === id).stageId === 'basics'), true);
  assert.deepEqual(COURSE_ORDER.slice(11, 15), ['potential', 'passive', 'causative', 'causativePassive']);
  for (const id of ['ba', 'imperative']) {
    assert.ok(COURSE_ORDER.indexOf('potential') < COURSE_ORDER.indexOf(id), `potential before ${id}`);
  }
  assert.ok(COURSE_ORDER.indexOf('causativePassive') < COURSE_ORDER.indexOf('nakuteNaide'));
});

test('every prerequisite and exercised atom is introduced no later than the course that uses it', () => {
  for (const component of model.components) {
    for (const id of component.prerequisites) {
      const prerequisite = byId.get(id);
      assert.ok(prerequisite, `${component.id}: ${id}`);
      assert.ok(prerequisite.firstCourseIndex <= component.firstCourseIndex,
        `${component.id} in ${component.firstCourseId} requires later ${id} in ${prerequisite.firstCourseId}`);
    }
  }
  for (const exercise of model.exercises) {
    for (const id of exercise.kcIds) {
      const component = byId.get(id);
      assert.ok(component, `${exercise.id}: ${id}`);
      assert.ok(component.firstCourseIndex <= exercise.courseIndex,
        `${exercise.id} uses later ${id} from ${component.firstCourseId}`);
    }
  }
  assert.equal(byId.get('stem.godan.e').firstCourseId, 'potential');
  for (const form of ['ba', 'imperative', 'potential']) {
    assert.ok(deriveUnified(verb, form).requiredKcIds.includes('stem.godan.e'), form);
  }
});

test('adjective and derived verb answers share the same i-past rule without sharing source classification', () => {
  const ordinary = deriveUnified(adjective,'adjectivePast');
  const derived = deriveUnified(verb,'taiPast');
  assert.ok(ordinary.requiredKcIds.includes('adj.suffix.i-past'));
  assert.ok(derived.requiredKcIds.includes('adj.suffix.i-past'));
  assert.ok(derived.requiredKcIds.includes('apply.tai.continuation'));
  assert.equal(derived.requiredKcIds.includes('adj.class.i'), false);
  assert.equal(derived.requiredKcIds.includes('suffix.masu'), false);
  assert.equal(derived.requiredKcIds.includes('apply.tehoshii.continuation'), false);
  const stats = updateKnowledgeStats({}, { kcIds: ordinary.requiredKcIds, focusId: 'adj.suffix.i-past', correct: true });
  const next = updateKnowledgeStats(stats, { kcIds: derived.requiredKcIds, focusId: 'apply.tai.continuation', correct: true });
  assert.equal(next['adj.suffix.i-past'].attempts, 2);
  assert.equal(next['adj.class.i'].attempts, 1);
});

test('every nai past uses the shared i-past rule, while na past and ii exceptions remain distinct', () => {
  for (const [item, form] of [[verb,'negativePast'], [verb,'taiNegativePast'], [adjective,'adjectiveNegativePast'], [{domain:'adjective',surface:'静か',reading:'しずか',class:'na'},'adjectiveNaNegativePast']]) {
    assert.ok(deriveUnified(item,form).requiredKcIds.includes('adj.suffix.i-past'), form);
  }
  assert.equal(deriveUnified({domain:'adjective',surface:'静か',reading:'しずか',class:'na'},'adjectiveNaPast').requiredKcIds.includes('adj.suffix.i-past'), false);
  assert.equal(deriveUnified(verb,'taiPast').requiredKcIds.includes('adj.exception.ii-yo'), false);
});

test('the operation sequence represents actual intermediate results', () => {
  const d = deriveUnified(verb,'taiNegativePast');
  assert.deepEqual(d.operations.map(op => [op.input,op.output]), [['読む','読み'],['読み','読みたい'],['読みたい','読みたくなかった']]);
  assert.ok(d.operations[0].kcIds.includes('stem.godan.i'));
  assert.deepEqual(d.operations[1].kcIds,['construction.tai']);
});

test('application mastery requires shared primitives and coverage of all three endings', () => {
  const kc = byId.get('apply.tai.continuation');
  const stats = Object.fromEntries(model.components.map(k => [k.id,{...mastered}]));
  assert.equal(isComponentMastered(kc,stats),true);
  stats['adj.suffix.i-past'] = emptySkillStats();
  assert.equal(isComponentMastered(kc,stats),false);
  stats['adj.suffix.i-past'] = {...mastered};
  stats['facet.apply.tai.negativePast'] = emptySkillStats();
  assert.equal(isComponentMastered(kc,stats),false);
  assert.equal(kc.prerequisites.includes('construction.tehoshii'),false);
  assert.ok(kc.prerequisites.includes('construction.tai'));
});

test('missing shared prerequisites are respected when unlocking and unrelated weak skills do not block the graph', () => {
  const stats = Object.fromEntries(model.components.map(k => [k.id,{...mastered}]));
  const introduced = model.components.filter(k=>k.gating&&k.id!=='apply.tai.continuation').map(k=>k.id);
  stats['adj.suffix.i-past'] = emptySkillStats();
  assert.equal(advanceIntroductions(model.components,introduced,stats).added.some(k=>k.id==='apply.tai.continuation'),false);
  stats['adj.suffix.i-past'] = {...mastered};
  stats['suffix.causative'] = emptySkillStats();
  assert.ok(advanceIntroductions(model.components,introduced,stats).added.some(k=>k.id==='apply.tai.continuation'));
});

test('diagnostic steps credit only newly performed work and do not guess whole-answer failure attribution', () => {
  const steps=unifiedDiagnosticSteps(verb,'taiPast');
  assert.ok(steps[1].kcIds.includes('adj.suffix.i-past'));
  assert.equal(steps[1].kcIds.includes('construction.tai'),false);
  assert.equal(diagnoseUnified(verb,'taiPast','読みたくない'),null);
  const diagnosis=diagnoseUnifiedStep(verb,steps[1],'読みたい');
  assert.equal(diagnosis.kcId,'adj.suffix.i-past');
  assert.deepEqual(diagnosis.confirmedKcIds,[]);
});

test('v5 migration preserves equal semantics, archives compound and contaminated polite statistics without duplicating evidence', () => {
  const old=profile({byKc:{'class.godan':mastered,'suffix.masu':mastered,'composition.i-adjective.past':mastered,'adj.suffix.i-past':mastered}});
  const migrated=parseUnifiedImport(old,options);
  assert.equal(migrated.version,6);
  assert.deepEqual(migrated.byKc['class.godan'],mastered);
  assert.deepEqual(migrated.byKc['adj.suffix.i-past'],mastered);
  assert.equal(migrated.byKc['suffix.masu'],undefined);
  assert.equal(migrated.byKc['apply.tai.continuation'],undefined);
  assert.deepEqual(migrated.legacy.profile,old);
  assert.equal(migrated.migration.archived,2);
  assert.equal(migrated.attempted,4);
  assert.deepEqual(parseUnifiedImport(createUnifiedExport(migrated),options),migrated);
  assert.deepEqual(parseUnifiedImport(old,options),migrated);
});

test('a verb-only legacy profile cannot manufacture native adjective or application mastery', () => {
  const migrated=parseUnifiedImport(profile({introducedKcIds:['class.godan','composition.i-adjective.past'],byKc:{'composition.i-adjective.past':mastered}}),options);
  assert.equal(migrated.byKc['adj.suffix.i-past'],undefined);
  assert.equal(migrated.byKc['adj.class.i'],undefined);
  assert.ok(migrated.accessibleCourseIds.includes('multiStepCompound'));
});

test('v6 restores safe bounded course evidence and rejects unsupported formats', () => {
  const migrated=parseUnifiedImport(profile({}),options);
  const restored=parseUnifiedImport({...migrated,coursePractice:{voiceCompound:['a','a','b'],bogus:['x']}},options);
  assert.deepEqual(restored.coursePractice,{voiceCompound:['a','b']});
  assert.throws(()=>parseUnifiedImport({format:'x',formatVersion:3,profile:migrated},options));
  assert.throws(()=>parseUnifiedImport({...migrated,version:7},options));
});

test('v6 course reordering preserves mastered e-row and adverb evidence together with existing course access', () => {
  const ids = ['stem.godan.e', 'adj.suffix.i-adverb', 'adj.suffix.na-adverb'];
  const before = {
    ...parseUnifiedImport(profile({}), options),
    attempted: 28, correct: 23, streak: 4, rotation: 7,
    introducedKcIds: ['class.godan', 'adj.class.i', 'adj.class.na', ...ids],
    byKc: Object.fromEntries(ids.map(id => [id, { ...mastered, attempts: 9, correct: 8,
      filteredAccuracy: .92, cleanTimeTotal: 8400, cleanTimeCount: 3 }])),
    accessibleCourseIds: ['imperative', 'adjectiveAdverb', 'causative'],
    coursePractice: {
      imperative: ['verb:imperative:読む'],
      adjectiveAdverb: ['adjective:adjectiveAdverb:高い', 'adjective:adjectiveAdverb:静か'],
      voiceCompound: ['verb:causativePast:読む'],
    },
  };
  // The persisted identity is the rule ID, even though its introductory
  // course has moved from imperative to potential in the unified route.
  assert.equal(page.VERB_KNOWLEDGE.components.find(kc => kc.id === 'stem.godan.e').firstCourseId, 'imperative');
  assert.equal(byId.get('stem.godan.e').firstCourseId, 'potential');
  const restored = parseUnifiedImport(createUnifiedExport(before), options);
  assert.deepEqual(restored, before);
  for (const id of ids) assert.equal(isComponentMastered(byId.get(id), restored.byKc), true, id);
  for (const id of before.accessibleCourseIds) {
    const course = UNIFIED_COURSES.find(course => course.id === id);
    const components = model.courseKcIds[id].map(id => byId.get(id));
    const summary = summarizeUnifiedCourse(course, components, restored.introducedKcIds, restored);
    assert.equal(summary.unlocked, true, id);
  }
  // Historical access does not fill the missing causative rule or mark
  // that course mastered just because its stage or position changed.
  const course = UNIFIED_COURSES.find(course => course.id === 'causative');
  const components = model.courseKcIds[course.id].map(id => byId.get(id));
  assert.equal(restored.byKc['suffix.causative'], undefined);
  assert.equal(summarizeUnifiedCourse(course, components, restored.introducedKcIds, restored).complete, false);
});

test('revision 1 e-row introductions preserve imperative access without inventing revision 2 ba access', () => {
  assert.equal(CURRICULUM_VERSION, 3);
  for (const version of [undefined, 1]) {
    const before = {
      ...parseUnifiedImport(profile({}), options),
      introducedKcIds: ['stem.godan.e'], byKc: { 'stem.godan.e': { ...mastered } },
      accessibleCourseIds: [], curriculumVersion: version,
    };
    if (version === undefined) delete before.curriculumVersion;
    const restored = parseUnifiedImport(createUnifiedExport(before), options);
    assert.equal(restored.curriculumVersion, CURRICULUM_VERSION);
    assert.deepEqual(restored.byKc, before.byKc);
    assert.deepEqual(restored.accessibleCourseIds, ['imperative']);
    const course = UNIFIED_COURSES.find(course => course.id === 'imperative');
    const components = model.courseKcIds[course.id].map(id => byId.get(id));
    const summary = summarizeUnifiedCourse(course, components, restored.introducedKcIds, restored);
    assert.equal(summary.unlocked, true);
    assert.equal(summary.complete, false);
    assert.equal(restored.byKc['suffix.imperative'], undefined);
    const ba = UNIFIED_COURSES.find(course => course.id === 'ba');
    assert.equal(summarizeUnifiedCourse(ba, model.courseKcIds.ba.map(id => byId.get(id)), restored.introducedKcIds, restored).unlocked, false);
    assert.deepEqual(parseUnifiedImport(createUnifiedExport(restored), options), restored);
  }
});

test('revision 2 preserves ba access and any explicit imperative access through repeat imports', () => {
  for (const oldAccess of [[], ['imperative']]) {
    const before = {
      ...parseUnifiedImport(profile({}), options), curriculumVersion: 2,
      introducedKcIds: ['class.godan', 'stem.godan.e'],
      byKc: { 'stem.godan.e': { ...mastered } },
      accessibleCourseIds: oldAccess,
      coursePractice: { ba: ['verb:ba:読む'] },
    };
    const restored = parseUnifiedImport(createUnifiedExport(before), options);
    assert.equal(restored.curriculumVersion, CURRICULUM_VERSION);
    assert.deepEqual(restored.byKc, before.byKc);
    assert.deepEqual(restored.coursePractice, before.coursePractice);
    assert.deepEqual(new Set(restored.accessibleCourseIds), new Set([...oldAccess, 'ba']));
    for (const [id, unlocked] of [['ba', true], ['imperative', oldAccess.includes('imperative')]]) {
      const course = UNIFIED_COURSES.find(course => course.id === id);
      const components = model.courseKcIds[id].map(id => byId.get(id));
      assert.equal(summarizeUnifiedCourse(course, components, restored.introducedKcIds, restored).unlocked, unlocked, id);
    }
    assert.equal(restored.byKc['suffix.ba'], undefined);
    assert.equal(restored.byKc['suffix.imperative'], undefined);
    assert.deepEqual(parseUnifiedImport(createUnifiedExport(restored), options), restored);
  }
});

test('a revision 3 e-row introduction opens potential without granting historical ba or imperative access', () => {
  const before = {
    ...parseUnifiedImport(profile({}), options), curriculumVersion: CURRICULUM_VERSION,
    introducedKcIds: ['class.godan', 'stem.godan.e'],
    byKc: { 'class.godan': { ...mastered }, 'stem.godan.e': { ...mastered } },
    accessibleCourseIds: [],
  };
  const restored = parseUnifiedImport(createUnifiedExport(before), options);
  assert.deepEqual(restored, before);
  for (const [id, unlocked] of [['potential', true], ['ba', false], ['imperative', false]]) {
    const course = UNIFIED_COURSES.find(course => course.id === id);
    const components = model.courseKcIds[id].map(id => byId.get(id));
    assert.equal(summarizeUnifiedCourse(course, components, restored.introducedKcIds, restored).unlocked, unlocked, id);
  }
  assert.deepEqual(parseUnifiedImport(createUnifiedExport(restored), options), restored);
});

test('review-only courses require their own distinct practice evidence, not a fictitious new atom', () => {
  const c=UNIFIED_COURSES.find(c=>c.id==='voiceCompound');
  const required=model.courseKcIds[c.id].map(id=>byId.get(id));
  const p={byKc:Object.fromEntries(model.components.map(k=>[k.id,mastered])),accessibleCourseIds:[],coursePractice:{}};
  const introduced=model.components.filter(k=>k.gating).map(k=>k.id);
  assert.equal(summarizeUnifiedCourse(c,required,introduced,p).complete,false);
  p.coursePractice[c.id]=Array.from({length:12},(_,i)=>String(i));
  assert.equal(summarizeUnifiedCourse(c,required,introduced,p).complete,true);
});

test('every form keeps legacy accepted answers and exposes a continuous operation sequence', () => {
  for (const exercise of model.exercises) {
    if (!exercise.form) continue;
    const legacy = (exercise.item.domain === 'verb' ? page.VERB_KNOWLEDGE : page.ADJECTIVE_KNOWLEDGE).exercises.find(e => e.form === exercise.form && e.item.surface === exercise.item.surface);
    assert.ok(legacy, exercise.id);
    const d = deriveUnified(exercise.item, exercise.form);
    const old = exercise.item.domain === 'verb' ? deriveExercise(exercise.item, exercise.form) : deriveAdjectiveExercise(exercise.item, exercise.form);
    assert.deepEqual(d.acceptedVariants, old.acceptedVariants, exercise.id);
    assert.equal(d.operations[0].input, exercise.item.surface, exercise.id);
    assert.equal(d.operations.at(-1).output, d.answer, exercise.id);
    for (let i = 1; i < d.operations.length; i++) assert.equal(d.operations[i].input, d.operations[i-1].output, exercise.id);
    assert.deepEqual(new Set(d.operations.flatMap(op => op.kcIds)), new Set(d.requiredKcIds), exercise.id);
    assert.ok(exercise.sourceUrl);
  }
});

test('aru negative continuations do not invent a godan a-row operation', () => {
  const d = deriveUnified(verb, 'tearuNegative');
  assert.ok(d.requiredKcIds.includes('exception.aru-negative'));
  assert.equal(d.requiredKcIds.includes('stem.godan.a'), false);
  assert.equal(d.answer, '読んでない');
});

test('native negative-past and three-stage combinations have supplied-base diagnostics', () => {
  const native = unifiedDiagnosticSteps(adjective, 'adjectiveNegativePast');
  assert.equal(native.length, 2);
  assert.deepEqual(native[1].kcIds, ['adj.suffix.i-past','adj.compound.i-negative-past']);
  assert.equal(diagnoseUnifiedStep(adjective, native[1], '高くない').kcId, 'adj.suffix.i-past');
  const complex = unifiedDiagnosticSteps(verb, 'passiveDesireNegativePast');
  assert.deepEqual(complex.map(step => step.form), ['passive', 'tai', 'taiNegativePast']);
  assert.equal(complex[1].surface, '読まれる');
  assert.ok(complex[1].kcIds.includes('construction.tai'));
  assert.equal(complex[1].kcIds.includes('adj.suffix.i-past'), false);
  assert.equal(complex[1].kcIds.includes('suffix.passive'), false);
  assert.equal(complex[2].surface, '読まれたい');
  assert.ok(complex[2].kcIds.includes('adj.suffix.i-past'));
  assert.ok(complex.every(step => !step.kcIds.includes('compound.multi-step')));
});

test('ku stem omission updates only the missing suffix and the demonstrated stem', () => {
  const d = deriveUnified(adjective, 'adjectiveNegative');
  assert.deepEqual(d.operations.map(op => op.output), ['高く', '高くない']);
  const diagnosis = diagnoseUnified(adjective, 'adjectiveNegative', '高く');
  const stats = Object.fromEntries(model.components.map(k => [k.id, { ...mastered }]));
  const next = updateKnowledgeStats(stats, { kcIds: d.requiredKcIds, focusId: 'adj.class.i', failedKcId: diagnosis.kcId, confirmedKcIds: diagnosis.confirmedKcIds, correct: false });
  assert.equal(next['adj.stem.i-ku'].correct, 6);
  assert.equal(next['adj.suffix.i-negative'].attempts, 6);
  assert.equal(next['adj.suffix.i-negative'].correct, 5);
  assert.deepEqual(next['adj.class.i'], stats['adj.class.i']);
  assert.deepEqual(next['adj.suffix.i-adverb'], stats['adj.suffix.i-adverb']);
  const step = unifiedDiagnosticSteps(adjective, 'adjectiveNegativePast')[0];
  assert.equal(diagnoseUnifiedStep(adjective, step, '高く').kcId, 'adj.suffix.i-negative');
});

test('complete adjective negative intermediates confirm only demonstrated operations and skip to the past probe', () => {
  const cases = [
    [{domain:'adjective',surface:'遠い',reading:'とおい',class:'i'}, 'adjectiveNegativePast', ['遠くない', 'とおくない'], ['adj.stem.i-ku', 'adj.suffix.i-negative']],
    [{domain:'adjective',surface:'いい',reading:'いい',class:'i',iiFamily:true}, 'adjectiveNegativePast', ['よくない'], ['adj.stem.i-ku', 'adj.suffix.i-negative', 'adj.exception.ii-yo']],
    [{domain:'adjective',surface:'かっこいい',reading:'かっこいい',class:'i',iiFamily:true}, 'adjectiveNegativePast', ['かっこよくない'], ['adj.stem.i-ku', 'adj.suffix.i-negative', 'adj.exception.ii-yo']],
    [{domain:'adjective',surface:'静か',reading:'しずか',class:'na'}, 'adjectiveNaNegativePast', ['静かではない', 'しずかではない', '静かじゃない', 'しずかじゃない'], ['adj.suffix.na-negative']],
  ];
  for (const [item,form,answers,confirmed] of cases) for (const answer of answers) {
    const diagnosis = diagnoseUnified(item,form,answer);
    assert.equal(diagnosis.kcId,null);
    assert.deepEqual(diagnosis.confirmedKcIds,confirmed);
    const steps = unifiedDiagnosticSteps(item,form,{answer});
    assert.equal(steps.length,1);
    assert.equal(steps[0].continuation,true);
    assert.equal(steps[0].targetLabel,'过去形');
    assert.ok(steps[0].kcIds.includes('adj.suffix.i-past'));
    assert.equal(steps[0].kcIds.some(id=>confirmed.includes(id)),false);
    assert.equal(diagnoseUnifiedStep(item,steps[0],answer).kcId,'adj.suffix.i-past');
  }
});

test('partial or misspelled negative intermediates never skip a diagnostic step', () => {
  for (const answer of ['高く', '高くな', '高くないxyz', 'たかくな', 'たがくない', '高かった', 'xyz']) {
    assert.equal(unifiedDiagnosticSteps(adjective,'adjectiveNegativePast',{answer}).length,2,answer);
  }
  const ii={domain:'adjective',surface:'いい',reading:'いい',class:'i',iiFamily:true};
  assert.equal(unifiedDiagnosticSteps(ii,'adjectiveNegativePast',{answer:'いくない'}).length,2);
  assert.equal(unifiedDiagnosticSteps(adjective,'adjectiveNegativePast',{answer:' たかくない ',normalize:value=>value.trim()}).length,1);
});
