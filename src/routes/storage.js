import express from 'express';
import multer from 'multer';
import { body, param, query, validationResult } from 'express-validator';
import { getStorageInstance } from '../config/firebase.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    // Add file type restrictions if needed
    cb(null, true);
  }
});

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
 * GET /files
 * List files with optional directory filtering
 */
router.get('/files', [
  query('directory').optional().isString().withMessage('Directory must be a string'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('pageToken').optional().isString().withMessage('Page token must be a string'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { directory = '', limit = 100, pageToken } = req.query;
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const options = {
      maxResults: parseInt(limit),
      prefix: directory
    };
    
    if (pageToken) {
      options.pageToken = pageToken;
    }
    
    const [files, , apiResponse] = await bucket.getFiles(options);
    
    const filesList = files.map(file => ({
      name: file.name,
      size: file.metadata.size,
      contentType: file.metadata.contentType,
      bucket: file.bucket.name,
      generation: file.metadata.generation,
      timeCreated: file.metadata.timeCreated,
      updated: file.metadata.updated,
      md5Hash: file.metadata.md5Hash,
      etag: file.metadata.etag
    }));
    
    logger.info(`Listed ${filesList.length} files from storage`);
    
    res.json({
      success: true,
      data: {
        files: filesList,
        count: filesList.length,
        nextPageToken: apiResponse.nextPageToken,
        directory: directory || 'root'
      }
    });
  } catch (error) {
    throw createError('Failed to list files', 500, 'storage-list-error', error.message);
  }
}));

/**
 * GET /files/:filePath/info
 * Get file metadata
 */
router.get('/files/:filePath(*)/info', [
  param('filePath').notEmpty().withMessage('File path is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { filePath } = req.params;
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const file = bucket.file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'File not found',
          code: 'file-not-found',
          filePath
        }
      });
    }
    
    const [metadata] = await file.getMetadata();
    
    // Generate signed URL for download
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000 // 15 minutes
    });
    
    res.json({
      success: true,
      data: {
        name: metadata.name,
        size: metadata.size,
        contentType: metadata.contentType,
        bucket: metadata.bucket,
        generation: metadata.generation,
        timeCreated: metadata.timeCreated,
        updated: metadata.updated,
        md5Hash: metadata.md5Hash,
        etag: metadata.etag,
        downloadUrl,
        customMetadata: metadata.metadata || {}
      }
    });
  } catch (error) {
    throw createError(`Failed to get file info for ${filePath}`, 500, 'storage-info-error', error.message);
  }
}));

/**
 * POST /upload
 * Upload single file
 */
router.post('/upload', upload.single('file'), [
  body('path').optional().isString().withMessage('Path must be a string'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  validateRequest
], asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createError('No file uploaded', 400, 'no-file');
  }
  
  const { path, metadata = {} } = req.body;
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const fileName = path || `uploads/${Date.now()}_${req.file.originalname}`;
    const file = bucket.file(fileName);
    
    const stream = file.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          originalName: req.file.originalname,
          uploadedAt: new Date().toISOString(),
          ...metadata
        }
      }
    });
    
    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.end(req.file.buffer);
    });
    
    // Generate signed URL for download
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });
    
    const [fileMetadata] = await file.getMetadata();
    
    logger.info(`File uploaded: ${fileName}`);
    
    res.status(201).json({
      success: true,
      data: {
        name: fileName,
        size: fileMetadata.size,
        contentType: fileMetadata.contentType,
        bucket: fileMetadata.bucket,
        downloadUrl,
        timeCreated: fileMetadata.timeCreated,
        md5Hash: fileMetadata.md5Hash
      }
    });
  } catch (error) {
    throw createError('Failed to upload file', 500, 'storage-upload-error', error.message);
  }
}));

/**
 * POST /upload-multiple
 * Upload multiple files
 */
router.post('/upload-multiple', upload.array('files', 5), [
  body('directory').optional().isString().withMessage('Directory must be a string'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  validateRequest
], asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw createError('No files uploaded', 400, 'no-files');
  }
  
  const { directory = 'uploads', metadata = {} } = req.body;
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const uploadPromises = req.files.map(async (file) => {
      const fileName = `${directory}/${Date.now()}_${file.originalname}`;
      const bucketFile = bucket.file(fileName);
      
      const stream = bucketFile.createWriteStream({
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
            ...metadata
          }
        }
      });
      
      await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(file.buffer);
      });
      
      const [downloadUrl] = await bucketFile.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      });
      
      const [fileMetadata] = await bucketFile.getMetadata();
      
      return {
        name: fileName,
        originalName: file.originalname,
        size: fileMetadata.size,
        contentType: fileMetadata.contentType,
        downloadUrl,
        timeCreated: fileMetadata.timeCreated
      };
    });
    
    const uploadedFiles = await Promise.all(uploadPromises);
    
    logger.info(`Multiple files uploaded: ${uploadedFiles.length} files`);
    
    res.status(201).json({
      success: true,
      data: {
        files: uploadedFiles,
        count: uploadedFiles.length,
        directory
      }
    });
  } catch (error) {
    throw createError('Failed to upload multiple files', 500, 'storage-upload-multiple-error', error.message);
  }
}));

/**
 * GET /files/:filePath/download
 * Download file
 */
router.get('/files/:filePath(*)/download', [
  param('filePath').notEmpty().withMessage('File path is required'),
  query('expires').optional().isInt({ min: 1 }).withMessage('Expires must be a positive integer'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { filePath } = req.params;
  const { expires = 3600 } = req.query; // Default 1 hour
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const file = bucket.file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'File not found',
          code: 'file-not-found',
          filePath
        }
      });
    }
    
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + (parseInt(expires) * 1000)
    });
    
    res.json({
      success: true,
      data: {
        downloadUrl,
        filePath,
        expiresIn: `${expires} seconds`
      }
    });
  } catch (error) {
    throw createError(`Failed to generate download URL for ${filePath}`, 500, 'storage-download-error', error.message);
  }
}));

/**
 * DELETE /files/:filePath
 * Delete file
 */
router.delete('/files/:filePath(*)', [
  param('filePath').notEmpty().withMessage('File path is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { filePath } = req.params;
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const file = bucket.file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'File not found',
          code: 'file-not-found',
          filePath
        }
      });
    }
    
    await file.delete();
    
    logger.info(`File deleted: ${filePath}`);
    
    res.json({
      success: true,
      data: {
        message: 'File deleted successfully',
        filePath
      }
    });
  } catch (error) {
    throw createError(`Failed to delete file ${filePath}`, 500, 'storage-delete-error', error.message);
  }
}));

/**
 * PUT /files/:filePath/metadata
 * Update file metadata
 */
router.put('/files/:filePath(*)/metadata', [
  param('filePath').notEmpty().withMessage('File path is required'),
  body('metadata').isObject().withMessage('Metadata must be an object'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { filePath } = req.params;
  const { metadata } = req.body;
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const file = bucket.file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'File not found',
          code: 'file-not-found',
          filePath
        }
      });
    }
    
    await file.setMetadata({
      metadata: {
        ...metadata,
        lastModified: new Date().toISOString()
      }
    });
    
    const [updatedMetadata] = await file.getMetadata();
    
    logger.info(`File metadata updated: ${filePath}`);
    
    res.json({
      success: true,
      data: {
        message: 'Metadata updated successfully',
        filePath,
        metadata: updatedMetadata.metadata
      }
    });
  } catch (error) {
    throw createError(`Failed to update metadata for ${filePath}`, 500, 'storage-metadata-error', error.message);
  }
}));

/**
 * POST /files/:filePath/copy
 * Copy file to new location
 */
router.post('/files/:filePath(*)/copy', [
  param('filePath').notEmpty().withMessage('File path is required'),
  body('destination').notEmpty().withMessage('Destination path is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { filePath } = req.params;
  const { destination } = req.body;
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const sourceFile = bucket.file(filePath);
    const destFile = bucket.file(destination);
    
    const [exists] = await sourceFile.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Source file not found',
          code: 'file-not-found',
          filePath
        }
      });
    }
    
    await sourceFile.copy(destFile);
    
    const [destMetadata] = await destFile.getMetadata();
    
    logger.info(`File copied from ${filePath} to ${destination}`);
    
    res.json({
      success: true,
      data: {
        message: 'File copied successfully',
        source: filePath,
        destination,
        size: destMetadata.size,
        contentType: destMetadata.contentType
      }
    });
  } catch (error) {
    throw createError(`Failed to copy file from ${filePath} to ${destination}`, 500, 'storage-copy-error', error.message);
  }
}));

/**
 * GET /storage-info
 * Get storage bucket information
 */
router.get('/storage-info', asyncHandler(async (req, res) => {
  const storage = getStorageInstance();
  
  try {
    const bucket = storage.bucket();
    const [metadata] = await bucket.getMetadata();
    
    // Get some basic statistics
    const [files] = await bucket.getFiles({ maxResults: 1000 });
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => {
      return sum + (parseInt(file.metadata.size) || 0);
    }, 0);
    
    res.json({
      success: true,
      data: {
        bucket: {
          name: metadata.name,
          location: metadata.location,
          storageClass: metadata.storageClass,
          timeCreated: metadata.timeCreated,
          updated: metadata.updated
        },
        statistics: {
          totalFiles: totalFiles >= 1000 ? `${totalFiles}+` : totalFiles,
          totalSize: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`,
          sampleSize: Math.min(totalFiles, 1000)
        }
      }
    });
  } catch (error) {
    throw createError('Failed to get storage information', 500, 'storage-info-error', error.message);
  }
}));

export default router; 