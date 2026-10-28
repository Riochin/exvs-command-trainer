import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFullscreenMode } from '@/features/input-relay/useFullscreen';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }) as MediaQueryList);
}

describe('readFullscreenMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    Reflect.deleteProperty(navigator, 'standalone');
  });

  it('Fullscreen API が使えるなら全画面ボタンを出す', () => {
    stubMatchMedia(false);
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { value: vi.fn(), configurable: true });
    expect(readFullscreenMode()).toBe('api');
  });

  it('Fullscreen API が無い（iPhone の Safari）ならホーム画面への追加を案内する', () => {
    stubMatchMedia(false);
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    expect(readFullscreenMode()).toBe('homeScreen');
  });

  it('ホーム画面から開いているなら何も出さない', () => {
    stubMatchMedia(true);
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { value: vi.fn(), configurable: true });
    expect(readFullscreenMode()).toBe('installed');
  });

  it('iOS のホーム画面から開いたとき（navigator.standalone）も何も出さない', () => {
    stubMatchMedia(false);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(readFullscreenMode()).toBe('installed');
  });
});
