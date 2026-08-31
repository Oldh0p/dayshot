import './index.css';

import { StrictMode } from 'react';
import type { JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { context, requestExpandedMode } from '@devvit/web/client';

import { COPY } from '../shared/copy.ts';
import { parseSplashData } from './splash-data.ts';
import { paletteFor } from './theme.ts';

/**
 * The feed card (GDD 29.1, 42).
 *
 * This is the poster, not a logo: the day's number large enough to read while
 * scrolling, the modifier as an icon and a word, and one instruction. It has to
 * be recognisable in a fraction of a second, and it must never leak the day's
 * conditions — knowing the wind before opening the post would be knowing half
 * the answer.
 *
 * Everything it needs travels in `postData`, written when the post was created,
 * so the card costs no server call and renders instantly.
 */

export const Splash = (): JSX.Element => {
  const data = parseSplashData(context.postData);
  const palette = paletteFor(data.modifier, 0);

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center"
      style={{
        background: `linear-gradient(180deg, ${palette.skyHigh} 0%, ${palette.skyLow} 100%)`,
      }}
    >
      <div className="text-[13px] font-semibold tracking-[0.3em] text-[color:var(--color-mist)]">
        {COPY.title}
      </div>

      {data.displayDay !== null && (
        <div className="tabular text-[56px] font-extrabold leading-none">
          #{data.displayDay}
        </div>
      )}

      <div className="mt-1 text-[15px] font-semibold">
        <span aria-hidden="true">{data.modifierEmoji}</span>{' '}
        {data.modifierLabel}
      </div>

      <button
        type="button"
        onClick={(event) => requestExpandedMode(event.nativeEvent, 'game')}
        className="mt-4 min-h-12 rounded-[14px] px-7 text-[17px] font-extrabold tracking-[0.12em] text-[#141A26]"
        style={{ backgroundColor: palette.accent }}
      >
        {COPY.splashCta}
      </button>

      <div className="mt-3 text-[13px] text-[color:var(--color-mist)]">
        {COPY.tagline}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
