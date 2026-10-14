import assert from 'node:assert/strict';
import test from 'node:test';
import { COURSE_STAGES, UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';
import {
  COURSE_CONTENT_BY_LOCALE,
  COURSE_STAGE_CONTENT_BY_LOCALE,
  courseContentFor,
  courseContentForLocale,
  courseStageContentFor,
  courseStageContentForLocale,
  englishYokubiUrl,
  localizeCourse,
  localizeCourses,
  localizeCourseStage,
  localizeCourseStages,
} from '../app/lib/i18n/content-courses.mjs';

const courseIds = UNIFIED_COURSES.map(course => course.id);
const stageIds = COURSE_STAGES.map(stage => stage.id);
const chineseHan = /[\u3400-\u9fff\uf900-\ufaff]/u;

test('course and stage sidecars cover the exact stable inventories in both locales', () => {
  assert.equal(courseIds.length, 43);
  assert.equal(stageIds.length, 6);
  assert.equal(new Set(courseIds).size, courseIds.length);
  assert.equal(new Set(stageIds).size, stageIds.length);

  for (const locale of ['zh-CN', 'en']) {
    assert.deepEqual(Object.keys(courseContentForLocale(locale)).sort(), [...courseIds].sort(), locale);
    assert.deepEqual(Object.keys(courseStageContentForLocale(locale)).sort(), [...stageIds].sort(), locale);
    assert.ok(Object.isFrozen(courseContentForLocale(locale)));
    assert.ok(Object.isFrozen(courseStageContentForLocale(locale)));
  }
  assert.deepEqual(Object.keys(COURSE_CONTENT_BY_LOCALE['zh-CN']).sort(), Object.keys(COURSE_CONTENT_BY_LOCALE.en).sort());
  assert.deepEqual(Object.keys(COURSE_STAGE_CONTENT_BY_LOCALE['zh-CN']).sort(), Object.keys(COURSE_STAGE_CONTENT_BY_LOCALE.en).sort());
});

test('Chinese sidecars preserve the existing curriculum copy exactly', () => {
  for (const course of UNIFIED_COURSES) {
    assert.deepEqual(courseContentFor(course.id, 'zh-CN'), {
      title: course.title,
      description: course.description,
    });
  }
  for (const stage of COURSE_STAGES) {
    assert.deepEqual(courseStageContentFor(stage, 'zh'), {
      label: stage.label,
      objective: stage.objective,
    });
  }
});

test('English course and stage display metadata has no Chinese Han text', () => {
  for (const course of UNIFIED_COURSES) {
    const content = courseContentFor(course, 'en-US');
    assert.ok(content.title.trim(), course.id);
    assert.ok(content.description.trim(), course.id);
    assert.doesNotMatch(`${content.title} ${content.description}`, chineseHan, course.id);
  }
  for (const stage of COURSE_STAGES) {
    const content = courseStageContentFor(stage.id, 'en');
    assert.ok(content.label.trim(), stage.id);
    assert.ok(content.objective.trim(), stage.id);
    assert.doesNotMatch(`${content.label} ${content.objective}`, chineseHan, stage.id);
  }
});

test('localized views preserve course identity, order, forms, lessons, and stage membership', () => {
  const localizedCourses = localizeCourses(UNIFIED_COURSES, 'en');
  const localizedStages = localizeCourseStages(COURSE_STAGES, 'en');
  assert.deepEqual(localizedCourses.map(course => course.id), courseIds);
  assert.deepEqual(localizedCourses.map(course => course.order), UNIFIED_COURSES.map(course => course.order));
  assert.deepEqual(localizedStages.map(stage => stage.id), stageIds);

  for (const [index, course] of UNIFIED_COURSES.entries()) {
    const localized = localizedCourses[index];
    assert.equal(localized.lesson, course.lesson, course.id);
    assert.equal(localized.domain, course.domain, course.id);
    assert.equal(localized.stageId, course.stageId, course.id);
    assert.equal(localized.stage, course.stage, course.id);
    assert.deepEqual(localized.forms, course.forms, course.id);
    assert.equal(localized.lessonLabel, course.lesson === '复习' ? 'Review' : course.lesson, course.id);
    assert.match(localized.url, /^https:\/\/yoku\.bi\/Section\d+\/Part\d+\/Lesson\d+\.html$/u, course.id);
    assert.equal(course.url.startsWith('https://l-m-sherlock.github.io/yokubi-zh-cn/'), true, course.id);
  }

  for (const [index, stage] of COURSE_STAGES.entries()) {
    assert.deepEqual(localizedStages[index].courseIds, stage.courseIds, stage.id);
  }
});

test('English Yokubi URLs retain the source lesson path', () => {
  for (const course of UNIFIED_COURSES) {
    const sourcePath = new URL(course.url).pathname.match(/Section\d+\/Part\d+\/Lesson\d+\.html$/u)?.[0];
    assert.equal(englishYokubiUrl(course.url), `https://yoku.bi/${sourcePath}`, course.id);
  }
  assert.equal(englishYokubiUrl('not a URL'), 'https://yoku.bi');
});

test('single-item accessors reject unsupported locales and tolerate unknown IDs', () => {
  assert.equal(localizeCourse('missing', 'en'), null);
  assert.equal(localizeCourseStage('missing', 'en'), null);
  assert.equal(courseContentFor('missing', 'en'), null);
  assert.equal(courseStageContentFor(null, 'en'), null);
  assert.throws(() => courseContentForLocale('fr'), /Unsupported course locale/);
  assert.throws(() => localizeCourse(UNIFIED_COURSES[0], 'fr'), /Unsupported course locale/);
});
