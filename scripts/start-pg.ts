import EmbeddedPostgres from 'embedded-postgres';
import fs from 'fs';
import path from 'path';

async function startDb() {
  const dataDir = path.resolve(process.cwd(), '.pgdata');
  const pgServer = new EmbeddedPostgres({
    port: 5432,
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgrespassword',
    initialDatabase: 'reachinbox',
  });

  if (!fs.existsSync(dataDir)) {
    console.log('📦 Initializing fresh PostgreSQL cluster at', dataDir);
    await pgServer.initialise();
  }

  console.log('🚀 Starting PostgreSQL on port 5432...');
  await pgServer.start();
  console.log('✅ PostgreSQL is running and ready on port 5432.');

  try {
    await pgServer.createDatabase('reachinbox');
    console.log('✅ Created database "reachinbox"');
  } catch (err: any) {
    // Already exists
  }

  // Keep alive for standalone running
  process.on('SIGINT', async () => {
    console.log('Shutting down PostgreSQL...');
    await pgServer.stop();
    process.exit(0);
  });
}

startDb().catch(console.error);
