# 拾う／ちゃう 单卡语气修订（2026-10-27）

用户采纳先前提出的局部方案，保留固定配对 `verb:拾う:ひろう/chau`，把句尾「よ。」改为「ね。」，同步中英文场景与译文。此为语气润色，不宣称旧句不能自然表达帮忙，也不将「よ」设为禁用。

|字段|原内容|最终内容|
|---|---|---|
|日语整句|落ちた豆は僕が全部拾っちゃうよ。|落ちた豆は僕が全部拾っちゃうね。|
|中文场景|朋友把豆子撒了一地，自己准备马上捡完。|朋友把豆子撒了一地，我主动帮忙收拾。|
|中文译文|掉下的豆子我来全部捡起来吧。|掉下来的豆子，我来全部捡好哦。|
|英文场景|A friend spills beans on the floor, and you offer to gather them all.|A friend spills beans all over the floor, and I offer to help pick them up.|
|英文译文|I'll pick up all the beans that fell.|I'll pick up all the beans that fell, okay?|

完整读音为「おちたまめはぼくがぜんぶひろっちゃうね。」；项目构形答案仍为「拾っちゃう」，只替换槽外语气词。

用户指定的日语与中文方案由实际作者 `/root/hirou_bilingual_author`（gpt-6-luna max）采用并同步英文；独立审核者 `/root/hirou_bilingual_review`（gpt-6-sol medium）核对完整双语、注音与目标后批准。作者并非本轮日语方案的原始创作者，不把用户来源改写为模型新创作。

- 原卡哈希：`a81afa04a6043687f38dd04ef07f4d6ce53b460f25370a40815658e04e9d9198`。
- 最终卡哈希：`5817eb3bd3eb0058dd896e28208884d9fbf94d78759aa30c889be54008ec34b6`。
- 最终英文对象哈希：`b13a00dbce450b753a00111e9aa4dec902fb39595bdf5dc8cd8d611398b87ebd`。
- 作者receipt：`1db408cc02d6fc9397b39cc3efc6c5d726dae4ca38b16b7c0e5426d4ff723c41`。
- 独立审核receipt：`94cca68c2153cb4ce27629432036ee7887ce032f030eca76ef11f65306c3d643`。
- 证据保存在[既有修订证明](usage-card-reviewed-revisions.v1.json)的精确单卡轮次 `hirou-chau-fix-20261027-chau`，保留前15轮及全部历史票；旧稿仍可从源快照恢复。

另对其他281张在用chau／teshimau非过去形作[专项语气与视角检查](usage-card-completion-tone-audit-20261027.md)，确认的两处英语问题另有审核修订轮次，不改这两张的日语、中文或适用性。

本地验证完成：全量测试1,220／1,220通过；用法卡、i18n与字体审计、类型检查、Lint和构建通过；281张同类卡的专项证据与两项英语修订闭环均验证通过。字体已重建并核验，字节与覆盖未变化。发布随本轮main提交执行，部署结果以[CI与Pages记录](https://github.com/L-M-Sherlock/katsuyo-dojo/actions/workflows/ci.yml)为准。
