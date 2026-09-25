# 日语字体

练习中的日语正文、输入与注音使用自托管的 Noto Sans JP Variable；大号词形与解析中的日语词形使用自托管的 Noto Serif JP Variable。两种字体均按 `unicode-range` 分片，浏览器只请求当前页面需要的字形。字体分片位于 `public/fonts/`，CSS 按本站 GitHub Pages 的 `/katsuyo-dojo/` 基路径引用。中文界面继续使用系统中文字体栈；日语字体不可用时，依次回退到设备上的日语字体。

字体文件来自 Fontsource 的 `@fontsource-variable/noto-sans-jp` 和 `@fontsource-variable/noto-serif-jp`，版本均为 5.3.0。二者采用 SIL Open Font License 1.1，许可证副本分别保存在 `public/fonts/noto-sans-jp/LICENSE` 和 `public/fonts/noto-serif-jp/LICENSE`。

源包 SHA-256：

- Noto Sans JP：`d50e5c0779b11a9af26b7fe3f9bd6e413321a1d720fb564940ae49dc58432414`
- Noto Serif JP：`9541d7d841100ea8287309da82aa9d421018b04e7691ba0849b19ee5c18794b1`
