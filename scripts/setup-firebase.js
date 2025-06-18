#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('🔥 Firebase Backend Admin Setup');
  console.log('=====================================\n');

  try {
    // Check if .env already exists
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const overwrite = await question('.env file already exists. Overwrite? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        process.exit(0);
      }
    }

    console.log('Choose your setup method:');
    console.log('1. Use Firebase Service Account JSON file');
    console.log('2. Enter Firebase credentials manually');
    
    const choice = await question('\nEnter your choice (1 or 2): ');

    let envContent = `# Firebase Backend Admin Environment Configuration
# Generated on ${new Date().toISOString()}

# Server Configuration
NODE_ENV=development
PORT=3000
HOST=localhost
API_PREFIX=/api/v1

# Security
JWT_SECRET=${generateRandomSecret()}
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
SESSION_SECRET=${generateRandomSecret()}

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
CORS_CREDENTIALS=true

# MCP Configuration
MCP_TRANSPORT=stdio
MCP_HTTP_PORT=3001
MCP_HTTP_HOST=localhost
MCP_HTTP_PATH=/mcp
DEBUG_LOG_FILE=true

# Admin User Configuration
ADMIN_EMAIL=admin@yourproject.com
ADMIN_PASSWORD=secure-admin-password

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/app.log

# Development
DEBUG_MODE=true
ENABLE_SWAGGER=true

`;

    if (choice === '1') {
      // Firebase JSON file method
      const jsonPath = await question('Enter path to your Firebase service account JSON file: ');
      
      if (!fs.existsSync(jsonPath)) {
        console.error('❌ Firebase JSON file not found!');
        process.exit(1);
      }

      try {
        const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        envContent += `# Firebase Configuration (from JSON file)
FIREBASE_PROJECT_ID=${jsonContent.project_id}
FIREBASE_PRIVATE_KEY_ID=${jsonContent.private_key_id}
FIREBASE_PRIVATE_KEY="${jsonContent.private_key.replace(/\n/g, '\\n')}"
FIREBASE_CLIENT_EMAIL=${jsonContent.client_email}
FIREBASE_CLIENT_ID=${jsonContent.client_id}
FIREBASE_AUTH_URI=${jsonContent.auth_uri}
FIREBASE_TOKEN_URI=${jsonContent.token_uri}
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=${jsonContent.auth_provider_x509_cert_url}
FIREBASE_CLIENT_X509_CERT_URL=${jsonContent.client_x509_cert_url}
FIREBASE_STORAGE_BUCKET=${jsonContent.project_id}.appspot.com

# Alternative: Path to Firebase Service Account Key JSON file
SERVICE_ACCOUNT_KEY_PATH=${jsonPath}
`;

        console.log('✅ Firebase credentials extracted from JSON file');
        
      } catch (error) {
        console.error('❌ Error reading Firebase JSON file:', error.message);
        process.exit(1);
      }

    } else if (choice === '2') {
      // Manual input method
      console.log('\nEnter your Firebase project details:');
      
      const projectId = await question('Firebase Project ID: ');
      const clientEmail = await question('Firebase Client Email: ');
      const privateKey = await question('Firebase Private Key (paste the entire key): ');
      
      envContent += `# Firebase Configuration (manual input)
FIREBASE_PROJECT_ID=${projectId}
FIREBASE_CLIENT_EMAIL=${clientEmail}
FIREBASE_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"
FIREBASE_STORAGE_BUCKET=${projectId}.appspot.com
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs

`;

      console.log('✅ Firebase credentials configured manually');
      
    } else {
      console.error('❌ Invalid choice');
      process.exit(1);
    }

    // Write .env file
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Environment file created at ${envPath}`);

    // Create logs directory
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log('✅ Logs directory created');
    }

    console.log('\n🎉 Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Review and update the .env file as needed');
    console.log('2. Install dependencies: npm install');
    console.log('3. Start development server: npm run dev');
    console.log('4. Test your Firebase connection: npm run test');
    console.log('\nFor deployment:');
    console.log('- Update the deployment configuration files');
    console.log('- Set environment variables in your hosting platform');
    console.log('- Check the deployment-guide.md for detailed instructions');

    rl.close();

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    rl.close();
    process.exit(1);
  }
}

function generateRandomSecret() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Run the setup
main().catch(console.error); 