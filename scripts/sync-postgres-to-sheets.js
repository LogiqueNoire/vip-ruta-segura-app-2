'use strict';

require('dotenv').config();
const { migrate, q, pool } = require('../db');
const sheetsSync = require('../sheets-sync');

async function main() {
  await migrate();
  if (!sheetsSync.isConfigured()) {
    throw new Error('Configura SHEETS_SERVICE_ACCOUNT_EMAIL y SHEETS_PRIVATE_KEY.');
  }
  await q('update sheets_sync_state set revision = revision + 1 where id = 1');
  if (await sheetsSync.syncIfNeeded()) console.log('[sheets] Sincronización completa.');
}

main()
  .catch(error => {
    console.error('[sheets] No se completó la sincronización:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
