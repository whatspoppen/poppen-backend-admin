#!/bin/bash

# Firebase Backend Admin - Deployment Commands
# Choose your deployment platform and run the appropriate commands

echo "🚀 Firebase Backend Admin Deployment Commands"
echo "=============================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install dependencies
install_deps() {
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
}

# Function to run tests
run_tests() {
    echo "🧪 Running tests..."
    npm test
    if [ $? -eq 0 ]; then
        echo "✅ All tests passed"
    else
        echo "❌ Tests failed. Fix issues before deploying."
        exit 1
    fi
}

# Google Cloud Platform deployment
deploy_gcp() {
    echo "🌐 Deploying to Google Cloud Platform..."
    
    if ! command_exists gcloud; then
        echo "❌ Google Cloud CLI not installed. Install it first:"
        echo "curl https://sdk.cloud.google.com | bash"
        echo "exec -l $SHELL"
        echo "gcloud init"
        exit 1
    fi
    
    echo "📝 Make sure you've updated app.yaml with your configuration"
    read -p "Continue with GCP deployment? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        gcloud app deploy app.yaml --quiet
        echo "✅ Deployed to Google Cloud Platform"
        gcloud app browse
    else
        echo "❌ GCP deployment cancelled"
    fi
}

# Heroku deployment
deploy_heroku() {
    echo "🟣 Deploying to Heroku..."
    
    if ! command_exists heroku; then
        echo "❌ Heroku CLI not installed. Install it first:"
        echo "npm install -g heroku"
        exit 1
    fi
    
    echo "Creating Heroku app..."
    read -p "Enter your Heroku app name: " app_name
    
    heroku create $app_name
    
    echo "📝 Setting up environment variables..."
    echo "You need to set these environment variables in Heroku:"
    echo "- FIREBASE_PROJECT_ID"
    echo "- FIREBASE_PRIVATE_KEY"
    echo "- FIREBASE_CLIENT_EMAIL"
    echo "- JWT_SECRET"
    echo "- And others from your .env file"
    
    read -p "Have you set all environment variables in Heroku dashboard? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "Deploy to Heroku"
        git push heroku main
        echo "✅ Deployed to Heroku"
        heroku open
    else
        echo "❌ Please set environment variables first"
    fi
}

# Railway deployment
deploy_railway() {
    echo "🚂 Deploying to Railway..."
    
    if ! command_exists railway; then
        echo "Installing Railway CLI..."
        npm install -g @railway/cli
    fi
    
    echo "Logging into Railway..."
    railway login
    
    echo "Creating Railway project..."
    railway init
    
    echo "📝 Setting up environment variables..."
    echo "Setting environment variables from .env file..."
    railway variables set -f .env
    
    echo "Deploying to Railway..."
    railway up
    
    echo "✅ Deployed to Railway"
}

# Render deployment
deploy_render() {
    echo "🔷 Deploying to Render..."
    
    echo "📝 Render deployment requires:"
    echo "1. Connect your GitHub repository to Render"
    echo "2. Use the render.yaml configuration file"
    echo "3. Set environment variables in Render dashboard"
    echo ""
    echo "Visit https://render.com and:"
    echo "1. Create a new Web Service"
    echo "2. Connect your GitHub repository"
    echo "3. Render will use render.yaml automatically"
    echo "4. Set environment variables in the dashboard"
    echo ""
    echo "✅ Follow the instructions above to deploy to Render"
}

# Main menu
show_menu() {
    echo ""
    echo "Choose your deployment platform:"
    echo "1) Google Cloud Platform (Recommended for Firebase)"
    echo "2) Heroku"
    echo "3) Railway (Easiest)"
    echo "4) Render"
    echo "5) Install dependencies only"
    echo "6) Run tests only"
    echo "7) Exit"
    echo ""
}

# Main execution
main() {
    install_deps
    
    while true; do
        show_menu
        read -p "Enter your choice (1-7): " choice
        
        case $choice in
            1)
                run_tests
                deploy_gcp
                break
                ;;
            2)
                run_tests
                deploy_heroku
                break
                ;;
            3)
                run_tests
                deploy_railway
                break
                ;;
            4)
                run_tests
                deploy_render
                break
                ;;
            5)
                echo "✅ Dependencies installed"
                break
                ;;
            6)
                run_tests
                break
                ;;
            7)
                echo "👋 Goodbye!"
                exit 0
                ;;
            *)
                echo "❌ Invalid option. Please try again."
                ;;
        esac
    done
}

# Run main function
main 