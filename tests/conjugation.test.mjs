import assert from "node:assert/strict";
import test from "node:test";
import { acceptedConjugations, conjugate, explainClass, explainConjugation } from "../app/lib/conjugation.mjs";

test("explains ru-ending godan verbs as classification exceptions", () => {
  assert.match(explainClass({ surface: "喋る", class: "godan" }), /虽然以 る 结尾.*例外的五段动词/);
  assert.match(explainClass({ surface: "食べる", class: "ichidan" }), /一段动词/);
  assert.doesNotMatch(explainClass({ surface: "書く", class: "godan" }), /例外/);
});

test("conjugates every godan ending into the negative form", () => {
  const cases = [
    ["買う", "買わない"], ["書く", "書かない"], ["泳ぐ", "泳がない"],
    ["話す", "話さない"], ["待つ", "待たない"], ["死ぬ", "死なない"],
    ["遊ぶ", "遊ばない"], ["読む", "読まない"], ["切る", "切らない"],
  ];
  for (const [word, expected] of cases) assert.equal(conjugate(word, "godan", "negative"), expected);
});

test("applies godan sound changes to past and te forms", () => {
  const cases = [
    ["買う", "買った", "買って"], ["待つ", "待った", "待って"], ["切る", "切った", "切って"],
    ["読む", "読んだ", "読んで"], ["遊ぶ", "遊んだ", "遊んで"], ["死ぬ", "死んだ", "死んで"],
    ["書く", "書いた", "書いて"], ["泳ぐ", "泳いだ", "泳いで"], ["話す", "話した", "話して"],
  ];
  for (const [word, past, te] of cases) {
    assert.equal(conjugate(word, "godan", "past"), past);
    assert.equal(conjugate(word, "godan", "te"), te);
  }
});

test("handles the 行く sound-change exception", () => {
  assert.equal(conjugate("行く", "godan", "past"), "行った");
  assert.equal(conjugate("行く", "godan", "te"), "行って");
  assert.equal(conjugate("行く", "godan", "negative"), "行かない");
});

test("conjugates ichidan verbs by replacing る", () => {
  assert.equal(conjugate("食べる", "ichidan", "negative"), "食べない");
  assert.equal(conjugate("食べる", "ichidan", "past"), "食べた");
  assert.equal(conjugate("食べる", "ichidan", "te"), "食べて");
  assert.equal(conjugate("食べる", "ichidan", "masu"), "食べます");
  assert.equal(conjugate("食べる", "ichidan", "passive"), "食べられる");
  assert.equal(conjugate("食べる", "ichidan", "potential"), "食べられる");
  assert.equal(conjugate("食べる", "ichidan", "imperative"), "食べろ");
  assert.equal(conjugate("食べる", "ichidan", "volitional"), "食べよう");
  assert.equal(conjugate("食べる", "ichidan", "ba"), "食べれば");
  assert.equal(conjugate("食べる", "ichidan", "nasai"), "食べなさい");
  assert.equal(conjugate("食べる", "ichidan", "prohibitive"), "食べるな");
  assert.equal(conjugate("食べる", "ichidan", "causative"), "食べさせる");
  assert.equal(conjugate("食べる", "ichidan", "causativePassive"), "食べさせられる");
  assert.equal(conjugate("食べる", "ichidan", "nakute"), "食べなくて");
  assert.equal(conjugate("食べる", "ichidan", "naide"), "食べないで");
  assert.equal(conjugate("食べる", "ichidan", "zu"), "食べず");
  assert.equal(conjugate("食べる", "ichidan", "zuni"), "食べずに");
  assert.equal(conjugate("食べる", "ichidan", "teshimau"), "食べてしまう");
  assert.equal(conjugate("食べる", "ichidan", "chau"), "食べちゃう");
  assert.equal(conjugate("食べる", "ichidan", "teoku"), "食べておく");
  assert.equal(conjugate("食べる", "ichidan", "toku"), "食べとく");
});

test("moves every godan ending to the i row for the masu form", () => {
  const cases = [
    ["買う", "買います"], ["書く", "書きます"], ["泳ぐ", "泳ぎます"],
    ["話す", "話します"], ["待つ", "待ちます"], ["死ぬ", "死にます"],
    ["遊ぶ", "遊びます"], ["読む", "読みます"], ["切る", "切ります"],
  ];
  for (const [word, expected] of cases) assert.equal(conjugate(word, "godan", "masu"), expected);
});

test("uses the masu stem for なさい commands", () => {
  const cases = [
    ["買う", "買いなさい"], ["書く", "書きなさい"], ["泳ぐ", "泳ぎなさい"],
    ["話す", "話しなさい"], ["待つ", "待ちなさい"], ["死ぬ", "死になさい"],
    ["遊ぶ", "遊びなさい"], ["読む", "読みなさい"], ["切る", "切りなさい"],
  ];
  for (const [word, expected] of cases) assert.equal(conjugate(word, "godan", "nasai"), expected);
});

test("adds prohibitive な directly to the dictionary form", () => {
  assert.equal(conjugate("書く", "godan", "prohibitive"), "書くな");
  assert.equal(conjugate("見る", "ichidan", "prohibitive"), "見るな");
  assert.equal(conjugate("する", "irregular", "prohibitive"), "するな");
  assert.equal(conjugate("来る", "irregular", "prohibitive"), "来るな");
});

test("moves every godan ending to the a row for the passive form", () => {
  const cases = [
    ["買う", "買われる"], ["書く", "書かれる"], ["泳ぐ", "泳がれる"],
    ["話す", "話される"], ["待つ", "待たれる"], ["死ぬ", "死なれる"],
    ["遊ぶ", "遊ばれる"], ["読む", "読まれる"], ["切る", "切られる"],
  ];
  for (const [word, expected] of cases) assert.equal(conjugate(word, "godan", "passive"), expected);
});

test("builds all Lesson 56 forms from the negative stem", () => {
  const cases = [
    ["買う", "買わ"], ["書く", "書か"], ["泳ぐ", "泳が"],
    ["話す", "話さ"], ["待つ", "待た"], ["死ぬ", "死な"],
    ["遊ぶ", "遊ば"], ["読む", "読ま"], ["切る", "切ら"],
  ];
  for (const [word, negativeStem] of cases) {
    assert.equal(conjugate(word, "godan", "nakute"), `${negativeStem}なくて`);
    assert.equal(conjugate(word, "godan", "naide"), `${negativeStem}ないで`);
    assert.equal(conjugate(word, "godan", "zu"), `${negativeStem}ず`);
    assert.equal(conjugate(word, "godan", "zuni"), `${negativeStem}ずに`);
  }
});

test("builds Lesson 57 auxiliaries and their spoken contractions", () => {
  const cases = [
    ["書く", "godan", "書いてしまう", "書いちゃう", "書いておく", "書いとく"],
    ["読む", "godan", "読んでしまう", "読んじゃう", "読んでおく", "読んどく"],
    ["話す", "godan", "話してしまう", "話しちゃう", "話しておく", "話しとく"],
    ["行く", "godan", "行ってしまう", "行っちゃう", "行っておく", "行っとく"],
    ["食べる", "ichidan", "食べてしまう", "食べちゃう", "食べておく", "食べとく"],
    ["する", "irregular", "してしまう", "しちゃう", "しておく", "しとく"],
    ["来る", "irregular", "来てしまう", "来ちゃう", "来ておく", "来とく"],
  ];
  for (const [word, verbClass, teshimau, chau, teoku, toku] of cases) {
    assert.equal(conjugate(word, verbClass, "teshimau"), teshimau);
    assert.equal(conjugate(word, verbClass, "chau"), chau);
    assert.equal(conjugate(word, verbClass, "teoku"), teoku);
    assert.equal(conjugate(word, verbClass, "toku"), toku);
  }
});

test("builds basic compound conjugations from negative and masu forms", () => {
  const cases = [
    ["書く", "godan", "書かなかった", "書きました", "書きません", "書きませんでした"],
    ["食べる", "ichidan", "食べなかった", "食べました", "食べません", "食べませんでした"],
    ["する", "irregular", "しなかった", "しました", "しません", "しませんでした"],
    ["来る", "irregular", "来なかった", "来ました", "来ません", "来ませんでした"],
    ["勉強する", "irregular", "勉強しなかった", "勉強しました", "勉強しません", "勉強しませんでした"],
  ];

  for (const [word, verbClass, negativePast, masuPast, masuNegative, masuNegativePast] of cases) {
    assert.equal(conjugate(word, verbClass, "negativePast"), negativePast);
    assert.equal(conjugate(word, verbClass, "masuPast"), masuPast);
    assert.equal(conjugate(word, verbClass, "masuNegative"), masuNegative);
    assert.equal(conjugate(word, verbClass, "masuNegativePast"), masuNegativePast);
  }

  assert.equal(conjugate("くる", "irregular", "negativePast"), "こなかった");
  assert.equal(conjugate("くる", "irregular", "masuNegativePast"), "きませんでした");
});

test("stacks past and negative endings onto voice forms", () => {
  const godanCases = {
    passivePast: "書かれた",
    passiveNegative: "書かれない",
    passiveNegativePast: "書かれなかった",
    potentialPast: "書けた",
    potentialNegative: "書けない",
    potentialNegativePast: "書けなかった",
    causativePast: "書かせた",
    causativeNegative: "書かせない",
    causativeNegativePast: "書かせなかった",
    causativePassivePast: "書かせられた",
    causativePassiveNegative: "書かせられない",
    causativePassiveNegativePast: "書かせられなかった",
  };

  for (const [form, expected] of Object.entries(godanCases)) {
    assert.equal(conjugate("書く", "godan", form), expected);
  }

  assert.equal(conjugate("食べる", "ichidan", "causativeNegativePast"), "食べさせなかった");
  assert.equal(conjugate("する", "irregular", "potentialNegativePast"), "できなかった");
  assert.equal(conjugate("来る", "irregular", "passivePast"), "来られた");
  assert.equal(conjugate("くる", "irregular", "causativePassiveNegative"), "こさせられない");
});

test("carries accepted spoken variants into voice compounds", () => {
  assert.deepEqual(acceptedConjugations("食べる", "ichidan", "potentialPast"), ["食べられた", "食べれた"]);
  assert.deepEqual(acceptedConjugations("来る", "irregular", "potentialNegative"), ["来られない", "来れない"]);
  assert.deepEqual(acceptedConjugations("書く", "godan", "causativePast"), ["書かせた", "書かした"]);
  assert.deepEqual(
    acceptedConjugations("弾く", "godan", "causativePassiveNegativePast"),
    ["弾かせられなかった", "弾かされなかった"],
  );
  assert.deepEqual(acceptedConjugations("話す", "godan", "causativePassivePast"), ["話させられた"]);
});

test("uses the negative stem for godan causative forms", () => {
  const cases = [
    ["買う", "買わせる", "買わせられる"], ["書く", "書かせる", "書かせられる"],
    ["泳ぐ", "泳がせる", "泳がせられる"], ["話す", "話させる", "話させられる"],
    ["待つ", "待たせる", "待たせられる"], ["死ぬ", "死なせる", "死なせられる"],
    ["遊ぶ", "遊ばせる", "遊ばせられる"], ["読む", "読ませる", "読ませられる"],
    ["切る", "切らせる", "切らせられる"],
  ];
  for (const [word, causative, causativePassive] of cases) {
    assert.equal(conjugate(word, "godan", "causative"), causative);
    assert.equal(conjugate(word, "godan", "causativePassive"), causativePassive);
  }
});

test("moves every godan ending to the o row for the volitional form", () => {
  const cases = [
    ["買う", "買おう"], ["書く", "書こう"], ["泳ぐ", "泳ごう"],
    ["話す", "話そう"], ["待つ", "待とう"], ["死ぬ", "死のう"],
    ["遊ぶ", "遊ぼう"], ["読む", "読もう"], ["切る", "切ろう"],
  ];
  for (const [word, expected] of cases) assert.equal(conjugate(word, "godan", "volitional"), expected);
});

test("moves every godan ending to the e row", () => {
  const cases = [
    ["買う", "買える", "買え", "買えば"], ["書く", "書ける", "書け", "書けば"],
    ["泳ぐ", "泳げる", "泳げ", "泳げば"], ["話す", "話せる", "話せ", "話せば"],
    ["待つ", "待てる", "待て", "待てば"], ["死ぬ", "死ねる", "死ね", "死ねば"],
    ["遊ぶ", "遊べる", "遊べ", "遊べば"], ["読む", "読める", "読め", "読めば"],
    ["切る", "切れる", "切れ", "切れば"],
  ];
  for (const [word, potential, imperative, ba] of cases) {
    assert.equal(conjugate(word, "godan", "potential"), potential);
    assert.equal(conjugate(word, "godan", "imperative"), imperative);
    assert.equal(conjugate(word, "godan", "ba"), ba);
  }
});

test("handles する, compound する verbs, and 来る", () => {
  assert.equal(conjugate("する", "irregular", "negative"), "しない");
  assert.equal(conjugate("勉強する", "irregular", "past"), "勉強した");
  assert.equal(conjugate("勉強する", "irregular", "te"), "勉強して");
  assert.equal(conjugate("勉強する", "irregular", "masu"), "勉強します");
  assert.equal(conjugate("勉強する", "irregular", "nasai"), "勉強しなさい");
  assert.equal(conjugate("する", "irregular", "passive"), "される");
  assert.equal(conjugate("来る", "irregular", "negative"), "来ない");
  assert.equal(conjugate("来る", "irregular", "past"), "来た");
  assert.equal(conjugate("くる", "irregular", "te"), "きて");
  assert.equal(conjugate("来る", "irregular", "masu"), "来ます");
  assert.equal(conjugate("来る", "irregular", "nasai"), "来なさい");
  assert.equal(conjugate("くる", "irregular", "passive"), "こられる");
  assert.equal(conjugate("する", "irregular", "potential"), "できる");
  assert.equal(conjugate("勉強する", "irregular", "imperative"), "勉強しろ");
  assert.equal(conjugate("来る", "irregular", "volitional"), "来よう");
  assert.equal(conjugate("来る", "irregular", "ba"), "来れば");
  assert.equal(conjugate("する", "irregular", "causative"), "させる");
  assert.equal(conjugate("勉強する", "irregular", "causativePassive"), "勉強させられる");
  assert.equal(conjugate("来る", "irregular", "causative"), "来させる");
  assert.equal(conjugate("くる", "irregular", "causativePassive"), "こさせられる");
  assert.equal(conjugate("する", "irregular", "nakute"), "しなくて");
  assert.equal(conjugate("勉強する", "irregular", "naide"), "勉強しないで");
  assert.equal(conjugate("する", "irregular", "zu"), "せず");
  assert.equal(conjugate("勉強する", "irregular", "zuni"), "勉強せずに");
  assert.equal(conjugate("来る", "irregular", "nakute"), "来なくて");
  assert.equal(conjugate("来る", "irregular", "zu"), "来ず");
  assert.equal(conjugate("くる", "irregular", "zuni"), "こずに");
  assert.equal(conjugate("くる", "irregular", "chau"), "きちゃう");
  assert.equal(conjugate("くる", "irregular", "toku"), "きとく");
});

test("accepts common potential and command variants", () => {
  assert.deepEqual(acceptedConjugations("食べる", "ichidan", "potential"), ["食べられる", "食べれる"]);
  assert.deepEqual(acceptedConjugations("来る", "irregular", "potential"), ["来られる", "来れる"]);
  assert.deepEqual(acceptedConjugations("する", "irregular", "imperative"), ["しろ", "せよ"]);
  assert.deepEqual(acceptedConjugations("書く", "godan", "nasai"), ["書きなさい", "書きな"]);
  assert.deepEqual(acceptedConjugations("食べる", "ichidan", "nasai"), ["食べなさい", "食べな"]);
  assert.deepEqual(acceptedConjugations("書く", "godan", "causative"), ["書かせる", "書かす"]);
  assert.deepEqual(acceptedConjugations("食べる", "ichidan", "causative"), ["食べさせる", "食べさす"]);
});

test("accepts contracted causative-passive forms only where standard Japanese allows them", () => {
  assert.deepEqual(acceptedConjugations("弾く", "godan", "causativePassive"), ["弾かせられる", "弾かされる"]);
  assert.deepEqual(acceptedConjugations("読む", "godan", "causativePassive"), ["読ませられる", "読まされる"]);
  assert.deepEqual(acceptedConjugations("話す", "godan", "causativePassive"), ["話させられる"]);
  assert.deepEqual(acceptedConjugations("食べる", "ichidan", "causativePassive"), ["食べさせられる"]);
  assert.deepEqual(acceptedConjugations("する", "irregular", "causativePassive"), ["させられる"]);
});

test("accepts spoken contractions for the full Lesson 57 forms", () => {
  assert.deepEqual(acceptedConjugations("書く", "godan", "teshimau"), ["書いてしまう", "書いちゃう"]);
  assert.deepEqual(acceptedConjugations("読む", "godan", "teshimau"), ["読んでしまう", "読んじゃう"]);
  assert.deepEqual(acceptedConjugations("書く", "godan", "teoku"), ["書いておく", "書いとく"]);
  assert.deepEqual(acceptedConjugations("読む", "godan", "teoku"), ["読んでおく", "読んどく"]);
});

test("returns learner-facing decomposition with the answer", () => {
  assert.deepEqual(explainConjugation("書く", "godan", "negative").parts, ["書か", "ない"]);
  assert.deepEqual(explainConjugation("食べる", "ichidan", "te").parts, ["食べ", "て"]);
  assert.equal(explainConjugation("行く", "godan", "past").answer, "行った");
  assert.deepEqual(explainConjugation("書く", "godan", "masu").parts, ["書き", "ます"]);
  assert.deepEqual(explainConjugation("買う", "godan", "passive").parts, ["買わ", "れる"]);
  assert.deepEqual(explainConjugation("書く", "godan", "potential").parts, ["書け", "る"]);
  assert.deepEqual(explainConjugation("読む", "godan", "volitional").parts, ["読も", "う"]);
  assert.deepEqual(explainConjugation("聞く", "godan", "nasai").parts, ["聞き", "なさい"]);
  assert.deepEqual(explainConjugation("来る", "irregular", "prohibitive").parts, ["来る", "な"]);
  assert.deepEqual(explainConjugation("書く", "godan", "causative").parts, ["書か", "せる"]);
  assert.deepEqual(explainConjugation("食べる", "ichidan", "causativePassive").parts, ["食べ", "させられる"]);
  assert.match(explainConjugation("弾く", "godan", "causativePassive").rule, /弾かされる/);
  assert.deepEqual(explainConjugation("書く", "godan", "nakute").parts, ["書か", "なくて"]);
  assert.deepEqual(explainConjugation("する", "irregular", "zu").parts, ["せ", "ず"]);
  assert.match(explainConjugation("食べる", "ichidan", "zuni").rule, /ないで/);
  assert.deepEqual(explainConjugation("書く", "godan", "teshimau").parts, ["書いて", "しまう"]);
  assert.deepEqual(explainConjugation("読む", "godan", "chau").parts, ["読ん", "じゃう"]);
  assert.deepEqual(explainConjugation("書く", "godan", "teoku").parts, ["書いて", "おく"]);
  assert.deepEqual(explainConjugation("読む", "godan", "toku").parts, ["読ん", "どく"]);
  assert.deepEqual(explainConjugation("書く", "godan", "negativePast").steps, ["書かない", "書かなかった"]);
  assert.deepEqual(explainConjugation("書く", "godan", "masuNegativePast").steps, ["書きます", "書きません", "書きませんでした"]);
  assert.deepEqual(explainConjugation("書く", "godan", "passiveNegativePast").steps, ["書かれる", "書かれない", "書かれなかった"]);
  assert.deepEqual(explainConjugation("食べる", "ichidan", "causativePast").parts, ["食べさせ", "た"]);
});

test("builds Yokubi te-form auxiliaries and spoken contractions", () => {
  assert.equal(conjugate("読む", "godan", "teageru"), "読んであげる");
  assert.equal(conjugate("食べる", "ichidan", "tekudasai"), "食べてください");
  assert.equal(conjugate("書く", "godan", "naideKudasai"), "書かないでください");
  assert.equal(conjugate("読む", "godan", "teiru"), "読んでいる");
  assert.equal(conjugate("読む", "godan", "teru"), "読んでる");
  assert.equal(conjugate("読む", "godan", "teoru"), "読んでおる");
  assert.equal(conjugate("読む", "godan", "toru"), "読んどる");
  assert.deepEqual(acceptedConjugations("読む", "godan", "teiru"), ["読んでいる", "読んでる"]);
});

test("builds Yokubi stem, conditional, and fixed-pattern forms", () => {
  assert.equal(conjugate("書く", "godan", "tai"), "書きたい");
  assert.equal(conjugate("食べる", "ichidan", "nagara"), "食べながら");
  assert.equal(conjugate("読む", "godan", "tara"), "読んだら");
  assert.equal(conjugate("行く", "godan", "tari"), "行ったり");
  assert.equal(conjugate("買う", "godan", "nakerebaNaranai"), "買わなければならない");
  assert.equal(conjugate("する", "irregular", "naitoIkenai"), "しないといけない");
  assert.equal(conjugate("食べる", "ichidan", "masenka"), "食べませんか");
  assert.equal(conjugate("書く", "godan", "youtosuru"), "書こうとする");
  assert.equal(conjugate("読む", "godan", "temiru"), "読んでみる");
  assert.equal(conjugate("行く", "godan", "teiku"), "行っていく");
  assert.equal(conjugate("読む", "godan", "tatte"), "読んだって");
  assert.equal(conjugate("遊ぶ", "godan", "sugiru"), "遊びすぎる");
  assert.equal(conjugate("見る", "ichidan", "passiveDesireNegativePast"), "見られたくなかった");
});
