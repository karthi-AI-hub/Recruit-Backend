/**
 * Firebase Admin SDK initialisation.
 *
 * To enable push notifications:
 * 1. Go to https://console.firebase.google.com → Project Settings → Service Accounts
 * 2. Click "Generate new private key" and save as `firebase-service-account.json`
 *    in the project root (or anywhere — just set FIREBASE_SERVICE_ACCOUNT_PATH in .env).
 * 3. Set the env var:
 *      FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
 *
 * If the service account file is missing the module still exports stubs so the
 * rest of the app works without push.
 */
const admin = require('firebase-admin');
const path = require('path');
const logger = require('./logger');

let firebaseApp = null;

function initFirebase() {
    if (firebaseApp) return firebaseApp;

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!serviceAccountPath) {
        logger.warn('  ⚠️  FIREBASE_SERVICE_ACCOUNT_PATH not set — push notifications disabled');
        return null;
    }

    try {
        const resolved = path.resolve(serviceAccountPath);
        const serviceAccount = require(resolved);
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        logger.info('  🔔 Firebase Admin initialised — push notifications enabled');
        return firebaseApp;
    } catch (err) {
        logger.warn(`  ⚠️  Failed to init Firebase Admin: ${err.message} — push notifications disabled`);
        return null;
    }
}

/**
 * @returns {admin.messaging.Messaging | null}
 */
function getMessaging() {
    if (!firebaseApp) initFirebase();
    return firebaseApp ? admin.messaging() : null;
}

module.exports = { initFirebase, getMessaging };