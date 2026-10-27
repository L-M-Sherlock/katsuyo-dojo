# てしまう／ちゃう非过去形语气与视角专项审核（2026-10-27）

> **后续用户取舍（2026-10-27）**：原25项可选润色中，用户选择保留16项、暂缓其余9项，详见[16／9取舍清单](usage-card-completion-tone-user-choice-20261027.md)。下文281项是冻结时范围，仍保留原专项票与两项英语修订的历史闭环；新增暂缓不改写旧结论。

范围为冻结时正在出题的 `teshimau`、`chau` 共 281 个唯一 ID，拆为 18 份、每份不超过 16 卡。`usage:chau:verb:拾う:ひろう` 已按用户方案另行修订，明确排除。本轮只检查场景、日语完整句和中英译文之间的语气、视角与施事是否相容，不代表对 281 卡重新完成全部语法、自然度和读音审核。

6 名独立审核者均使用 `gpt-6-sol`、`medium`：`/root/completion_tone_review_0` 至 `/root/completion_tone_review_5`。协调者只冻结原有在用对象和核验交付；源 delivery 的 `author` 是对象存储协议阶段，不表示本轮由新作者创作。

| 状态 | 最终独立票 |
| --- | ---: |
| 一致（consistent） | 254 |
| 可选润色（optional-polish） | 25 |
| 确认需修订（revise） | 2 |
| 待核实（uncertain） | 0 |

两项确认问题均仅修英语译文，保留日语、中文场景、中文译文、reading 和完整 canonical 对象。独立修订轮 `completion-tone-fix-20261027-teshimau` 已接入；历史票仍为 revise 2，当前已解决 2、开放 0。25 项可选建议保持建议状态，未据此自动改卡或暂缓。

## 两项确认问题与修复

### `usage:teshimau:verb:呼ぶ:よぶ`

- 原日语：入口で待っている人を全員呼んでしまう。
- 原中文场景：门口队伍已经排好，打算一次叫齐大家。
- 原中文译文：把在入口等着的人全部叫过来。
- 原英文场景：A line has formed at the entrance, and she plans to call everyone over at once.
- 原英文译文：Call everyone waiting at the entrance in.
- 确认依据：英语场景明确是她打算一次叫齐入口的人，日语非过去句也陈述此行动；英语译文“Call everyone…”却是对别人下命令，叙述转引语无法解释施事变化。中文无主语译文可读为省略主语的计划，也可读为命令，宜澄清但不足以定为错误。
- 最终英文译文：I'll call in everyone waiting at the entrance.
- 原 canonical SHA-256（修订后完全相同）：`6d5a375ed36d2f2f7a8a636055ca0ec78042c6b07a97a876dcf54c4282ee718b`
- 英语 SHA-256：`a494c48ae6efec83e3f26779fb73b7c7b7f9cbfc58c6a5f6f0b6043d6b2d5944` → `45691ba34507c04f5067f90a4a0df34282ec9bc825e49e1cbdb710dcb926758e`。

### `usage:teshimau:verb:分かる:わかる`

- 原日语：その書評を読むと、結末まで分かってしまう。
- 原中文场景：提醒朋友别读书评，否则会提前知道结局。
- 原中文译文：读了那篇书评，连结局都会提前知道。
- 原英文场景：You warn a friend that a book review will reveal the ending.
- 原英文译文：If I read that review, I'll end up finding out even the ending.
- 确认依据：场景是在提醒朋友不要读书评，日语省略主语可承接朋友；英译却写成“If I read”，把被剧透者换成说话人。
- 最终英文译文：If you read that review, you'll end up finding out how it ends, too.
- 原 canonical SHA-256（修订后完全相同）：`25c3d2b4303df5c5a27ec7ea1cf5df388b36b379f260098e3092e10524f443e0`
- 英语 SHA-256：`5aecf0294d93d5e6db807e315703192f9b53d8773d0ab14941a6ef4324ad8c5a` → `aff716be5a79c1a71259cf629243ca66001486032534723685a744bdf4e7b25e`。

两项由真实作者 `/root/hirou_bilingual_author`（`gpt-6-luna`、`max`）交稿，独立审核者 `/root/hirou_bilingual_review`（`gpt-6-sol`、`medium`）逐卡批准。作者 receipt、审核 receipt、原对象、英文行、完整句及最终票均封存在压缩证明的 `resolution` 中，并与完整 reviewed-revisions 历史链及当前对象逐项核对。

## 初评与针对性复核

18 份初评已先行冻结，计数为 consistent 251、optional-polish 20、revise 10。初评中把英文场景的第三人称旁白与角色发话时的第一人称机械视为矛盾，或仅凭中文“吧”等措辞判断语气错误；协调者没有自行批准，而由原独立审核者针对性重审。最终有 8 个初评 revise 更正为 3 个 consistent、5 个 optional-polish；另有呼ぶ的理由细化，结论仍为 revise。

6 份发生变化的最终报告另存 review rev2，12 份字节相同的报告直接复用原初评 receipt；18 份初评原字节与收据完整保留，未覆盖。具体更正依据来自审核者最终票：

| 卡片 ID | 初评 → 最终 | 最终独立理由摘要 |
| --- | --- | --- |
| `usage:teshimau:verb:書く:かく` | revise → consistent | 英语场景以第三人称描述计划写报告的人，英语译文改用此人发话时的第一人称；施事、午前写完的时间和完成范围均一致。 |
| `usage:chau:verb:書く:かく` | revise → consistent | 英语场景以第三人称交代她怕忘记灵感，译文是这名发话人向对方说“我先写结尾”；人物与行动并未改变。 |
| `usage:chau:verb:貸す:かす` | revise → optional-polish | 中文场景以第三人称介绍室友，日语句子可由这位室友亲口说出；中文和英文译文中的“我”都指借车给健太的同一人，没有借出人或对象变化。 |
| `usage:chau:verb:立つ:たつ` | revise → optional-polish | 前排人站起会挡住后排视线，「立っちゃうと」也能说明眼前已发生的遮挡；现有中英文场景可与这个一般因果句并存。场景若明确是在提醒“起身会遮挡后排视线”，会更容易读懂。 |
| `usage:teshimau:verb:消す:けす` | revise → consistent | 活动已经结束、说话人正在擦白板时，仍可用非过去形说明离开前要把字全部擦净；英场景的进行中动作与日语的完成目标相容。 |
| `usage:chau:verb:打つ:うつ` | revise → optional-polish | 朋友还想练几球并不确定这筐球归谁使用，也未说明双方是否轮流；说话人宣告打完自己这筐球可以成立，中英场景补明分工会更清晰。 |
| `usage:teshimau:verb:始める:はじめる` | revise → optional-polish | 人员已到齐时说「就把说明会开始吧」可以是说话人软化宣布自己的开场决定，未明确要求大家共同执行；日语直陈与英文的自我决定仍可对应。 |
| `usage:teshimau:verb:する:する` | revise → optional-polish | 英文场景的泛指 you 可让学习者代入接任务并立即做完的人；译文 I 是该角色自己的话，行为主体、习惯性和完成含义均未改变。 |

## 25 项可选润色建议

以下均是独立审核者的可选建议，不计为确定错误，也不作为本轮改卡或暂缓依据。其原句、完整源对象、英文行与哈希保存在对应 packet。

| 卡片 ID | 原完整日语句 | 审核者可选建议 |
| --- | --- | --- |
| `usage:chau:verb:歌う:うたう` | 残りの部分は、私が歌っちゃうね。 | 若强调主动承担，中文可写“剩下的部分我来唱完啦”。 |
| `usage:chau:verb:貸す:かす` | 今日は使わないから、この自転車は健太に貸しちゃうよ。 | 若要消除场景到引语的视角跳转，可写“室友对来访朋友说：今天不用车，要借给健太”。 |
| `usage:chau:verb:申し込む:もうしこむ` | 忘れる前に、この講座に申し込んじゃうね。 | 中文译文可改为「趁还没忘，我先把这门课报上啦。」 |
| `usage:chau:verb:喜ぶ:よろこぶ` | そんなに褒められると、喜んじゃうよ。 | 可把英文场景的 someone’s new hairstyle 明确为 my new hairstyle。 |
| `usage:teshimau:verb:眠る:ねむる` | うちの子は車に乗ると、すぐに眠ってしまう。 | 中文译文可写“我家孩子一坐上车，很快就会睡着。” |
| `usage:teshimau:verb:浴びる:あびる` | 暑い日は、帰ったらすぐにシャワーを浴びてしまう。 | 若要凸显完成，可译为 I get my shower out of the way as soon as I get home；原译文仍可成立。 |
| `usage:teshimau:verb:できる:できる` | この機械なら、数分で料理ができてしまう。 | 中文可写“用这台机器，几分钟就能把饭菜做好”。 |
| `usage:teshimau:verb:止める:とめる` | 点検の前に、機械を全部止めてしまう。 | 英文可改为“I’ll shut down all the machines before the inspection.” |
| `usage:teshimau:verb:集める:あつめる` | 生徒が帰る前に、答案を全部集めてしまう。 | 英文可改为“I’ll collect all the answer sheets before the students leave.” |
| `usage:chau:verb:弾く:ひく` | 「休憩の前に、この曲を最後まで弾いちゃうね。」 | 可将中文场景明确为“合练休息前，自己告诉朋友要先把这首曲子弹完”。 |
| `usage:chau:verb:立つ:たつ` | 前の人が立っちゃうと、後ろから見えなくなるよ。 | 可把场景写清为前排有人起身挡住后排，发话者借此提醒起身会遮挡视线。 |
| `usage:chau:verb:打つ:うつ` | このかごのボールは全部打っちゃうね。 | 中英场景可注明这筐球轮到说话人打，或朋友请说话人把这一筐打完。 |
| `usage:chau:verb:咲く:さく` | このつぼみ、明日には咲いちゃうよ。 | 若要凸显ちゃう的感叹，可在场景写“没想到明天就会开”；中英文译文也可保留惊喜口吻。 |
| `usage:chau:verb:焼く:やく` | このパンも焼いちゃうね。 | 中文译文可改为“这块面包我也一起烤了哦”，更明确保持将来行动。 |
| `usage:teshimau:verb:注ぐ:そそぐ` | 急須に残ったお茶を、空になった客のカップに全部注いでしまう。 | 中英场景可改为主人准备把壶中剩茶全部倒入客人的空杯。 |
| `usage:chau:verb:注ぐ:そそぐ` | 急須に残ったお茶を、そっちのカップに全部注いじゃうね。 | 中文译文可写“壶里剩下的茶我全倒进你杯里哦”。 |
| `usage:chau:verb:返す:かえす` | 雨がやんだので、傘を返しちゃうね。 | 中文场景可写“雨停后，向借伞的朋友说自己现在就还伞”。 |
| `usage:chau:verb:勝つ:かつ` | この勝負は私が勝っちゃうよ。 | 中英场景可改为朋友问谁会赢，或补明双方正要开始这一局。 |
| `usage:chau:verb:送る:おくる` | 確認できたから、この写真を送っちゃうね。 | 中英文场景统一说明是谁确认了照片。 |
| `usage:chau:verb:乗る:のる` | 寒いから、先にタクシーに乗っちゃうね。 | 可将英文场景改为 I tell my friend I am getting into the taxi first because it is cold. |
| `usage:chau:verb:残る:のこる` | その値段だと、商品が全部残っちゃうよ。 | 可将中文译文改为“这个价格的话，商品会全部剩下哦”。 |
| `usage:teshimau:verb:始める:はじめる` | 全員そろったので、説明会を始めてしまう。 | 中文可改为「人都到齐了，我这就开始说明会。」以显明行动者。 |
| `usage:chau:verb:見せる:みせる` | 新しく描いた絵を見せちゃうね。 | 中文译文可简化为「我把刚画的新画给你看看啦。」 |
| `usage:teshimau:verb:生まれる:うまれる` | 予定より早く子猫が生まれてしまう。 | 英场景可明确写预计小猫会提前出生、照料者还没有准备好。 |
| `usage:teshimau:verb:する:する` | 簡単な仕事なら、すぐにしてしまう。 | 为减少视角切换，可把英文场景写成 When I get a simple task, I often finish it right away。 |

## 机械验证与证据

- `node scripts/verify-completion-tone-audit.mjs`：逐 ID 校验 281 卡，无漏项、重复或源哈希漂移；核对 packet、输入 SHA、18 份初评、18 份最终票、审核者身份与模型、receipt 和逐卡判断。
- 先验证完整 `docs/usage-card-reviewed-revisions.v1.json` 链，再绑定同一历史 input 的 canonical 与 English 联合哈希；后续修订不会把历史专项票冒充当前批准。
- 核对第 17 轮精确两项范围、真实作者与独立审核者、最终 approved 票、English 译文实际变化及 canonical 完整对象不变。
- `node --test tests/completion-tone-audit.test.mjs`：检查篡改字节、缺失或重复范围、虚增统计、伪历史输入、丢失初评、缺失或篡改修订链等拒收行为。

可移植证据：`docs/usage-card-completion-tone-audit-20261027.json.gz`。归档专项测试7／7和项目全量测试1,220／1,220通过；用法卡、i18n、字体审计、类型检查、Lint和构建通过。发布随本轮main提交执行，部署结果以[CI与Pages记录](https://github.com/L-M-Sherlock/katsuyo-dojo/actions/workflows/ci.yml)为准。
