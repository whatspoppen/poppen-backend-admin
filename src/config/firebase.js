import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { logger } from '../utils/logger.js';

let db = null;
let storage = null;
let auth = null;
let app = null;

/**
 * Initialize Firebase Admin SDK
 * Supports both service account key file and environment variables
 */
export async function initializeFirebase() {
  try {
    // Check if Firebase is already initialized
    if (getApps().length > 0) {
      logger.info('Firebase Admin SDK already initialized');
      return getExistingInstances();
    }

    let serviceAccount;

    // Method 1: Use service account key file path
    if (process.env.SERVICE_ACCOUNT_KEY_PATH) {
      try {
        const serviceAccountFile = readFileSync(process.env.SERVICE_ACCOUNT_KEY_PATH, 'utf8');
        serviceAccount = JSON.parse(serviceAccountFile);
        logger.info('Firebase service account loaded from file');
      } catch (fileError) {
        logger.warn('Could not load service account from file:', fileError.message);
      }
    }

    // Method 2: Use individual environment variables
    if (!serviceAccount) {
      const requiredEnvVars = [
        'FIREBASE_PROJECT_ID',
        'FIREBASE_PRIVATE_KEY',
        'FIREBASE_CLIENT_EMAIL'
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        throw new Error(`Missing required Firebase environment variables: ${missingVars.join(', ')}`);
      }

      serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
      };
      logger.info('Firebase service account loaded from environment variables');
    }

    // Initialize Firebase Admin SDK
    app = initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      projectId: serviceAccount.project_id
    });

    // Initialize services
    db = getFirestore(app);
    storage = getStorage(app);
    auth = getAuth(app);

    // Configure Firestore settings
    db.settings({
      ignoreUndefinedProperties: true,
      timestampsInSnapshots: true
    });

    logger.info(`Firebase Admin SDK initialized successfully for project: ${serviceAccount.project_id}`);
    
    return { app, db, storage, auth };
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', error);
    throw new Error(`Firebase initialization failed: ${error.message}`);
  }
}

/**
 * Get existing Firebase instances
 */
function getExistingInstances() {
  const existingApp = getApps()[0];
  return {
    app: existingApp,
    db: getFirestore(existingApp),
    storage: getStorage(existingApp),
    auth: getAuth(existingApp)
  };
}

/**
 * Get Firestore database instance
 */
export function getDb() {
  if (!db) {
    throw new Error('Firestore not initialized. Call initializeFirebase() first.');
  }
  return db;
}

/**
 * Get Firebase Storage instance
 */
export function getStorageInstance() {
  if (!storage) {
    throw new Error('Firebase Storage not initialized. Call initializeFirebase() first.');
  }
  return storage;
}

/**
 * Get Firebase Auth instance
 */
export function getAuthInstance() {
  if (!auth) {
    throw new Error('Firebase Auth not initialized. Call initializeFirebase() first.');
  }
  return auth;
}

/**
 * Get Firebase App instance
 */
export function getApp() {
  if (!app) {
    throw new Error('Firebase App not initialized. Call initializeFirebase() first.');
  }
  return app;
}

/**
 * Test Firebase connection
 */
export async function testFirebaseConnection() {
  try {
    const db = getDb();
    
    // Test Firestore connection
    const testDoc = db.collection('_health_check').doc('test');
    await testDoc.set({
      timestamp: new Date(),
      status: 'connected'
    });
    await testDoc.delete();

    logger.info('Firebase connection test successful');
    return true;
  } catch (error) {
    logger.error('Firebase connection test failed:', error);
    throw error;
  }
}

/**
 * Get Firebase project information
 */
export async function getProjectInfo() {
  try {
    const auth = getAuthInstance();
    const app = getApp();
    
    return {
      projectId: app.options.projectId,
      storageBucket: app.options.storageBucket,
      // Note: We can't easily get user count without additional permissions
      // userCount: await auth.listUsers().then(result => result.users.length),
      initialized: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to get project info:', error);
    throw error;
  }
}

/**
 * Gracefully close Firebase connections
 */
export async function closeFirebase() {
  try {
    if (app) {
      await app.delete();
      app = null;
      db = null;
      storage = null;
      auth = null;
      logger.info('Firebase Admin SDK connections closed');
    }
  } catch (error) {
    logger.error('Error closing Firebase connections:', error);
    throw error;
  }
}

// Export instances for direct use
export { db, storage, auth, app }; 