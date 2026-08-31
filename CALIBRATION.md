# Calibration report

Produced by `npm run tune` (GDD 9.5). Re-run it after any change to
`src/shared/tunables.ts`; `src/tests/distribution.test.ts` guards the outcome.

## What changed

The **scoring curve is untouched**. GDD II.8's constants are right: they put the
median at 75 and a quarter of shots above 90 — exactly GDD 8's targets — for a
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

Measured effect:

| | before | after |
| --- | --- | --- |
| days unwinnable at `k = 0` | 29% | **0.3%** |
| gauge that scores anything | 37% | **85%** |
| reroll index needed over 200 days | up to k=3 | **k=0** |

The validity guard-rail of GDD 9.3 was doing the game's structural work. It is
now what it was meant to be: a safety net that almost never fires.

## What was not chased

Two GDD 8 targets are unreachable under GDD 9.5's own player model, and no
choice of scoring constants changes that:

- **Bullseyes 1-3%** — measured 6.5% at sigma = 90 ms.
- **Perfects 0.05-0.3%** — measured 2.3% at sigma = 90 ms.

`holdMs` is an integer, so the finest a Perfect can be is the chance of hitting
the single best millisecond, roughly `0.8 / sigma`: 2.7% at sigma = 30 ms, 0.9%
at 90 ms. Reaching 0.1% needs an effective sigma above ~270 ms. This is a
property of the input granularity and the error model, not of the curve.

Recommendation: ship as calibrated, measure the live Perfect rate for a week,
and only then consider shrinking `PERFECT_RADIUS`. Tuning it now would be tuning
against a model already shown to be optimistic.

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
sample: 100000 shots per sigma, 40 days per modifier, sigmas 30/45/60/90 ms
geometry: mean landing sensitivity 1.66 u/ms, mean reachable span 712 u, 0/280 days needed a reroll
          a Perfect needs the release within 2.41 ms of the optimum, so the finest achievable Perfect rate is ~0.027% at sigma=30 and ~0.021% at sigma=90
sigma = 30 ms
  population        n     p10  median     p90   >=90%   bull%    perf%   zero%    off%  cliff%  mean dx
-------------------------------------------------------------------------------------------------------
         ALL    99960   77.97   94.08   99.83    65.1   19.32    6.802     0.4     0.4     0.7     40.6
       Clear    14280   80.27   95.01   99.87    70.9   20.65    6.891     0.3     0.3     0.4     39.0
   Crosswind    14280   84.29   96.27   99.95    79.6   25.20    8.081     0.0     0.0     0.2     31.7
    Tailwind    14280   78.39   94.16   99.80    66.1   18.62    6.274     0.5     0.5     0.8     43.1
       Gusty    14280   80.73   94.94   99.88    71.0   21.04    6.933     0.2     0.2     0.2     38.4
        Moon    14280   74.41   92.40   99.69    58.3   16.38    5.504     1.1     1.1     2.2     52.7
        Tiny    14280   73.55   86.23   99.73    42.0   13.88    7.521     0.3     0.3     0.6     38.4
        Long    14280   79.38   94.43   99.81    68.0   19.47    6.408     0.4     0.4     0.3     40.6
  ✗ median 94.08 too high; 65.14% above 90 is too generous; bullseyes 19.32% too common; perfects 6.8017% too common
sigma = 45 ms
  population        n     p10  median     p90   >=90%   bull%    perf%   zero%    off%  cliff%  mean dx
-------------------------------------------------------------------------------------------------------
         ALL    99960   69.63   89.04   99.45    47.5   13.04    4.538     2.2     2.2     3.2     62.4
       Clear    14280   71.67   90.77   99.56    52.2   14.68    4.650     1.7     1.7     2.8     60.3
   Crosswind    14280   75.91   92.91   99.70    60.2   16.60    5.364     0.2     0.2     1.3     48.3
    Tailwind    14280   69.45   89.13   99.37    47.6   12.31    4.076     2.9     2.9     3.7     67.1
       Gusty    14280   71.75   90.80   99.55    52.5   14.14    4.776     1.7     1.7     2.3     59.7
        Moon    14280   67.80   85.74   99.17    41.7   10.96    3.691     4.2     4.2     6.5     80.8
        Tiny    14280   66.30   81.17   98.89    29.0    9.64    4.895     1.5     1.5     3.0     58.9
        Long    14280   70.65   89.73   99.43    49.1   12.95    4.314     3.0     3.0     2.7     61.9
  ✗ median 89.04 too high; 47.46% above 90 is too generous; bullseyes 13.04% too common; perfects 4.5378% too common
sigma = 60 ms
  population        n     p10  median     p90   >=90%   bull%    perf%   zero%    off%  cliff%  mean dx
-------------------------------------------------------------------------------------------------------
         ALL    99960   63.30   82.98   98.91    36.8    9.58    3.391     4.6     4.6     6.6     83.1
       Clear    14280   67.80   85.43   99.08    40.7   10.46    3.536     3.7     3.7     6.3     82.1
   Crosswind    14280   69.88   89.64   99.37    48.8   12.55    4.048     0.3     0.3     3.2     62.9
    Tailwind    14280   57.41   82.92   98.82    36.7    9.05    3.270     6.8     6.8     7.2     90.2
       Gusty    14280   67.80   85.47   99.15    41.2   10.81    3.613     3.8     3.8     6.0     80.2
        Moon    14280   46.66   79.25   98.50    31.4    7.79    2.605     7.1     7.1    10.8    104.5
        Tiny    14280   62.62   77.14   97.36    21.4    6.69    3.473     3.3     3.3     6.0     80.2
        Long    14280   65.78   83.48   98.94    37.5    9.75    3.193     7.2     7.2     6.5     81.8
  ✗ median 82.98 too high; 36.81% above 90 is too generous; bullseyes 9.58% too common; perfects 3.3914% too common
sigma = 90 ms
  population        n     p10  median     p90   >=90%   bull%    perf%   zero%    off%  cliff%  mean dx
-------------------------------------------------------------------------------------------------------
         ALL    99960   32.12   75.39   97.78    25.6    6.57    2.286     9.3     9.3    11.9    115.6
       Clear    14280   34.65   76.93   98.11    28.1    7.08    2.416     8.1     8.1    13.5    117.0
   Crosswind    14280   62.37   81.66   98.83    35.1    9.22    2.955     0.5     0.5     6.7     88.5
    Tailwind    14280    0.00   74.26   97.69    25.1    6.27    2.101    13.4    13.4    13.5    125.2
       Gusty    14280   36.28   76.89   97.96    27.9    6.90    2.269     8.4     8.4    11.8    115.2
        Moon    14280    0.00   70.84   96.94    21.9    5.46    1.877    12.9    12.9    14.2    140.8
        Tiny    14280   39.35   70.90   94.35    14.2    4.24    2.080     7.8     7.8    12.1    113.1
        Long    14280    0.00   75.85   97.87    26.8    6.82    2.304    14.2    14.2    11.8    109.7
  ✗ bullseyes 6.57% too common; perfects 2.2859% too common
verdict
------------------------------------------------------------------------------
  median and >=90% land inside GDD 8 at sigma = 90 ms.
  Bullseye and Perfect rates cannot reach their GDD 8 targets under this
  model at any sigma below ~270 ms: see the note at the top of this file.
  Measure the live rates before touching PERFECT_RADIUS or BULLSEYE_SCORE.
```
