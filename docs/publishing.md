# 验证与发布

## 普通发布

每次 main 推送和 PR 都运行全部 `tests/*.test.mjs`，不按改动路径跳过轻量回归。`scripts/ci-tests.mjs` 将它们分到 unit、ui、diagnosis、paths 四组，在独立 runner 上并行执行；每个文件只运行一次，新测试默认进入 unit，未知组或空组直接失败。

这些测试保留真实错误案例、各类规则的代表输入、误扣分与多解边界、独立/辅助计分隔离、有限拆步流程，以及故意破坏归因或计分后的反向测试。它们不运行数十万条输入的扩展生成审计。

build 与四组测试同时运行，执行知识模型检查、全对和混合学习模拟、类型检查、lint 和构建。main 的构建产物上传为 Pages artifact。verify 等待所有测试及 build 成功：失败、取消或跳过都不能通过。只有 main push 的 verify 成功后才调用 pages.yml，直接部署同一次运行的构建产物，不重复安装、测试或构建。PR 不发布。

内容发布还要求用法卡审计通过。build job 在知识模型审计之后运行 `npm run audit:usage`；该命令失败时不会生成可部署的 Pages artifact。综合运用的覆盖审计和暂缓／开放未决清单由本轮内容工作流生成，并在合并前核对；CI 只消费已经接入运行时的正式内容，不把作者工作目录中的 JSON 当作网站内容。

综合运用允许分批发布已经完整合并的批次。分批发布必须保留完整冻结要求，以互斥的 `approved`、`deferred`、`open` 集合逐对说明范围；不得将开放配对写成已完成或语言暂缓。所有纳入卡片仍须通过相同的双人独立审核、不可变收据与运行时对象核验。当前范围见 [综合运用发布记录](integration-release.md)。

本地发布前按以下顺序运行与 CI 相同的门禁（Node.js 22.13 或更高版本）：

```bash
npm ci
npm run audit:usage
npm run audit:integration -- --project "$PWD" --output integration-coverage.json
npm run audit:eligibility -- --output eligibility-audit.json
npm test
npm run audit
npm run simulate:perfect
npm run simulate:mixed
npm run typecheck
npm run lint
npm run build
```

若内容工作流提供独立的综合覆盖审计报告，也要在 `npm test` 前运行该命令，并保存要求、approved 卡、暂缓和开放未决集合的报告。报告必须明确区分草稿、已审核、已合并、已接入、已发布、暂缓和开放未决，且不能用生成总张数代替精确集合覆盖。提交前确认工作区只有预期改动，再将已验证提交推送到 `main`；不要手动上传 `dist`，Pages 只部署 CI 本次运行上传的 artifact。

目标是让普通发布主要受 UI 回归测试耗时影响，约五分钟目标需要通过 GitHub Actions 实际运行验证；不把减少检查数量或设置超时当作性能证明。

## 手动扩展审计

`Extended representative audit` 执行原有的 `--representatives` 归因与路径审计。两者在独立 runner 上并行执行，分别保存报告。当前规模约 31 万条归因输入和 72 万条路径输入，适合较大的归因改动后主动运行，不阻塞普通发布。

报告标为 `structural-representatives`，不宣称全词库覆盖。未生成模式的完整覆盖仍由全量任务检查。

## 手动全量审计

`Full diagnosis audit` 保留完整词库的两套审计，各自独立 runner，每套内部继续分片。即使一套失败，另一套仍运行并保存报告。两个手动工作流均无定时触发、无自动部署权限，不影响普通发布的构建产物。

所有调整只改变工程验证流程，不改变学习数据、计分或课程内容。

## 发布后核对

main 的 `verify` 成功且 `deploy` 完成后，从 Actions 页面记录部署运行号和 Pages URL。打开线上页面并核对构建提交（或页面中的版本标识），再抽查组合卡的正面挖空、答后完整句、reading 和译文。将线上卡片总数、综合运用 approved 覆盖数、暂缓数和开放未决数与本次发布报告逐项对照；任一数字或提交不一致时，先停止后续发布并保留该运行的 artifact、审计报告和线上 URL。
