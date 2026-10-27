# 18 项试评反馈处理记录（2026-10-27）

本次按用户逐句反馈及后续明确选择，暂缓 7 个精确词义／形式配对、微调 8 张卡，原样保留 3 张卡。8 张微调和 3 张保留均有本轮真实独立审核及中英、注音记录；暂缓项记录为用户教学选择，不虚构返修失败次数。

**教学状态：**四个整形式暂停继续有效。本次文字与双语核对不消除 `tearuNegative`／`tearuNegativePast` 的目标同形疑点；原试评的 8 个 `tearu` 样本仍保留其历史 `uncertain` 结论。用户保留的 3 个原句也仍受整形式暂停限制，本报告不将它们恢复为可出题。

当前题池 16790 张、165 个形式。7 个精确暂停中，4 个在请求时已被整形式暂停覆盖，本次新退出当前题池的是 3 个。精确暂停合计 119，整形式覆盖 357，重叠 6，去重后暂停 470。

## 用户来源与历史边界

- 原始 156 卡试评保持最终 138 通过／7 需修／11 未决；本次范围恰为后两组 18 项，未改写旧试评报告或审核票。
- 用户要求：“根据这个反馈，如果是必须换动词或换活用表达，直接暂缓，剩下的按照建议微调。”另明确确认「勝ってもらわなかった」「届いていかない」两项直接暂缓。
- 原用户反馈全文、确认及 18 项源卡／决策封存在 [请求快照](usage-card-risk-pilot-feedback-request-20261027.json.gz)；SHA-256：`8ffec9c7db0397ed8c194dea0f4170d82a0605c776bc8e1428f70d4080a11cc0`。
- 用户来源收据：`923e800b87cc1a05c6eeda4751aae38545bec176a8e30f39b62d4449af9fd22f`。该收据的 author 只是存储协议阶段，不代表模型创作或语言审核。
- [原试评快照](usage-card-form-risk-pilot-20261027.json.gz) SHA-256：`96d3e4f426d9a0f552d7db182ac943fd1e34233464e90b465f99b4097cab16b3`。
- 源 canonical 与 English 联合回放到第 17 轮检查点；完整后继链验证后才使用该历史快照，不能拼接两个不同版本。旧 112 个精确暂停对象及全部整形式暂停政策保持不变。

## 用户指定暂缓（7）

保留原 canonical／English 对象、源句和旧批准历史，退出当前教学供应并保留构形与完整词形识别。`previousUsage` 来自原试评快照，并保存源收据与 proof SHA-256；`usageAtRequest` 如实记录请求时已存在的整形式暂停。

| 固定配对 | 变形 | 源日语句 | 请求时状态 |
| --- | --- | --- | --- |
| verb:読む:よむ/tearuNegative | 読む→読んでない | 発表が近いのに、資料を読んでない。 | 已整形式暂停 |
| verb:食べる:たべる/tearuNegative | 食べる→食べてない | 夜勤が始まるのに、夕食をまだ食べてない。 | 已整形式暂停 |
| verb:読む:よむ/tearuNegativePast | 読む→読んでなかった | 稽古が始まった時点では、台本を読んでなかった。 | 已整形式暂停 |
| verb:食べる:たべる/tearuNegativePast | 食べる→食べてなかった | 遠足の前に朝食を食べてなかったので、途中でおなかがすいた。 | 已整形式暂停 |
| verb:勝つ:かつ/temorauNegativePast | 勝つ→勝ってもらわなかった | あの練習試合では、助っ人には勝ってもらわなかった。自分で戦った。 | 本次新退出题池 |
| verb:届く:とどく/teikuNegative | 届く→届いていかない | 会合を重ねても、地域からの声は本庁まで届いていかない。 | 本次新退出题池 |
| verb:足りる:たりる/tekuruNegativePast | 足りる→足りてこなかった | 新人が入って、あのころは人手も足りてこなかった？ | 本次新退出题池 |

暂缓证据见 [7 项来源与恢复条件](usage-card-risk-pilot-feedback-holds-20261027.json)。恢复须符合该精确配对的用户恢复条件；整形式暂停仍需单独的明确恢复指令。

## 微调（8）

### 渡す→渡さず

- 固定 ID：`usage:zu:verb:渡す:わたす`；词义：交给；形式：`zu`。
- 修改前：書類を上司に渡さず、もう一度内容を確認した。
- 修改后：書類を上司には渡さず、もう一度内容を確認した。
- 原完整读音：しょるいをじょうしにわたさず、もういちどないようをかくにんした。
- 新完整读音：しょるいをじょうしにはわたさず、もういちどないようをかくにんした。
- 原中文场景：员工把文件留在自己手里重新检查
- 新中文场景：员工暂不把文件交给上司，先复核内容。
- 原中文译文：没有把文件交给上司，而是再次核对了内容。
- 新中文译文：员工没有把文件交给上司，而是再次核对了内容。
- Original English scene: Visitors were viewing the old building from the public walkway.
- Revised English scene: An employee keeps a document to review its contents again instead of handing it to a supervisor.
- Original English translation: I checked the document's contents once more instead of handing it to my supervisor.
- Revised English translation: The employee checked the document’s contents again instead of handing it to the supervisor.
- canonical SHA-256：`0bc290984d4daa11e187849608bee06c91a79614a018bf4661b13a8c5009a2de` → `f1cf9879b778bc72697337779849273718f5af5b2e138afb059a66fde65aec18`。
- English SHA-256：`99b09901f31b20378c7b8aeef4aad1f6c9d83059f91a6c293c5aa4a2c559ae1f` → `685e5a118a2c5b00a5485bab3daa78f7daeb37c49df5b715b5ab6845f8845add`。
- 本轮审核：/root/pilot_feedback_review_a；采用用户提出的「上司には渡さず」后，交付对象受「は」标示，员工先复核文件的动作与前项否定衔接自然；原来离题的英语场景已换成文件复核。

### 来る→来ておる

- 固定 ID：`usage:teoru:verb:来る:くる`；词义：来；形式：`teoru`。
- 修改前：店主は「客がもう店に来ておる」と言った。
- 修改后：年配の店主は「客がもう店に来ておるぞ」と言った。
- 原完整读音：てんしゅは「きゃくがもうみせにきておる」といった
- 新完整读音：ねんぱいのてんしゅは「きゃくがもうみせにきておるぞ」といった。
- 原中文场景：老人说客人已经到店里来了。
- 新中文场景：年长店主说客人已经到店里了。
- 原中文译文：店主说：“客人已经到店里来了。”
- 新中文译文：年长的店主说：“客人已经到店里了！”
- Original English scene: An old shopkeeper reports that a customer has arrived.
- Revised English scene: An older shopkeeper tells someone that the customer has already arrived at the shop.
- Original English translation: The customer has already arrived at the shop.
- Revised English translation: The older shopkeeper said, “The customer has already arrived at the shop!”
- canonical SHA-256：`ad482ef897c1697f9d10de823394df42ba589e3d6d03a883c7d5879e7c167e51` → `51cddaf868256d5c82de358f392058f407bdf9de55cdb108222eb66edd4ebc2f`。
- English SHA-256：`9ede50e05bef9f8f2953f5b9060852acdc1bd6231f2b94589440d320ed489b0b` → `1f06cbf74dcba4d7d5d205150b9aa246ad1fb20453aeafade16b5ab4cbd11f58`。
- 本轮审核：/root/pilot_feedback_review_a；用户指定的年长店主引语中「客がもう店に来ておるぞ」表示客人已到，店主以较郑重旧式口吻强调这一消息；外层「と言った」也已在英译中保留。

### する→しとる

- 固定 ID：`usage:toru:verb:する:する`；词义：做；形式：`toru`。
- 修改前：祖父は「庭の手入れをしとる」と言った。
- 修改后：祖父は「今は庭の手入れをしとるよ」と言った。
- 原完整读音：そふは「にわのていれをしとる」といった
- 新完整读音：そふは「いまはにわのていれをしとるよ」といった。
- 原中文场景：祖父用方言说自己正在整理庭院。
- 新中文场景：祖父告诉家人，他现在正在整理庭院。
- 原中文译文：祖父说：“我正在整理庭院。”
- 新中文译文：祖父说：“我现在正在整理庭院。”
- Original English scene: A grandfather uses his regional speech to answer a family member about his current activity.
- Revised English scene: Grandfather tells a family member that he is tending the garden now.
- Original English translation: Grandpa said, “I'm taking care of the garden.”
- Revised English translation: Grandpa said, “I’m taking care of the garden now.”
- canonical SHA-256：`3789abc99f9cba4aaac14268800507d2d6f20fac7cedace9a0ce717e05a90178` → `65157d36a5e3e7fc05d76247861c7fadd01e1f153faa52d435a52b852c39d273`。
- English SHA-256：`122efadeebd99f2f8f3168dc93f084064dbcf2ad00cf2ad366d0666472dac29b` → `6c2bee57d70474057166fe230cf697bd45fbf2f0988a03ef41c8786381004069`。
- 本轮审核：/root/pilot_feedback_review_a；采用用户指定的「今は…しとるよ」后，祖父在对家人说眼下正在做庭院养护；「しとる」与「よ」构成可接受的人物口吻，未把老人身份单独当作充分依据。

### 書く→書いてない

- 固定 ID：`usage:tearuNegative:verb:書く:かく`；词义：写；书写；形式：`tearuNegative`。
- 修改前：提出前なのに、申込書に名前をまだ書いてない。
- 修改后：提出前なのに、申込書にまだ名前が書いてない。
- 原完整读音：ていしゅつまえなのに、もうしこみしょになまえをまだかいてない。
- 新完整读音：ていしゅつまえなのに、もうしこみしょにまだなまえがかいてない。
- 原中文场景：提交前，申请表上还没事先写姓名。
- 新中文场景：申请表即将提交，姓名栏却还是空着。
- 原中文译文：明明要提交了，申请表上还没有事先写好姓名。
- 新中文译文：明明快要提交了，申请表上还没写姓名。
- Original English scene: The application is due soon.
- Revised English scene: The application is almost due, but the name field is still blank.
- Original English translation: Even though it is time to submit the application, I still haven’t written my name on it.
- Revised English translation: Even though it is almost time to submit the application, the name field is still blank.
- canonical SHA-256：`80e0df33311790d37db290f3d5be48ce23467522de1e4519b1a00157420251da` → `8b8714bf63235e98b0f0b053629507c6899d394cabe48641470e2105ac66ef43`。
- English SHA-256：`a08593b8c138487c293584de26e68c42a552dd08a706d897985436cae13c8709` → `7a4b1a7e4a55412fa84f0518f4381f9c6e7274c43a7e091a8bc1513af2699575`。
- 本轮审核：/root/pilot_feedback_review_b；申请书提交前姓名栏仍空着，完整句采用用户指定的「名前が書いてない」；可读作人为书写结果尚未成立，但与口语「書いていない」同形，文字通过不解除整项暂缓。

### 来る→来ておった

- 固定 ID：`usage:teoruPast:verb:来る:くる`；词义：来；形式：`teoruPast`。
- 修改前：祖父は「あの客は昔ここへよく来ておった」と言った。
- 修改后：祖父は「あの客は昔ここへよく来ておったのう」と言った。
- 原完整读音：そふは「あのきゃくはむかしここへよくきておった」といった
- 新完整读音：そふは「あのきゃくはむかしここへよくきておったのう」といった。
- 原中文场景：老人说那位客人以前常来这里。
- 新中文场景：祖父回忆那位熟客以前常来店里。
- 原中文译文：祖父说：“那位客人以前常来这里。”
- 新中文译文：祖父说：“那位客人以前常来这里啊。”
- Original English scene: Grandfather says that the customer used to come here often.
- Revised English scene: Grandfather recalls that a familiar customer used to come here often.
- Original English translation: Grandfather said, “That customer used to come here often.”
- Revised English translation: Grandfather said, “That customer used to come here often.”
- canonical SHA-256：`1978c2197d1a3a91669753b2fe7e41112ec40fa4a6e7a5f29d6ab0e04cc626b9` → `668177e60fc1b50a20dde8f44c46cfd00380b47b676151f0de95b78399ff585c`。
- English SHA-256：`5ac6d6b8eb8be055489c0150e84d4c18bd087461ee2b1db0b65d34049c027717` → `f2e2e5ffd30bb8028551a9c94c2fd21512604c1b16ce0157840a55989f9cd9a9`。
- 本轮审核：/root/pilot_feedback_review_a；用户指定的「来ておったのう」与祖父回忆昔日熟客的场景相合；「昔」「よく」使过去习惯来访清楚，句末感叹助词承接人物回想口吻。

### 教える→教えてあげない

- 固定 ID：`usage:teageruNegative`；词义：教；告诉；形式：`teageruNegative`。
- 修改前：秘密をばらした妹に「そのゲームの裏技は教えてあげない」と言った。
- 修改后：秘密をばらした妹に「もうそのゲームの裏技は教えてあげないからね」と言った。
- 原完整读音：ひみつをばらしたいもうとに「そのげーむのうらわざはおしえてあげない」といった。
- 新完整读音：ひみつをばらしたいもうとに「もうそのゲームのうらわざはおしえてあげないからね」といった。
- 原中文场景：妹妹泄露了我的秘密，我赌气说不告诉她游戏秘技。
- 新中文场景：妹妹泄露了我的秘密，我赌气说以后不再告诉她游戏秘技。
- 原中文译文：我对泄露我秘密的妹妹说：“那款游戏的秘技我才不告诉你。”
- 新中文译文：我对泄露我秘密的妹妹说：“那款游戏的秘技我以后不再告诉你了。”
- Original English scene: After my sister blabbed my secret, I angrily told her I would not share the game’s secret trick with her.
- Revised English scene: After my younger sister let my secret slip, I told her I would not share the secret trick for that game with her anymore.
- Original English translation: I told my sister, who had spilled my secret, ‘I am not going to tell you the secret trick for that game.’
- Revised English translation: I told my younger sister, who had let my secret slip, “I’m not going to tell you the secret trick for that game anymore, just so you know.”
- canonical SHA-256：`2163a9bae65c84582fae2824505b39ba9c6d15e0eae142f1d67791b86823407f` → `04687743e0583a1290311f5ad41dcd3a5ba8a4e50d8aef21c788a86c6aea23bf`。
- English SHA-256：`a8f714dc28ce14e87d2a727fa39c2b7a7204c1b813b274ce13ec543ba9917ac3` → `89bebaf0d54585c9920c0d16f319e7a57d825858c2974d8a568c937cf7ffff82`。
- 本轮审核：/root/pilot_feedback_review_a；用户指定的「もうそのゲームの裏技は教えてあげないからね」完整保留固定目标，妹妹泄密后赌气拒绝再告知的语气自然；rev3 英文场景及译文均已用自然的 secret trick 表达，并与日语角色、否定范围相符。

### 来る→来てしまわなかった

- 固定 ID：`usage:teshimauNegativePast:verb:来る:くる`；词义：来；形式：`teshimauNegativePast`。
- 修改前：お客さんが一度に全員来てしまわなかったので、入り口は混まなかった。
- 修改后：案内状の時間を間違えたせいで、お客さんがもう会場に来てしまわなかった？
- 原完整读音：おきゃくさんがいちどにぜんいんきてしまわなかったので、いりぐちはこまなかった。
- 新完整读音：あんないじょうのじかんをまちがえたせいで、おきゃくさんがもうかいじょうにきてしまわなかった？
- 原中文场景：来宾分批到场，门口没有挤满人。
- 新中文场景：邀请函时间写错后，向同事核对客人是否已经到场。
- 原中文译文：因为客人没有一次全都来，所以入口没有拥挤。
- 新中文译文：邀请函上的时间弄错了，客人该不会已经到会场了吧？
- Original English scene: The guests arrive in smaller groups, leaving the entrance clear.
- Revised English scene: After realizing the invitation listed the wrong time, the speaker checks whether the guests have already reached the venue.
- Original English translation: The guests didn't all arrive at once, so the entrance didn't get crowded.
- Revised English translation: Given the incorrect time on the invitation, could the guests already have arrived at the venue?
- canonical SHA-256：`c8a4825265e7c203cb0894ca63a598dcd97b267aa37a5e91c94156c39420682e` → `dcc9bd0e3be07619c11ee40ffdbb0dabac4856f446d01bddd7ec1b73b3ac04d9`。
- English SHA-256：`d2e7f0d54f7d8b4fb7e0737a3d2c67a59e1155c5efb8a0b315e7f615ae9a797b` → `42b523f61a806df7e5251c4b23edbbe40b3cb12222a5d0d7883890bf1106db77`。
- 本轮审核：/root/pilot_feedback_review_b；用户指定的日语疑问句保留邀请函时间错误与客人可能已到场的因果担忧；修订后的中英译文都不再指定出错者，疑问语气和到场方向一致，目标读音对应。

### する→していかない

- 固定 ID：`usage:teikuNegative:verb:する:する`；词义：做；形式：`teikuNegative`。
- 修改前：異動最終日の退勤時、彼は部の書類の整理をしていかないまま、元の部署を離れた。
- 修改后：今日はもう遅いので、机の整理はしていかないことにした。
- 原完整读音：いどうさいしゅうびのたいきんじ、かれはぶのしょるいのせいりをしていかないまま、もとのぶしょをはなれた。
- 新完整读音：きょうはもうおそいので、つくえのせいりはしていかないことにした。
- 原中文场景：调动前最后一天，他没整理资料就离开原部门。
- 新中文场景：下班时已经很晚，他决定不整理桌面就离开。
- 原中文译文：调动前最后一天，他没有整理部门文件便离开了原部门。
- 新中文译文：今天已经很晚了，所以我决定不整理桌面就离开。
- Original English scene: On his last day before transferring, he left his old department without organizing its documents.
- Revised English scene: At the end of a late workday, the speaker decides to leave without tidying the desk.
- Original English translation: At the end of his last workday before transferring, he left his former department without sorting its documents.
- Revised English translation: Since it is already late today, I decided to leave without tidying my desk.
- canonical SHA-256：`9c22e9583898bcb55dd015012f8955aad02ea1d32ec3ac1615a099d833e165d6` → `22f0c6aa1a29102715b4ba2e0cb0c01ecd1f3608cf0c308701be85ede0d2e56d`。
- English SHA-256：`9b2d2694e58ee3ec7b8f51c189ce065598fd8324dd7771651b826cc6f1a199c0` → `710f8aed1dabfba7d2d3cd3ea70e4d8c9851e31bd9c92377780f1baf1dc24337`。
- 本轮审核：/root/pilot_feedback_review_a；用户指定的「机の整理はしていかないことにした」自然表达因今天已晚，决定离开前不整理桌面；场景从第三人称介绍发话人，译文以该人自述的「我」呈现，同一人做决定并不整理。

## 原样保留（3）

以下 canonical 与 English 均保持原对象及原哈希；本轮仍逐卡核对文字、译文与读音。它们的形式继续暂停，审核记录只支持此次原文核对。

### 置く→置いてない

- 固定 ID：`usage:tearuNegative:verb:置く:おく`；词义：放置；形式：`tearuNegative`。
- 原句：会議の資料は、まだ各席に置いてない。
- 完整读音：かいぎのしりょうは、まだかくせきにおいてない。
- 中文场景：开会需要的资料尚未摆到座位上。
- 中文译文：会议资料还没有在各个座位上放好。
- English scene: A meeting room is being prepared before attendees arrive.
- English translation: The meeting materials still haven't been set out at each seat.
- canonical SHA-256：`1410aacb0f0aa9de118739854d39bc499f87f07c88c4a56511ba7e81e510bbfd`；English SHA-256：`8e2d4496d2bd463b1b9c1b16eb8e6e8c20d4a5b185bc9b1c85382c913daa7778`。
- 本轮审核：/root/pilot_feedback_review_b；原卡与英语原文均原样保留；会议资料尚未摆到各席的句子和译文自然对应，可作人为布置结果的描述，但「置いてない」仍不能凭此唯一归属てある。

### 書く→書いてなかった

- 固定 ID：`usage:tearuNegativePast:verb:書く:かく`；词义：写；书写；形式：`tearuNegativePast`。
- 原句：受付で確認すると、名札には名前がまだ書いてなかった。
- 完整读音：うけつけでかくにんすると、なふだにはなまえがまだかいてなかった。
- 中文场景：会前检查准备好的名牌，发现漏写了姓名。
- 中文译文：在接待处检查时，名牌上还没写姓名。
- English scene: At reception, I checked the guest name tags and noticed one still had no name on it.
- English translation: When I checked at reception, the name tag still had no name written on it.
- canonical SHA-256：`c710adbcc38074e9d02d1ebbbdfef7e36252607945f461e2f8cc37938ed91003`；English SHA-256：`4f4b3cd9171e21f2aef6c0713234a376e1e3c9304567f9d6c8b4582a78eeb532`。
- 本轮审核：/root/pilot_feedback_review_b；原卡及英语均原样保留；在接待处检查时名牌上仍未写姓名的过去观察点清楚，译文一致；「書いてなかった」也可读作ている缩约，不能据此恢复独立目标。

### 置く→置いてなかった

- 固定 ID：`usage:tearuNegativePast:verb:置く:おく`；词义：放置；形式：`tearuNegativePast`。
- 原句：客が来たとき、テーブルには水がまだ置いてなかった。
- 完整读音：きゃくがきたとき、テーブルにはみずがまだおいてなかった。
- 中文场景：客人到场时，供饮用的水尚未摆好。
- 中文译文：客人来的时候，桌上还没有放好水。
- English scene: A guest arrives while the table is being made ready.
- English translation: When the guest arrived, the water still hadn't been set out on the table.
- canonical SHA-256：`c97682819cecdf44af8b79bb4f71ba0bf907b089bfa162a9eee23f18723c6809`；English SHA-256：`3962f0d9a57236b45ad183b79ce43d327a4755cb77b9855bb31203bd3597188c`。
- 本轮审核：/root/pilot_feedback_review_b；原卡及英语均原样保留；客人到场时桌上还没摆水，过去时点、摆放对象和译文对应；「置いてなかった」的ている缩约同形疑点仍保留。

## 实际作者与独立审核

每条收据均随 [增量证明](usage-card-reviewed-revisions.v1.json) 保存不可变原始字节；逐卡批准绑定 draft hash、final sourceHash、English hash 与完整日语句。作者与审核者为不同代理，作者使用 gpt-6-luna／max，审核者使用 gpt-6-sol／medium。

| round / batch | 数量 | 作者 | 审核者 | 作者收据 | 审核收据 |
| --- | --- | --- | --- | --- | --- |
| pilot-feedback-fix-20261027-zu / pilotfix/00 | 1 | /root/pilot_feedback_author | /root/pilot_feedback_review_a | `fb56bf0525d4e57d692b207f8bec6554061e68047178903cb360230d5b64a4b7` | `b0490e32d1fb77bfa383962c9be8da4331c900aed1374438034783259e5e6dc5` |
| pilot-feedback-fix-20261027-teoru / pilotfix/01 | 1 | /root/pilot_feedback_author | /root/pilot_feedback_review_a | `994089e1b8af3d239c3e17413af12494d5e099ae5a1aef8785f6bc5f71181a7c` | `020fd24e19f0392a935ba7e7b5e4ba7068b1712c25eb79585d2181aede7fde38` |
| pilot-feedback-fix-20261027-toru / pilotfix/02 | 1 | /root/pilot_feedback_author | /root/pilot_feedback_review_a | `41d56d67db7c9cd3214b91288a66bb85c89381369d0e7ada7a8b803cc440e9aa` | `28dbd12a5255236a8f820084cd2038fdaa883dfd1a2a217fafe9a46dcd252e8b` |
| pilot-feedback-fix-20261027-teoruPast / pilotfix/03 | 1 | /root/pilot_feedback_author | /root/pilot_feedback_review_a | `bee8fd8b048d130f496b5e1e2b2e244b4ed7c642d010bf835b6675141ec57819` | `7b0b7efe0398c0ce9b001c74bbf4f45541fd686a3ee87054be4e71cfd86a9e46` |
| pilot-feedback-fix-20261027-teageruNegative / pilotfix/04 | 1 | /root/pilot_feedback_author | /root/pilot_feedback_review_a | `a1bd97601b94e2831cca4c687ef36b0fb41932530ae05d8ad27554acda16bbd2` | `43bbef5a3d26684ae3da73c1f07928a0697e3984fdb2ddcdb67ce34de4c869b7` |
| pilot-feedback-fix-20261027-teikuNegative / pilotfix/05 | 1 | /root/pilot_feedback_author | /root/pilot_feedback_review_a | `98c2f44ba16964fb8f707cc00da3f7d0f34df7e84a42b8ae8c8b434e65c75d9f` | `49dbb14b867c07a6569925b2f35ea0e408b57c64a48408570691088096d9f774` |
| pilot-feedback-fix-20261027-tearuNegative / pilotfix/06 | 2 | /root/pilot_feedback_author | /root/pilot_feedback_review_b | `7918abe41c3bf3b5ad7c73fbbdb1221c16aa6d9ee15e3179499ff1ca0bbb826a` | `5d7e2899b6a19ccfff2ad03dc740b1160bd21112aadccee3bf0c26e7ecf7dec5` |
| pilot-feedback-fix-20261027-tearuNegativePast / pilotfix/07 | 2 | /root/pilot_feedback_author | /root/pilot_feedback_review_b | `f73534e81c1bf3f8d37a33a51a99439d125353b7b147d688a76b94548c3a660d` | `0fb457ad16b9c15dccfc0073ce507e220bba5093c91fceb37b05ec6ce82ae13d` |
| pilot-feedback-fix-20261027-teshimauNegativePast / pilotfix/08 | 1 | /root/pilot_feedback_author | /root/pilot_feedback_review_b | `50387e6756316548262296963439ef5d15072e147f5f10e93b521d10e46d4709` | `94f9b8c5e5a1291db6a5db2ec4f0cdbf98a40f2f842cb2b77273d3316bc91683` |

### 真实返修与封存边界

04（教える）有两份实际拒收：第一稿的英文译文搭配生硬，第二稿译文已修好但英文场景仍有同样词组；08（来る）第一稿的中英译文添加了日语未明说的出错者。以下旧稿和拒收票均保留原字节收据；这些是文字与双语返修，不算固定配对的三次自然度失败。

| batch / 原 revision | 原作者收据 | 原拒收收据 | 实际理由 |
| --- | --- | --- | --- |
| pilotfix/04 / 1 | `8cc3c60fe3dcba4c422b1b21330ef931bb0fd65f5f5cec40b438b7a1b9e50b07` | `8874e154014a68064cb2447a644918d0bc99219e6c6eaa72dc9a7e8c4251cea3` | 用户指定的日语「もう…教えてあげないからね」及片假名 reading 已核对；英文译文「tell you that game’s cheat」搭配生硬，宜将「裏技」译为「secret trick for that game」等自然表达后重审。 |
| pilotfix/04 / 2 | `69433e3cd6466b9d645f195b77923e8bbc984486657813855b3c588e661644be` | `70b943b0f9eab30fba132b762b2298b56c352631327306358a2562c24dc2dbcb` | rev2 英文译句已把「裏技」改成自然的「the secret trick for that game」，但英语场景仍沿用「share the game’s cheat」，这个单数所有格搭配生硬，也把秘技说成游戏自带的作弊项；场景须同步返修。 |
| pilotfix/08 / 1 | `b38cca8d2e2022ba46785f3d71ce8f8e83cec7e18e0becff16970db7d1debdf8` | `d750b5ab4d0d6cfadfb7a91a8a4de5a3d8e5224c5a96355f709543a450548f4d` | 日语按用户所定问句询问客人是否已经到场，场景和目标读音相符；但中译“我把”及英译“I got”都把「案内状の時間を間違えた」未明说的出错者指定为说话人，须去掉新增主语后重审。 |

05（していかない）曾因英语场景使用第三人称、译文使用第一人称被提出角色疑点；原审核者复核为同一角色发话后批准，作者稿未改。协调者先发起复核才封存，初评文件已被覆盖，未取得该初评逐字不可变收据；此处只保留真实通信摘要，不声称初票字节或收据完整。当前 approved 报告是该稿首次正式封存的有效票，此事不计作者返修失败。

本轮最终票、3 份旧拒收票及 05 封存边界说明的联合来源摘要 SHA-256：`3694c306592801099df20a583d4ca85b211958b7132f458a7d9ec3ac14be0db9`。

完整链为 26 轮，累计源条目 292、实际审核条目 291、当前修订对象 221。本次新增 9 个精确 scope round，覆盖 11 个源 ID，无缺漏或越界。

本报告由 `node scripts/verify-risk-pilot-feedback.mjs` 从封存请求、真实收据和当前对象重建。它验证内容与来源绑定，不代替语言审核；整仓测试、构建与最终未提交状态由本轮交付说明另列。用户本轮未授权提交或发布。
