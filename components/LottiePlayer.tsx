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

export default function LottiePlayer({ src, loop, autoplay, speed, reverse, renderer, useCustomDuration, duration }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !src) return;

    let cancelled = false;
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
        // When playing in reverse, start from the last frame
        if (reverse && autoplay) {
          anim.goToAndPlay(anim.totalFrames, true);
        }
      });
    });

    return () => {
      cancelled = true;
      anim?.destroy();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [src, loop, autoplay, speed, reverse, renderer, useCustomDuration, duration]);

  return <div ref={containerRef} className="w-full h-full" />;
}
