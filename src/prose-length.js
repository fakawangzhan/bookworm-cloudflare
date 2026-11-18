export const PROSE_PROTOCOL = 'unicode-prose-v1';
export const legacyProseWords = text => String(text ?? '').replace(/\s/g, '').length;
export const proseWords = text => Array.from(String(text ?? '').replace(/\s/g, '')).length;
export function proseBounds(target, { min = Math.ceil(target * .95), max = Math.floor(target * 1.05) } = {}) {
  if (!Number.isSafeInteger(target) || target < 1 || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min) throw new Error('正文目标或字数范围无效。');
  const tolerance = Math.max(1, Math.floor(target * .01));
  return { target, businessMin: min, businessMax: max, tolerance, min: Math.max(1, min - tolerance), max: max + tolerance };
}

// This guard is for author-directed chapter edits. Book audit/revision keeps
// its own existing validation policy. A failed candidate is never truncated.
export async function fitProseLength({ content, target, request, signal, attempts = 2, protocol = PROSE_PROTOCOL }) {
  const { min, max } = proseBounds(target), count = protocol === PROSE_PROTOCOL ? proseWords : legacyProseWords;
  let candidate = content;
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const actual = count(candidate);
    if (actual >= min && actual <= max) return candidate;
    if (attempt >= attempts) {
      const error = new Error(`本片段目标 ${target} 字，AI 返回 ${actual} 字，字数纠偏已停止；原正文及已完成片段保留，可调整修改方向后重试。`);
      error.lengthCandidate = candidate;
      throw error;
    }
    candidate = await request(candidate, { actual, target, min, max, attempt: attempt + 1 });
  }
}
