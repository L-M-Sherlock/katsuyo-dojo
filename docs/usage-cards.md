# 场景与用法卡

用法卡是单独审核的学习内容，与 `context` 内部适用性说明分开。题目仍明确指定目标形式，用户只填写变化后的完整词形；卡片不改变题库、选题、计分或独立复测规则。

## 展示

- 只匹配相同词义、相同目标形式；无匹配时完全不展示，也不借用其他词的例句。
- 正面是短中文场景和日语挖空句。完整目标形式全部留空，槽位宽度固定，不暗示答案长度。目标读音、完整译文和说明也不提前挂载。
- 原题答对或查看答案后显示完整例句、目标读音、译文与可选说明。需要拆步时，须等完成或跳过拆步才展示；正面继续留空。
- 本题已有目标形式，场景和挖空句是题干，不记录为提示。独立掌握度仍衡量构形能力，而不是能否自行选择语法。
- 截至 2026-09-24，当前在用 17,261 张：基础变化 1,831、可能与态 1,968、连接与条件 1,930、意愿与要求 3,585、动作与状态 6,646、综合运用 1,301。完整自然度审核从 17,596 张冻结卡中保留 17,560 张、精确暂缓 36 对；其后用户指定暂缓 16 张，并从课程中移除「ておらない／ておらなかった」两种形式及其在用卡（与用户指定暂缓重叠 9 张）。详见[用户指定暂缓记录](usage-card-user-directed-deferrals-20260924.md)和[形式移除记录](retired-teoru-negatives-20260924.md)。此前各阶段的制作数量与发布范围见下文历史记录，不应当作当前在用总数。

## 仓库内 skill

制作与审核使用 [.agents/skills/write-katsuyo-usage-cards/SKILL.md](../.agents/skills/write-katsuyo-usage-cards/SKILL.md)，课程级任务另读[协调者流程](../.agents/skills/write-katsuyo-usage-cards/references/coordinator.md)。仓库版本是维护来源，包含作者／审核者规则、专项语言审核、清单校验和读音对照脚本；不再依赖本机个人目录。

翻译用法卡时另读[本地化覆盖与英语审核](../.agents/skills/write-katsuyo-usage-cards/references/localization-review.md)。英语内容是按稳定卡片 ID 绑定的独立覆盖层，不修改本节所述 canonical 卡片。

从仓库根目录运行工具时，可设置 `SKILL_DIR="$PWD/.agents/skills/write-katsuyo-usage-cards"`，再使用 skill 中的命令。分派任务应给出该目录、只读清单和独占输出文件的实际路径。临时草稿、读音报告和试作放任务临时目录；skill 源码随仓库维护，不加入网站运行时包。个人安装副本需要更新时，从仓库同步，不在两处分别维护。

## 编写接口

`app/lib/usage-cards/` 下的数据文件各默认导出卡片数组。新增卡片用 `usage:FORM:SENSEID` 等稳定唯一 ID，不覆盖首批的 `usage:FORM` ID。字段如下：

```js
{
  id: 'usage:negative',
  senseId: 'verb:飲む:のむ',
  meaning: '喝', // 必须与当前词库释义完全一致
  form: 'negative',
  scene: '明天要早起，今晚决定不喝酒。',
  before: [{text: '今夜はお酒を', reading: 'こんやはおさけを'}],
  after: [{text: '。'}],
  translation: '今晚不喝酒。',
  review: 'draft'
}
```

`before` 和 `after` 之间隐含唯一目标槽位，现有活用器生成完整答案及读音。不要把目标形式的一部分放在槽外；不得自行写入答案字段，也不得更换词条后机械复用同一例句。句段中的汉字需配假名读音，纯假名或标点可省略 `reading`。原始汉字句和读音应逐段对应。

正文 `text` 采用自然的日语书写：常用词用常用汉字，读音写入 `reading`，由页面显示注音。不能为了省注音而把整句写成全假名，也不能只改开头的一个词。例如 `{text: '彼は昨日、授業に', reading: 'かれはきのう、じゅぎょうに'}`。助词、助动词以及「ください」「ゆっくり」「かばん」等自然假名写法照常保留。正文与读音的标点应对应，避免丢失逗号两侧汉字的注音分界。

中文场景以 12～24 字为目标，最多 32 字。说明人物、对象和必要条件，不使用“什么时候用”标题及抽象审核措辞。译文最多 160 字；可选 `note` 最多 60 字，只解释实际需要说明的视角或用法，避免重复已有构形规则。

## 分工与审核

按固定词义／形式清单划分互不重叠的数据文件，由作者子代理以 `gpt-6-astra low` 先写 `draft`，再由两名独立的 `gpt-6-astra medium` 审核者检查完整日语句、读音、译文、场景、人物视角、肯否、时态和语体。逐卡意见冲突时，只把冲突项交第三名审核者复审。主代理负责范围、调度、机械检查、审核法定人数和接入，不代替审核者作语言裁定。草稿不会展示；下文早期批次的主代理复核记录属于历史流程。

优先选择常见且适用的词。不能为覆盖难形式而虚构自然度；不确定的用法需要查阅可靠语法资料并重新选词或场景。相近表达可以复用人物背景，但完整句必须分别审核。

`node scripts/audit-usage-cards.mjs --draft --sentences` 可检查草稿并列出完整句；去掉 `--draft` 会同时检查形式覆盖、所有实际适用的词类覆盖和六个课程阶段的逐词覆盖。要求从当前课程、词库及适用性规则推导，不用固定总数代替覆盖验证。同一形式和词类的其他卡不能掩盖缺失词条。结构校验不能替代自然度审核。

报告中的 `writingReview` 提示全假名长句或较长的连续平假名，供作者检查是否遗漏常用汉字。它不影响判分、显示或校验的退出状态；自然的假名句段可以保留，不能为了消除提示强行改成生僻汉字。审核还需查看实际注音，不能只检查是否填了读音字段。

注音审核分为三层：结构检查正文中的假名／送假名是否与 `reading` 对应；词典与人工核对读法是否适合完整句中的词义；页面确认 ruby 分界。改写正文时必须同步重审读音。结构合法不能证明「表」的表格义应读「ひょう」；词典分词器也可能把「出る」的使役按「出す」解释，不能自动覆盖题目指定词义的读音。数字「〇」参与汉字注音分组，年份按实际数字读，不逐字机械拼接。

此前 2,219 张卡的扫描范围、12 张修正与保留异读的理由见[注音复核记录](usage-card-reading-audit.md)。

卡片属于静态教学资源，不随个人进度保存或导出；不用个人备份编写测试，不需要进度迁移。

## 本地化覆盖层

运行时的中文题卡索引只保存词义／形式映射，第一次显示对应卡片时才校验句段、解析日语目标并缓存。英语索引复用该结果，仅按卡片 ID 替换场景、译文与说明，不再重建整套日语词形。英语入口提前启动翻译资源下载，与主程序并行加载；语言切换复用已加载的英语索引。分类题没有用法卡，因此不等待翻译资源；需要卡片的活用题继续保留加载与失败重试状态。构建审计仍全量验证卡片及英语审核哈希。

每种语言维护独立覆盖层。覆盖层只提供学习者可见的 `scene`、`translation` 和可选 `note`。日语句段、reading、目标形式、词义 ID、形式 ID、课程身份、适用性和审核状态继续来自 canonical 卡片。

```js
{
  id: 'usage:negative',
  sourceHash: 'sha256:…',
  scene: 'The speaker decides not to drink tonight.',
  translation: 'I will not drink alcohol tonight.',
  note: 'Optional short usage note.'
}
```

`id` 是跨语言稳定身份。`sourceHash` 绑定最终运行时 canonical 卡片内容。源卡变化后，旧翻译及其审核结论立即过期；必须根据新卡重新核对，不能只刷新哈希。翻译不能回写 canonical 卡片，也不能改动日语、目标形式或题库适用性。

英语首版从最终在用 `USAGE_CARDS` 冻结精确范围。每个批次最多 64 张。全量检查要求 ID 集合完全相等、每卡恰好一条、哈希匹配、字段非空、没有未允许的中文残留或答案泄漏。

语言审核采用确定性分层抽样。样本包含每个有效“形式 × 词类”至少一张、每个批次至少一张、全部带 `note` 的卡，并对其余卡按稳定 ID 哈希抽取 5%。样本还须覆盖全部课程和六个阶段。任一样本失败时，修订该卡并扩查它所属的整个批次；模板问题扩查所有受影响批次。全量检查、样本审核和扩查均通过后才能接入该语言。完整操作规则见上述本地化 reference。

对冻结的英语作者批次生成审校包：`node scripts/sample-english-usage-review.mjs`。默认读取当前运行时 `USAGE_CARDS`、最终英语覆盖层，以及 `work/i18n-english-usage-cards-gpt/` 下的清单、分配、作者输出和收据，将抽样清单与每包最多 64 张的 JSON 写入被 Git 忽略的 `work/i18n-english-usage-cards-review/`。可用 `--work-dir`、`--output-dir` 指定路径。清单保存算法版本、冻结哈希、最终英语覆盖层和模块的收据哈希、样本 ID 及审校包字节哈希；每条记录包括完整日语句和目标、中文源字段、英语字段及哈希、课程阶段、正式作者批次及其收据。源卡、英语文案、作者输出或最终模块改变后须重新生成审校包。该命令只抽样，不产生语言审核结论。

独立审核者把每包报告写入 `work/i18n-english-usage-cards-review/reports/review-NNNN.json`，保持审校包原顺序。报告顶层需有 `schemaVersion: 1`、非空 `reviewer`、`selfReview: false`、`packetId`、`packetSha256`、`count` 和 `rows`。每行需有精确的 `id`、`sourceHash`、`englishHash`、`status`（`approved`、`revise`、`uncertain` 或 `source_issue`）、具体且非空的 `reason`，以及七个布尔检查：`englishNatural`、`meaning`、`roles`、`timeAndPolarity`、`register`、`scene`、`noAnswerLeak`。`approved` 的七项检查都须为 `true`。校验器会拒收重复或过短的理由，作为“逐卡写理由”的机械门禁；它不替代语言判断。

全部样本报告到齐后运行 `node scripts/verify-english-usage-review.mjs`。工具逐一核对审校包字节哈希、报告身份及每行顺序和哈希，并在 `work/i18n-english-usage-cards-review/expansion/` 写入状态汇总和完整批次扩查包。任一非 `approved` 样本所在的正式作者批次都会生成一包，包含该批次全部卡片及触发扩查的样本 ID；每包最多 64 张，并绑定作者批次收据、当前英语哈希与最终收据。原始样本报告保留在 `reports/`，工具不会修改它们。可用 `--work-dir`、`--review-dir`、`--output-dir` 指定路径。

样本中需要返修的卡片使用 `node scripts/repair-english-usage-cards.mjs prepare` 冻结作者任务。默认输出到 `work/i18n-english-usage-cards-repair/`：`manifest.json` 列出精确 ID、原英语哈希和每份分配文件的字节哈希，`assignments/repair-NNNN.json` 每份最多 16 张，提供完整日语与中文源卡、原英语、原审核状态／理由／七项检查及 `requiredNote`。作者只在相应 `outputs/repair-NNNN.json` 提交译文，格式为 `{ "schemaVersion": 1, "translatorId": "gpt-6-luna-max", "batchId": "repair-NNNN", "assignmentHash": "…", "cards": [{ "id": "…", "sourceHash": "…", "originalEnglishHash": "…", "scene": "…", "translation": "…" }] }`；源卡有说明时，每张输出还须有非空 `note`。卡片顺序与分配完全一致。

所有返修输出齐全后运行 `node scripts/repair-english-usage-cards.mjs merge`。工具先校验完整输出集合、原英语哈希、字段、说明有无、中文残留与正面日语答案泄漏；全部通过后，只把这些 ID 的英语字段写入正式作者批次输出，调用原英语生成器重建覆盖层和收据，再在返修目录保存逐包 `receipts/` 与 `merge-receipt.json`。样本报告仍作为原始触发证据保存在审校目录。两个命令可用 `--work-dir`、`--review-dir`、`--repair-dir` 指定目录；未收到作者输出前不要运行 `merge`。

返修合并会改变英语哈希，因此原抽样清单不能再作为当前英语内容的审核包。运行 `node scripts/verify-english-usage-review.mjs after-repair`，工具会核对原扩查汇总、原样本包和报告哈希、返修合并收据、当前正式收据及覆盖层／模块哈希，并在 `work/i18n-english-usage-cards-review/expansion-after-repair/` 生成新包。扩查范围仍由原报告中非通过项决定；包内内容和哈希来自返修后的当前覆盖层。新目录首次生成后保持不可变，证据变化会报错，需保留旧目录另开新的审核轮次。

第一轮返修后的完整批次扩查报告放在 `work/i18n-english-usage-cards-review/expansion-reports/batch-NNNN.json`。运行 `node scripts/repair-english-usage-cards.mjs prepare --stage expansion`，工具核对全部扩查报告的文件集合、审校包哈希、批次身份、逐卡顺序及哈希、状态、七项布尔检查和具体理由，并把未通过卡冻结到 `work/i18n-english-usage-cards-expansion-repair/`，每份 `assignments/repair-NNNN.json` 最多 16 张。作者按第一次返修相同的输出结构提交 `outputs/repair-NNNN.json`。所有输出齐全后运行 `node scripts/repair-english-usage-cards.mjs merge --stage expansion`：仅合并实际改动的卡并重建正式英语覆盖层及收据。`rereview/` 只包含改动卡的复审包；`carried-approved.json` 列出英语哈希保持不变、可沿用本次扩查通过结论的卡。原样本与扩查证据始终保留。

针对 `rereview/` 改动卡的报告放在同目录的 `reports/rereview-NNNN.json`。运行 `node scripts/repair-english-usage-cards.mjs prepare --stage rereview`，工具严格核对全部复审报告，并将未通过卡冻结在 `work/i18n-english-usage-cards-final-repair/`，每份最多 16 张。作者按同一输出格式交付后运行 `node scripts/repair-english-usage-cards.mjs merge --stage rereview`。合并会逐卡确认两组已通过卡仍保有原 `sourceHash` 与英语哈希：完整扩查中未修改的通过卡，以及改动卡复审中通过的卡。只有本轮再次改动的卡进入 `final-rereview/`；其中的 `carried-approved.json` 与清单保存沿用通过结论的哈希证据。原始样本、扩查和复审报告均不被改写。

`final-rereview/reports/` 中若仍有未通过项，运行 `node scripts/repair-english-usage-cards.mjs prepare --stage final`，只冻结这些卡到 `work/i18n-english-usage-cards-last-repair/`。校验器再次核对报告文件集合、包哈希、逐卡顺序、身份、七项检查和理由，并核对前两轮沿用的通过卡哈希。作者提交 `outputs/repair-NNNN.json` 后运行 `node scripts/repair-english-usage-cards.mjs merge --stage final`；合并仅修改本轮返修卡，重建正式收据，并在 `last-rereview/` 给实际改动的卡生成最终复核包。所有旧报告和旧包继续保留。

最终 `last-rereview/reports/` 全部通过后，运行 `node scripts/verify-english-usage-release.mjs freeze`。工具验证样本范围外的抽样通过卡、全部扩查卡与沿用通过卡的当前哈希、最终报告和四轮返修收据链，再写入可提交的 `docs/english-usage-release-proof.v1.json.gz`。该压缩证明包含全部在用卡的 ID、源卡哈希和英语哈希，以及范围、报告与收据摘要；不会把 Git 忽略的完整报告提交入库。`node scripts/verify-english-usage-release.mjs verify` 只读已提交证明和当前运行时内容；`npm run audit:i18n` 同样执行此校验，因此后续源卡或英语改动会使审计失败，直到新内容完成审核并重新冻结证明。

## 首批复核记录

四组内容均由指定的 `gpt-5.6-luna` 编写初稿，主代理逐句审阅并退回修订，再核对生成后的完整句、假名和翻译。修订包括否定与双重否定、完成与能力的区别、受身和授受视角、方向表达、较传统的口吻，以及场景与译文的多余推断。172 种形式的内容已全部标记为 `approved`。

例句为原创。用法核对参考包括[国际交流基金的受身说明](https://www.jpf.go.jp/j/project/japanese/teach/tsushin/grammar/201407.html)、[国际交流基金的ておく教材](https://www.kyozai.jpf.go.jp/kyozai/material/BTS00093/ja/render.do)、[国际交流基金的许可请求教材](https://www.kyozai.jpf.go.jp/kyozai/material/BMA00097/ja/render.do)。这些资料用于核对结构，不表示原创例句来自上述教材。

## 词类覆盖扩充与 skill 迭代

第二批按当前题库的 473 个形式／词类组合生成缺口，七个 `gpt-5.6-luna` 子代理按 `write-katsuyo-usage-cards` 分别编写 49、41、40、53、53、33、32 张，共 301 张；各自通过分片范围校验后，进行交叉审稿与主代理逐条复核。原有 172 张内容未改动。87 张初稿在审稿后有修改，包含语义、语用、译文与措辞修订，不作为模型错误率统计。

实际问题促成三项 skill 改进：

- 按缺失的形式／词类生成任务，校验每个分配组合恰好一张，避免只验形式数或总数量。
- 审稿报告同时显示课程目标含义，检查是否误用了另一种合法语法用义，例如不能以「つつある」渐变替代本课的同时动作。
- 增加原词含义与否定方向的反向核对、する等动词的真实宾语搭配及重复动作检查；审稿建议保持分配的形式和词类。

更新后的 skill 由一个全新 Luna 子代理在临时目录独立完成四条试作，结构检查与主代理语言复核通过；试作未加入题库。该批次使用本机技能目录；目前已改为以上仓库版本统一维护，skill 源码不加入网站运行时包。

## 基础变化逐词补齐与 skill 迭代

第三批以网站课程的 `stageId: basics` 为范围，排除动词和形容词分类题。动词补充 1,224 张、形容词补充 522 张，分成 18 个文件，位于 `app/lib/usage-cards/basic-words/`。各批由用户指定的 `gpt-5.6-luna` 按 skill 编写，经过交叉审稿、主代理复核和返修后接入；原有 473 张内容保持不变。

按词条分片，让同一词的肯定、否定、过去及连接形式可以一起审阅。首次稿件和复审暴露出机械套句的问题，两批因此整体重写；其余批次修订了时间冲突、否定与能力／禁止混淆、自他动词助词、形容词与名词用法混淆、遗漏或增添译文信息等内容。结构校验通过和子代理自审摘要均不作为语言质量证明。

skill 本次增加：

- `prepare --stage basics --missing-pairs` 生成固定词义／形式的完整缺口；与制作分工用的 `--group basics` 区分，后者还包括态。
- `check --assignment` 支持精确词义／形式要求，逐项核对一张卡；报告按词条归组展示完整句。
- 每个形式显式编写自己的场景、句段和译文，避免按词尾拼“昨天”“没有做”等中文。相同人物背景可以复用，语义审核不能省略。
- 修订后重新检查生成正文，防止遗留旧场景、重复主语、未使用示例字段及报告与实际内容不符。

更新后的 skill 另由一名全新 Luna 子代理在临时目录完成 8 张固定词义／形式试作。主代理发现其中一张把“不拿”译成“不要拿”，修订后重新校验，并把陈述否定与禁止的区别补入 skill；试作不加入题库。项目测试保留原有 473 个公开词义／形式对作为覆盖基线，不使用个人学习数据。


## 可能与态逐词补齐

第四批针对 `stageId: voice` 的 5 门课程、17 种目标形式。33 个文件新增 1,968 张：可能 484、受身 440、使役 512、使役受身 532。原有 2,219 张卡片的内容逐对象核对，保持不变；加上原有 49 张态代表卡，覆盖当前全部 2,017 个有效词义／形式组合。

初稿由 `gpt-5.6-luna` 子代理按 skill 编写，经过交叉审稿、独立终审与主代理复核。审核同时发现部分原先允许出题的组合缺少适合日常教学的自然用法；经用户授权，按具体词义和形式收紧 48 个组合，不以编造例句凑满旧题池。限制范围、保留依据、读音核对、skill 试作及课程可达性结果见[可能与态用法卡复核](usage-card-voice-audit.md)。

skill 增加可能与态专用审核，任务清单提供自他性及内部适用性条件。验收按当前有效词义／形式逐项检查；翻译字段混入日语也会报错。结构检查、独立词典对照与终审职责仍分开，不能以程序通过代替语言审核。


## 连接与条件逐词补齐

第五批针对 `stageId: linking` 的 9 门课程、13 种形式，新增 1,814 张，分为 59 个内容文件，位于 `app/lib/usage-cards/linking-words/`。加上原有 38 张代表卡，覆盖当前全部 1,852 个有效词义／形式组合。原有 4,187 张内容逐对象核对，保持不变。

Luna 子代理编写初稿后，独立终审和主代理复核拒收并重写了通用后项、占位翻译与全假名模板。审核依据具体词义和课程用法，暂缓 16 个没有通过本轮自然度审核的配对；没有用条件义代替本课的ては反复，也没有用结果状态或逆接代替并行。ては的“表达作用”同步改为本课反复含义。

skill 新增连接与条件专项审核、只读精确分配清单、扩写出现模板时缩小批次、按最终文件重跑审核等要求；另有独立小批试作验证与返修。范围、证据、读音与课程验证见[连接与条件用法卡复核](usage-card-linking-audit.md)。
