import { accountCache } from './account-cache.js';
import { initialEnvironment, checkEnvironment, environmentView, environmentDetails } from './environment-client.js';
import './environment.css';
import { downloadCloudBackup } from './cloudflare-backup-client.js';
import { proseWords, legacyProseWords } from './prose-length.js';
import { SCALE_RULES, REQUEST_RULES, numberValue, numeric, booleanValue, effectiveRequest, effectiveScale, effectiveStory, featureEnabled, legacyParameterTask } from './parameters.js';
import { selectGlobal, selectPersonal } from './global-config.js';
import { GlobalConfigClient } from './global-config-client.js';
import { creationFeedback } from './creation-feedback.js';
import { accountCreateView, bindAccountCreate } from './account-create.js';
import { accountListView } from './account-list.js';
import { generateInspiration, inspirationNames, formatInspiration, INSPIRATION_LABELS } from './inspiration-tools.js';
import { thinkingMode } from './ai-thinking.js';
import { creationUsageText } from './creation-usage.js';
import { creationPolicy, officialModel } from './performance-policy.js';
import './styles.css';
import './mobile.css';
import { authPageView, bindAuthCarousel } from './auth-page.js';
import './auth-page.css';
import { createStudio } from './studio-workflow.js';
import { createKeywordClient } from './keyword-library.js';
import { enhanceMobileUI } from './mobile-ui.js';
import { normalizeWorkflow, exportGate, validateReview, validateImportedProject, CHAPTER_CRITERIA, BOOK_CRITERIA, PLAN_FIELDS, fingerprint, chapterReviewEnabled, bookReviewReady, bookReviewHandoffReady, bookSignature, renameBook } from './workflow.js';
import { newGraph, normalizeGraph, GRAPH_TYPES, GRAPH_TYPE_FIELDS } from './knowledge-graph.js';
import { createBackgroundTasks } from './background-tasks.js';
import { zipSync } from 'fflate';
import { get as idbGet } from 'idb-keyval';
import { NovelRepository } from './novel-storage.js';
import { hasLegacyNovel, novelContent, novelKey, novelComparison } from './novel-storage-contract.js';
import { storyBibleView, refreshStoryBible } from './story-bible-ui.js';
import { presetCommonContext, markPresetField, restorePresetImport } from './novel-preset-runtime.js';
import { newNoviceFlow } from './novice-flow.js';
import {emitRevisionEvent,revisionErrorCode,completedRevisionChapters} from './revision-telemetry.js';

const genres = ['都市逆袭', '玄幻升级', '悬疑破案', '重生复仇', '仙侠长生', '末世求生'];
const styles = ['快节奏', '轻松爽文', '细腻克制', '热血燃向', '冷峻悬疑', '温柔治愈'];
const providerPresets = [
  { id: 'deepseek', label: 'DeepSeek', endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', models: ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'] },
  { id: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o', 'o4-mini'] },
  { id: 'qwen', label: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen2.5-72b-instruct'] },
  { id: 'moonshot', label: '月之暗面', endpoint: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'glm', label: '智谱清言', endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', models: ['glm-4-flash', 'glm-4-plus', 'glm-4-air'] },
  { id: 'siliconflow', label: '硅基流动', endpoint: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen2.5-7B-Instruct'] },
  { id: 'openrouter', label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', models: ['openai/gpt-4o-mini', 'deepseek/deepseek-chat-v3-0324', 'google/gemini-2.5-flash'] },
  { id: 'groq', label: 'Groq', endpoint: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', models: ['llama-3.3-70b-versatile', 'llama-4-scout-17b-16e-instruct', 'qwen-qwq-32b'] },
  { id: 'ollama', label: 'Ollama（本地）', endpoint: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b', models: ['qwen2.5:7b', 'llama3.2:latest', 'deepseek-r1:7b'] },
  { id: 'custom', label: '自定义 OpenAI-compatible', endpoint: '', model: '', models: [], custom: true }
];
const defaultAiProfiles = providerPresets.map(profile => ({ ...profile, models: [...(profile.models || [])], apiKey: '' }));
const defaultAiRoles = { planner: 'deepseek', drafter: 'openai', polisher: 'qwen' };
const aiRoleLabels = { planner: '剧情规划', drafter: '章节起草', polisher: '润色校对' };
const defaultSettings = {
  genreEnabled: true,
  coreEnabled: true,
  boundariesEnabled: true,
  scaleEnabled: true,
  chapterReviewEnabled: false,
  growthRule: true,
  antiStupidRule: true
};

const defaultScale = {
  totalChapters: 100,
  wordsPerChapter: 3000,
  characters: 8,
  dailyChapters: 3
};

const defaultHumanization = {
  enabled: true, dialectEnabled: true, selfDeprecatingEnabled: true, catchphrasesEnabled: true, typoEnabled: true, moodEnabled: true,
  dialectRatio: 12,
  selfDeprecatingRatio: 8,
  catchphrases: '行吧、说真的、先这样',
  typoRatio: 1,
  authorMood: 70,
  oralEnabled: true,
  oralRatio: 35,
  sentenceVariationEnabled: true,
  sentenceVariationRatio: 55,
  perplexityEnabled: true,
  perplexityRatio: 35,
  emotionalBurstEnabled: true,
  emotionalBurstRatio: 20,
  thoughtBreakEnabled: true,
  thoughtBreakRatio: 15,
  internetMemeEnabled: false,
  internetMemeRatio: 5,
  internetMemes: '',
  deMechanizationEnabled: true,
  deMechanizationRatio: 70,
  punctuationErrorEnabled: false,
  punctuationErrorRatio: 1,
  connectorDeletionEnabled: false,
  connectorDeletionRatio: 3,
  swearEnabled: false,
  swearRatio: 1,
  regionalDialogueEnabled: true,
  regionalDialogueRatio: 12,
  regionalVocabulary: ''
};

// Humanization controls are deliberately data-driven so legacy projects can be
// merged safely and new controls share the same limits in UI, migration and prompts.
const humanizationControls = [
  { key: 'oral', label: '口语化', description: '让叙述和对白更接近日常表达', max: 100, defaultRatio: 35 },
  { key: 'sentenceVariation', label: '改变句式', description: '交替使用长短句、倒装和不同节奏', max: 100, defaultRatio: 55 },
  { key: 'perplexity', label: '文本困惑度', description: '增加词汇与表达的不确定性，保持语义清楚', max: 100, defaultRatio: 35 },
  { key: 'emotionalBurst', label: '情绪突发性', description: '在关键节点加入突然但有依据的情绪转折', max: 100, defaultRatio: 20 },
  { key: 'thoughtBreak', label: '思考断层感', description: '保留真实思考中的停顿、跳转和未说完', max: 60, defaultRatio: 15 },
  { key: 'internetMeme', label: '网络热梗', description: '仅使用指定词库，避免过时或出戏的梗', max: 20, defaultRatio: 5, textKey: 'internetMemes', placeholder: '可选：破防、绷不住了、这波稳了' },
  { key: 'deMechanization', label: '去机械化', description: '减少模板化开头、重复节奏和同质化过渡', max: 100, defaultRatio: 70 },
  { key: 'punctuationError', label: '故意标点错误', description: '只允许极少量、不影响理解的口语式标点偏差', max: 5, defaultRatio: 1, risky: true },
  { key: 'connectorDeletion', label: '随机删除连接词', description: '适量省略于是、但是、因此等连接词', max: 10, defaultRatio: 3, risky: true },
  { key: 'swear', label: '脏话率', description: '只在人物身份和情境允许时使用，默认关闭', max: 5, defaultRatio: 1, risky: true },
  { key: 'regionalDialogue', label: '对话地区特色词汇', description: '只在对白中使用指定地区的自然表达', max: 40, defaultRatio: 12, textKey: 'regionalVocabulary', placeholder: '可选：东北、粤语、川渝或自定义词汇' }
];

function normalizeHumanization(source = {}) {
  const input = source && typeof source === 'object' ? source : {};
  const config = { ...defaultHumanization, ...input };
  const textValue = (value, fallback = '') => typeof value === 'string'
    ? value.trim().slice(0, 1000)
    : fallback;
  humanizationControls.forEach(control => {
    const enabledKey = `${control.key}Enabled`;
    const ratioKey = `${control.key}Ratio`;
    config[enabledKey] = input[enabledKey] === undefined
      ? Boolean(defaultHumanization[enabledKey])
      : input[enabledKey];
    const value = Number(input[ratioKey] ?? config[ratioKey] ?? control.defaultRatio);
    config[ratioKey] = Number.isFinite(value)
      ? Math.max(0, Math.min(control.max, value))
      : control.defaultRatio;
  });
  config.enabled = input.enabled ?? defaultHumanization.enabled;
  config.dialectEnabled = input.dialectEnabled ?? defaultHumanization.dialectEnabled;
  config.selfDeprecatingEnabled = input.selfDeprecatingEnabled ?? defaultHumanization.selfDeprecatingEnabled;
  config.catchphrasesEnabled = input.catchphrasesEnabled ?? defaultHumanization.catchphrasesEnabled;
  config.typoEnabled = input.typoEnabled ?? defaultHumanization.typoEnabled;
  config.moodEnabled = input.moodEnabled ?? defaultHumanization.moodEnabled;
  config.dialectRatio = Math.max(0, Math.min(40, Number.isFinite(Number(input.dialectRatio)) ? Number(input.dialectRatio) : defaultHumanization.dialectRatio));
  config.selfDeprecatingRatio = Math.max(0, Math.min(40, Number.isFinite(Number(input.selfDeprecatingRatio)) ? Number(input.selfDeprecatingRatio) : defaultHumanization.selfDeprecatingRatio));
  config.typoRatio = Math.max(0, Math.min(5, Number.isFinite(Number(input.typoRatio)) ? Number(input.typoRatio) : defaultHumanization.typoRatio));
  config.authorMood = Math.max(0, Math.min(100, Number.isFinite(Number(input.authorMood)) ? Number(input.authorMood) : defaultHumanization.authorMood));
  config.catchphrases = textValue(input.catchphrases, defaultHumanization.catchphrases);
  config.internetMemes = textValue(input.internetMemes, defaultHumanization.internetMemes);
  config.regionalVocabulary = textValue(input.regionalVocabulary, defaultHumanization.regionalVocabulary);
  return config;
}

const authorOptionSets = {
  genres: [...genres, '职场商战', '科幻末日', '历史架空', '言情情感', '群像成长', '无限流'],
  styles: [...styles, '现实烟火', '诙谐吐槽', '诗性意象', '古典雅致', '纪实冷静'],
  pov: ['第一人称', '第三人称限知', '第三人称全知', '多视角轮换', '书信/日记体'],
  tense: ['现在时', '过去时', '时间跳切', '倒叙插叙', '线性推进'],
  structure: ['三幕结构', '英雄旅程', '单元剧', '群像并行', '倒计时结构', '谜案递进'],
  pacing: ['快节奏推进', '张弛交替', '慢热铺陈', '高密度反转', '日常细节优先'],
  audience: ['大众通俗', '年轻读者', '女性向', '男性向', '全年龄', '严肃文学向'],
  endings: ['圆满收束', '开放式', '余韵留白', '反转结局', '阶段性胜利'],
  conflict: ['外部危机', '人物选择', '身份秘密', '资源争夺', '关系张力', '价值观碰撞'],
  plotGoals: ['完成任务', '查明真相', '关系升级', '能力成长', '资源积累', '阵营洗牌', '守护目标', '逃离困境', '建立秩序', '打破规则'],
  openingHooks: ['危机开场', '问题开场', '动作开场', '秘密开场', '冲突对话', '异常事件', '倒计时开场', '结果先行', '日常切入', '场景奇观'],
  causality: ['因果链清晰', '选择产生代价', '线索可追溯', '行动有反馈', '伏笔有回收', '避免巧合解题', '反派动机闭环', '支线反哺主线'],
  infoReveal: ['渐进揭示', '信息差', '局部真相', '证据拼图', '先果后因', '多次验证', '误导后澄清', '关键节点公开'],
  tension: ['持续上升', '阶梯式升级', '张弛交替', '倒计时加压', '资源递减', '时间压迫', '关系施压', '舆论施压'],
  risk: ['失败有代价', '能力反噬', '关系破裂风险', '身份暴露风险', '资源耗尽风险', '道德两难', '不可逆损失', '连锁后果'],
  foreshadowPlan: ['短线伏笔', '中线伏笔', '长线伏笔', '重复意象', '物品伏笔', '台词伏笔', '环境伏笔', '人物习惯伏笔'],
  reversalPlan: ['小幅反转', '中段反转', '章末反转', '连续反转', '立场反转', '身份反转', '因果反转', '认知反转'],
  revealPace: ['每章给线索', '每三章小揭示', '卷末大揭秘', '真假线索交替', '留白待解', '揭秘后再埋新谜'],
  subplot: ['友情支线', '情感支线', '成长支线', '职业支线', '家族支线', '势力支线', '历史支线', '支线与主线交汇'],
  chapterDensity: ['单章单目标', '单章双目标', '三段式信息', '高密度事件', '低密度铺陈', '场景少而精', '多场景切换', '章末必须推进'],
  sceneObjective: ['获取信息', '做出选择', '完成任务', '制造误会', '改变关系', '展示能力', '付出代价', '留下问题'],
  payoff: ['即时回报', '延迟回报', '情绪回报', '线索回报', '能力回报', '关系回报', '爽点回报', '结局回报'],
  obstacleEscalation: ['增加敌人', '提高门槛', '缩减时间', '减少资源', '扩大影响', '增加误解', '提高代价', '封锁退路'],
  protagonistTraits: ['理性克制', '嘴硬心软', '成长型', '灰度正义', '幽默自嘲', '敏感细腻', '果断强势', '普通人视角'],
  dialogue: ['生活化口语', '短句利落', '含蓄试探', '强冲突对话', '方言点缀', '少对白叙事'],
  contentRating: ['全年龄', '12+', '16+', '18+'],
  enabledRoles: ['超级管理员', '程序员', '主笔作者', '协作作者', '责任编辑', '审稿人']
};

// Local editorial taxonomy distilled from recurring high-praise reader feedback dimensions.
const globalNovelTagGroups = {
  读者口碑: ['口碑爆款', '高完读率', '强追读', '口碑逆袭', '长线耐读', '二刷价值', '讨论度高', '情绪共鸣', '代入感强', '余味悠长'],
  故事体验: ['开局抓人', '节奏紧凑', '慢热渐燃', '张弛有度', '爽点密集', '伏笔回收', '反转合理', '结局圆融', '悬念驱动', '单元精彩'],
  人物魅力: ['主角成长', '角色立体', '配角出彩', '反派有脑', '群像鲜活', '人物反差', '双强对峙', '救赎成长', '关系细腻', '角色弧光'],
  情感关系: ['双向奔赴', '相爱相杀', '并肩作战', '久别重逢', '日久生情', '先婚后爱', '暗恋成真', '宿命羁绊', '师徒羁绊', '家人守护'],
  悬疑推理: ['本格推理', '逻辑严密', '连环谜案', '身份谜团', '时间诡计', '高能反转', '线索拼图', '社会派', '密室谜题', '真相刺痛'],
  奇幻升级: ['升级流', '金手指', '秘境探索', '势力争霸', '热血战斗', '能力代价', '世界观宏大', '神话重构', '种田发育', '冒险成长'],
  都市现实: ['现实质感', '职业细节', '市井烟火', '职场成长', '创业奋斗', '家庭伦理', '社会议题', '小人物逆袭', '城市群像', '现实救赎'],
  历史文化: ['历史考据', '时代洪流', '家国情怀', '权谋博弈', '文化传承', '史诗群像', '乱世求生', '庙堂江湖', '真实事件参考', '风物考据'],
  科幻脑洞: ['硬核设定', '软科幻', '时间循环', '末日生存', '人工智能', '宇宙探索', '赛博朋克', '平行世界', '文明存续', '科技伦理'],
  叙事风格: ['电影感', '细节控', '幽默吐槽', '克制留白', '文笔细腻', '热血燃向', '冷峻压迫', '温暖治愈', '黑色幽默', '诗性表达'],
  结构技法: ['多线叙事', '双线并行', '倒叙插叙', '章节钩子', '首尾呼应', '草蛇灰线', '信息差叙事', '不可靠叙述', '碎片拼图', '视角切换'],
  主题表达: ['自我成长', '自由选择', '正义代价', '亲情羁绊', '友情信任', '爱情救赎', '身份认同', '理想现实', '人性抉择', '希望与重建'],
  章节节奏: ['短章快切', '章章推进', '高密度信息', '日常调剂', '高潮递进', '卷末爆点', '情绪蓄力', '连续追更', '强结尾钩子', '阶段性回报'],
  内容边界: ['正向成长', '因果清晰', '拒绝降智', '尊重常识', '拒绝套路滥用', '原创表达', '不洗白伤害', '情感有边界', '历史结局守护', '价值观稳定']
};

const protagonistMottoLibrary = [
  '命运把我逼到墙角，我就把墙拆了。', '我可以输一次，但不会把自己交出去。', '路再黑，也该由我走到尽头。', '跌倒不是结局，趴着才是。', '我不等天亮，我自己点灯。', '该我扛的事，谁来也替不了。', '今天退半步，明天就会失去整条路。', '怕没关系，往前走就行。', '我不是天生强，只是不想再失去。', '所有看轻我的人，都会看见我的答案。',
  '绝境不是用来认命的，是用来翻盘的。', '我没资格轻易放弃，因为身后还有人。', '既然没有退路，那就把前路杀出来。', '输赢在后，先把这一口气争回来。', '我宁愿遍体鳞伤，也不愿原地等死。', '别人给的路太窄，我自己开一条。', '我可以被打倒，但不能被定义。', '既然选择了，就别让自己后悔。', '这一次，我不替命运低头。', '再难的局，也总有一处能落子。',
  '我不求所有人理解，只求自己问心无愧。', '能救的人，我一个也不想放手。', '真相再重，也压不垮想站起来的人。', '今天的我，得替昨天的我讨个说法。', '伤疤不是弱点，是我活下来的证据。', '我不怕代价，我怕代价白付。', '他们要我认输，我偏要把名字写在最后。', '把牙咬碎，也不能把希望咽下去。', '我来这里，不是为了当背景。', '所有失去，都该换回更大的勇气。',
  '我不需要谁赦免，我自己会走出来。', '有些门没人替我开，那我就撞开。', '我愿意相信人，但不会把命交给运气。', '只要还能站着，故事就没结束。', '风越大，越该把旗举稳。', '我不是为了赢谁，我是为了不再失去自己。', '再给我一次机会，我会把遗憾改成路。', '最难的那一步，我自己来。', '别急着替我下结论，我还没出牌。', '我会怕，但我不会退。',
  '世界不讲道理，我就把道理做出来。', '每一次选择，都是我亲手写下的名字。', '不必等谁来救，我也能成为援手。', '我守不住所有人，但会拼命守住眼前人。', '破局的人，往往是最后一个放弃的人。', '我曾经一无所有，所以更知道该珍惜什么。', '如果规则不公，那我就找到它的漏洞。', '真正的强大，是明知会痛也敢向前。', '我不是奇迹，我是一次次没放弃。', '前面是深渊，那就把深渊走成桥。',
  '该结束的不是我，是困住我的恐惧。', '我不借谁的光，我自己就是火种。', '今天受的伤，明天都会变成盔甲。', '再小的人，也能把自己的天撑起来。', '我选的路，再苦也要走出个结果。', '命运想让我沉下去，我偏要浮上来。', '别问我敢不敢，先看我会不会退。', '我不需要完美，我只需要继续。', '这一局还没完，我也还没完。', '我会带着所有人的期待，走到最后。'
];

const plotTagGroups = {
  推进类型: ['普通推进', '铺垫章节', '过渡章节', '日常章节', '任务章节', '支线推进', '关系推进', '成长节点', '资源积累', '目标确认', '行动准备', '阶段收束', '新地图开启', '时间跳跃', '多线并进'],
  高潮强度: ['高潮章节', '小高潮', '大高潮', '终局高潮', '连续高潮', '情绪爆发', '战斗爆发', '关系爆发', '危机升级', '绝境反击', '关键抉择', '不可逆行动', '代价兑现', '胜负揭晓', '余波回落'],
  悬念反转: ['悬念埋设', '悬念加深', '悬念回收', '反转章节', '二次反转', '身份反转', '立场反转', '因果反转', '时间反转', '信息差反转', '假线索', '真线索', '误导读者', '倒计时', '未知威胁'],
  秘密揭秘: ['揭秘章节', '身世揭秘', '能力揭秘', '规则揭秘', '组织揭秘', '幕后揭秘', '历史揭秘', '地点揭秘', '物品揭秘', '动机揭秘', '证据出现', '证词冲突', '真相拼图', '秘密代价', '留白待解'],
  情绪色彩: ['搞笑章节', '轻松日常', '温情治愈', '暧昧拉扯', '甜蜜互动', '虐心低谷', '孤独压迫', '愤怒复仇', '恐惧惊悚', '热血燃向', '悲喜交织', '克制隐忍', '释然和解', '浪漫氛围', '冷幽默'],
  场景任务: ['初次见面', '重逢见面', '谈判交涉', '秘密调查', '跟踪监视', '逃亡追逐', '潜入行动', '公开对峙', '团队集结', '临时合作', '分道扬镳', '救援行动', '竞赛挑战', '审判审讯', '庆功收尾'],
  人物变化: ['主角觉醒', '主角受挫', '主角升级', '主角犯错', '主角补偿', '配角登场', '配角牺牲', '反派亮相', '反派试探', '盟友背叛', '敌人合作', '关系确认', '关系破裂', '价值观冲突', '传承交接'],
  世界观信息: ['新规则', '规则漏洞', '能力限制', '能力代价', '势力格局', '阶层冲突', '地域风俗', '职业细节', '科技设定', '超自然设定', '历史背景', '神话传说', '社会制度', '资源体系', '世界边界'],
  叙事技法: ['倒叙开场', '插叙补充', '双线并行', '多视角', '书信日记', '不可靠叙述', '镜像场景', '重复意象', '首尾呼应', '细节伏笔', '对照蒙太奇', '留白结尾', '开放结局', '章节钩子', '一句话收束'],
  内容标签: ['成长', '复仇', '救赎', '守护', '选择', '自由', '亲情', '友情', '爱情', '信任', '背叛', '责任', '牺牲', '希望', '真相'],
  节奏控制: ['短章快切', '长段铺陈', '三段递进', '先抑后扬', '先扬后抑', '张弛交替', '慢热蓄力', '密集信息', '动作优先', '对白优先', '环境优先', '心理优先', '结尾留钩', '中段加速', '末段留白'],
  章节功能: ['开篇抓人', '承接上章', '制造误会', '推动任务', '交付线索', '交换情报', '制造阻碍', '展示能力', '展示代价', '强化目标', '拆分队伍', '重组阵营', '设置门槛', '完成试炼', '承上启下'],
  读者体验: ['爽点兑现', '爽点蓄力', '情绪补偿', '代入增强', '期待拉升', '紧张拉升', '安全感', '失控感', '反差感', '新鲜感', '共鸣感', '心疼角色', '满足感', '余味悠长', '追读钩子'],
  关系走向: ['关系升温', '关系降温', '互相试探', '单向信任', '双向信任', '秘密共享', '利益绑定', '情感亏欠', '误会加深', '误会解除', '承诺建立', '承诺违背', '短暂告别', '正式告白', '并肩作战'],
  冲突手段: ['言语交锋', '利益交换', '道德选择', '资源封锁', '舆论压力', '时间压力', '身份压制', '规则约束', '环境灾害', '误伤牵连', '内部争执', '外部围剿', '心理博弈', '公开挑战', '孤注一掷'],
  线索形态: ['物证线索', '口供线索', '书面线索', '影像线索', '梦境线索', '身体线索', '环境线索', '数字线索', '声音线索', '气味线索', '旧物线索', '缺失线索', '矛盾线索', '重复线索', '伪造线索'],
  主题深化: ['代际创伤', '身份认同', '个人与集体', '秩序与自由', '技术伦理', '人与自然', '记忆与遗忘', '时间与因果', '贫富差距', '职业尊严', '家庭责任', '故乡与远方', '理想与现实', '真相与谎言', '牺牲与回报'],
  章节视角: ['主角视角', '配角视角', '反派视角', '旁观者视角', '群像视角', '限知视角', '全知视角', '双人视角', '书信视角', '记录视角', '回忆视角', '梦境视角', '新闻视角', '审讯视角', '直播视角'],
  场景质感: ['烟火市井', '冷雨压城', '盛夏闷热', '冬夜寂静', '霓虹喧嚣', '荒野空旷', '密闭压迫', '开阔壮阔', '古朴庄严', '科技冷感', '诡异失真', '温柔明亮', '尘土粗粝', '潮湿阴暗', '节庆热烈'],
  结尾方式: ['动作中断', '信息中断', '情绪中断', '新人物出现', '新地点出现', '新规则出现', '一句反问', '一句警告', '一句承诺', '物品特写', '远景收束', '时间跳切', '梦醒转场', '结果留白', '下章预告']
};
const plotTagOptions = Object.values(plotTagGroups).flat();

const plotPresets = {
  ordinary: ['普通推进', '日常章节', '关系推进', '成长节点', '细节伏笔', '结尾留钩'],
  climax: ['高潮章节', '危机升级', '关键抉择', '绝境反击', '情绪爆发', '不可逆行动'],
  comedy: ['搞笑章节', '轻松日常', '冷幽默', '临时合作', '对白优先', '悲喜交织'],
  reversal: ['反转章节', '二次反转', '信息差反转', '假线索', '真线索', '章节钩子'],
  reveal: ['揭秘章节', '真相拼图', '证据出现', '规则揭秘', '秘密代价', '留白待解']
};

const defaultAuthorSettings = {
  genres: ['都市逆袭'], styles: ['快节奏'], pov: ['第三人称限知'], tense: ['线性推进'],
  structure: ['三幕结构'], pacing: ['快节奏推进'], audience: ['大众通俗'], endings: ['阶段性胜利'],
  conflict: ['外部危机', '人物选择'], plotGoals: ['查明真相', '关系升级'], openingHooks: ['危机开场', '异常事件'], causality: ['因果链清晰', '选择产生代价'], infoReveal: ['渐进揭示', '证据拼图'], tension: ['持续上升', '张弛交替'], risk: ['失败有代价', '道德两难'], foreshadowPlan: ['短线伏笔', '长线伏笔'], reversalPlan: ['章末反转'], revealPace: ['每章给线索', '卷末大揭秘'], subplot: ['成长支线', '职业支线'], chapterDensity: ['单章单目标', '章末必须推进'], sceneObjective: ['做出选择', '留下问题'], payoff: ['延迟回报', '线索回报'], obstacleEscalation: ['提高门槛', '封锁退路'], protagonistTraits: ['普通人视角', '成长型'], dialogue: ['生活化口语'],
  contentRating: ['全年龄'], protagonistName: '林夜', protagonistGoal: '查清旧表的来历并保护重要的人',
  worldSetting: '当代旧城区，时间暂停能力遵循明确代价与限制。', coreTheme: '人在极端环境中仍保留选择的权利。',
  characterRoster: '林夜：外卖员，谨慎但愿意承担责任；神秘老人：旧表的前任持有者。',
  characterSlots: ['主角', '核心配角', '反派', '导师', '盟友'],
  characterRelationTypes: ['利益合作', '秘密牵连', '亦敌亦友'],
  supportingCharacters: '神秘老人：旧表前任持有者；周叔：旧城区修表匠；苏禾：记者，追查时间实验。',
  relationshipMap: '林夜 ↔ 神秘老人：互相利用；林夜 ↔ 苏禾：从猜疑到并肩；林夜 ↔ 周叔：师徒般的信任。',
  timeSetting: '当代雨夜；故事覆盖三个月，关键线索按倒计时推进。',
  plotElements: ['能力获得', '线索追查', '关系成长'],
  mainline: '林夜追查旧表来历，并在一次次暂停时间的选择中守护身边的人。',
  hiddenLine: '旧表其实是某个时间实验的残留物，幕后组织正在寻找新的持有者。',
  contentTags: ['成长', '悬疑', '守护', '选择'],
  globalNovelTags: ['口碑爆款', '高完读率', '开局抓人', '节奏紧凑', '主角成长', '伏笔回收', '反转合理', '因果清晰'],
  customGlobalNovelTags: '',
  protagonistMottos: ['命运把我逼到墙角，我就把墙拆了。', '我不等天亮，我自己点灯。'],
  customProtagonistMottos: '',
  historicalReferenceEnabled: false,
  historicalPeriod: '',
  historicalEvents: '',
  historicalCanonNotes: '涉及真实历史时，核对事件、人物、时间与结局；允许补写未记载的对话和生活细节，不改写已知历史结果。',
  featureToggles: {
    genres: true, styles: true, pov: true, tense: true, audience: true, contentRating: true,
    structure: true, pacing: true, conflict: true, plotGoals: true, openingHooks: true, causality: true, infoReveal: true, tension: true, risk: true, foreshadowPlan: true, reversalPlan: true, revealPace: true, subplot: true, chapterDensity: true, sceneObjective: true, payoff: true, obstacleEscalation: true, endings: true, protagonist: true, protagonistTraits: true, dialogue: true, characters: true,
    relations: true, world: true, theme: true, time: true, plotElements: true, mainline: true,
    hiddenLine: true, contentTags: true, globalNovelTags: true, protagonistMottos: true, humanization: true, historicalReference: false
  },
  aiCoAuthor: true, consistencyGuard: true, autoSceneCards: true, preserveAuthorVoice: true
};

const defaultPlotSettings = {
  selectedTags: [...plotPresets.ordinary], activePreset: 'ordinary',
  enableTags: true, enableChapterFunctions: true, enableReaderExperience: true,
  enableConflict: true, enablePacing: true, enableNarrativeTechnique: true,
  enableRelationships: true, enableWorldInfo: true
};
const defaultProgrammerSettings = {
  deepThinking: false, autoSave: true, localDemo: true, safeMode: true, requestCache: false, requestTimeout: 180,
  maxConcurrent: 2, temperature: 0.75, maxTokens: 3000, retryCount: 2, streamOutput: true,
  logRequests: false, redactPrompts: true, failoverEnabled: true, outputValidation: true
};

const defaultAdminSettings = {
  workspaceName: 'BookWorm 工作区', enabledRoles: [...authorOptionSets.enabledRoles],
  allowInvite: false, requireReview: true, auditLog: false, backupEnabled: true,
  retentionDays: 90, allowExternalProviders: false, allowAdultContent: false,
  allowExport: true, allowOwnProjectDelete: true, allowProjectDelete: false, maintenanceMode: false, auditEntries: []
};
const defaultUsers = [{ id: 'user-system-admin', name: '系统管理员', role: 'system_admin', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }];
const defaultGlobalAssist = { programmerConfirmed: true, adminConfirmed: true, programmerSavedAt: '', adminSavedAt: '' };

const state = {
  entryMode: '',
  noviceSetup: { genre: '', wordCount: 3000, chapterCount: defaultScale.totalChapters, protagonistName: '', protagonistGender: '未指定', tags: '', premise: '' },
  noviceFlow: newNoviceFlow(),
  activeTab: 'studio',
  selectedGenre: '',
  selectedStyle: '',
  selectedChapter: null,
  storyIdea: '',
  generated: false,
  aiProvider: 'DeepSeek',
  aiModel: 'deepseek-chat',
  aiBaseUrl: 'https://api.deepseek.com',
  aiKey: '',
  envAiConfigured: false,
  activeAiProfile: 'deepseek',
  aiProfiles: defaultAiProfiles.map(profile => ({ ...profile })),
  aiRoles: { ...defaultAiRoles },
  draft: '',
  drafts: {},
  chapters: [],
  exportFormat: 'txt',
  generating: false,
  settings: { ...defaultSettings },
  scale: { ...defaultScale },
  outline: [],
  humanization: { ...defaultHumanization },
  settingsRole: 'author',
  authorSettings: { ...defaultAuthorSettings, genres: [], styles: [], protagonistName: '', protagonistGoal: '', worldSetting: '', coreTheme: '', characterRoster: '', supportingCharacters: '', relationshipMap: '', timeSetting: '', mainline: '', hiddenLine: '', contentTags: [], globalNovelTags: [], protagonistMottos: [] },
  plotSettings: { ...defaultPlotSettings },
  graph: newGraph(),
  books: [],
  activeBookId: 'book-1',
  sidebarCollapsed: false,
  bookMenu: false,
  programmerSettings: { ...defaultProgrammerSettings },
  adminSettings: { ...defaultAdminSettings },
  users: defaultUsers.map(user => ({ ...user })),
  currentUserId: defaultUsers[0].id,
  debugMode: true,
  worksPage: 1,
  globalAssist: { ...defaultGlobalAssist },
  garbageFiles: [],
  keywordLibrary: [],
  notifications: [],
  systemHealth: { status: 'idle', checkedAt: '', message: '' },
  systemLogSummary: { count: 0, totalBytes: 0, loggingEnabled: false },
  mottoLibraryOpen: false,
  toast: ''
};

const pristineAccountState = structuredClone(state);
const configClient = new GlobalConfigClient({state,user:()=>authState.user,notify:message=>showToast(message)});
const STORAGE_KEY = 'novelforge-project-v1';
const AI_KEY_STORAGE_PREFIX = 'novelforge-ai-key-v1:';
const AI_TEST_STORAGE_KEY = 'novelforge-ai-tests-v1';
const IDB_STORAGE_KEY = 'novelforge-project-v1';
const PREFERENCES_KEY = 'novelforge-preferences-v1';
const novelRepository = new NovelRepository();
const legacyWorkspaces = [];
let browserPreferences = {};
let databaseMessage = '';
let databaseConflict = false;
const aiKeyStorageErrors = new Map();
const unsavedAiKeys = new Set();
const aiProfileTests = new Map();
const aiRoleTests = new Map();
const aiTestFeedback = new Map();
const aiTestsInFlight = new Set();
let aiRegistryVersion = null;
let globalAiRoles = {};
const managedBookSelection = new Set();
let storageStatus = { saved: true, message: '' };
let idbSaveTimer = null;
let idbWriteSequence = 0;
let worksRefreshInFlight = null;
const revisionSaveWaiters=[];
function settleRevisionSaves(sequence,error){
  for(let i=revisionSaveWaiters.length-1;i>=0;i--)if(revisionSaveWaiters[i].sequence<=sequence){
    const waiter=revisionSaveWaiters.splice(i,1)[0];clearTimeout(waiter.timer);error?waiter.reject(error):waiter.resolve();
  }
}
function persistRevision(){
  if(!storageReady)return Promise.reject(new Error('Workspace storage not ready'));
  if (!persist(true)) return Promise.reject(new Error('小说数据库未连接或保存尚未开始。'));
  if (storageStatus.saved) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const sequence=idbWriteSequence;
    const timer=setTimeout(()=>settleRevisionSaves(sequence,new Error('Workspace save timeout')),90000);
    revisionSaveWaiters.push({sequence,resolve,reject,timer});
  });
}
let storageReady = false;
const authState = { loading: true, user: null, bootstrapRequired: false, register: false, error: '', form: {}, pending: false };
// Authenticate before reading any browser cache. A failed account request must
// never turn cached state into an administrator session.
try {
  const response = await fetch('/api/auth/status', { cache:'no-store', credentials:'same-origin' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '账户服务不可用，请重试。');
  authState.user = body.user || null; authState.bootstrapRequired = body.bootstrapRequired === true;
} catch (error) { authState.error = error.message || '账户服务不可用，请重试。'; }
const authenticatedAccountId = authState.user?.id || '';
let environment = initialEnvironment(authState.user?.group === 'system_admin');
let environmentRepair = false;
let environmentController;
let accountSessionChanged = false;
const unavailableStorage = { getItem(){return null;},setItem(){throw new Error('Browser storage unavailable');},removeItem(){} };
let browserStorage; try { browserStorage = globalThis.localStorage; } catch { browserStorage = unavailableStorage; }
const accountLocalStorage = accountCache(authState.user, browserStorage);
function invalidateAccountSession() {
  environmentController?.abort();
  accountSessionChanged = true; storageReady = false; clearTimeout(idbSaveTimer);
  state.activeTab = 'session-ended';
  ++idbWriteSequence; novelRepository.ready = false;
  settleRevisionSaves(idbWriteSequence, new Error('账户会话已切换，旧页面不会保存到其他账户。'));
  render();
}
function announceAccountSession(id) {
  try { browserStorage.setItem('bookworm-session-change-v1',JSON.stringify({id,nonce:crypto.randomUUID()})); } catch {}
}
window.addEventListener('storage', event => {
  if (event.key !== 'bookworm-session-change-v1') return;
  try { if (JSON.parse(event.newValue).id !== authenticatedAccountId) invalidateAccountSession(); } catch {}
});
const accountFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  const api = url.origin === location.origin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth');
  if (api && authenticatedAccountId) {
    const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-nf-account-id',authenticatedAccountId); options = {...options,headers};
  }
  const response = await accountFetch(input, options);
  if (response.headers.get('x-nf-account-changed') === '1') invalidateAccountSession();
  return response;
};

let authCarouselCleanup = null;
const floatingTools = { open: false, noteVisible: true, loading: '', names: [], relationships: [], personalities: [], catchphrases: [], memes: [], updatedAt: '' };
try { const savedFloating = JSON.parse(accountLocalStorage.getItem('novelforge-floating-ai-v1') || '{}'); ['names','relationships','personalities','catchphrases','memes'].forEach(key => { if (Array.isArray(savedFloating[key])) floatingTools[key] = savedFloating[key].slice(0, 30); }); floatingTools.noteVisible = savedFloating.noteVisible !== false; floatingTools.updatedAt = savedFloating.updatedAt || ''; } catch {}
let lastPublicationSnapshot = null;
let legacyAiKey = '';
let legacyAiProfileId = '';
// Versions before profile-scoped credential storage kept apiKey directly on
// each saved profile.  Hold those values only in memory long enough to migrate
// them into the dedicated browser key slots; they are never written back to
// the project snapshot.
const legacyProfileKeys = new Map();
try {
  const saved = JSON.parse(accountLocalStorage.getItem(STORAGE_KEY) || '{}');
  if (Object.keys(saved).length) legacyWorkspaces.push(structuredClone(saved));
  legacyAiKey = typeof saved.aiKey === 'string' ? saved.aiKey.trim() : '';
  legacyAiProfileId = typeof saved.activeAiProfile === 'string' ? saved.activeAiProfile : '';
  if (Array.isArray(saved.aiProfiles)) {
    saved.aiProfiles.forEach(profile => {
      if (profile && typeof profile.id === 'string' && typeof profile.apiKey === 'string' && profile.apiKey.trim()) {
        legacyProfileKeys.set(profile.id, profile.apiKey.trim());
      }
    });
  }
Object.assign(state, saved, { aiKey: '' });
} catch { /* use defaults when local storage is unavailable */ }
try {
  const savedTests = JSON.parse(accountLocalStorage.getItem(AI_TEST_STORAGE_KEY) || '{}');
  Object.entries(savedTests.profiles || {}).forEach(([id, signature]) => { if (typeof signature === 'string') aiProfileTests.set(id, signature); });
  Object.entries(savedTests.roles || {}).forEach(([role, signature]) => { if (typeof signature === 'string') aiRoleTests.set(role, signature); });
} catch { /* tests can be repeated if browser storage is unavailable */ }

try { browserPreferences = JSON.parse(accountLocalStorage.getItem(PREFERENCES_KEY) || '{}'); Object.assign(state, browserPreferences); } catch {}

// Older workspaces may still use a single draft. Keep user text, but never
// recreate the bundled demonstration manuscript when data is missing.
if (!Array.isArray(state.chapters)) state.chapters = [];
if (!state.drafts || typeof state.drafts !== 'object') state.drafts = state.draft ? { 1: state.draft } : {};
if (!Object.hasOwn(state.drafts, 1) && state.draft) state.drafts[1] = state.draft;
state.settings = { ...defaultSettings, ...(state.settings || {}) };
state.scale = { ...defaultScale, ...(state.scale || {}) };
if (!Array.isArray(state.outline)) state.outline = [];
state.humanization = normalizeHumanization(state.humanization);
state.authorSettings = { ...defaultAuthorSettings, ...(state.authorSettings || {}) };
state.plotSettings = { ...defaultPlotSettings, ...(state.plotSettings || {}) };
state.graph = normalizeGraph(state.graph);
delete state.review; // Legacy scores were simulated; never migrate them as approvals.
state.authorSettings.featureToggles = { ...defaultAuthorSettings.featureToggles, ...(state.authorSettings.featureToggles || {}) };
state.authorSettings.globalNovelTags = Array.isArray(state.authorSettings.globalNovelTags) ? state.authorSettings.globalNovelTags : [...defaultAuthorSettings.globalNovelTags];
state.authorSettings.protagonistMottos = Array.isArray(state.authorSettings.protagonistMottos) ? state.authorSettings.protagonistMottos : [...defaultAuthorSettings.protagonistMottos];
state.programmerSettings = effectiveRequest({ ...defaultProgrammerSettings, ...(state.programmerSettings || {}) });
state.programmerSettings.requestTimeout = numberValue(state.programmerSettings.requestTimeout, REQUEST_RULES.requestTimeout);
// Streaming is protocol-level behavior. Persisted legacy switches cannot turn
// it off because every model invocation must use the streaming transport.
state.programmerSettings.streamOutput = true;
state.adminSettings = { ...defaultAdminSettings, ...(state.adminSettings || {}) };
state.globalAssist = { ...defaultGlobalAssist, ...(state.globalAssist || {}) };
state.notifications = Array.isArray(state.notifications) ? state.notifications : [];
state.debugMode = state.debugMode !== false;
state.users = Array.isArray(state.users) && state.users.length
  ? state.users.filter(user => user && typeof user === 'object' && String(user.id || '').trim()).map(user => ({
      id: String(user.id), name: String(user.name || '未命名用户').trim() || '未命名用户', role: user.role === 'system_admin' ? 'system_admin' : 'user', status: user.status === 'disabled' ? 'disabled' : 'active', createdAt: user.createdAt || new Date().toISOString()
    }))
  : defaultUsers.map(user => ({ ...user }));
if (!state.users.some(user => user.role === 'system_admin')) state.users.unshift({ ...defaultUsers[0], createdAt: new Date().toISOString() });
if (!state.users.some(user => user.id === state.currentUserId && user.status !== 'disabled')) state.currentUserId = state.users.find(user => user.role === 'system_admin' && user.status !== 'disabled')?.id || state.users[0].id;
state.garbageFiles = Array.isArray(state.garbageFiles) ? state.garbageFiles.filter(file => typeof file === 'string') : [];
state.keywordLibrary = Array.isArray(state.keywordLibrary) ? state.keywordLibrary.filter(item => item && typeof item.source === 'string') : [];
state.systemHealth = { status: 'idle', checkedAt: '', message: '', ...(state.systemHealth || {}) };
if (!Array.isArray(state.adminSettings.auditEntries)) state.adminSettings.auditEntries = [];
Object.keys(defaultAuthorSettings).forEach(key => {
  if (Array.isArray(defaultAuthorSettings[key])) state.authorSettings[key] = Array.isArray(state.authorSettings[key]) ? state.authorSettings[key] : [...defaultAuthorSettings[key]];
});
state.authorSettings.genres = state.authorSettings.genres.length ? state.authorSettings.genres : state.selectedGenre ? [state.selectedGenre] : [];
state.authorSettings.styles = state.authorSettings.styles.length ? state.authorSettings.styles : state.selectedStyle ? [state.selectedStyle] : [];
state.selectedGenre = state.authorSettings.genres[0];
state.selectedStyle = state.authorSettings.styles[0];
const storedAiProfiles = Array.isArray(state.aiProfiles) ? state.aiProfiles : [];
state.deletedAiProfiles = Array.isArray(state.deletedAiProfiles) ? state.deletedAiProfiles.filter(id => typeof id === 'string') : [];
const profileMap = new Map(defaultAiProfiles.filter(profile => !state.deletedAiProfiles.includes(profile.id)).map(profile => [profile.id, { ...profile, models: [...(profile.models || [])] }]));
storedAiProfiles.forEach(profile => {
  if (!profile || typeof profile !== 'object' || !String(profile.id || '').trim() || state.deletedAiProfiles.includes(profile.id)) return;
  const base = profileMap.get(profile.id) || { id: String(profile.id), label: String(profile.label || profile.id), endpoint: '', model: '', models: [], custom: true, apiKey: '' };
  profileMap.set(profile.id, { ...base, ...profile, models: Array.isArray(profile.models) ? profile.models.filter(model => typeof model === 'string' && model.trim()) : base.models });
});
state.aiProfiles = [...profileMap.values()].map(profile => {
  let apiKey = '';
  try {
    apiKey = accountLocalStorage.getItem(`${AI_KEY_STORAGE_PREFIX}${profile.id}`) || '';
    if (!apiKey && legacyProfileKeys.has(profile.id)) {
      apiKey = legacyProfileKeys.get(profile.id);
      try { accountLocalStorage.setItem(`${AI_KEY_STORAGE_PREFIX}${profile.id}`, apiKey); }
      catch { aiKeyStorageErrors.set(profile.id, '旧版本 Key 已恢复到当前页面，但浏览器存储失败；请点击“保存 Key”重试。'); unsavedAiKeys.add(profile.id); }
    }
  }
  catch { aiKeyStorageErrors.set(profile.id, '浏览器中的 Key 暂时无法读取，请检查浏览器存储权限。'); }
  return { ...profile, apiKey };
});
legacyProfileKeys.clear();
// Migrate credentials stored by older versions before project persistence excluded them.
if (legacyAiKey) {
  const legacyProfile = state.aiProfiles.find(profile => profile.id === legacyAiProfileId) || state.aiProfiles[0];
  if (legacyProfile && !legacyProfile.apiKey) {
    legacyProfile.apiKey = legacyAiKey;
    try {
      accountLocalStorage.setItem(`${AI_KEY_STORAGE_PREFIX}${legacyProfile.id}`, legacyAiKey);
      legacyAiKey = '';
    } catch {
      aiKeyStorageErrors.set(legacyProfile.id, '旧版本 Key 已恢复到当前页面，但浏览器存储失败；请点击“保存 Key”重试。');
      unsavedAiKeys.add(legacyProfile.id);
    }
  }
}
state.aiRoles = { ...defaultAiRoles, ...(state.aiRoles || {}) };
Object.keys(state.aiRoles).forEach(role => {
  if (!state.aiProfiles.some(profile => profile.id === state.aiRoles[role])) state.aiRoles[role] = state.aiProfiles.find(p => p.id === defaultAiRoles[role])?.id || state.aiProfiles[0]?.id || '';
});
const migratedProfile = state.aiProfiles.find(profile => profile.id === state.activeAiProfile) || state.aiProfiles[0];
if (migratedProfile) {
  state.activeAiProfile = migratedProfile.id;
  state.aiProvider = migratedProfile.label;
  state.aiModel = migratedProfile.model;
  state.aiBaseUrl = migratedProfile.endpoint;
  state.aiKey = migratedProfile.apiKey;
}
// Older test-state signatures embedded the credential in a JSON tuple.  Move
// them to the non-reversible local fingerprint without invalidating an already
// verified profile/role.  Project snapshots never contain either form.
let aiTestSignatureMigrated = false;
const migrateAiTestSignature = (map, id, profile) => {
  const legacy = map.get(id);
  if (!legacy || !profile) return;
  const parts = [normalizeAiEndpoint(profile.endpoint), profile.model || '', profile.apiKey || '', Boolean(profile.custom)];
  if (legacy === JSON.stringify(parts)) {
    map.set(id, fingerprint(parts));
    aiTestSignatureMigrated = true;
  }
};
state.aiProfiles.forEach(profile => migrateAiTestSignature(aiProfileTests, profile.id, profile));
Object.keys(aiRoleLabels).forEach(role => migrateAiTestSignature(aiRoleTests, role, roleAiProfile(role)));
if (aiTestSignatureMigrated) persistAiTests();
delete state.draft;
function projectSnapshot() {
  return {
    entryMode: state.entryMode, noviceSetup: state.noviceSetup, noviceFlow: state.noviceFlow,
    storyIdea: state.storyIdea, drafts: state.drafts, chapters: state.chapters, outline: state.outline,
    scale: state.scale, humanization: state.humanization, settings: state.settings,
    authorSettings: state.authorSettings, plotSettings: state.plotSettings,
    graph: state.graph,
    selectedChapter: state.selectedChapter, selectedGenre: state.selectedGenre, selectedStyle: state.selectedStyle,
    exportFormat: state.exportFormat, workflow: state.workflow
  };
}

function saveActiveBook() {
  const book = state.books.find(item => item.id === state.activeBookId);
  if (!book) return;
  Object.assign(book, projectSnapshot(), { updatedAt: new Date().toISOString() });
}

function applyBook(book) {
  if (!book) return;
  Object.assign(state, {
    entryMode: book.entryMode === undefined ? 'expert' : book.entryMode, noviceSetup: { ...(book.noviceSetup || {}) },
    storyIdea: book.storyIdea || '', drafts: book.drafts || {}, workflow: book.workflow || null, noviceFlow: book.noviceFlow ? { ...newNoviceFlow(), ...book.noviceFlow } : (book.chapters?.length ? null : newNoviceFlow()),
    chapters: Array.isArray(book.chapters) ? book.chapters : [],
    outline: Array.isArray(book.outline) ? book.outline : [], scale: { ...defaultScale, ...(book.scale || {}) },
    humanization: normalizeHumanization(book.humanization), settings: { ...defaultSettings, ...(book.settings || {}) },
    authorSettings: { ...defaultAuthorSettings, ...(book.authorSettings || {}) }, plotSettings: { ...defaultPlotSettings, ...(book.plotSettings || {}) },
    graph: normalizeGraph(book.graph),
    selectedChapter: book.selectedChapter || 1,
    selectedGenre: book.selectedGenre ?? book.authorSettings?.genres?.[0] ?? '', selectedStyle: book.selectedStyle ?? book.authorSettings?.styles?.[0] ?? '', exportFormat: book.exportFormat || 'txt'
  });
  state.authorSettings.featureToggles = { ...defaultAuthorSettings.featureToggles, ...(state.authorSettings.featureToggles || {}) };
  state.plotSettings = { ...defaultPlotSettings, ...(state.plotSettings || {}) };
  normalizeWorkflow(state);
}

function blankAuthorSettings() {
  const settings = JSON.parse(JSON.stringify(defaultAuthorSettings));
  for (const key of ['protagonistName', 'protagonistGoal', 'worldSetting', 'coreTheme', 'supportingCharacters', 'relationshipMap', 'timeSetting', 'mainline', 'hiddenLine', 'characterRoster', 'hardConstraints']) settings[key] = '';
  for (const key of ['genres', 'styles', 'conflict', 'plotElements', 'contentTags', 'endings']) settings[key] = [];
  settings.protagonistMottos = [];
  settings.globalNovelTags = [];
  settings.historicalPeriod = '';
  settings.historicalEvents = '';
  return settings;
}

function ensureBooks() {
  if (!Array.isArray(state.books) || !state.books.length) {
    const legacyHasProject = Boolean(String(state.storyIdea || '').trim() || Object.keys(state.drafts || {}).length || state.chapters?.length || state.outline?.length);
    const snapshot = projectSnapshot();
    if (!legacyHasProject) Object.assign(snapshot, { authorSettings: blankAuthorSettings(), storyIdea: '', drafts: {}, chapters: [], outline: [], graph: newGraph(), workflow: {parameterProtocol:'effective-story-v1'}, selectedChapter: null });
    state.books = [{ id: 'book-1', title: '未命名作品', updatedAt: new Date().toISOString(), ...snapshot }];
  }
  if (!state.activeBookId || !state.books.some(book => book.id === state.activeBookId)) state.activeBookId = state.books[0].id;
  state.books.forEach(book => { if (!book.ownerId) book.ownerId = authState.user?.id || defaultUsers[0].id; });
  state.books.forEach(book => { delete book.review; });
  const active = state.books.find(book => book.id === state.activeBookId);
  if (active && active.drafts && active.drafts !== state.drafts) applyBook(active);
}
ensureBooks();
normalizeWorkflow(state);
state.generating = false;
persist();

function persistPreferences() {
  const { aiKey, generating, toast, books, ...other } = state;
  for (const key of Object.keys(projectSnapshot())) delete other[key];
  other.aiProfiles = state.aiProfiles.map(({ apiKey, ...profile }) => profile);
  try { accountLocalStorage.setItem(PREFERENCES_KEY, JSON.stringify(other)); } catch { /* Novel saves do not depend on browser quota. */ }
}

function persist(force = false) {
  if (!storageReady || accountSessionChanged) return false;
  persistPreferences();
  configClient?.schedulePreferences();
  if (!force && state.programmerSettings && !booleanValue(state.programmerSettings.autoSave,true)) {
    storageStatus = { saved: false, message: '自动保存已关闭，当前修改尚未保存到数据库。请点击“保存作品”。' };
    renderSaveStatus(); return false;
  }
  saveActiveBook();
  if (!novelRepository.ready) {
    storageStatus = { saved: false, message: databaseMessage || '本地小说数据库未连接，当前修改仅在页面中，请重试连接或下载备份。' };
    renderSaveStatus(); return false;
  }
  const present=new Set(state.books.map(b=>JSON.stringify([b.ownerId,b.id])));
  const membershipChanged=present.size!==novelRepository.baseline.size||[...novelRepository.baseline.keys()].some(k=>!present.has(k));
  const snapshot=structuredClone(membershipChanged?state.books:state.books.filter(b=>novelRepository.baseline.get(novelKey(b))?.comparison!==novelComparison(b)));
  // Navigation and preference changes also call persist. A clean, acknowledged
  // workspace needs neither a save timer nor a misleading "saving" indicator.
  // Keep pending/failed saves on the normal path so checkpoint waiters still
  // wait for the database acknowledgement (or receive the actual error).
  if (!membershipChanged && !snapshot.length && storageStatus.saved) return true;
  const sequence = ++idbWriteSequence;
  const revisionRunId = state.workflow?.bookRevisionLog?.runId;
  const revisionStorage = { storageSequence: sequence, completedChapters: completedRevisionChapters(state.workflow?.bookRevisionProgress), phase: state.workflow?.bookRevisionStatus?.status || 'running' };
  clearTimeout(idbSaveTimer);
  storageStatus = { saved: false, saving: true, message: '正在保存到本地数据库，请等待保存完成后关闭页面。' };
  idbSaveTimer = setTimeout(() => {
    novelRepository.save(snapshot,{partial:!membershipChanged}).then(() => {
      settleRevisionSaves(sequence);
      emitRevisionEvent(revisionRunId, 'storage_saved', { ...revisionStorage, storage: 'sqlite' });
      if (sequence !== idbWriteSequence) return;
      databaseConflict = false;
      storageStatus = { saved: true, message: databaseMessage }; renderSaveStatus();
    }).catch(error => {
      settleRevisionSaves(sequence, error);
      emitRevisionEvent(revisionRunId, 'storage_failed', { ...revisionStorage, storage: 'sqlite', errorCode: 'DATABASE_WRITE_FAILED' });
      if (sequence !== idbWriteSequence) return;
      databaseConflict = error.code === 'NOVEL_CONFLICT';
      storageStatus = { saved: false, message: `${error.message || '小说数据库保存失败。'} 当前修改保留在页面中，尚未保存到数据库。` };
      renderSaveStatus();
    });
  }, force ? 0 : 350);
  renderSaveStatus(); return true;
}

function legacyBooks(workspace) {
  const books = structuredClone(Array.isArray(workspace?.books) ? workspace.books : []);
  if (!books.length && (workspace?.chapters?.length || Object.keys(workspace?.drafts || {}).length || workspace?.draft || workspace?.storyIdea || workspace?.outline?.length || workspace?.workflow?.synopsis)) {
    const value = Object.fromEntries(Object.keys(projectSnapshot()).filter(key => workspace[key] !== undefined).map(key => [key, structuredClone(workspace[key])]));
    books.push({ ...value, id: workspace.activeBookId || 'book-1', ownerId: workspace.currentUserId || defaultUsers[0].id, title: '未命名作品',
      drafts: workspace.drafts || (workspace.draft ? { 1: workspace.draft } : {}), chapters: workspace.chapters || [] });
  }
  return books.filter(book => book && (Array.isArray(workspace?.books) || hasLegacyNovel(book))).map(book => ({ ...book, ownerId: book.ownerId || defaultUsers[0].id, drafts: book.drafts || {}, chapters: book.chapters || [] }));
}

async function hydrateNovelDatabase({ preserveCurrent = false } = {}) {
  storageReady = false;
  storageStatus = { saved: false, saving: true, message: '正在读取本地数据库作品…' };
  render();
  clearTimeout(idbSaveTimer);
  const sequence = ++idbWriteSequence;
  try {
    // Finish outstanding writes before replacing their version baseline.
    await novelRepository.chain;
    settleRevisionSaves(sequence, new Error('正在重新载入作品，原修改将保留为副本。'));
    if (!preserveCurrent) {
      let record;
      try { record = await idbGet(IDB_STORAGE_KEY); } catch { /* Legacy browser storage is optional. */ }
      if (record?.version === 1 && record.state && accountLocalStorage.ownsLegacy(record.state)) {
        accountLocalStorage.useLegacyWorkspace(record.state);
        legacyWorkspaces.push(structuredClone(record.state));
        const updated = value => value.storageRevision || Math.max(...(value.books || []).map(book => Date.parse(book.updatedAt || '') || 0), 0);
        if (legacyWorkspaces.length === 1 || updated(record.state) > updated(state)) {
          const credentials = new Map(state.aiProfiles.map(profile => [profile.id, profile.apiKey || '']));
          Object.assign(state, record.state, browserPreferences, { aiKey: '' });
          state.aiProfiles = (state.aiProfiles || []).filter(profile => !state.deletedAiProfiles?.includes(profile.id)).map(profile => {
            let apiKey = credentials.get(profile.id) || profile.apiKey || '';
            try { apiKey = accountLocalStorage.getItem(`${AI_KEY_STORAGE_PREFIX}${profile.id}`) || apiKey; } catch {}
            return { ...profile, apiKey };
          });
          const activeProfile = state.aiProfiles.find(profile => profile.id === state.activeAiProfile) || state.aiProfiles[0];
          if (activeProfile) Object.assign(state, { activeAiProfile: activeProfile.id, aiProvider: activeProfile.label,
            aiModel: activeProfile.model, aiBaseUrl: activeProfile.endpoint, aiKey: activeProfile.apiKey });
          state.programmerSettings = effectiveRequest({ ...defaultProgrammerSettings, ...(state.programmerSettings || {}) });
          state.programmerSettings.requestTimeout = numberValue(state.programmerSettings.requestTimeout, REQUEST_RULES.requestTimeout);
          state.programmerSettings.streamOutput = true;
          state.adminSettings = { ...defaultAdminSettings, ...(state.adminSettings || {}) };
          ensureBooks(); normalizeWorkflow(state);
        }
      }
    } else saveActiveBook();
    configClient.apply();
    // Before the database loads, ensureBooks creates a placeholder and may
    // select it. Restore the browser's real selection once the rows arrive.
    const preferred = preserveCurrent ? state.activeBookId : browserPreferences.activeBookId || state.activeBookId;
    // Import the preferred workspace first. Older, different browser copies
    // remain independent versions instead of silently overwriting it.
    const legacy = [...legacyWorkspaces].sort((a, b) => (b.storageRevision || 0) - (a.storageRevision || 0)).flatMap(legacyBooks);
    const currentCopies = new Map();
    const current = preserveCurrent ? state.books.flatMap(book => {
      const previous = novelRepository.baseline.get(novelKey(book));
      if (previous?.content === novelContent(book)) return [];
      if (!previous) return [book];
      // Explicit recovery must preserve even an intentional return to an old
      // imported snapshot. Migration deduplication must not swallow edits.
      const copy = { ...book, id: crypto.randomUUID(), title: book.title + '（页面保留副本）' };
      currentCopies.set(book.id, copy.id);
      return [copy];
    }) : [];
    const sources = preserveCurrent ? [...current, ...legacy] : legacyWorkspaces.length ? legacy : legacyBooks(state).filter(hasLegacyNovel);
    const ownedSources = hasSystemAdminRole() ? sources : sources.filter(book => book.ownerId === authState.user?.id);
    const unique = [...new Map(ownedSources.map(book => [novelContent(book), book])).values()];
    const result = await novelRepository.load(unique);
    const imported = result.imports.find(item => item.originalId === preferred);
    state.books = hasSystemAdminRole() ? result.books : result.books.filter(book => book.ownerId === authState.user?.id);
    state.activeBookId = currentCopies.get(preferred) || imported?.id || preferred;
    if (!state.books.length) {
      // A new installation gets one blank book; no bundled manuscript.
      Object.assign(state, { storyIdea: '', drafts: {}, chapters: [], outline: [], workflow: {}, graph: newGraph() });
      ensureBooks();
      state.activeBookId = state.books[0].id = crypto.randomUUID();
      state.books[0].workflow.storyBibleFresh = true;
    }
    ensureBooks(); applyBook(state.books.find(book => book.id === state.activeBookId));
    const copies = result.imports.filter(item => item.copied).length + currentCopies.size;
    databaseMessage = copies ? `已迁入数据库；${copies} 本同编号作品保留为独立副本，原稿未覆盖。` : '';
    databaseConflict = false;
    storageStatus = { saved: true, message: databaseMessage };
  } catch (error) {
    databaseMessage = `${error.message || '本地小说数据库暂时无法连接。'} 已有浏览器数据保留，请启动本地服务后重试。`;
    storageStatus = { saved: false, message: databaseMessage };
  } finally {
    storageReady = true;
    if (novelRepository.ready && !storageStatus.saved) novelRepository.ready = false;
    if (novelRepository.ready) persist(true);
    render();
  }
}

async function retryNovelSave() {
  try {
    if (!novelRepository.ready) return await hydrateNovelDatabase({ preserveCurrent: true });
    await persistRevision(); showToast('作品已保存到本地数据库。');
  } catch (error) { showToast(error.message || '保存失败，当前修改保留。'); }
}

async function refreshWorksFromDatabase({ announce = false } = {}) {
  if (!novelRepository.ready) return false;
  if (worksRefreshInFlight) return worksRefreshInFlight;
  worksRefreshInFlight = (async () => {
    try {
      await novelRepository.chain;
      // Capture the editor before replacing clean rows with the authoritative
      // database snapshot. Dirty rows and newly created local rows remain in
      // memory until the user explicitly saves them.
      saveActiveBook();
      const local = new Map(state.books.map(book => [novelKey(book), book]));
      const dirty = new Set([...local].filter(([key, book]) => {
        const stored = novelRepository.baseline.get(key);
        return !stored || stored.comparison !== novelComparison(book);
      }).map(([key]) => key));
      const result = await novelRepository.refresh();
      const merged = result.books.map(book => dirty.has(novelKey(book)) ? local.get(novelKey(book)) : book);
      for (const [key, book] of local) if (dirty.has(key) && !merged.some(item => novelKey(item) === key)) merged.push(book);
      state.books = merged;
      if (!state.books.length) ensureBooks();
      if (!state.books.some(book => book.id === state.activeBookId)) state.activeBookId = state.books[0]?.id;
      ensureBooks();
      applyBook(state.books.find(book => book.id === state.activeBookId));
      state.worksPage = 1;
      render();
      if (announce) showToast(`已从本地数据库刷新 ${result.books.length} 本作品。`);
      return true;
    } catch (error) {
      if (announce) showToast(error.message || '刷新本地数据库作品失败。');
      return false;
    } finally { worksRefreshInFlight = null; }
  })();
  return worksRefreshInFlight;
}

async function refreshSystemLogSummary() {
  try {
    const response = await fetch('/api/system-logs', { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Number.isFinite(body.count)) return;
    state.systemLogSummary = { count: body.count, totalBytes: body.totalBytes || 0, loggingEnabled: body.loggingEnabled === true };
    if (state.activeTab === 'works') render();
  } catch { /* log maintenance is optional while the local API is offline */ }
}

function renderSaveStatus() {
  const region = document.querySelector('[data-save-status]');
  if (!region) return;
  const current = state.books.find(book => book.id === state.activeBookId);
  const stored = current && novelRepository.baseline.get(novelKey(current));
  const confirmation = stored ? ` · 第 ${stored.revision} 版${stored.savedAt ? ' · ' + new Date(stored.savedAt).toLocaleString('zh-CN') : ''}` : '';
  const message = storageStatus.message, key = String(storageStatus.saved) + ':' + Boolean(storageStatus.saving) + ':' + message + ':' + current?.id + confirmation;
  if (region.dataset.message === key) return;
  region.dataset.message = key;
  region.innerHTML = storageStatus.saved
    ? `<p class="wf-hint" data-database-saved>✓ 作品已保存到本地数据库${escapeHtml(confirmation)}${message ? ' · ' + escapeHtml(message) : ''}</p>`
    : storageStatus.saving ? `<p class="wf-hint" role="status" data-database-saving>${escapeHtml(message)}</p>`
    : `<div class="wf-warning wf-save-warning"><p>${escapeHtml(message || '作品尚未保存到数据库。')}</p><div class="wf-actions"><button type="button" class="button secondary" data-save-retry>重试数据库保存</button>${databaseConflict ? '<button type="button" class="button secondary" data-save-copy>保留当前副本并重新载入</button>' : ''}<button type="button" class="button primary" data-save-backup>下载当前作品备份</button></div></div>`;
  region.querySelector('[data-save-retry]')?.addEventListener('click', retryNovelSave);
  region.querySelector('[data-save-copy]')?.addEventListener('click', () => { if (!studio.isBusy()) void hydrateNovelDatabase({ preserveCurrent: true }); });
  region.querySelector('[data-save-backup]')?.addEventListener('click', downloadProjectBackup);
}

function downloadProjectBackup() {
  saveActiveBook();
  const book = state.books.find(item => item.id === state.activeBookId);
  if (!book) return;
  const backup = { id: book.id, title: book.title, updatedAt: book.updatedAt, ...projectSnapshot() };
  saveBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }), `${book.title}-作品备份.json`);
  showToast('作品备份已下载，可从“导入作品”恢复。');
}

window.addEventListener('beforeunload', event => {
  if (storageStatus.saved && !unsavedAiKeys.size) return;
  event.preventDefault();
  event.returnValue = '';
});

function wordCount(value) {
  return state.workflow?.parameterProtocol==='effective-story-v1'?proseWords(value):legacyProseWords(value);
}

function formatWords(value) {
  const count = wordCount(value);
  return count ? count.toLocaleString('en-US') : '—';
}

function currentChapter() { return state.chapters.find(chapter => chapter.id === state.selectedChapter) || state.chapters[0]; }
function saveEditor() { /* Textarea input is persisted directly by the workflow. */ }

function humanizationPrompt() {
  const config = state.humanization, legacy=legacyParameterTask(state);
  if (legacy ? state.authorSettings.featureToggles?.humanization===false||!config.enabled : !featureEnabled(state,'humanization')) return '关闭人性化模拟：保持自然、规范的叙事表达。';
  const enabled = (key, ratio, label, suffix = '') => (legacy?config[key]===false:!booleanValue(config[key],true)) ? `${label}=关闭` : `${label}约 ${config[ratio]}%${suffix}`;
  const advanced = humanizationControls.map(control => {
    const line = enabled(`${control.key}Enabled`, `${control.key}Ratio`, control.label,
      control.risky ? '（仅极少量，不能影响理解或内容安全）' : '（按场景抽样，不强行每段加入）');
    const vocabulary = (legacy||booleanValue(config[`${control.key}Enabled`],true)) && control.textKey && config[control.textKey]?.trim()
      ? `；${control.label}词库=${config[control.textKey].trim()}`
      : '';
    return `${line}${vocabulary}`;
  }).join('；');
  return `开启人性化模拟写作，请把以下作者状态融入正文但不要解释规则：${(legacy?config.dialectEnabled===false:!booleanValue(config.dialectEnabled,true)) ? '方言比例=关闭' : `方言或地域表达约 ${config.dialectRatio}%`}；${(legacy?config.selfDeprecatingEnabled===false:!booleanValue(config.selfDeprecatingEnabled,true)) ? '吐槽自黑=关闭' : `吐槽、自黑或自我调侃约 ${config.selfDeprecatingRatio}%`}；${(legacy?config.catchphrasesEnabled===false:!booleanValue(config.catchphrasesEnabled,true)) ? '口头禅=关闭' : `可使用的常用口头禅为「${config.catchphrases || '无'}」`}；${(legacy?config.typoEnabled===false:!booleanValue(config.typoEnabled,true)) ? '错别字=关闭' : `错别字约 ${config.typoRatio}%（只允许极少量、不影响理解）`}；${(legacy?config.moodEnabled===false:!booleanValue(config.moodEnabled,true)) ? '作者今日状态=关闭' : `作者今日状态率 ${config.authorMood}%（数值越低越疲惫、犹豫和不稳定，越高越轻快笃定）`}；高级控制：${advanced}。所有比例都是软约束，优先保证人物事实、情节因果、可读性、内容安全和发布规范；脏话只能符合人物身份与场景，禁止歧视性侮辱或违法内容；故意标点错误、删除连接词仅限不影响理解的极少量表达。避免机械重复，不要每段都强行加入特征。`;
}

function writingProfilePrompt(bookState = state) {
  const legacy=legacyParameterTask(bookState);
  const config = legacy ? bookState.authorSettings||{} : effectiveStory(bookState).authorSettings;
  const list = key => (config[key] || []).join('、') || '未指定';
  const enabled = key => legacy ? config.featureToggles?.[key]!==false : featureEnabled(bookState,key);
  const part = (key, value) => enabled(key) ? value : '未启用';
  const plotEngineering = ['plotGoals', 'openingHooks', 'causality', 'infoReveal', 'tension', 'risk', 'foreshadowPlan', 'reversalPlan', 'revealPace', 'subplot', 'chapterDensity', 'sceneObjective', 'payoff', 'obstacleEscalation']
    .map(key => `${key}=${part(key, list(key))}`).join('；');
  const globalTags = part('globalNovelTags', list('globalNovelTags'));
  const mottos = enabled('protagonistMottos') && (config.protagonistMottos || []).length
    ? `已配置 ${config.protagonistMottos.length} 句，按章节高潮信号决定是否使用`
    : '未启用';
  const history = enabled('historicalReference') && (!legacy||config.historicalReferenceEnabled)
    ? `历史考据模式=开启；历史时期=${config.historicalPeriod || '未指定'}；参考事件=${config.historicalEvents || '未指定'}；硬性要求=${config.historicalCanonNotes || '尊重真实历史结局，只补写未记载细节。'}`
    : '历史考据模式=关闭';
  return `全书创作定义：题材=${part('genres', list('genres'))}；语言气质=${part('styles', list('styles'))}；视角=${part('pov', list('pov'))}；时间组织=${part('tense', list('tense'))}；结构=${part('structure', list('structure'))}；节奏=${part('pacing', list('pacing'))}；目标读者=${part('audience', list('audience'))}；主要冲突=${part('conflict', list('conflict'))}；结局倾向=${part('endings', list('endings'))}；主角=${enabled('protagonist') ? (config.protagonistName || '未命名') : '未启用'}，主角目标=${enabled('protagonist') ? (config.protagonistGoal || '未指定') : '未启用'}；主角特质=${enabled(legacy?'protagonist':'protagonistTraits') ? list('protagonistTraits') : '未启用'}；人物角色=${part('characters', list('characterSlots'))}；配角设定=${part('characters', config.supportingCharacters || '未指定')}；人物关系类型=${part('relations', list('characterRelationTypes'))}；关系图=${part('relations', config.relationshipMap || '未指定')}；世界观=${part('world', config.worldSetting || '未指定')}；核心主题=${part('theme', config.coreTheme || '未指定')}；时间背景=${part('time', config.timeSetting || '未指定')}；情节要素=${part('plotElements', list('plotElements'))}；故事明线=${part('mainline', config.mainline || '未指定')}；故事暗线=${part('hiddenLine', config.hiddenLine || '未指定')}；内容标签=${part('contentTags', list('contentTags'))}；作品全局标签=${globalTags}；主角座右铭=${mottos}；对白风格=${part('dialogue', list('dialogue'))}；内容分级=${part('contentRating', list('contentRating'))}；情节工程=${plotEngineering}。${history}。题材锁定协议：正文必须符合已选题材的时代、空间、器物、制度、能力、称谓、语言与常识；禁止未经设定解释的现代元素或通用模板细节。穿越、修仙、历史、科幻等核心前提不得擅自改写；生成前列出本章允许/禁止元素，生成后逐段自检并修正漂移。所有新增细节必须服务于章纲和世界规则。请把已启用定义作为长期约束，保持人物动机、世界规则、历史因果和叙事声音一致。` + presetCommonContext(bookState,{legacy});
}

function historyPrompt(bookState = state) {
  return (legacyParameterTask(bookState)?bookState.authorSettings?.featureToggles?.historicalReference!==false&&bookState.authorSettings?.historicalReferenceEnabled:featureEnabled(bookState,'historicalReference'))
    ? '启用历史参考：核对真实人物、事件、年代和因果，历史结局不可篡改；可以原创未记载的对话、场景和内幕，但不得把虚构内容冒充史实。'
    : '';
}

function activeAiProfile() {
  return state.aiProfiles.find(profile => profile.id === state.activeAiProfile) || state.aiProfiles[0];
}

function currentUser() {
  if (authState.user) return { ...authState.user, role: authState.user.group === 'system_admin' ? 'system_admin' : 'user' };
  return null;
}

function isSystemAdmin() {
  return (currentUser()?.role === 'system_admin' || currentUser()?.group === 'system_admin') && state.debugMode !== false;
}

function canDeleteBook(book) { return canManageBook(book) && (isSystemAdmin() || booleanValue(state.adminSettings.allowOwnProjectDelete,true)); }

function canManageBook(book) {
  if (!book) return false;
  return isSystemAdmin() || book.ownerId === currentUser()?.id;
}

function hasSystemAdminRole() {
  return currentUser()?.role === 'system_admin' || currentUser()?.group === 'system_admin';
}

function globalAssistReady() {
  return Boolean(state.globalAssist?.programmerConfirmed && state.globalAssist?.adminConfirmed);
}

function requireSystemAdmin(message = '只有系统管理员可以操作此功能。') {
  if (hasSystemAdminRole()) return true;
  showToast(message);
  return false;
}

function canAccessTab(tab) {
  if (['global', 'users'].includes(tab) && !isSystemAdmin()) return false;
  if (tab === 'quality-check' && !hasSystemAdminRole()) return false;
  if (tab === 'settings' && !globalAssistReady()) return false;
  return true;
}

function aiProfileSignature(profile) {
  return fingerprint([normalizeAiEndpoint(profile?.endpoint), profile?.model || '', profile?.apiKey || '', Boolean(profile?.custom)]);
}

function profileTested(profile) {
  if (profile?.serverManaged && profile.serverVerified) return true;
  return Boolean(profile && aiProfileTests.get(profile.id) === aiProfileSignature(profile));
}

function profileKeySaved(profile) {
  if (!profile) return false;
  if (profile.serverManaged) return true;
  // Managed DeepSeek and local Ollama can be used without a browser-stored key.
  if (!profile.apiKey) return Boolean((state.envAiConfigured && profile.id === 'deepseek') || isLocalAiEndpoint(profile.endpoint));
  if (unsavedAiKeys.has(profile.id)) return false;
  try { return accountLocalStorage.getItem(`${AI_KEY_STORAGE_PREFIX}${profile.id}`) === profile.apiKey; }
  catch { return false; }
}

function configuredAiProfiles() {
  return state.aiProfiles.filter(profile => profileTested(profile) && profileKeySaved(profile));
}

function persistAiTests() {
  try { accountLocalStorage.setItem(AI_TEST_STORAGE_KEY, JSON.stringify({ profiles: Object.fromEntries(aiProfileTests), roles: Object.fromEntries(aiRoleTests) })); }
  catch { /* test state is only an aid and can be repeated */ }
}

function invalidateAiProfileTest(profile) {
  if (!profile) return;
  if (profile.serverManaged) profile.serverVerified = false;
  let changed = aiProfileTests.delete(profile.id);
  Object.keys(aiRoleLabels).forEach(role => {
    if (roleAiProfile(role)?.id === profile.id && aiRoleTests.delete(role)) changed = true;
  });
  if (!changed) return;
  persistAiTests();
}

function aiRoleReady(role) {
  const profile = roleAiProfile(role);
  if (profile?.serverManaged && profile.serverVerified) return true;
  return profileTested(profile) && profileKeySaved(profile) && aiRoleTests.get(role) === aiProfileSignature(profile);
}

function aiCollaborationReady() {
  return Object.keys(aiRoleLabels).every(aiRoleReady);
}

function testFeedback(profile = activeAiProfile()) {
  return aiTestFeedback.get(profile?.id) || '';
}

function roleTestFeedback(role) {
  const profile = roleAiProfile(role);
  if (!profile) return '未绑定档案';
  if (aiTestsInFlight.has(`role:${role}`)) return '正在测试…';
  if (profile.serverManaged && profile.serverVerified) return `服务器已验证 · ${profile.label} · 可直接使用`;
  if (aiRoleReady(role)) return `已测试通过 · ${profile.label}`;
  if (profileTested(profile) && !profileKeySaved(profile)) return '档案已测试，请先保存 Key';
  const feedback = testFeedback(profile);
  return feedback.startsWith('测试失败') || feedback.startsWith('无法连接') ? feedback : '尚未测试';
}

function aiKeyStatus() {
  const profile = activeAiProfile();
  if (profile?.serverManaged) return profile.serverVerified
    ? '内置 AI 已保存在服务器并通过验证；同一服务的用户可直接使用，无需重复填写 Key 或测试角色。'
    : '内置 AI 的 Key 保存在服务器；此档案尚未验证，可手动测试连接。';
  if (aiKeyStorageErrors.has(profile?.id)) return aiKeyStorageErrors.get(profile.id);
  if (profileTested(profile) && profile?.apiKey && profileKeySaved(profile)) return '连接测试已通过，Key 已保存在此浏览器；不包含在作品备份中。';
  if (profileTested(profile) && profile?.apiKey) return '连接测试已通过，请点击“保存 Key”后再测试角色或开始创作。';
  if (profile?.apiKey) return 'Key 尚未保存。请先测试当前档案，测试通过后再保存。';
  return state.envAiConfigured && profile?.id === 'deepseek'
    ? profileTested(profile) ? '服务器 DeepSeek 连接测试已通过。' : '使用服务器 DeepSeek Key，请先测试连接。'
    : '填写 Key 后先测试连接，成功后再保存。';
}

function saveAiKey(profile = activeAiProfile()) {
  if (!profile) return false;
  try {
    const key = `${AI_KEY_STORAGE_PREFIX}${profile.id}`;
    if (profile.apiKey) accountLocalStorage.setItem(key, profile.apiKey);
    else accountLocalStorage.removeItem(key);
    aiKeyStorageErrors.delete(profile.id);
    unsavedAiKeys.delete(profile.id);
    return true;
  } catch {
    unsavedAiKeys.add(profile.id);
    aiKeyStorageErrors.set(profile.id, profile.apiKey
      ? 'Key 本次修改尚未保存，当前页面仍可使用；请检查浏览器存储空间或权限后点击“保存 Key”重试。'
      : '当前页面的 Key 已清空，但浏览器中的旧 Key 尚未删除；请检查存储权限后点击“保存 Key”重试。');
    return false;
  }
}

function profileModels(profile) {
  const models = Array.isArray(profile?.models) ? profile.models.filter(model => typeof model === 'string' && model.trim()) : [];
  if (profile?.model && !models.includes(profile.model)) models.unshift(profile.model);
  return [...new Set(models)];
}

function modelOptions(profile) {
  const models = profileModels(profile);
  return models.length
    ? models.map(model => `<option value="${escapeHtml(model)}" ${model === profile.model ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('')
    : '<option value="" selected>点击“读取模型列表”，或手动填写模型 ID</option>';
}

function isLocalAiEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch { return false; }
}

async function refreshAiModels(profile = activeAiProfile()) {
  if (!profile) return;
  const endpoint = normalizeAiEndpoint(profile.endpoint);
  if (!endpoint) return showToast('请先填写兼容接口地址。');
  if (!profile.apiKey && !profile.serverManaged && !(state.envAiConfigured && profile.id === 'deepseek') && !isLocalAiEndpoint(endpoint)) return showToast('读取远程模型列表前请填写当前档案的 Key。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5000, Number(state.programmerSettings?.requestTimeout || 20) * 1000));
  try {
    const response = await fetch('/api/models', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ endpoint, ...(profile.apiKey ? { apiKey: profile.apiKey } : {}), ...(profile.serverManaged ? { profileId: profile.id } : {}), custom: Boolean(profile.custom), timeout: Number(state.programmerSettings?.requestTimeout || 20) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `读取模型列表失败（${response.status}）`);
    const models = Array.isArray(body.models) ? body.models.filter(model => typeof model === 'string' && model.trim()) : [];
    if (!models.length) throw new Error('接口未返回模型，请手动填写模型 ID。');
    if (activeAiProfile()?.id !== profile.id) return;
    profile.models = [...new Set(models)];
    profile.modelsFetchedAt = new Date().toISOString();
    if (!profile.model || !profile.models.includes(profile.model)) profile.model = profile.models[0];
    state.aiModel = profile.model;
    persist();
    render();
    showToast(`已读取 ${profile.models.length} 个可用模型，请手动选择或填写模型 ID。`);
  } catch (error) {
    showToast(error?.name === 'AbortError' ? '读取模型列表超时，请手动填写模型 ID。' : error.message || '读取模型列表失败，请手动填写模型 ID。');
  } finally { clearTimeout(timer); }
}

function addCustomAiProfile() {
  const label = window.prompt('请输入自定义 AI 名称', '我的兼容接口')?.trim();
  if (!label) return;
  if (state.aiProfiles.some(profile => profile.custom && String(profile.label || '').trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
    return showToast('自定义 AI 名称已存在，请换一个名称以便区分。');
  }
  const endpoint = normalizeAiEndpoint(window.prompt('请输入 OpenAI-compatible 接口地址', 'https://example.com/v1') || '');
  if (!endpoint || !/^https?:\/\//i.test(endpoint)) return showToast('接口地址必须以 http:// 或 https:// 开头。');
  const idBase = `custom-${Date.now().toString(36)}`;
  let id = idBase;
  let suffix = 2;
  while (state.aiProfiles.some(profile => profile.id === id)) id = `${idBase}-${suffix++}`;
  const profile = { id, label, endpoint, model: '', models: [], custom: true, apiKey: '' };
  state.aiProfiles.push(profile);
  state.activeAiProfile = id;
  state.aiProvider = label;
  state.aiModel = '';
  state.aiBaseUrl = endpoint;
  state.aiKey = '';
  persist();
  render();
  showToast('自定义 AI 档案已添加，请填写 Key 并读取模型列表。');
}

function removeAiProfile(profileId = state.activeAiProfile) {
  const profile = state.aiProfiles.find(item => item.id === profileId);
  if (!profile) return showToast('未找到要删除的 AI 档案。');
  if (!requireSystemAdmin('只有系统管理员可以删除 AI 档案。')) return;
  if (aiTestsInFlight.size || studio?.isBusy() || state.generating) return showToast('请等待当前 AI 操作完成后再删除档案。');
  const boundRoles = Object.entries(state.aiRoles).filter(([, id]) => id === profile.id).map(([role]) => aiRoleLabels[role] || role);
  if (boundRoles.length) return showToast(`请先将${boundRoles.join('、')}改绑到其他 AI，再删除当前档案。`);
  const usingBooks = state.books.filter(book => (book.id === state.activeBookId ? state.workflow : book.workflow)?.performance?.profileId === profile.id);
  if (usingBooks.length) return showToast(`请先在作品运行策略中更换指定档案：${usingBooks.map(book => book.title).join('、')}。`);
  if (state.aiProfiles.length <= 1) return showToast('至少保留一个 AI 档案，不能删除最后一个配置。');
  if (!window.confirm(`确定从当前工作区删除“${profile.label || profile.id}”吗？本地 Key 和测试记录将清除。${profile.serverManaged ? '服务器托管配置仍保留，其他用户可继续使用。' : ''}小说正文和历史请求保留。`)) return;
  const previousDeleted = state.deletedAiProfiles || [];
  state.deletedAiProfiles = [...new Set([...previousDeleted, profile.id])];
  const previousProfiles = state.aiProfiles;
  state.aiProfiles = state.aiProfiles.filter(item => item.id !== profile.id);
  try {
    const saved = JSON.parse(accountLocalStorage.getItem(PREFERENCES_KEY) || '{}');
    accountLocalStorage.setItem(PREFERENCES_KEY, JSON.stringify({...saved, deletedAiProfiles:state.deletedAiProfiles, aiProfiles:state.aiProfiles.map(({apiKey,...item})=>item)}));
    accountLocalStorage.removeItem(`${AI_KEY_STORAGE_PREFIX}${profile.id}`);
  } catch { state.aiProfiles=previousProfiles;state.deletedAiProfiles=previousDeleted;return showToast('AI 档案删除未能保存，请检查浏览器存储权限后重试。'); }
  state.aiProfiles = state.aiProfiles.filter(item => item.id !== profile.id);
  aiProfileTests.delete(profile.id); aiTestFeedback.delete(profile.id); aiKeyStorageErrors.delete(profile.id); unsavedAiKeys.delete(profile.id); persistAiTests(); aiResponseCache.clear();
  const next = state.aiProfiles.find(item => item.id === state.activeAiProfile) || state.aiProfiles[0];
  state.activeAiProfile = next.id; state.aiProvider = next.label; state.aiModel = next.model || '';
  state.aiBaseUrl = next.endpoint || ''; state.aiKey = next.apiKey || '';
  persist(); render(); showToast(`已删除 AI 档案“${profile.label || profile.id}”，原作品数据保留。`);
}

function updateAiKey(value) {
  const profile = activeAiProfile();
  if (!profile) return;
  state.aiKey = value.trim();
  profile.apiKey = state.aiKey;
  invalidateAiProfileTest(profile);
  aiResponseCache.clear();
  renderAIStatusOnly();
}

function normalizeAiEndpoint(value) {
  return String(value || '').trim().replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/i, '');
}

function roleAiProfile(role) {
  const profileId = state.aiRoles[role] || state.activeAiProfile;
  return state.aiProfiles.find(profile => profile.id === profileId) || activeAiProfile();
}

function maintenanceBlocked() {
  if (!state.adminSettings?.maintenanceMode) return false;
  showToast('工作区处于维护模式，暂时不能执行创作操作');
  return true;
}

function packageExportBlocked() {
  const reason = exportGate(state);
  if (reason) showToast(reason);
  return Boolean(reason);
}

function syncAiForm() {
  const profile = activeAiProfile();
  if (!profile) return;
  profile.apiKey = state.aiKey;
  profile.model = state.aiModel;
  profile.endpoint = normalizeAiEndpoint(state.aiBaseUrl);
  state.aiBaseUrl = profile.endpoint;
}

function renderTestedAiList() {
  const list = document.querySelector('[data-ai-tested-list]');
  if (!list) return;
  const testedProfiles = configuredAiProfiles();
  list.innerHTML = testedProfiles.length
    ? testedProfiles.map(item => {
      const roles = Object.entries(state.aiRoles).filter(([, id]) => id === item.id).map(([role]) => aiRoleLabels[role]).join('、') || '未绑定角色';
      return `<li><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.model || '未填写模型')} · ${escapeHtml(normalizeAiEndpoint(item.endpoint) || '未填写接口')}</span><small>测试通过 · ${escapeHtml(roles)}</small><button class="button danger compact" data-ai-remove="${escapeHtml(item.id)}" aria-label="删除 ${escapeHtml(item.label)}">删除</button></li>`;
    }).join('')
    : '<li class="empty">还没有测试通过并保存的 AI 档案。</li>';
}

const aiResponseCache = new Map();
function waitForAiRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelled','AbortError'));
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled','AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort',cancel); resolve(); }, delay);
    signal?.addEventListener('abort',cancel,{once:true});
  });
}
function modelResponseError(response, body) {
  const detail = typeof body?.error === 'string' ? body.error : body?.error?.message;
  const upstreamStatus = Number(body?.upstreamStatus) || 0;
  const status = upstreamStatus || response.status;
  const genericDetail = !detail || /^(?:上游模型网关请求失败|模型请求失败)$/i.test(String(detail).trim());
  const message = status === 403 && genericDetail
    ? '模型服务拒绝了当前凭证或模型权限，请检查 API Key、模型 ID 与服务商套餐权限'
    : detail || ([502,503,504].includes(status)
      ? '本地代理或模型网关暂时不可用，请稍后重试'
      : '模型请求失败');
  return Object.assign(new Error(`${message}（HTTP ${response.status}${upstreamStatus && upstreamStatus !== response.status ? ` · 上游 HTTP ${upstreamStatus}` : ''}${body?.code ? ` · ${body.code}` : ''}）`),{status:response.status,upstreamStatus,code:body?.code});
}
fetch('/api/health').then(response => response.json()).then(data => { state.envAiConfigured = Boolean(data.envConfigured); renderAIStatusOnly(); }).catch(() => {});

async function creationRequest(prompt,maxTokens,options={}) {
  const defaults=options.requestDefaults||state.programmerSettings;
  const policy=options.policy||creationPolicy(state),role=options.role||'drafter';
  const profileId=options.profileId||state.workflow.performance?.profileId;
  const profile=state.aiProfiles.find(p=>p.id===(profileId||'deepseek'));
  if(!profile||!(profile.serverManaged||profile.apiKey||state.envAiConfigured&&profile.id==='deepseek'))throw new Error('所选 AI 尚未配置，原有档案和正文保留。');
  const model=profileId?profile.model:officialModel(policy,options.purpose);
  const signatureBefore=aiProfileSignature(profile);
  await persistRevision();
  const ownerId=state.books.find(b=>b.id===state.activeBookId)?.ownerId||state.currentUserId;
  const identity={ownerId,bookId:state.activeBookId};
  let preview='';
  const onPreview=delta=>{preview+=delta;const el=document.querySelector('[data-creation-preview]');if(el){el.hidden=false;const match=preview.match(/\"content\"\s*:\s*\"([\s\S]*)/);el.textContent='生成中 · 尚未采用\n'+(match?match[1].replace(/\\n/g,'\n').replace(/\\\"/g,'\"').slice(0,12000):'正在准备正文…');}};
  const body=await novelRepository.api('/creation',{...identity,policy,modelSource:profileId?'configured':'official',preview:Boolean(state.workflow.performance?.preview),purpose:options.purpose,stepId:options.stepId,
    offPeak:false,
    params:{endpoint:profile.endpoint,model,custom:Boolean(profile.custom),...(profile.serverManaged?{profileId:profile.id}:{}),...(profile.apiKey?{apiKey:profile.apiKey}:{}),prompt,maxTokens,timeout:numberValue(defaults.requestTimeout,REQUEST_RULES.requestTimeout),
      temperature:options.json?0.15:numberValue(defaults.temperature,REQUEST_RULES.temperature),thinking:thinkingMode(defaults.deepThinking),...(options.json?{responseFormat:'json_object'}:{})}},false,{signal:options.signal,timeout:0,onPreview});
  if(body.content?.trim()&&body.finishReason==='stop'&&model===profile.model&&signatureBefore===aiProfileSignature(profile)){aiProfileTests.set(profile.id,signatureBefore);for(const r of Object.keys(aiRoleLabels))if(state.aiRoles[r]===profile.id)aiRoleTests.set(r,signatureBefore);persistAiTests();}
  const el=document.querySelector('[data-creation-usage]');
  if(el)el.textContent=body.creationReceipt.cached?'已恢复之前保存的结果。':'当前内容已处理完成。';
  return body;
}
async function acknowledgeCreation(receipt,accepted,error) {
  if(!receipt)return;
  await novelRepository.api('/creation',{action:'ack',ownerId:receipt.ownerId,bookId:receipt.bookId,requestId:receipt.id,accepted,error});
}

async function recoverCreation(stepId,options={}) {
  const defaults=options.requestDefaults||state.programmerSettings;
  const book=state.books.find(b=>b.id===state.activeBookId),policy=options.policy||creationPolicy(state);
  const profileId=state.workflow.performance?.profileId,profile=state.aiProfiles.find(p=>p.id===(profileId||'deepseek'));
  if(!profile)return null;
  return (await novelRepository.api('/creation',{action:'candidate',ownerId:book.ownerId,bookId:book.id,stepId,policy,purpose:options.purpose,modelSource:profileId?'configured':'official',
    params:{endpoint:profile.endpoint,model:profileId?profile.model:officialModel(policy,options.purpose),custom:Boolean(profile.custom),...(profile.serverManaged?{profileId:profile.id}:{}),...(profile.apiKey?{apiKey:profile.apiKey}:{}),
      prompt:options.prompt,maxTokens:options.tokens,timeout:numberValue(defaults.requestTimeout,REQUEST_RULES.requestTimeout),temperature:0.15,thinking:thinkingMode(defaults.deepThinking),responseFormat:'json_object'}},false,{signal:options.signal})).candidate;
}
async function creationEvent(stepIds,event){const book=state.books.find(b=>b.id===state.activeBookId);return novelRepository.api('/creation',{action:'event',ownerId:book.ownerId,bookId:book.id,stepIds,event});}
async function creationUsage(){const book=state.books.find(b=>b.id===state.activeBookId);return creationUsageText((await novelRepository.api('/creation',{action:'usage',ownerId:book.ownerId,bookId:book.id})).requests);}
async function retryCreationTransport(){const book=state.books.find(b=>b.id===state.activeBookId);return novelRepository.api('/creation',{action:'retry-transport',ownerId:book.ownerId,bookId:book.id});}

async function aiRequest(prompt, maxTokens, role = 'drafter', options = {}) {
  syncAiForm();
  const config = effectiveRequest(state.programmerSettings || defaultProgrammerSettings);
  const revisionTrace=options.revisionTrace;
  const revisionEvent=(event,fields={})=>{if(revisionTrace)emitRevisionEvent(revisionTrace.runId,event,{...revisionTrace,...fields});};
  const primary = options.profileSnapshot || (options.profileId ? state.aiProfiles.find(p => p.id === options.profileId) : roleAiProfile(role));
  if (!primary) throw new Error('未配置 AI 档案');
  const bypassTest = Boolean(options.skipTest);
  const candidates = [primary, ...(!options.profileSnapshot && !options.profileId && config.failoverEnabled ? state.aiProfiles : [])]
    .filter((profile, index, list) => (bypassTest || profileTested(profile))
      && (bypassTest
        ? (profile?.apiKey || profile?.serverManaged || (state.envAiConfigured && profile?.id === 'deepseek') || isLocalAiEndpoint(profile?.endpoint))
        : profileKeySaved(profile))
      && list.findIndex(item => item.id === profile.id) === index);
  if (!candidates.length) throw new Error('未配置可用的 AI Key');
  const requestedTokens = Math.max(1, Number(maxTokens) || config.maxTokens);
  const effectiveTokens = options.structuredBudget ? Math.min(8000, requestedTokens) : Math.min(requestedTokens, Number(config.maxTokens) || requestedTokens);
  const timeoutSeconds = Math.min(300,Math.max(10,Number(options.timeout ?? config.requestTimeout)||180));
  const temperature = Number(options.temperature ?? config.temperature);
  const cacheKey = JSON.stringify([role,aiProfileSignature(candidates[0]),temperature,effectiveTokens,options.structuredBudget===true,thinkingMode(config.deepThinking),prompt]);
  if (options.cache !== false && config.requestCache && aiResponseCache.has(cacheKey)) return aiResponseCache.get(cacheKey).clone();

  let lastError;
  for (const profile of candidates) {
    const builtInProfile = providerPresets.some(item => !item.custom && item.endpoint === normalizeAiEndpoint(profile.endpoint));
    if (!state.adminSettings.allowExternalProviders && !builtInProfile && !profile.serverManaged && !isLocalAiEndpoint(profile.endpoint)) {
      lastError = new Error('外部模型服务商未获超级管理员授权');
      continue;
    }
    const retries = revisionTrace ? 0 : Math.min(5,Math.max(0,Number(config.retryCount)||0));
    let retryAfter = 0;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (attempt) {
        const delay = Math.min(30000,Math.max(retryAfter,1000*2**(attempt-1)));
        revisionEvent('network_retry',{model:profile.model,networkAttempt:attempt+1,profileIndex:candidates.indexOf(profile),delayMs:delay,errorCode:revisionErrorCode(lastError)});
        options.onRetry?.({attempt,delay});
        await waitForAiRetry(delay,options.signal);
      }
      const controller = new AbortController();
      // Allow the Worker to return its own timeout diagnosis; cover body reading too.
      const timer = null; // The server starts the request timeout after the shared provider queue; user cancellation remains immediate.
      const requestId=revisionTrace?crypto.randomUUID():null;
      try {
        const attemptTokens = revisionTrace ? Math.min(2200,effectiveTokens) : Math.min(8000, Math.ceil(effectiveTokens * (lastError?.code === 'OUTPUT_LENGTH' ? 1.7 : 1)));
        const response = await fetch('/api/generate', {
          method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
            body: JSON.stringify({
            endpoint: profile.endpoint, model: profile.model, custom: Boolean(profile.custom), ...(profile.apiKey ? { apiKey: profile.apiKey } : {}), ...(profile.serverManaged ? { profileId: profile.id } : {}), prompt,
            maxTokens: attemptTokens, temperature, timeout: timeoutSeconds, stream: true,
            dispatchOwner:currentUser()?.id || '', dispatchBook:state.activeBookId || '',
            thinking:thinkingMode(config.deepThinking),
            ...(options.structuredBudget?{responseFormat:'json_object'}:{}),
            ...(revisionTrace?{responseFormat:'json_object'}:{}),
            ...(revisionTrace?{revisionTrace:{...revisionTrace,requestId,networkAttempt:revisionTrace.networkAttempt||attempt+1,profileIndex:candidates.indexOf(profile)}}:{}),
            logRequests: Boolean(config.logRequests), redactPrompts: Boolean(config.redactPrompts)
          })
        });
        if (response.ok) {
          const payload = await response.json();
          if (config.outputValidation) {
            if (!payload || typeof payload.content !== 'string' || !payload.content.trim()) {
              return new Response(JSON.stringify({ error: '模型返回了空内容，已被输出校验拦截' }), { status: 422, headers: { 'content-type': 'application/json' } });
            }
          }
          const attributedResponse = Response.json({ ...payload, provider: profile.label, model: profile.model });
          if (options.cache !== false && config.requestCache) {
            aiResponseCache.set(cacheKey, attributedResponse.clone());
            if (aiResponseCache.size > 50) aiResponseCache.delete(aiResponseCache.keys().next().value);
          }
          return attributedResponse;
        }
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) throw new DOMException('Timeout','AbortError');
        lastError = modelResponseError(response,body);
        if(revisionTrace)Object.assign(lastError,{code:body.code||'UPSTREAM_HTTP',status:response.status,retryable:body.retryable===true});
        revisionEvent('client_request_failed',{requestId,model:profile.model,networkAttempt:attempt+1,httpStatus:response.status,errorCode:revisionErrorCode(lastError)});
        const retryHeader=response.headers.get('retry-after');
        retryAfter=Math.max(0,Number(body.retryAfterMs)|| (Number(retryHeader)*1000) || (Date.parse(retryHeader)-Date.now()) || 0);
        if (body.retryable===false || (response.status < 500 && ![408, 429].includes(response.status))) break;
      } catch (error) {
        revisionEvent('client_request_failed',{requestId,model:profile.model,networkAttempt:attempt+1,errorCode:revisionErrorCode(error)});
        if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        lastError = controller.signal.aborted || error?.name === 'AbortError' ? new Error('模型请求超时，已保留原内容；可重试当前操作') : error;
        if(revisionTrace&&lastError.code===undefined)Object.assign(lastError,{code:controller.signal.aborted?'UPSTREAM_TIMEOUT':'UPSTREAM_NETWORK',retryable:true});
      } finally { clearTimeout(timer); }
    }
  }
  throw lastError || new Error('AI 请求失败');
}

const app = document.querySelector('#app');
globalThis.addEventListener('revision-log-unavailable',()=>showToast('修订日志暂未写入本地服务，正在重试；可在服务恢复后继续记录。'));

function icon(name) {
  const paths = {
    pen: '<path d="m12 20 9-9-3-3-9 9-1 4 4-1Z"/><path d="m15 6 3 3"/>',
    spark: '<path d="m12 3-1.5 5.5L5 10l5.5 1.5L12 17l1.5-5.5L19 10l-5.5-1.5L12 3Z"/><path d="m19 16-.7 2.3L16 19l2.3.7L19 22l.7-2.3L22 19l-2.3-.7L19 16Z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
    bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M12 3v4M5 10h3M16 10h3M5 16h3M16 16h3M7 5l2 2M17 5l-2 2M7 21l2-2M17 21l-2-2"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

let studio;
function render() {
  if (accountSessionChanged) { app.inert=false;app.innerHTML='<main class="auth-shell auth-loading"><section class="panel setting-card"><h2>账户会话已切换</h2><p>此页面已停止读写，请重新打开当前账户的工作区。</p><button class="button primary" data-account-reload>重新打开</button></section></main>';app.querySelector('[data-account-reload]').onclick=()=>location.reload();return; }
  if (authState.loading) { app.inert = false; app.innerHTML = '<main class="auth-shell auth-loading"><section class="panel setting-card"><h2>正在连接本地账户服务…</h2></section></main>'; return; }
  if (!authState.user) { app.inert = false; authCarouselCleanup?.(); authCarouselCleanup = null; app.innerHTML = authView(); bindAuthEvents(); authCarouselCleanup = bindAuthCarousel(); return; }
  authCarouselCleanup?.(); authCarouselCleanup = null;
  if (!environment.passed) {
    app.inert = false;
    app.innerHTML = environmentView(environment, escapeHtml, environmentRepair && hasSystemAdminRole() ? globalSettingsView() : '');
    bindEvents();
    app.querySelector('[data-environment-retry]')?.addEventListener('click', () => void runStartupChecks());
    app.querySelector('[data-environment-repair]')?.addEventListener('click', () => { environmentRepair = !environmentRepair; state.activeTab = 'global'; render(); });
    return;
  }
  if (!storageReady) { app.inert=false;app.innerHTML='<main class="auth-shell auth-loading"><section class="panel setting-card"><h2>正在读取当前账户的数据库作品…</h2></section></main>';return; }
  app.inert = false;
  if (!studio) return;
  app.innerHTML = studio.view();
  app.querySelector('.wf-page-title')?.insertAdjacentHTML('beforebegin', `<section class="environment-summary" role="status">✓ 当前创作环境已就绪${environmentDetails(environment, escapeHtml)}</section>`);
  app.insertAdjacentHTML('beforeend', floatingToolsView());
  renderSaveStatus();
  bindEvents();
  studio.bind();
  enhanceMobileUI({ icon });
}

function floatingToolsView() {
  const names = new Set(inspirationNames(floatingTools.names));
  const result = key => floatingTools[key]?.length ? `<ol>${floatingTools[key].map(item => `<li>${escapeHtml(formatInspiration(item))}</li>`).join('')}</ol>` : '<p class="floating-empty">点击生成，结果保留在灵感工具中。</p>';
  const outdated = key => key === 'relationships' ? floatingTools[key].some(item => !names.has(item?.from) || !names.has(item?.to)) : key === 'personalities' && floatingTools[key].some(item => !names.has(item?.name));
  return `<aside class="floating-ai-tools ${floatingTools.open ? 'is-open' : ''}" aria-label="灵感工具"><button class="floating-ai-toggle" data-floating-toggle aria-expanded="${floatingTools.open}" title="灵感工具">✦</button><div class="floating-ai-panel"><div class="floating-ai-head"><b>灵感工具</b><button class="floating-ai-close" data-floating-toggle aria-label="收起灵感工具">×</button></div><p class="floating-ai-subtitle">本地随机生成，无需 AI 或 Key。</p>${Object.entries(INSPIRATION_LABELS).map(([key,label]) => `<section class="floating-ai-section" data-inspiration-section="${key}"><div class="floating-ai-section-head"><b>${label}</b><button class="button secondary compact" data-floating-action="${key}">生成</button></div>${['relationships', 'personalities'].includes(key) ? `<p class="floating-ai-subtitle">使用名字定制中的 20 人名单。${outdated(key) ? '旧结果已保留，点击生成可关联新名单。' : ''}</p>` : ''}${key === 'memes' ? `<p class="floating-ai-subtitle">离线词库 · 按参考流行年份从新到旧排列，非实时热榜。</p><label class="floating-note-toggle"><input type="checkbox" data-floating-note ${floatingTools.noteVisible ? 'checked' : ''}>显示热梗便签</label>` : ''}<div class="floating-ai-result ${key === 'memes' ? 'floating-note' : ''}" ${key === 'memes' && !floatingTools.noteVisible ? 'hidden' : ''}>${result(key)}</div></section>`).join('')}</div></aside>`;
}

function saveFloatingTools() {
  try {
    const prior = JSON.parse(accountLocalStorage.getItem('novelforge-floating-ai-v1') || '{}');
    accountLocalStorage.setItem('novelforge-floating-ai-v1', JSON.stringify({ ...prior, ...floatingTools, loading: '' }));
    return true;
  } catch { return false; }
}
function refreshFloatingTools() {
  const host = document.querySelector('.floating-ai-tools');
  if (!host) return;
  const scroll = host.querySelector('.floating-ai-panel')?.scrollTop || 0;
  // Update only the tool panel so an unsaved editor buffer and focus survive.
  host.outerHTML = floatingToolsView();
  const panel = document.querySelector('.floating-ai-panel');
  if (panel) panel.scrollTop = scroll;
  bindFloatingTools();
}
function runFloatingTool(kind) {
  try {
    const value = generateInspiration(kind, floatingTools.names);
    floatingTools[kind] = value;
    if (kind === 'memes') floatingTools.noteVisible = true;
    floatingTools.updatedAt = new Date().toISOString();
    const saved = saveFloatingTools();
    refreshFloatingTools();
    showToast(`${INSPIRATION_LABELS[kind]}已生成${saved ? '。' : '，浏览器暂存失败，请复制保留结果。'}`);
  } catch (error) { showToast(error.message || '生成失败，已有结果保留。'); }
}
function bindFloatingTools() {
  const host = document.querySelector('.floating-ai-tools');
  if (!host) return;
  host.querySelectorAll('[data-floating-toggle]').forEach(el => el.addEventListener('click', () => { floatingTools.open = !floatingTools.open; refreshFloatingTools(); }));
  host.querySelectorAll('[data-floating-action]').forEach(el => el.addEventListener('click', () => runFloatingTool(el.dataset.floatingAction)));
  host.querySelector('[data-floating-note]')?.addEventListener('change', event => {
    floatingTools.noteVisible = event.target.checked;
    const saved = saveFloatingTools();
    refreshFloatingTools();
    if (!saved) showToast('便签显示设置尚未保存。');
  });
}

function authView() {
  return authPageView(authState);
}
function bindAuthEvents() {
  document.querySelector('[data-auth-register]')?.addEventListener('click', () => { authState.bootstrapRequired = false; authState.register = true; authState.error = ''; authState.form = {}; render(); });
  document.querySelector('[data-auth-back]')?.addEventListener('click', () => { authState.register = false; authState.error = ''; authState.form = {}; render(); });
  document.querySelector('[data-auth-form]')?.addEventListener('submit', async event => {
    event.preventDefault(); if (authState.pending) return; const form = event.currentTarget, data = Object.fromEntries(new FormData(form)); authState.form = { ...data };
    if ((authState.bootstrapRequired || authState.register) && data.password !== data.confirmPassword) { authState.error = '两次输入的密码不一致。'; render(); return; }
    authState.pending = true; const submit = form.querySelector('[type="submit"]'); if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try { const path = authState.bootstrapRequired ? '/api/auth/bootstrap' : authState.register ? '/api/auth/register' : '/api/auth/login'; const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || '账户操作失败。'); announceAccountSession(body.user.id); try { sessionStorage.setItem('bookworm-login-entry',body.user.id); } catch {} storageStatus={saved:true,message:''}; location.reload(); } catch (error) { authState.pending = false; authState.error = error.message || '账户操作失败。'; render(); }
  });
}

function escapeHtml(value) { return String(value || '').replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])); }

function configToggle(scope, key, label) {
  const fixed = {safeMode:'固定保护',redactPrompts:'始终脱敏',streamOutput:'始终开启',outputValidation:'始终校验',aiCoAuthor:'按流程调用',consistencyGuard:'复用现有审查',autoSceneCards:'按流程生成',preserveAuthorVoice:'固定保留作者要求',allowInvite:'由用户管理分配',auditLog:'账户及请求账本保留',backupEnabled:'仅手动整体备份',allowAdultContent:'由作品分级与服务商规则约束'};
  if(fixed[key])return `<span class="setting-hint">${fixed[key]}</span>`;
  const config = state[scope];
  return `<button class="toggle ${booleanValue(config[key]) ? 'on' : ''}" data-config-toggle="${scope}.${key}" aria-label="${label}" aria-pressed="${booleanValue(config[key])}"><i></i></button>`;
}

function featureToggle(key, label) {
  const enabled = booleanValue(state.authorSettings.featureToggles?.[key],true);
  const hint = enabled && !featureEnabled(state,key) ? ' title="因上级开关关闭而未生效，已填内容保留"' : '';
  return `<button class="toggle ${enabled ? 'on' : ''}" data-feature-toggle="${key}"${hint} aria-label="${label}" aria-pressed="${enabled}"><i></i></button>`;
}

function configRange(scope, key, label, min, max, step, suffix = '') {
  const value = state[scope][key];
  return `<div class="config-range"><label>${label}<output>${value}${suffix}</output></label><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-config-range="${scope}.${key}" data-suffix="${suffix}"></div>`;
}

function multiChoice(scope, field, options) {
  const selected = state[scope][field] || [];
  return `<div class="multi-choice">${options.map(option => `<button type="button" class="chip ${selected.includes(option) ? 'selected' : ''}" data-multi-field="${scope}.${field}" data-multi-value="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join('')}</div>`;
}

function settingsRoleTabs() {
  const roles = [['author', '作者配置', '写作目标、题材与叙事规则'], ['programmer', '程序员配置', '模型、运行策略与数据行为'], ['admin', '超级管理员', '权限、审计与工作区治理']];
  return `<div class="workspace-rolebar">${roles.map(([id, label, hint]) => `<button class="workspace-role ${state.settingsRole === id ? 'active' : ''}" data-settings-role="${id}"><b>${label}</b><small>${hint}</small></button>`).join('')}</div>`;
}

function authorSettingsPanel() {
  const settingToggle = (key, label) => `<button class="toggle ${state.settings[key] ? 'on' : ''}" data-setting="${key}" aria-label="${label}"><i></i></button>`;
  const plotField = (key, label, options) => `<div class="plot-config-block"><div class="config-label-row"><label>${label} · 可多选</label>${featureToggle(key, `启用${label}`)}</div>${multiChoice('authorSettings', key, options)}</div>`;
  const tagLibrary = Object.entries(globalNovelTagGroups).map(([group, tags]) => `<div class="tag-library-group"><small>${group}</small>${multiChoice('authorSettings', 'globalNovelTags', tags)}</div>`).join('');
  const customField = (field, label, placeholder) => `<div class="custom-entry"><input class="model-input" data-custom-input="${field}" placeholder="${placeholder}"><button class="button secondary" data-custom-add="${field}">${icon('plus')} 添加</button></div>`;
  return `${state.activeTab === 'automatic' || state.entryMode === 'novice' && state.activeTab === 'settings' ? '' : storyBibleView(state, escapeHtml)}<div class="setting-grid workspace-settings-grid">
    <div class="panel setting-card wide-card"><div class="setting-title"><span class="setting-icon teal">${icon('book')}</span><div><h3>作品定位与叙事基因</h3><small>多选后会作为全书长期创作约束，每章生成都会继承</small></div><span class="live-tag">作者</span></div>
      <div class="config-label-row"><label>题材标签 · 可多选</label>${featureToggle('genres', '启用题材标签')}</div>${multiChoice('authorSettings', 'genres', authorOptionSets.genres)}
      <div class="config-label-row"><label>语言气质 · 可多选</label>${featureToggle('styles', '启用语言气质')}</div>${multiChoice('authorSettings', 'styles', authorOptionSets.styles)}
      <div class="config-two-col"><div><div class="config-label-row"><label>叙事视角 · 可多选</label>${featureToggle('pov', '启用叙事视角')}</div>${multiChoice('authorSettings', 'pov', authorOptionSets.pov)}</div><div><div class="config-label-row"><label>时间组织 · 可多选</label>${featureToggle('tense', '启用时间组织')}</div>${multiChoice('authorSettings', 'tense', authorOptionSets.tense)}</div></div>
      <div class="config-two-col"><div><div class="config-label-row"><label>目标读者 · 可多选</label>${featureToggle('audience', '启用目标读者')}</div>${multiChoice('authorSettings', 'audience', authorOptionSets.audience)}</div><div><div class="config-label-row"><label>内容分级 · 可多选</label>${featureToggle('contentRating', '启用内容分级')}</div>${multiChoice('authorSettings', 'contentRating', authorOptionSets.contentRating)}</div></div>
    </div>
    <div class="panel setting-card wide-card"><div class="setting-title"><span class="setting-icon teal">${icon('spark')}</span><div><h3>作品全局标签</h3><small>每一本小说独立保存；可从本地整理的高口碑网文常见评价维度多选，也可自定义输入</small></div>${featureToggle('globalNovelTags', '启用作品全局标签')}</div><div class="tag-library ${state.authorSettings.featureToggles.globalNovelTags === false ? 'is-disabled' : ''}">${tagLibrary}</div>${customField('globalNovelTags', '自定义全局标签', '输入标签后点击添加，支持一次输入多个逗号分隔标签')}<div class="selected-custom-tags"><label>当前已选 ${state.authorSettings.globalNovelTags.length} 个标签</label><div class="multi-choice" data-selected-values="globalNovelTags">${state.authorSettings.globalNovelTags.map(tag => `<button class="chip selected" data-multi-field="authorSettings.globalNovelTags" data-multi-value="${escapeHtml(tag)}">${escapeHtml(tag)} ×</button>`).join('')}</div></div></div>
    <div class="panel setting-card wide-card"><div class="setting-title"><span class="setting-icon orange">${icon('spark')}</span><div><h3>情节工程</h3><small>把故事推进拆成可独立启用的推理模块，选择结果会进入 AI 长期创作约束</small></div>${settingToggle('coreEnabled', '启用故事核心')}</div>
      <div class="config-two-col">${plotField('structure', '结构模板', authorOptionSets.structure)}${plotField('pacing', '节奏策略', authorOptionSets.pacing)}${plotField('conflict', '主要冲突', authorOptionSets.conflict)}${plotField('endings', '结局偏好', authorOptionSets.endings)}${plotField('plotGoals', '阶段剧情目标', authorOptionSets.plotGoals)}${plotField('openingHooks', '开篇与场景钩子', authorOptionSets.openingHooks)}${plotField('causality', '因果与逻辑约束', authorOptionSets.causality)}${plotField('infoReveal', '信息投放方式', authorOptionSets.infoReveal)}${plotField('tension', '张力曲线', authorOptionSets.tension)}${plotField('risk', '风险与代价', authorOptionSets.risk)}${plotField('foreshadowPlan', '伏笔规划', authorOptionSets.foreshadowPlan)}${plotField('reversalPlan', '反转规划', authorOptionSets.reversalPlan)}${plotField('revealPace', '揭秘节奏', authorOptionSets.revealPace)}${plotField('subplot', '支线类型', authorOptionSets.subplot)}${plotField('chapterDensity', '章节密度', authorOptionSets.chapterDensity)}${plotField('sceneObjective', '场景目标', authorOptionSets.sceneObjective)}${plotField('payoff', '回报与爽点', authorOptionSets.payoff)}${plotField('obstacleEscalation', '障碍升级', authorOptionSets.obstacleEscalation)}</div>
      <div class="plot-motto-block"><div class="config-label-row"><label>主角座右铭 · 逆境/高潮时可选用</label>${featureToggle('protagonistMottos', '启用主角座右铭')}</div><details class="motto-dropdown" ${state.mottoLibraryOpen ? 'open' : ''}><summary>从 ${protagonistMottoLibrary.length} 句候选中多选，当前已选 ${state.authorSettings.protagonistMottos.length} 句</summary><div class="multi-choice motto-list">${protagonistMottoLibrary.map(motto => `<button type="button" class="chip ${state.authorSettings.protagonistMottos.includes(motto) ? 'selected' : ''}" data-multi-field="authorSettings.protagonistMottos" data-multi-value="${escapeHtml(motto)}">${escapeHtml(motto)}</button>`).join('')}</div></details>${customField('protagonistMottos', '自定义座右铭', '输入一句主角在逆境或高潮时说的话')}<div class="multi-choice" data-selected-values="protagonistMottos">${state.authorSettings.protagonistMottos.map(motto => `<button type="button" class="chip selected" data-multi-field="authorSettings.protagonistMottos" data-multi-value="${escapeHtml(motto)}">${escapeHtml(motto)} ×</button>`).join('')}</div></div>
    </div>
    <div class="panel setting-card"><div class="setting-title"><span class="setting-icon purple">${icon('pen')}</span><div><h3>人物与世界观</h3><small>让角色动机和世界规则先于正文确定</small></div></div>
      <div class="config-label-row"><label>主角姓名与目标</label>${featureToggle('protagonist', '启用主角定义')}</div><input class="model-input" data-config-text="authorSettings.protagonistName" value="${escapeHtml(state.authorSettings.protagonistName)}"><input class="model-input" data-config-text="authorSettings.protagonistGoal" value="${escapeHtml(state.authorSettings.protagonistGoal)}">
      <label>主角性格 · 可多选</label>${multiChoice('authorSettings', 'protagonistTraits', authorOptionSets.protagonistTraits)}
      <div class="config-label-row"><label>人物角色 · 可多选</label>${featureToggle('characters', '启用人物角色')}</div>${multiChoice('authorSettings', 'characterSlots', ['主角', '核心配角', '普通配角', '反派', '导师', '盟友', '对手', '群像成员', '历史人物', '旁白者'])}<label>配角设定</label><textarea class="story-input" data-config-text="authorSettings.supportingCharacters">${escapeHtml(state.authorSettings.supportingCharacters)}</textarea>
      <div class="config-label-row"><label>人物关系 · 可多选</label>${featureToggle('relations', '启用人物关系')}</div>${multiChoice('authorSettings', 'characterRelationTypes', ['利益合作', '亲情牵绊', '爱情关系', '师徒关系', '秘密牵连', '互相利用', '亦敌亦友', '盟友背叛', '血缘冲突', '价值观冲突'])}<textarea class="story-input" data-config-text="authorSettings.relationshipMap">${escapeHtml(state.authorSettings.relationshipMap)}</textarea>
      <div class="config-label-row"><label>世界观与规则</label>${featureToggle('world', '启用世界观')}</div><textarea class="story-input large-input" data-config-text="authorSettings.worldSetting">${escapeHtml(state.authorSettings.worldSetting)}</textarea>
      <div class="config-label-row"><label>核心主题</label>${featureToggle('theme', '启用核心主题')}</div><textarea class="story-input" data-config-text="authorSettings.coreTheme">${escapeHtml(state.authorSettings.coreTheme)}</textarea>
    </div>
    <div class="panel setting-card"><div class="setting-title"><span class="setting-icon blue">${icon('clock')}</span><div><h3>时间、主线与内容提示</h3><small>每个要素都有独立开关，按需参与 AI 推理</small></div></div>
      <div class="config-label-row"><label>时间背景</label>${featureToggle('time', '启用时间背景')}</div><textarea class="story-input" data-config-text="authorSettings.timeSetting">${escapeHtml(state.authorSettings.timeSetting)}</textarea>
      <div class="config-label-row"><label>情节要素 · 可多选</label>${featureToggle('plotElements', '启用情节要素')}</div>${multiChoice('authorSettings', 'plotElements', ['能力获得', '线索追查', '关系成长', '资源争夺', '身份秘密', '组织对抗', '生存挑战', '历史事件', '职业成长', '家庭矛盾'])}
      <div class="config-label-row"><label>故事明线</label>${featureToggle('mainline', '启用故事明线')}</div><textarea class="story-input" data-config-text="authorSettings.mainline">${escapeHtml(state.authorSettings.mainline)}</textarea>
      <div class="config-label-row"><label>故事暗线</label>${featureToggle('hiddenLine', '启用故事暗线')}</div><textarea class="story-input" data-config-text="authorSettings.hiddenLine">${escapeHtml(state.authorSettings.hiddenLine)}</textarea>
      <div class="config-label-row"><label>内容标签 · 可多选</label>${featureToggle('contentTags', '启用内容标签')}</div>${multiChoice('authorSettings', 'contentTags', plotTagGroups.内容标签)}
    </div>
    <div class="panel setting-card wide-card"><div class="setting-title"><span class="setting-icon orange">${icon('book')}</span><div><h3>历史参考与考据边界</h3><small>允许补写史料空白，但不改写真实历史结局</small></div>${featureToggle('historicalReference', '启用历史参考')}</div>
      <div class="rule-row"><span>参考历史记载</span>${configToggle('authorSettings', 'historicalReferenceEnabled', '参考历史记载')}</div><div class="config-two-col"><div><label>历史时期</label><input class="model-input" data-config-text="authorSettings.historicalPeriod" value="${escapeHtml(state.authorSettings.historicalPeriod)}"></div><div><label>参考历史事件</label><input class="model-input" data-config-text="authorSettings.historicalEvents" value="${escapeHtml(state.authorSettings.historicalEvents)}"></div></div><label>考据约束说明</label><textarea class="story-input" data-config-text="authorSettings.historicalCanonNotes">${escapeHtml(state.authorSettings.historicalCanonNotes)}</textarea>
    </div>
    <div class="panel setting-card"><div class="setting-title"><span class="setting-icon blue">${icon('sliders')}</span><div><h3>作者工作流</h3><small>每个行为都可以单独关闭，不改变其他配置</small></div></div>
      <div class="rule-row"><span>启用故事核心约束</span>${settingToggle('coreEnabled', '启用故事核心约束')}</div><div class="rule-row"><span>保持正向成长线</span>${settingToggle('growthRule', '保持正向成长线')}</div><div class="rule-row"><span>反降智与因果检查</span>${settingToggle('antiStupidRule', '反降智与因果检查')}</div><div class="rule-row"><span>AI 自动生成场景卡</span>${configToggle('authorSettings', 'autoSceneCards', 'AI 自动生成场景卡')}</div><div class="rule-row"><span>保持作者原有语气</span>${configToggle('authorSettings', 'preserveAuthorVoice', '保持作者原有语气')}</div><div class="rule-row"><span>生成后自动做人物一致性检查</span>${configToggle('authorSettings', 'consistencyGuard', '生成后自动做人物一致性检查')}</div><div class="rule-row"><span>启用人性化模拟</span>${featureToggle('humanization', '启用人性化模拟')}</div>
    </div>
    <div class="panel setting-card"><div class="setting-title"><span class="setting-icon teal">${icon('clock')}</span><div><h3>生成规模</h3><small>适合先试写、再扩大连载规模</small></div><b class="setting-hint">生成必需</b></div><div class="number-grid"><div><label>总章节</label><div class="stepper"><button data-scale="totalChapters" data-delta="-10">−</button><b>${state.scale.totalChapters}</b><button data-scale="totalChapters" data-delta="10">+</button></div></div><div><label>每章字数</label><div class="stepper"><button data-scale="wordsPerChapter" data-delta="-500">−</button><b>${state.scale.wordsPerChapter.toLocaleString()}</b><button data-scale="wordsPerChapter" data-delta="500">+</button></div></div><div><label>建议核心人物数</label><div class="stepper"><button data-scale="characters" data-delta="-1">−</button><b>${state.scale.characters}</b><button data-scale="characters" data-delta="1">+</button></div></div><div><label>每日写作计划</label><div class="stepper"><button data-scale="dailyChapters" data-delta="-1">−</button><b>${state.scale.dailyChapters} 章</b><button data-scale="dailyChapters" data-delta="1">+</button></div></div></div><div class="rule-row"><span>编辑自动保存（个人偏好）</span>${configToggle('programmerSettings','autoSave','编辑自动保存')}</div><div class="setting-hint" data-scale-estimate>每日写作计划为作者自定目标，不触发后台日程。预计全书约 ${(state.scale.totalChapters * state.scale.wordsPerChapter / 10000).toFixed(1)} 万字。</div><div class="rule-row"><span>AI 章节审查总开关</span><button type="button" class="toggle ${chapterReviewEnabled(state) ? 'on' : ''}" data-chapter-review-toggle role="switch" aria-checked="${chapterReviewEnabled(state)}" aria-label="AI 章节审查总开关" aria-describedby="chapter-review-policy-hint"><i></i></button></div><div class="setting-hint" id="chapter-review-policy-hint">${chapterReviewEnabled(state) ? '已开启：每章完成 AI 审查后继续下一章，完成全书后再执行终审。' : '已关闭：写作与修订后不执行章节审查；全书写完后，在全书终审统一检查所有章节并辅助修订。'} 此开关仅作用于当前作品，已有审查记录保留。</div></div>
    <div class="panel setting-card humanization-card">${humanizationView()}</div>
  </div>`;
}

function programmerSettingsPanel() {
  const profile = activeAiProfile() || defaultAiProfiles[0];
  const roleBindings = Object.entries(aiRoleLabels).map(([role, label]) => `<div class="ai-role-binding"><label>${label}</label><select class="native-select" data-ai-role="${role}">${state.aiProfiles.map(item => `<option value="${item.id}" ${item.id === state.aiRoles[role] ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select><div class="ai-role-test-row"><button class="button secondary" data-action="test-ai-role:${role}">测试此角色</button><small data-ai-role-status="${role}">${escapeHtml(roleTestFeedback(role))}</small></div></div>`).join('');
  const modelList = profileModels(profile);
  const modelStatus = profile.modelsFetchedAt ? `上次读取：${new Date(profile.modelsFetchedAt).toLocaleString('zh-CN')}` : modelList.length ? `已提供 ${modelList.length} 个常用模型，可继续读取接口最新列表` : '尚未读取模型列表';
  const collaborationStatus = aiCollaborationReady() ? 'AI 协同已就绪，已验证的内置 AI 可直接复用。' : '可为未就绪的角色选择已验证的内置 AI；自定义档案仍可手动测试。';
  const testedProfiles = configuredAiProfiles();
  const testedList = testedProfiles.length
    ? testedProfiles.map(item => {
      const roles = Object.entries(state.aiRoles).filter(([, id]) => id === item.id).map(([role]) => aiRoleLabels[role]).join('、') || '未绑定角色';
      return `<li><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.model || '未填写模型')} · ${escapeHtml(normalizeAiEndpoint(item.endpoint) || '未填写接口')}</span><small>测试通过 · ${escapeHtml(roles)}</small><button class="button danger compact" data-ai-remove="${escapeHtml(item.id)}" aria-label="删除 ${escapeHtml(item.label)}">删除</button></li>`;
    }).join('')
    : '<li class="empty">还没有测试通过并保存的 AI 档案。</li>';
  return `<div class="setting-grid workspace-settings-grid">
    <div class="panel setting-card wide-card ai-config"><div class="setting-title"><span class="setting-icon teal">${icon('spark')}</span><div><h3>AI 协同与 OpenAI-compatible 连接</h3><small>内置多家兼容接口，也可新增自定义档案；模型列表可从接口读取并手动选择</small></div><span class="live-tag">${profile.serverManaged ? '服务器已保存' : state.envAiConfigured ? '环境变量已配置' : 'BYOK'}</span></div><div class="number-grid ai-role-grid">${roleBindings}</div><div class="setting-hint ai-collaboration-status" data-ai-collaboration-status role="status" aria-live="polite">${escapeHtml(collaborationStatus)}</div><section class="ai-tested-list" aria-live="polite"><h4>已配置通过的 AI</h4><ul data-ai-tested-list>${testedList}</ul></section><div class="ai-profile-row"><div><label>当前编辑档案</label><select class="native-select" id="ai-profile">${state.aiProfiles.map(item => `<option value="${item.id}" ${item.id === profile.id ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></div><button class="button secondary ai-profile-add" data-action="add-ai-profile">＋ 新增自定义档案</button><button class="button danger" data-action="remove-ai-profile">删除当前档案</button></div><div class="ai-model-row"><div><label>模型列表（可选）</label><select class="native-select" id="ai-model-select">${modelOptions(profile)}</select></div><div><label for="ai-model">模型 ID（可手动填写）</label><input class="model-input" id="ai-model" value="${escapeHtml(profile.model)}" spellcheck="false" placeholder="例如：gpt-4o-mini"></div></div><div class="ai-model-actions"><button class="button secondary" data-action="refresh-ai-models">读取模型列表</button><span class="setting-hint">${escapeHtml(modelStatus)}</span></div><label>兼容接口地址</label><input class="model-input" id="ai-endpoint" value="${escapeHtml(profile.endpoint)}" spellcheck="false" placeholder="https://example.com/v1">${profile.serverManaged ? '<div class="ai-actions"><button class="button secondary" data-action="test-ai">手动测试连接</button>' : `<label for="ai-key">API Key · 测试通过后保存在此浏览器</label><input class="secret-input" id="ai-key" type="password" placeholder="${state.envAiConfigured && profile.id === 'deepseek' ? '使用 Worker 环境变量中的 DeepSeek Key' : profile.custom && isLocalAiEndpoint(profile.endpoint) ? '本地接口通常无需 Key' : '未连接，演示模式'}" autocomplete="off" value="${escapeHtml(state.aiKey)}"><div class="ai-actions"><button class="button secondary" data-action="test-ai">测试连接</button><button class="button secondary" data-action="save-ai-key">保存 Key</button><button class="button secondary" data-action="clear-ai-key">清除当前 Key</button>`}<span class="setting-hint" data-ai-test-feedback role="status" aria-live="polite">${escapeHtml(testFeedback(profile) || aiKeyStatus())}</span></div></div>
    <div class="panel setting-card programmer-strategy-card"><div class="setting-title"><span class="setting-icon blue">${icon('sliders')}</span><div><h3>运行策略</h3><small>程序员可控制请求行为和故障恢复</small></div></div><div class="rule-row"><span>启用深度思考（全局）</span>${configToggle('programmerSettings', 'deepThinking', '启用深度思考（全局）')}</div><p class="setting-hint">默认关闭，作用于所有模型与三种创作模式、审查和修订。无法关闭思考的模型使用最低思考强度，正常完成的结果仍可采用。</p><div class="rule-row"><span>编辑自动保存（个人偏好）</span>${configToggle('programmerSettings', 'autoSave', '编辑自动保存（个人偏好）')}</div><div class="rule-row"><span>专业模式本地演示</span>${configToggle('programmerSettings', 'localDemo', '允许本地演示模式')}</div><div class="rule-row"><span>安全输出校验</span>${configToggle('programmerSettings', 'outputValidation', '安全输出校验')}</div><div class="rule-row"><span>启用模型故障转移</span>${configToggle('programmerSettings', 'failoverEnabled', '启用模型故障转移')}</div><div class="rule-row"><span>流式输出</span><b>始终开启</b></div><div class="rule-row"><span>旧入口临时缓存</span>${configToggle('programmerSettings', 'requestCache', '旧入口临时缓存')}</div></div>
    <div class="panel setting-card programmer-parameter-card"><div class="setting-title"><span class="setting-icon orange">${icon('clock')}</span><div><h3>模型参数</h3><small>数据库配置版本：${configClient.version || "待迁移"}</small><small>普通创作默认值；专用审查与修订自动分批处理，保留用量记录和超时保护</small></div></div>${configRange('programmerSettings', 'temperature', '创造性温度', 0, 1.5, 0.05)}${configRange('programmerSettings', 'maxTokens', '普通请求默认输出', 500, 8000, 100, ' tokens')}${configRange('programmerSettings', 'requestTimeout', '请求超时', 10, 300, 5, ' 秒')}${configRange('programmerSettings', 'maxConcurrent', '同一服务账号实际并发上限', 1, 8, 1, ' 路')}${configRange('programmerSettings', 'retryCount', '旧入口连接重试次数', 0, 5, 1, ' 次')}<p class="setting-hint">全书审查工作池 20、图谱与逐章审查工作池 10；实际出站请求共用上方并发上限。不设置创作累计次数或字数配额；失败暂停后可继续。编辑自动保存关闭后，任务恢复检查点仍写入数据库。</p><div class="wf-actions"><button class="button secondary" data-action="reload-global-settings">重新读取全局配置</button><button class="button secondary" data-action="clear-capability-cache">接口升级后清除能力缓存</button></div></div>
    <div class="panel setting-card programmer-privacy-card"><div class="setting-title"><span class="setting-icon purple">${icon('shield')}</span><div><h3>调试与隐私</h3><small>系统诊断由启动环境 NF_SYSTEM_LOGGING 控制，默认关闭；账户审计、请求账本与恢复记录持续保留</small></div></div><div class="rule-row"><span>启用安全模式</span>${configToggle('programmerSettings', 'safeMode', '启用安全模式')}</div><div class="rule-row"><span>旧入口请求诊断（默认关闭）</span>${configToggle('programmerSettings', 'logRequests', '记录请求日志')}</div><div class="rule-row"><span>日志脱敏</span>${configToggle('programmerSettings', 'redactPrompts', '日志脱敏')}</div><div class="setting-hint">API Key 永不进入项目持久化数据，外部请求只经 Worker 白名单转发。</div></div>
  </div>`;
}

function adminSettingsPanel() {
  return `<div class="setting-grid workspace-settings-grid">
    <div class="panel setting-card wide-card"><div class="setting-title"><span class="setting-icon purple">${icon('shield')}</span><div><h3>超级管理员控制台</h3><small>你可以为不同使用者一键开关工作区能力</small></div><span class="live-tag">SUPER ADMIN</span></div><label>工作区名称</label><input class="model-input" data-config-text="adminSettings.workspaceName" value="${escapeHtml(state.adminSettings.workspaceName)}"><p class="setting-hint">角色与权限统一由用户管理分配。</p><div class="setting-hint">注册与角色权限以数据库账户配置为准，不改变作品正文。</div></div>
    <div class="panel setting-card"><div class="setting-title"><span class="setting-icon teal">${icon('check')}</span><div><h3>成员与审核</h3><small>适合多人协作和编辑流程</small></div></div><div class="rule-row"><span>允许邀请协作者</span>${configToggle('adminSettings', 'allowInvite', '允许邀请协作者')}</div><div class="rule-row"><span>导出前需完成创作与终审确认</span><b>审查完成或作者接管</b></div><div class="rule-row"><span>允许导出投稿包</span>${configToggle('adminSettings', 'allowExport', '允许导出投稿包')}</div><div class="rule-row"><span>允许作者删除自己的作品</span>${configToggle('adminSettings', 'allowOwnProjectDelete', '允许作者删除自己的作品')}</div></div>
    <div class="panel setting-card"><div class="setting-title"><span class="setting-icon blue">${icon('download')}</span><div><h3>数据与审计</h3><small>配置留痕、备份和保留周期</small></div></div><div class="rule-row"><span>记录操作审计日志</span>${configToggle('adminSettings', 'auditLog', '记录操作审计日志')}</div><div class="rule-row"><span>启用自动备份</span>${configToggle('adminSettings', 'backupEnabled', '启用自动备份')}</div><div class="rule-row"><span>允许外部模型服务商</span>${configToggle('adminSettings', 'allowExternalProviders', '允许外部模型服务商')}</div><p class="setting-hint">未启用自动备份或按天删除。作品、配置及历史版本保留；可在作品管理中手动整体备份。</p></div>
    <div class="panel setting-card"><div class="setting-title"><span class="setting-icon orange">${icon('clock')}</span><div><h3>内容与维护</h3><small>系统级开关，影响所有作者</small></div></div><div class="rule-row"><span>内容等级</span>${configToggle('adminSettings', 'allowAdultContent', '允许成人向内容')}</div><div class="rule-row"><span>维护模式</span>${configToggle('adminSettings', 'maintenanceMode', '维护模式')}</div><div class="setting-hint">维护时暂停新的模型调用，保留数据库保存和已完成结果恢复。</div></div>
  </div>`;
}

function settingsView() {
  return `<section class="settings-view"><div class="panel settings-hero workspace-settings-hero"><div><span class="panel-kicker">作者配置 · 故事设定</span><h2>作者配置</h2><p>把小说创作定义细化到题材、结构、人物、语言和工作流。</p></div><button class="button primary" data-action="save-settings">${icon('check')} 保存作者配置</button></div>${authorSettingsPanel()}</section>`;
}

function globalSettingsView() {
  const role = ['programmer', 'admin'].includes(state.settingsRole) ? state.settingsRole : 'programmer';
  const copy = role === 'admin'
    ? ['超级管理员', '管理角色权限、协作审核、数据治理和系统级开关。']
    : ['程序员配置', '控制模型连接、运行参数、缓存、日志和故障恢复。'];
  const status = state.globalAssist?.[`${role}Confirmed`] ? '配置已确认' : '尚未确认配置';
  const content = role === 'admin' ? adminSettingsPanel() : programmerSettingsPanel();
  return `<section class="settings-view global-assist-view"><div class="panel settings-hero workspace-settings-hero"><div><span class="panel-kicker">全局辅助 · 系统级配置</span><h2>全局辅助</h2><p>程序员配置与超级管理员配置完成后，作者才能进入故事设定和后续创作流程。</p></div><span class="live-tag">${status}</span></div><div class="global-assist-tabs" role="tablist" aria-label="全局辅助角色"><button class="workspace-role ${role === 'programmer' ? 'active' : ''}" data-global-role="programmer" role="tab" aria-selected="${role === 'programmer'}"><span class="workspace-role-icon">${icon('sliders')}</span><span><b>程序员配置</b><small>模型连接、运行策略与数据行为</small></span><i>${state.globalAssist.programmerConfirmed ? '已完成' : '待完成'}</i></button><button class="workspace-role ${role === 'admin' ? 'active' : ''}" data-global-role="admin" role="tab" aria-selected="${role === 'admin'}"><span class="workspace-role-icon">${icon('shield')}</span><span><b>超级管理员</b><small>用户权限、审核与工作区治理</small></span><i>${state.globalAssist.adminConfirmed ? '已完成' : '待完成'}</i></button></div><div class="global-assist-checklist" aria-label="全局辅助完成状态"><span class="${state.globalAssist.programmerConfirmed ? 'done' : ''}"><b>01</b><span>程序员配置</span><em>${state.globalAssist.programmerConfirmed ? '已确认' : '待完成'}</em></span><span class="${state.globalAssist.adminConfirmed ? 'done' : ''}"><b>02</b><span>超级管理员</span><em>${state.globalAssist.adminConfirmed ? '已确认' : '待完成'}</em></span></div><div class="panel setting-card wide-card global-assist-panel"><div class="setting-title"><span class="setting-icon teal">${icon('shield')}</span><div><h3>${copy[0]}</h3><small>${copy[1]}</small></div><span class="live-tag">正在编辑</span></div>${content}<div class="wf-actions"><button class="button primary" data-action="save-global-settings">${icon('check')} 保存并确认${copy[0]}</button></div></div></section>`;
}

function userManagementView() {
  if (!isSystemAdmin()) return `<section class="panel wf-card"><h2>用户管理</h2><p class="wf-warning">只有系统管理员可以管理用户。</p></section>`;
  const users = Array.isArray(state.serverUsers) ? state.serverUsers : [currentUser()];
  return `<section class="settings-view management-view"><div class="panel settings-hero workspace-settings-hero"><div><span class="panel-kicker">用户管理 · 系统管理员</span><h2>用户管理</h2><p>管理使用系统的用户及其角色。普通用户不能进入全局辅助和系统管理区域。</p></div><span class="live-tag">当前用户：${escapeHtml(currentUser()?.name || '')}</span></div><div class="panel setting-card"><div class="setting-title"><span class="setting-icon teal">${icon('shield')}</span><div><h3>注册与权限</h3><small>新账号默认普通用户组和主笔作者角色；可在下方调整角色或启停账号。</small></div></div><p class="setting-hint">管理员可直接创建可登录账号，添加后仍保持当前管理员登录。</p></div>${accountCreateView()}<div class="panel setting-card"><div class="setting-title"><span class="setting-icon blue">${icon('users')}</span><div><h3>账号列表</h3><small>查看当前用户组与角色，调整权限或启停账号。</small></div></div>${accountListView(users, currentUser()?.id, escapeHtml)}</div></section>`;
}

function worksManagementView() {
  const admin = isSystemAdmin();
  const ownerId = currentUser()?.id;
  const visibleBooks = admin ? state.books : state.books.filter(book => book.ownerId === ownerId);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(visibleBooks.length / pageSize));
  state.worksPage = Math.min(Math.max(1, Number(state.worksPage) || 1), pageCount);
  const page = visibleBooks.slice((state.worksPage - 1) * pageSize, state.worksPage * pageSize);
  const pageIds = page.map(book => book.id);
  for (const id of [...managedBookSelection]) if (!visibleBooks.some(book => book.id === id)) managedBookSelection.delete(id);
  const allSelected = pageIds.length > 0 && pageIds.every(id => managedBookSelection.has(id));
  const health = state.systemHealth || {};
  const logSummary = state.systemLogSummary || { count: 0, totalBytes: 0, loggingEnabled: false };
  const logSize = logSummary.totalBytes >= 1024 * 1024 ? `${(logSummary.totalBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(logSummary.totalBytes / 1024)} KB`;
  const tools = admin ? `<div class="management-tools"><div class="panel setting-card"><div class="setting-title"><span class="setting-icon teal">${icon('spark')}</span><div><h3>AI 接口健康</h3><small>${health.checkedAt ? `最近检测：${escapeHtml(new Date(health.checkedAt).toLocaleString('zh-CN'))}` : '尚未检测'}</small></div></div><p class="setting-hint">${escapeHtml(health.message || '检测 Worker、环境变量和已配置 AI 档案的可用状态。')}</p><button class="button primary" data-work-action="health">一键检测 AI 接口</button></div><div class="panel setting-card"><div class="setting-title"><span class="setting-icon purple">✦</span><div><h3>质量检查模式</h3><small>多 AI 章节审查、候选修订与作者推荐</small></div></div><p class="setting-hint">原正文只在作者采纳推荐后替换。</p><button class="button primary" data-work-action="quality-check">进入质量检查模式</button></div><div class="panel setting-card"><div class="setting-title"><span class="setting-icon orange">${icon('download')}</span><div><h3>垃圾文件与系统日志</h3><small>清理本地暂存、服务运行和审查追踪日志</small></div></div><p class="setting-hint">当前发现 ${state.garbageFiles.length + logSummary.count} 个可清理文件，共 ${logSize}。系统日志默认关闭${logSummary.loggingEnabled ? '，当前调试追踪已开启' : ''}。</p><button class="button secondary" data-work-action="cleanup">清理垃圾文件与系统日志</button></div><div class="panel setting-card"><div class="setting-title"><span class="setting-icon purple">${icon('shield')}</span><div><h3>系统配置修复</h3><small>恢复缺失配置、修正角色绑定和状态索引</small></div></div><p class="setting-hint">修复操作不会删除作品正文或 API Key。</p><button class="button secondary" data-work-action="repair">一键修复系统配置</button></div><div class="panel setting-card"><div class="setting-title"><span class="setting-icon blue">${icon('download')}</span><div><h3>系统备份</h3><small>源码、SQLite 数据库和系统配置文件</small></div></div><p class="setting-hint">一键生成压缩备份，自动排除系统日志、运行产物和依赖缓存。</p><button class="button secondary" data-work-action="backup">整体备份</button></div></div>` : '';
  return `<section class="settings-view management-view"><div class="panel settings-hero workspace-settings-hero"><div><span class="panel-kicker">作品管理 · ${admin ? '系统管理员' : '我的作品'}</span><h2>作品管理</h2><p>${admin ? '管理系统作品、检测 AI 接口并维护工作区资源。' : '查看和管理当前账号创建的作品。'}</p></div><div class="management-hero-actions"><span class="live-tag">${visibleBooks.length} 本作品</span><button class="button secondary" data-work-action="refresh">刷新数据库作品</button></div></div>${tools}<div class="panel setting-card"><div class="setting-title"><span class="setting-icon blue">${icon('book')}</span><div><h3>作品列表</h3><small>${admin ? '勾选作品后可批量删除，列表支持分页。' : '仅显示当前账号拥有的作品，可删除自己创建的作品。'}</small></div></div><div class="management-list-toolbar"><label><input type="checkbox" data-work-select-all ${allSelected ? 'checked' : ''} ${!page.length ? 'disabled' : ''}> 本页全选</label><span>已选择 ${managedBookSelection.size} 本</span><button class="button danger" data-work-action="batch-delete" ${managedBookSelection.size ? '' : 'disabled'}>${icon('download')} 批量删除</button></div><div class="management-table">${page.map(book => `<div class="management-row"><label class="management-select"><input type="checkbox" data-work-select="${escapeHtml(book.id)}" ${managedBookSelection.has(book.id) ? 'checked' : ''}><span></span></label><div class="management-row-main"><b>${escapeHtml(book.title)}</b><small>${book.chapters?.length || 0} 章 · 最近更新 ${escapeHtml(book.updatedAt ? new Date(book.updatedAt).toLocaleString('zh-CN') : '未知')}</small></div><div class="management-actions">${book.id === state.activeBookId ? '<span class="live-tag">当前作品</span>' : ''}${canDeleteBook(book) ? `<button class="button danger" data-work-action="delete" data-work-id="${escapeHtml(book.id)}">删除</button>` : ''}</div></div>`).join('') || '<div class="management-empty">暂无可显示的作品。</div>'}</div><div class="management-pagination"><button class="button secondary" data-work-page="prev" ${state.worksPage <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${state.worksPage} / ${pageCount} 页</span><button class="button secondary" data-work-page="next" ${state.worksPage >= pageCount ? 'disabled' : ''}>下一页</button></div></div></section>`;
}

function humanizationView() {
  const config = state.humanization;
  const toggle = (key, label) => `<button type="button" class="toggle ${booleanValue(config[key],true) ? 'on' : ''}" data-human-toggle="${key}" aria-label="${label}"><i></i></button>`;
  const range = (field, label, min, max, step, suffix = '%') => `<div class="config-range"><label><span>${label}</span><output>${config[field]}${suffix}</output></label><input type="range" min="${min}" max="${max}" step="${step}" value="${config[field]}" data-human-field="${field}"></div>`;
  const controlView = control => `<div class="humanization-control"><div class="config-label-row"><div><label>${control.label}</label><small>${control.description}</small></div>${toggle(`${control.key}Enabled`, `启用${control.label}`)}</div>${range(`${control.key}Ratio`, '比例', 0, control.max, control.max <= 10 ? '0.5' : '1')}${control.textKey ? `<input class="model-input" value="${escapeHtml(config[control.textKey] || '')}" data-human-field="${control.textKey}" placeholder="${escapeHtml(control.placeholder || '')}">` : ''}</div>`;
  return `<div class="setting-title"><span class="setting-icon orange">${icon('spark')}</span><div><h3>人性化模拟</h3><small>每项独立开关与比例控制，按场景软约束参与写作</small></div>${toggle('enabled', '启用人性化模拟')}</div><div class="humanization-fields"><div class="humanization-control"><div class="config-label-row"><div><label>融入方言比例</label><small>对白中适量使用方言或地域表达</small></div>${toggle('dialectEnabled', '启用方言比例')}</div>${range('dialectRatio', '比例', 0, 40, 1)}</div><div class="humanization-control"><div class="config-label-row"><div><label>吐槽自黑比例</label><small>加入符合人物性格的吐槽或自我调侃</small></div>${toggle('selfDeprecatingEnabled', '启用吐槽自黑比例')}</div>${range('selfDeprecatingRatio', '比例', 0, 40, 1)}</div><div class="humanization-control"><div class="config-label-row"><div><label>常用口头禅</label><small>仅在人物语境自然时使用</small></div>${toggle('catchphrasesEnabled', '启用常用口头禅')}</div><input class="model-input" value="${escapeHtml(config.catchphrases)}" data-human-field="catchphrases" placeholder="例如：行吧、说真的"></div><div class="humanization-control"><div class="config-label-row"><div><label>错别字占比</label><small>只允许极少量、不影响理解</small></div>${toggle('typoEnabled', '启用错别字占比')}</div>${range('typoRatio', '比例', 0, 5, 0.5)}</div><div class="humanization-control"><div class="config-label-row"><div><label>作者今日状态率</label><small>低值偏疲惫犹豫，高值偏轻快笃定</small></div>${toggle('moodEnabled', '启用作者今日状态率')}</div>${range('authorMood', '轻快程度', 0, 100, 1)}</div><div class="humanization-section-title">高级人性化控制</div>${humanizationControls.map(controlView).join('')}</div><div class="setting-hint">比例只作为软约束；AI 始终优先保证人物事实、情节因果、可读性、内容安全与发布规范。</div>`;
}

function showToast(message) { if(!['global','users','works','quality-check'].includes(state.activeTab))message=creationFeedback(message,state.aiProfiles);state.toast = message; const old = document.querySelector('.toast'); if (old) old.remove(); const toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = `${icon('check')}<span>${escapeHtml(message)}</span>`; document.body.appendChild(toast); setTimeout(() => toast.remove(), 2600); }

// Author settings are edited frequently.  Keep the existing DOM and only
// refresh the affected controls so input focus, selection, scroll position and
// open <details> sections survive every change.
function refreshAuthorSettingsUI({ source = null } = {}) {
  const setValue = (el, value) => {
    if (el !== source && el.value !== String(value ?? '')) el.value = value ?? '';
  };
  const setToggle = (el, enabled) => {
    el.classList.toggle('on', Boolean(enabled));
    el.setAttribute(el.getAttribute('role') === 'switch' ? 'aria-checked' : 'aria-pressed', String(Boolean(enabled)));
  };
  document.querySelectorAll('[data-setting]').forEach(el => setToggle(el, booleanValue(state.settings?.[el.dataset.setting], true)));
  document.querySelectorAll('[data-config-toggle]').forEach(el => {
    const [scope, key] = el.dataset.configToggle.split('.');
    if (state[scope]) setToggle(el, booleanValue(state[scope][key]));
  });
  document.querySelectorAll('[data-feature-toggle]').forEach(el => {
    const enabled = booleanValue(state.authorSettings?.featureToggles?.[el.dataset.featureToggle], true);
    setToggle(el, enabled);
    el.title = enabled && !featureEnabled(state, el.dataset.featureToggle) ? '因上级开关关闭而未生效，已填内容保留' : '';
  });
  document.querySelectorAll('[data-multi-field]').forEach(el => {
    const [scope, field] = el.dataset.multiField.split('.');
    const values = Array.isArray(state[scope]?.[field]) ? state[scope][field] : [];
    el.classList.toggle('selected', values.includes(el.dataset.multiValue));
    el.setAttribute('aria-pressed', String(values.includes(el.dataset.multiValue)));
  });
  document.querySelectorAll('[data-selected-values]').forEach(list => {
    const field = list.dataset.selectedValues;
    const values = state.authorSettings[field] || [];
    const existing = new Map([...list.children].map(el => [el.dataset.multiValue, el]));
    for (const [value, el] of existing) if (!values.includes(value)) {
      if (document.activeElement === el) {
        const next = [...list.children].find(item => values.includes(item.dataset.multiValue));
        (next || document.querySelector(`[data-custom-input="${field}"]`))?.focus({preventScroll:true});
      }
      el.remove();
    }
    values.forEach(value => {
      if (existing.has(value)) return;
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'chip selected';
      chip.dataset.multiField = `authorSettings.${field}`; chip.dataset.multiValue = value;
      chip.textContent = `${value} ×`; chip.setAttribute('aria-pressed', 'true');
      chip.addEventListener('click', () => toggleMultiChoice(chip)); list.append(chip);
    });
  });
  document.querySelectorAll('.selected-custom-tags label').forEach(el => { el.textContent = `当前已选 ${state.authorSettings?.globalNovelTags?.length || 0} 个标签`; });
  const mottoSummary = document.querySelector('.motto-dropdown > summary');
  if (mottoSummary) mottoSummary.textContent = `从 ${protagonistMottoLibrary.length} 句候选中多选，当前已选 ${state.authorSettings?.protagonistMottos?.length || 0} 句`;
  document.querySelectorAll('.tag-library').forEach(el => el.classList.toggle('is-disabled', state.authorSettings?.featureToggles?.globalNovelTags === false));
  document.querySelectorAll('[data-scale]').forEach(el => {
    const stepper = el.closest('.stepper'), key = el.dataset.scale;
    const value = state.scale[key];
    const output = stepper?.querySelector('b');
    if (output) output.textContent = key === 'wordsPerChapter' ? Number(value).toLocaleString() : key === 'dailyChapters' ? `${value} 章` : String(value);
  });
  const estimate = document.querySelector('[data-scale-estimate]');
  if (estimate) estimate.textContent = `每日写作计划为作者自定目标，不触发后台日程。预计全书约 ${(state.scale.totalChapters * state.scale.wordsPerChapter / 10000).toFixed(1)} 万字。`;
  const review = document.querySelector('[data-chapter-review-toggle]');
  if (review) {
    const enabled = chapterReviewEnabled(state); setToggle(review, enabled);
    const hint = document.querySelector('#chapter-review-policy-hint');
    if (hint) hint.textContent = `${enabled ? '已开启：每章完成 AI 审查后继续下一章，完成全书后再执行终审。' : '已关闭：写作与修订后不执行章节审查；全书写完后，在全书终审统一检查所有章节并辅助修订。'} 此开关仅作用于当前作品，已有审查记录保留。`;
  }
  document.querySelectorAll('[data-human-toggle]').forEach(el => setToggle(el, booleanValue(state.humanization?.[el.dataset.humanToggle], true)));
  document.querySelectorAll('[data-config-text],[data-config-range]').forEach(el => {
    const [scope, key] = (el.dataset.configText || el.dataset.configRange).split('.');
    // Shared programmer/admin controls retain their own update path.
    if (scope !== 'authorSettings') return;
    setValue(el, state[scope][key]);
    const output = el.type === 'range' && el.previousElementSibling?.querySelector('output');
    if (output) output.textContent = `${el.value}${el.dataset.suffix || ''}`;
  });
  document.querySelectorAll('[data-human-field]').forEach(el => {
    if (el.type === 'button') { setToggle(el, booleanValue(state.humanization[el.dataset.humanField], true)); return; }
    setValue(el, state.humanization[el.dataset.humanField]);
    if (el.type === 'range') { const output = el.previousElementSibling?.querySelector('output'); if (output) output.textContent = `${el.value}%`; }
  });
  // The compact mode forms and full author panel edit the same parameters.
  const compactScale = {chapters:'totalChapters',words:'wordsPerChapter',chapterCount:'totalChapters',wordCount:'wordsPerChapter','chapter-count':'totalChapters'};
  document.querySelectorAll('[data-auto-field]').forEach(el => {
    const key = el.dataset.autoField;
    if (compactScale[key]) setValue(el, state.scale[compactScale[key]]);
    else if (Object.hasOwn(state.authorSettings,key)) setValue(el, Array.isArray(state.authorSettings[key]) ? state.authorSettings[key].join('、') : state.authorSettings[key]);
  });
  document.querySelectorAll('[data-novice-field="chapterCount"],[data-novice-field="wordCount"],[data-wf-field="chapter-count"]').forEach(el => setValue(el,state.scale[compactScale[el.dataset.noviceField || el.dataset.wfField]]));
  document.querySelectorAll('[data-wf-field="constraints"]').forEach(el => setValue(el, state.authorSettings.hardConstraints));
  document.querySelectorAll('[data-autosave-label]').forEach(el => { el.textContent = state.programmerSettings.autoSave ? '自动保存已开启' : '手动保存模式'; });
  refreshStoryBible(state, escapeHtml);
  studio?.refreshSettingsStatus();
}

function toggleMultiChoice(el) {
  const [scope, field] = el.dataset.multiField.split('.');
  const values = Array.isArray(state[scope][field]) ? state[scope][field] : [];
  const value = el.dataset.multiValue;
  state[scope][field] = values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  if (scope === 'authorSettings' && field === 'genres' && state.authorSettings.genres.length) state.selectedGenre = state.authorSettings.genres[0];
  if (scope === 'authorSettings' && field === 'styles' && state.authorSettings.styles.length) state.selectedStyle = state.authorSettings.styles[0];
  persist(); refreshAuthorSettingsUI();
}

function bindEvents() {
  bindFloatingTools();
  document.querySelector('[data-auth-refresh]')?.addEventListener('click', () => void refreshAuthUsers());
  document.querySelectorAll('[data-auth-toggle]').forEach(el => el.addEventListener('click', () => { const user = state.serverUsers?.find(item => item.id === el.dataset.authToggle); if (user) void updateAuthUser(user.id, { status: user.status === 'disabled' ? 'active' : 'disabled' }); }));
  document.querySelectorAll('[data-auth-role]').forEach(el => el.addEventListener('change', () => void updateAuthUser(el.dataset.authRole, { roles: [el.value] })));
  document.querySelector('[data-auth-logout]')?.addEventListener('click', async () => {
    if (studio.isBusy()) return showToast('请先暂停或完成当前操作，再退出登录。');
    try {
      if (storageReady && !storageStatus.saved) await persistRevision();
      const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
      if(!response.ok)throw new Error('退出登录失败，请重试。');
      storageReady=false;clearTimeout(idbSaveTimer);configClient.reset();novelRepository.ready=false;
      authState.user=null;Object.assign(state,structuredClone(pristineAccountState));storageStatus={saved:true,message:''};
      announceAccountSession('');render();location.reload();
    } catch(error) {showToast(error.message);}
  });
  document.querySelector('[data-chapter-review-toggle]')?.addEventListener('click', () => {
    state.settings.chapterReviewEnabled = !chapterReviewEnabled(state);
    persist(true); refreshAuthorSettingsUI();
    showToast(chapterReviewEnabled(state) ? '已开启本作品的逐章 AI 审查。' : '已关闭逐章 AI 审查，本作品将在全书终审统一检查与修订。');
  });
  document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => {
    const tab = el.dataset.tab;
    if (!canAccessTab(tab)) {
      if (['global', 'users', 'works'].includes(tab)) showToast('只有系统管理员可以进入此功能区域。');
      else showToast('请先完成全局辅助中的程序员配置和超级管理员配置。');
      return;
    }
    saveEditor(); state.activeTab = tab;
    if (tab === 'global' && !['programmer', 'admin'].includes(state.settingsRole)) state.settingsRole = 'programmer';
    if (tab === 'settings') state.settingsRole = 'author';
    persist(); render();
    if (tab === 'works') {
      void refreshWorksFromDatabase();
      void refreshSystemLogSummary();
    }
    if (tab === 'users') void refreshAuthUsers();
  }));
  document.querySelectorAll('[data-setting]').forEach(el => el.addEventListener('click', () => { const key = el.dataset.setting; state.settings[key] = !booleanValue(state.settings[key],true); persist(); refreshAuthorSettingsUI(); }));
  document.querySelectorAll('[data-settings-role]').forEach(el => el.addEventListener('click', () => {
    state.settingsRole = el.dataset.settingsRole;
    if (state.settingsRole === 'author') state.activeTab = 'settings';
    else if (state.activeTab === 'settings') state.activeTab = 'global';
    persist(); render();
  }));
  document.querySelector('.motto-dropdown')?.addEventListener('toggle', event => { if (event.target.isConnected) state.mottoLibraryOpen = event.target.open; });
  document.querySelectorAll('[data-multi-field]').forEach(el => el.addEventListener('click', () => toggleMultiChoice(el)));
  document.querySelectorAll('[data-custom-add]').forEach(el => el.addEventListener('click', () => {
    const field = el.dataset.customAdd;
    const input = document.querySelector(`[data-custom-input="${field}"]`);
    const values = String(input?.value || '').split(/[、,，\n]/).map(value => value.trim()).filter(Boolean);
    if (!values.length) return showToast('请输入要添加的内容');
    const current = Array.isArray(state.authorSettings[field]) ? state.authorSettings[field] : [];
    state.authorSettings[field] = [...new Set([...current, ...values])];
    input.value = ''; persist();
    refreshAuthorSettingsUI(); showToast(`已添加 ${values.length} 项配置`);
  }));
  document.querySelectorAll('[data-config-toggle]').forEach(el => el.addEventListener('click', () => {
    const [scope, key] = el.dataset.configToggle.split('.');
    if (scope === 'programmerSettings' && key === 'streamOutput') {
      state.programmerSettings.streamOutput = true;
      persist(); render();
      return;
    }
    state[scope][key] = !booleanValue(state[scope][key]); persist();
    if (scope === 'authorSettings' || scope === 'programmerSettings' && key === 'autoSave') refreshAuthorSettingsUI();
    else render();
  }));
  document.querySelectorAll('[data-feature-toggle]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.featureToggle;
    state.authorSettings.featureToggles[key] = !booleanValue(state.authorSettings.featureToggles[key],true);
    persist(); refreshAuthorSettingsUI();
  }));
  document.querySelectorAll('[data-config-range]').forEach(el => el.addEventListener('input', () => {
    const [scope, key] = el.dataset.configRange.split('.');
    state[scope][key] = Number(el.value); const output = el.previousElementSibling?.querySelector('output');
    if (output) output.textContent = `${el.value}${el.dataset.suffix || ''}`; persist();
    if (scope === 'authorSettings') refreshAuthorSettingsUI({source:el});
  }));
  document.querySelectorAll('[data-config-text]').forEach(el => el.addEventListener('input', () => {
    const [scope, key] = el.dataset.configText.split('.'); state[scope][key] = el.value; persist();
    if (scope === 'authorSettings') refreshAuthorSettingsUI({source:el});
  }));
  document.querySelectorAll('[data-config-step]').forEach(el => el.addEventListener('click', () => {
    const [scope, key] = el.dataset.configStep.split('.'); const limits = { retentionDays: [30, 730] };
    const [min, max] = limits[key] || [0, Number.MAX_SAFE_INTEGER]; state[scope][key] = Math.max(min, Math.min(max, Number(state[scope][key]) + Number(el.dataset.delta))); persist(); render();
  }));
  document.querySelectorAll('[data-scale]').forEach(el => el.addEventListener('click', () => { const key = el.dataset.scale; const limits = { totalChapters: [1, 1000], wordsPerChapter: [500, 10000], characters: [1, 30], dailyChapters: [1, 20] }; state.scale[key] = Math.max(limits[key][0], Math.min(limits[key][1], numberValue(state.scale[key],SCALE_RULES[key]) + Number(el.dataset.delta))); persist(); refreshAuthorSettingsUI(); }));
  const testedList = document.querySelector('[data-ai-tested-list]');
  if (testedList) testedList.onclick = event => { const button = event.target.closest('[data-ai-remove]'); if(button) removeAiProfile(button.dataset.aiRemove); };
  document.querySelectorAll('[data-ai-role]').forEach(el => el.addEventListener('change', async () => {
    state.aiRoles[el.dataset.aiRole] = el.value;
    (state.aiRoleSelections ||= {})[el.dataset.aiRole] = true;
    aiRoleTests.delete(el.dataset.aiRole);
    persistAiTests();
    try { await saveGlobalAiConfiguration({[el.dataset.aiRole]:el.value}); } catch(error) { showToast(error.message); return; }
    persist();
    showToast(`${aiRoleLabels[el.dataset.aiRole]}已绑定 ${state.aiProfiles.find(profile => profile.id === el.value)?.label || el.value}`);
    renderAIStatusOnly();
  }));
  document.querySelectorAll('[data-human-field]').forEach(el => {
    const field = el.dataset.humanField;
    if (el.type === 'range') {
      el.addEventListener('input', () => {
        state.humanization[field] = Number(el.value);
        const output = el.previousElementSibling?.querySelector('output');
        if (output) output.textContent = `${el.value}%`;
        persist();
        refreshAuthorSettingsUI({source:el});
      });
    } else if (el.type === 'button') {
      el.addEventListener('click', () => { state.humanization[field] = !booleanValue(state.humanization[field],true); persist(); refreshAuthorSettingsUI(); });
    } else {
      el.addEventListener('input', () => { state.humanization[field] = el.value; persist(); refreshAuthorSettingsUI({source:el}); });
    }
  });
  document.querySelectorAll('[data-human-toggle]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.humanToggle;
    state.humanization[key] = !booleanValue(state.humanization[key],true);
    persist(); refreshAuthorSettingsUI();
  }));
  const idea = document.querySelector('#story-idea');
  if (idea) idea.addEventListener('input', () => { state.storyIdea = idea.value; persist(); });
  document.querySelectorAll('[data-global-role]').forEach(el => el.addEventListener('click', () => {
    if (!requireSystemAdmin('只有系统管理员可以进入全局辅助。')) return;
    state.activeTab = 'global'; state.settingsRole = el.dataset.globalRole; persist(); render();
  }));
  bindAccountCreate({onCreated:user=>{state.serverUsers=[...(state.serverUsers||[currentUser()]).filter(u=>u.id!==user.id),user];render();showToast('账号已添加，可使用初始密码登录。');}});
  document.querySelectorAll('[data-user-action]').forEach(el => el.addEventListener('click', () => userAction(el.dataset.userAction, el.dataset.userId)));
  document.querySelectorAll('[data-work-action]').forEach(el => el.addEventListener('click', () => workAction(el.dataset.workAction, el.dataset.workId)));
  document.querySelector('[data-work-select-all]')?.addEventListener('change', event => {
    const pageIds = [...document.querySelectorAll('[data-work-select]')].map(el => el.dataset.workSelect);
    pageIds.forEach(id => event.target.checked ? managedBookSelection.add(id) : managedBookSelection.delete(id));
    render();
  });
  document.querySelectorAll('[data-work-select]').forEach(el => el.addEventListener('change', event => {
    if (event.target.checked) managedBookSelection.add(event.target.dataset.workSelect); else managedBookSelection.delete(event.target.dataset.workSelect);
    render();
  }));
  document.querySelectorAll('[data-work-page]').forEach(el => el.addEventListener('click', () => {
    state.worksPage = Math.max(1, Number(state.worksPage || 1) + (el.dataset.workPage === 'next' ? 1 : -1));
    render();
  }));
  const key = document.querySelector('#ai-key');
  if (key) key.addEventListener('input', () => updateAiKey(key.value));
  const profileSelect = document.querySelector('#ai-profile');
  if (profileSelect) profileSelect.addEventListener('change', () => {
    const previous = activeAiProfile();
    syncAiForm();
    if (previous?.apiKey && !profileKeySaved(previous)) showToast('当前档案的 Key 尚未保存；切换后仍会保留在本页，测试通过后请点击“保存 Key”。');
    const profile = state.aiProfiles.find(item => item.id === profileSelect.value);
    if (!profile) return;
    state.activeAiProfile = profile.id; state.aiProvider = profile.label; state.aiModel = profile.model; state.aiBaseUrl = profile.endpoint; state.aiKey = profile.apiKey || '';
    persist(); render();
  });
  const modelSelect = document.querySelector('#ai-model-select');
  if (modelSelect) modelSelect.addEventListener('change', () => {
    if (!modelSelect.value) return;
    const modelInput = document.querySelector('#ai-model');
    if (modelInput) modelInput.value = modelSelect.value;
    state.aiModel = modelSelect.value;
    const profile = activeAiProfile();
    if (profile) { profile.model = state.aiModel; invalidateAiProfileTest(profile); }
    persist();
  });
  const model = document.querySelector('#ai-model');
  if (model) model.addEventListener('input', () => { state.aiModel = model.value.trim() || 'your-model'; const profile = activeAiProfile(); if (profile) { profile.model = state.aiModel; invalidateAiProfileTest(profile); } persist(); renderAIStatusOnly(); });

  const endpoint = document.querySelector('#ai-endpoint');
  if (endpoint) endpoint.addEventListener('input', () => { state.aiBaseUrl = endpoint.value.trim(); const profile = activeAiProfile(); if (profile) { profile.endpoint = state.aiBaseUrl; invalidateAiProfileTest(profile); } persist(); renderAIStatusOnly(); });
  if (endpoint) endpoint.addEventListener('change', () => { const normalized = normalizeAiEndpoint(endpoint.value); endpoint.value = normalized; state.aiBaseUrl = normalized; const profile = activeAiProfile(); if (profile) { profile.endpoint = normalized; invalidateAiProfileTest(profile); } persist(); renderAIStatusOnly(); });
  document.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => action(el.dataset.action)));
}

function renderAIStatusOnly() {
  const status = document.querySelector('.wf-ai-status');
  if (status) status.innerHTML = `${icon('spark')}${aiCollaborationReady() ? 'AI 协同已就绪 · 可直接使用' : configuredAiProfiles().length || state.envAiConfigured ? 'AI 已配置 · 请查看角色绑定' : '演示模式 · 正式审查需连接 AI'}`;
  const keyStatus = document.querySelector('[data-ai-key-status]');
  if (keyStatus) keyStatus.textContent = aiKeyStatus();
  const feedback = document.querySelector('[data-ai-test-feedback]');
  if (feedback) feedback.textContent = testFeedback() || aiKeyStatus();
  const collaboration = document.querySelector('[data-ai-collaboration-status]');
  if (collaboration) collaboration.textContent = aiCollaborationReady() ? 'AI 协同已就绪，已验证的内置 AI 可直接复用。' : '可为未就绪的角色选择已验证的内置 AI；自定义档案仍可手动测试。';
  document.querySelectorAll('[data-ai-role-status]').forEach(el => { el.textContent = roleTestFeedback(el.dataset.aiRoleStatus); });
  renderTestedAiList();
}

function createBook() {
  const title = window.prompt('请输入新作品名称', `未命名作品 ${state.books.length + 1}`)?.trim();
  if (!title) return;
  saveActiveBook();
  const authorSettings = blankAuthorSettings();
  const book = { id: crypto.randomUUID(), ownerId: currentUser()?.id || defaultUsers[0].id, title, updatedAt: new Date().toISOString(), entryMode: 'expert', noviceSetup: { genre: '', wordCount: 3000, chapterCount: defaultScale.totalChapters, protagonistName: '', protagonistGender: '未指定', tags: '', premise: '' }, storyIdea: '', drafts: {}, chapters: [], outline: [], graph: newGraph(), scale: { ...defaultScale }, humanization: normalizeHumanization(), settings: { ...defaultSettings }, authorSettings, plotSettings: { ...defaultPlotSettings, selectedTags: [] }, workflow: { parameterProtocol: 'effective-story-v1', storyBibleFresh: true, performance:{strategy:state.envAiConfigured?'balanced':'legacy'} }, selectedChapter: null, selectedGenre: '', selectedStyle: '', exportFormat: 'txt' };
  state.books.push(book); state.activeBookId = book.id; applyBook(book);
  state.activeTab = globalAssistReady() ? 'settings' : 'global';
  state.settingsRole = globalAssistReady() ? 'author' : 'programmer';
  persist(true); render(); showToast(globalAssistReady() ? `已创建《${title}》，请选择创作方式。` : `已创建《${title}》，请先完成全局辅助配置。`);
}

function importBook() {
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = '.json,application/json';
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      if (file.size > 128 * 1024 * 1024) throw new Error('作品备份超过 128 MB，请通过系统整体备份恢复；不要删除历史版本。');
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw.title !== 'string' || !raw.title.trim() || !Array.isArray(raw.chapters) || !raw.drafts || typeof raw.drafts !== 'object') throw new Error('请选择 BookWorm 作品 JSON 文件。');
      validateImportedProject(raw);
      const chapterIds = new Set();
      for (const chapter of raw.chapters) {
        if (!Number.isSafeInteger(chapter.id) || chapter.id < 1 || chapterIds.has(chapter.id) || typeof chapter.title !== 'string' || (raw.drafts[chapter.id] !== undefined && typeof raw.drafts[chapter.id] !== 'string')) throw new Error('作品中的章节编号、标题或正文格式无效。');
        chapterIds.add(chapter.id);
        if (chapter.review) validateReview(chapter.review, CHAPTER_CRITERIA);
        if (chapter.plan && PLAN_FIELDS.some(([key]) => chapter.plan[key] !== undefined && typeof chapter.plan[key] !== 'string')) throw new Error('场景规划格式无效。');
        if (chapter.tags && (!Array.isArray(chapter.tags) || chapter.tags.some(tag => typeof tag !== 'string'))) throw new Error('章节标签格式无效。');
        if (chapter.synopsis !== undefined && typeof chapter.synopsis !== 'string') throw new Error('章纲格式无效。');
        if (chapter.revisions && (!Array.isArray(chapter.revisions) || chapter.revisions.some(r => typeof r.content !== 'string'))) throw new Error('历史版本格式无效。');
        if (chapter.reviewHistory) { if (!Array.isArray(chapter.reviewHistory)) throw new Error('审查历史格式无效。'); chapter.reviewHistory.forEach(r => validateReview(r, CHAPTER_CRITERIA)); }
      }
      if (raw.workflow?.finalReview) validateReview(raw.workflow.finalReview, BOOK_CRITERIA);
      if (raw.workflow?.synopsis !== undefined && typeof raw.workflow.synopsis !== 'string') throw new Error('总体大纲格式无效。');
      if (raw.outline !== undefined && (!Array.isArray(raw.outline) || raw.outline.some(item => typeof item !== 'string'))) throw new Error('旧版大纲格式无效。');
      const authorSettings = {...JSON.parse(JSON.stringify(defaultAuthorSettings)),...raw.authorSettings};
      for (const [key, fallback] of Object.entries({ ...defaultAuthorSettings, hardConstraints: '' })) {
        const value = raw.authorSettings?.[key];
        if (value === undefined) continue;
        if (Array.isArray(fallback) ? Array.isArray(value) && value.every(item => typeof item === 'string') : typeof value === typeof fallback && value !== null) authorSettings[key] = value;
        else throw new Error('全局设定格式无效。');
      }
      const typedConfig = (source, defaults) => ({...source,...Object.fromEntries(Object.entries(defaults).map(([key,fallback]) => {
        const value = source?.[key] ?? fallback;
        if ((typeof value !== typeof fallback && !(typeof fallback==='number' && numeric(value)!==null) && !(typeof fallback==='boolean' && ['true','false','0','1'].includes(value))) || (Array.isArray(fallback) && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('作品配置字段格式无效。');
        return [key,value];
      }))});
      authorSettings.featureToggles = typedConfig(authorSettings.featureToggles, defaultAuthorSettings.featureToggles);
      const id = typeof raw.id === 'string' && !state.books.some(b => b.id === raw.id) ? raw.id : crypto.randomUUID();
      const imported = { ...raw, id, ownerId: currentUser()?.id || defaultUsers[0].id, title: raw.title, entryMode: ['novice','automatic'].includes(raw.entryMode) ? raw.entryMode : 'expert', noviceSetup: { ...state.noviceSetup, ...(raw.noviceSetup || {}) }, storyIdea: typeof raw.storyIdea === 'string' ? raw.storyIdea : '', authorSettings,
        chapters: raw.chapters, drafts: raw.drafts, workflow: raw.workflow || {}, noviceFlow: raw.noviceFlow ? structuredClone(raw.noviceFlow) : null, selectedChapter: raw.selectedChapter,
        graph: normalizeGraph(raw.graph),
        outline: raw.outline || [], plotSettings: typedConfig(raw.plotSettings, defaultPlotSettings),
        selectedGenre: typeof raw.selectedGenre === 'string' ? raw.selectedGenre : authorSettings.genres[0],
        selectedStyle: typeof raw.selectedStyle === 'string' ? raw.selectedStyle : authorSettings.styles[0],
        settings: typedConfig(raw.settings, defaultSettings), scale: typedConfig(raw.scale, defaultScale), humanization: normalizeHumanization(typedConfig(raw.humanization, defaultHumanization)), exportFormat: ['txt','md','doc','epub'].includes(raw.exportFormat) ? raw.exportFormat : 'txt' };
      for (const [key, fallback] of Object.entries(defaultScale)) if (numeric(imported.scale[key] ?? fallback)===null) throw new Error('生成规模格式无效。');
      for(const key of ['aiKey','apiKey','aiProfiles','programmerSettings','adminSettings','users','currentUserId'])delete imported[key];
      restorePresetImport(imported);
      normalizeWorkflow(imported);
      saveActiveBook(); state.books.push(imported); state.activeBookId = id; applyBook(imported);
      state.activeTab = imported.chapters.length ? 'studio' : 'settings'; persist(true); render();
      showToast(`已导入《${imported.title}》，现有作品与模型配置已保留。`);
    } catch (error) { showToast(error instanceof SyntaxError ? 'JSON 文件无法解析。' : error.message || '导入失败'); }
  });
  picker.click();
}

function renameActiveBook() {
  const book = state.books.find(item => item.id === state.activeBookId);
  if (!book) return;
  const title = window.prompt('修改作品名称', book.title)?.trim();
  if (!title) return;
  renameBook(state,title); book.updatedAt = new Date().toISOString(); persist(true); render(); showToast('作品名称已更新，已有审查与确认状态保留');
}

function deleteActiveBook() {
  if (!isSystemAdmin() && !booleanValue(state.adminSettings.allowOwnProjectDelete,true)) return showToast('超级管理员已关闭删除作品权限');
  if (state.books.length <= 1) return showToast('至少保留一本作品');
  const book = state.books.find(item => item.id === state.activeBookId);
  if (!book || !window.confirm(`确认删除《${book.title}》？`)) return;
  state.books = state.books.filter(item => item.id !== book.id);
  state.activeBookId = state.books[0].id; applyBook(state.books[0]); persist(true); render(); showToast('作品已删除');
}

function addManagedUser() {
  if (!requireSystemAdmin()) return;
  const nameInput = document.querySelector('[data-user-field="name"]');
  const roleInput = document.querySelector('[data-user-field="role"]');
  const name = String(nameInput?.value || '').trim();
  const role = roleInput?.value === 'system_admin' ? 'system_admin' : 'user';
  if (!name) return showToast('请输入用户名称。');
  if (state.users.some(user => user.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return showToast('用户名称已存在，请换一个名称。');
  state.users.push({ id: `user-${crypto.randomUUID()}`, name, role, status: 'active', createdAt: new Date().toISOString() });
  persist(true); render(); showToast(`已添加${role === 'system_admin' ? '系统管理员' : '普通用户'}：${name}`);
}

function switchManagedUser(id) {
  if (!requireSystemAdmin()) return;
  const user = state.users.find(item => item.id === id && item.status !== 'disabled');
  if (!user) return showToast('用户不存在或已停用。');
  state.currentUserId = user.id;
  state.activeTab = 'settings';
  persist(true); render(); showToast(`已切换为${user.name}（${user.role === 'system_admin' ? '系统管理员' : '普通用户'}）。`);
}

function removeManagedUser(id) {
  if (!requireSystemAdmin()) return;
  const user = state.users.find(item => item.id === id);
  if (!user || user.id === defaultUsers[0].id || user.id === state.currentUserId) return showToast('默认管理员和当前登录用户不能删除。');
  if (!window.confirm(`确认删除用户“${user.name}”？`)) return;
  state.users = state.users.filter(item => item.id !== id);
  persist(true); render(); showToast('用户已删除。');
}

function userAction(actionName, id) {
  if (actionName === 'add') return addManagedUser();
  if (actionName === 'switch') return switchManagedUser(id);
  if (actionName === 'remove') return removeManagedUser(id);
}

async function refreshAuthUsers() {
  try {
    const path = isSystemAdmin() ? '/api/auth/users' : '/api/auth/me';
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || '账号刷新失败。');
    if (path.endsWith('/users')) state.serverUsers = body.users || [];
    else if (body.user) authState.user = body.user;
    render(); showToast('账号信息已刷新。');
  } catch (error) { showToast(error.message || '账号刷新失败。'); }
}
async function updateAuthUser(id, fields) {
  try { const response = await fetch(`/api/auth/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(fields) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || '账号更新失败。'); await refreshAuthUsers(); showToast('账号权限已更新。'); } catch (error) { showToast(error.message || '账号更新失败。'); }
}

async function checkSystemAiHealth() {
  if (!requireSystemAdmin()) return;
  state.systemHealth = { status: 'checking', checkedAt: new Date().toISOString(), message: '正在检测 AI Worker 和已配置档案…' };
  render();
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.error || `健康检查失败（${response.status}）`);
    const configured = configuredAiProfiles().length;
    state.systemHealth = { status: 'healthy', checkedAt: new Date().toISOString(), message: `Worker 正常；当前有 ${configured} 个 AI 档案已测试并保存。${body.envConfigured ? '服务器 DeepSeek 环境变量已配置。' : ''}` };
    persist(true); render(); showToast('AI 接口健康检查完成。');
  } catch (error) {
    state.systemHealth = { status: 'error', checkedAt: new Date().toISOString(), message: error?.message || 'AI 接口健康检查失败。' };
    persist(true); render(); showToast(`AI 健康检查失败：${state.systemHealth.message}`);
  }
}

function cleanupGarbageFiles() {
  if (!requireSystemAdmin()) return;
  let removed = state.garbageFiles.length;
  state.garbageFiles = [];
  try { Object.keys(localStorage).filter(key => key.startsWith('novelforge-garbage-')).forEach(key => { accountLocalStorage.removeItem(key); removed += 1; }); } catch { /* storage cleanup is best effort */ }
  void (async () => {
    try {
      const response = await fetch('/api/system-logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clear' }), cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '系统日志清理失败。');
      removed += Number(body.removedCount) || 0;
      state.systemLogSummary = { count: body.failed?.length || 0, totalBytes: body.failed?.reduce((sum, item) => sum + (item.size || 0), 0) || 0, loggingEnabled: body.loggingEnabled === true };
      persist(true); render();
      showToast(body.failed?.length ? `已清理 ${removed} 个文件，${body.failed.length} 个日志仍被占用。` : (removed ? `已清理 ${removed} 个垃圾文件和系统日志。` : '没有需要清理的垃圾文件或系统日志。'));
    } catch (error) { persist(true); render(); showToast(`${removed ? `已清理 ${removed} 个浏览器垃圾记录；` : ''}${error.message || '系统日志清理失败。'}`); }
  })();
}

async function repairSystemConfig() {
  if (!requireSystemAdmin()) return;
  state.programmerSettings = effectiveRequest({ ...defaultProgrammerSettings, ...(state.programmerSettings || {}) });
  state.programmerSettings.requestTimeout = numberValue(state.programmerSettings.requestTimeout, REQUEST_RULES.requestTimeout);
  state.adminSettings = { ...defaultAdminSettings, ...(state.adminSettings || {}) };
  state.globalAssist = { ...defaultGlobalAssist, ...(state.globalAssist || {}), programmerConfirmed: true, adminConfirmed: true, programmerSavedAt: new Date().toISOString(), adminSavedAt: new Date().toISOString() };
  state.aiProfiles = state.aiProfiles.filter(profile => profile && typeof profile.id === 'string' && profile.id.trim() && typeof profile.endpoint === 'string').map(profile => ({ ...profile, models: Array.isArray(profile.models) ? profile.models.filter(model => typeof model === 'string' && model.trim()) : [] }));
  if (!state.aiProfiles.length) state.aiProfiles = defaultAiProfiles.map(profile => ({ ...profile, models: [...profile.models], apiKey: '' }));
  state.aiRoles = { ...defaultAiRoles, ...(state.aiRoles || {}) };
  Object.keys(state.aiRoles).forEach(role => { if (!state.aiProfiles.some(profile => profile.id === state.aiRoles[role])) state.aiRoles[role] = state.aiProfiles.find(p => p.id === defaultAiRoles[role])?.id || state.aiProfiles[0]?.id || ''; });
  try { await configClient.save(selectGlobal(state)); } catch(e){return showToast(e.message);}
  persist(true); render(); showToast('系统配置已修复并保存到数据库。');
}

async function backupSystem() {
  if (!requireSystemAdmin()) return;
  try {
    const response = await fetch('/api/system-backup', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || '系统备份失败。');
    }
    const cloud=/application\/json/.test(response.headers.get('content-type')||'');
    const blob = cloud ? await downloadCloudBackup(await response.json()) : await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `bookworm-backup-${new Date().toISOString().slice(0, 10)}.${cloud?'zip':'tar.gz'}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('系统源码、数据库与配置已完成备份（日志已排除）。');
  } catch (error) { showToast(error.message || '系统备份失败，现有数据未受影响。'); }
}

function deleteManagedBook(id) {
  const book = state.books.find(item => item.id === id);
  if (!canDeleteBook(book)) return showToast('只能删除自己拥有的作品。');
  if (!book || !window.confirm(`确认删除《${book.title}》及其全部正文？`)) return;
  state.books = state.books.filter(item => item.id !== id);
  if (state.activeBookId === id) {
    const next = state.books[0];
    state.activeBookId = next?.id || null;
    if (next) applyBook(next);
  }
  persist(true); render(); showToast(`作品《${book.title}》已删除。`);
}

function deleteSelectedBooks() {
  const ids = [...managedBookSelection].filter(id => {
    const book = state.books.find(item => item.id === id);
    return book && canDeleteBook(book);
  });
  if (!ids.length) return showToast('请先勾选要删除的作品。');
  if (!window.confirm(`确认删除选中的 ${ids.length} 本作品及其全部正文？`)) return;
  const removedActive = ids.includes(state.activeBookId);
  state.books = state.books.filter(book => !ids.includes(book.id));
  managedBookSelection.clear();
  if (removedActive) {
    const next = state.books[0];
    state.activeBookId = next?.id || null;
    if (next) applyBook(next);
  }
  state.worksPage = 1;
  persist(true); render(); showToast(`已删除 ${ids.length} 本作品。`);
}

function workAction(actionName, id) {
  if (actionName === 'refresh') return void refreshWorksFromDatabase({ announce: true });
  if (actionName === 'health') return checkSystemAiHealth();
  if (actionName === 'quality-check') { if (!requireSystemAdmin()) return; state.activeTab = 'quality-check'; persist(); render(); return; }
  if (actionName === 'cleanup') return cleanupGarbageFiles();
  if (actionName === 'repair') return repairSystemConfig();
  if (actionName === 'backup') return backupSystem();
  if (actionName === 'delete') return deleteManagedBook(id);
  if (actionName === 'batch-delete') return deleteSelectedBooks();
}

async function action(type) {
  if (type === 'reload-global-settings') { try { await configClient.load({migrate:false}); render(); showToast('已重新读取数据库全局配置。'); } catch(e){showToast(e.message);} return; }
  if (type === 'clear-capability-cache') { try { await configClient.clearCapabilities(); showToast('能力缓存已清除，下次实际请求将重新记录接口能力。'); } catch(e){showToast(e.message);} return; }
  if (type === 'new-book') return createBook();
  if (type === 'import-book') return importBook();
  if (type === 'backup-book') return downloadProjectBackup();
  if (type === 'rename-book') return renameActiveBook();
  if (type === 'delete-book') return deleteActiveBook();
  if (type === 'test-ai') return testAI();
  if (type.startsWith('test-ai-role:')) return testAI(type.slice('test-ai-role:'.length));
  if (type === 'refresh-ai-models') return refreshAiModels();
  if (type === 'add-ai-profile') return addCustomAiProfile();
  if (type === 'remove-ai-profile') return removeAiProfile();
  if (type === 'save-global-settings') {
    if (!requireSystemAdmin('只有系统管理员可以确认全局辅助配置。')) return;
    syncAiForm();
    const role = ['programmer', 'admin'].includes(state.settingsRole) ? state.settingsRole : 'programmer';
    const candidate = selectGlobal(state);
    candidate.globalAssist[`${role}Confirmed`] = true;
    try { await saveGlobalAiConfiguration(); await configClient.save(candidate); } catch(error) { return showToast(error.message); }
    persist(true); render();
    return showToast(`${role === 'admin' ? '超级管理员' : '程序员'}配置已保存并确认。`);
  }
  if (type === 'save-ai-key') {
    const profile = activeAiProfile();
    if (!profileTested(profile)) return showToast('请先测试当前档案连接，测试通过后才能保存 Key。');
    try { await saveGlobalAiConfiguration(); renderAIStatusOnly(); return showToast('AI 已保存到服务器数据库，注册用户可直接使用。'); } catch(error) { return showToast(error.message); }
  }
  if (type === 'clear-ai-key') { const profile = activeAiProfile(); updateAiKey(''); saveAiKey(profile); const input = document.querySelector('#ai-key'); if (input) input.value = ''; renderAIStatusOnly(); return showToast(aiKeyStorageErrors.get(state.activeAiProfile) || '当前档案的 Key 已清除。'); }
  if (type === 'save-settings') { const saved = persist(true); render(); return showToast(saved ? '设置已保存；全局设定修改后请重新确认。' : '设置尚未保存，请查看页面上方提示并备份作品。'); }
  if (type === 'settings') { state.activeTab = 'settings'; render(); }
}

async function testAI(role = '') {
  syncAiForm();
  const profile = role ? roleAiProfile(role) : activeAiProfile();
  const testId = role ? `role:${role}` : `profile:${profile?.id || ''}`;
  if (!profile) return showToast('未找到要测试的 AI 档案。');
  if (!profile.endpoint) return showToast('请先填写当前档案的兼容接口地址。');
  if (!profile.apiKey && !profile.serverManaged && !(state.envAiConfigured && profile.id === 'deepseek') && !isLocalAiEndpoint(profile.endpoint)) return showToast('请填写远程 AI 的 API Key，或使用本地兼容接口。');
  if (role && !profileTested(profile)) return showToast('请先测试当前 AI 档案，连接成功后才能测试角色。');
  if (role && !profileKeySaved(profile)) return showToast('请先保存当前 AI 的 Key，保存成功后才能测试角色。');
  if (aiTestsInFlight.has(testId)) return;
  aiTestsInFlight.add(testId);
  aiTestFeedback.set(profile.id, role ? `正在测试${aiRoleLabels[role] || role}…` : '正在测试当前档案…');
  renderAIStatusOnly();
  try {
    const probeTokens = state.programmerSettings.deepThinking || /reasoner|reasoning|gpt-[56]|r1|o1|o3/i.test(profile.model || '') ? 512 : 64;
    let response;
    if (hasSystemAdminRole() && aiRegistryVersion !== null) {
      const payload = await aiRegistryRequest('/api/ai-config/test', 'POST', { version: aiRegistryVersion, profile: { id:profile.id,label:profile.label,endpoint:profile.endpoint,model:profile.model,...(profile.apiKey?{apiKey:profile.apiKey}:{}) }, ...(role?{roles:{[role]:profile.id}}:{}) });
      applyManagedAiPayload(payload); persistPreferences();
      response = Response.json({content:'连接成功'});
    } else response = await aiRequest('请只回复：连接成功。不要解释。', probeTokens, 'drafter', { profileId: profile.id, cache: false, skipTest: true });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `连接失败（${response.status}）`);
    if (!data.content?.trim()) throw new Error('接口返回空内容，请检查模型 ID、Key 和兼容接口路径。');
    const signature = aiProfileSignature(profile);
    aiProfileTests.set(profile.id, signature);
    if (role) aiRoleTests.set(role, signature);
    persistAiTests();
    aiTestFeedback.set(profile.id, role ? `${aiRoleLabels[role] || role}测试通过：${profile.label}` : '当前档案测试通过，已保存到服务器数据库。');
    renderAIStatusOnly();
    showToast(`${role ? `${aiRoleLabels[role] || role} · ` : ''}${profile.label} 连接成功，已保存供全局使用。`);
  } catch (error) {
    const message = error?.message || '连接失败';
    aiProfileTests.delete(profile.id);
    if (role) aiRoleTests.delete(role);
    persistAiTests();
    aiTestFeedback.set(profile.id, message === 'Failed to fetch' || error?.name === 'TypeError'
      ? '无法连接 AI Worker，请确认前端与 Worker 都已启动。'
      : `测试失败：${message}`);
    renderAIStatusOnly();
    showToast(aiTestFeedback.get(profile.id));
  } finally {
    aiTestsInFlight.delete(testId);
    renderAIStatusOnly();
  }
}

function createPublicationSnapshot() {
  const book = state.books.find(item => item.id === state.activeBookId);
  const snapshot = {
    bookId: state.activeBookId, title: book?.title || '未命名作品', revision: Date.now(),
    bookSignature: fingerprint([state.activeBookId, book?.title, state.workflow, state.chapters, state.drafts]),
    exportedAt: new Date().toISOString(),
    chapters: state.chapters.map(chapter => ({ id: chapter.id, title: chapter.title, synopsis: chapter.synopsis, content: state.drafts[chapter.id] || '（本章尚未填写）' })),
    finalReview: structuredClone(state.workflow.finalReview || null),
    auditStatus: bookReviewReady(state) ? 'complete' : 'incomplete',
    manuscriptSignature: bookSignature(state),
    authorReviewHandoff: bookReviewHandoffReady(state) ? structuredClone(state.workflow.reviewHandoff) : null,
    humanReview: structuredClone(state.workflow.humanReview || null),
    detailAdjustment: structuredClone(state.workflow.detailAdjustment || null),
    graphConfirmation: state.graph?.confirmed || ''
  };
  lastPublicationSnapshot = Object.freeze(snapshot);
  return lastPublicationSnapshot;
}

function buildManuscript(snapshot = createPublicationSnapshot()) {
  return `《${snapshot.title}》\n\n${snapshot.chapters.map(chapter => `${chapter.title}\n\n${chapter.content}`).join('\n\n')}`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function xmlEscape(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}

async function downloadDocx(manuscript, snapshot) {
  const { Document, HeadingLevel, Packer, Paragraph } = await import('docx');
  const title = snapshot.title;
  const children = [new Paragraph({ text: `《${title}》`, heading: HeadingLevel.TITLE })];
  snapshot.chapters.forEach(chapter => {
    children.push(new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_1 }));
    chapter.content.split(/\n+/).filter(Boolean).forEach(text => children.push(new Paragraph(text)));
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  saveBlob(blob, `${title}-正文.docx`);
  showToast('正文 Word 已下载到本地');
}

function downloadEpub(snapshot) {
  const title = snapshot.title;
  const bookId = snapshot.bookId;
  const encoder = new TextEncoder();
  const chapterFiles = snapshot.chapters.map((chapter, index) => {
    const id = `chapter-${index + 1}`;
    const body = chapter.content.split(/\n+/).filter(Boolean).map(text => `<p>${xmlEscape(text)}</p>`).join('');
    return { id, href: `${id}.xhtml`, title: chapter.title, content: `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xmlEscape(chapter.title)}</title></head><body><h1>${xmlEscape(chapter.title)}</h1>${body}</body></html>` };
  });
  const manifest = chapterFiles.map(chapter => `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapterFiles.map(chapter => `<itemref idref="${chapter.id}"/>`).join('');
  const nav = chapterFiles.map(chapter => `<li><a href="${chapter.href}">${xmlEscape(chapter.title)}</a></li>`).join('');
  const files = {
    mimetype: [encoder.encode('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': encoder.encode('<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': encoder.encode(`<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${xmlEscape(bookId)}</dc:identifier><dc:title>${xmlEscape(title)}</dc:title><dc:language>zh-CN</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>${manifest}</manifest><spine>${spine}</spine></package>`),
    'OEBPS/nav.xhtml': encoder.encode(`<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1><ol>${nav}</ol></nav></body></html>`)
  };
  chapterFiles.forEach(chapter => { files[`OEBPS/${chapter.href}`] = encoder.encode(chapter.content); });
  saveBlob(new Blob([zipSync(files)], { type: 'application/epub+zip' }), `${title}-正文.epub`);
  showToast('正文 EPUB 已下载到本地');
}

async function downloadNovel(format = 'txt') {
  await configClient.authorizeExport();
  saveEditor();
  if (packageExportBlocked()) return;
  const snapshot = createPublicationSnapshot();
  const title = snapshot.title;
  const manuscript = buildManuscript(snapshot);
  if (format === 'zip') {
    const files = { '正文.txt': new TextEncoder().encode(manuscript), '简介.md': new TextEncoder().encode(`# ${title}\n\n${state.storyIdea}`), '章节目录.txt': new TextEncoder().encode(snapshot.chapters.map(chapter => chapter.title).join('\n')), '全局标签.txt': new TextEncoder().encode((state.authorSettings.globalNovelTags || []).join('、')), '终审报告.json': new TextEncoder().encode(JSON.stringify(snapshot.finalReview, null, 2)), 'manifest.json': new TextEncoder().encode(JSON.stringify({ bookId:snapshot.bookId, revision:snapshot.revision, bookSignature:snapshot.bookSignature, exportedAt:snapshot.exportedAt, chapterCount:snapshot.chapters.length, graphConfirmation:snapshot.graphConfirmation, manuscriptSignature:snapshot.manuscriptSignature, auditStatus:snapshot.auditStatus, authorReviewHandoff:snapshot.authorReviewHandoff }, null, 2)) };
    if(snapshot.authorReviewHandoff)files['作者接管确认.json']=new TextEncoder().encode(JSON.stringify({handoff:snapshot.authorReviewHandoff,humanReview:snapshot.humanReview},null,2));
    saveBlob(new Blob([zipSync(files)], { type: 'application/zip' }), `${title}-投稿资料包.zip`); showToast('投稿资料包已下载到本地'); return;
  }
  if (format === 'doc') return downloadDocx(manuscript, snapshot);
  if (format === 'epub') return downloadEpub(snapshot);
  const extensions = { md: 'md', txt: 'txt' };
  const mime = format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
  saveBlob(new Blob([manuscript], { type: mime }), `${title}-正文.${extensions[format] || 'txt'}`); showToast(`正文 ${String(format).toUpperCase()} 已下载到本地`);
}

// The database owns shared profiles and role bindings; browser caches only
// retain a private fallback until an administrator migrates verified settings.
async function aiRegistryRequest(path, method, input) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '全局 AI 配置保存失败。'), { code: data.code });
  return data;
}
function applyManagedAiPayload(payload) {
  if (Number.isInteger(payload.version)) aiRegistryVersion = payload.version;
  globalAiRoles = payload.roles || {};
  for (const remote of payload.profiles || []) {
    if (!remote?.id || !remote.endpoint || !remote.model) continue;
    if (state.deletedAiProfiles?.includes(remote.id) && !Object.values(globalAiRoles).includes(remote.id)) continue;
    const existing = state.aiProfiles.find(p => p.id === remote.id);
    if (existing) Object.assign(existing, remote, { apiKey: '' });
    else state.aiProfiles.push({ ...remote, models: [remote.model], apiKey: '' });
    unsavedAiKeys.delete(remote.id);
  }
  const first = state.aiProfiles.find(p => p.serverManaged && p.serverVerified);
  for (const role of Object.keys(defaultAiRoles)) {
    if (globalAiRoles[role]) state.aiRoles[role] = globalAiRoles[role];
    else if (first && !profileTested(roleAiProfile(role))) state.aiRoles[role] = first.id;
  }
  const active = activeAiProfile();
  if (first && !profileTested(active)) state.activeAiProfile = first.id;
  const selected = activeAiProfile();
  if (selected?.serverManaged) Object.assign(state, { aiProvider: selected.label, aiModel: selected.model, aiBaseUrl: selected.endpoint, aiKey: '' });
}
async function saveGlobalAiConfiguration(roles = state.aiRoles) {
  if (!hasSystemAdminRole()) throw new Error('只有系统管理员可以保存全局 AI 配置。');
  if (aiRegistryVersion === null) await hydrateManagedAiProfiles();
  const profiles = state.aiProfiles.filter(p => profileTested(p) && !p.serverManaged && (p.apiKey || isLocalAiEndpoint(p.endpoint))).map(p => ({ id:p.id,label:p.label,endpoint:p.endpoint,model:p.model,apiKey:p.apiKey,verified:true }));
  const payload = await aiRegistryRequest('/api/ai-config', 'PATCH', { version: aiRegistryVersion, profiles, roles });
  applyManagedAiPayload(payload); persistPreferences(); return payload;
}
async function hydrateManagedAiProfiles() {
  try {
    let payload = await aiRegistryRequest('/api/local-ai-profiles', 'GET');
    if (!Array.isArray(payload.profiles)) return;
    // Add prior administrator-verified browser profiles once, without replacing
    // any existing database profile or the server's established role choices.
    if (hasSystemAdminRole() && Number.isInteger(payload.version)) {
      const profiles = state.aiProfiles.filter(p => !payload.profiles.some(r => r.id === p.id) && profileTested(p) && (p.apiKey || isLocalAiEndpoint(p.endpoint))).map(p => ({ id:p.id,label:p.label,endpoint:p.endpoint,model:p.model,apiKey:p.apiKey,verified:true }));
      const verified = [...payload.profiles.filter(p => p.serverVerified), ...profiles], roles = {};
      for (const role of Object.keys(defaultAiRoles)) if (!payload.roles?.[role] && verified.length) roles[role] = verified.find(p => p.id === state.aiRoles[role])?.id || verified[0].id;
      if (profiles.length || Object.keys(roles).length) payload = await aiRegistryRequest('/api/ai-config', 'PATCH', { version: payload.version, profiles, roles });
    }
    applyManagedAiPayload(payload); persistPreferences(); render();
  } catch (error) {
    if (hasSystemAdminRole()) showToast(error.message || '全局 AI 配置暂时无法读取。');
  }
}

function backgroundAiOptions(role, profileId, { strict = false } = {}) {
  syncAiForm();
  const primary = profileId ? state.aiProfiles.find(p => p.id === profileId) : roleAiProfile(role), config = state.programmerSettings;
  if(strict && (!primary || !profileTested(primary) || !profileKeySaved(primary))) throw new Error('请先测试并保存“润色校对”当前绑定的模型，本次未回退到其他模型。');
  const profiles = [primary, ...(!strict && !profileId && config.failoverEnabled ? state.aiProfiles : [])].filter((p, i, all) => p && all.findIndex(q => q?.id === p.id) === i && profileTested(p) && profileKeySaved(p))
    .filter(p => state.adminSettings.allowExternalProviders || p.serverManaged || isLocalAiEndpoint(p.endpoint) || providerPresets.some(v => !v.custom && v.endpoint === normalizeAiEndpoint(p.endpoint)));
  if (!profiles.length) throw new Error('请先配置并测试该角色的 AI。');
  return { profiles: profiles.map(p => ({ id: p.id, label: p.label, endpoint: p.endpoint, model: p.model, custom: p.custom, serverManaged: p.serverManaged, ...(p.apiKey ? { apiKey: p.apiKey } : {}) })),
    config: { thinking:thinkingMode(config.deepThinking), maxConcurrent: config.maxConcurrent, requestTimeout: config.requestTimeout, retryCount: config.retryCount, failoverEnabled: !profileId && config.failoverEnabled } };
}
studio = createStudio({ state, persist, persistRevision, render, refreshAuthorSettings: refreshAuthorSettingsUI, icon, escapeHtml, showToast, settingsPanel: settingsView, creationRequest, acknowledgeCreation, creationUsage, creationEvent, recoverCreation, retryCreationTransport,
  keywordClient:createKeywordClient(),
  backgroundTasks: createBackgroundTasks(backgroundAiOptions),
  aiRequest, syncAiForm, roleAiProfile, writingProfilePrompt, humanizationPrompt, historyPrompt,
  downloadNovel, plotTagGroups, plotPresets, aiRoleReady, profileTested, profileKeySaved,
  globalSettingsPanel: globalSettingsView, userManagementPanel: userManagementView,
  worksManagementPanel: worksManagementView, isSystemAdmin, isSystemAdminRole: hasSystemAdminRole, globalAssistReady });
document.addEventListener('workflow-switch-book', event => {
  const target = state.books.find(book => book.id === event.detail);
  if (!target || studio.isBusy()) return;
  if (!target.entryMode && target.chapters?.length) target.entryMode = 'expert';
  saveActiveBook(); state.activeBookId = target.id; applyBook(target); persist(true); render();
});
const trackStoryBibleInput = event => {
  const d = event.target.closest?.('button,input,textarea,select')?.dataset;
  if (!d || !storageReady) return;
  let path = d.multiField || d.configToggle || d.configRange || d.configText || d.configStep;
  if (d.customAdd) path = 'authorSettings.' + d.customAdd;
  if (d.featureToggle) path = 'authorSettings.featureToggles.' + d.featureToggle;
  if (d.setting) path = 'settings.' + d.setting;
  if (d.humanField || d.humanToggle) path = 'humanization.' + (d.humanField || d.humanToggle);
  if (path) markPresetField(state, path);
};
for (const event of ['input','change','click']) document.addEventListener(event, trackStoryBibleInput, true);
async function runStartupChecks() {
  if (environmentController || accountSessionChanged) return;
  environmentController = new AbortController();
  environmentRepair = false;
  environment = initialEnvironment(hasSystemAdminRole());
  render();
  try {
    await configClient.load();
    await hydrateManagedAiProfiles();
    await checkEnvironment({ admin: hasSystemAdminRole(), report: environment, signal: environmentController.signal, onUpdate: () => render() });
    if (!environment.passed || accountSessionChanged) return;
    // Keep the workspace behind the check screen until this account's database
    // has loaded successfully; no cached manuscript can flash onto the page.
    environment.passed = false; environment.running = true;
    environment.checks.find(c => c.id === 'database').message = '检测通过，正在读取当前账户作品…';
    await hydrateNovelDatabase();
    state.currentUserId = authenticatedAccountId;
    if (!novelRepository.ready) throw new Error(databaseMessage || '作品数据库读取失败，请重试。');
    await hydrateManagedAiProfiles();
    try { if (sessionStorage.getItem('bookworm-login-entry') === authenticatedAccountId) { state.activeTab = 'flows'; sessionStorage.removeItem('bookworm-login-entry'); } } catch {}
    environment.passed = true;
  } catch (error) {
    if (!accountSessionChanged) {
      environment.passed = false;
      const check = environment.checks.find(c => c.id === 'database');
      Object.assign(check, { status: 'failed', message: error.message || '环境检测未完成，请重试。' });
      environment.checks.filter(c => c.status === 'running' || c.status === 'pending').forEach(c => Object.assign(c, { status: 'failed', message: '前置连接未完成，请重试。' }));
    }
  } finally {
    environmentController = null; environment.running = false; render();
  }
}
async function initializeAuth() {
  // Project data is loaded from the authenticated database. Keep eligible
  // legacy snapshots only in the migration queue, never on the loading screen.
  Object.assign(state, { books:[], activeBookId:'', storyIdea:'', drafts:{}, chapters:[], outline:[], workflow:{}, graph:newGraph(), currentUserId:authenticatedAccountId });
  if (!authState.user) { Object.assign(state,structuredClone(pristineAccountState)); }
  else storageStatus = { saved: false, message: '正在检测创作环境…' };
  authState.loading = false; render();
  if (authState.user) {
    await runStartupChecks();
  }
}
void initializeAuth();
