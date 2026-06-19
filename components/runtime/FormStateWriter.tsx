'use client';

import { useEffect } from 'react';
import { useRuntimeVarStore } from '@/stores/useRuntimeVarStore';

/**
 * Mirrors live form-field values into the runtime var store under
 * `forms.<formId>.<fieldName>`, so conditional-visibility rules with a
 * `runtime_var` source can react to what the visitor types.
 *
 * Implemented as a single document-level delegated listener (capture phase) to
 * avoid touching the high-churn form renderer in LayerRendererPublic. Native
 * Ycode forms are uncontrolled and bubble input/change events; the form element
 * carries `id = settings.id` (LayerRendererPublic ~963), which is the formId.
 */
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const formIdOf = (form: HTMLFormElement): string =>
  form.id || form.getAttribute('data-form-id') || 'form';

const valueOf = (el: Field): unknown => {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'radio') return el.checked ? el.value : undefined;
  }
  return el.value;
};

export default function FormStateWriter() {
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return;
      if (!t.form || !t.name) return;
      const v = valueOf(t);
      if (v === undefined) return; // unchecked radio — leave the namespace as-is
      useRuntimeVarStore.getState().setVar(`forms.${formIdOf(t.form)}.${t.name}`, v);
    };
    const onReset = (e: Event) => {
      if (!(e.target instanceof HTMLFormElement)) return;
      useRuntimeVarStore.getState().setVar(`forms.${formIdOf(e.target)}`, {});
    };
    document.addEventListener('input', onChange, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('reset', onReset, true);
    return () => {
      document.removeEventListener('input', onChange, true);
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('reset', onReset, true);
    };
  }, []);

  return null;
}
