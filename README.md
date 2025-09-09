# Slack Maker Update Bot

A Slack bot for biweekly maker updates, deployed on AWS Lambda. This bot helps teams collect and organize project status updates through an interactive Slack interface.

## Features

- **Interactive Modal Forms**: Multi-step forms for collecting project updates
- **Rich Text Support**: Rich text input for detailed project descriptions
- **Project Management**: Add multiple projects with status tracking
- **Slash Commands**: Easy access via `/maker-biweekly-update` command
- **AWS Lambda Deployment**: Serverless, cost-effective hosting
- **Persistent Data**: Maintains form state across interactions

## Architecture

- **Frontend**: Slack Block Kit UI components
- **Backend**: Node.js with Slack Bolt framework
- **Deployment**: AWS Lambda with API Gateway
- **Storage**: In-memory (can be extended to DynamoDB)

## Quick Start

### Prerequisites

- Node.js 18+ 
- AWS CLI configured
- Slack App with Bot Token and Signing Secret

### Local Development

1. **Clone the repository**:
   ```bash
   git clone <your-github-repo-url>
   cd slack_template
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Slack tokens
   ```

4. **Run locally** (Socket Mode):
   ```bash
   node lambda_handler.js
   ```

### AWS Lambda Deployment

1. **Deploy to Lambda**:
   ```bash
   export AWS_PROFILE=your-profile
   ./deploy-lambda.sh deploy
   ```

2. **Update existing deployment**:
   ```bash
   ./deploy-lambda.sh update
   ```

3. **Configure Slack App**:
   - Disable Socket Mode
   - Set Event Subscriptions URL to your Lambda webhook
   - Subscribe to bot events: `app_mention`, `message.channels`, etc.
   - Add slash command: `/maker-biweekly-update`

## Production Deployment Checklist

### ✅ Infrastructure Status
- [x] **Lambda Function**: `slack-maker-update-bot` deployed and active
- [x] **API Gateway**: Webhook URL configured and accessible
- [x] **Environment Variables**: Bot token and signing secret configured
- [x] **IAM Permissions**: Lambda execution role properly configured

### 🔧 Slack App Configuration Required
1. **Event Subscriptions**:
   - [ ] Disable Socket Mode
   - [ ] Set Request URL: `https://olrc9t3r7e.execute-api.us-east-1.amazonaws.com/prod/slack/events`
   - [ ] Subscribe to Bot Events: `app_mention`, `message.channels`, `message.groups`, `message.im`, `message.mpim`

2. **Slash Commands**:
   - [ ] Create command: `/maker-biweekly-update`
   - [ ] Set Request URL: `https://olrc9t3r7e.execute-api.us-east-1.amazonaws.com/prod/slack/events`

3. **Interactive Components**:
   - [ ] Enable Interactivity
   - [ ] Set Request URL: `https://olrc9t3r7e.execute-api.us-east-1.amazonaws.com/prod/slack/events`

4. **OAuth & Permissions**:
   - [ ] Bot Token Scopes: `app_mentions:read`, `channels:history`, `chat:write`, `commands`, `groups:history`, `im:history`, `mpim:history`, `users:read`

5. **Install App**:
   - [ ] Install app to workspace
   - [ ] Authorize permissions

## Project Structure

```
slack_template/
├── lambda_handler.js      # Main Lambda-compatible bot code
├── package.json           # Node.js dependencies
├── package-lock.json      # Dependency lock file
├── deploy-lambda.sh       # AWS deployment script
├── README.md             # This file
├── .env.example          # Environment variables template
└── .gitignore            # Git ignore rules
```

## Environment Variables

Create a `.env` file with:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
```

## Usage

1. **Start a biweekly update**:
   ```
   /maker-biweekly-update
   ```

2. **Follow the interactive form**:
   - Fill in your name and team
   - Add projects with details
   - Use rich text for descriptions
   - Submit when complete

3. **Bot responses**:
   - Confirms submission
   - Provides summary of updates
   - Handles errors gracefully

## Development

### Key Components

- **Modal Builders**: `projectModal()`, `teamModal()` - UI construction
- **Event Handlers**: Slash commands, button clicks, form submissions
- **Rich Text Processing**: Converts between Slack rich text and markdown
- **State Management**: Maintains form state across interactions

### Adding Features

1. **New UI Elements**: Add to modal builders
2. **New Commands**: Add slash command handlers
3. **Data Persistence**: Extend to use DynamoDB
4. **Notifications**: Add scheduled reminders

## Deployment

### AWS Lambda

The bot is deployed as a serverless function with:

- **Runtime**: Node.js 18.x
- **Memory**: 256 MB
- **Timeout**: 30 seconds
- **API Gateway**: RESTful webhook endpoint

### Cost Optimization

- **Pay-per-use**: Only charged for actual requests
- **No idle costs**: Unlike traditional servers
- **Auto-scaling**: Handles traffic spikes automatically

## Troubleshooting

### Common Issues

1. **URL Verification Failed**:
   - Check Lambda function logs
   - Verify webhook URL in Slack app settings

2. **Bot Not Responding**:
   - Check environment variables
   - Verify bot permissions in Slack
   - Check CloudWatch logs

3. **Deployment Errors**:
   - Ensure AWS credentials are configured
   - Check IAM permissions
   - Verify region settings

### Debugging

- **Local Testing**: Use Socket Mode for development
- **Lambda Logs**: Check CloudWatch for runtime errors
- **Slack Events**: Use Slack's Event Tester

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the troubleshooting section
- Review AWS CloudWatch logs
- Test with Socket Mode locally first
