#!/bin/bash

# Setup script for Slack Maker Update Bot
# This script helps install Node.js and dependencies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
check_node() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js is already installed: $NODE_VERSION"
        return 0
    else
        print_warning "Node.js is not installed"
        return 1
    fi
}

# Install Node.js using Homebrew (macOS)
install_node_macos() {
    print_status "Installing Node.js using Homebrew..."
    
    if ! command -v brew &> /dev/null; then
        print_error "Homebrew is not installed. Please install Homebrew first:"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    brew install node
    print_success "Node.js installed successfully!"
}

# Install Node.js using nvm (Node Version Manager)
install_node_nvm() {
    print_status "Installing Node.js using nvm..."
    
    if ! command -v nvm &> /dev/null; then
        print_status "Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
    
    nvm install 18
    nvm use 18
    print_success "Node.js installed successfully!"
}

# Install dependencies
install_dependencies() {
    print_status "Installing Node.js dependencies..."
    npm install
    print_success "Dependencies installed successfully!"
}

# Verify setup
verify_setup() {
    print_status "Verifying setup..."
    
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        print_success "Node.js and npm are available"
        print_status "Node.js version: $(node --version)"
        print_status "npm version: $(npm --version)"
        
        if [ -f "node_modules/.bin/slack" ]; then
            print_success "Slack Bolt framework is installed"
        else
            print_warning "Slack Bolt framework not found - run 'npm install'"
        fi
        
        if [ -f ".env" ]; then
            print_success ".env file exists"
        else
            print_warning ".env file not found - please create it with your Slack tokens"
        fi
        
        return 0
    else
        print_error "Setup verification failed"
        return 1
    fi
}

# Main setup function
main() {
    print_status "Setting up Slack Maker Update Bot..."
    
    # Check if Node.js is already installed
    if check_node; then
        print_status "Node.js is already installed, proceeding with dependencies..."
    else
        print_status "Node.js not found, installing..."
        
        # Detect OS and install Node.js
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            install_node_macos
        else
            # Linux/Unix
            install_node_nvm
        fi
    fi
    
    # Install dependencies
    install_dependencies
    
    # Verify setup
    if verify_setup; then
        print_success "Setup completed successfully!"
        echo ""
        print_status "Next steps:"
        echo "1. Ensure your .env file has the correct Slack tokens"
        echo "2. For local testing: node vanessa_code.js"
        echo "3. For Lambda deployment: ./deploy-lambda.sh deploy"
    else
        print_error "Setup failed. Please check the errors above."
        exit 1
    fi
}

# Show help
show_help() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  setup           Full setup (install Node.js and dependencies)"
    echo "  deps            Install dependencies only (Node.js must be installed)"
    echo "  verify          Verify current setup"
    echo "  help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 setup        # Full setup from scratch"
    echo "  $0 deps         # Install dependencies only"
    echo "  $0 verify       # Check if everything is working"
}

# Main script logic
case "${1:-setup}" in
    setup)
        main
        ;;
    deps)
        install_dependencies
        verify_setup
        ;;
    verify)
        verify_setup
        ;;
    help|*)
        show_help
        ;;
esac
