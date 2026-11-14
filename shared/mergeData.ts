/**
 * Pure data merging functions for CampNav.
 * Merges authoritative bundled JSON assets with live server API datasets.
 */

/**
 * Pure merge function that merges bundled records with server-provided records by `id`.
 *
 * Rules:
 * 1. Server values win on conflict (for any field present and defined on the server object).
 * 2. Missing/undefined fields on the server record fall back to bundled record values.
 * 3. Unknown IDs from the server are appended.
 * 4. If server is null, undefined, not an array, or empty (e.g. unreachable), returns bundled data unchanged.
 * 5. Pure: does not mutate either input array or input objects.
 */
export function mergeById<T extends { id: string }>(
  bundled: T[],
  server?: T[] | null
): T[] {
  if (!Array.isArray(bundled)) {
    return Array.isArray(server) ? server.map((item) => ({ ...item })) : [];
  }
  if (!Array.isArray(server) || server.length === 0) {
    return bundled.map((item) => ({ ...item }));
  }

  const serverMap = new Map<string, T>();
  for (const s of server) {
    if (s && typeof s === 'object' && s.id) {
      serverMap.set(s.id, s);
    }
  }

  const merged: T[] = [];
  const processedServerIds = new Set<string>();

  for (const b of bundled) {
    if (!b || !b.id) {
      merged.push(b ? { ...b } : b);
      continue;
    }

    const s = serverMap.get(b.id);
    if (s) {
      processedServerIds.add(b.id);
      const mergedItem = { ...b };
      for (const key of Object.keys(s) as (keyof T)[]) {
        if (s[key] !== undefined) {
          mergedItem[key] = s[key];
        }
      }
      merged.push(mergedItem);
    } else {
      merged.push({ ...b });
    }
  }

  // Append any server items with IDs not present in bundled data
  for (const s of server) {
    if (s && s.id && !processedServerIds.has(s.id)) {
      merged.push({ ...s });
      processedServerIds.add(s.id);
    }
  }

  return merged;
}

/**
 * Merges campus information object with server overrides.
 */
export function mergeCampusInfo<T extends Record<string, any>>(
  bundled: T,
  server?: Partial<T> | null
): T {
  if (!server || typeof server !== 'object') {
    return { ...bundled };
  }
  const result = { ...bundled };
  for (const key of Object.keys(server) as (keyof T)[]) {
    if (server[key] !== undefined && server[key] !== '') {
      result[key] = server[key] as any;
    }
  }
  return result;
}
