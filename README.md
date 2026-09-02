# 活用道場 Katsuyō Dōjō

一个独立运行的日语动词活用练习网站。课程沿用 Yokubi 的教学顺序，并以短轮次、自适应选题和即时拆解帮助学习者把活用规则练成直觉。

在线体验：<https://l-m-sherlock.github.io/katsuyo-dojo/>

## 特色

- 按细分规则记录置信度，优先练习当前最弱项
- 只有已引入的每条规则都达标后，才解锁下一条规则
- 每轮 12 题且不重复，按 3:1 穿插聚焦规则和其他已学规则
- 不使用复习间隔、到期队列、遗忘曲线或作答时间
- 支持键盘作答、假名或汉字答案、即时规则拆解和提示
- 学习记录只保存在当前浏览器，不需要账号或后端服务
- 支持将练习进度导出为 JSON，并在其他浏览器或设备上导入恢复

## 练习范围

涵盖动词分类、否定形、过去形、て形、ます形、命令与禁止、受身、可能、意向、ば形、使役、使役受身，以及 Yokubi 中的授受、请求、条件、义务、许可等接续和多步复合活用。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000/`。

## 验证

```bash
npm test
npm run lint
npm run build
```

## 项目结构

- `app/`：练习界面、题目编排与本地学习状态
- `tests/`：自适应算法和活用规则测试
- `public/`：静态资源

## 部署

`main` 分支的每次推送都会通过 GitHub Actions 自动验证并部署到 GitHub Pages。

## 许可

程序代码采用 [MIT License](./LICENSE)。课程范围、教学表述及其他源自 Yokubi 的内容依照原项目的 CC BY 4.0 许可使用，署名信息见 [CREDITS.md](./CREDITS.md)。

## 内容来源

课程顺序与部分教学表述参考 [Yokubi](https://yoku.bi)。详见 [CREDITS.md](./CREDITS.md)。
