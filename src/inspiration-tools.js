// All inspiration tools run locally. Keep material generation independent of
// model settings, requests, manuscripts and workflow checkpoints.
export const INSPIRATION_LABELS = Object.freeze({
  names: '名字定制', relationships: '人物关系', personalities: '性格类型', catchphrases: '人物口头禅', memes: '网络热梗'
});

const surnames = '林 陈 叶 沈 苏 顾 江 陆 许 周 程 方 白 夏 柳 秦 宋 唐 韩 乔 温 何 罗 李 吴 张 王 徐 高 余 赵 郑 谢 孟 杜 萧 楚 钟 袁 安'.split(' ');
const givenNames = '宁 安 川 舟 岚 青 远 言 星 月 晴 云 竹 雪 明 秋 南 风 清 禾 小满 小夏 小川 小雨 子安 子宁 子明 子晴 子川 以宁 以安 以晴 书宁 书言 书禾 书远 云川 云舒 云舟 云安 云青 星河 星月 星野 明远 明川 明月 明秋 清和 清秋 清远 清禾 怀安 怀宁 怀远 知秋 知夏 知南 知远 景明 景安 景行 景川 春山 春明 秋平 秋月 亦宁 亦安 亦舟 亦晴'.split(' ');

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
const choose = (items, random) => items[Math.floor(random() * items.length)];

// Existing saved AI results used both strings and {name} objects.
export function inspirationNames(items = []) {
  return [...new Set(items.map(item => typeof item === 'string' ? item.trim() : typeof item?.name === 'string' ? item.name.trim() : '').filter(Boolean))];
}

const relationships = [
  ['亲人', '堂亲', '有共同的家族牵挂，却对家族责任有不同看法。', '亲近'],
  ['朋友', '患难之交', '曾一起渡过难关，愿意托付秘密，但仍各有底线。', '信任'],
  ['师徒', '授业师徒', '前者传授技艺，后者尊重师长，却想走自己的路。', '敬重'],
  ['敌对', '旧怨未解', '因旧事互不信任，在共同危机中又不得不短暂合作。', '对立'],
  ['情人', '相恋未公开', '互相牵挂，却因各自的职责与立场难以公开关系。', '亲密'],
  ['盟友', '利益同盟', '短期目标相同，合作时守约，长远利益却未必一致。', '合作'],
  ['同事', '同门共事', '经常互相补位，也会因资源分配和做事方式争执。', '合作'],
  ['竞争', '亦敌亦友', '争取同一个机会，认可对方实力，却都不愿退让。', '较量'],
  ['恩情', '救命之恩', '前者曾帮助后者脱险，后者想报恩却不愿任人支配。', '感激'],
  ['秘密', '共同知情人', '掌握同一个秘密，既互相保护，也担心对方说漏嘴。', '戒备']
];
const temperaments = [
  ['沉稳型', ['沉着', '耐心', '守信'], '先观察再行动，遇到争执会核对事实'],
  ['热忱型', ['直率', '热心', '勇敢'], '看到不平愿意出头，常先做再解释'],
  ['敏锐型', ['细心', '谨慎', '善察言色'], '擅长发现细节，习惯给自己留退路'],
  ['洒脱型', ['随和', '乐观', '有主见'], '喜欢用玩笑化解尴尬，不轻易被规矩束缚'],
  ['坚定型', ['自律', '执着', '负责'], '认定目标就持续投入，答应的事会做到底'],
  ['温厚型', ['体贴', '宽和', '重情'], '愿意听人诉苦，在小事上照顾同伴'],
  ['独立型', ['果断', '务实', '清醒'], '习惯自己解决困难，做选择时先看代价'],
  ['好奇型', ['好学', '灵活', '大胆'], '喜欢试新办法，面对未知会主动求证'],
  ['内敛型', ['克制', '敏感', '真诚'], '不善表达感情，却会记住别人的需要'],
  ['交际型', ['机敏', '健谈', '圆融'], '擅长建立联系，谈判时会照顾各方体面']
];
const motives = ['渴望被认可', '想守护亲近的人', '想掌握自己的命运', '看重承诺', '珍惜来之不易的安稳', '希望证明自己', '重视公平', '向往自由'];
const weaknesses = ['压力大时容易固执', '不擅长向别人求助', '偶尔把责任全揽在身上', '受到误解会沉默很久', '容易对熟人心软', '失败后会反复自责', '急于见到结果', '不愿让人看见脆弱'];

const catchphrases = [
  ['行吧。', '妥协', '让步或结束争论'], ['说真的。', '认真', '准备说心里话'], ['先别急。', '安抚', '局势紧张时稳住同伴'],
  ['我捋捋。', '思索', '理清混乱线索'], ['这事儿没完。', '警告', '冲突暂时告一段落'], ['得，算我一个。', '爽快', '加入行动'],
  ['有话直说。', '直率', '不愿继续兜圈子'], ['你可拉倒吧。', '吐槽', '熟人之间质疑夸张说法'], ['我就知道。', '无奈', '坏预感得到证实'],
  ['别整这套。', '不耐烦', '拒绝套路或恭维'], ['稳住，我在。', '坚定', '危急时给同伴支持'], ['往好了想。', '乐观', '面对挫折'],
  ['听着就悬。', '怀疑', '讨论不靠谱的计划'], ['咱们走着瞧。', '较劲', '对手挑衅后回应'], ['问题不大。', '自信', '接手棘手任务'],
  ['成，按你说的办。', '信任', '接受同伴的建议'], ['你先听我说完。', '克制', '解释被打断时'], ['别拿自己开玩笑。', '关切', '阻止同伴冒险'],
  ['这不巧了嘛。', '调侃', '偶遇或发现巧合'], ['回头请你吃饭。', '亲近', '感谢熟人帮忙'], ['我欠你一次。', '郑重', '承认受了帮助'],
  ['该说不说。', '犹豫', '承认一个不愿承认的事实'], ['少来。', '熟稔', '识破朋友的讨好'], ['给我留点面子。', '自嘲', '熟人揭短'],
  ['算了，人没事就好。', '释然', '意外过后'], ['谁还没个难处。', '体谅', '面对他人的失误'], ['我心里有数。', '笃定', '回应担忧'],
  ['话别说太满。', '谨慎', '提醒同伴留有余地'], ['别把话说死。', '圆融', '调解矛盾'], ['饭得一口一口吃。', '务实', '劝人耐心推进'],
  ['见鬼，怎么又是你！', '惊恼', '冤家再次相遇'], ['靠，白忙活了！', '恼火', '努力意外落空'], ['他妈的，真够倒霉！', '气愤', '受挫时的情绪爆发'],
  ['狗屁道理。', '不屑', '反驳强词夺理'], ['少扯淡，办正事。', '急躁', '催促伙伴行动'], ['这下可好。', '苦笑', '局面变得更麻烦']
];

// Reference popularity years, not claimed first-use dates or a live ranking.
// Extend this source library as new expressions are curated.
const memes = [
  ['班味', 2024, '形容上班带来的疲惫气息与工作习惯。'], ['水灵灵地', 2024, '调侃某件事就这样自然或出乎意料地发生。'],
  ['那咋了', 2024, '用反问表达坦然、自信或不在意。'], ['city不city', 2024, '调侃某处是否时髦、有都市感。'],
  ['原来你也玩这个', 2024, '发现别人有共同爱好时的惊喜表达。'], ['硬控', 2024, '形容被某事吸引得暂时挪不开注意力。'],
  ['偷感', 2024, '形容做事拘谨、躲闪或不愿被关注的状态。'], ['浓人淡人', 2024, '对比情绪表达强烈和情绪表达平淡的人。'],
  ['已读乱回', 2024, '看过消息后用跳脱或不按常理的方式回应。'], ['抽象', 2024, '形容行为荒诞、难以按常理理解。'],
  ['显眼包', 2023, '调侃特别爱表现或格外引人注意的人。'], ['情绪价值', 2023, '交流中让人感到理解、支持和愉悦的体验。'],
  ['遥遥领先', 2023, '夸张地称赞某项表现领先。'], ['特种兵式旅游', 2023, '短时间内密集赶路、游览多个地点。'],
  ['搭子', 2023, '一起进行某项活动的伙伴。'], ['多巴胺穿搭', 2023, '以明亮色彩营造快乐感的穿衣风格。'],
  ['不是买不起，而是更有性价比', 2023, '用调侃方式解释替代选择。'], ['听劝', 2023, '愿意听取建议并作出调整。'],
  ['主打一个陪伴', 2023, '强调参与和陪伴，有时也用于自我调侃。'], ['尊嘟假嘟', 2023, '以谐音方式表达“真的假的”。'],
  ['泰裤辣', 2023, '以谐音夸赞“太酷啦”。'], ['精神状态领先', 2023, '调侃轻松放飞、不按常规表达的状态。'],
  ['松弛感', 2022, '从容应对局面、不被紧张情绪支配的状态。'], ['嘴替', 2022, '替自己说出心里话的人。'],
  ['栓Q', 2022, '源于 thank you 的谐音，常用于表达无奈。'], ['退退退', 2022, '夸张地表达驱赶烦恼或不愿接近的事。'],
  ['大冤种', 2022, '调侃吃亏受委屈的人，也常用于自嘲。'], ['电子榨菜', 2022, '吃饭时搭配观看的轻松内容。'],
  ['真的会谢', 2022, '表达无语、疲惫或无奈。'], ['拿捏', 2022, '形容掌握技巧或准确把握某种状态。'],
  ['破防了', 2021, '心理防线被触动，可指感动或难以承受。'], ['绝绝子', 2021, '用夸张口气表达赞叹，也可能用于反讽。'],
  ['躺平', 2021, '调侃暂时放下竞争、降低期待的状态。'], ['蚌埠住了', 2021, '“绷不住了”的谐音，表示情绪难以忍住。'],
  ['内卷', 2020, '形容投入不断加码而收益有限的竞争。'], ['打工人', 2020, '劳动者自我认同或自我调侃的称呼。'],
  ['凡尔赛', 2020, '以抱怨或谦虚口吻进行炫耀。'], ['爷青回', 2020, '表达熟悉事物唤起青春回忆。']
];

export function generateInspiration(kind, nameItems = [], { random = Math.random } = {}) {
  if (!Object.hasOwn(INSPIRATION_LABELS, kind)) throw new Error('未知的灵感工具。');
  if (kind === 'names') {
    return shuffle(surnames.flatMap(surname => givenNames.map(name => surname + name)), random).slice(0, 20).map(name => ({ name }));
  }
  if (kind === 'catchphrases') return shuffle(catchphrases, random).slice(0, 10).map(([phrase, tone, context]) => ({ phrase, tone, context }));
  if (kind === 'memes') return shuffle(memes, random).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([phrase, popularYear, meaning]) => ({ phrase, popularYear, meaning }));
  const names = inspirationNames(nameItems);
  if (names.length !== 20) throw new Error('请先在“名字定制”中生成 20 个不同的角色名字。');
  if (kind === 'relationships') {
    const cast = shuffle(names, random), templates = shuffle(relationships, random);
    // A ring guarantees participation by all twenty characters, without
    // duplicate pairs or opposing assertions about the same pair.
    return cast.map((from, index) => {
      const [type, relation, detail, attitude] = templates[index % templates.length];
      return { from, to: cast[(index + 1) % cast.length], type, relation, detail, attitude, strength: choose(['浅', '中', '深'], random) };
    });
  }
  const templates = shuffle(temperaments, random);
  return names.map((name, index) => {
    const [type, traits, description] = templates[index % templates.length];
    return { name, type, traits: [...traits], description: `${description}；${choose(motives, random)}，但${choose(weaknesses, random)}。` };
  });
}

export function formatInspiration(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  if (item.name) return [item.name, item.type, Array.isArray(item.traits) ? item.traits.join('、') : '', item.description].filter(Boolean).join(' · ');
  if (item.phrase) return [item.popularYear ? `${item.popularYear} 年（参考）` : item.firstSeen, item.phrase, item.tone, item.context, item.meaning].filter(Boolean).join(' · ');
  return [`${item.from || ''} → ${item.to || ''}`, item.type, item.relation, item.attitude, item.strength ? `程度：${item.strength}` : '', item.detail || item.description].filter(Boolean).join(' · ');
}
