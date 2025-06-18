import express from 'express';
import { query, validationResult } from 'express-validator';
import { getDb, getAuthInstance, getStorageInstance, testFirebaseConnection, getProjectInfo } from '../config/firebase.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * Validation middleware
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * GET /dashboard
 * Get admin dashboard overview
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const db = getDb();
  const auth = getAuthInstance();
  const storage = getStorageInstance();
  
  try {
    // Get Firebase project info
    const projectInfo = await getProjectInfo();
    
    // Get collections count
    const collections = await db.listCollections();
    const collectionsCount = collections.length;
    
    // Get users count (limited to avoid performance issues)
    const usersResult = await auth.listUsers(1000);
    const usersCount = usersResult.users.length;
    
    // Get storage info
    const bucket = storage.bucket();
    const [files] = await bucket.getFiles({ maxResults: 1000 });
    const filesCount = files.length;
    const totalStorageSize = files.reduce((sum, file) => {
      return sum + (parseInt(file.metadata.size) || 0);
    }, 0);
    
    // Get sample data from each collection (first 5 collections)
    const sampleCollections = await Promise.all(
      collections.slice(0, 5).map(async (collection) => {
        try {
          const snapshot = await collection.limit(5).get();
          return {
            id: collection.id,
            path: collection.path,
            documentCount: snapshot.size,
            sampleDocuments: snapshot.docs.map(doc => ({
              id: doc.id,
              data: doc.data()
            }))
          };
        } catch (error) {
          return {
            id: collection.id,
            path: collection.path,
            documentCount: 'Error counting',
            error: error.message
          };
        }
      })
    );
    
    const dashboardData = {
      project: projectInfo,
      statistics: {
        collections: collectionsCount,
        users: usersCount >= 1000 ? `${usersCount}+` : usersCount,
        files: filesCount >= 1000 ? `${filesCount}+` : filesCount,
        storageSize: `${(totalStorageSize / (1024 * 1024)).toFixed(2)} MB`
      },
      sampleCollections,
      systemInfo: {
        nodeVersion: process.version,
        uptime: `${Math.floor(process.uptime() / 60)} minutes`,
        environment: process.env.NODE_ENV,
        memoryUsage: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`
        }
      },
      timestamp: new Date().toISOString()
    };
    
    logger.info('Admin dashboard accessed');
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    throw createError('Failed to load dashboard data', 500, 'dashboard-error', error.message);
  }
}));

/**
 * GET /analytics
 * Get system analytics and metrics
 */
router.get('/analytics', [
  query('period').optional().isIn(['hour', 'day', 'week', 'month']).withMessage('Period must be hour, day, week, or month'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { period = 'day' } = req.query;
  const db = getDb();
  const auth = getAuthInstance();
  
  try {
    // Calculate time range based on period
    const now = new Date();
    let startTime;
    
    switch (period) {
      case 'hour':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'day':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // Get collections with recent activity
    const collections = await db.listCollections();
    const recentActivity = await Promise.all(
      collections.map(async (collection) => {
        try {
          const recentDocs = await collection
            .where('updatedAt', '>=', startTime)
            .orderBy('updatedAt', 'desc')
            .limit(10)
            .get();
          
          return {
            collection: collection.id,
            recentDocuments: recentDocs.size,
            lastActivity: recentDocs.empty ? null : recentDocs.docs[0].data().updatedAt
          };
        } catch (error) {
          return {
            collection: collection.id,
            recentDocuments: 0,
            error: error.message
          };
        }
      })
    );
    
    // Get user creation analytics
    let userStats = { newUsers: 0, totalUsers: 0 };
    try {
      const allUsers = await auth.listUsers(1000);
      userStats.totalUsers = allUsers.users.length;
      
      const newUsers = allUsers.users.filter(user => {
        const creationTime = new Date(user.metadata.creationTime);
        return creationTime >= startTime;
      });
      userStats.newUsers = newUsers.length;
    } catch (error) {
      logger.warn('Could not get user analytics:', error.message);
    }
    
    const analytics = {
      period,
      timeRange: {
        start: startTime.toISOString(),
        end: now.toISOString()
      },
      collections: {
        total: collections.length,
        withRecentActivity: recentActivity.filter(item => item.recentDocuments > 0).length,
        recentActivity: recentActivity.filter(item => item.recentDocuments > 0)
      },
      users: userStats,
      systemMetrics: {
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      }
    };
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    throw createError('Failed to generate analytics', 500, 'analytics-error', error.message);
  }
}));

/**
 * GET /logs
 * Get application logs (if available)
 */
router.get('/logs', [
  query('level').optional().isIn(['error', 'warn', 'info', 'debug']).withMessage('Invalid log level'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { level = 'info', limit = 100 } = req.query;
  
  try {
    // Note: This is a basic implementation. In production, you might want to 
    // integrate with a proper log aggregation service like ELK stack, Splunk, etc.
    
    const logData = {
      message: 'Log retrieval not fully implemented',
      note: 'This endpoint provides a basic structure for log retrieval. ' +
            'For production use, integrate with log aggregation services.',
      requestedLevel: level,
      requestedLimit: parseInt(limit),
      availableEndpoints: [
        'Use external log services for production',
        'Check server log files directly',
        'Implement log aggregation pipeline'
      ]
    };
    
    res.json({
      success: true,
      data: logData
    });
  } catch (error) {
    throw createError('Failed to retrieve logs', 500, 'logs-error', error.message);
  }
}));

/**
 * POST /test-connections
 * Test all Firebase service connections
 */
router.post('/test-connections', asyncHandler(async (req, res) => {
  const results = {
    firestore: { status: 'unknown', error: null },
    auth: { status: 'unknown', error: null },
    storage: { status: 'unknown', error: null }
  };
  
  // Test Firestore
  try {
    await testFirebaseConnection();
    results.firestore = { status: 'connected', error: null };
  } catch (error) {
    results.firestore = { status: 'failed', error: error.message };
  }
  
  // Test Auth
  try {
    const auth = getAuthInstance();
    await auth.listUsers(1); // Test with minimal request
    results.auth = { status: 'connected', error: null };
  } catch (error) {
    results.auth = { status: 'failed', error: error.message };
  }
  
  // Test Storage
  try {
    const storage = getStorageInstance();
    const bucket = storage.bucket();
    await bucket.getMetadata();
    results.storage = { status: 'connected', error: null };
  } catch (error) {
    results.storage = { status: 'failed', error: error.message };
  }
  
  const allConnected = Object.values(results).every(result => result.status === 'connected');
  
  logger.info('Connection tests completed', { results });
  
  res.json({
    success: allConnected,
    data: {
      overall: allConnected ? 'all services connected' : 'some services failed',
      services: results,
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * GET /system-info
 * Get detailed system information
 */
router.get('/system-info', asyncHandler(async (req, res) => {
  try {
    const projectInfo = await getProjectInfo();
    
    const systemInfo = {
      firebase: projectInfo,
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        processId: process.pid
      },
      memory: {
        usage: process.memoryUsage(),
        formatted: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
          external: `${Math.round(process.memoryUsage().external / 1024 / 1024)} MB`
        }
      },
      configuration: {
        port: process.env.PORT || 3000,
        logLevel: process.env.LOG_LEVEL || 'info',
        nodeEnv: process.env.NODE_ENV || 'development',
        mcpTransport: process.env.MCP_TRANSPORT || 'stdio',
        corsConfigured: !!process.env.CORS_ORIGIN,
        rateLimitingEnabled: true
      }
    };
    
    res.json({
      success: true,
      data: systemInfo
    });
  } catch (error) {
    throw createError('Failed to get system information', 500, 'system-info-error', error.message);
  }
}));

/**
 * GET /backup-info
 * Get backup and export information
 */
router.get('/backup-info', asyncHandler(async (req, res) => {
  try {
    const db = getDb();
    const collections = await db.listCollections();
    
    const backupInfo = {
      message: 'Backup functionality structure',
      note: 'This endpoint provides information about backup capabilities. ' +
            'Actual backup implementation depends on your specific requirements.',
      availableCollections: collections.map(col => ({
        id: col.id,
        path: col.path
      })),
      recommendedBackupMethods: [
        'Firebase Firestore backup/restore via gcloud CLI',
        'Custom export scripts using Firebase Admin SDK',
        'Scheduled exports to Cloud Storage',
        'Third-party backup services'
      ],
      exportFormats: ['JSON', 'CSV', 'Firestore native format'],
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: backupInfo
    });
  } catch (error) {
    throw createError('Failed to get backup information', 500, 'backup-info-error', error.message);
  }
}));

/**
 * GET /health-detailed
 * Detailed health check with all services
 */
router.get('/health-detailed', asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {},
    system: {
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    }
  };
  
  // Check each service
  const services = ['firestore', 'auth', 'storage'];
  
  for (const service of services) {
    try {
      switch (service) {
        case 'firestore':
          await testFirebaseConnection();
          health.services.firestore = { status: 'healthy', message: 'Connected' };
          break;
        case 'auth':
          const auth = getAuthInstance();
          await auth.listUsers(1);
          health.services.auth = { status: 'healthy', message: 'Connected' };
          break;
        case 'storage':
          const storage = getStorageInstance();
          await storage.bucket().getMetadata();
          health.services.storage = { status: 'healthy', message: 'Connected' };
          break;
      }
    } catch (error) {
      health.services[service] = { 
        status: 'unhealthy', 
        message: error.message,
        error: error.code 
      };
      health.status = 'degraded';
    }
  }
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  
  res.status(statusCode).json({
    success: health.status === 'healthy',
    data: health
  });
}));

export default router; 