import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDotLottie } from '@/components/LottiePlayer';

test('isDotLottie: matches .lottie / .zip with query, hash, or bare end', () => {
  for (const src of [
    'anim.lottie',
    'https://cdn.example.com/path/anim.lottie',
    'anim.zip',
    'anim.lottie?v=2',
    'anim.lottie#frag',
    'ANIM.LOTTIE',          // case-insensitive
    'a.b.lottie',           // multiple dots
  ]) {
    assert.equal(isDotLottie(src), true, `expected dotLottie: ${src}`);
  }
});

test('isDotLottie: rejects JSON and look-alike paths', () => {
  for (const src of [
    'anim.json',
    'https://cdn.example.com/anim.json?v=1',
    'lottie-folder/anim.json', // "lottie" in path, not extension
    'anim.lottiex',            // extension must terminate
    'anim.zipper',
    '',
  ]) {
    assert.equal(isDotLottie(src), false, `expected JSON/other: ${src}`);
  }
});
