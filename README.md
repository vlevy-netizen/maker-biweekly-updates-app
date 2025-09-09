# Slack Maker Update Bot

A simple and effective Slack bot for collecting biweekly maker updates, deployed on AWS Lambda. This bot provides an interactive modal form for team members to submit their project status updates.

## ✅ Current Status

**The bot is fully functional and deployed!** The slash command `/maker-biweekly-update` opens a modal form that collects:
- Accomplishments
- Challenges faced
- Goals for the next period

## Features

- **Simple Modal Form**: Clean, easy-to-use interface for status updates
- **Slash Command**: Quick access via `/maker-biweekly-update`
- **AWS Lambda Deployment**: Serverless, cost-effective hosting
- **Signature Verification**: Secure request validation
- **Direct Channel Posting**: Updates are posted directly to the channel

## Architecture

- **Frontend**: Slack Block Kit UI components
- **Backend**: Node.js with Slack Bolt framework
- **Deployment**: AWS Lambda with API Gateway
- **Security**: Manual signature verification for slash commands

## Quick Start

### Prerequisites

- Node.js 18+
- AWS CLI configured with appropriate permissions
- Slack App with Bot Token and Signing Secret

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd slack_template
npm install
```

### 2. Configure Environment

Create a `.env` file with your Slack credentials:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
```

### 3. Deploy to AWS Lambda

```bash
export AWS_PROFILE=your-profile
./deploy-lambda.sh deploy
```

### 4. Configure Slack App

1. **Slash Commands**:
   - Create command: `/maker-biweekly-update`
   - Set Request URL: `https://your-api-gateway-url/prod/slack/events`

2. **Interactive Components**:
   - Enable Interactivity
   - Set Request URL: `https://your-api-gateway-url/prod/slack/events`

3. **OAuth & Permissions**:
   - Bot Token Scopes: `chat:write`, `commands`, `users:read`

4. **Install App**:
   - Install app to your workspace
   - Authorize permissions

## Project Structure

```
slack_template/
├── lambda_handler.js      # Main Lambda function code
├── package.json           # Node.js dependencies
├── package-lock.json      # Dependency lock file
├── deploy-lambda.sh       # AWS deployment script
├── README.md             # This file
├── .env                  # Environment variables (create this)
└── .env.example          # Environment variables template
```

## Usage

1. **Start a biweekly update**:
   ```
   /maker-biweekly-update
   ```

2. **Fill out the modal form**:
   - Accomplishments: What you achieved
   - Challenges: What obstacles you faced
   - Goals: What you plan to accomplish next

3. **Submit**: The update will be posted to the channel

## Development

### Key Components

- **Slash Command Handler**: Processes `/maker-biweekly-update` commands
- **Modal Builder**: Creates the interactive form UI
- **Signature Verification**: Validates requests from Slack
- **Form Submission**: Handles modal submissions and posts to channel

### Local Testing

For local development, you can test the Lambda function using:

```bash
# Test the function locally
node -e "
const handler = require('./lambda_handler.js');
const testEvent = {
  httpMethod: 'POST',
  path: '/slack/events',
  headers: {
    'x-slack-signature': 'test-signature',
    'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString()
  },
  body: 'command=/maker-biweekly-update&user_id=U123&channel_id=C123&trigger_id=T123'
};
handler.handler(testEvent, {});
"
```

## Deployment

### AWS Lambda Configuration

The bot is deployed with:
- **Runtime**: Node.js 18.x
- **Memory**: 256 MB
- **Timeout**: 30 seconds
- **Environment Variables**: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`

### Update Deployment

To update the Lambda function:

```bash
./deploy-lambda.sh update
```

### Environment Variables

Update Lambda environment variables:

```bash
aws lambda update-function-configuration \
  --function-name slack-maker-update-bot \
  --environment Variables='{SLACK_BOT_TOKEN=your-token,SLACK_SIGNING_SECRET=your-secret}'
```

## Troubleshooting

### Common Issues

1. **"dispatch_failed" Error**:
   - Check that the signing secret matches your Slack app
   - Verify the slash command URL is correct
   - Check Lambda function logs in CloudWatch

2. **Modal Not Opening**:
   - Verify bot token has `chat:write` permission
   - Check that the trigger_id is valid
   - Ensure the app is installed in the workspace

3. **Signature Verification Failed**:
   - Confirm the signing secret is correct
   - Check that the timestamp is within 5 minutes
   - Verify the request body is not modified

### Debugging

- **Check Lambda Logs**: `aws logs filter-log-events --log-group-name "/aws/lambda/slack-maker-update-bot"`
- **Test Bot Token**: `curl -H "Authorization: Bearer YOUR_TOKEN" https://slack.com/api/auth.test`
- **Verify Slack App**: Check app configuration at https://api.slack.com/apps

## Security

- **Signature Verification**: All requests are verified using Slack's signature validation
- **Environment Variables**: Sensitive data stored in Lambda environment variables
- **HTTPS Only**: All communication uses secure HTTPS

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
- Check the troubleshooting section above
- Review AWS CloudWatch logs
- Test with a simple curl request to verify the Lambda function