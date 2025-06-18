import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger, mcpLogger } from '../utils/logger.js';
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
 * GET /info
 * Get MCP server information and capabilities
 */
router.get('/info', asyncHandler(async (req, res) => {
  const mcpInfo = {
    name: 'Firebase Admin MCP Server',
    version: '1.0.0',
    description: 'Model Context Protocol server providing Firebase Admin SDK capabilities',
    protocol: {
      version: '0.5.0',
      transport: process.env.MCP_TRANSPORT || 'stdio'
    },
    capabilities: {
      tools: [
        {
          name: 'firestore_list_collections',
          description: 'List all Firestore collections',
          schema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'firestore_add_document',
          description: 'Add a document to a Firestore collection',
          schema: {
            type: 'object',
            properties: {
              collection: { type: 'string', description: 'Collection name' },
              data: { type: 'object', description: 'Document data' },
              id: { type: 'string', description: 'Optional document ID' }
            },
            required: ['collection', 'data']
          }
        },
        {
          name: 'firestore_get_document',
          description: 'Get a document from Firestore',
          schema: {
            type: 'object',
            properties: {
              collection: { type: 'string', description: 'Collection name' },
              id: { type: 'string', description: 'Document ID' }
            },
            required: ['collection', 'id']
          }
        },
        {
          name: 'firestore_update_document',
          description: 'Update a document in Firestore',
          schema: {
            type: 'object',
            properties: {
              collection: { type: 'string', description: 'Collection name' },
              id: { type: 'string', description: 'Document ID' },
              data: { type: 'object', description: 'Update data' }
            },
            required: ['collection', 'id', 'data']
          }
        },
        {
          name: 'firestore_delete_document',
          description: 'Delete a document from Firestore',
          schema: {
            type: 'object',
            properties: {
              collection: { type: 'string', description: 'Collection name' },
              id: { type: 'string', description: 'Document ID' }
            },
            required: ['collection', 'id']
          }
        },
        {
          name: 'firestore_query_collection',
          description: 'Query documents in a collection',
          schema: {
            type: 'object',
            properties: {
              collection: { type: 'string', description: 'Collection name' },
              conditions: { type: 'array', description: 'Query conditions' },
              limit: { type: 'number', description: 'Limit results' },
              orderBy: { type: 'array', description: 'Order by fields' }
            },
            required: ['collection']
          }
        },
        {
          name: 'storage_list_files',
          description: 'List files in Firebase Storage',
          schema: {
            type: 'object',
            properties: {
              directory: { type: 'string', description: 'Directory path' },
              limit: { type: 'number', description: 'Limit results' }
            }
          }
        },
        {
          name: 'storage_get_file_info',
          description: 'Get file information from Firebase Storage',
          schema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'File path' }
            },
            required: ['filePath']
          }
        },
        {
          name: 'storage_upload_file',
          description: 'Upload a file to Firebase Storage',
          schema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Target file path' },
              content: { type: 'string', description: 'File content (base64)' },
              contentType: { type: 'string', description: 'MIME type' }
            },
            required: ['filePath', 'content']
          }
        },
        {
          name: 'auth_get_user',
          description: 'Get user information',
          schema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'User ID or email' }
            },
            required: ['identifier']
          }
        },
        {
          name: 'auth_list_users',
          description: 'List all users',
          schema: {
            type: 'object',
            properties: {
              maxResults: { type: 'number', description: 'Maximum results' },
              pageToken: { type: 'string', description: 'Pagination token' }
            }
          }
        }
      ],
      resources: [
        {
          name: 'firebase_project_info',
          description: 'Firebase project information and configuration'
        },
        {
          name: 'firestore_schema',
          description: 'Firestore collections and document structure'
        },
        {
          name: 'storage_info',
          description: 'Firebase Storage bucket information'
        }
      ],
      prompts: [
        {
          name: 'firestore_crud_example',
          description: 'Example CRUD operations for Firestore'
        },
        {
          name: 'firebase_best_practices',
          description: 'Firebase development best practices'
        }
      ]
    },
    endpoints: {
      tools: '/api/v1/mcp/tools',
      resources: '/api/v1/mcp/resources',
      prompts: '/api/v1/mcp/prompts'
    },
    timestamp: new Date().toISOString()
  };

  res.json({
    success: true,
    data: mcpInfo
  });
}));

/**
 * POST /tools/:toolName
 * Execute an MCP tool
 */
router.post('/tools/:toolName', [
  param('toolName').notEmpty().withMessage('Tool name is required'),
  body('arguments').optional().isObject().withMessage('Arguments must be an object'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { arguments: toolArgs = {} } = req.body;

  mcpLogger.info(`Executing MCP tool: ${toolName}`, { arguments: toolArgs });

  try {
    let result;

    switch (toolName) {
      case 'firestore_list_collections':
        result = await executeFirestoreListCollections();
        break;
      
      case 'firestore_add_document':
        result = await executeFirestoreAddDocument(toolArgs);
        break;
      
      case 'firestore_get_document':
        result = await executeFirestoreGetDocument(toolArgs);
        break;
      
      case 'firestore_update_document':
        result = await executeFirestoreUpdateDocument(toolArgs);
        break;
      
      case 'firestore_delete_document':
        result = await executeFirestoreDeleteDocument(toolArgs);
        break;
      
      case 'firestore_query_collection':
        result = await executeFirestoreQueryCollection(toolArgs);
        break;
      
      case 'storage_list_files':
        result = await executeStorageListFiles(toolArgs);
        break;
      
      case 'storage_get_file_info':
        result = await executeStorageGetFileInfo(toolArgs);
        break;
      
      case 'auth_get_user':
        result = await executeAuthGetUser(toolArgs);
        break;
      
      case 'auth_list_users':
        result = await executeAuthListUsers(toolArgs);
        break;
      
      default:
        throw createError(`Tool '${toolName}' not found`, 404, 'tool-not-found');
    }

    res.json({
      success: true,
      data: {
        tool: toolName,
        result,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    mcpLogger.error(`MCP tool execution failed: ${toolName}`, { error: error.message, arguments: toolArgs });
    throw createError(`Tool execution failed: ${error.message}`, 500, 'tool-execution-error', error.message);
  }
}));

/**
 * GET /resources/:resourceName
 * Get an MCP resource
 */
router.get('/resources/:resourceName', [
  param('resourceName').notEmpty().withMessage('Resource name is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { resourceName } = req.params;

  mcpLogger.info(`Fetching MCP resource: ${resourceName}`);

  try {
    let resource;

    switch (resourceName) {
      case 'firebase_project_info':
        resource = await getFirebaseProjectInfoResource();
        break;
      
      case 'firestore_schema':
        resource = await getFirestoreSchemaResource();
        break;
      
      case 'storage_info':
        resource = await getStorageInfoResource();
        break;
      
      default:
        throw createError(`Resource '${resourceName}' not found`, 404, 'resource-not-found');
    }

    res.json({
      success: true,
      data: {
        resource: resourceName,
        content: resource,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    mcpLogger.error(`MCP resource fetch failed: ${resourceName}`, { error: error.message });
    throw createError(`Resource fetch failed: ${error.message}`, 500, 'resource-fetch-error', error.message);
  }
}));

/**
 * GET /prompts/:promptName
 * Get an MCP prompt
 */
router.get('/prompts/:promptName', [
  param('promptName').notEmpty().withMessage('Prompt name is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { promptName } = req.params;

  mcpLogger.info(`Fetching MCP prompt: ${promptName}`);

  try {
    let prompt;

    switch (promptName) {
      case 'firestore_crud_example':
        prompt = getFirestoreCrudExamplePrompt();
        break;
      
      case 'firebase_best_practices':
        prompt = getFirebaseBestPracticesPrompt();
        break;
      
      default:
        throw createError(`Prompt '${promptName}' not found`, 404, 'prompt-not-found');
    }

    res.json({
      success: true,
      data: {
        prompt: promptName,
        content: prompt,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    mcpLogger.error(`MCP prompt fetch failed: ${promptName}`, { error: error.message });
    throw createError(`Prompt fetch failed: ${error.message}`, 500, 'prompt-fetch-error', error.message);
  }
}));

// Helper functions for MCP tool execution
async function executeFirestoreListCollections() {
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();
  const collections = await db.listCollections();
  return {
    collections: collections.map(col => ({ id: col.id, path: col.path })),
    count: collections.length
  };
}

async function executeFirestoreAddDocument(args) {
  const { collection, data, id } = args;
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();
  
  let docRef;
  if (id) {
    docRef = db.collection(collection).doc(id);
    await docRef.set({ ...data, createdAt: new Date(), updatedAt: new Date() });
  } else {
    docRef = await db.collection(collection).add({ ...data, createdAt: new Date(), updatedAt: new Date() });
  }
  
  const newDoc = await docRef.get();
  return {
    id: docRef.id,
    data: newDoc.data(),
    collection
  };
}

async function executeFirestoreGetDocument(args) {
  const { collection, id } = args;
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();
  
  const doc = await db.collection(collection).doc(id).get();
  if (!doc.exists) {
    throw new Error('Document not found');
  }
  
  return {
    id: doc.id,
    data: doc.data(),
    collection
  };
}

async function executeFirestoreUpdateDocument(args) {
  const { collection, id, data } = args;
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();
  
  const docRef = db.collection(collection).doc(id);
  await docRef.update({ ...data, updatedAt: new Date() });
  
  const updatedDoc = await docRef.get();
  return {
    id: updatedDoc.id,
    data: updatedDoc.data(),
    collection
  };
}

async function executeFirestoreDeleteDocument(args) {
  const { collection, id } = args;
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();
  
  await db.collection(collection).doc(id).delete();
  return {
    message: 'Document deleted successfully',
    id,
    collection
  };
}

async function executeFirestoreQueryCollection(args) {
  const { collection, conditions = [], limit = 50, orderBy = [] } = args;
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();
  
  let query = db.collection(collection);
  
  conditions.forEach(condition => {
    const [field, operator, value] = condition;
    query = query.where(field, operator, value);
  });
  
  orderBy.forEach(order => {
    const [field, direction = 'asc'] = order;
    query = query.orderBy(field, direction);
  });
  
  query = query.limit(limit);
  
  const snapshot = await query.get();
  const documents = snapshot.docs.map(doc => ({
    id: doc.id,
    data: doc.data()
  }));
  
  return {
    documents,
    count: documents.length,
    collection
  };
}

async function executeStorageListFiles(args) {
  const { directory = '', limit = 100 } = args;
  const { getStorageInstance } = await import('../config/firebase.js');
  const storage = getStorageInstance();
  
  const bucket = storage.bucket();
  const [files] = await bucket.getFiles({
    maxResults: limit,
    prefix: directory
  });
  
  return {
    files: files.map(file => ({
      name: file.name,
      size: file.metadata.size,
      contentType: file.metadata.contentType,
      timeCreated: file.metadata.timeCreated,
      updated: file.metadata.updated
    })),
    count: files.length,
    directory: directory || 'root'
  };
}

async function executeStorageGetFileInfo(args) {
  const { filePath } = args;
  const { getStorageInstance } = await import('../config/firebase.js');
  const storage = getStorageInstance();
  
  const bucket = storage.bucket();
  const file = bucket.file(filePath);
  
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('File not found');
  }
  
  const [metadata] = await file.getMetadata();
  
  return {
    name: metadata.name,
    size: metadata.size,
    contentType: metadata.contentType,
    timeCreated: metadata.timeCreated,
    updated: metadata.updated,
    md5Hash: metadata.md5Hash
  };
}

async function executeAuthGetUser(args) {
  const { identifier } = args;
  const { getAuthInstance } = await import('../config/firebase.js');
  const auth = getAuthInstance();
  
  let userRecord;
  if (identifier.includes('@')) {
    userRecord = await auth.getUserByEmail(identifier);
  } else {
    userRecord = await auth.getUser(identifier);
  }
  
  return {
    uid: userRecord.uid,
    email: userRecord.email,
    displayName: userRecord.displayName,
    disabled: userRecord.disabled,
    emailVerified: userRecord.emailVerified,
    creationTime: userRecord.metadata.creationTime,
    lastSignInTime: userRecord.metadata.lastSignInTime
  };
}

async function executeAuthListUsers(args) {
  const { maxResults = 100, pageToken } = args;
  const { getAuthInstance } = await import('../config/firebase.js');
  const auth = getAuthInstance();
  
  const listUsersResult = await auth.listUsers(maxResults, pageToken);
  
  return {
    users: listUsersResult.users.map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      disabled: user.disabled,
      emailVerified: user.emailVerified,
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime
    })),
    count: listUsersResult.users.length,
    pageToken: listUsersResult.pageToken
  };
}

// Helper functions for MCP resources
async function getFirebaseProjectInfoResource() {
  const { getProjectInfo } = await import('../config/firebase.js');
  return await getProjectInfo();
}

async function getFirestoreSchemaResource() {
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();
  const collections = await db.listCollections();
  
  const schema = await Promise.all(
    collections.slice(0, 10).map(async (collection) => {
      try {
        const snapshot = await collection.limit(3).get();
        const sampleDocs = snapshot.docs.map(doc => doc.data());
        
        return {
          id: collection.id,
          path: collection.path,
          sampleStructure: sampleDocs.length > 0 ? Object.keys(sampleDocs[0]) : [],
          documentCount: snapshot.size
        };
      } catch (error) {
        return {
          id: collection.id,
          path: collection.path,
          error: error.message
        };
      }
    })
  );
  
  return { collections: schema };
}

async function getStorageInfoResource() {
  const { getStorageInstance } = await import('../config/firebase.js');
  const storage = getStorageInstance();
  const bucket = storage.bucket();
  
  const [metadata] = await bucket.getMetadata();
  const [files] = await bucket.getFiles({ maxResults: 100 });
  
  return {
    bucket: {
      name: metadata.name,
      location: metadata.location,
      storageClass: metadata.storageClass
    },
    statistics: {
      fileCount: files.length >= 100 ? `${files.length}+` : files.length,
      sampleFiles: files.slice(0, 5).map(file => ({
        name: file.name,
        size: file.metadata.size,
        contentType: file.metadata.contentType
      }))
    }
  };
}

// Helper functions for MCP prompts
function getFirestoreCrudExamplePrompt() {
  return {
    title: 'Firestore CRUD Operations Example',
    content: `
Here are examples of how to perform CRUD operations on Firestore using the MCP tools:

## Create a Document
\`\`\`
Tool: firestore_add_document
Arguments: {
  "collection": "users",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30
  }
}
\`\`\`

## Read a Document
\`\`\`
Tool: firestore_get_document
Arguments: {
  "collection": "users",
  "id": "user123"
}
\`\`\`

## Update a Document
\`\`\`
Tool: firestore_update_document
Arguments: {
  "collection": "users",
  "id": "user123",
  "data": {
    "age": 31,
    "lastUpdated": "2024-01-01"
  }
}
\`\`\`

## Delete a Document
\`\`\`
Tool: firestore_delete_document
Arguments: {
  "collection": "users",
  "id": "user123"
}
\`\`\`

## Query Documents
\`\`\`
Tool: firestore_query_collection
Arguments: {
  "collection": "users",
  "conditions": [["age", ">=", 18]],
  "orderBy": [["name", "asc"]],
  "limit": 10
}
\`\`\`
    `,
    examples: [
      'Creating user profiles',
      'Managing product catalogs',
      'Handling blog posts and comments',
      'User activity tracking'
    ]
  };
}

function getFirebaseBestPracticesPrompt() {
  return {
    title: 'Firebase Development Best Practices',
    content: `
# Firebase Best Practices

## Security Rules
- Always implement proper security rules for Firestore and Storage
- Use authentication-based rules: \`allow read, write: if request.auth != null;\`
- Validate data structure and types in security rules

## Data Structure
- Design collections and documents thoughtfully
- Avoid deeply nested data structures (max 100 levels)
- Use subcollections for related data that grows unbounded
- Implement consistent naming conventions

## Performance
- Use indexes for queries (composite indexes for multiple fields)
- Limit query results with .limit()
- Use pagination for large datasets
- Cache frequently accessed data

## Cost Optimization
- Monitor read/write operations
- Use batch operations when possible
- Implement efficient querying patterns
- Consider data archival strategies

## Error Handling
- Implement proper error handling for all Firebase operations
- Use exponential backoff for retries
- Log errors appropriately for debugging

## Real-time Features
- Use Firestore real-time listeners judiciously
- Detach listeners when components unmount
- Consider using onSnapshot() for live updates
    `,
    tips: [
      'Use Firebase Console for monitoring',
      'Implement proper offline handling',
      'Test with Firebase Emulator Suite',
      'Use Cloud Functions for server-side logic'
    ]
  };
}

export default router; 