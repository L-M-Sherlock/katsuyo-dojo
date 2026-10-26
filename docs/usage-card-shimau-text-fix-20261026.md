# てしまう／ちゃう 保留卡译文与注音修订（2026-10-26）

用户要求修正保留卡的17项附属问题并发布后，本轮已完成17张卡的中英文／注音修订、独立审核与本地接入。17个历史开放ID涉及的19个字段意见现均由后续修订凭据关闭，`currentAncillaryOpen = 0`；原始审核票及用户24保留／94暂缓记录继续保存。

**本地验证完成：1,209／1,209项全量测试通过，知识、适用性、用法卡、i18n、综合运用、字体审计，全对／混合模拟、类型检查、Lint和构建均通过。** 本轮通过推送至main触发CI与GitHub Pages发布；线上部署结果以[CI部署记录](https://github.com/L-M-Sherlock/katsuyo-dojo/actions/workflows/ci.yml)为准，独立语言审核通过本身不代表已部署。

## 本轮范围与结果

|项目|本轮结果|
|---|---:|
|精确卡片ID|17|
|新增精确范围审核轮次|6|
|canonical对象有改动|10|
|canonical对象原样保留|7|
|英文场景／译文实际有变化的对象|17|
|日语正文发生变化|0|
|最终独立审核通过|17|
|历史附属开放ID／字段|17／19|
|当前附属开放ID|0|

canonical 的10项变化由中文场景、中文译文和一处注音修正构成；7项 canonical 完全原样保留，但其英文覆盖对象仍有文本变化。本轮没有改写任何日语正文、固定词义或目标形式。English 17项变化按实际场景／译文字符串核对，不把仅更新 `sourceHash` 算作改稿；其中似る的英文仅是撇号排印调整，原有英文含义保持。

用户指定的94个新增教学暂缓继续生效；既有暂缓、用户保留集合和旧自然度意见均未借本轮改写。修订范围仅为原24条保留项中有附属意见的17个精确ID。

## 独立作者、审核者与便携凭据

- 作者A：`/root/shimau_text_author_a`，`gpt-6-luna`／`max`；负责 `shimautext/00`、`01`、`02`，共7张。
- 作者B：`/root/shimau_text_author_b`，`gpt-6-luna`／`max`；负责 `shimautext/03`、`04`、`05`，共10张。
- 审核者A：`/root/shimau_text_review_a`，`gpt-6-sol`／`medium`，独立审核作者A的不可变快照。
- 审核者B：`/root/shimau_text_review_b`，`gpt-6-sol`／`medium`，独立审核作者B的不可变快照。作者和审核者是不同代理；最终17条均有 `approved` 逐卡票。

[正式便携修订证明](usage-card-reviewed-revisions.v1.json)新增以下6轮，每轮使用明确的 `scopeIds`；输入源卡、原英文对象、作者稿件、读音核对与最终独立审核均内嵌在对应delivery。以下工作目录链接只是镜像，重建证据不依赖工作目录长期存在。

|新审核轮次|批次／数量|作者版本／审核版本|作者receipt|审核receipt|
|---|---|---|---|---|
|`shimau-text-fix-20261026-chau`|`shimautext/00`／2|1／1|[`16d9b8d88c6575fde9dc29278c0171978874f85e637c867d3f09dd86630df5b9`](../work/shimau-text-fix-20261026/deliveries/shimautext/00/rev-1-author-551c3a02-772a-4169-a85e-15a83fb98247/snapshot.json)|[`6a910b839212667c306d07550f776778f591415a49159bb9534de8409ffa8159`](../work/shimau-text-fix-20261026/deliveries/shimautext/00/rev-1-review-b58a3363-f284-4e70-b54e-93bddadafdf8/snapshot.json)|
|`shimau-text-fix-20261026-teshimau`|`shimautext/01`／3|1／1|[`48c851dbf17452bec5e7b913ff8b4fa16b7175f12fc49ae00cb8452a9bbafda8`](../work/shimau-text-fix-20261026/deliveries/shimautext/01/rev-1-author-6633ec50-0685-403a-8a62-d706c0f16c33/snapshot.json)|[`d31790afb98234ed046be14e58615d4f03d94123f98a86872de72ccf43d408d8`](../work/shimau-text-fix-20261026/deliveries/shimautext/01/rev-1-review-7420765e-acc6-4485-be3c-50cfa5dc9492/snapshot.json)|
|`shimau-text-fix-20261026-teshimauPast`|`shimautext/02`／2|1／1|[`7fb3221cf9a52e543ba0859fa0c2fa6cb55f3d785acf108e9e6f45884ea07eb8`](../work/shimau-text-fix-20261026/deliveries/shimautext/02/rev-1-author-09285819-ddde-4c5d-9243-908024638fbb/snapshot.json)|[`8728207caf691f35df4b307ba3c6ff76eb2b260b65208cff676d2c66874231f7`](../work/shimau-text-fix-20261026/deliveries/shimautext/02/rev-1-review-6c0834ca-b0c2-4ee0-9b66-dc02d0fec101/snapshot.json)|
|`shimau-text-fix-20261026-teshimauNegative`|`shimautext/03`／3|1／1|[`68b378188110a7c278298a03b8f7b60651834408b0ae036bb7331104500f8fcd`](../work/shimau-text-fix-20261026/deliveries/shimautext/03/rev-1-author-f7013928-24ff-485c-a10f-6a301e095ab2/snapshot.json)|[`f74b970e7d57c8316ca40e7f14e054b1f7a14fb9fbb30319360721e0d4de5b44`](../work/shimau-text-fix-20261026/deliveries/shimautext/03/rev-1-review-e108ae57-2412-4ddf-88fa-b5271c52a30d/snapshot.json)|
|`shimau-text-fix-20261026-teshimauNegativePast`|`shimautext/04`／6|2／2|[`120ea2c9ff0bd9744e7f44d96ff57bc57517c5bc3698cd27669d44645c1679e1`](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-author-55c54c3a-7d27-4820-882f-5d0aa6762184/snapshot.json)|[`802e392aff7e70531a55711cc17ef535eeb06a079ae85b2964b36fc0e686fc4f`](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-review-b40534fa-018e-46f3-8129-ef098361f4b1/snapshot.json)|
|`shimau-text-fix-20261026-passiveCompletionPast`|`shimautext/05`／1|1／1|[`bac8c51e7ea81bc7bc6cda87e665f3ad7dc3a01e30fc4a6e4df1cc100b750390`](../work/shimau-text-fix-20261026/deliveries/shimautext/05/rev-1-author-4ff4a297-494c-4da2-ad9b-e7a72f20a67f/snapshot.json)|[`81e0d7aee363dca0bea1c3a91b63e819c1c922ec66ad55e63551af08b8102061`](../work/shimau-text-fix-20261026/deliveries/shimautext/05/rev-1-review-69397ec2-44fb-4595-9b93-919c761f751e/snapshot.json)|

原有9轮保持原顺序与原内容；该前缀的 SHA-256 仍为 `49eeb59cee4eaec0a23c76c12dc36a9d33b8491ac12e588d2c323fabbe12b42b`。本轮只追加6轮，未把旧票改成过去就已通过。[集成摘要](../work/shimau-text-fix-20261026/integrated.json)记录了10／7／17统计及最终对象哈希。

## shimautext/04 的实际返修与拒收记录

批次04的rev1包含6张，其中5张批准、1张英文不通过：`usage:teshimauNegativePast:verb:違う:ちがう`。原句仍是「文章を短くしたら、元の文と意味が違ってしまわなかった？」。独立审核拒收理由为：

> 英语已把问题方向改为是否变得不同，但「did its meaning end up different」缺少 being 等补语，整句英文不自然，须返修该译句。

- rev1英文：After you shortened the article, did its meaning end up different from the original?
- rev2英文：After you shortened the article, did its meaning end up being different from the original?
- rev2补上 `being`，其余已批准对象按哈希锁定。最终rev2的6张均获独立批准；这是一轮实际英文返修，不构成三轮返修失败，也不据此新增教学暂缓。
- 旧作者receipt：`b4c95186cb322119cc8223ed2b73af25bd542a69bcf72ccbf10f665633ada30a`；旧拒收票receipt：`9862e900655efc235002f2409d9bf704de16de1c00f9734a90aaabe61bd0cac8`。可查看[旧作者快照](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-1-author-351fe98e-8620-4ffa-996c-4e33a8b52bb0/snapshot.json)、[旧审核快照](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-1-review-b07cc879-050e-4fe3-822e-c2777fba1036/snapshot.json)和[拒收报告](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-1-review-b07cc879-050e-4fe3-822e-c2777fba1036/review.json)。
- rev1旧稿和拒收票内嵌保留在正式证明该batch的 `earlierSubmissions`，没有用rev2覆盖或删除。

## 逐卡修订、当前内容与哈希

以下17条从本轮不可变输入与最终接入对象逐字段比较。表中“保留”只表示该字段字节未变；每张卡整体的日语正文、中文场景／译文、读音和英文均由上述独立审核者核对。哈希使用仓库 `JSON.stringify` 对象的SHA-256：源／最终canonical以及源／最终English分别记录；最终English的 `sourceHash` 绑定最终canonical。

### 伝える × ちゃう／じゃう

- 精确ID：`usage:chau:verb:伝える:つたえる`。
- 日语正文（未改）：先生がいるうちに、変更点を全部伝えちゃうね。
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/00`，rev1。
- canonical：原样保留；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|跟朋友商量，趁老师还在先把消息说完。|保留：跟朋友商量，趁老师还在先把消息说完。|
|中文译文|趁老师还在，我把变更事项全部传达完哦。|保留：趁老师还在，我把变更事项全部传达完哦。|
|完整句reading|せんせいがいるうちに、へんこうてんをぜんぶつたえちゃうね。|保留：せんせいがいるうちに、へんこうてんをぜんぶつたえちゃうね。|
|English scene|A change needs to be relayed while the teacher is still present.|A friend and I are discussing changes while the teacher is still here.|
|English translation|I'll tell you all the changes while the teacher is still here.|I'll relay all the changes while the teacher is still here.|

- 源canonical SHA-256：`566f5c5f5758af364e1e95986f5565fa5f84b6c9994c089c9fe3e34d3b953873`。
- 最终canonical SHA-256：`566f5c5f5758af364e1e95986f5565fa5f84b6c9994c089c9fe3e34d3b953873`。
- 源English SHA-256：`26eb5d85f61b93b0b6e6ba6ac5ed32499aff7c0eb2cf3c110e9713ec969cf727`。
- 最终English SHA-256：`7732bd68c36c807f0e0703391f855bd6825c6e7ba1552b1f69d8587f450df134`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/00/rev-1-author-551c3a02-772a-4169-a85e-15a83fb98247/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/00/rev-1-review-b58a3363-f284-4e70-b54e-93bddadafdf8/review.json)；对应正式轮次为 `shimau-text-fix-20261026-chau`。

独立审核理由：「先生がいるうちに、変更点を全部伝えちゃうね」中的受话人未指定；新英语用 relay 避免擅加 you，并保留老师仍在场时将全部传达的意思。

### 食べる × ちゃう／じゃう

- 精确ID：`usage:chau:verb:食べる:たべる`。
- 日语正文（未改）：ケーキを見ると、子どもはすぐ全部食べちゃう。
- 本轮原开放字段：注音；最终独立审核：`approved`，批次 `shimautext/00`，rev1。
- canonical：有改动（注音句段）；English：译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|孩子看到蛋糕，总会忍不住吃光|保留：孩子看到蛋糕，总会忍不住吃光|
|中文译文|孩子一看到蛋糕就会马上吃光。|保留：孩子一看到蛋糕就会马上吃光。|
|完整句reading|けーきをみると、こどもはすぐぜんぶたべちゃう。|ケーキをみると、こどもはすぐぜんぶたべちゃう。|
|English scene|A child has a hard time resisting cake.|保留：A child has a hard time resisting cake.|
|English translation|Whenever the child sees cake, they gobble it all up right away.|Whenever the child sees cake, they eat all of it right away.|
|English note|ちゃう is a colloquial contraction of てしまう.|保留：ちゃう is a colloquial contraction of てしまう.|

- 源canonical SHA-256：`d6204e7d90eb60c48c90dcbc27568e439cf7943c07bf1cb63ec2fda46716f8e4`。
- 最终canonical SHA-256：`fd0e8d249354c95b73818496fbfba27c0bcd2fc54f6c035427a31b16df1c8e5f`。
- 源English SHA-256：`3975a5e6c7c8a19c7a0dc17594f854bb3a338c79f2bbdd269e17507f86d93c4c`。
- 最终English SHA-256：`b7562618ef8938570f4edd2384edbcb8d0c90e1121e5716c0ec867c9d03054a6`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/00/rev-1-author-551c3a02-772a-4169-a85e-15a83fb98247/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/00/rev-1-review-b58a3363-f284-4e70-b54e-93bddadafdf8/review.json)；对应正式轮次为 `shimau-text-fix-20261026-chau`。

独立审核理由：「ケーキを見ると、子どもはすぐ全部食べちゃう」表示见到蛋糕就立刻吃光的惯常结果；注音已把片假名ケーキ保留，英语也去掉 gobble 的狼吞虎咽暗示。

### 出かける × てしまう

- 精确ID：`usage:teshimau:verb:出かける:でかける`。
- 日语正文（未改）：今連絡しないと、彼は先に出かけてしまう。
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/01`，rev1。
- canonical：原样保留；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|想和同事当面商量，担心没联系他就先出门。|保留：想和同事当面商量，担心没联系他就先出门。|
|中文译文|现在不联系的话，他就先出门了。|保留：现在不联系的话，他就先出门了。|
|完整句reading|いまれんらくしないと、かれはさきにでかけてしまう。|保留：いまれんらくしないと、かれはさきにでかけてしまう。|
|English scene|I hope to catch my coworker before he goes on a trip.|I want to talk with my coworker in person, but I worry he may head out before I contact him.|
|English translation|If I don't contact him now, he'll leave first.|If I don't contact him now, he'll head out first.|

- 源canonical SHA-256：`45763e06ceebd47657e396fe592b71b66aeccf52f6b7222aab65056af37879b7`。
- 最终canonical SHA-256：`45763e06ceebd47657e396fe592b71b66aeccf52f6b7222aab65056af37879b7`。
- 源English SHA-256：`de2464d436303a1892adefaf97eea43cc5c7ef153cf9325f663b779ca707dec6`。
- 最终English SHA-256：`b06ba84256231c9f06018cb04f72dc294cd632746a6b8a96eeb24e2e2929c561`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/01/rev-1-author-6633ec50-0685-403a-8a62-d706c0f16c33/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/01/rev-1-review-7420765e-acc6-4485-be3c-50cfa5dc9492/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimau`。

独立审核理由：「今連絡しないと、彼は先に出かけてしまう」是怕同事先出门的未来预测；英语场景已删除无根据的旅行信息，并把现在不联系的条件写清。

### 座る × てしまう

- 精确ID：`usage:teshimau:verb:座る:すわる`。
- 日语正文（未改）：長く歩いた後は、椅子を見るとすぐ座ってしまう。
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/01`，rev1。
- canonical：原样保留；English：译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|走了半天很疲倦，看到椅子就忍不住坐下。|保留：走了半天很疲倦，看到椅子就忍不住坐下。|
|中文译文|走了很久之后，一看到椅子就会坐下。|保留：走了很久之后，一看到椅子就会坐下。|
|完整句reading|ながくあるいたあとは、いすをみるとすぐすわってしまう。|保留：ながくあるいたあとは、いすをみるとすぐすわってしまう。|
|English scene|I am exhausted after a long walk, and whenever I see a chair I cannot help sitting down.|保留：I am exhausted after a long walk, and whenever I see a chair I cannot help sitting down.|
|English translation|After a long walk, I see a chair and sit down right away.|After a long walk, whenever I see a chair, I end up sitting down right away.|

- 源canonical SHA-256：`7b1bc8f64ec80a5995ce571082e5ac4c60f173fd264bafdd6f98486c7978dcba`。
- 最终canonical SHA-256：`7b1bc8f64ec80a5995ce571082e5ac4c60f173fd264bafdd6f98486c7978dcba`。
- 源English SHA-256：`2b3a6e5bbfae9ada3030fa4b198d2e7f2950c30e5ed7aabe0bd451cc0eb764ed`。
- 最终English SHA-256：`598d2a34e1cafa9aa885b13f0e7794e2340f12a21903bd8d5377c4dd99a3b845`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/01/rev-1-author-6633ec50-0685-403a-8a62-d706c0f16c33/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/01/rev-1-review-7420765e-acc6-4485-be3c-50cfa5dc9492/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimau`。

独立审核理由：「長く歩いた後は、椅子を見るとすぐ座ってしまう」为走久后见椅子便不由自主坐下的反复情形；英语用 end up sitting down 保留结果与难抑语气。

### 残る × てしまう

- 精确ID：`usage:teshimau:verb:残る:のこる`。
- 日语正文（未改）：こんなに作ると、料理がたくさん残ってしまう。
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/01`，rev1。
- canonical：原样保留；English：场景有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|菜做得太多，担心吃完饭后还会剩下一大盘。|保留：菜做得太多，担心吃完饭后还会剩下一大盘。|
|中文译文|做这么多，会剩下很多菜。|保留：做这么多，会剩下很多菜。|
|完整句reading|こんなにつくると、りょうりがたくさんのこってしまう。|保留：こんなにつくると、りょうりがたくさんのこってしまう。|
|English scene|There is far more food on the table than the guests can finish.|I'm deciding how much food to prepare and worry that this amount will leave a lot uneaten.|
|English translation|If I make this much, a lot of food will be left over.|保留：If I make this much, a lot of food will be left over.|

- 源canonical SHA-256：`9d290f948a06050b957609c65b142f3bc6c4c38ac2c19a7d23cb30a525d86fcf`。
- 最终canonical SHA-256：`9d290f948a06050b957609c65b142f3bc6c4c38ac2c19a7d23cb30a525d86fcf`。
- 源English SHA-256：`67cdbdba80c0c44554384e693abec9e93fa8e294fec5436297ba421628d4b1bf`。
- 最终English SHA-256：`55b529aeb448716afcb02563d4719e2f799588bebcc1406e73af9f5e6b575887`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/01/rev-1-author-6633ec50-0685-403a-8a62-d706c0f16c33/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/01/rev-1-review-7420765e-acc6-4485-be3c-50cfa5dc9492/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimau`。

独立审核理由：「こんなに作ると、料理がたくさん残ってしまう」预测制作量过多会留下许多菜；新英语场景改为决定做多少时的担忧，消除了食物已上桌的时间冲突。

### 動く × てしまった

- 精确ID：`usage:teshimauPast:verb:動く:うごく`。
- 日语正文（未改）：地震で棚が動いてしまった。
- 本轮原开放字段：中文译文；最终独立审核：`approved`，批次 `shimautext/02`，rev1。
- canonical：有改动（中文场景、中文译文）；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|地震时货架没有固定，整排货架晃动起来。|地震时，未固定的货架被震得移了位。|
|中文译文|地震把货架震得动了起来。|地震使货架移了位。|
|完整句reading|じしんでたながうごいてしまった。|保留：じしんでたながうごいてしまった。|
|English scene|The shelves were not secured during the earthquake, and a shelf shifted.|A shelf was not secured when the earthquake struck.|
|English translation|The earthquake made the shelf shift.|The earthquake caused the shelf to shift.|

- 源canonical SHA-256：`8a1e47508836992d56e5b46493efd686fb62955286275f3eaa920b818732ac43`。
- 最终canonical SHA-256：`a27de18852850b0a02a3103758db0d98e55cd339a470ebad4c2ddaad349201ec`。
- 源English SHA-256：`a706d309d566a0ba818ac4c15ae24830b893187661a65db6e99b5d2014dfbdc9`。
- 最终English SHA-256：`b1fc904f36ffa196d2e378ecc7e4680e42ea19eb1ab23c12d26f1685d432f387`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/02/rev-1-author-09285819-ddde-4c5d-9243-908024638fbb/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/02/rev-1-review-6c0834ca-b0c2-4ee0-9b66-dc02d0fec101/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauPast`。

独立审核理由：「地震で棚が動いてしまった」说地震造成货架位移；新中文场景和译文均改为「移了位」，没有再把单次移动扩成持续晃动。

### 焼く × てしまった

- 精确ID：`usage:teshimauPast:verb:焼く:やく`。
- 日语正文（未改）：家族が刺身にする予定の魚を焼いてしまった。
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/02`，rev1。
- canonical：有改动（中文场景、中文译文）；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|买来的鱼准备做刺身，家人却提前把它烤了。|家人原计划把这条鱼做成刺身，结果鱼却被烤了。|
|中文译文|家人把原定做刺身的鱼烤了。|家人原本计划把这条鱼做成刺身，结果却被烤了。|
|完整句reading|かぞくがさしみにするよていのさかなをやいてしまった。|保留：かぞくがさしみにするよていのさかなをやいてしまった。|
|English scene|My family planned to serve the fish as sashimi, but I cooked it by mistake.|The family planned to serve the fish as sashimi, but it was grilled instead.|
|English translation|My family planned to serve the fish as sashimi, but I ended up grilling it.|The fish the family planned to serve as sashimi ended up being grilled.|

- 源canonical SHA-256：`307b830d7de4cf60e145a888889864af63c9d46d2c189b59499e0f7fb9be61f5`。
- 最终canonical SHA-256：`e43cf043398c09cb3dbba5166645f2797793c05ffb66da1891867f6b41f88fa2`。
- 源English SHA-256：`b4ebb6288043ba1ec269449b4b94c4a353fae23af968cbf3cf9ad1dab535c1a5`。
- 最终English SHA-256：`43bafc9e648b3a0c6b16b34e95c7bc619aff2aa2c1a523d44fcd07464e2bcec3`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/02/rev-1-author-09285819-ddde-4c5d-9243-908024638fbb/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/02/rev-1-review-6c0834ca-b0c2-4ee0-9b66-dc02d0fec101/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauPast`。

独立审核理由：「家族が刺身にする予定の魚を焼いてしまった」中家族が在修饰鱼的计划部分，烤鱼者在主句省略；新中英译文均保留施事未明和鱼最终被烤的结果。

### 動く × てしまわない

- 精确ID：`usage:teshimauNegative:verb:動く:うごく`。
- 日语正文（未改）：模型が全部動いてしまわないように、固定具を付ける。
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/03`，rev1。
- canonical：原样保留；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|展示柜要保持一件不动，避免所有模型一起移动。|保留：展示柜要保持一件不动，避免所有模型一起移动。|
|中文译文|为了不让模型全部移动，装上固定器。|保留：为了不让模型全部移动，装上固定器。|
|完整句reading|もけいがぜんぶうごいてしまわないように、こていぐをつける。|保留：もけいがぜんぶうごいてしまわないように、こていぐをつける。|
|English scene|The display models need to stay in place, so I attach a brace to secure them.|I add a brace to the display case so that the models don’t all end up moving.|
|English translation|I attach a brace so that all the models stay in place.|I attach a brace so the models don’t all end up moving.|

- 源canonical SHA-256：`90ee6049862f7c34b973126e82bb711a4ca57662c00e88e3da67d9d7aacd0d01`。
- 最终canonical SHA-256：`90ee6049862f7c34b973126e82bb711a4ca57662c00e88e3da67d9d7aacd0d01`。
- 源English SHA-256：`4cc12dd983515d7514f31b5c680e36bb46e704f5d7e93cea0a87737bd1f88bb6`。
- 最终English SHA-256：`e926c2ec79ca6d8213ffceb8b37b5989aceef8a827d07afd5b11a2d38eb92f21`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/03/rev-1-author-f7013928-24ff-485c-a10f-6a301e095ab2/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/03/rev-1-review-e108ae57-2412-4ddf-88fa-b5271c52a30d/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegative`。

独立审核理由：英语现已保留「全部」的部分否定：装固定具是为避免模型全都移动，并未断言每个模型都静止。

### 喋る × てしまわない

- 精确ID：`usage:teshimauNegative:verb:喋る:しゃべる`。
- 日语正文（未改）：結末まで全部喋ってしまわないように、今日は導入だけ話す。
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/03`，rev1。
- canonical：有改动（中文译文）；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|故事结尾想等大家都到齐再讲，暂时只讲开头。|保留：故事结尾想等大家都到齐再讲，暂时只讲开头。|
|中文译文|为了不连结尾都说完，今天只讲开头。|为了不把整个故事从头到尾都讲完，今天只讲开头。|
|完整句reading|けつまつまでぜんぶしゃべってしまわないように、きょうはどうにゅうだけはなす。|保留：けつまつまでぜんぶしゃべってしまわないように、きょうはどうにゅうだけはなす。|
|English scene|I want everyone in the group to be there before we reach the story's ending.|I want the whole group to arrive before I tell the story all the way to its ending.|
|English translation|To avoid telling the whole ending, I'll only cover the opening today.|To avoid telling the whole story all the way to its ending, I’ll only cover the introduction today.|

- 源canonical SHA-256：`f1d5e4adea5a054fc2fb2f35fef7b634b0e8634f2c6156cdd18e945b09380d26`。
- 最终canonical SHA-256：`e54f692203bffae380cd09afef23c4d5aa55d39061e31dd531edf2382433ed72`。
- 源English SHA-256：`91c92a2c2e19478db9c6355d904119368b456b6e5ca63666327c5c4ada91f0ba`。
- 最终English SHA-256：`8c6a5c228a430516a1be37c01a10b66446d76c1cbc89e6207ee34a59e534a790`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/03/rev-1-author-f7013928-24ff-485c-a10f-6a301e095ab2/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/03/rev-1-review-e108ae57-2412-4ddf-88fa-b5271c52a30d/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegative`。

独立审核理由：中英文均把「結末まで全部」解释为讲完整个故事直到结尾，今天仅讲导入，先前范围缩成“结尾本身”的问题已修正。

### 待つ × てしまわない

- 精确ID：`usage:teshimauNegative:verb:待つ:まつ`。
- 日语正文（未改）：間違った場所で長時間待ってしまわないように、集合場所を確認する。
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/03`，rev1。
- canonical：原样保留；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|怕到错地点白等，出门前确认集合地点。|保留：怕到错地点白等，出门前确认集合地点。|
|中文译文|为了不在错误的地方等上很久，确认集合地点。|保留：为了不在错误的地方等上很久，确认集合地点。|
|完整句reading|まちがったばしょでちょうじかんまってしまわないように、しゅうごうばしょをかくにんする。|保留：まちがったばしょでちょうじかんまってしまわないように、しゅうごうばしょをかくにんする。|
|English scene|Before leaving, the speaker checks the meeting place to avoid a long wait at the wrong spot.|Before leaving, I check the meeting place to avoid a long wait at the wrong spot.|
|English translation|Check where we're meeting so you don't end up waiting a long time in the wrong place.|I check the meeting place so I won’t end up waiting a long time in the wrong place.|

- 源canonical SHA-256：`c3c49220f8310cae18f7167dc200bfacfce435a15fd844a9042e116a29587d9f`。
- 最终canonical SHA-256：`c3c49220f8310cae18f7167dc200bfacfce435a15fd844a9042e116a29587d9f`。
- 源English SHA-256：`1149970b4442e16800dd67bf1cb02c87848c45e95d3e7bf6a18833def1152e81`。
- 最终English SHA-256：`0b3b38739f1362395c1094695337cf6b4539e098f30cc83f9ffcf697a7374796`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/03/rev-1-author-f7013928-24ff-485c-a10f-6a301e095ab2/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/03/rev-1-review-e108ae57-2412-4ddf-88fa-b5271c52a30d/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegative`。

独立审核理由：英语已由命令式改为说话者查集合地点的非过去陈述，保留避免在错误地点久等的目的。

### 似る × てしまわなかった

- 精确ID：`usage:teshimauNegativePast:verb:似る:にる`。
- 日语正文（未改）：完成したロゴ、他社のものに似てしまわなかった？
- 本轮原开放字段：中文译文；最终独立审核：`approved`，批次 `shimautext/04`，rev2。
- canonical：有改动（中文译文）；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|看见完成的标志有些眼熟，问是否像别家的。|保留：看见完成的标志有些眼熟，问是否像别家的。|
|中文译文|做好的标志，是不是结果和其他公司的标志有些像了？|做好的标志是不是有点像别家的？|
|完整句reading|かんせいしたロゴ、たしゃのものににてしまわなかった？|保留：かんせいしたロゴ、たしゃのものににてしまわなかった？|
|English scene|The speaker sees the completed logo and asks whether it resembles another company's.|The speaker sees the completed logo and asks whether it resembles another company’s.|
|English translation|Didn't the finished logo end up looking a bit like another company's?|Didn’t the finished logo end up looking a bit like another company’s?|

- 源canonical SHA-256：`0d966d335ffbc6a62de3dd8ae335ce77620b1ae2f466ee0da75ccca5a83edd0e`。
- 最终canonical SHA-256：`40b0749e64a89320220c1276ac758d1fd36c30df841ed45c62ca597f1c213f1a`。
- 源English SHA-256：`ba5de76c0a88a19fcdfbe33874cbd973904714d06ed01992eece39b73b7052fd`。
- 最终English SHA-256：`b408359d8d3cb3c95f3c6f242facf36d7fd51774e58c2cc18ae2ccf20a68ece4`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-author-55c54c3a-7d27-4820-882f-5d0aa6762184/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-review-b40534fa-018e-46f3-8129-ef098361f4b1/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegativePast`。

独立审核理由：中文删去「是不是结果」的累赘表达，仍是询问完成的标志是否像别家的；英文保留对相似结果的试探性确认。

### 座る × てしまわなかった

- 精确ID：`usage:teshimauNegativePast:verb:座る:すわる`。
- 日语正文（未改）：ズボンに白いペンキが付いてるね。あの塗りたてのベンチに座ってしまわなかった？
- 本轮原开放字段：中文译文、英文场景／译文；最终独立审核：`approved`，批次 `shimautext/04`，rev2。
- canonical：有改动（中文译文）；English：译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|同伴裤子沾了白漆，你指着刚刷过的长椅。|保留：同伴裤子沾了白漆，你指着刚刷过的长椅。|
|中文译文|你裤子上沾了白漆；坐到刚刷好的长椅上了吗？|你裤子上有白漆，刚才该不会是坐到那张刚刷过的长椅上了吧？|
|完整句reading|ズボンにしろいペンキがついてるね。あのぬりたてのベンチにすわってしまわなかった？|保留：ズボンにしろいペンキがついてるね。あのぬりたてのベンチにすわってしまわなかった？|
|English scene|My companion has white paint on their trousers, and I point to a freshly painted bench.|保留：My companion has white paint on their trousers, and I point to a freshly painted bench.|
|English translation|You have white paint on your trousers. Did you sit on that freshly painted bench?|You have white paint on your trousers. Did you end up sitting on that freshly painted bench?|

- 源canonical SHA-256：`aa0b019616102ec6e560959d03c0b1112f2232647d249a1ccb92267b549e6118`。
- 最终canonical SHA-256：`7ed2ae85cf40922eb4eec703a7c9365c98929706a932487c045142302eb33d37`。
- 源English SHA-256：`117cf5e5628024d19b9db812233931bcbf3736093daab33e6d667e5ae6b238c8`。
- 最终English SHA-256：`e468bec695bfc996ad259d8a5786b306c85a42fd76a61bdc395af65481b8039d`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-author-55c54c3a-7d27-4820-882f-5d0aa6762184/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-review-b40534fa-018e-46f3-8129-ef098361f4b1/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegativePast`。

独立审核理由：见到同伴裤子上的白漆后，中文「该不会是坐到」保留担心与确认；英语用 end up sitting 表达意外的过去结果。

### 持つ × てしまわなかった

- 精确ID：`usage:teshimauNegativePast:verb:持つ:もつ`。
- 日语正文（未改）：店を引き継いだ時、余分な在庫を持ってしまわなかった？
- 本轮原开放字段：中文译文；最终独立审核：`approved`，批次 `shimautext/04`，rev2。
- canonical：有改动（中文译文）；English：场景有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|朋友刚接管店铺，问他是否留下了过多库存。|保留：朋友刚接管店铺，问他是否留下了过多库存。|
|中文译文|接管店铺时，你是不是结果持有了多余的库存？|接管店铺时，你是不是最后还留有多余库存？|
|完整句reading|みせをひきついだとき、よぶんなざいこをもってしまわなかった？|保留：みせをひきついだとき、よぶんなざいこをもってしまわなかった？|
|English scene|A friend has just taken over the shop, and she asks whether he wound up with too much stock.|A friend has just taken over the shop, and I ask whether they ended up with excess stock.|
|English translation|When you took over the shop, did you end up with excess inventory?|保留：When you took over the shop, did you end up with excess inventory?|

- 源canonical SHA-256：`e5ee771eb651393248d44c0b5298a702d19f2f3f3412776f5d71b389f952d266`。
- 最终canonical SHA-256：`4963ccbbff20421c13ffeb63cc178bce053ac28f84359d7a85beda6052e000f7`。
- 源English SHA-256：`cddb53629ead8328d5c1a0cfd18d2b6ca1936038ac60b1451b231ec7566794a4`。
- 最终English SHA-256：`5aaafa4f1034e7579e31e8eb2cd95936bb217acae4a980e5059d8e6eac7bcdb5`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-author-55c54c3a-7d27-4820-882f-5d0aa6762184/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-review-b40534fa-018e-46f3-8129-ef098361f4b1/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegativePast`。

独立审核理由：中文「最后还留有」修复生硬的「结果持有」；英语场景以中性 they 指接店的朋友，没有无依据的男女角色。

### 指す × てしまわなかった

- 精确ID：`usage:teshimauNegativePast:verb:指す:さす`。
- 日语正文（未改）：さっき、地図で別の駅を指してしまわなかった？
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/04`，rev2。
- canonical：有改动（中文场景）；English：场景有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|担心刚才指错地图上的车站，向同伴核实。|担心同伴刚才指错地图上的车站，便向对方确认。|
|中文译文|刚才在地图上，你该不会指了另一个车站吧？|保留：刚才在地图上，你该不会指了另一个车站吧？|
|完整句reading|さっき、ちずでべつのえきをさしてしまわなかった？|保留：さっき、ちずでべつのえきをさしてしまわなかった？|
|English scene|I worry I may have pointed to the wrong station on the map and check with my companion.|I worry my companion may have pointed to a different station on the map, so I check with them.|
|English translation|You didn’t happen to point to a different station on the map just now, did you?|保留：You didn’t happen to point to a different station on the map just now, did you?|

- 源canonical SHA-256：`a628658d0b8141b062b46a429f2e9751884743fdaf799a59c24333d900888e3a`。
- 最终canonical SHA-256：`915830c0feb77166b9569db7152ce2d6023bd7d1341eb5f1f323ceb6d076878e`。
- 源English SHA-256：`427e2d305dee2614f0ef30a6b5712a58972f106b1f6312e6578dd5c259660993`。
- 最终English SHA-256：`3a2a91c847b7c8bf6a4d4ef7be2dc1cc4a193046a5d15b452a1ff4660d939610`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-author-55c54c3a-7d27-4820-882f-5d0aa6762184/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-review-b40534fa-018e-46f3-8129-ef098361f4b1/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegativePast`。

独立审核理由：中英文场景都指向同伴刚才可能指了另一个车站，说话者向其核实；修正了旧英文场景误指说话者的问题。

### 起きる × てしまわなかった

- 精确ID：`usage:teshimauNegativePast:verb:起きる:おきる`。
- 日语正文（未改）：昨日は休みだったのに、いつもの時間に起きてしまわなかった？
- 本轮原开放字段：中文译文、英文场景／译文；最终独立审核：`approved`，批次 `shimautext/04`，rev2。
- canonical：有改动（中文译文）；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|朋友休假却忘改闹钟，问是否仍早起了。|保留：朋友休假却忘改闹钟，问是否仍早起了。|
|中文译文|昨天明明休息，你没按平时的时间就起床了吧？|昨天明明休假，你该不会还是按平时的时间起床了吧？|
|完整句reading|きのうはやすみだったのに、いつものじかんにおきてしまわなかった？|保留：きのうはやすみだったのに、いつものじかんにおきてしまわなかった？|
|English scene|A friend had a day off yesterday but may have followed their usual morning routine.|I ask a friend who had yesterday off but forgot to change their alarm whether they still got up at the usual time.|
|English translation|You didn't get up at your usual time yesterday, even though it was your day off, did you?|Did you end up getting up at your usual time yesterday after all, even though you had the day off?|

- 源canonical SHA-256：`6eb4a4b72fa74c2eeaf61bc7bb2c88e7203c0b1750d69b62603870e02be71bcd`。
- 最终canonical SHA-256：`ccc040ffc661c0e518d10a3bbc1615c1fd582b695fa736ed3cc4ea6cbf6b65fd`。
- 源English SHA-256：`257b3997a024b3f4184e71b3baada5b589c7766ff9b84e3675ac09cd6756a3da`。
- 最终English SHA-256：`a62fe81ce7661398d5fe8f5cf8774aed4484261c3e83299291fa570f5cc2d5a5`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-author-55c54c3a-7d27-4820-882f-5d0aa6762184/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-review-b40534fa-018e-46f3-8129-ef098361f4b1/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegativePast`。

独立审核理由：中英文都询问休假的朋友是否仍按平时的时间起床，没有把过去否定问句误译为核实对方没有起床。

### 違う × てしまわなかった

- 精确ID：`usage:teshimauNegativePast:verb:違う:ちがう`。
- 日语正文（未改）：文章を短くしたら、元の文と意味が違ってしまわなかった？
- 本轮原开放字段：英文场景／译文；最终独立审核：`approved`，批次 `shimautext/04`，rev2。
- canonical：原样保留；English：场景、译文有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|同事缩短了文章，问他改后意思是否走样。|保留：同事缩短了文章，问他改后意思是否走样。|
|中文译文|把文章缩短以后，意思是不是和原文变得不一样了？|保留：把文章缩短以后，意思是不是和原文变得不一样了？|
|完整句reading|ぶんしょうをみじかくしたら、もとのぶんといみがちがってしまわなかった？|保留：ぶんしょうをみじかくしたら、もとのぶんといみがちがってしまわなかった？|
|English scene|A coworker shortened an article, and you check whether its meaning changed.|A coworker shortened an article, and I ask whether its meaning changed.|
|English translation|You shortened the article—the meaning didn't end up changing from the original, did it?|After you shortened the article, did its meaning end up being different from the original?|

- 源canonical SHA-256：`468eb100ffbf6db3b2cbcb11cdc8062253dbe1ab66ab3a118280866946c78071`。
- 最终canonical SHA-256：`468eb100ffbf6db3b2cbcb11cdc8062253dbe1ab66ab3a118280866946c78071`。
- 源English SHA-256：`5b021c80317f69f903d29cff7ea45c4f9fae117c42b95588dbf072a590b6efbc`。
- 最终English SHA-256：`ca83c4a87406d237fb455120d10a55f84e49d5971c0e2e8417bb6909f698b53f`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-author-55c54c3a-7d27-4820-882f-5d0aa6762184/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/04/rev-2-review-b40534fa-018e-46f3-8129-ef098361f4b1/review.json)；对应正式轮次为 `shimau-text-fix-20261026-teshimauNegativePast`。

独立审核理由：新版英语补上 being，译句「did its meaning end up being different」自然；仍询问缩短文章后意思是否变得不同。

### 読む × 受身＋てしまった

- 精确ID：`usage:passiveCompletionPast`。
- 日语正文（未改）：私は昨日、日記を同僚に読まれてしまった。
- 本轮原开放字段：中文译文；最终独立审核：`approved`，批次 `shimautext/05`，rev1。
- canonical：有改动（中文场景、中文译文）；English：场景有实际文本变化。

|字段|本轮输入|最终接入内容|
|---|---|---|
|中文场景|抱怨昨天自己的日记被同事偷看了|抱怨昨天自己的日记被同事读了。|
|中文译文|我的日记昨天被同事偷看了，真让人遗憾。|昨天我的日记被同事读了，真让我不舒服。|
|完整句reading|わたしはきのう、にっきをどうりょうによまれてしまった。|保留：わたしはきのう、にっきをどうりょうによまれてしまった。|
|English scene|I complain that a coworker peeked at my diary yesterday.|I complain that a coworker read my diary yesterday.|
|English translation|A coworker read my diary yesterday, much to my dismay.|保留：A coworker read my diary yesterday, much to my dismay.|

- 源canonical SHA-256：`20ee586d4ce7b9faeadebbba5f833e02cb906699f983e8b9b494ce17723583a6`。
- 最终canonical SHA-256：`352da8911cd7e463bacdd9fad8656065043d046fc69b7437ed5dd4cc644b7aec`。
- 源English SHA-256：`6b2c9f92c0e957d0840eb777028a3dcd328d2fd8663990708ce5154b5d4d938d`。
- 最终English SHA-256：`5c14ccc1b3d755ffc6a6d79706320955f6a5631fce3bb01a19c3787626034047`。
- [冻结输入](../work/shimau-text-fix-20261026/deliveries/shimautext/05/rev-1-author-4ff4a297-494c-4da2-ad9b-e7a72f20a67f/input.json)／[最终独立审核报告](../work/shimau-text-fix-20261026/deliveries/shimautext/05/rev-1-review-69397ec2-44fb-4595-9b93-919c761f751e/review.json)；对应正式轮次为 `shimau-text-fix-20261026-passiveCompletionPast`。

独立审核理由：中文场景和译文已删除日语没有表达的「偷看」，仅陈述同事读了说话者日记及由被动しまった带出的不快。

## 注音候选、关闭范围与验证状态

食べる／ちゃう仅把reading中的「けーき」改成与正文一致的「ケーキ」，日语正文仍是「ケーキ」。受身＋てしまった的読む句收到UniDic将「私」读为「ワタクシ」的候选；独立审核者确认本句「わたし」自然有效，保留该读法。词典候选没有直接当成错误自动替换。

本轮关闭的是原17个保留ID的19个附属字段意见（中文译文6、注音1、英文12）。还对最终17张卡的完整中文、日语、读音与英文逐卡核对；因而英文实际变化17张并不意味着历史上存在17条独立英文错误意见。原独立自然度意见、原译注意见及用户暂缓凭据作为历史材料继续保留。

本地已核对：17个精确ID与原附属开放集合完全一致，全部有最终独立通过票；canonical10改／7保留；17份英文均有文本变化；17条日语正文相同；当前附属开放数为0；原9轮证明前缀哈希一致。完整测试1,209／1,209通过；全部项目审计、模拟、类型检查、Lint和构建均通过。收紧译文未决门禁后，6项闭环测试再次全部通过；仅修改场景不能代替修正有问题的译文本身。发布由本轮main提交的CI门禁与Pages部署执行，实际线上状态见上述部署记录。
