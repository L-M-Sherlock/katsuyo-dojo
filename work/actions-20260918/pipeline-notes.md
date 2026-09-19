# 批次 owner 与交接工具

## 提交协议 2（显式启用，兼容旧批次）

新批次 `assign-author --protocol 2`；既有批次确认负责人停写后由协调者 `enable-delivery --batch lane/NN --actor root`。现有状态不会自动升级，也无需为了使用新代码重跑旧内容。

协议 2 的顺序为 `run-checks → submit-author/review → accept-author/review`。检查计划使用 `steps: [{executable, args}]` 与本批 `outputs`，从任务目录运行；不通过 shell 拼接命令。运行前撤销旧成功证据，失败即终止余下步骤。生成内容必须先完成；检查过程中或之后修改输入、计划或输出报告，都需重新检查。

提交使用检查成功后返回的 revision，生成 receipt 与独立快照，进入 `author-submitted` 或 `review-submitted`，owner 清空。协调者在实读产物并确认负责人停写后，携带相同 receipt 和 submitted revision 验收。提交期间禁止直接 freeze 或重新 assign；返修使用 `reject-submission`，旧快照保留，新提交有新 receipt。启用协议 2 的批次不能用旧 `freeze-*` 绕过。

可复用实现位于 skill 的 `scripts/delivery-store.mjs` 和 `scripts/checked-steps.mjs`；完整说明见仓库 skill 的 coordinator.md。交付目录 `deliveries/<batch>/rev-<revision>-<phase>-<uuid>/` 先在临时目录完整写入，再重命名发布。读者校验 receipt 与所有文件哈希，并使用同一批校验字节，不再返回工作稿二次读取。旧 `seal-reviewed` 只封存与原 reviewFreeze 一致的最终审核文件，不从复审后内容重建作者历史。

共享目录不提供代理身份认证或文件权限隔离；直接绕过工具写快照仍可能发生，但验收和候选构建会拒绝漂移。不要把版本哈希检查或报告差异当作语言审核证明。

脚本：`work/actions-20260918/pipeline.mjs`。使用 Node 原生模块、仓库活用器及 skill 的交付辅助工具，无新依赖。状态迁移写入 `pipeline-state/<lane>/<NN>.json`、同批短时操作锁与 `deliveries/` 快照；`run-checks` 执行调用者明确给出的检查命令并绑定输出。流水线自身不改教材、审核 ledger、清单或总索引。

状态不存在时视为 `unassigned`。工具没有导入任何现有生产批次；主代理应先核实实际作者／审核者停止与否，再逐批登记。每次登记成功之后才发送任务，代理接单前用 `describe` 核对 owner，freeze 成功后停止写入。

## 命令

在仓库根目录执行。示例中的批次和 agent 需替换为真实且固定的身份；同一代理全程使用相同名称，推荐完整 `/root/agent_name`，不要交替用别名。

```powershell
# 1. 主代理登记作者：仅 unassigned 可开始。
node work/actions-20260918/pipeline.mjs assign-author --batch giving-1/04 --agent /root/writer_x --actor root

# 2. 作者完成并停止写稿后，自行冻结。
node work/actions-20260918/pipeline.mjs freeze-author --batch giving-1/04 --agent /root/writer_x

# 3. 主代理登记不同的独立审核者。
node work/actions-20260918/pipeline.mjs assign-review --batch giving-1/04 --agent /root/reviewer_y --actor root

# 4. 审核者最终稿与 ledger、报告、读音扫描齐备后冻结。
node work/actions-20260918/pipeline.mjs freeze-review --batch giving-1/04 --agent /root/reviewer_y

node work/actions-20260918/pipeline.mjs describe --batch giving-1/04
node work/actions-20260918/pipeline.mjs list
node work/actions-20260918/pipeline.mjs self-test
```

所有命令输出 JSON（help 除外），失败退出码为 1；失败不更新批次 owner/status/history。`list` 返回状态计数和所有 manifest 批次的简表。`describe` 返回单批状态、当前 owner、历史、清单和冻结物指纹；两者均只读。

| 动作 | 前置状态 | 校验 | 成功状态 |
| --- | --- | --- | --- |
| assign-author | unassigned | 主代理显式 `--actor root` 或 `/root`；无 active owner；清单与 manifest 一致 | authoring，owner 为 author |
| freeze-author | authoring | `--agent` 等于 active author；当前卡片精确覆盖 assignment；仓库结构检查通过；author.md 与 readings.json 齐备 | awaiting-review，owner 清空 |
| assign-review | awaiting-review | 主代理显式身份；reviewer 与 author 不同；无 active owner；冻结作者文件未变化 | reviewing，owner 为 reviewer |
| freeze-review | reviewing | `--agent` 等于 active reviewer；精确覆盖与结构通过；review.json 的当前句、纯卡片 hash、完整 ID 集合逐项一致；review.md 和读音扫描齐备 | reviewed，owner 清空 |

已 authoring/reviewing 时，即使同一 agent 重复 assign 也拒绝。reviewed 不自动重开。主代理发现语言审核不足或冻结文件被误改时，可显式使用 `reopen-review --batch lane/NN --agent /root/reviewer --actor root --reason 具体原因`：仅可重开已冻结的 reviewed 批，禁止将作者设为审核者；撤销旧 reviewFreeze、保留旧快照与文件漂移记录，重新进入 reviewing。该命令不批准漂移内容，必须重新逐卡审核并 freeze-review。没有 force、reset 或偷锁命令。

## 交接校验细节

- 每条命令都从 `manifest.json` 解析合法 `lane/NN`，仅接受其中精确的 `<batch>.assignment.json` / `<batch>.cards.json` 路径；清单原始字节 SHA-256 必须等于 manifest.hash。清单长度、非空精确词义／形式、唯一配对也要匹配。
- 首次登记保存 manifest 当前条目的 hash、assignment hash 和 count；之后该条目变化会拒绝继续，不要求冻结整个 manifest 的无关批次。
- freeze 重新调用仓库 `usageCardIssues`，核对每个 `senseId/form` 恰好一张、稳定 ID、释义、词类及当前活用器的目标正文／读音与固定 assignment 完全一致。源卡必须仍是 `draft`。不根据旧 check 报告宣称通过，也不写 check 报告。
- 作者报告固定为 `<batch>.author.md`，读音报告为 `<batch>.readings.json`。
- 审核报告固定为 `<batch>.review.md`，ledger 为 `<batch>.review.json`。读音报告优先 `<batch>.review-readings.json`，没有此文件时使用 `<batch>.readings.json`；如确需选择当前有效版本，可用 `--readings lane/NN.readings.json` 或 `--readings lane/NN.review-readings.json`。不接受其他批次或任意路径。
- 读音 JSON 须有正确 cardsChecked、空 structuralIssues、与 candidates 长度一致的 reviewCandidateCount。每个候选必须对应当前卡片的 ID、词义、形式、场景、译文、完整句及读音。报告修改时间不得早于卡片；若报过期，重跑 reading-audit，不调整时间戳逃过校验。
- ledger 每张卡恰好一条，`sentence` 由当前活用器的完整目标拼接，`hash` 为 `sha256(JSON.stringify(card))`，reason 非空，status 只接受 `approved` 或 `unresolved`。含 unresolved 也能交接；reviewed 只表示审核已完成记录，不表示全部可接入。
- 报告存在、机器结构通过不等于语言已审核。脚本不会判断日语自然度或候选判读质量；人工逐卡审核职责保持不变。读音扫描格式没有覆盖全体非候选卡的源文件 hash，因此时间戳和候选比对只能发现常见过期情况，不能证明扫描内容完全真实。

## 并发、路径和身份边界

每批在状态目录有独立 `.lock`，以 `open('wx')` 排他创建。锁内重新读取并验证该批状态，冻结所读文件在写状态前复核字节 hash。新状态先在同目录写唯一 `.tmp` 并 fsync，再 rename 到单批 JSON，因此不同批互不争用一个总状态文件，同批不会丢失更新。

进程异常退出可能留下短时 `.lock`。工具不会自行按时间过期删锁。主代理应先核实记录中的 pid 对应进程已停止、该批无进行中的工具调用，再针对确切锁路径人工处理；不要在仍运行时删除。JSON 内的长期 owner 才是作者／审核者作业归属，短时 `.lock` 只保护状态操作。

路径全部约束于脚本所在任务根目录；拒绝绝对路径、`..`、反斜线、盘符以及中途符号链接／Windows junction。CLI 无 task-root 或任意输出路径参数。`createPipeline` 的测试替代根只允许当前任务下 `pipeline-state/demo-*`。

`--actor root` 和 `--agent` 是协作身份断言，无法认证共享工作区里的真实代理身份；有文件写权限的进程仍可绕过工具直接写文件。这个工具防止正常工作流中的重复分派和错误交接，不是文件权限系统。每个代理必须遵守“先核对 owner、只写自己批次、freeze 后停写”。

## 测试

`self-test` 在 `pipeline-state/demo-<随机ID>` 生成单卡假批，使用真实仓库结构与活用器，不读取或修改任何生产卡。包含真实的两个 Node 子进程并发 assign，同批恰有一个获胜；还验证重复 owner、错误身份、自审、清单 hash／路径／条目漂移、缺文件、卡片覆盖／结构、过期或不匹配的读音、ledger ID／sentence／hash／reason／status，以及 unresolved 的正常冻结。结束后只删除经路径检查的随机假批目录，不生成生产批状态。

初版 37 项测试通过；新增重审流程后 42 项测试通过，覆盖主代理权限、拒绝作者自审、具体重审原因、保留漂移证据、不得抢占正在审核的批次。生产状态由主代理逐批登记，`list` 展示当前实时状态；工具不会自动推断旧批归属。
