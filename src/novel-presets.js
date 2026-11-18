// Editorial presets distilled from 小说类型.txt (GBK). These are writing
// definitions, never provider profiles or changes to workspace defaults.
export const PRESET_GROUPS = ['幻想与世界观', '现代都市与脑洞', '悬疑犯罪与智斗', '情感历史与成长'];
export const PRESET_DIMENSIONS = { promise: '读者期待', protagonist: '主角原则', world: '世界与势力', conflict: '冲突循环', voice: '文风与信息' };
export const PRESET_FIELD_LABELS = {
  genres:'题材',styles:'文风',pov:'叙事视角',tense:'时间组织',structure:'结构',pacing:'节奏',audience:'目标读者',endings:'结局倾向',
  conflict:'主要冲突',plotGoals:'剧情目标',openingHooks:'开篇钩子',causality:'因果规则',infoReveal:'信息揭示',tension:'紧张感',risk:'风险代价',
  foreshadowPlan:'伏笔安排',reversalPlan:'反转安排',revealPace:'揭秘节奏',subplot:'支线',chapterDensity:'章节密度',sceneObjective:'场景目标',
  payoff:'读者回报',obstacleEscalation:'阻力升级',protagonistTraits:'主角特质',dialogue:'对白',contentRating:'内容分级',plotElements:'情节要素',
  contentTags:'内容主题',globalNovelTags:'作品标签'
};
const base = {
  genres:[], styles:['细腻克制'], pov:['第三人称限知'], tense:['线性推进'], structure:['三幕结构'], pacing:['张弛交替'],
  audience:['大众通俗'], endings:['圆满收束'], conflict:['人物选择'], plotGoals:['完成任务'], openingHooks:['问题开场'],
  causality:['因果链清晰','选择产生代价','避免巧合解题','伏笔有回收'], infoReveal:['渐进揭示'], tension:['张弛交替'], risk:['失败有代价'],
  foreshadowPlan:['短线伏笔','长线伏笔'], reversalPlan:['中段反转'], revealPace:['关键节点公开'], subplot:['支线与主线交汇'],
  chapterDensity:['单章单目标','场景少而精'], sceneObjective:['做出选择','付出代价'], payoff:['延迟回报','结局回报'],
  obstacleEscalation:['提高门槛','提高代价'], protagonistTraits:['理性克制'], dialogue:['含蓄试探'], contentRating:['全年龄'],
  plotElements:['关系成长'], contentTags:['选择'], globalNovelTags:['因果清晰','原创表达','角色立体']
};
// revealPace's existing vocabulary uses these labels (infoReveal has a different set).
base.revealPace = ['留白待解'];
const humanization = {
  dialectEnabled:false,selfDeprecatingEnabled:false,catchphrasesEnabled:false,typoEnabled:false,moodEnabled:false,
  oralEnabled:true,oralRatio:20,sentenceVariationEnabled:true,sentenceVariationRatio:55,perplexityEnabled:true,perplexityRatio:25,
  emotionalBurstEnabled:true,emotionalBurstRatio:15,thoughtBreakEnabled:false,internetMemeEnabled:false,
  deMechanizationEnabled:true,deMechanizationRatio:70,punctuationErrorEnabled:false,connectorDeletionEnabled:false,swearEnabled:false,regionalDialogueEnabled:false
};
const phases = { opening:['开篇抓人','目标确认'], development:['推动任务','细节伏笔'], turning:['关键抉择','代价兑现'], climax:['终局高潮','悬念回收'], ending:['阶段收束','首尾呼应'] };
const rows = [
  {
    id:'cultivation', name:'玄幻修真／东方奇幻', group:0, description:'突破境界、争夺资源，在代价中完成成长。',
    dimensions:{promise:'通过境界突破与阶层跃升兑现积累，低谷与翻盘互相支撑。',protagonist:'坚毅隐忍、利益清楚而有底线，行动果断；金手指有来源与限制。',world:'建立可量化的境界、资源和宗门体系，按成长进入更大地域。',conflict:'秘境、竞赛、资源和势力冲突交替推进，每次胜负留下后果。',voice:'古风与清晰画面兼顾，重点描写功法、法宝、威压及突破异象。'},
    authorSettings:{genres:['玄幻升级','仙侠长生'],styles:['热血燃向','古典雅致'],structure:['英雄旅程'],pacing:['快节奏推进','张弛交替'],plotGoals:['能力成长','资源积累'],conflict:['资源争夺','外部危机'],tension:['阶梯式升级'],risk:['能力反噬','失败有代价'],payoff:['能力回报','爽点回报','结局回报'],subplot:['成长支线','势力支线'],protagonistTraits:['果断强势','成长型'],plotElements:['能力获得','资源争夺','组织对抗'],globalNovelTags:['升级流','金手指','能力代价','秘境探索','因果清晰']},
    rules:['越阶获胜必须提前建立条件、资源消耗或代价，不能临时突破解题。','换图保留人物关系与既有能力限制，禁止重复同一种羞辱翻盘。'],
    audit:['核对境界、法宝归属、资源收支和突破代价，检查成长回报是否兑现。'], tags:['主角升级','能力限制','资源体系','竞赛挑战','新地图开启']
  },
  {
    id:'epic-fantasy',name:'西幻史诗奇幻',group:0,description:'群像命运与文明冲突交织的史诗。',
    dimensions:{promise:'宿命压力下的自由选择与文明变迁。',protagonist:'群像各有欲望与立场；血统、遗物或预言是压力来源，不替代人物行动。',world:'建立地缘、种族历史、王权与神权矛盾，魔法规则稳定。',conflict:'边境战争、王座争夺、古老威胁与信仰危机互相影响。',voice:'古典厚重、清晰可读，地理、徽章和歌谣服务事件，避免生硬翻译腔。'},
    authorSettings:{genres:['西方奇幻'],styles:['古典雅致','诗性意象'],pov:['多视角轮换'],structure:['群像并行'],pacing:['慢热铺陈','张弛交替'],conflict:['价值观碰撞','外部危机'],plotGoals:['阵营洗牌','守护目标'],subplot:['势力支线','历史支线'],risk:['道德两难','不可逆损失'],protagonistTraits:['灰度正义'],globalNovelTags:['史诗群像','世界观宏大','多线叙事','自由选择'],plotElements:['组织对抗','身份秘密','历史事件']},
    rules:['每个场景保持明确视角和人物认知边界。','魔法不能在高潮临时增加无代价的新规则；预言须通过人物选择兑现或被改变。'],audit:['检查群像各线是否汇合、魔法代价是否一致、文明冲突是否有具体因果。'],tags:['多视角','势力格局','信仰崩塌','传承交接','开阔壮阔']
  },
  {
    id:'cyberpunk',name:'赛博朋克',group:0,description:'高科技与低生活之间，争取身份和尊严。',
    dimensions:{promise:'技术繁荣与底层困境的反差，反抗控制的尊严。',protagonist:'黑客、义体使用者等边缘人，有生计、身体或追捕压力。',world:'巨型都市中企业掌握技术、数据和公共资源，阶层空间鲜明。',conflict:'数据争夺、身体异化、企业控制与底层反抗形成连锁后果。',voice:'冷峻、金属与霓虹质感，技术细节通过行动呈现。'},
    authorSettings:{genres:['科幻末日'],styles:['冷峻悬疑','纪实冷静'],conflict:['资源争夺','身份秘密'],plotGoals:['打破规则','守护目标'],risk:['身份暴露风险','不可逆损失'],tension:['资源递减','倒计时加压'],endings:['余韵留白'],protagonistTraits:['灰度正义'],plotElements:['组织对抗','身份秘密','生存挑战'],globalNovelTags:['赛博朋克','科技伦理','人工智能','冷峻压迫']},
    rules:['技术能力需要权限、设备和代价，不能万能入侵。','反抗结果体现人的选择与损失，避免把霓虹名词当作情节。'],audit:['检查数据权限、义体代价、企业控制机制和人物身份的连续性。'],tags:['数字线索','科技设定','霓虹喧嚣','技术伦理','阶层冲突']
  },
  {
    id:'space-opera',name:'星际科幻／太空歌剧',group:0,description:'星海探索、舰队行动与文明博弈。',
    dimensions:{promise:'巨舰与星海的浪漫，探索未知文明的惊奇与孤独。',protagonist:'舰长、猎人或流亡者，个人目标与船员、阵营责任相冲突。',world:'跨星际势力竞争，明确航行、通信、补给和科技差距。',conflict:'航道争夺、行星探索、技术封锁与文明危机交替推进。',voice:'宏大空间与具体机械细节结合，避免无意义参数堆积。'},
    authorSettings:{genres:['星际科幻'],styles:['热血燃向','诗性意象'],structure:['英雄旅程'],openingHooks:['场景奇观'],conflict:['外部危机','价值观碰撞'],plotGoals:['守护目标','阵营洗牌'],subplot:['势力支线'],risk:['资源耗尽风险','连锁后果'],plotElements:['组织对抗','生存挑战'],globalNovelTags:['宇宙探索','文明存续','硬核设定','世界观宏大']},
    rules:['航行时间、通信延迟、武器射程和补给采用同一套规则。','文明差距的突破必须有先期铺垫，不能靠临时超级武器收场。'],audit:['检查跨星际时间线、舰船状态、补给及文明能力边界。'],tags:['科技设定','开阔壮阔','团队集结','世界边界','资源封锁']
  },
  {
    id:'dystopian',name:'废土末日／反乌托邦',group:0,description:'在匮乏与控制中求生，重新选择秩序。',
    dimensions:{promise:'极端生存压力下的人性选择与秩序重建。',protagonist:'幸存者、觉醒者或前执法者，有现实负担与道德困境。',world:'选择废土或高墙城市为主要环境，建立资源、阶层与控制规则。',conflict:'物资争夺暴露制度谎言，个人求生逐渐触及集体秩序。',voice:'压抑荒凉与具体生活细节并存，保留希望的微小载体。'},
    authorSettings:{genres:['末世求生'],styles:['纪实冷静','细腻克制'],plotGoals:['逃离困境','建立秩序'],conflict:['资源争夺','价值观碰撞'],tension:['资源递减'],risk:['道德两难','不可逆损失'],endings:['余韵留白'],plotElements:['生存挑战','资源争夺'],globalNovelTags:['末日生存','希望与重建','人性抉择'],protagonistTraits:['普通人视角','理性克制']},settings:{growthRule:false},
    rules:['水、食物、疾病和控制手段必须持续影响行动。','成长可以是认清代价或守住尊严，不强制圆满、胜利或重建成功。'],audit:['检查物资收支、生存限制、统治机制与人物选择的后果。'],tags:['环境灾害','资源体系','道德选择','荒野空旷','代价兑现']
  },
  {
    id:'urban-fantasy',name:'都市异能／隐秘历史',group:1,description:'日常身份与隐秘世界相互牵动。',
    dimensions:{promise:'普通都市生活与超凡事件的碰撞。',protagonist:'保有日常职业或学业的双重身份者，秘密行动影响现实关系。',world:'表世界与里世界有隐藏机制、组织边界和稳定能力规则。',conflict:'处理异常、争夺隐秘资源、应对身份暴露。',voice:'现代口语、动作与日常细节交替，都市地标融入事件。'},
    authorSettings:{genres:['都市异能'],styles:['快节奏','现实烟火'],structure:['单元剧'],pacing:['快节奏推进'],conflict:['身份秘密','外部危机'],plotGoals:['完成任务','守护目标'],risk:['身份暴露风险','能力反噬'],subplot:['职业支线','友情支线'],plotElements:['身份秘密','能力获得','组织对抗'],dialogue:['生活化口语'],globalNovelTags:['身份谜团','市井烟火','能力代价']},humanization:{oralRatio:45},
    rules:['日常身份的时间安排与超凡行动不能互相矛盾。','每个异常事件推进全书主线，普通人发现秘密必须有后果。'],audit:['检查双重身份、能力限制和各单元与主线的联系。'],tags:['异常事件','身份压制','超自然设定','烟火市井','秘密共享']
  },
  {
    id:'horror-weird',name:'规则怪谈／克苏鲁悬疑',group:1,description:'从细节中发现规则，在未知威胁中求生。',
    dimensions:{promise:'恐怖解谜与面对未知的认知压力。',protagonist:'冷静观察、擅长验证线索，恐惧仍会改变判断。',world:'封闭异常空间或古老小镇，明确可观察规则与未知边界。',conflict:'验证规则、识别误导、付出代价逃离死局与精神污染。',voice:'阴冷、潮湿、心理暗示和感官错位，保留不可解释的余地。'},
    authorSettings:{genres:['悬疑破案'],styles:['冷峻悬疑','细腻克制'],structure:['谜案递进'],pacing:['张弛交替'],plotGoals:['逃离困境','查明真相'],infoReveal:['局部真相','多次验证'],risk:['不可逆损失','道德两难'],endings:['余韵留白'],protagonistTraits:['理性克制'],plotElements:['线索追查','生存挑战'],globalNovelTags:['冷峻压迫','悬念驱动','逻辑严密']},
    rules:['可用于逃生的规则要有可观察线索，不能临时新增规则救场。','区分真实事件、幻觉与人物推测；未知可以保留，已确认规则不能随意改变。'],audit:['检查规则公平性、感知可靠性和逃生因果，不把有意留白直接判为漏洞。'],tags:['规则揭秘','恐惧惊悚','密闭压迫','诡异失真','矛盾线索']
  },
  {
    id:'infinite',name:'诸天无限流',group:1,description:'穿行原创副本，组合能力并承担跨世界代价。',
    dimensions:{promise:'副本通关与跨世界能力组合的回报。',protagonist:'擅长规则分析的玩家，系统面板与真实行动相互验证。',world:'中转空间连接不同原创世界，能力转移和结算规则统一。',conflict:'强制任务、团队分歧、规则漏洞与更高层真相持续升级。',voice:'游戏化信息简明准确，面板只在变化影响决策时展示。'},
    authorSettings:{genres:['无限流'],styles:['快节奏','轻松爽文'],structure:['单元剧'],plotGoals:['完成任务','能力成长'],tension:['阶梯式升级','倒计时加压'],risk:['能力反噬','资源耗尽风险'],payoff:['能力回报','爽点回报'],plotElements:['能力获得','生存挑战','组织对抗'],globalNovelTags:['平行世界','硬核设定','冒险成长']},
    rules:['能力带入、物品归属、属性变化及结算可追溯。','副本世界原创，各有独立冲突，同时推进跨副本主线；不得不断清零人物成长。'],audit:['检查跨世界能力限制、资源账目、任务结算与主线回收。'],tags:['任务章节','规则漏洞','能力限制','团队集结','新地图开启']
  },
  {
    id:'mastermind',name:'幕后黑手／迪化流',group:1,description:'用信息差和身份伪装推动多方误判。',
    dimensions:{promise:'人物脑补与幕后布局形成认知反差和戏剧快感。',protagonist:'幕后策划者或身份扮演者，必须应对计划之外的后果。',world:'虚构历史、隐秘组织与真实势力形成互相验证的证据网络。',conflict:'圆谎、维持身份、引导误判、处理谎言变成现实的后果。',voice:'幽默与庄重台词形成反差，叙述清楚区分人物所知。'},
    authorSettings:{genres:['幕后布局'],styles:['诙谐吐槽','轻松爽文'],pov:['多视角轮换'],infoReveal:['信息差','误导后澄清'],reversalPlan:['认知反转','身份反转'],risk:['身份暴露风险','连锁后果'],conflict:['身份秘密'],plotGoals:['阵营洗牌'],protagonistTraits:['理性克制','幽默自嘲'],plotElements:['身份秘密','组织对抗'],globalNovelTags:['信息差叙事','黑色幽默','反派有脑']},humanization:{oralRatio:45,selfDeprecatingEnabled:true,selfDeprecatingRatio:10},
    rules:['分别记录主角知道的真相、他人看到的证据、读者已获知的信息。','误判必须符合人物掌握的证据和利益，不能靠全员降智维持马甲。'],audit:['检查认知边界、伪装证据、布局代价及误判因果。'],tags:['信息差反转','多视角','伪造线索','冷幽默','身份反转']
  },
  {
    id:'professional',name:'全职职业／技术流',group:1,description:'凭专业判断解决难题，呈现真实行业生态。',
    dimensions:{promise:'专业能力解决复杂问题的可信成就感。',protagonist:'技术出众、有执念与短板的从业者，需要协作而非全知全能。',world:'选择一个垂直行业，建立流程、角色权限和资源限制。',conflict:'复杂项目或案件、时间压力与行业利益冲突。',voice:'专业术语准确适量，通过判断过程体现知识而非名词堆砌。'},
    authorSettings:{genres:['职场商战'],styles:['纪实冷静','现实烟火'],plotGoals:['完成任务'],conflict:['人物选择','价值观碰撞'],subplot:['职业支线'],infoReveal:['证据拼图','多次验证'],protagonistTraits:['理性克制','果断强势'],plotElements:['职业成长','线索追查'],globalNovelTags:['职业细节','职业尊严','现实质感'],dialogue:['短句利落','生活化口语']},
    rules:['专业结论须由材料、过程和验证支撑，缺少依据时保留不确定性。','限定主角专业范围，不以越权万能操作代替团队流程。'],audit:['检查专业步骤、权限、工作量和解决难题的证据链，无法核实的知识注明待确认。'],tags:['职业细节','时间压力','证据出现','内部争执','展示能力']
  },
  {
    id:'classic-mystery',name:'传统本格推理',group:2,description:'公平布置线索，让真相可以重新推演。',
    dimensions:{promise:'抽丝剥茧的解谜与可复盘的智力博弈。',protagonist:'侦探、顾问或卷入事件的观察者，推理依赖已经获得的证据。',world:'封闭庄园、孤岛或列车等有限舞台，建立人物位置与行动时间。',conflict:'破解密室、不在场证明和证词矛盾，逐步排除解释。',voice:'克制精确，重要物件和台词自然出现，叙述对读者公平。'},
    authorSettings:{genres:['悬疑破案'],styles:['冷峻悬疑','细腻克制'],structure:['谜案递进'],plotGoals:['查明真相'],infoReveal:['证据拼图','误导后澄清'],causality:['线索可追溯','避免巧合解题','因果链清晰','伏笔有回收'],revealPace:['每章给线索','真假线索交替'],foreshadowPlan:['物品伏笔','台词伏笔','人物习惯伏笔'],payoff:['线索回报','结局回报'],protagonistTraits:['理性克制'],plotElements:['线索追查','身份秘密'],globalNovelTags:['本格推理','逻辑严密','密室谜题']},
    rules:['先在总纲确定真相、作案时间线和关键证据，再安排线索出现顺序。','关键线索必须在揭晓前出现；禁止临时人物、未知能力或读心术解谜。'],audit:['逐项核对关键结论对应的前置线索、时间线、不在场证明和误导解释。'],tags:['物证线索','证词冲突','矛盾线索','真相拼图','密闭压迫']
  },
  {
    id:'social-crime',name:'社会派犯罪／刑侦',group:2,description:'追查案件，也追问人物处境与正义代价。',
    dimensions:{promise:'案件真相揭露人性与社会处境。',protagonist:'有执念和缺陷的调查者，对手也有完整动机与限制。',world:'工业城市、社区与制度流程，受害者有具体生活和关系。',conflict:'追查证据、利益干预、警匪博弈与道德选择。',voice:'写实粗粝、卷宗与市井细节交织，避免猎奇替代人物。'},
    authorSettings:{genres:['悬疑破案'],styles:['现实烟火','纪实冷静'],structure:['谜案递进'],plotGoals:['查明真相'],conflict:['价值观碰撞','外部危机'],risk:['道德两难','不可逆损失'],endings:['余韵留白'],protagonistTraits:['灰度正义','普通人视角'],subplot:['家族支线','职业支线'],plotElements:['线索追查','家庭矛盾'],globalNovelTags:['社会派','真相刺痛','社会议题','现实质感']},settings:{growthRule:false},
    rules:['调查行动遵守已设定的权限、证据和时间条件。','犯罪动机通过经历和选择体现，受害者不是仅为反转存在的道具。'],audit:['检查证据链、程序因果、双方动机和社会背景对案件的具体影响。'],tags:['审判审讯','烟火市井','职业细节','动机揭秘','贫富差距']
  },
  {
    id:'espionage',name:'谍战风云／政治惊悚',group:2,description:'在情报、身份与信任之间走钢丝。',
    dimensions:{promise:'身份濒临暴露时的紧张与多重反转。',protagonist:'多重身份的情报人员，冷静伪装但忠诚和情感有代价。',world:'明确时代、阵营、通信方式与情报组织权限。',conflict:'情报传递、内鬼排查、掩护身份与极限自救。',voice:'潜台词和暗语服务具体目的，动作细节体现压力。'},
    authorSettings:{genres:['谍战惊悚'],styles:['冷峻悬疑','细腻克制'],structure:['倒计时结构'],plotGoals:['完成任务','守护目标'],conflict:['身份秘密','价值观碰撞'],infoReveal:['信息差','多次验证'],tension:['倒计时加压'],risk:['身份暴露风险','不可逆损失'],dialogue:['含蓄试探'],plotElements:['身份秘密','组织对抗'],globalNovelTags:['双强对峙','信息差叙事','正义代价']},
    rules:['记录各方何时通过何种渠道获得情报；暗号和掩护身份不能随意变化。','反转改变对既有证据的理解，不能抹除已发生事实；技术和称谓符合时代。'],audit:['检查情报流向、知情范围、通信时间、身份掩护与暴露逻辑。'],tags:['交换情报','潜入行动','跟踪监视','时间压力','秘密代价']
  },
  {
    id:'adventure',name:'动作冒险／盗墓寻宝',group:2,description:'团队深入未知，以观察和代价破解险局。',
    dimensions:{promise:'奇观探索、机关破解与险境突围。',protagonist:'不同专长的探索团队，幽默与摩擦来自人物关系。',world:'遗迹、地下水道或禁区有可理解的空间、地理与机关逻辑。',conflict:'寻找路径、破解机关、应对环境与竞争者，线索指向深层秘密。',voice:'紧凑动作配合民俗地理细节，始终让读者理解位置与风险。'},
    authorSettings:{genres:['冒险寻宝'],styles:['快节奏','诙谐吐槽'],structure:['英雄旅程'],openingHooks:['场景奇观','动作开场'],plotGoals:['完成任务','逃离困境'],tension:['倒计时加压','资源递减'],risk:['资源耗尽风险','不可逆损失'],subplot:['友情支线'],plotElements:['生存挑战','线索追查'],dialogue:['短句利落','生活化口语'],globalNovelTags:['冒险成长','风物考据','并肩作战']},humanization:{oralRatio:35},
    rules:['路径、机关触发条件、装备和伤势保持连续。','解谜来自提前可见的线索与团队专长，民俗传说与世界中已证实规则分开。'],audit:['检查空间路线、机关因果、装备消耗和成员贡献。'],tags:['逃亡追逐','环境线索','地域风俗','团队集结','密闭压迫']
  },
  {
    id:'court-intrigue',name:'古代宫廷／宅斗权谋',group:3,description:'在礼制与利益格局中，以选择改变处境。',
    dimensions:{promise:'以弱胜强的权力博弈与阶层变化。',protagonist:'处境受限但有判断力的人物，复仇、守护或权力目标明确。',world:'深宅或朝堂的礼制、官职、财产和亲缘关系形成行动边界。',conflict:'构陷与反制、家族利益、继承权与政治联盟。',voice:'古典雅致，对礼仪、服饰和称谓的细节保持时代一致。'},
    authorSettings:{genres:['历史架空'],styles:['古典雅致'],conflict:['人物选择','关系张力'],plotGoals:['阵营洗牌','守护目标'],subplot:['家族支线','势力支线'],risk:['身份暴露风险','关系破裂风险'],reversalPlan:['立场反转'],dialogue:['含蓄试探'],plotElements:['家庭矛盾','组织对抗','身份秘密'],protagonistTraits:['理性克制','果断强势'],globalNovelTags:['权谋博弈','风物考据','角色立体']},
    rules:['权力、礼制、财产和信息来源限制所有角色，反派也有合理反制。','情感不能无铺垫推翻主角核心判断；若采用真实朝代，先明确史实与虚构边界。'],audit:['检查人物动机、权力来源、礼制称谓、利益交换与反制因果。'],tags:['谈判交涉','利益交换','家族利益','立场反转','古朴庄严']
  },
  {
    id:'contemporary-romance',name:'都市现代言情',group:3,description:'在事业与生活中建立有变化、有选择的关系。',
    dimensions:{promise:'暧昧、冲突、理解与重逢带来的情绪回报。',protagonist:'双方都有事业、价值观和独立目标，吸引力来自具体行动。',world:'现代都市职业与家庭生活共同构成关系压力。',conflict:'阶层和价值观差异、事业选择、家庭阻碍与信任修复。',voice:'细腻心理、对视与肢体细节，潜台词体现关系阶段。'},
    authorSettings:{genres:['言情情感'],styles:['细腻克制','温柔治愈'],conflict:['关系张力','价值观碰撞'],plotGoals:['关系升级'],subplot:['情感支线','职业支线'],risk:['关系破裂风险'],tension:['关系施压'],payoff:['情绪回报','关系回报'],sceneObjective:['改变关系','做出选择'],protagonistTraits:['敏感细腻','嘴硬心软'],plotElements:['关系成长','职业成长','家庭矛盾'],contentTags:['爱情','选择','信任'],globalNovelTags:['关系细腻','双向奔赴','情绪共鸣']},humanization:{oralRatio:40,thoughtBreakEnabled:true,thoughtBreakRatio:10,emotionalBurstRatio:20},
    rules:['关系每次升降有具体互动与选择支撑，误会不能反复靠拒绝沟通拖延。','保留双方独立目标与情感边界，结局兑现核心关系问题。'],audit:['检查关系阶段、信任变化、事业线与情感线的因果和回报。'],tags:['互相试探','关系升温','价值观冲突','承诺建立','误会解除']
  },
  {
    id:'paranormal-romance',name:'奇幻浪漫／人外恋',group:3,description:'在种族规则和宿命压力下，选择彼此。',
    dimensions:{promise:'跨种族的禁忌、吸引与宿命羁绊。',protagonist:'人类与非人伴侣都有意志和弱点，力量差异带来真实关系难题。',world:'氏族、盟约、寿命和能力规则影响共同生活。',conflict:'种族利益、追捕、失控风险与保护对方的代价。',voice:'华丽而细腻，哥特氛围与人物触感服务情感变化。'},
    authorSettings:{genres:['言情情感'],styles:['诗性意象','细腻克制'],conflict:['关系张力','价值观碰撞'],plotGoals:['关系升级','守护目标'],subplot:['情感支线','势力支线'],risk:['关系破裂风险','能力反噬'],payoff:['关系回报','情绪回报'],plotElements:['关系成长','身份秘密','组织对抗'],contentTags:['爱情','守护','选择'],globalNovelTags:['宿命羁绊','爱情救赎','情感有边界']},humanization:{oralRatio:15,emotionalBurstRatio:20},
    rules:['种族、寿命、能力和盟约的差异必须影响选择，不能只作为外貌装饰。','宿命与力量不能代替人物自主意愿，关系转变有可见行动和代价。'],audit:['检查盟约约束、能力失控、双方自主选择和关系发展的因果。'],tags:['浪漫氛围','能力限制','秘密共享','关系爆发','价值观冲突']
  },
  {
    id:'young-adult',name:'青春伤痛／成长向',group:3,description:'在家庭、同伴与自我之间，寻找身份。',
    dimensions:{promise:'迷茫、初次情感与反叛中逐步形成自我认识。',protagonist:'校园边缘或普通少年，各有自卑、愿望和有限的应对能力。',world:'校园、家庭、升学与同伴环境共同作用，生活边界具体。',conflict:'同伴冲突、家庭代沟、初恋与自我认同相互牵动。',voice:'细腻、富有心理活动和意象，意识流片段仍保持事件可理解。'},
    authorSettings:{genres:['群像成长'],styles:['细腻克制','诗性意象'],audience:['年轻读者'],pacing:['日常细节优先','张弛交替'],plotGoals:['守护目标','关系升级'],conflict:['关系张力','价值观碰撞'],subplot:['友情支线','家族支线'],endings:['余韵留白'],protagonistTraits:['敏感细腻','普通人视角'],plotElements:['家庭矛盾','关系成长'],contentTags:['成长','友情','亲情'],globalNovelTags:['身份认同','自我成长','情绪共鸣']},humanization:{oralRatio:40,thoughtBreakEnabled:true,thoughtBreakRatio:15},
    rules:['成长通过选择和认识变化体现，不要求所有冲突圆满解决。','人物言行、恋爱情节及内容分级符合已设定年龄；创伤不能代替完整人物。'],audit:['检查年龄与行为、心理变化铺垫、家庭同伴关系和成长弧光。'],tags:['心理优先','家庭责任','身份认同','友情','释然和解']
  },
  {
    id:'literary',name:'严肃文学／大墙内伤痕',group:3,description:'透过小人物的生活，呈现时代与尊严。',
    dimensions:{promise:'苦难、人性光辉和时代荒诞带来的思考与余味。',protagonist:'时代中的小人物或知识分子，有生活欲望、矛盾和尊严。',world:'选择明确年代与地域，以日常生活呈现长期社会变迁。',conflict:'时代压力、贫困、关系与信仰变化改变个人命运。',voice:'诗意厚重而克制，隐喻和重复意象扎根于真实生活细节。'},
    authorSettings:{genres:['严肃文学'],styles:['诗性意象','细腻克制','现实烟火'],audience:['严肃文学向'],tense:['线性推进','时间跳切'],pacing:['慢热铺陈','日常细节优先'],openingHooks:['日常切入'],plotGoals:['守护目标'],conflict:['人物选择','价值观碰撞'],risk:['不可逆损失','道德两难'],endings:['余韵留白'],reversalPlan:['认知反转'],foreshadowPlan:['重复意象','人物习惯伏笔'],payoff:['情绪回报','延迟回报'],protagonistTraits:['普通人视角','敏感细腻'],plotElements:['历史事件','家庭矛盾'],globalNovelTags:['时代洪流','诗性表达','余味悠长','人性抉择']},settings:{growthRule:false},humanization:{oralRatio:15,emotionalBurstRatio:8},
    rules:['不把正向成长等同于成功逆袭；允许悲剧、未解矛盾与克制留白。','社会变迁通过具体人物与生活呈现，隐喻不能替代因果，虚构与史实界限清楚。'],audit:['检查跨年代时间线、人物信仰变化、生活细节和意象发展，不以爽点密度评价本类型。'],tags:['时间跳跃','重复意象','代际创伤','尘土粗粝','末段留白']
  },
  {
    id:'alternative-history',name:'历史演义／架空历史',group:3,description:'从明确的历史分叉出发，推演制度与文明变化。',
    dimensions:{promise:'改变历史走向与推动制度、技术发展的成就感。',protagonist:'穿越者或有超前认识的历史人物，知识受资源与组织能力限制。',world:'以明确王朝疆域和社会条件为起点，划定历史分叉。',conflict:'技术发展、土地制度、战争与权力组织产生连锁变化。',voice:'严谨、适度古雅，经济、军政与人口细节服务实际决策。'},
    authorSettings:{genres:['历史架空'],styles:['古典雅致','纪实冷静'],structure:['三幕结构'],plotGoals:['资源积累','建立秩序'],conflict:['资源争夺','价值观碰撞'],risk:['连锁后果','失败有代价'],subplot:['历史支线','势力支线'],payoff:['能力回报','延迟回报','结局回报'],plotElements:['历史事件','组织对抗','资源争夺'],globalNovelTags:['历史考据','种田发育','权谋博弈','因果清晰']},
    rules:['总纲明确历史分叉点；分叉前尊重已选历史基础，分叉后允许改变结局并持续推演后果。','技术发展需要原料、能源、工艺、人口和组织条件；现代知识不能凭空变成工业产能。'],audit:['检查分叉前后史实边界、科技树先决条件、经济资源与政治军事连锁后果。'],tags:['历史背景','资源体系','社会制度','势力格局','连锁后果']
  }
];
// Precise per-book genre labels supplement the original coarse taxonomy only
// for selected presets; they are not added to legacy global option lists.
export const PRESET_EXTRA_GENRES = ['西方奇幻','星际科幻','都市异能','幕后布局','谍战惊悚','冒险寻宝','严肃文学'];
// Every chapter tag below belongs to the existing chapter library.
const tagAliases = { '信仰崩塌':'价值观冲突', '异常事件':'未知威胁', '家族利益':'利益交换', '连锁后果':'扩大影响' };
function deepFreeze(value) { if(value && typeof value==='object') { Object.values(value).forEach(deepFreeze);Object.freeze(value); } return value; }
export const NOVEL_PRESETS = deepFreeze(rows.map(row=>({
  id:row.id,name:row.name,group:PRESET_GROUPS[row.group],version:1,description:row.description,dimensions:row.dimensions,
  authorSettings:{...base,...row.authorSettings},humanization:{...humanization,...row.humanization},settings:{growthRule:true,...row.settings},
  rules:row.rules,audit:row.audit,chapterTags:{...phases,flavor:row.tags.map(tag=>tagAliases[tag]||tag)}
})));
export const novelPresetById = id => NOVEL_PRESETS.find(p=>p.id===id);
