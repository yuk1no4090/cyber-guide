/**
 * 从数组中随机选一个元素
 */
export function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * 从二维数组中随机选一组
 */
export function pickGroup<T>(groups: readonly (readonly T[])[]): T[] {
  return [...pickOne(groups)];
}

/**
 * 从数组中随机选 n 个不重复元素（Fisher-Yates 取前 n）
 */
export function pickN<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
