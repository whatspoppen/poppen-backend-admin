# 🚀 Quick Start - Deploy Firebase Backend Admin

## Prerequisites
- Node.js 18+ installed
- Firebase project created
- Git repository (for deployment)

## 📋 Step-by-Step Deployment

### 1. **Setup Environment**
```bash
# Run the interactive setup
npm run setup

# Or manually copy and edit
cp env.example .env
# Edit .env with your Firebase credentials
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Test Locally**
```bash
# Start development server
npm run dev

# Test in another terminal
curl http://localhost:3000/api/v1/health
```

### 4. **Choose Deployment Platform**

#### 🏆 **Option 1: Google Cloud Platform (Recommended)**
Best for Firebase integration, automatic scaling, monitoring.

```bash
# Install Google Cloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Update app.yaml with your environment variables
# Deploy
npm run deploy:gcp
```

#### 🚢 **Option 2: Railway (Easiest)**
Zero-config deployment, great developer experience.

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### 🔷 **Option 3: Render (Free Tier)**
Good for testing, has free tier, automatic SSL.

1. Connect GitHub repo to Render
2. Use `render.yaml` configuration
3. Set environment variables in dashboard
4. Auto-deploy on push

#### 🟣 **Option 4: Heroku**
Traditional platform, easy to use.

```bash
# Install Heroku CLI
npm install -g heroku

# Create app and deploy
heroku create your-app-name
# Set environment variables in Heroku dashboard
git push heroku main
```

### 5. **One-Command Deployment**
```bash
# Interactive deployment script
npm run deploy

# Or specific platform
npm run deploy:gcp
npm run deploy:railway
npm run deploy:heroku
```

## 🔧 Environment Variables Setup

### Required Variables (Production)
```bash
# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

# Server
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

# Security
JWT_SECRET=your-super-secure-random-jwt-secret
CORS_ORIGIN=https://yourdomain.com

# Disable development features
DEBUG_MODE=false
ENABLE_SWAGGER=false
```

## 🎯 Platform-Specific Instructions

### Google Cloud Platform
1. Update `app.yaml` with your environment variables
2. Enable App Engine API in GCP Console
3. Deploy: `gcloud app deploy`

### Railway
1. Connect GitHub repository
2. Environment variables auto-imported from `.env`
3. Deploy: `railway up`

### Render
1. Connect GitHub in Render dashboard
2. Set environment variables in dashboard
3. Auto-deploy on git push

### Heroku
1. Set environment variables in Heroku dashboard
2. Deploy: `git push heroku main`

## 🔒 Security Checklist

- [ ] Use environment variables for all secrets
- [ ] Set strong JWT secret (32+ random characters)
- [ ] Configure proper CORS origins
- [ ] Enable HTTPS only in production
- [ ] Set up Firebase security rules
- [ ] Enable rate limiting
- [ ] Use strong admin passwords

## 📊 Post-Deployment

### Test Your API
```bash
# Health check
curl https://your-app-url.com/api/v1/health

# Admin dashboard
curl https://your-app-url.com/api/v1/admin/dashboard

# Firestore test
curl https://your-app-url.com/api/v1/firestore/collections
```

### Monitoring
- Check logs in your platform dashboard
- Monitor Firebase usage and billing
- Set up error tracking (Sentry recommended)
- Configure alerts for downtime

## 🆘 Troubleshooting

### Common Issues
1. **Environment Variables**: Ensure all required vars are set
2. **Firebase Permissions**: Check service account permissions
3. **CORS Errors**: Update CORS_ORIGIN with your domain
4. **Memory Issues**: Increase memory allocation if needed
5. **Build Errors**: Check Node.js version compatibility

### Support
- Check deployment logs in your platform dashboard
- Verify Firebase project settings
- Test locally first: `npm run dev`
- Review environment variables

## 🎉 Success!

Your Firebase Backend Admin is now deployed and ready to handle:
- ✅ Full CRUD operations on Firestore
- ✅ Firebase Authentication management
- ✅ Firebase Storage operations
- ✅ MCP protocol integration
- ✅ Real-time WebSocket updates
- ✅ Admin dashboard and analytics

**Next Steps:**
1. Set up your frontend to connect to the API
2. Configure Firebase security rules
3. Set up monitoring and alerts
4. Plan for scaling and optimization 