import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { COPY, dayLabel, MODIFIER_LABEL } from '../shared/copy.ts';
import type { StateResponse } from '../shared/types.ts';

/**
 * Placeholder shell. It proves the client can read `/api/state` and regenerate
 * the day locally; the real scene, screens and juice land in the client steps.
 */
export const App = () => {
  const [state, setState] = useState<StateResponse | null>(null);

  useEffect(() => {
    void fetch('/api/state')
      .then((res) => res.json())
      .then(setState)
      .catch((error: unknown) => console.error('state failed', error));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-2 bg-[#0D1626] text-[#F2F6FC]">
      <h1 className="text-3xl font-bold tracking-tight">{COPY.title}</h1>
      <p className="text-[#8DA3BF]">{COPY.tagline}</p>
      {state && (
        <p className="mt-4 text-sm">
          {dayLabel(state.displayDay)} · {MODIFIER_LABEL[state.modifier]}
        </p>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
