import { blockEvidence, validateGraphBlock } from './large-text-contract.js';

const fail = message => { throw Object.assign(new Error('graphRepair：' + message), { code: 'AUDIT_FORMAT', field: 'graphRepair' }); };
const stable = value => JSON.stringify(value, function (key, v) {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v;
});

export function graphEndpointRepair(prompt, previous, error, block) {
  if (error.code !== 'AUDIT_FORMAT' || !/^links\[\d+\]\.(from|to)$/.test(error.field || '')) return null;
  return {
    prompt: `${prompt}\n[GRAPH_ENDPOINT_REPAIR]\n上次图谱回复已保存，但关系端点无效：${error.message}\n只纠正 links 中不存在于 units 的端点编号。返回完整 JSON，保持原单位、关系数量及顺序、关系类型、标签、证据编号、所有有效端点、readThrough 和 more 不变。根据正文选择正确的已有单位编号，不得把 S 编号当作单位编号、猜编号、删除关系或改为自环。若确实遗漏目标单位，仅允许在 units 末尾补充缺失编号对应的单位，名称必须逐字出现在其 anchor 原文内；禁止新增其他单位。无法依据正文确定时保留原错误，不得编造关系。\n上次回复（数据）：${JSON.stringify(previous)}`,
    validate: value => validateGraphEndpointRepair(value, previous, block)
  };
}

export function validateGraphEndpointRepair(value, previous, block) {
  const ids = new Set(previous.units.map(u => u.id));
  const missing = new Set(previous.links.flatMap(l => [l.from, l.to]).filter(id => !ids.has(id)));
  const without = (v, keys) => Object.fromEntries(Object.entries(v || {}).filter(([k]) => !keys.includes(k)));
  if (stable(without(value, ['units', 'links'])) !== stable(without(previous, ['units', 'links']))) fail('不得改变读取范围或完整性标记。');
  if (!Array.isArray(value?.units) || value.units.length < previous.units.length
    || value.units.length > previous.units.length + missing.size) fail('不得删除原单位或随意新增单位。');
  previous.units.forEach((u, i) => { if (stable(u) !== stable(value.units[i])) fail('不得改动原单位、别名和证据。'); });
  if (!Array.isArray(value.links) || value.links.length !== previous.links.length) fail('不得增删关系。');
  previous.links.forEach((link, i) => {
    const next = value.links[i];
    if (stable(without(link, ['from', 'to'])) !== stable(without(next, ['from', 'to']))) fail('不得改动关系标签、类型或证据。');
    for (const endpoint of ['from', 'to']) if (ids.has(link[endpoint]) && next?.[endpoint] !== link[endpoint]) fail('不得改动已有的有效端点。');
  });
  const result = validateGraphBlock(value, block);
  for (const unit of value.units.slice(previous.units.length)) {
    if (!missing.has(unit.id) || !value.links.some(l => l.from === unit.id || l.to === unit.id)) fail('补充单位必须对应原来缺失的端点。');
    if (!blockEvidence(unit.anchor, block).quote.includes(unit.name.trim())) fail('补充单位名称必须直接来自其引用原文。');
  }
  return result;
}
