# 三级内容流水线（协议 3）

入口是仓库 `scripts/staged-workflow.mjs`。以下 `scripts/` 均相对本 skill 目录；派发给作者的路径必须是实际存在的绝对路径。作者使用 `gpt-6-astra low`，审核者使用 `gpt-6-astra medium`。主代理只协调、运行机械门禁并汇总法定人数，不逐卡作语言裁定。资源允许时，工作池可暂以 6 名作者和 8 名审核者为配置示例，不把该数值固化为长期上限。

## 阶段与写入归属

1. **pilot**：协调器从原 assignment 选择 3 对（不足 3 对时取全部），兼顾普通词、不规则词和否定／过去；缺少该类时明确记录，不能从另一批偷换配对。派发前 `resolveUsageCard` 核对词义、答案及读音。审核者按法定人数审完每张的完整句、角色、译文和 reading 后，协调器才推进下一阶段。
2. **expansion**：主代理预先锁定 10–15 对，包含已审 pilot；作者在独立目录编写，不能覆盖正式 `NN.cards.json`。使用原 assignment 加固定 scope 做精确子集检查。不能从稿件反推 scope，不能把缺少剩余项视为整批完成。
3. **remaining**：扩写通过后，仅补写未完成配对，每个补写阶段最多 5 张，逐阶段提交并审阅。原 assignment 全覆盖、所有写入者停写且审核快照有效后，主代理调用 `merge`，唯一一次组装正式稿。5 张上限是降低整块返工率的执行约束，不是课程卡片总数要求。

原 assignment、manifest 和所有已有正式稿在初始化时记录哈希。作者只获 `author-work/<batch>/<owner>/<stage-id>/cards.json` 与 `notes.json` 两个可写路径；工具生成该目录的固定 assignment、读音报告及不可变提交。协调器的法定人数汇总记录保存在 `staged-state`；正式稿写入只能经过主代理合并。合并会保留此前正式稿的备份。

共享文件系统不能按 agent 身份设置 OS 权限。这里的隔离由独占路径、实际 owner 校验、受保护文件哈希和快照验证落实：越界写入会使后续检查／合并失败，不能宣称工具能阻止任何绕开它的裸文件写入。不得代用其他代理身份伪造作者或协调器记录。

同一阶段发生两次不同失败稿后，重新做 pilot；不把重复扫描同一旧文件算两次。重写用新目录，不覆盖提交快照。若旧批准缺少真实逐卡依据，撤回批准，保留旧文件和理由；未复审内容不得进候选。

## 命令与交接

所有命令带 `--project <仓库绝对路径> --task-root <任务根绝对路径>`。当前主入口支持：

| 命令 | 执行者 | 作用 |
|---|---|---|
| `init --actor /root [--maxAuthors N --maxReviewQueue N --maxReviewers N --requiredReviews N --reviewPolicy main\|coordinator-only\|consensus]` | 主代理 | 保存基线并设置作者／审核队列容量、每阶段审核人数与法定人数策略；默认 `requiredReviews=2`，且不得超过 `maxReviewers` |
| `configure --actor /root [--maxAuthors N --maxReviewQueue N --maxReviewers N --requiredReviews N --reviewPolicy ...]` | 主代理 | 在未产生审核报告的阶段调整工作池和法定人数；已有报告后不能改策略／法定人数 |
| `dispatch --actor /root --owner /root/实际句柄 --batch lane/NN --kind pilot\|expansion\|remaining --selection <绝对子集JSON>` | 主代理 | 解析原清单并锁定精确配对，返回两个可写路径 |
| `handoff --actor /root --batch lane/NN --stage ID --owner /root/实际句柄 --reason ...` | 主代理 | 原负责人停写后显式交接，保留身份记录 |
| `heartbeat --actor /root/实际句柄 --batch lane/NN --stage ID [--leaseToken TOKEN]` | 作者 | 更新当前阶段 lease；过期 lease 只能由协调器 reclaim |
| `reclaim --actor /root --batch lane/NN --stage ID --owner /root/实际句柄 --reason ...` | 主代理 | 仅在 owner lease 过期后显式回收阶段并交接给新 owner；不会静默抢占 |
| `check --actor /root/实际句柄 --batch lane/NN --stage ID` | 作者 | 检查最终稿和说明，再运行独立词典对照 |
| `submit --actor /root/实际句柄 --batch lane/NN --stage ID` | 作者 | 绑定检查结果并封存快照，停写，返回审核表 |
| `assign-review --actor /root --batch lane/NN --stage ID --reviewer /root/reviewer_name` | 主代理 | 给不可变提交分配独立审核者，并返回完整绝对 packet（`cards`、`notes`、`readings`、`assignment`、`receipt`、`count`、`output`） |
| `review --actor /root/reviewer_name --batch lane/NN --stage ID --review <判断JSON路径>` | `gpt-6-astra medium` 审核者 | 严格读取 packet 指定快照，独立核准每张实际生成句及词典候选；不能搜索猜稿、改卡片或合并；命令把该路径绑定为固定 output |
| `finalize --actor /root --batch lane/NN --stage ID` | 主代理协调器 | 汇总已到齐的独立报告，按 `reviewPolicy` 设置 approved/rejected；冲突、缺报或过期报告退回复审 |
| `review --actor /root --batch lane/NN --stage ID --review <判断JSON>` | 兼容旧记录 | 仅用于历史主代理审核记录；新批次不能用它替代法定人数 |
| `merge --actor /root --batch lane/NN` | 主代理 | 只读取已核验作者／审核快照并检查完整集合，写正式稿 |
| `status` | 主代理 | 查看队列、待处理配对和阶段状态；只有当前实现提供时才使用其他指标输出 |

检查／提交是顺序依赖。命令返回 session_id 时轮询该句柄，不因无新输出重启同一命令。记录实际退出状态，不用分号串联生成、检查、提交。`merge-staged-batch.mjs` 是同一合并门槛的便捷入口，不能接受未经审核的任意数组。

原清单解析失败记为 `pending-resolution`，阻止派发；这不是语法禁用或配对暂缓出题。卡片的 meaning 写成“喝；饮用”而原清单为“喝”时，应修卡片元数据，不能修改许可。独立使用 `validate-assignment.mjs --project ... --assignment ... --output ...` 可保存派发前报告。

`micro-pilot.mjs` 只帮助主代理选原批次内的配对，作者不得重写该清单。独立检查阶段稿用 `check-staged-batch.mjs --project ... --assignment <原始清单> --scope <预先派发子集> --input <阶段稿> --output <报告>`；它没有批准权限。

## 审核报告与法定人数

每名审核者从同一 immutable delivery 独立读取完整句，不读取另一审核者的报告。审核派发 packet 必须一次给出 delivery 内不可变文件的完整绝对路径：`cards`、`notes`、`readings`、`assignment`，并附作者 `receipt`、`count` 和固定 `output` 路径；审核者不得搜索目录、按 mtime 或 revision 猜稿，也不得在没有新 packet 路径时重审旧稿。报告必须逐卡一次，包含源卡 `hash`、完整句、`reason`、`roles`、`time`、`negation`、`translation`、`reading` 以及 `readings.candidates` 中每个精确 `id` 的 `retain|error` 判定。这里的 `retain|error` 只判断作者 reading 是否应保留或修正，不是拒绝词典建议；不得列出 candidates 之外的 id。报告文件各自隔离，不能互相覆盖。主代理只验证哈希、范围、字段和时效，再由 `finalize` 汇总；不得用自己的逐卡判断补足缺失报告。

每个阶段默认分派 `requiredReviews=2` 名独立审核者；只有逐卡意见冲突时才加派第 3 名审核者复审（先把 `maxReviewers` 配置为至少 3）。冲突由审核者复审，协调器不作语言裁定。`coordinator-only` 要求两份报告逐卡通过；`consensus` 采用逐卡多数，平票拒绝，并记录冲突；`main` 仅为历史兼容策略，新批次应使用前两者之一。缺报、delivery 漂移或过期报告时，阶段不能批准；复审必须使用新 delivery 和完整 packet，并至少加入一名未参与冲突的审核者。法定人数不是“收到一份报告”或“预检通过”。

## 作者说明与审核表

`notes.json` 每卡一行，包含 `id`、`roles`、`object`、`time`、`negation`。角色可写中文文本或包含实际参与者的对象；没有宾语的自动词填写地点／参与者或“无直接宾语”，不为填字段虚造角色。先核对完整日语句与中文，再填逐段读音；正文修改后重核受影响 reading。纯假名和标点段也填写对应 reading，便于新阶段检查。

提交后自动生成按表达族分组的审核表，列出完整句、场景、作者角色与对象、时间与否定范围、译文、reading 及词典候选；主代理结论保持“待审”。`audit-review-table.mjs --project ... --cards ... --notes ... --readings ... --output ...` 可单独生成表。

审核者的 `review` JSON 为 `{rows: [...], candidates: [...]}`：每个 rows 记录包含 `id`、`sentence`、源卡 `hash`、`status: approved|rejected`，以及独立写下的 `reason`、`roles`、`time`、`negation`、`translation`、`reading` 判断。candidates 每个词典候选一卡一条 `{id, decision: retain|error, reason}`。指纹取 `SHA256(JSON.stringify(card))`，不是自动语言判断。不要由表格、指纹或 form 分支生成通用通过意见。

## 失败样例表（每次交稿前核对）

| 已见失败 | 前置处理 |
|---|---|
| before 只有句段，reading 却装入整句 | 同时核对两段正文与读音；目标只由槽位生成 |
| reading 空白／含汉字，或修改正文后仍用旧读音 | 检查绑定最终文件，再跑词典候选判读 |
| 中文译文是日文、场景复制品或“我试着……后喝” | 从日语独立翻译；场景另写具体背景 |
| 多动词共用「ここで～」、受身统一“处理” | 补实际对象／角色；“处理”用于其他句子不是禁词 |
| 「待たれる」译成“别人让我等” | 区分受身与使役；主代理判断实质角色错误 |
| 「ておく」请求前的同僚に被误译为“请同事做” | 指明听话人，核对に的实际角色 |
| 目标／内层活用重复，槽外再补たら／ください | 重读实际拼接句，不只看元数据 |
| 写错目录、把12张写入30张正式清单 | 只写派发的绝对作者路径，正式文件由主代理合并 |
| 通过小批后用模板替换剩余配对 | 只补剩余对，每阶段最多5张，逐卡审后再继续 |

程序只拦截可检测字段错误与重复模式；角色、时间、否定范围和自然度由独立审核者逐句判断，协调器只汇总有效报告。读音候选数不等于读音错误数。

## 吞吐和发布

作者阶段和审核者数量按配置扩容；待审队列达到 `maxReviewQueue` 即停止派新稿，先消化审核。默认容量为 6 个作者阶段、6 个待审阶段和 8 个可登记审核者；可由 `configure` 调整，但登记池不能超过 `maxReviewers`。每份提交默认分配 2 名 `gpt-6-astra medium` 审核者，冲突时再分配第 3 名（需先将 `maxReviewers` 配置为至少 3）；只有报告全部到齐且满足 `reviewPolicy` 才能进入 `approved`。审核者不能互相覆盖文件，各自写独立报告；主代理仅汇总，不作逐卡语言替代。作者阶段持有带 token 的 lease，须以 heartbeat 延长；owner 失联后阶段仍占用作者／审核队列容量，协调器必须等待 lease 过期并显式 `reclaim`，不会把失联 owner 当作完成或静默抢占。作者或审核者完成后由状态事件连续补位，不能用 `send_message` 冒充仍在运行的代理。冲突、缺报、哈希不符或过期报告进入复审／返修，不计入批准；不要把未实现的 metrics 命令写成已有能力。

合并正式稿仍不等于产品接入或发布。完成所有有效配对、重新核对历史基线、更新审计与测试口径后，才按 `docs/publishing.md` 发布，并确认同一提交部署成功。
