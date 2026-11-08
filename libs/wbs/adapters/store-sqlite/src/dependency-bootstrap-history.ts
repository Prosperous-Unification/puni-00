/** Exact migration bytes from Git 24499e8afa6fb0f86430b31718c05633fc2c7d24, replayed only in disposable bootstrap certificates. The historical store keeps its original ledger and non-cascading foreign keys; current forward/down migrations remain unchanged. */
export const HISTORICAL_DEPENDENCY_MIGRATION = {
  name: '20260806084828_add_dependencies',
  hash: 'b9b22317105b8562d53f9547a1401a28409c4a4735b591de8c04f0e02e7a9aba',
  sql: 'CREATE TABLE `dependency` (\n\t`id` text PRIMARY KEY,\n\t`project_id` text NOT NULL,\n\t`predecessor_id` text NOT NULL,\n\t`successor_id` text NOT NULL,\n\tCONSTRAINT `fk_dependency_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`),\n\tCONSTRAINT `fk_dependency_predecessor_id_work_item_id_fk` FOREIGN KEY (`predecessor_id`) REFERENCES `work_item`(`id`),\n\tCONSTRAINT `fk_dependency_successor_id_work_item_id_fk` FOREIGN KEY (`successor_id`) REFERENCES `work_item`(`id`)\n);\n--> statement-breakpoint\nCREATE INDEX `dependency_project` ON `dependency` (`project_id`);--> statement-breakpoint\nCREATE UNIQUE INDEX `dependency_pair` ON `dependency` (`predecessor_id`,`successor_id`);',
};
