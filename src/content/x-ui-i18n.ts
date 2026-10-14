/**
 * x-ui-i18n.ts — the single place that registers the X.com UI strings (FAB,
 * snackbar) in the isolated world. Modules import `t` from here, so the table
 * is registered before their first render regardless of import order.
 */
import { registerTranslations } from '../lib/i18n.ts';
import { X_UI_STRINGS } from '../lib/i18n/content.ts';

registerTranslations(X_UI_STRINGS);

export { t } from '../lib/i18n.ts';
