-- Each project step's estimate allowance, in hundredths of a percent.
--
-- `add-project-step-estimate-allowances`: a planner sets one allowance per
-- step (`QA +30%`), and every estimate for that step is charged at
-- `round(base × (1 + allowance))`. Integer hundredths, so the two decimal
-- places a planner may type are stored exactly; 0–100000 is `+0%` to `+1000%`.
--
-- **`NOT NULL DEFAULT 0` is what makes this additive.** Blue and green share
-- one SQLite file mid-swap, and the outgoing release's `INSERT INTO step`
-- names only its own columns, so every step it writes gets zero — the charge
-- every step had before this column existed. An old binary reading a nonzero
-- allowance would ignore it and charge base days, which is why readers ship
-- before any nonzero write and why `down.sql` refuses while one exists.
--
-- The CHECK is column-level so SQLite accepts it on `ADD COLUMN`; it holds the
-- range and integrality the request boundary already validates, so a writer
-- that skipped the boundary fails here instead of storing a policy no reader
-- can charge.
ALTER TABLE `step` ADD `allowance_bps` integer DEFAULT 0 NOT NULL
  CHECK (`allowance_bps` BETWEEN 0 AND 100000 AND `allowance_bps` = CAST(`allowance_bps` AS INTEGER));
