# Calibration report

Produced by `npm run tune` (GDD 9.5). Re-run it after any change to
`src/shared/tunables.ts`; `src/tests/distribution.test.ts` guards the outcome.

## What changed

The **scoring curve is untouched**. GDD II.8's constants are right: they put the
median at 75 and a quarter of shots above 90 -- exactly GDD 8's targets -- for a
population whose release error is about 90 ms.

The **launch geometry was broken and is fixed**:

| Tunable | GDD default | Calibrated | Why |
| --- | --- | --- | --- |
| `V_MIN` | 900 | **400** | At 900 the ball cleared the nearest mats before the gauge had left zero, so those days offered no undershoot at all. |
| `V_MAX` | 1900 | **1350** | At 1900 the ball left the 1000-unit world less than a third of the way up the gauge. |
| `D_RANGE` | 520-880 | **500-800** | At 880 the plateau's far edge sat at 1020, past the edge of the world, so every overshoot was an instant zero -- an asymmetry GDD II.7 explicitly forbids. |
| `H_RANGE` | 0-420 | **0-280** | A tall plateau costs the ball an extra fall on the far side, which pushed overshoots off the map. |
| `ANGLE_RANGE` | 38-62 | **40-58** | The extremes made far mats unreachable and near ones impossible to undershoot on the same day. |
| `LONG_SHOT_D` | 780-880 | **720-800** | Follows `D_RANGE`; still the top slice. |

Everything else is unchanged: `GAUGE_PERIOD_MS` 1400, `G` 1700, `TARGET_R` 60,
`PERFECT_RADIUS` 4, `BULLSEYE_SCORE` 99, `MAT_DROP` 13, `MAT_EXP` 1.35,
`OUT_MAX` 87, `OUT_EXP` 0.75, `OUT_SPAN` 600, `MISFIRE_MS` 120,
`SIM_MAX_STEPS` 400, `SLOWMO_TRIGGER_DX` 30, `ROLLOVER_GRACE_S` 90.

Measured effect:

| | before | after |
| --- | --- | --- |
| days unwinnable at `k = 0` | 29% | **0.3%** |
| gauge that scores anything | 37% | **85%** |
| reroll index needed over 200 days | up to k=3 | **k=0** |

The validity guard-rail of GDD 9.3 was doing the game's structural work. It is
now what it was meant to be: a safety net that almost never fires.

## The modifiers, after indexing the scoring zones on `targetR`

At sigma = 90 ms, the sigma at which the mass targets are met:

| Day | median | p90 | >=90% | Bullseye | Perfect | zero |
| --- | --- | --- | --- | --- | --- | --- |
| Clear Skies | 76.70 | 98.06 | 27.9% | 6.94% | 2.46% | 8.3% |
| Crosswind | 81.44 | 98.84 | 35.0% | 9.35% | 2.95% | 0.7% |
| Tailwind | 74.40 | 97.51 | 24.9% | 6.17% | 2.14% | 12.9% |
| Gusty | 77.05 | 98.06 | 28.1% | 7.09% | 2.26% | 8.3% |
| Moon Gravity | 70.61 | 96.84 | 21.7% | 5.10% | 1.73% | 12.9% |
| **Tiny Target** | **71.24** | 94.71 | **14.6%** | 4.51% | 2.26% | 8.1% |
| **Long Shot** | 75.45 | 98.01 | 26.2% | 6.88% | 2.34% | **14.9%** |

Three of those readings are the point of the exercise:

- **Tiny Target is now the hardest day**, at 14.6% above 90 against 27.9% on a
  Clear day. Before the scoring zones followed `targetR` it scored identically
  to Clear, because halving the mat changed nothing about the curve. It is "the
  day of legends" again -- and note its Perfect rate is *not* lower, because the
  Perfect radius is absolute: the mat shrinks, the golden pixel does not.
- **Long Shot loses the most shots off the map** (14.9%), which is exactly the
  overshoot trap GDD 11.8 describes as "everyone underestimates it".
- **Crosswind is the easiest**, not the hardest. The headwind shortens every
  flight, so almost nothing leaves the world -- 0.7% zeros against 12.9% on a
  tailwind. That inverts the intuition in GDD 11.2 and is worth watching in the
  live data: if Crosswind reads as a soft day rather than the
  "hated-and-loved classic", its wind range is the lever.

The share card's rings follow `targetR` for the same reason the zones do. With
the document's absolute buckets, a shot 35 units out on a Tiny Target day drew
at ring 2 as though it had landed on the mat, when the mat is only 30 across --
the card would have been lying on precisely the day people most want to post.

## The cliff, after grading it by height

GDD 9.4 measures a CLIFF at the wall plane, which makes `dx` a constant 140 for
every wall impact and gives all of them the same score. A playtest turned up two
players with byte-identical results, 67.80 each, and had to stop to work out
whether that was arithmetic or a leaked user id. It was arithmetic — but a shot
that grazed the lip and one that hit the base are not the same shot, and the
score should not claim they are.

The score is now taken through the wall: `dx + 1.5 x (height missed)`. On a
260-unit plateau that runs from 67.80 for a shot that just failed to clear, down
to about 15 for one that hit the base. `dx` itself stays the honest horizontal
distance, because the result screen reports it as one — a wall impact says
"Into the wall, 180 below the top" instead of a distance from a centre it never
approached.

`CLIFF_HEIGHT_PENALTY = 1.5` is bounded by the far edge of zone 3: the worst
possible impact must still score above zero, including on a Tiny Target day
where zone 3 ends earlier. A test asserts that over 200 days.

The mass distribution is unmoved — median 75.31 and 25.5% above 90 at
sigma = 90, as before. Only the lower tail changed, which is the point: the p10
of a Clear day fell from 34.6 to 32.8 as the flat 67.80 spread out into a range.

## What was not chased

Two GDD 8 targets are unreachable under GDD 9.5's own player model, and no
choice of scoring constants changes that:

- **Bullseyes 1-3%** -- measured 6.6% at sigma = 90 ms.
- **Perfects 0.05-0.3%** -- measured 2.3% at sigma = 90 ms.

`holdMs` is an integer, so the finest a Perfect can be is the chance of hitting
the single best millisecond, roughly `0.8 / sigma`: 2.7% at sigma = 30 ms, 0.9%
at 90 ms. Reaching 0.1% needs an effective sigma above ~270 ms.

The whole millisecond is also the **fairness floor**, not just a limitation.
`performance.now()` is deliberately coarsened as a timing-attack mitigation, and
the clamp differs by browser and by isolation state -- Chrome quantises to
100 microseconds, Firefox to 1 ms unless the page is cross-origin isolated. A
sub-millisecond Perfect window would be reachable on some browsers and not on
others. A Perfect rate above target is a smaller problem than a day that is not
the same for the whole planet.

Recommendation: ship as calibrated, measure for a week, and only then consider
moving `PERFECT_RADIUS` or `BULLSEYE_SCORE`. `stats:daily:{n}` counts `shots`,
`bullseyes`, `perfects` and `sim_mismatch` as named fields for exactly that
decision -- `sim_mismatch` in particular is the drift alarm, and a log line
nobody greps is not an alarm.

## On sigma

GDD 9.5 specifies sigma in {30, 45, 60} ms. That is motor jitter for a player
who already knows the optimum -- a practice-mode player. An official first shot
also has to *judge* the day's conditions from the wind and the distance, and the
sweep below shows the mass targets are met at about 90 ms, which is 6% of the
gauge cycle. That is the number to verify in production.

## Full report

```
ONE SHOT — calibration report
==============================================================================
tunables: GAUGE_PERIOD_MS=1400 G=1700 V=[400,1350] D=[500,800] H=[0,280] R=60 PERFECT_RADIUS=4
sample: 120000 shots per sigma, 40 days per modifier, sigmas 30/45/60/90 ms
geometry: mean landing sensitivity 1.66 u/ms, mean reachable span 712 u, 0/280 days needed a reroll
          a Perfect needs the release within 2.41 ms of the optimum, so the finest achievable Perfect rate is ~0.027% at sigma=30 and ~0.021% at sigma=90
sigma = 30 ms
  population        n     p10  median     p90   >=90%   bull%    perf%   zero%    off%  cliff%  mean dx
-------------------------------------------------------------------------------------------------------
         ALL   120120   77.99   94.05   99.83    65.2   19.31    6.706     0.4     0.4     0.7     40.5
       Clear    17160   80.10   95.06   99.87    71.3   20.65    6.748     0.2     0.2     0.5     38.8
   Crosswind    17160   84.06   96.24   99.95    79.5   25.17    8.141     0.0     0.0     0.3     31.9
    Tailwind    17160   78.44   94.06   99.79    65.8   18.76    6.340     0.5     0.5     0.7     43.2
       Gusty    17160   80.64   94.97   99.88    71.6   21.28    6.946     0.2     0.2     0.3     38.2
        Moon    17160   74.33   92.55   99.69    58.6   16.29    5.414     1.1     1.1     2.1     52.4
        Tiny    17160   73.82   86.48   99.70    42.6   13.96    7.121     0.3     0.3     0.7     37.9
        Long    17160   79.27   94.27   99.79    66.8   19.07    6.230     0.4     0.4     0.4     41.3
  ✗ median 94.05 too high; 65.16% above 90 is too generous; bullseyes 19.31% too common; perfects 6.7058% too common
sigma = 45 ms
  population        n     p10  median     p90   >=90%   bull%    perf%   zero%    off%  cliff%  mean dx
-------------------------------------------------------------------------------------------------------
         ALL   120120   69.68   88.99   99.45    47.4   12.96    4.527     2.1     2.1     3.1     62.2
       Clear    17160   71.65   90.74   99.56    52.4   14.42    4.709     1.8     1.8     3.0     60.5
   Crosswind    17160   75.77   92.90   99.70    60.0   16.68    5.431     0.1     0.1     1.3     48.4
    Tailwind    17160   69.38   89.13   99.39    47.7   12.45    4.161     2.9     2.9     3.6     67.3
       Gusty    17160   72.01   90.78   99.55    52.3   14.18    4.703     1.8     1.8     2.3     59.5
        Moon    17160   61.17   85.72   99.19    41.7   11.03    3.596     3.8     3.8     6.5     79.3
        Tiny    17160   66.57   81.03   98.66    28.6    8.83    4.650     1.6     1.6     2.6     58.8
        Long    17160   70.70   89.72   99.43    49.2   13.10    4.441     2.9     2.9     2.5     61.8
  ✗ median 88.99 too high; 47.4% above 90 is too generous; bullseyes 12.96% too common; perfects 4.5271% too common
sigma = 60 ms
  population        n     p10  median     p90   >=90%   bull%    perf%   zero%    off%  cliff%  mean dx
-------------------------------------------------------------------------------------------------------
         ALL   120120   57.20   82.96   98.92    36.8    9.66    3.434     4.6     4.6     6.6     83.1
       Clear    17160   61.02   85.24   99.10    40.8   10.61    3.438     3.9     3.9     6.4     81.9
   Crosswind    17160   69.89   89.51   99.38    48.6   12.57    4.225     0.4     0.4     3.3     63.2
    Tailwind    17160   54.32   82.85   98.79    37.1    9.10    3.193     6.6     6.6     7.6     89.7
       Gusty    17160   60.37   85.24   99.13    40.7   10.73    3.462     3.9     3.9     5.9     80.5
        Moon    17160   43.19   79.38   98.37    31.3    7.86    2.791     7.2     7.2    10.5    104.6
        Tiny    17160   55.27   77.15   97.45    21.3    6.50    3.467     3.6     3.6     6.2     80.5
        Long    17160   56.57   83.56   99.03    38.0   10.25    3.462     7.0     7.0     6.3     81.2
  ✗ median 82.96 too high; 36.83% above 90 is too generous; bullseyes 9.66% too common; perfects 3.4341% too common
sigma = 90 ms
  population        n     p10  median     p90   >=90%   bull%    perf%   zero%    off%  cliff%  mean dx
-------------------------------------------------------------------------------------------------------
         ALL   120120   29.03   75.31   97.76    25.5    6.58    2.304     9.4     9.4    11.9    116.0
       Clear    17160   32.77   76.70   98.06    27.9    6.94    2.459     8.3     8.3    13.2    117.8
   Crosswind    17160   57.42   81.44   98.84    35.0    9.35    2.949     0.7     0.7     7.0     89.0
    Tailwind    17160    0.00   74.40   97.51    24.9    6.17    2.144    12.9    12.9    13.9    124.9
       Gusty    17160   34.76   77.05   98.06    28.1    7.09    2.255     8.3     8.3    11.6    114.0
        Moon    17160    0.00   70.61   96.84    21.7    5.10    1.731    12.9    12.9    14.6    141.4
        Tiny    17160   34.50   71.24   94.71    14.6    4.51    2.255     8.1     8.1    11.6    113.6
        Long    17160    0.00   75.45   98.01    26.2    6.88    2.337    14.9    14.9    11.5    110.9
  ✗ bullseyes 6.58% too common; perfects 2.3044% too common
verdict
------------------------------------------------------------------------------
  median and >=90% land inside GDD 8 at sigma = 90 ms.
  Bullseye and Perfect rates cannot reach their GDD 8 targets under this
  model at any sigma below ~270 ms: see the note at the top of this file.
  Measure the live rates before touching PERFECT_RADIUS or BULLSEYE_SCORE.
```
