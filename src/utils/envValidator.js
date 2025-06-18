import { logger } from './logger.js';

/**
 * Validate required environment variables
 */
export function validateEnvVars() {
  const errors = [];
  const warnings = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
  if (majorVersion < 18) {
    errors.push(`Node.js version ${nodeVersion} is not supported. Please use Node.js 18 or higher.`);
  }

  // Firebase configuration validation
  const hasServiceAccountPath = !!process.env.SERVICE_ACCOUNT_KEY_PATH;
  const hasEnvVars = !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_CLIENT_EMAIL
  );

  if (!hasServiceAccountPath && !hasEnvVars) {
    errors.push(
      'Firebase configuration missing. Please provide either:\n' +
      '  1. SERVICE_ACCOUNT_KEY_PATH pointing to your service account JSON file, OR\n' +
      '  2. Individual environment variables: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL'
    );
  }

  // Firebase Storage bucket validation
  if (!process.env.FIREBASE_STORAGE_BUCKET) {
    warnings.push('FIREBASE_STORAGE_BUCKET not set. Storage operations may not work properly.');
  }

  // JWT Secret validation
  if (!process.env.JWT_SECRET) {
    warnings.push('JWT_SECRET not set. Authentication features may not work properly.');
  } else if (process.env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET is too short. Use at least 32 characters for security.');
  }

  // Server configuration validation
  const port = parseInt(process.env.PORT);
  if (port && (port < 1024 || port > 65535)) {
    warnings.push(`PORT ${port} may not be accessible. Consider using a port between 3000-8000 for development.`);
  }

  // CORS configuration validation
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    warnings.push('CORS_ORIGIN not set in production. This may cause CORS issues.');
  }

  // Rate limiting validation
  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS);
  if (rateLimitMax && rateLimitMax < 10) {
    warnings.push('RATE_LIMIT_MAX_REQUESTS is very low. This may affect normal usage.');
  }

  // MCP configuration validation
  const mcpTransport = process.env.MCP_TRANSPORT;
  if (mcpTransport && !['stdio', 'http'].includes(mcpTransport)) {
    warnings.push(`MCP_TRANSPORT '${mcpTransport}' is not supported. Use 'stdio' or 'http'.`);
  }

  if (mcpTransport === 'http') {
    const mcpPort = parseInt(process.env.MCP_HTTP_PORT);
    const serverPort = parseInt(process.env.PORT) || 3000;
    
    if (mcpPort === serverPort) {
      errors.push('MCP_HTTP_PORT cannot be the same as the main server PORT.');
    }
  }

  // Security validation for production
  if (process.env.NODE_ENV === 'production') {
    const securityChecks = [
      { var: 'JWT_SECRET', message: 'JWT_SECRET is required in production' },
      { var: 'BCRYPT_ROUNDS', message: 'BCRYPT_ROUNDS should be set for production (recommended: 12)' },
      { var: 'SESSION_SECRET', message: 'SESSION_SECRET is required in production' }
    ];

    securityChecks.forEach(check => {
      if (!process.env[check.var]) {
        warnings.push(check.message);
      }
    });

    if (process.env.DEBUG_MODE === 'true') {
      warnings.push('DEBUG_MODE is enabled in production. This may expose sensitive information.');
    }
  }

  // Log results
  if (warnings.length > 0) {
    logger.warn('Environment Configuration Warnings:');
    warnings.forEach(warning => logger.warn(`  - ${warning}`));
  }

  if (errors.length > 0) {
    logger.error('Environment Configuration Errors:');
    errors.forEach(error => logger.error(`  - ${error}`));
    throw new Error(`Environment validation failed. Please fix the above errors before starting the server.`);
  }

  // Log successful validation
  logger.info('Environment validation completed successfully');
  
  // Log current configuration (without secrets)
  logCurrentConfig();
}

/**
 * Log current configuration (without exposing secrets)
 */
function logCurrentConfig() {
  const config = {
    node_version: process.version,
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    firebase_project: process.env.FIREBASE_PROJECT_ID || 'not set',
    firebase_storage_bucket: process.env.FIREBASE_STORAGE_BUCKET || 'not set',
    mcp_transport: process.env.MCP_TRANSPORT || 'stdio',
    mcp_http_port: process.env.MCP_HTTP_PORT || 'not set',
    log_level: process.env.LOG_LEVEL || 'info',
    debug_mode: process.env.DEBUG_MODE === 'true',
    cors_configured: !!process.env.CORS_ORIGIN,
    jwt_configured: !!process.env.JWT_SECRET,
    rate_limiting: {
      window_ms: process.env.RATE_LIMIT_WINDOW_MS || 900000,
      max_requests: process.env.RATE_LIMIT_MAX_REQUESTS || 100
    }
  };

  logger.info('Current Configuration:', config);
}

/**
 * Get required environment variables for documentation
 */
export function getRequiredEnvVars() {
  return {
    required: [
      {
        name: 'FIREBASE_PROJECT_ID',
        description: 'Your Firebase project ID',
        example: 'my-firebase-project'
      },
      {
        name: 'FIREBASE_PRIVATE_KEY',
        description: 'Firebase service account private key',
        example: '"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"'
      },
      {
        name: 'FIREBASE_CLIENT_EMAIL',
        description: 'Firebase service account client email',
        example: 'firebase-adminsdk-xxxxx@my-project.iam.gserviceaccount.com'
      }
    ],
    optional: [
      {
        name: 'SERVICE_ACCOUNT_KEY_PATH',
        description: 'Path to Firebase service account JSON file (alternative to individual env vars)',
        example: '/path/to/serviceAccountKey.json'
      },
      {
        name: 'FIREBASE_STORAGE_BUCKET',
        description: 'Firebase Storage bucket name',
        example: 'my-project.appspot.com'
      },
      {
        name: 'PORT',
        description: 'Server port',
        example: '3000'
      },
      {
        name: 'JWT_SECRET',
        description: 'Secret key for JWT token signing',
        example: 'your-super-secret-jwt-key-with-at-least-32-characters'
      },
      {
        name: 'NODE_ENV',
        description: 'Application environment',
        example: 'development'
      }
    ]
  };
}

export default validateEnvVars; 