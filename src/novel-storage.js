import { NOVEL_STORAGE_PROTOCOL, novelKey, novelContent, novelSnapshot, novelComparison } from './novel-storage-contract.js';

export class NovelRepository {
  constructor({ request = (...args) => globalThis.fetch(...args) } = {}) { this.request = request; this.token = null; this.baseline = new Map(); this.chain = Promise.resolve(); this.ready = false; }
  async api(path = '', input, renewed = false, options = {}) {
    if (!this.token) {
      const response = await this.request('/api/novels/session', { headers: { 'x-nf-novel-request': '1' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!response.ok || body.protocol !== NOVEL_STORAGE_PROTOCOL || !body.token) throw new Error('本地小说数据库尚未就绪，请执行 bash reboot.sh 后重试。');
      this.token = body.token;
    }
    const response = await this.request('/api/novels' + path, { method: input === undefined ? 'GET' : 'POST',
      headers: { 'x-nf-novel-session': this.token, 'content-type': 'application/json' }, cache: 'no-store', signal: options.timeout===0 ? options.signal : options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(options.timeout??60000)]) : AbortSignal.timeout(options.timeout??60000),
      ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
    if (response.status === 401 && !renewed) { this.token = null; return this.api(path, input, true, options); }
    let body;
    if(/application\/x-ndjson/.test(response.headers.get('content-type')||'')){
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',failure;
      const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='preview')options.onPreview?.(event.delta);if(event.type==='result')body=event.body;if(event.type==='error')failure=event;};
      try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>4*1024*1024)throw new Error('创作结果超过传输容量。');const lines=buffer.split('\n');buffer=lines.pop();lines.forEach(consume);}buffer+=decoder.decode();consume(buffer);}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      if(failure)throw Object.assign(new Error(failure.error),{code:failure.code,status:failure.status});
      if(!body)throw Object.assign(new Error('创作连接中断，已发送请求保留在账本，继续可取回。'),{code:'CREATION_INTERRUPTED'});
    }else body=await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || '本地小说数据库保存失败。'), { code: body.code, status: response.status });
    return body;
  }
  async load(legacyBooks = []) {
    let imports = [];
    if (legacyBooks.length) imports = (await this.api('/import', { books: legacyBooks.map(novelSnapshot) })).imports;
    const result = await this.api();
    if (result.protocol !== NOVEL_STORAGE_PROTOCOL || !Array.isArray(result.books)) throw new Error('本地小说数据库响应无效。');
    this.baseline = new Map(result.books.map(record => [novelKey(record.book), { ...record, content: novelContent(record.book), comparison:novelComparison(record.book) }]));
    this.ready = true;
    return { books: result.books.map(record => record.book), instance: result.instance, imports };
  }
  // Reload the authoritative SQLite catalog without importing browser state.
  // The management screen uses this to pick up books created by another tab
  // or a completed test run while retaining its current in-memory edits.
  async refresh() { return this.load(); }
  save(books, { partial = false } = {}) {
    const snapshot = books.map(novelSnapshot);
    const execute = async () => {
      if (!this.ready) throw new Error('小说数据库未连接，当前内容尚未保存到数据库。');
      const writes = [], present = new Set(snapshot.map(novelKey));
      for (const book of snapshot) {
        const old = this.baseline.get(novelKey(book));
        if (!old || old.content !== novelContent(book)) writes.push({ book, expectedRevision: old?.revision ?? null });
      }
      // Only books this page actually loaded can be intentionally removed.
      // Other browsers' newly created books are never inferred as deletions.
      const deleted = (partial ? [] : [...this.baseline]).filter(([key]) => !present.has(key)).map(([, old]) => ({ ownerId: old.book.ownerId, id: old.book.id, expectedRevision: old.revision }));
      if (!writes.length && !deleted.length) return;
      const result = await this.api('/save', { books: writes, deleted });
      for (const { book } of writes) {
        const version = result.versions.find(v => v.id === book.id && v.ownerId === book.ownerId);
        if (!version) throw new Error('数据库未确认所有作品版本，当前保存状态未完成。');
        this.baseline.set(novelKey(book), { book, ...version, content: novelContent(book), comparison:novelComparison(book) });
      }
      for (const item of deleted) this.baseline.delete(novelKey(item));
    };
    const pending = this.chain.then(execute, execute);
    this.chain = pending.catch(() => {});
    return pending;
  }
}
