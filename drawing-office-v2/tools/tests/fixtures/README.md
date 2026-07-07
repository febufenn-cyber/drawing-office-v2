# Fixtures

These are NOT designs. They demonstrate what the validator catches. Keep them
out of `designs/` so `validate.py designs/` stays clean.

- `toothless-complexity/LLD.md` — DO-005 with its constant-time tolerance tagged
  `kind=complexity` but citing Op 20 (a unit-test op) instead of a measurement
  op. Running `python tools/validate.py tools/tests/fixtures/toothless-complexity/LLD.md`
  raises **E610**: a behavior test cannot observe a complexity violation. This is
  the exact bug drawing-office v1 passed silently; v2 rejects it at validation
  time. (This file shares id DO-005 with the real design, so validate it alone,
  never alongside designs/.)
