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
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
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
          mcp: '/api/v1/mcp',
          dashboard: '/dashboard'
        },
        mcp: {
          status: 'enabled',
          transport: process.env.MCP_TRANSPORT || 'stdio',
          httpPort: process.env.MCP_HTTP_PORT || 3001
        }
      });
    });

    // Admin Dashboard UI
    this.app.get('/dashboard', (req, res) => {
      res.send(this.getAdminDashboardHTML());
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

  getAdminDashboardHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔥 Poppen Admin Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        .sidebar { min-height: 100vh; background: linear-gradient(180deg, #667eea 0%, #764ba2 100%); }
        .content-area { background-color: #f8f9fa; min-height: 100vh; }
        .data-table { background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .stat-card { background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); transition: transform 0.2s; cursor: pointer; }
        .stat-card:hover { transform: translateY(-2px); }
        .nav-link { color: rgba(255,255,255,0.8) !important; transition: all 0.2s; }
        .nav-link:hover, .nav-link.active { color: white !important; background-color: rgba(255,255,255,0.1); border-radius: 8px; }
        .loading { display: none; text-align: center; padding: 20px; }
        .edit-form { background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 20px; }
        .btn-action { margin: 2px; }
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="row">
            <div class="col-md-2 sidebar p-3">
                <div class="text-center mb-4">
                    <h4 class="text-white"><i class="fas fa-fire"></i> Poppen Admin</h4>
                    <small class="text-white-50">Manage Your App Data</small>
                </div>
                <nav class="nav flex-column">
                    <a class="nav-link active" href="#" onclick="showDashboard()"><i class="fas fa-tachometer-alt me-2"></i> Dashboard</a>
                    <a class="nav-link" href="#" onclick="showCollection('users')"><i class="fas fa-users me-2"></i> Users</a>
                    <a class="nav-link" href="#" onclick="showCollection('posts')"><i class="fas fa-image me-2"></i> Posts</a>
                    <a class="nav-link" href="#" onclick="showCollection('places')"><i class="fas fa-map-marker-alt me-2"></i> Places</a>
                    <a class="nav-link" href="#" onclick="showCollection('messages')"><i class="fas fa-comments me-2"></i> Messages</a>
                    <a class="nav-link" href="#" onclick="showCollection('events')"><i class="fas fa-calendar me-2"></i> Events</a>
                </nav>
            </div>
            <div class="col-md-10 content-area p-4">
                <div id="dashboard" class="content-section">
                    <h2 class="mb-4"><i class="fas fa-tachometer-alt me-2"></i>Poppen App Dashboard</h2>
                    <div class="row mb-4" id="stats-cards"></div>
                    <div class="row">
                        <div class="col-md-12">
                            <div class="stat-card p-4 mb-3">
                                <h5><i class="fas fa-info-circle me-2"></i>Admin Panel Features</h5>
                                <div class="row">
                                    <div class="col-md-4">
                                        <h6><i class="fas fa-eye text-primary me-2"></i>View Data</h6>
                                        <p class="text-muted">Browse all your Firebase collections in organized tables</p>
                                    </div>
                                    <div class="col-md-4">
                                        <h6><i class="fas fa-edit text-success me-2"></i>Edit Records</h6>
                                        <p class="text-muted">Update user profiles, posts, places, and more</p>
                                    </div>
                                    <div class="col-md-4">
                                        <h6><i class="fas fa-trash text-danger me-2"></i>Delete Items</h6>
                                        <p class="text-muted">Remove unwanted content with confirmation</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="data-view" class="content-section" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h2 id="collection-title"><i class="fas fa-table me-2"></i>Data</h2>
                        <div>
                            <button class="btn btn-secondary me-2" onclick="showDashboard()"><i class="fas fa-arrow-left me-2"></i>Back</button>
                            <button class="btn btn-success" onclick="refreshData()"><i class="fas fa-sync me-2"></i>Refresh</button>
                        </div>
                    </div>
                    <div class="data-table p-3">
                        <div class="loading" id="loading"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i><p class="mt-2">Loading data...</p></div>
                        <div class="table-responsive">
                            <table class="table table-hover" id="data-table">
                                <thead class="table-dark"><tr id="table-header"></tr></thead>
                                <tbody id="table-body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div id="edit-form" class="content-section" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h2 id="form-title"><i class="fas fa-edit me-2"></i>Edit Item</h2>
                        <button class="btn btn-secondary" onclick="cancelEdit()"><i class="fas fa-times me-2"></i>Cancel</button>
                    </div>
                    <div class="edit-form">
                        <form id="item-form">
                            <div id="form-fields"></div>
                            <div class="mt-4">
                                <button type="submit" class="btn btn-success me-2"><i class="fas fa-save me-2"></i>Save Changes</button>
                                <button type="button" class="btn btn-danger" onclick="deleteItem()"><i class="fas fa-trash me-2"></i>Delete</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const API_BASE = window.location.origin;
        let currentCollection = '', currentItem = null;

        document.addEventListener('DOMContentLoaded', () => showDashboard());

        async function showDashboard() {
            hideAllSections();
            document.getElementById('dashboard').style.display = 'block';
            updateActiveNav(0);
            await loadStats();
        }

                 async function loadStats() {
             try {
                 const response = await fetch(API_BASE + '/api/v1/firestore/collections');
                 const data = await response.json();
                 const statsContainer = document.getElementById('stats-cards');
                 statsContainer.innerHTML = '';
                 if (data.success) {
                     for (let collection of data.data.collections) {
                         try {
                             const countResponse = await fetch(API_BASE + '/api/v1/firestore/collections/' + collection.id + '/documents?limit=100');
                             const countData = await countResponse.json();
                             const count = countData.data?.documents?.length || 0;
                             statsContainer.appendChild(createStatCard(collection.id, count));
                         } catch (error) {
                             console.error('Error loading ' + collection.id, error);
                             statsContainer.appendChild(createStatCard(collection.id, '?'));
                         }
                     }
                 }
             } catch (error) {
                 console.error('Error loading stats:', error);
                 document.getElementById('stats-cards').innerHTML = '<div class="col-12"><div class="alert alert-danger">Error loading dashboard</div></div>';
             }
         }

        function createStatCard(name, count) {
            const col = document.createElement('div');
            col.className = 'col-md-3 mb-3';
            const icons = { users: 'fas fa-users text-primary', posts: 'fas fa-image text-success', places: 'fas fa-map-marker-alt text-info', messages: 'fas fa-comments text-warning', events: 'fas fa-calendar text-danger' };
                         col.innerHTML = '<div class="stat-card p-4 text-center" onclick="showCollection(\\'' + name + '\\')"><i class="' + (icons[name] || 'fas fa-database text-dark') + ' fa-3x mb-3"></i><h2 class="text-dark">' + count + '</h2><h5 class="text-muted text-capitalize">' + name + '</h5><small class="text-muted">Click to manage</small></div>';
            return col;
        }

        async function showCollection(collectionName) {
            currentCollection = collectionName;
            hideAllSections();
            document.getElementById('data-view').style.display = 'block';
                         document.getElementById('collection-title').innerHTML = '<i class="fas fa-table me-2"></i>' + collectionName.charAt(0).toUpperCase() + collectionName.slice(1) + ' Management';
            updateActiveNav(collectionName);
            await loadCollectionData(collectionName);
        }

        async function loadCollectionData(collectionName) {
            const loading = document.getElementById('loading');
            const table = document.getElementById('data-table');
            loading.style.display = 'block';
            table.style.display = 'none';
            try {
                                 const response = await fetch(API_BASE + '/api/v1/firestore/collections/' + collectionName + '/documents');
                const data = await response.json();
                if (data.success && data.data.documents?.length > 0) {
                    buildTable(data.data.documents);
                } else {
                    document.getElementById('table-header').innerHTML = '<th>No Data</th>';
                    document.getElementById('table-body').innerHTML = '<tr><td class="text-center p-4">No records found</td></tr>';
                }
            } catch (error) {
                document.getElementById('table-header').innerHTML = '<th>Error</th>';
                document.getElementById('table-body').innerHTML = '<tr><td class="text-center text-danger p-4">Error loading data</td></tr>';
            }
            loading.style.display = 'none';
            table.style.display = 'table';
        }

        function buildTable(documents) {
            const header = document.getElementById('table-header');
            const body = document.getElementById('table-body');
            const allKeys = new Set();
            documents.forEach(doc => Object.keys(doc.data).forEach(key => allKeys.add(key)));
            const keyHeaders = Array.from(allKeys).slice(0, 5);
                         header.innerHTML = '<th>ID</th>' + keyHeaders.map(key => '<th>' + key + '</th>').join('') + '<th width="120">Actions</th>';
            body.innerHTML = documents.map(doc => {
                const cells = keyHeaders.map(key => {
                    let value = doc.data[key];
                    if (typeof value === 'object') value = JSON.stringify(value);
                    if (typeof value === 'string' && value.length > 30) value = value.substring(0, 30) + '...';
                                         return '<td>' + (value || '-') + '</td>';
                 }).join('');
                 const escapedData = JSON.stringify(doc.data).replace(/"/g, '&quot;');
                 return '<tr><td><code>' + doc.id + '</code></td>' + cells + '<td><button class="btn btn-sm btn-primary btn-action" onclick="editItem(\\'' + doc.id + '\\', ' + escapedData + ')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger btn-action" onclick="deleteItemConfirm(\\'' + doc.id + '\\')"><i class="fas fa-trash"></i></button></td></tr>';
            }).join('');
        }

        function editItem(id, data) {
            currentItem = { id, data };
            hideAllSections();
            document.getElementById('edit-form').style.display = 'block';
                         document.getElementById('form-title').innerHTML = '<i class="fas fa-edit me-2"></i>Edit ' + currentCollection + ' - ' + id;
            buildEditForm(data);
        }

        function buildEditForm(data) {
            const container = document.getElementById('form-fields');
            container.innerHTML = Object.keys(data).map(key => {
                let value = data[key];
                if (typeof value === 'object') {
                    value = JSON.stringify(value, null, 2);
                                         return '<div class="mb-3"><label class="form-label"><strong>' + key + '</strong></label><textarea class="form-control" name="' + key + '" rows="3">' + (value || '') + '</textarea></div>';
                 }
                 return '<div class="mb-3"><label class="form-label"><strong>' + key + '</strong></label><input type="text" class="form-control" name="' + key + '" value="' + (value || '') + '" /></div>';
            }).join('');
        }

        document.getElementById('item-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const updateData = {};
            for (let [key, value] of formData.entries()) {
                try { updateData[key] = value.startsWith('{') || value.startsWith('[') ? JSON.parse(value) : value; } catch { updateData[key] = value; }
            }
            try {
                                 const response = await fetch(API_BASE + '/api/v1/firestore/collections/' + currentCollection + '/documents/' + currentItem.id, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData)
                });
                if (response.ok) { alert('✅ Updated successfully!'); showCollection(currentCollection); } else alert('❌ Error updating');
            } catch (error) { alert('❌ Error updating'); }
        });

                 function deleteItemConfirm(id) { if (confirm('Delete ' + id + '? This cannot be undone.')) deleteItemById(id); }

        async function deleteItemById(id) {
            try {
                                 const response = await fetch(API_BASE + '/api/v1/firestore/collections/' + currentCollection + '/documents/' + id, { method: 'DELETE' });
                if (response.ok) { alert('✅ Deleted successfully!'); loadCollectionData(currentCollection); } else alert('❌ Error deleting');
            } catch (error) { alert('❌ Error deleting'); }
        }

                 function deleteItem() { if (confirm('Delete this ' + currentCollection + '? This cannot be undone.')) deleteItemById(currentItem.id); }
        function refreshData() { if (currentCollection) loadCollectionData(currentCollection); }
        function hideAllSections() { document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none'); }
        function updateActiveNav(target) {
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            if (typeof target === 'number') document.querySelectorAll('.nav-link')[target].classList.add('active');
            else document.querySelectorAll('.nav-link').forEach(l => { if (l.textContent.toLowerCase().includes(target)) l.classList.add('active'); });
        }
        function cancelEdit() { showCollection(currentCollection); }
    </script>
</body>
</html>`;
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