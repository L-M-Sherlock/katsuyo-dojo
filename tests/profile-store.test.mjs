import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileStore, readPreference, writePreference } from '../app/lib/profile-store.mjs';

function environment(initial = null) {
  let raw = initial;
  let tail = Promise.resolve();
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const exclusive = (callback) => {
    const operation = tail.then(callback);
    tail = operation.catch(() => {});
    return operation;
  };
  return { storage, tab: () => createProfileStore(() => storage, 'profile', exclusive) };
}

test('reading a valid profile never rewrites it, even when writes fail', async () => {
  const env = environment('{"attempted":12}');
  env.storage.setItem = () => { throw new Error('quota'); };
  const tab = env.tab();
  assert.deepEqual(tab.read(), { raw: '{"attempted":12}', error: false });
  assert.equal(await tab.save({ attempted: 13 }), 'unsaved');
  assert.equal(tab.isExternalChange('{"attempted":12}'), false);
  assert.equal(env.storage.getItem(), '{"attempted":12}');
});

test('denied storage access and unavailable locking safely use memory only', async () => {
  const denied = createProfileStore(() => { throw new Error('denied'); }, 'profile', (fn) => fn());
  assert.deepEqual(denied.read(), { raw: null, error: true });
  assert.equal(await denied.save({ attempted: 1 }), 'unsaved');
  const env = environment();
  const noLock = createProfileStore(() => env.storage, 'profile', null);
  noLock.read();
  assert.equal(await noLock.save({ attempted: 1 }), 'unsaved');
  assert.equal(env.storage.getItem(), null);
});

test('a stale tab cannot replace newer progress even before its storage event arrives', async () => {
  const env = environment();
  const a = env.tab(), b = env.tab();
  a.read(); b.read();
  assert.equal(await a.save({ attempted: 10 }), 'saved');
  assert.equal(b.isExternalChange(env.storage.getItem()), true);
  assert.equal(await b.save({ attempted: 1 }), 'conflict');
  assert.equal(JSON.parse(env.storage.getItem()).attempted, 10);
  b.read();
  assert.equal(await b.save({ attempted: 11 }), 'saved');
});

test('simultaneous writers are serialized and exactly one stale write is rejected', async () => {
  const env = environment();
  const a = env.tab(), b = env.tab();
  a.read(); b.read();
  assert.deepEqual(await Promise.all([a.save({ attempted: 1 }), b.save({ attempted: 2 })]), ['saved', 'conflict']);
  assert.equal(JSON.parse(env.storage.getItem()).attempted, 1);
});

test('a later successful save preserves accumulated in-memory answers after a failure', async () => {
  const env = environment();
  const tab = env.tab(); tab.read();
  const setItem = env.storage.setItem;
  env.storage.setItem = () => { throw new Error('quota'); };
  assert.equal(await tab.save({ attempted: 1 }), 'unsaved');
  env.storage.setItem = setItem;
  assert.equal(await tab.save({ attempted: 2 }), 'saved');
  assert.equal(JSON.parse(env.storage.getItem()).attempted, 2);
});

test('preference access never throws when storage is blocked', () => {
  const denied = () => { throw new Error('denied'); };
  assert.equal(readPreference(denied, 'route'), null);
  assert.equal(writePreference(denied, 'route', 'adjective'), false);
  assert.equal(writePreference(denied, 'legacy', null), false);
});
