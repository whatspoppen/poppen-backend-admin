import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

// Import our custom modules
import { logger } from './utils/logger.js';
import { initializeFirebase } from './config/firebase.js';
import { errorHandler } from './middleware/errorHandler.js';
import { validateEnvVars } from './utils/envValidator.js';

// Import routes
import authRoutes from './routes/auth.js';
import firestoreRoutes from './routes/firestore.js';
import storageRoutes from './routes/storage.js';
import adminRoutes from './routes/admin.js';
import mcpRoutes from './routes/mcp.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
validateEnvVars();

class FirebaseAdminServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
        credentials: true
      }
    });
    this.port = process.env.PORT || 3000;
    this.host = process.env.HOST || 'localhost';
  }

  async initialize() {
    try {
      // Initialize Firebase Admin SDK
      await initializeFirebase();
      logger.info('Firebase Admin SDK initialized successfully');

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup Socket.io
      this.setupSocketIO();

      // Setup error handling
      this.setupErrorHandling();

      logger.info('Firebase Admin Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Firebase Admin Server:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      credentials: process.env.CORS_CREDENTIALS === 'true',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: {
        error: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API documentation endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Firebase Admin Backend API',
        version: '1.0.0',
        description: 'Comprehensive Firebase Admin Backend with MCP Integration',
        endpoints: {
          health: '/health',
          auth: '/api/v1/auth',
          firestore: '/api/v1/firestore',
          storage: '/api/v1/storage',
          admin: '/api/v1/admin',
          mcp: '/api/v1/mcp'
        },
        mcp: {
          status: 'enabled',
          transport: process.env.MCP_TRANSPORT || 'stdio',
          httpPort: process.env.MCP_HTTP_PORT || 3001
        }
      });
    });
  }

  setupRoutes() {
    const apiPrefix = process.env.API_PREFIX || '/api/v1';

    // Route registration
    this.app.use(`${apiPrefix}/auth`, authRoutes);
    this.app.use(`${apiPrefix}/firestore`, firestoreRoutes);
    this.app.use(`${apiPrefix}/storage`, storageRoutes);
    this.app.use(`${apiPrefix}/admin`, adminRoutes);
    this.app.use(`${apiPrefix}/mcp`, mcpRoutes);

    // Catch-all route for undefined endpoints
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist.`,
        availableEndpoints: [
          'GET /health',
          'GET /',
          `${apiPrefix}/auth`,
          `${apiPrefix}/firestore`,
          `${apiPrefix}/storage`,
          `${apiPrefix}/admin`,
          `${apiPrefix}/mcp`
        ]
      });
    });
  }

  setupSocketIO() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Handle real-time Firebase updates
      socket.on('subscribe-to-collection', (collectionName) => {
        logger.info(`Client ${socket.id} subscribed to collection: ${collectionName}`);
        socket.join(`collection:${collectionName}`);
      });

      socket.on('unsubscribe-from-collection', (collectionName) => {
        logger.info(`Client ${socket.id} unsubscribed from collection: ${collectionName}`);
        socket.leave(`collection:${collectionName}`);
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });

    // Make io available to routes
    this.app.set('io', this.io);
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use(errorHandler);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Close server gracefully
      this.gracefulShutdown();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      // Close server gracefully
      this.gracefulShutdown();
    });

    // Handle SIGTERM and SIGINT for graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      this.gracefulShutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      this.gracefulShutdown();
    });
  }

  gracefulShutdown() {
    this.server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  }

  async start() {
    try {
      await this.initialize();
      
      this.server.listen(this.port, this.host, () => {
        logger.info(`🚀 Firebase Admin Server running on http://${this.host}:${this.port}`);
        logger.info(`📊 Health check available at http://${this.host}:${this.port}/health`);
        logger.info(`🔥 Firebase Admin SDK initialized`);
        logger.info(`🌐 MCP Server configured with transport: ${process.env.MCP_TRANSPORT || 'stdio'}`);
        
        if (process.env.NODE_ENV === 'development') {
          logger.info('🛠️  Development mode enabled');
        }
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Create and start the server
const server = new FirebaseAdminServer();
server.start();

export default server; 