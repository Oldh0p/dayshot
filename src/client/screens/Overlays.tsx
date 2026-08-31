import type { JSX, ReactNode } from 'react';

import { COPY } from '../../shared/copy.ts';
import { audio } from '../audio.ts';

/**
 * The small screens: the rules sheet, the states that interrupt, and the
 * consent dialog.
 *
 * All of them stay out of the way. GDD 29 counts nine surfaces in the whole
 * game and four of them are these.
 */

const Sheet = (props: {
  readonly children: ReactNode;
  readonly onClose?: () => void;
}): JSX.Element => (
  <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/55 p-4">
    <div className="w-full max-w-[430px] rounded-[14px] bg-[color:var(--sky-low)] p-5 shadow-[0_-1px_0_rgba(242,246,252,0.12)_inset]">
      {props.children}
      {props.onClose && (
        <button
          type="button"
          onClick={props.onClose}
          className="mt-4 min-h-12 w-full rounded-[14px] border border-white/20 text-[15px] font-semibold"
        >
          Close
        </button>
      )}
    </div>
  </div>
);

/** GDD 19: one sentence of rules, for the archaeologists. */
export const HelpSheet = (props: {
  readonly soundOn: boolean;
  readonly onToggleSound: (on: boolean) => void;
  readonly onClose: () => void;
}): JSX.Element => (
  <Sheet onClose={props.onClose}>
    <h2 className="text-[22px] font-extrabold">{COPY.helpTitle}</h2>
    <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--color-mist)]">
      {COPY.helpBody}
    </p>
    <label className="mt-4 flex min-h-12 items-center justify-between text-[15px]">
      <span>{COPY.soundToggle}</span>
      <input
        type="checkbox"
        checked={props.soundOn}
        onChange={(event) => {
          audio.setEnabled(event.target.checked);
          props.onToggleSound(event.target.checked);
        }}
        className="h-6 w-6 accent-[color:var(--accent)]"
      />
    </label>
  </Sheet>
);

/**
 * Posting as the player is a distinct, explicit decision, asked once and then
 * remembered server-side. Reddit's review rules require it and so does not
 * surprising anyone.
 */
export const ShareConsent = (props: {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element => (
  <Sheet>
    <h2 className="text-[22px] font-extrabold">{COPY.shareConsentTitle}</h2>
    <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--color-mist)]">
      {COPY.shareConsentBody}
    </p>
    <div className="mt-4 flex flex-col gap-2">
      <button
        type="button"
        onClick={props.onConfirm}
        className="min-h-12 w-full rounded-[14px] bg-[color:var(--accent)] text-[17px] font-extrabold text-[#141A26]"
      >
        {COPY.shareConsentConfirm}
      </button>
      <button
        type="button"
        onClick={props.onCancel}
        className="min-h-12 w-full text-[15px] text-[color:var(--color-mist)]"
      >
        {COPY.shareConsentCancel}
      </button>
    </div>
  </Sheet>
);

/** The day turned over before the player fired. Nothing is lost (GDD 30). */
export const DayRolled = (props: {
  readonly onReload: () => void;
}): JSX.Element => (
  <Sheet>
    <h2 className="text-[22px] font-extrabold">{COPY.dayRolledTitle}</h2>
    <p className="mt-2 text-[15px] text-[color:var(--color-mist)]">
      {COPY.dayRolledBody}
    </p>
    <button
      type="button"
      onClick={props.onReload}
      className="mt-4 min-h-12 w-full rounded-[14px] bg-[color:var(--accent)] text-[17px] font-extrabold text-[#141A26]"
    >
      {COPY.retry}
    </button>
  </Sheet>
);

/**
 * A logged-out visitor still sees the day behind this: give them a reason to
 * want in before asking them for anything (GDD 31).
 */
export const LoggedOut = (props: {
  readonly onLogin: () => void;
}): JSX.Element => (
  <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-6 pb-8 pt-16 text-center">
    <p className="text-[22px] font-extrabold">{COPY.loggedOut}</p>
    <button
      type="button"
      onClick={props.onLogin}
      className="min-h-12 rounded-[14px] bg-[color:var(--accent)] px-8 text-[17px] font-extrabold text-[#141A26]"
    >
      {COPY.loggedOutCta}
    </button>
  </div>
);

/** A thin, calm banner. The shot is safe, and the copy says exactly that. */
export const StatusBanner = (props: {
  readonly text: string;
}): JSX.Element => (
  <div className="absolute inset-x-0 top-0 z-10 bg-[color:var(--accent)] px-4 py-1.5 text-center text-[13px] font-semibold text-[#141A26]">
    {props.text}
  </div>
);
