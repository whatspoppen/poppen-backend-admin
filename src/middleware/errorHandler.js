import { logger } from '../utils/logger.js';

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

/**
 * Firebase error codes mapping
 */
const FIREBASE_ERROR_CODES = {
  'auth/user-not-found': { status: 404, message: 'User not found' },
  'auth/email-already-exists': { status: 409, message: 'Email already exists' },
  'auth/invalid-email': { status: 400, message: 'Invalid email format' },
  'auth/weak-password': { status: 400, message: 'Password is too weak' },
  'auth/user-disabled': { status: 403, message: 'User account is disabled' },
  'auth/too-many-requests': { status: 429, message: 'Too many requests' },
  'auth/operation-not-allowed': { status: 403, message: 'Operation not allowed' },
  'permission-denied': { status: 403, message: 'Permission denied' },
  'not-found': { status: 404, message: 'Document not found' },
  'already-exists': { status: 409, message: 'Document already exists' },
  'failed-precondition': { status: 412, message: 'Failed precondition' },
  'out-of-range': { status: 400, message: 'Value out of range' },
  'unimplemented': { status: 501, message: 'Operation not implemented' },
  'internal': { status: 500, message: 'Internal server error' },
  'unavailable': { status: 503, message: 'Service temporarily unavailable' },
  'deadline-exceeded': { status: 504, message: 'Request timeout' },
  'unauthenticated': { status: 401, message: 'Authentication required' }
};

/**
 * Format Firebase error
 */
function formatFirebaseError(error) {
  const errorCode = error.code || error.errorInfo?.code;
  const errorMapping = FIREBASE_ERROR_CODES[errorCode];
  
  if (errorMapping) {
    return new APIError(
      errorMapping.message,
      errorMapping.status,
      errorCode,
      error.message
    );
  }
  
  // Default Firebase error handling
  return new APIError(
    error.message || 'Firebase operation failed',
    500,
    errorCode || 'firebase-error',
    error.stack
  );
}

/**
 * Format validation error
 */
function formatValidationError(error) {
  if (error.array && typeof error.array === 'function') {
    // Express-validator error
    const errors = error.array();
    return new APIError(
      'Validation failed',
      400,
      'validation-error',
      {
        errors: errors.map(err => ({
          field: err.param || err.path,
          message: err.msg,
          value: err.value
        }))
      }
    );
  }
  
  return new APIError(
    error.message || 'Validation failed',
    400,
    'validation-error'
  );
}

/**
 * Format MongoDB error
 */
function formatMongoError(error) {
  switch (error.code) {
    case 11000:
      return new APIError('Duplicate field value', 409, 'duplicate-key');
    case 11001:
      return new APIError('Duplicate key error', 409, 'duplicate-key');
    default:
      return new APIError(
        error.message || 'Database operation failed',
        500,
        'database-error'
      );
  }
}

/**
 * Format JWT error
 */
function formatJWTError(error) {
  const jwtErrors = {
    'JsonWebTokenError': { status: 401, message: 'Invalid token' },
    'TokenExpiredError': { status: 401, message: 'Token expired' },
    'NotBeforeError': { status: 401, message: 'Token not active yet' }
  };
  
  const errorMapping = jwtErrors[error.name];
  if (errorMapping) {
    return new APIError(
      errorMapping.message,
      errorMapping.status,
      'jwt-error'
    );
  }
  
  return new APIError('Authentication failed', 401, 'auth-error');
}

/**
 * Format Multer error
 */
function formatMulterError(error) {
  const multerErrors = {
    'LIMIT_FILE_SIZE': { status: 413, message: 'File too large' },
    'LIMIT_FILE_COUNT': { status: 413, message: 'Too many files' },
    'LIMIT_FIELD_KEY': { status: 400, message: 'Field name too long' },
    'LIMIT_FIELD_VALUE': { status: 400, message: 'Field value too long' },
    'LIMIT_FIELD_COUNT': { status: 400, message: 'Too many fields' },
    'LIMIT_UNEXPECTED_FILE': { status: 400, message: 'Unexpected file field' }
  };
  
  const errorMapping = multerErrors[error.code];
  if (errorMapping) {
    return new APIError(
      errorMapping.message,
      errorMapping.status,
      'file-upload-error'
    );
  }
  
  return new APIError('File upload failed', 400, 'file-upload-error');
}

/**
 * Main error handler middleware
 */
export function errorHandler(error, req, res, next) {
  let formattedError = error;
  
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(error);
  }
  
  // Format different types of errors
  if (!error.isOperational) {
    if (error.code && error.code.startsWith('auth/')) {
      formattedError = formatFirebaseError(error);
    } else if (error.name === 'FirebaseError' || error.code) {
      formattedError = formatFirebaseError(error);
    } else if (error.name === 'ValidationError' || error.array) {
      formattedError = formatValidationError(error);
    } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      formattedError = formatMongoError(error);
    } else if (error.name && error.name.includes('JsonWebToken')) {
      formattedError = formatJWTError(error);
    } else if (error.code && error.code.startsWith('LIMIT_')) {
      formattedError = formatMulterError(error);
    } else if (error.name === 'CastError') {
      formattedError = new APIError('Invalid ID format', 400, 'invalid-id');
    } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
      formattedError = new APIError('Invalid JSON format', 400, 'invalid-json');
    } else {
      // Generic server error
      formattedError = new APIError(
        process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        500,
        'internal-server-error',
        process.env.NODE_ENV !== 'production' ? error.stack : undefined
      );
    }
  }
  
  // Log error
  const logContext = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.uid,
    statusCode: formattedError.statusCode || 500,
    errorCode: formattedError.code,
    stack: error.stack
  };
  
  if (formattedError.statusCode >= 500) {
    logger.error('Server Error:', {
      message: formattedError.message,
      ...logContext
    });
  } else {
    logger.warn('Client Error:', {
      message: formattedError.message,
      ...logContext
    });
  }
  
  // Prepare response
  const response = {
    error: {
      message: formattedError.message,
      code: formattedError.code,
      statusCode: formattedError.statusCode || 500,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    }
  };
  
  // Add error details in development mode
  if (process.env.NODE_ENV !== 'production' && formattedError.details) {
    response.error.details = formattedError.details;
  }
  
  // Add stack trace in development mode
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    response.error.stack = error.stack;
  }
  
  // Send error response
  res.status(formattedError.statusCode || 500).json(response);
}

/**
 * 404 handler middleware
 */
export function notFoundHandler(req, res, next) {
  const error = new APIError(
    `Route ${req.method} ${req.originalUrl} not found`,
    404,
    'route-not-found'
  );
  next(error);
}

/**
 * Async error wrapper
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create custom error
 */
export function createError(message, statusCode = 500, code = null, details = null) {
  return new APIError(message, statusCode, code, details);
}

export default errorHandler; 