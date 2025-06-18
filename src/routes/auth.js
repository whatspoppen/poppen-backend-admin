import express from 'express';
import { body, param, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getAuthInstance } from '../config/firebase.js';
import { authLogger } from '../utils/logger.js';
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
 * POST /verify-token
 * Verify Firebase ID token
 */
router.post('/verify-token', [
  body('idToken').notEmpty().withMessage('ID token is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  const auth = getAuthInstance();
  
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    
    authLogger.info(`Token verified for user: ${decodedToken.uid}`);
    
    res.json({
      success: true,
      data: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        name: decodedToken.name,
        picture: decodedToken.picture,
        provider: decodedToken.firebase.sign_in_provider,
        claims: decodedToken.firebase.identities
      }
    });
  } catch (error) {
    throw createError('Invalid token', 401, 'invalid-token', error.message);
  }
}));

/**
 * POST /create-user
 * Create a new user
 */
router.post('/create-user', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('displayName').optional().isString().withMessage('Display name must be a string'),
  body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required'),
  body('disabled').optional().isBoolean().withMessage('Disabled must be a boolean'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { email, password, displayName, phoneNumber, disabled = false } = req.body;
  const auth = getAuthInstance();
  
  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      phoneNumber,
      disabled
    });
    
    authLogger.info(`User created: ${userRecord.uid}`);
    
    res.status(201).json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        phoneNumber: userRecord.phoneNumber,
        disabled: userRecord.disabled,
        emailVerified: userRecord.emailVerified,
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime
      }
    });
  } catch (error) {
    throw createError('Failed to create user', 400, 'user-creation-failed', error.message);
  }
}));

/**
 * GET /users/:uid
 * Get user by UID
 */
router.get('/users/:uid', [
  param('uid').notEmpty().withMessage('User UID is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { uid } = req.params;
  const auth = getAuthInstance();
  
  try {
    const userRecord = await auth.getUser(uid);
    
    res.json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        phoneNumber: userRecord.phoneNumber,
        photoURL: userRecord.photoURL,
        disabled: userRecord.disabled,
        emailVerified: userRecord.emailVerified,
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime,
        customClaims: userRecord.customClaims,
        providerData: userRecord.providerData
      }
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw createError('User not found', 404, 'user-not-found');
    }
    throw createError('Failed to get user', 500, 'get-user-failed', error.message);
  }
}));

/**
 * GET /users/email/:email
 * Get user by email
 */
router.get('/users/email/:email', [
  param('email').isEmail().withMessage('Valid email is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { email } = req.params;
  const auth = getAuthInstance();
  
  try {
    const userRecord = await auth.getUserByEmail(email);
    
    res.json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        phoneNumber: userRecord.phoneNumber,
        photoURL: userRecord.photoURL,
        disabled: userRecord.disabled,
        emailVerified: userRecord.emailVerified,
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime,
        customClaims: userRecord.customClaims
      }
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw createError('User not found', 404, 'user-not-found');
    }
    throw createError('Failed to get user by email', 500, 'get-user-failed', error.message);
  }
}));

/**
 * PUT /users/:uid
 * Update user
 */
router.put('/users/:uid', [
  param('uid').notEmpty().withMessage('User UID is required'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('displayName').optional().isString().withMessage('Display name must be a string'),
  body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required'),
  body('disabled').optional().isBoolean().withMessage('Disabled must be a boolean'),
  body('emailVerified').optional().isBoolean().withMessage('Email verified must be a boolean'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { uid } = req.params;
  const updateData = req.body;
  const auth = getAuthInstance();
  
  try {
    const userRecord = await auth.updateUser(uid, updateData);
    
    authLogger.info(`User updated: ${userRecord.uid}`);
    
    res.json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        phoneNumber: userRecord.phoneNumber,
        photoURL: userRecord.photoURL,
        disabled: userRecord.disabled,
        emailVerified: userRecord.emailVerified,
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime
      }
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw createError('User not found', 404, 'user-not-found');
    }
    throw createError('Failed to update user', 500, 'update-user-failed', error.message);
  }
}));

/**
 * DELETE /users/:uid
 * Delete user
 */
router.delete('/users/:uid', [
  param('uid').notEmpty().withMessage('User UID is required'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { uid } = req.params;
  const auth = getAuthInstance();
  
  try {
    await auth.deleteUser(uid);
    
    authLogger.info(`User deleted: ${uid}`);
    
    res.json({
      success: true,
      data: {
        message: 'User deleted successfully',
        uid
      }
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw createError('User not found', 404, 'user-not-found');
    }
    throw createError('Failed to delete user', 500, 'delete-user-failed', error.message);
  }
}));

/**
 * POST /users/:uid/custom-claims
 * Set custom claims for user
 */
router.post('/users/:uid/custom-claims', [
  param('uid').notEmpty().withMessage('User UID is required'),
  body('claims').isObject().withMessage('Claims must be an object'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { uid } = req.params;
  const { claims } = req.body;
  const auth = getAuthInstance();
  
  try {
    await auth.setCustomUserClaims(uid, claims);
    
    authLogger.info(`Custom claims set for user: ${uid}`);
    
    res.json({
      success: true,
      data: {
        message: 'Custom claims set successfully',
        uid,
        claims
      }
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw createError('User not found', 404, 'user-not-found');
    }
    throw createError('Failed to set custom claims', 500, 'set-claims-failed', error.message);
  }
}));

/**
 * GET /users
 * List users with pagination
 */
router.get('/users', asyncHandler(async (req, res) => {
  const { maxResults = 100, pageToken } = req.query;
  const auth = getAuthInstance();
  
  try {
    const listUsersResult = await auth.listUsers(maxResults, pageToken);
    
    const users = listUsersResult.users.map(userRecord => ({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      phoneNumber: userRecord.phoneNumber,
      disabled: userRecord.disabled,
      emailVerified: userRecord.emailVerified,
      creationTime: userRecord.metadata.creationTime,
      lastSignInTime: userRecord.metadata.lastSignInTime
    }));
    
    res.json({
      success: true,
      data: {
        users,
        count: users.length,
        pageToken: listUsersResult.pageToken
      }
    });
  } catch (error) {
    throw createError('Failed to list users', 500, 'list-users-failed', error.message);
  }
}));

/**
 * POST /generate-token
 * Generate custom token for user
 */
router.post('/generate-token', [
  body('uid').notEmpty().withMessage('User UID is required'),
  body('additionalClaims').optional().isObject().withMessage('Additional claims must be an object'),
  validateRequest
], asyncHandler(async (req, res) => {
  const { uid, additionalClaims } = req.body;
  const auth = getAuthInstance();
  
  try {
    const customToken = await auth.createCustomToken(uid, additionalClaims);
    
    authLogger.info(`Custom token generated for user: ${uid}`);
    
    res.json({
      success: true,
      data: {
        customToken,
        uid,
        expiresIn: '1h'
      }
    });
  } catch (error) {
    throw createError('Failed to generate custom token', 500, 'token-generation-failed', error.message);
  }
}));

export default router; 