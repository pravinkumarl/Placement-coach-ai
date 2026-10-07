import mongoose from 'mongoose';
import env from './env.js';

// Cache the connection promise globally so serverless (Vercel) warm
// invocations reuse the same connection instead of opening new ones.
const cache = globalThis.__placementCoachDb ?? (globalThis.__placementCoachDb = { promise: null });

mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB. Safe to call multiple times.
 * @param {string} [uri] Override connection string (used by tests)
 */
export async function connectDatabase(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
        autoIndex: !env.isProduction,
      })
      .then(() => mongoose.connection)
      .catch((error) => {
        cache.promise = null;
        throw error;
      });
  }

  return cache.promise;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  cache.promise = null;
}

/**
 * Human readable database connection state for the health endpoint.
 * @returns {'connected'|'connecting'|'disconnecting'|'disconnected'}
 */
export function getDatabaseStatus() {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
}

export default connectDatabase;
