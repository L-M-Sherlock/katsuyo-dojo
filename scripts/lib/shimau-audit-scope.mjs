import {COMPOUND_FORM_SPECS} from '../../app/lib/compound-forms.mjs';
import {CHAIN_FORM_SPECS} from '../../app/lib/multi-step-forms.mjs';

/** Include the base/contraction, continuations and chains that contain them. */
export function isShimauAuditForm(form, seen = new Set()) {
  if (typeof form !== 'string' || seen.has(form)) return false;
  if (form === 'teshimau' || form === 'chau') return true;
  seen.add(form);
  const compound = COMPOUND_FORM_SPECS[form];
  if (compound && isShimauAuditForm(compound.form, seen)) return true;
  const chain = CHAIN_FORM_SPECS[form];
  return Boolean(chain && (isShimauAuditForm(chain.base, new Set(seen)) || isShimauAuditForm(chain.tail, new Set(seen))));
}
