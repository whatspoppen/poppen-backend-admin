import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getDb } from '../config/firebase.js';
import { logger, dbLogger } from '../utils/logger.js';
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
 * GET /collections
 * List all root collections
 */
router.get('/collections', asyncHandler(async (req, res) => {
  const db = getDb();
  
  try {
    const collections = await db.listCollections();
    const collectionsList = collections.map(collection => ({
      id: collection.id,
      path: collection.path
    }));
    
    dbLogger.info(`Listed ${collectionsList.length} collections`);
    
    res.json({
      success: true,
      data: {
        collections: collectionsList,
        count: collectionsList.length
      }
    });
  } catch (error) {
    throw createError('Failed to list collections', 500, 'firestore-list-error', error.message);
  }
}));

/**
 * GET /collections/:collectionId/documents
 * List documents in a collection with optional filtering and pagination
 */
router.get('/collections/:collectionId/documents', [
  param('collectionId').notEmpty().withMessage('Collection ID is required'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('orderBy').optional().isString().withMessage('OrderBy must be a string'),
  query('orderDirection').optional().isIn(['asc', 'desc']).withMessage('Order direction must be asc or desc'),
  query('startAfter').optional().isString().withMessage('StartAfter must be a string'),
  query('where').optional().isString().withMessage('Where clause must be a string'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { collectionId } = req.params;
  const { 
    limit = 50, 
    orderBy, 
    orderDirection = 'asc', 
    startAfter, 
    where,
    includeMetadata = false 
  } = req.query;
  
  const db = getDb();
  
  try {
    let query = db.collection(collectionId);
    
    // Apply where clauses
    if (where) {
      try {
        const whereClause = JSON.parse(where);
        if (Array.isArray(whereClause)) {
          whereClause.forEach(condition => {
            const [field, operator, value] = condition;
            query = query.where(field, operator, value);
          });
        }
      } catch (parseError) {
        throw createError('Invalid where clause format', 400, 'invalid-where-clause');
      }
    }
    
    // Apply ordering
    if (orderBy) {
      query = query.orderBy(orderBy, orderDirection);
    }
    
    // Apply pagination
    if (startAfter) {
      const startAfterDoc = await db.collection(collectionId).doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }
    
    query = query.limit(parseInt(limit));
    
    const snapshot = await query.get();
    
    const documents = snapshot.docs.map(doc => {
      const data = {
        id: doc.id,
        data: doc.data()
      };
      
      if (includeMetadata === 'true') {
        data.metadata = {
          createTime: doc.createTime,
          updateTime: doc.updateTime,
          readTime: doc.readTime
        };
      }
      
      return data;
    });
    
    dbLogger.info(`Retrieved ${documents.length} documents from collection ${collectionId}`);
    
    res.json({
      success: true,
      data: {
        documents,
        count: documents.length,
        hasMore: snapshot.size === parseInt(limit),
        collection: collectionId
      }
    });
    
  } catch (error) {
    throw createError(`Failed to list documents in collection ${collectionId}`, 500, 'firestore-query-error', error.message);
  }
}));

/**
 * GET /collections/:collectionId/documents/:documentId
 * Get a specific document
 */
router.get('/collections/:collectionId/documents/:documentId', [
  param('collectionId').notEmpty().withMessage('Collection ID is required'),
  param('documentId').notEmpty().withMessage('Document ID is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { collectionId, documentId } = req.params;
  const { includeMetadata = false } = req.query;
  
  const db = getDb();
  
  try {
    const docRef = db.collection(collectionId).doc(documentId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Document not found',
          code: 'document-not-found',
          collection: collectionId,
          documentId
        }
      });
    }
    
    const responseData = {
      id: doc.id,
      data: doc.data()
    };
    
    if (includeMetadata === 'true') {
      responseData.metadata = {
        createTime: doc.createTime,
        updateTime: doc.updateTime,
        readTime: doc.readTime
      };
    }
    
    dbLogger.info(`Retrieved document ${documentId} from collection ${collectionId}`);
    
    res.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    throw createError(`Failed to get document ${documentId} from collection ${collectionId}`, 500, 'firestore-get-error', error.message);
  }
}));

/**
 * POST /collections/:collectionId/documents
 * Create a new document
 */
router.post('/collections/:collectionId/documents', [
  param('collectionId').notEmpty().withMessage('Collection ID is required'),
  body('data').isObject().withMessage('Document data must be an object'),
  body('id').optional().isString().withMessage('Document ID must be a string'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { collectionId } = req.params;
  const { data, id } = req.body;
  
  const db = getDb();
  const io = req.app.get('io');
  
  try {
    // Add server timestamp
    const documentData = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    let docRef;
    if (id) {
      docRef = db.collection(collectionId).doc(id);
      
      // Check if document already exists
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        return res.status(409).json({
          success: false,
          error: {
            message: 'Document already exists',
            code: 'document-exists',
            collection: collectionId,
            documentId: id
          }
        });
      }
      
      await docRef.set(documentData);
    } else {
      docRef = await db.collection(collectionId).add(documentData);
    }
    
    const newDoc = await docRef.get();
    
    dbLogger.info(`Created document ${docRef.id} in collection ${collectionId}`);
    
    // Emit real-time update
    if (io) {
      io.to(`collection:${collectionId}`).emit('document-created', {
        collection: collectionId,
        documentId: docRef.id,
        data: newDoc.data()
      });
    }
    
    res.status(201).json({
      success: true,
      data: {
        id: docRef.id,
        data: newDoc.data(),
        collection: collectionId
      }
    });
    
  } catch (error) {
    throw createError(`Failed to create document in collection ${collectionId}`, 500, 'firestore-create-error', error.message);
  }
}));

/**
 * PUT /collections/:collectionId/documents/:documentId
 * Update a document (replace entire document)
 */
router.put('/collections/:collectionId/documents/:documentId', [
  param('collectionId').notEmpty().withMessage('Collection ID is required'),
  param('documentId').notEmpty().withMessage('Document ID is required'),
  body('data').isObject().withMessage('Document data must be an object'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { collectionId, documentId } = req.params;
  const { data } = req.body;
  
  const db = getDb();
  const io = req.app.get('io');
  
  try {
    const docRef = db.collection(collectionId).doc(documentId);
    
    // Check if document exists
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Document not found',
          code: 'document-not-found',
          collection: collectionId,
          documentId
        }
      });
    }
    
    // Update document data
    const updatedData = {
      ...data,
      updatedAt: new Date()
    };
    
    await docRef.set(updatedData);
    
    const updatedDoc = await docRef.get();
    
    dbLogger.info(`Updated document ${documentId} in collection ${collectionId}`);
    
    // Emit real-time update
    if (io) {
      io.to(`collection:${collectionId}`).emit('document-updated', {
        collection: collectionId,
        documentId,
        data: updatedDoc.data()
      });
    }
    
    res.json({
      success: true,
      data: {
        id: documentId,
        data: updatedDoc.data(),
        collection: collectionId
      }
    });
    
  } catch (error) {
    throw createError(`Failed to update document ${documentId} in collection ${collectionId}`, 500, 'firestore-update-error', error.message);
  }
}));

/**
 * DELETE /collections/:collectionId/documents/:documentId
 * Delete a document
 */
router.delete('/collections/:collectionId/documents/:documentId', [
  param('collectionId').notEmpty().withMessage('Collection ID is required'),
  param('documentId').notEmpty().withMessage('Document ID is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { collectionId, documentId } = req.params;
  
  const db = getDb();
  const io = req.app.get('io');
  
  try {
    const docRef = db.collection(collectionId).doc(documentId);
    
    // Check if document exists and get its data before deletion
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Document not found',
          code: 'document-not-found',
          collection: collectionId,
          documentId
        }
      });
    }
    
    const documentData = existingDoc.data();
    
    await docRef.delete();
    
    dbLogger.info(`Deleted document ${documentId} from collection ${collectionId}`);
    
    // Emit real-time update
    if (io) {
      io.to(`collection:${collectionId}`).emit('document-deleted', {
        collection: collectionId,
        documentId,
        data: documentData
      });
    }
    
    res.json({
      success: true,
      data: {
        message: 'Document deleted successfully',
        id: documentId,
        collection: collectionId,
        deletedData: documentData
      }
    });
    
  } catch (error) {
    throw createError(`Failed to delete document ${documentId} from collection ${collectionId}`, 500, 'firestore-delete-error', error.message);
  }
}));

/**
 * POST /collections/:collectionId/query
 * Advanced querying with complex conditions
 */
router.post('/collections/:collectionId/query', [
  param('collectionId').notEmpty().withMessage('Collection ID is required'),
  body('conditions').optional().isArray().withMessage('Conditions must be an array'),
  body('orderBy').optional().isArray().withMessage('OrderBy must be an array'),
  body('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  body('startAfter').optional().isString().withMessage('StartAfter must be a string'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { collectionId } = req.params;
  const { conditions = [], orderBy = [], limit = 50, startAfter, includeMetadata = false } = req.body;
  
  const db = getDb();
  
  try {
    let query = db.collection(collectionId);
    
    // Apply where conditions
    conditions.forEach(condition => {
      const [field, operator, value] = condition;
      query = query.where(field, operator, value);
    });
    
    // Apply ordering
    orderBy.forEach(order => {
      const [field, direction = 'asc'] = order;
      query = query.orderBy(field, direction);
    });
    
    // Apply pagination
    if (startAfter) {
      const startAfterDoc = await db.collection(collectionId).doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }
    
    query = query.limit(limit);
    
    const snapshot = await query.get();
    
    const documents = snapshot.docs.map(doc => {
      const data = {
        id: doc.id,
        data: doc.data()
      };
      
      if (includeMetadata) {
        data.metadata = {
          createTime: doc.createTime,
          updateTime: doc.updateTime,
          readTime: doc.readTime
        };
      }
      
      return data;
    });
    
    dbLogger.info(`Advanced query on collection ${collectionId} returned ${documents.length} documents`);
    
    res.json({
      success: true,
      data: {
        documents,
        count: documents.length,
        hasMore: snapshot.size === limit,
        collection: collectionId,
        query: {
          conditions,
          orderBy,
          limit,
          startAfter
        }
      }
    });
    
  } catch (error) {
    throw createError(`Failed to execute query on collection ${collectionId}`, 500, 'firestore-query-error', error.message);
  }
}));

/**
 * POST /batch
 * Batch operations for multiple documents
 */
router.post('/batch', [
  body('operations').isArray().withMessage('Operations must be an array'),
  body('operations.*.type').isIn(['set', 'update', 'delete']).withMessage('Operation type must be set, update, or delete'),
  body('operations.*.collection').notEmpty().withMessage('Collection is required for each operation'),
  body('operations.*.documentId').notEmpty().withMessage('Document ID is required for each operation'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { operations } = req.body;
  
  const db = getDb();
  const batch = db.batch();
  
  try {
    const results = [];
    
    for (const operation of operations) {
      const { type, collection, documentId, data } = operation;
      const docRef = db.collection(collection).doc(documentId);
      
      switch (type) {
        case 'set':
          if (!data) {
            throw createError('Data is required for set operation', 400, 'missing-data');
          }
          batch.set(docRef, {
            ...data,
            updatedAt: new Date()
          });
          results.push({ type, collection, documentId, status: 'queued' });
          break;
          
        case 'update':
          if (!data) {
            throw createError('Data is required for update operation', 400, 'missing-data');
          }
          batch.update(docRef, {
            ...data,
            updatedAt: new Date()
          });
          results.push({ type, collection, documentId, status: 'queued' });
          break;
          
        case 'delete':
          batch.delete(docRef);
          results.push({ type, collection, documentId, status: 'queued' });
          break;
      }
    }
    
    await batch.commit();
    
    // Update status to completed
    results.forEach(result => {
      result.status = 'completed';
    });
    
    dbLogger.info(`Executed batch operation with ${operations.length} operations`);
    
    res.json({
      success: true,
      data: {
        message: 'Batch operation completed successfully',
        operations: results,
        count: results.length
      }
    });
    
  } catch (error) {
    throw createError('Failed to execute batch operation', 500, 'firestore-batch-error', error.message);
  }
}));

/**
 * GET /stats
 * Get database statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const db = getDb();
  
  try {
    const collections = await db.listCollections();
    const stats = {
      collectionsCount: collections.length,
      collections: []
    };
    
    // Get document count for each collection (limited to avoid performance issues)
    for (const collection of collections.slice(0, 10)) { // Limit to first 10 collections
      try {
        const snapshot = await collection.limit(1000).get();
        stats.collections.push({
          id: collection.id,
          path: collection.path,
          documentCount: snapshot.size,
          sampleSize: Math.min(snapshot.size, 1000)
        });
      } catch (collectionError) {
        stats.collections.push({
          id: collection.id,
          path: collection.path,
          documentCount: 'Unable to count',
          error: collectionError.message
        });
      }
    }
    
    if (collections.length > 10) {
      stats.note = `Showing stats for first 10 collections out of ${collections.length}`;
    }
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    throw createError('Failed to get database statistics', 500, 'firestore-stats-error', error.message);
  }
}));

export default router; 