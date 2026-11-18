export const NOVEL_STORAGE_PROTOCOL = 'local-novels-v1';
export const novelKey = book => JSON.stringify([book.ownerId, book.id]);
// A cheap dirty check may send an extra unchanged snapshot if property order
// changes. The canonical comparison and CAS still decide actual DB writes.
export const novelComparison = book => JSON.stringify({...book,updatedAt:undefined},(key,value)=>['apiKey','aiKey','authorization'].includes(key)?undefined:value);

// Stable comparison excludes the UI's save timestamp. Preserve every project
// field, including workflow checkpoints and unknown legacy fields, except
// credentials: those continue through the existing AI configuration path.
export function novelSnapshot(value) {
  const clean = item => {
    if (Array.isArray(item)) return item.map(clean);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item).filter(([key]) => !['apiKey', 'aiKey', 'authorization'].includes(key)).map(([key, child]) => [key, clean(child)]));
  };
  return clean(value);
}
export function novelContent(value) {
  const order = item => Array.isArray(item) ? item.map(order) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, order(item[key])])) : item;
  const { updatedAt, ...book } = novelSnapshot(value);
  return JSON.stringify(order(book));
}
export function validateNovel(book) {
  const invalid = message => { throw Object.assign(new Error(message), { code: 'NOVEL_INVALID', status: 400 }); };
  if (!book || typeof book !== 'object' || Array.isArray(book)) invalid('作品快照无效。');
  for (const key of ['id', 'ownerId']) if (typeof book[key] !== 'string' || !book[key].trim() || book[key].length > 200) invalid('作品或作者编号无效。');
  if (typeof book.title !== 'string' || !book.title.trim() || book.title.length > 1000) invalid('作品标题无效。');
  if (!Array.isArray(book.chapters) || book.chapters.length > 10000 || !book.drafts || typeof book.drafts !== 'object' || Array.isArray(book.drafts)) invalid('作品目录或正文无效。');
  const ids = new Set();
  for (const chapter of book.chapters) {
    if (!Number.isSafeInteger(chapter?.id) || chapter.id < 1 || ids.has(chapter.id) || typeof chapter.title !== 'string') invalid('章节编号重复或章节信息无效。');
    ids.add(chapter.id);
  }
  for (const [id, content] of Object.entries(book.drafts)) if (!/^\d+$/.test(id) || typeof content !== 'string') invalid('章节正文必须是文本。');
  return novelSnapshot(book);
}

export function hasLegacyNovel(book) {
  return book && (book.title && book.title !== '未命名作品' || book.chapters?.length || Object.keys(book.drafts || {}).length
    || String(book.storyIdea || '').trim() || book.outline?.length || String(book.workflow?.synopsis || '').trim());
}
