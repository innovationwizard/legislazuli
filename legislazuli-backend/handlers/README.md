# Lambda Handlers - ETL Pipeline

This directory contains the Lambda function handlers for the async processing pipeline.

## Functions

### `start-analysis.js`
Triggered by S3 upload events. Starts Textract async analysis job.

### `process-results.js`
Triggered by SNS notifications when Textract completes. Implements the ETL pipeline:

- **Extract**: Retrieves raw JSON from S3 (where Textract dumped results)
- **Transform**: Linearizes text and runs gap detection algorithm
- **Load**: Saves structured data to DynamoDB

## AI-Powered Gap Detection via Amazon Bedrock

The `parseLegalDeed()` function uses **Amazon Bedrock (Claude 3.5 Sonnet)** to analyze legal text and detect funding gaps.

### How It Works

1. **Text Extraction**: Linearizes Textract blocks into searchable text
2. **AI Analysis**: Sends text to Claude 3.5 Sonnet via Bedrock with prompt:
   > "Analyze this legal text. Identify the total amount, the immediately available amount, and any conditions restricting the difference. Return JSON."
3. **Gap Calculation**: Automatically calculates gap if both amounts are present
4. **Risk Factor Extraction**: Identifies conditions and restrictions from AI response

### Example Output

```json
{
  "gapDetected": true,
  "gapAmount": 1900000,
  "totalAmount": 3000000,
  "immediateAvailability": 1100000,
  "instrumentNumber": "355",
  "riskFactors": [{
    "severity": "HIGH",
    "code": "RESTRICTED_AVAILABILITY",
    "description": "Funding Gap of $1,900,000 detected. Conditions may restrict immediate availability."
  }],
  "aiAnalysis": {
    "totalAmount": 3000000,
    "immediatelyAvailableAmount": 1100000,
    "conditions": ["Requires new commercialization contracts"]
  }
}
```

### Bedrock Setup

1. **Enable Claude 3.5 Sonnet in Bedrock**:
   - Go to AWS Console → Bedrock → Model access
   - Request access to "Anthropic Claude 3.5 Sonnet"

2. **IAM Permissions**: The SAM template automatically grants the Lambda function permission to invoke Bedrock

3. **Model ID**: Uses `anthropic.claude-3-5-sonnet-20241022-v2:0`

## Memory Considerations

**Warning**: For very large legal deeds (100+ pages), the Textract JSON can exceed 100MB. The current implementation loads the entire JSON into memory.

### Current Implementation
- Uses `streamToString()` to read S3 object into memory
- Parses entire JSON with `JSON.parse()`
- Works well for documents up to ~50 pages

### For Larger Documents
If you encounter memory issues with 100+ page documents, consider:

1. **Increase Lambda Memory**: Update `MemorySize` in `template.yaml` to 512MB or 1024MB
2. **Streaming Parser**: Use `stream-json` package to process JSON line-by-line:
   ```bash
   npm install stream-json
   ```
   Then update `process-results.js` to use streaming parser instead of `JSON.parse()`

## Dependencies

```bash
npm install @aws-sdk/client-s3 @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb
```

## Testing Locally

```bash
# Test with SAM CLI
sam local invoke ProcessResultsFunction -e events/sns-event.json
```

Create `events/sns-event.json`:
```json
{
  "Records": [{
    "Sns": {
      "Message": "{\"JobId\":\"test-job-id\",\"Status\":\"SUCCEEDED\",\"DocumentLocation\":{\"S3Bucket\":\"test-bucket\",\"S3ObjectName\":\"processed/test-job-id/output.json\"}}"
    }
  }]
}
```

