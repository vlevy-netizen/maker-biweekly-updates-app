# Slack Maker Update Bot - AWS Lambda Deployment

This guide will help you migrate your Slack bot from Render to AWS Lambda for better cost efficiency and reliability.

## 🎯 Why AWS Lambda?

- **Cost Effective**: Pay only for actual usage (likely $0-5/month vs 24/7 server costs)
- **Highly Reliable**: 99.95% uptime SLA
- **Auto Scaling**: Handles multiple users without configuration
- **No Server Management**: AWS handles infrastructure

## 📋 Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Node.js** (version 18 or higher)
4. **Slack App** with bot tokens

## 🚀 Quick Deployment

### 1. Set up Environment Variables

Create a `.env` file with your Slack tokens:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
```

### 2. Deploy to Lambda

Run the deployment script:

```bash
./deploy-lambda.sh deploy
```

This will:
- Create IAM roles and policies
- Install dependencies
- Deploy the Lambda function
- Set up API Gateway
- Provide you with the webhook URL

### 3. Update Slack App Configuration

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Select your app
3. Navigate to **Event Subscriptions**
4. Set the **Request URL** to the URL provided by the deployment script
5. Subscribe to these bot events:
   - `app_mention`
   - `message.channels`
   - `message.groups`
   - `message.im`
6. Save changes and reinstall your app

## 🔧 Manual Deployment Steps

If you prefer to deploy manually:

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Deployment Package

```bash
zip -r function.zip . -x "*.git*" "*.env*" "deploy-lambda.sh" "README*.md"
```

### 3. Create Lambda Function

```bash
aws lambda create-function \
  --function-name slack-maker-update-bot \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
  --handler lambda_handler.handler \
  --zip-file fileb://function.zip \
  --timeout 30 \
  --memory-size 256
```

### 4. Set Environment Variables

```bash
aws lambda update-function-configuration \
  --function-name slack-maker-update-bot \
  --environment Variables='{
    "SLACK_BOT_TOKEN":"xoxb-your-token",
    "SLACK_SIGNING_SECRET":"your-secret"
  }'
```

## 💰 Cost Analysis

### AWS Lambda Pricing (as of 2024)

- **Free Tier**: 1M requests/month + 400,000 GB-seconds
- **Beyond Free Tier**: $0.20 per 1M requests + $0.0000166667 per GB-second

### Estimated Monthly Costs

| Usage Level | Requests/Month | Estimated Cost |
|-------------|----------------|----------------|
| Light (100 interactions) | ~500 | $0 (Free Tier) |
| Moderate (1,000 interactions) | ~5,000 | $0 (Free Tier) |
| Heavy (10,000 interactions) | ~50,000 | $0-2 |
| Very Heavy (100,000 interactions) | ~500,000 | $5-10 |

**Your bot will likely stay within the free tier!**

## 🔄 Updating Your Bot

To update your bot code:

```bash
./deploy-lambda.sh update
```

## 📊 Monitoring

### View Logs

```bash
aws logs tail /aws/lambda/slack-maker-update-bot --follow
```

### Check Function Status

```bash
aws lambda get-function --function-name slack-maker-update-bot
```

## 🛠️ Troubleshooting

### Common Issues

1. **"Function not found"**
   - Ensure the function was created successfully
   - Check AWS region configuration

2. **"Permission denied"**
   - Verify IAM role has proper permissions
   - Check Lambda execution role

3. **"Slack events not received"**
   - Verify API Gateway URL is correct in Slack app settings
   - Check that events are subscribed in Slack app configuration

4. **"Environment variables not set"**
   - Run: `aws lambda update-function-configuration --function-name slack-maker-update-bot --environment Variables='{"SLACK_BOT_TOKEN":"your-token","SLACK_SIGNING_SECRET":"your-secret"}'`

### Debug Mode

Enable detailed logging by adding this to your Lambda function:

```javascript
console.log('Event received:', JSON.stringify(event, null, 2));
```

## 🔒 Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use IAM roles** instead of hardcoded credentials
3. **Enable CloudTrail** for audit logging
4. **Set up CloudWatch alarms** for error monitoring
5. **Use VPC** if your bot needs to access private resources

## 📈 Scaling Considerations

- **Concurrent Executions**: Lambda can handle 1,000 concurrent executions by default
- **Memory**: Start with 256MB, increase if needed
- **Timeout**: Set to 30 seconds for Slack interactions
- **Cold Starts**: First request may take 1-2 seconds, subsequent requests are fast

## 🆚 Render vs Lambda Comparison

| Feature | Render | AWS Lambda |
|---------|--------|------------|
| **Cost** | $7+/month (24/7) | $0-5/month (usage-based) |
| **Uptime** | 99.9% | 99.95% |
| **Scaling** | Manual | Automatic |
| **Maintenance** | You manage | AWS manages |
| **Cold Starts** | None | 1-2 seconds (first request) |
| **Setup Complexity** | Simple | Moderate |

## 🎉 Migration Complete!

Your Slack bot is now running on AWS Lambda with:
- ✅ Better cost efficiency
- ✅ Higher reliability
- ✅ Automatic scaling
- ✅ No server management

The bot will automatically handle all your team's biweekly update requests with the same functionality as before, but with improved performance and cost savings!
