'use client';

import { useEffect, useRef } from 'react';

interface Props {
  src: string;
  loop: boolean;
  autoplay: boolean;
  speed: number;
  reverse: boolean;
  renderer: 'svg' | 'canvas';
  useCustomDuration: boolean;
  duration: number;
}

const isDotLottie = (src: string) => /\.(lottie|zip)(\?|#|$)/i.test(src);

export default function LottiePlayer({ src, loop, autoplay, speed, reverse, renderer, useCustomDuration, duration }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !src) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    if (isDotLottie(src)) {
      import('@lottiefiles/dotlottie-web').then(({ DotLottie }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        containerRef.current.appendChild(canvas);
        const player = new DotLottie({
          canvas,
          src,
          loop,
          autoplay,
          mode: reverse ? 'reverse' : 'forward',
          speed,
          renderConfig: {
            autoResize: true,
            devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
          },
        });
        if (useCustomDuration && duration > 0) {
          player.addEventListener('load', () => {
            const naturalMs = player.duration * 1000;
            if (naturalMs > 0) player.setSpeed(naturalMs / duration);
          });
        }
        cleanup = () => player.destroy();
      });
    } else {
      let anim: import('lottie-web').AnimationItem | null = null;
      import('lottie-web').then(({ default: lottie }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer,
          loop,
          autoplay,
          path: src,
        });

        anim.setDirection(reverse ? -1 : 1);

        anim.addEventListener('DOMLoaded', () => {
          if (!anim || cancelled) return;
          if (useCustomDuration && duration > 0) {
            const naturalDuration = (anim.totalFrames / (anim as any).frameRate) * 1000;
            anim.setSpeed(naturalDuration / duration);
          } else {
            anim.setSpeed(speed);
          }
          if (reverse && autoplay) {
            anim.goToAndPlay(anim.totalFrames, true);
          }
        });
      });
      cleanup = () => anim?.destroy();
    }

    return () => {
      cancelled = true;
      cleanup?.();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [src, loop, autoplay, speed, reverse, renderer, useCustomDuration, duration]);

  return <div ref={containerRef} className="w-full h-full" />;
}
