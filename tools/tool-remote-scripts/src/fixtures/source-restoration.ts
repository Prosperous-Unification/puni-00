/** Literal private startup files supplied independently to the scratch source pin fixture. */
export const sourceRestorationConfiguration = Object.freeze({
  backend: 'DB_PATH=/data/development.sqlite\nMIGRATE_ON_STARTUP=false\nPORT=3100\n',
  gateway: 'PORT=3200\nBE_URL=http://localhost:3100\n',
  mcp: 'WBS_API_URL=https://dev.wbs.bulletpoints.club\n',
  frontend: 'VITE_BE_URL=http://localhost:3100\nVITE_GW_URL=http://localhost:3200\n',
});
