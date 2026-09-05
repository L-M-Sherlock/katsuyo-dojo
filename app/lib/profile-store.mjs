// @ts-check

/**
 * A tab keeps the exact snapshot it loaded. Web Locks serialize writers across
 * tabs; comparing inside the lock prevents a stale tab from replacing progress.
 * Reads never write, and failed writes never discard the caller's memory copy.
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} storage
 * @param {string} key
 * @param {(<T>(callback: () => Promise<T>) => Promise<T>) | null} exclusive
 */
export function createProfileStore(storage, key, exclusive) {
  /** @type {string | null} */
  let expected = null;
  let readable = false;
  return {
    read() {
      try {
        expected = storage().getItem(key);
        readable = true;
        return { raw: expected, error: false };
      } catch {
        return { raw: null, error: true };
      }
    },
    /** @param {string | null} raw */
    isExternalChange(raw) { return raw !== expected; },
    /** @param {unknown} profile */
    async save(profile) {
      if (!readable || !exclusive) return /** @type {const} */ ('unsaved');
      try {
        return await exclusive(async () => {
          if (storage().getItem(key) !== expected) return /** @type {const} */ ('conflict');
          const raw = JSON.stringify(profile);
          storage().setItem(key, raw);
          expected = raw;
          return /** @type {const} */ ('saved');
        });
      } catch {
        return /** @type {const} */ ('unsaved');
      }
    },
  };
}

/** @param {() => Storage} storage @param {string} key */
export function readPreference(storage, key) {
  try { return storage().getItem(key); } catch { return null; }
}

/** @param {() => Storage} storage @param {string} key @param {string | null} value */
export function writePreference(storage, key, value) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
    return true;
  } catch { return false; }
}
