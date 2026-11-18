// Provider usage is evidence; missing accounting must never become a zero bill.
export function summarizeAuditUsage(usages) {
  const totals = {inputTokens:0,outputTokens:0,reasoningTokens:0,cacheHitTokens:0,cacheMissTokens:0,
    knownRequests:0,unknownRequests:0,cacheKnownRequests:0,cacheUnknownRequests:0};
  const valid = n => Number.isFinite(n) && n >= 0;
  for (const u of usages) {
    const input = u?.prompt_tokens ?? u?.input_tokens, output = u?.completion_tokens ?? u?.output_tokens;
    if (!valid(input) || !valid(output)) {totals.unknownRequests++;continue;}
    totals.knownRequests++; totals.inputTokens+=input; totals.outputTokens+=output;
    const reasoning = u?.completion_tokens_details?.reasoning_tokens;
    if (valid(reasoning)) totals.reasoningTokens+=reasoning;
    const hit = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens;
    const miss = u.prompt_cache_miss_tokens ?? (valid(hit) ? input-hit : undefined);
    if (!valid(hit) || !valid(miss) || hit+miss!==input) {totals.cacheUnknownRequests++;continue;}
    totals.cacheKnownRequests++;totals.cacheHitTokens+=hit;totals.cacheMissTokens+=miss;
  }
  const cacheInput = totals.cacheHitTokens+totals.cacheMissTokens;
  return {...totals,cacheHitRate:cacheInput ? totals.cacheHitTokens/cacheInput : null};
}
