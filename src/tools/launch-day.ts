/**
 * Prints the `LAUNCH_DAY` constant for a launch date.
 *
 *   npm run launch-day             # today, UTC
 *   npm run launch-day 2026-09-14  # a chosen date
 *
 * `LAUNCH_DAY` decides one thing only: the number in the title. The level comes
 * from `dayNumber`, which is absolute, so moving `LAUNCH_DAY` renumbers the
 * display and nothing else — which is exactly why it must be set once, before
 * the first public post, and never touched again. Changing it afterwards would
 * renumber every day that has already been played.
 */

import { displayDayFor } from '../server/core/clock.ts';
import { LAUNCH_DAY } from '../shared/tunables.ts';

const MS_PER_DAY = 86400000;

const argument = process.argv[2];
const target = argument
  ? Date.parse(`${argument}T00:00:00Z`)
  : Date.now();

if (Number.isNaN(target)) {
  console.error(`Not a date: ${argument}. Expected YYYY-MM-DD.`);
  process.exit(1);
}

const dayNumber = Math.floor(target / MS_PER_DAY);
const iso = new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
const todayDisplay = displayDayFor(Math.floor(Date.now() / MS_PER_DAY));

console.log(`Launch date (UTC):   ${iso}`);
console.log(`LAUNCH_DAY:          ${dayNumber}`);
console.log('');
console.log(`Current LAUNCH_DAY:  ${LAUNCH_DAY}`);
console.log(
  `Today would show as: ONE SHOT #${todayDisplay}` +
    (todayDisplay < 1
      ? '  <-- before launch, so the number is not yet meaningful'
      : '')
);
console.log('');
console.log(
  `Set LAUNCH_DAY = ${dayNumber} in src/shared/tunables.ts so that the first`
);
console.log('public post reads ONE SHOT #1, then never change it again.');
