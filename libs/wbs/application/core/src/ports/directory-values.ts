// Compatibility export: these records moved to `@wbs/domain` (task 6.1, decision A12) so domain
// rules can read them; ports keep their names for the stores and adapters.
export type {
  Assignment,
  DirectoryCatalog,
  DirectoryCatalogRows,
  DirectoryUsageRows,
  NamedCatalog,
  Person,
  PersonWithTeams,
  ServiceTeam,
  TeamWithServices,
} from '@wbs/domain';
