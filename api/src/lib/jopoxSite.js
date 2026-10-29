// Reader for the PUBLIC club site www.kiekko-ahma.fi (Jopox). Every page ships its
// data as a JSON blob in the HTML, and this turns that blob into the flat
// `pageProps` object the callers read (news, players, officials, sponsors, …).
//
// Jopox migrated the site from Next.js to Nuxt (noticed 2026-10-29), which removed
// the `__NEXT_DATA__` script the readers had keyed on. Every one of them started
// throwing "__NEXT_DATA__ not found": news, partners, organisation, team rosters,
// the Ahmaliiga roster/photo sync and the officials audit, all at once. Both formats
// are handled here so one place decides what the payload looks like.
//
// Nuxt serialises with devalue, not plain JSON: the payload is a FLAT array where a
// number in any value position is an index into that same array, which is how it
// dedupes repeated object keys and shares substructures. So it has to be resolved
// rather than just parsed. Negative indexes are devalue's sentinels, and a string
// as an array's first element marks a custom type (`["Date", ref]`, and Nuxt's own
// `["ShallowReactive", ref]` reactivity wrappers).
//
// See memory: reference_jopox_kiekkoahma.

// devalue sentinels (devalue/src/constants.js).
const HOLE = -2;
const SENTINELS = { '-1': undefined, '-2': undefined, '-3': NaN, '-4': Infinity, '-5': -Infinity, '-6': -0 };

// Custom types that wrap exactly one value. Nuxt's reactivity wrappers are
// unwrapped silently — a caller wants the data, not the Vue plumbing.
const TRANSPARENT = new Set([
  'Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef', 'Date',
]);

/** Resolve a devalue flat array into the value it encodes. */
function parseDevalue(json) {
  const flat = JSON.parse(json);
  if (!Array.isArray(flat)) throw new Error('Jopox payload is not a devalue array');
  const out = new Array(flat.length);
  const filled = new Array(flat.length).fill(false);

  const resolve = (ref) => {
    if (typeof ref !== 'number') return ref; // only hit if Jopox changes the format again
    if (ref < 0) return SENTINELS[String(ref)];
    if (ref >= flat.length) return undefined;
    if (filled[ref]) return out[ref];
    const raw = flat[ref];

    // Primitives (and the interned strings every object key points at).
    if (raw === null || typeof raw !== 'object') {
      filled[ref] = true;
      out[ref] = raw;
      return raw;
    }

    if (Array.isArray(raw)) {
      // Arrays hold references only, so a leading string is a type tag, never data.
      if (typeof raw[0] === 'string') {
        filled[ref] = true;
        const [tag, ...args] = raw;
        if (TRANSPARENT.has(tag)) out[ref] = resolve(args[0]);
        else if (tag === 'Set') out[ref] = args.map(resolve);
        else if (tag === 'Map') {
          const m = {};
          for (let i = 0; i + 1 < args.length; i += 2) m[resolve(args[i])] = resolve(args[i + 1]);
          out[ref] = m;
        // An unknown single-value wrapper is most likely another reactivity type:
        // unwrap it rather than hand the caller a tag it cannot read.
        } else out[ref] = args.length === 1 ? resolve(args[0]) : null;
        return out[ref];
      }
      // Set the container BEFORE filling it — the payload may be cyclic.
      const arr = [];
      filled[ref] = true;
      out[ref] = arr;
      for (const r of raw) arr.push(r === HOLE ? undefined : resolve(r));
      return arr;
    }

    const obj = {};
    filled[ref] = true;
    out[ref] = obj;
    for (const k of Object.keys(raw)) obj[k] = resolve(raw[k]);
    return obj;
  };

  return resolve(0);
}

/**
 * The page's data as one flat object, whichever framework served it.
 * Throws if the page carries no recognisable payload — a caller must NOT treat
 * that as "this page has no content", or it will overwrite good data with
 * nothing (which is exactly what wiped the Ahmaliiga card photos).
 */
function pageProps(html) {
  const next = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (next) {
    const props = JSON.parse(next[1]).props || {};
    return props.pageProps || {};
  }

  const nuxt = String(html).match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nuxt) throw new Error('Jopox page payload not found (__NEXT_DATA__ / __NUXT_DATA__)');

  // Nuxt keys each fetch by its own cache key ("subsite-9952", "subsite-menus-…"),
  // where Next had one pageProps. Merge the object-valued ones so callers keep
  // reading flat names like `players` / `officials` / `news`. An entry that is
  // itself an ARRAY has no field names to merge (/organisaatio is one bare list of
  // officials), so it stays under its own key — pick those out by shape, because
  // the key is a Jopox-internal cache name and can be renamed under us.
  const root = parseDevalue(nuxt[1]) || {};
  const merged = {};
  for (const [key, value] of Object.entries(root.data || {})) {
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) merged[key] = value;
    else Object.assign(merged, value);
  }
  return merged;
}

module.exports = { pageProps, parseDevalue };
