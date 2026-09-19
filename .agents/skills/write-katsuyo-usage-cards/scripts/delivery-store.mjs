import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };

/** All stored paths are relative to one task root; reject junctions as well as symlinks. */
export function deliveryPath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || path.isAbsolute(relative)) fail('Unsafe delivery path');
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) fail('Unsafe delivery path');
  let current = fs.realpathSync(root);
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) fail('Delivery paths cannot contain symlinks/junctions');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return current;
}

function writeNew(file, bytes) {
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

// Windows scanners can briefly hold a freshly written directory open. Keep the
// atomic rename; retry only sharing/access errors, at most 5 attempts / 400 ms.
function publishDirectory(staging, target) {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.lstatSync(target);
      throw Object.assign(new Error(`Delivery target already exists: ${target}`), {code: 'EEXIST'});
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      fs.renameSync(staging, target);
      return;
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 4) throw error;
      Atomics.wait(pause, 0, 0, 100);
    }
  }
}

/** Publish a complete directory by rename. Failed staging directories are never referenced. */
export function createDelivery({root, batch, phase, revision, artifacts}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\/[0-9]{2,}$/.test(batch) || !['author', 'review'].includes(phase)
      || !Number.isSafeInteger(revision) || revision < 1 || !(artifacts instanceof Map) || !artifacts.size) fail('Invalid delivery metadata');
  const parent = `deliveries/${batch}`;
  fs.mkdirSync(deliveryPath(root, parent), {recursive: true});
  const name = `rev-${revision}-${phase}-${crypto.randomUUID()}`;
  const finalRelative = `${parent}/${name}`;
  const staging = deliveryPath(root, `${parent}/.${name}.staging`);
  fs.mkdirSync(staging);
  const files = {}, hashes = {}, sourceHashes = {};
  const names = new Set();
  for (const [source, bytes] of artifacts) {
    deliveryPath(root, source);
    if (!Buffer.isBuffer(bytes)) fail('Delivery artifacts must be captured byte buffers');
    const basename = path.posix.basename(source);
    if (names.has(basename) || basename === 'snapshot.json') fail('Duplicate delivery artifact name');
    names.add(basename);
    const target = `${finalRelative}/${basename}`;
    writeNew(path.join(staging, basename), bytes);
    files[source] = target; hashes[target] = digest(bytes); sourceHashes[source] = digest(bytes);
  }
  const manifest = {version: 1, batch, phase, revision, root: finalRelative, files, hashes, sourceHashes};
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  writeNew(path.join(staging, 'snapshot.json'), bytes);
  publishDirectory(staging, deliveryPath(root, finalRelative));
  return {...manifest, manifest: `${finalRelative}/snapshot.json`, receipt: digest(bytes)};
}

/** Verify and return the SAME bytes used by consumers, avoiding hash-then-read races. */
export function readDelivery(root, delivery) {
  if (!delivery || delivery.version !== 1 || !/^[a-f0-9]{64}$/.test(delivery.receipt ?? '')) fail('Missing delivery receipt');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\/[0-9]{2,}$/.test(delivery.batch ?? '') || !['author', 'review'].includes(delivery.phase)
      || !Number.isSafeInteger(delivery.revision) || delivery.revision < 1) fail('Invalid delivery metadata');
  const prefix = `deliveries/${delivery.batch}/rev-${delivery.revision}-${delivery.phase}-`;
  if (!delivery.root?.startsWith(prefix) || !/^[0-9a-f-]{36}$/.test(delivery.root.slice(prefix.length))
      || delivery.manifest !== `${delivery.root}/snapshot.json`) fail('Invalid delivery location');
  const manifestBytes = fs.readFileSync(deliveryPath(root, delivery.manifest));
  if (digest(manifestBytes) !== delivery.receipt) fail('Delivery manifest drift');
  const manifest = JSON.parse(manifestBytes);
  const pinned = {...delivery};
  delete pinned.manifest; delete pinned.receipt;
  if (JSON.stringify(manifest) !== JSON.stringify(pinned)) fail('Delivery receipt metadata mismatch');
  const sources = Object.keys(delivery.files ?? {});
  if (!sources.length || sources.length !== Object.keys(delivery.hashes ?? {}).length || sources.length !== Object.keys(delivery.sourceHashes ?? {}).length) fail('Invalid delivery file set');
  const result = new Map();
  for (const source of sources) {
    deliveryPath(root, source);
    const target = delivery.files[source];
    if (target !== `${delivery.root}/${path.posix.basename(source)}`) fail('Invalid delivery artifact location');
    const bytes = fs.readFileSync(deliveryPath(root, target));
    if (digest(bytes) !== delivery.hashes[target] || digest(bytes) !== delivery.sourceHashes[source]) fail(`Delivery artifact drift: ${target}`);
    result.set(source, bytes);
  }
  return result;
}
