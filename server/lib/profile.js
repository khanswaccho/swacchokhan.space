/**
 * Loads data/profile.json — the single source of truth for every piece of
 * content on the site. In development it is re-read on each access so edits
 * show up on refresh; in production it is read once and frozen.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(process.cwd(), 'data', 'profile.json');

function load() {
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

let cached = load();

const isDev = process.env.NODE_ENV !== 'production';

const profile = isDev
  ? new Proxy(
      {},
      {
        get(_t, key) {
          try {
            cached = load();
          } catch (err) {
            console.error('[profile] data/profile.json is invalid, serving last good copy:', err.message);
          }
          return cached[key];
        },
        ownKeys: () => Reflect.ownKeys(cached),
        getOwnPropertyDescriptor: (_t, key) => ({
          value: cached[key],
          enumerable: true,
          configurable: true,
        }),
      }
    )
  : Object.freeze(cached);

export default profile;
