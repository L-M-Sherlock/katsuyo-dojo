# 综合应用卡片任务交接 Prompt

## 当前发布范围与后续恢复

2026-09-21 Windows 已完整恢复任务，并准备分批发布 64 个正式合并批次的 949 张新增卡。当前发布范围和开放 245 对见 [发布记录](integration-release.md) 与 [v2 账本](integration-stage-requirements.v2.json)。运行时应为 17,361 张，综合运用 1,056 张；原有 16,412 张未改变。

制作队列继续保持 STOP。恢复前读取任务根 `windows-recovery-open-issues.json` 和当前 `staged-state/state.json`，先重新独立审核被撤回的报告并实质返修模板稿；登记的 pool owner 不能当作活代理。已提交报告只有收到真实完成通知并核验收据后才通过 `acknowledge-reviews.mjs` 放行。后续发布必须保留本次已发布的精确卡对象，重新生成完整证明与 approved/open 分区，不能直接重跑仍要求原始运行时基线的历史导出脚本。

## 历史 macOS 交接快照（不是当前进度）

2026-09-21 的 macOS 任务已经暂停并保存在 `work/integration-macos-20260921`。请同步整个目录，而不是只同步草稿或审核包；目录内的 [WINDOWS-HANDOFF.md](../work/integration-macos-20260921/WINDOWS-HANDOFF.md) 包含跨平台路径重定位、恢复调度和发布门禁。当前新增审核通过 772 对、正式合并 739 对、剩余 422 对，原运行时保持 16,412 张卡不变。暂停原因是本轮作者和审核代理达到模型用量上限；不能把未审核内容计入发布。

Windows 接手后先运行 `node work/integration-macos-20260921/rebase-task-paths.mjs`，确认 `progress.mjs` 数字一致，再按 `WINDOWS-HANDOFF.md` 移除 `STOP` 并启动唯一的 `pool-loop.mjs`。不要运行 `setup.mjs`、删除 `staged-state`，或从聊天记录重建收据。

> 2026-09-21：用户已明确要求忽略 Windows 上的未接入工作，在 macOS 重新完成缺口。当前任务根为 `work/integration-macos-20260921`，从运行时 107 张历史综合代表卡之外的 1,194 对重新开始；旧 Windows 草稿和审核结论不计入本轮批准。
>
> 继续本轮时先读取新任务根的 `staged-state/state.json` 与 `baseline/task-origin.json`，检查 `pool.json`、运行中的代理及 `pool-loop.log`，不要同时启动第二个调度循环。原冻结要求 `docs/integration-stage-requirements.v1.json` 保持不变。下文 Windows v2 的阶段优先级仅为历史交接，不应用于新任务；只有新账本的有效独立报告和 finalization receipt 才可用于合并。

你正在 macOS 上继续当前仓库的目标：完成综合应用（integration / `multiStepCompound`）1,301 对的用法卡全覆盖并发布。先在仓库根目录执行 `pwd`，以下命令都假定当前目录就是仓库根目录；不要照抄 Windows 盘符路径。

先读取仓库维护版规则：

- `.agents/skills/write-katsuyo-usage-cards/SKILL.md`
- `.agents/skills/write-katsuyo-usage-cards/references/coordinator.md`
- `.agents/skills/write-katsuyo-usage-cards/references/staged-workflow.md`
- `.agents/skills/write-katsuyo-usage-cards/references/integration-review.md`
- `docs/publishing.md`

## 权威状态

Windows 主代理曾使用 `work/integration-20260920-v2` 作为任务根。macOS 先检查该目录和 `staged-state/state.json` 是否实际存在；工作目录被 `.gitignore` 忽略，若不存在，不要自行重建或声称恢复了旧账本，应先取得任务快照。不要使用聊天消息中的数量作为状态；每次先读取：

```bash
set -euo pipefail
project_root="$PWD"
task_root="$project_root/work/integration-20260920-v2"
test -f "$task_root/staged-state/state.json"
node .agents/skills/write-katsuyo-usage-cards/scripts/staged-workflow.mjs status \
  --project "$project_root" \
  --task-root "$task_root"
```

冻结范围文件是 `docs/integration-stage-requirements.v1.json`：1,301 对；运行时历史代表卡 107 对；其余仍是开放缺口。当前 v2 工作池只处理 6 个 lane 的 pilot/expansion/remaining，正式合并、运行时接入和发布仍未完成。

当前已经确认 approved 的新增配对只有账本中 `status=approved` 阶段的精确并集；不要把 submitted、draft、聊天报告或工作目录 JSON 计入覆盖。用协议 3 的 receipt、scope hash、card snapshot hash 和 finalization receipt 重新验证。

## 重要身份规则

审核者必须使用真实代理句柄，例如 `/root/actual_review_a`，不能使用 `/root/reviewer_1` 这类编号槽位冒充实际代理。每名审核者都必须只读取当前 `packet` 返回的绝对路径，不搜索目录、不猜 mtime、不读取其他审核者报告。

取得 packet 的示例：

```bash
project_root="$PWD"
task_root="$project_root/work/integration-20260920-v2"
node .agents/skills/write-katsuyo-usage-cards/scripts/staged-workflow.mjs packet \
  --project "$project_root" \
  --task-root "$task_root" \
  --actor /root \
  --batch lane/00 \
  --stage pilot-01 \
  --reviewer /root/actual_review_a
```

把返回对象完整保存给审核者：`assignment`、`cards`、`notes`、`readings`、`output`、作者 `receipt`、`scopeHash`、`cardSnapshotHash`、`count`、`stage`、`packetRevision`。审核报告必须逐卡填写实际 `sentence`、源卡 hash、具体角色/对象/时间/否定/译文/reading 判断和候选 reading 判定；每张卡理由必须具体且唯一，不能用“逐卡核对 1/2/3”模板。

机械生成可用：

```bash
node work/integration-20260920-v2/make-review-skeleton.mjs <packet.cards> <packet.output>
```

生成后必须人工替换所有语义占位字段，并按 `readings.json` 的精确 candidate id 填 `retain|error`。不要复制旧报告到新 packet；改稿、repair、restart-review 或 revision 变化都会使旧报告失效。

## 当前优先级

1. 收完 `try/00 remaining-03` 的第二主审；已有审核显示其中 3 对被退回，不能 finalize 为 approved。只返修被退回的精确卡，保留另外 2 对。
2. 收完 `polite/00 expansion-02` 的第二主审；冲突只给第三审冲突卡，不能让第三审重审未冲突卡。
3. 收完 `polite/00 pilot-01`、`passive-state/00 pilot-01` 的缺失报告并 finalize。
4. 收完 `prepare/00 expansion-02` 的第二报告。
5. 每个 pilot approved 后，扩写 10 对；expansion approved 后按最多 5 对 remaining。作者只写隔离 `cards.json` 与 `notes.json`，正式卡片只能由协调器 merge。
6. 每次 approved 阶段完成后立即补下一个阶段，不等待所有 lane 同步完成。

作者模型是 `gpt-6-astra low`；审核者模型是 `gpt-6-astra medium`。已完成代理的新工作使用 `followup_task`，不要用 `send_message` 冒充运行中的任务。作者/审核者租约过期后只能由协调器显式 `reclaim`。

## 合并与发布门槛

只有所有有效要求都落入 approved 卡、逐对暂缓项有失败证据和恢复条件、开放未决集合准确登记后，才运行：

```bash
project_root="$PWD"
node scripts/export-integration-batches.mjs --verify true
npm run audit:integration -- --project "$project_root" --output integration-coverage.json
npm run audit:usage
npm run audit:eligibility
npm test
npm run typecheck
npm run lint
npm run build
```

导出器会校验 assignment、author delivery、review delivery、finalization receipt、merged 文件 hash，并生成 portable release proof。不要直接读取 `work` JSON 接入运行时，也不要把候选稿当正式卡片。发布按 `docs/publishing.md` 的 main CI gate，发布后核对线上提交、卡片总数、approved 综合覆盖数、暂缓数和开放未决数。

不要在全覆盖前宣称完成，不要为了填数量放宽语义审核，也不要在没有用户明确授权时 push 或部署。
