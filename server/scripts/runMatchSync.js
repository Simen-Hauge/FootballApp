/**
 * Standalone entry-point for the Render cron job.
 * Usage: node scripts/runMatchSync.js
 *
 * Connects to MongoDB with the same options as Server.js, runs a single
 * finished-match sync (awards points for all newly finished matches), then
 * disconnects and exits.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { runFinishedMatchSync } = require('../cron/fetchFinishedMatches');

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
    await runFinishedMatchSync();
  } catch (err) {
    console.error('❌ runFinishedMatchSync failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  process.exit(0);
})();
