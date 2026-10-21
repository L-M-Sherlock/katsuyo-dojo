import {createElement} from 'react';
import {useFuriganaPreference} from './furigana-preference.mjs';
import {useI18n} from './i18n/provider.mjs';

export default function FuriganaToggle() {
  const {showFurigana, setShowFurigana} = useFuriganaPreference();
  const {t} = useI18n();
  return createElement('button', {
    type: 'button', className: 'furigana-toggle',
    onClick: () => setShowFurigana(!showFurigana),
  }, t(showFurigana ? 'shell.furigana.hide' : 'shell.furigana.show'));
}
