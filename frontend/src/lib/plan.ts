/**
 * Parses user text to determine if it's asking about a plan/task.
 */
export function parsePlanQuery(
  text: string,
  todayIndex: number
): { kind: 'all' } | { kind: 'day'; day_index: number } | null {
  const input = text.trim();
  if (!input) return null;

  // Avoid false positives: only handle messages that clearly ask about plan/task.
  if (!/(计划|任务)/.test(input)) return null;

  if (/(全部|所有|完整).*(计划|任务)/.test(input) || /(7天|七天).*(计划|任务)/.test(input)) {
    return { kind: 'all' };
  }

  const digitMatch = input.match(/第\s*(\d+)\s*天/);
  if (digitMatch) {
    const day = Number(digitMatch[1]);
    if (Number.isInteger(day)) return { kind: 'day', day_index: day };
  }

  const chineseMatch = input.match(/第\s*([一二三四五六七])\s*天/);
  if (chineseMatch) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 };
    const day = map[chineseMatch[1]];
    if (day) return { kind: 'day', day_index: day };
  }

  if (/今天/.test(input)) return { kind: 'day', day_index: todayIndex };
  if (/明天/.test(input)) return { kind: 'day', day_index: Math.min(7, todayIndex + 1) };
  if (/后天/.test(input)) return { kind: 'day', day_index: Math.min(7, todayIndex + 2) };

  return null;
}
