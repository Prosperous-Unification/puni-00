-- Shared people (WBS 010.4.16, `share-people-across-projects`, ADR 0034): an
-- organization's capacity mode. `0` is `isolated`, today's behaviour, where
-- each project schedules its people as if it had them alone; `1` is `shared`,
-- where a project works around the bookings of the projects that outrank it.
--
-- Additive: NOT NULL with a default, so the outgoing colour's INSERT, which
-- names no such column, writes an isolated organization, and every existing
-- one reads isolated. Nothing sets `1` until the mode route ships.
ALTER TABLE `organization` ADD `shared_people` integer DEFAULT 0 NOT NULL CHECK (`shared_people` IN (0, 1));
