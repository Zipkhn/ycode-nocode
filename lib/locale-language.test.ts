import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localeToLanguage } from '@/lib/locale-language';

test('localeToLanguage: strips region from OG-style and BCP-47 locales', () => {
  assert.equal(localeToLanguage('fr_FR'), 'fr');
  assert.equal(localeToLanguage('en-US'), 'en');
  assert.equal(localeToLanguage('pt-BR'), 'pt');
  assert.equal(localeToLanguage('zh-cn'), 'zh');
});

test('localeToLanguage: bare language passes through, output always lowercase', () => {
  assert.equal(localeToLanguage('fr'), 'fr');
  assert.equal(localeToLanguage('FR_fr'), 'fr');
  assert.equal(localeToLanguage('EN'), 'en');
});

test('localeToLanguage: falls back to "en" for empty / malformed input', () => {
  assert.equal(localeToLanguage(null), 'en');
  assert.equal(localeToLanguage(undefined), 'en');
  assert.equal(localeToLanguage(''), 'en');
  assert.equal(localeToLanguage('_FR'), 'en');   // leading separator → empty language part
  assert.equal(localeToLanguage('-US'), 'en');
});
