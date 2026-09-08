import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { hasLexicalTypo } from '../app/lib/lexical-typo.mjs';
import { unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';

const big = {domain:'adjective',class:'i',surface:'大きい',reading:'おおきい'};
const white = {domain:'adjective',class:'i',surface:'白い',reading:'しろい'};
const apply = {domain:'verb',class:'godan',surface:'申し込む',reading:'もうしこむ'};

test('internal lexical insertion or adjacent swap permits a retry only with a complete correct ending', () => {
  for (const [item,form,input] of [
    [big,'adjectivePast','おおおきかった'],
    [white,'adjectivePast','ろしかった'],
    [apply,'taiPast','ももうしこみたかった'],
    [apply,'taiPast','うもしこみたかった'],
    [apply,'teageruNegativePast','申申し込んであげなかった'],
  ]) assert.equal(createAnswerAnalyzer(item,form)(input).kind,'typo',input);
  const [,step] = unifiedDiagnosticSteps(apply,'taiPast');
  assert.equal(createAnswerAnalyzer(apply,'taiPast',{step})('うもしこみたかった').kind,'typo');
});

test('boundary edits, short roots, script changes and simultaneous ending errors cannot be forgiven', () => {
  const warm = {domain:'adjective',class:'i',surface:'暖かい',reading:'あたたかい'};
  for (const [item,form,input] of [
    [warm,'adjectivePast','あたたかかかった'],
    [white,'adjectivePast','しかろった'],
    [white,'adjectivePast','しロろかった'],
    [white,'adjectivePast','ろしいた'],
    [big,'adjectivePast','おおおきかた'],
    [apply,'taiPast','うもしこんだいた'],
    [{domain:'verb',class:'godan',surface:'書く',reading:'かく'},'masu','かかきます'],
  ]) assert.notEqual(createAnswerAnalyzer(item,form)(input).kind,'typo',input);
});

test('multiple possible corrections remain ambiguous and accepted answers are never retries', () => {
  const item={domain:'adjective',class:'na',surface:'あいう',reading:'あうい'};
  assert.equal(hasLexicalTypo(item,'あいういで',['あいうで'],['あういで']),false);
  assert.equal(createAnswerAnalyzer(big,'adjectivePast')('おおきかった').kind,'correct');
  const examine={domain:'verb',class:'ichidan',surface:'調べる',reading:'しらべる'};
  // Omitted ら in しらべられる and swapped ら/べ in しらべれる
  // lead to the same input but different accepted correction targets.
  for(const [form,input] of [['potential','しべられる'],['potentialPast','しべられた'],['potentialNegative','しべられない'],['potentialNegativePast','しべられなかった']]) {
    const result=createAnswerAnalyzer(examine,form)(input);
    assert.equal(result.kind,'incorrect',input);
    assert.equal(result.diagnosis,null,input);
  }
});
