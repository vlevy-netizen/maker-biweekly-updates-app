#!/bin/bash

# AWS Lambda Deployment Script for Slack Maker Update Bot
# This script deploys your Slack bot to AWS Lambda

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Configuration
FUNCTION_NAME="slack-maker-update-bot"
RUNTIME="nodejs18.x"
HANDLER="lambda_handler.handler"
ROLE_NAME="slack-bot-lambda-role"
POLICY_NAME="slack-bot-lambda-policy"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    print_error ".env file not found! Please create it with your Slack tokens."
    print_status "Required environment variables:"
    echo "  SLACK_BOT_TOKEN=xoxb-your-bot-token"
    echo "  SLACK_SIGNING_SECRET=your-signing-secret"
    exit 1
fi

# Function to create IAM role
create_iam_role() {
    print_status "Creating IAM role for Lambda..."
    
    # Create trust policy
    cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    # Create the role
    aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file://trust-policy.json \
        --description "Role for Slack bot Lambda function" \
        2>/dev/null || print_warning "Role already exists"

    # Attach basic execution policy
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
        2>/dev/null || print_warning "Policy already attached"

    # Clean up
    rm trust-policy.json
    
    print_success "IAM role created successfully!"
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing Node.js dependencies..."
    npm install
    print_success "Dependencies installed!"
}

# Function to create deployment package
create_deployment_package() {
    print_status "Creating deployment package..."
    
    # Create zip file
    zip -r function.zip . -x "*.git*" "*.env*" "deploy-lambda.sh" "README.md" "*.md"
    
    print_success "Deployment package created: function.zip"
}

# Function to deploy Lambda function
deploy_lambda() {
    print_status "Deploying Lambda function..."
    
    # Get account ID for role ARN
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
    
    # Check if function exists
    if aws lambda get-function --function-name $FUNCTION_NAME &> /dev/null; then
        print_status "Updating existing Lambda function..."
        aws lambda update-function-code \
            --function-name $FUNCTION_NAME \
            --zip-file fileb://function.zip
    else
        print_status "Creating new Lambda function..."
        aws lambda create-function \
            --function-name $FUNCTION_NAME \
            --runtime $RUNTIME \
            --role $ROLE_ARN \
            --handler $HANDLER \
            --zip-file fileb://function.zip \
            --timeout 30 \
            --memory-size 256 \
            --environment Variables="{
                SLACK_BOT_TOKEN=$(grep SLACK_BOT_TOKEN .env | cut -d '=' -f2),
                SLACK_SIGNING_SECRET=$(grep SLACK_SIGNING_SECRET .env | cut -d '=' -f2)
            }"
    fi
    
    print_success "Lambda function deployed successfully!"
}

# Function to create API Gateway
create_api_gateway() {
    print_status "Setting up API Gateway..."
    
    # Check if API already exists
    API_ID=$(aws apigateway get-rest-apis --query "items[?name=='slack-bot-api'].id" --output text)
    
    if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
        print_status "Creating API Gateway..."
        API_ID=$(aws apigateway create-rest-api \
            --name "slack-bot-api" \
            --description "API Gateway for Slack bot" \
            --query 'id' \
            --output text)
    else
        print_status "Using existing API Gateway: $API_ID"
    fi
    
    # Get root resource ID
    ROOT_RESOURCE_ID=$(aws apigateway get-resources \
        --rest-api-id $API_ID \
        --query 'items[?path==`/`].id' \
        --output text)
    
    # Create /slack/events resource
    RESOURCE_ID=$(aws apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $ROOT_RESOURCE_ID \
        --path-part "slack" \
        --query 'id' \
        --output text 2>/dev/null || \
        aws apigateway get-resources \
        --rest-api-id $API_ID \
        --query "items[?pathPart=='slack'].id" \
        --output text)
    
    EVENTS_RESOURCE_ID=$(aws apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $RESOURCE_ID \
        --path-part "events" \
        --query 'id' \
        --output text 2>/dev/null || \
        aws apigateway get-resources \
        --rest-api-id $API_ID \
        --query "items[?pathPart=='events'].id" \
        --output text)
    
    # Create POST method
    aws apigateway put-method \
        --rest-api-id $API_ID \
        --resource-id $EVENTS_RESOURCE_ID \
        --http-method POST \
        --authorization-type NONE 2>/dev/null || print_warning "Method already exists"
    
    # Get Lambda function ARN
    LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --query 'Configuration.FunctionArn' --output text)
    
    # Set up Lambda integration
    aws apigateway put-integration \
        --rest-api-id $API_ID \
        --resource-id $EVENTS_RESOURCE_ID \
        --http-method POST \
        --type AWS_PROXY \
        --integration-http-method POST \
        --uri "arn:aws:apigateway:$(aws configure get region):lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" 2>/dev/null || print_warning "Integration already exists"
    
    # Add Lambda permission for API Gateway
    aws lambda add-permission \
        --function-name $FUNCTION_NAME \
        --statement-id "api-gateway-invoke" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:$(aws configure get region):$(aws sts get-caller-identity --query Account --output text):${API_ID}/*/*" 2>/dev/null || print_warning "Permission already exists"
    
    # Deploy API
    aws apigateway create-deployment \
        --rest-api-id $API_ID \
        --stage-name "prod" 2>/dev/null || print_warning "Deployment already exists"
    
    # Get the API Gateway URL
    API_URL="https://${API_ID}.execute-api.$(aws configure get region).amazonaws.com/prod/slack/events"
    
    print_success "API Gateway created successfully!"
    print_status "Your Slack bot webhook URL is: $API_URL"
    echo ""
    print_warning "IMPORTANT: Update your Slack app's Event Subscriptions URL to:"
    echo "  $API_URL"
    echo ""
    print_status "Next steps:"
    echo "1. Go to your Slack app settings at https://api.slack.com/apps"
    echo "2. Navigate to 'Event Subscriptions'"
    echo "3. Set the Request URL to: $API_URL"
    echo "4. Subscribe to the following bot events:"
    echo "   - app_mention"
    echo "   - message.channels"
    echo "   - message.groups"
    echo "   - message.im"
    echo "5. Save changes and reinstall your app to your workspace"
}

# Function to show function info
show_function_info() {
    print_status "Lambda function information:"
    aws lambda get-function --function-name $FUNCTION_NAME --query 'Configuration.{FunctionName:FunctionName,Runtime:Runtime,LastModified:LastModified,State:State}' --output table
}

# Function to clean up
cleanup() {
    print_status "Cleaning up temporary files..."
    rm -f function.zip
    print_success "Cleanup completed!"
}

# Function to show help
show_help() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  deploy          Deploy the Lambda function (full deployment)"
    echo "  update          Update existing Lambda function code only"
    echo "  api             Create/update API Gateway"
    echo "  info            Show function information"
    echo "  cleanup         Clean up temporary files"
    echo "  help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy       # Full deployment (recommended for first time)"
    echo "  $0 update       # Quick code update"
    echo "  $0 api          # Set up API Gateway only"
}

# Main script logic
case "${1:-help}" in
    deploy)
        create_iam_role
        install_dependencies
        create_deployment_package
        deploy_lambda
        create_api_gateway
        show_function_info
        cleanup
        ;;
    update)
        install_dependencies
        create_deployment_package
        deploy_lambda
        cleanup
        ;;
    api)
        create_api_gateway
        ;;
    info)
        show_function_info
        ;;
    cleanup)
        cleanup
        ;;
    help|*)
        show_help
        ;;
esac
