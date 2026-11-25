import assert from 'node:assert/strict';
import test from 'node:test';
import { isParodyBio } from '../src/shared/following-scanner.ts';
import { filterTypeLabel, formatNumber, registerTranslations } from '../src/lib/i18n.ts';
import { COMMON_STRINGS } from '../src/lib/i18n/common.ts';
import { DOWNLOAD_CENTER_STRINGS } from '../src/lib/i18n/download-center.ts';
import { POPUP_STRINGS } from '../src/lib/i18n/popup.ts';

registerTranslations(COMMON_STRINGS);

test('U27: parody accounts are recognised whatever the X interface language', () => {
  assert.equal(isParodyBio('Parody account · not affiliated'), true);
  assert.equal(isParodyBio('PARODY ACCOUNT'), true);
  assert.equal(isParodyBio('Tài khoản giễu nhại'), true);
  assert.equal(isParodyBio('Space photos'), false);
  assert.equal(isParodyBio(undefined), false);
});

test('U22: media filter values are shown with their translated label', () => {
  assert.equal(filterTypeLabel('images'), 'Images');
  assert.equal(filterTypeLabel(undefined), 'All');
  assert.equal(filterTypeLabel('custom-value'), 'custom-value', 'unknown values stay readable');
});

test('U24/U26: numbers follow the extension language, compact totals are not capped at 9k+', () => {
  assert.equal(formatNumber(12345), '12,345');
  assert.equal(formatNumber(25_000, { notation: 'compact', maximumFractionDigits: 1 }), '25K');
});

test('U22/U25/U23: every new state, phase and kicker key exists in both languages', () => {
  const popupKeys = ['idle', 'ready', 'collecting', 'downloading', 'done', 'success', 'error'].map((state) => `popup_state_${state}`);
  const dcKeys = ['idle', 'preparing', 'downloading', 'stopping', 'completed', 'error'].map((phase) => `dc_phase_${phase}`);
  for (const key of [...popupKeys, 'popup_progress_label', 'popup_chart_aria', 'popup_confirm_clear_downloaded']) {
    assert.ok(POPUP_STRINGS.en[key] && POPUP_STRINGS.vi[key], key);
  }
  for (const key of [...dcKeys, 'dc_kicker_tools', 'dc_confirm_remove_failed']) {
    assert.ok(DOWNLOAD_CENTER_STRINGS.en[key] && DOWNLOAD_CENTER_STRINGS.vi[key], key);
  }
  for (const key of ['dialog_ok', 'dialog_cancel']) assert.ok(COMMON_STRINGS.en[key] && COMMON_STRINGS.vi[key], key);
});
