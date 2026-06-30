/**
 * One-off script to award unresolved World Cup group-standing points.
 * Usage: node scripts/scoreWorldCupGroupStandings.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { payoutWorldCupGroupStandings } = require('../cron/resolveTournamentResults');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'FootyGuru';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      family: 4,
    });
    console.log(`✅ Connected to MongoDB (db="${mongoose.connection.db.databaseName}")`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }

  try {
    const scored = await payoutWorldCupGroupStandings();
    console.log(`✅ World Cup group standings payout complete: ${scored} predictions scored`);
  } catch (err) {
    console.error('❌ payoutWorldCupGroupStandings failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  process.exit(0);
})();