/**
 * Lambda handler that processes Textract results when analysis completes
 * Triggered by SNS notification from Textract
 * 
 * ETL Pipeline:
 * - Extract: Retrieves raw JSON analysis from S3 (where Textract dumped it)
 * - Transform: Linearizes Textract blocks into clean text and runs gap detection
 * - Load: Saves structured data and gap flag to DynamoDB
 */

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { TextractClient, GetDocumentAnalysisCommand } = require("@aws-sdk/client-textract");
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// AWS_REGION is automatically provided by Lambda runtime
const REGION = process.env.AWS_REGION || 'us-east-2';

const s3 = new S3Client({
  region: REGION,
});

const textract = new TextractClient({
  region: REGION,
});

const dynamodb = new DynamoDBClient({
  region: REGION,
});

const bedrock = new BedrockRuntimeClient({
  region: REGION,
});

/**
 * Helper: Stream to String
 * Converts S3 stream to string for JSON parsing
 */
const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

/**
 * Linearizes Textract blocks into searchable text
 * Concatenates LINE blocks to create a searchable "blob" for regex matching
 */
function linearizeTextractBlocks(blocks) {
  if (!blocks || blocks.length === 0) {
    return '';
  }

  return blocks
    .filter(block => block.BlockType === 'LINE' && block.Text)
    .map(block => block.Text)
    .join(' ');
}

/**
 * Groups Textract blocks by page number
 * Returns an object with page numbers as keys and text as values
 */
function groupTextByPage(blocks) {
  if (!blocks || blocks.length === 0) {
    return {};
  }

  const pages = {};
  
  blocks
    .filter(block => block.BlockType === 'LINE' && block.Text)
    .forEach(block => {
      const pageNum = block.Page || 1; // Default to page 1 if not specified
      if (!pages[pageNum]) {
        pages[pageNum] = [];
      }
      pages[pageNum].push(block.Text);
    });

  // Convert arrays to strings
  const result = {};
  Object.keys(pages).sort((a, b) => parseInt(a) - parseInt(b)).forEach(pageNum => {
    result[pageNum] = pages[pageNum].join(' ');
  });

  return result;
}

// ---------------------------------------------------------
// DOMAIN LOGIC: AI-Powered Legal Deed Parser via Bedrock
// ---------------------------------------------------------
/**
 * Parses legal deed text using Amazon Bedrock (Claude 3.5 Sonnet)
 * Analyzes the text to identify amounts, restrictions, and conditions
 * 
 * @param {string} fullText - Linearized text from Textract
 * @returns {Promise<Object>} Parsed legal deed data with gap detection
 */
async function parseLegalDeed(fullText) {
  const prompt = "Analyze this legal text. Identify the total amount, the immediately available amount, and any conditions restricting the difference. Return JSON.";

  try {
    // Claude 3.5 Sonnet model ID for Bedrock
    // Note: Use cross-region inference profile (us.*) for us-east-2 region
    // Ensure this model is enabled in your AWS Bedrock account
    const modelId = process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-3-5-sonnet-20241022-v2:0";
    
    console.log(`Invoking Bedrock model: ${modelId}`);
    
    // Prepare the request payload for Claude via Bedrock
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nLegal text:\n${fullText}`
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const response = await bedrock.send(command);
    
    // Parse the response (Bedrock returns Uint8Array)
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );

    // Extract the text content from Claude's response
    const textContent = responseBody.content?.[0]?.text;
    if (!textContent) {
      throw new Error('No text content in Bedrock response');
    }

    // Extract JSON from the response (Claude may wrap it in markdown or text)
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Bedrock response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Normalize the response structure
    // Calculate gap if both amounts are present
    const totalAmount = parsed.totalAmount || parsed.total_amount || null;
    const immediateAvailability = parsed.immediatelyAvailableAmount || 
                                  parsed.immediately_available_amount || 
                                  parsed.immediateAvailability ||
                                  parsed.immediate_availability || 
                                  null;
    
    let gapDetected = false;
    let gapAmount = 0;

    if (totalAmount && immediateAvailability) {
      gapAmount = totalAmount - immediateAvailability;
      gapDetected = gapAmount > 0;
    }

    // Build risk factors if conditions are present
    const riskFactors = [];
    if (parsed.conditions && Array.isArray(parsed.conditions)) {
      parsed.conditions.forEach(condition => {
        riskFactors.push({
          severity: condition.severity || "MEDIUM",
          code: condition.code || "CONDITION_RESTRICTION",
          description: condition.description || condition
        });
      });
    } else if (parsed.conditions) {
      riskFactors.push({
        severity: "MEDIUM",
        code: "CONDITION_RESTRICTION",
        description: String(parsed.conditions)
      });
    }

    if (gapDetected) {
      riskFactors.push({
        severity: "HIGH",
        code: "RESTRICTED_AVAILABILITY",
        description: `Funding Gap of $${gapAmount.toLocaleString()} detected. ${parsed.conditions ? 'Conditions may restrict immediate availability.' : ''}`
      });
    }

    return {
      gapDetected,
      gapAmount,
      totalAmount,
      immediateAvailability,
      instrumentNumber: parsed.instrumentNumber || parsed.instrument_number || null,
      riskFactors: riskFactors.length > 0 ? riskFactors : [],
      // Store the raw AI response for debugging/audit
      aiAnalysis: parsed
    };
  } catch (error) {
    console.error('Bedrock parsing error:', error);
    
    // Fallback: Return a safe default structure
    return {
      gapDetected: false,
      gapAmount: 0,
      totalAmount: null,
      immediateAvailability: null,
      instrumentNumber: null,
      riskFactors: [{
        severity: "ERROR",
        code: "PARSING_ERROR",
        description: `Failed to parse legal text: ${error.message}`
      }],
      aiAnalysis: null
    };
  }
}

exports.handler = async (event) => {
  console.log('SNS event received:', JSON.stringify(event, null, 2));

  try {
    // 1. Parse SNS Message
    const message = JSON.parse(event.Records[0].Sns.Message);
    const jobId = message.JobId;
    const status = message.Status;

    console.log(`Processing Textract job: ${jobId}, Status: ${status}`);

    if (status !== "SUCCEEDED") {
      console.error(`Job ${jobId} failed with status: ${status}`);
      
      // Save failure status to DynamoDB
      await dynamodb.send(new PutItemCommand({
        TableName: process.env.RESULTS_TABLE_NAME || 'LegislazuliResults',
        Item: marshall({
          jobId,
          status: 'FAILED',
          statusMessage: message.StatusMessage || 'Unknown error',
          completedAt: new Date().toISOString(),
        }),
      }));

      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Job failed',
          jobId,
          status 
        })
      };
    }

    // 2. Extract: Fetch Textract Result using GetDocumentAnalysis API
    // This is more reliable than reading from S3 - handles pagination automatically
    // and doesn't depend on S3 file structure. Always gets blocks even if S3 output is mislocated.
    
    console.log(`Fetching Textract results using GetDocumentAnalysis API for JobId: ${jobId}`);
    
    // Fetch all pages of results using pagination
    const allBlocks = [];
    let nextToken = null;
    let documentMetadata = null;
    let pageCount = 0;
    
    do {
      const getAnalysisCommand = new GetDocumentAnalysisCommand({
        JobId: jobId,
        MaxResults: 1000, // Maximum results per page
        NextToken: nextToken,
      });
      
      console.log(`Fetching page ${pageCount + 1}${nextToken ? ' (with NextToken)' : ''}...`);
      
      const response = await textract.send(getAnalysisCommand);
      
      // Check job status
      if (response.JobStatus === 'FAILED') {
        throw new Error(`Textract job failed: ${response.StatusMessage || 'Unknown error'}`);
      }
      
      // Collect blocks
      if (response.Blocks && Array.isArray(response.Blocks)) {
        allBlocks.push(...response.Blocks);
        console.log(`Received ${response.Blocks.length} blocks (total: ${allBlocks.length})`);
      }
      
      // Store document metadata (usually same across pages)
      if (response.DocumentMetadata && !documentMetadata) {
        documentMetadata = response.DocumentMetadata;
      }
      
      // Get next token for pagination
      nextToken = response.NextToken;
      pageCount++;
      
      // Safety limit to prevent infinite loops
      if (pageCount > 100) {
        console.warn(`Reached pagination limit (100 pages), stopping`);
        break;
      }
      
    } while (nextToken);
    
    if (allBlocks.length === 0) {
      throw new Error(`No Textract blocks found for job ${jobId}`);
    }
    
    // Combine into a single Textract response structure
    const textractData = {
      Blocks: allBlocks,
      DocumentMetadata: documentMetadata || { Pages: pageCount },
      JobStatus: 'SUCCEEDED',
      JobId: jobId,
    };
    
    console.log(`Fetched ${allBlocks.length} total blocks across ${pageCount} page(s) using GetDocumentAnalysis API`);

    // 3. Transform: Linearize Text
    // Concatenate lines to create a searchable "blob" for AI analysis
    const fullText = linearizeTextractBlocks(textractData.Blocks);
    
    // Also group text by page for paginated display
    const textByPage = groupTextByPage(textractData.Blocks);

    // 4. Run Domain-Specific Logic: AI-Powered Gap Detection via Bedrock
    const analysis = await parseLegalDeed(fullText);

    // 5. Load: Save to DynamoDB
    // First, try to retrieve existing record to preserve S3 key
    let existingS3Key = null;
    let existingS3Bucket = null;
    try {
      const getItemCmd = new GetItemCommand({
        TableName: process.env.RESULTS_TABLE_NAME || 'LegislazuliResults',
        Key: { jobId: { S: jobId } },
      });
      const existingItem = await dynamodb.send(getItemCmd);
      if (existingItem.Item) {
        const existing = unmarshall(existingItem.Item);
        existingS3Key = existing.s3Key;
        existingS3Bucket = existing.s3Bucket;
      }
    } catch (getError) {
      console.warn('Could not retrieve existing record:', getError);
      // Continue without S3 key - not critical
    }

    const item = {
      jobId,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      // Preserve S3 key and bucket from initial record (if available)
      ...(existingS3Key && { s3Key: existingS3Key }),
      ...(existingS3Bucket && { s3Bucket: existingS3Bucket }),
      // Store core metadata from AI analysis
      instrumentNumber: analysis.instrumentNumber || null,
      gapDetected: analysis.gapDetected,
      gapAmount: analysis.gapAmount,
      totalAmount: analysis.totalAmount,
      immediateAvailability: analysis.immediateAvailability,
      riskFactors: analysis.riskFactors,
      // Store the AI-generated analysis (full JSON response from Bedrock)
      aiAnalysis: analysis.aiAnalysis,
      // Store the full raw text for the frontend to display/search
      // DynamoDB item limit warning: 400KB max item size
      // Truncate text to ensure we have room for AI analysis
      rawText: fullText.substring(0, 200000), // Reduced to ~200KB to leave room for AI analysis
      // Store paginated text (object with page numbers as keys)
      // This allows frontend to display text organized by page
      textByPage: JSON.stringify(textByPage),
      pages: textractData.DocumentMetadata?.Pages || 0,
    };

    await dynamodb.send(new PutItemCommand({
      TableName: process.env.RESULTS_TABLE_NAME || 'LegislazuliResults',
      Item: marshall(item),
    }));

    console.log(`Processed Job ${jobId}. Gap Detected: ${analysis.gapDetected}, Gap Amount: $${analysis.gapAmount.toLocaleString()}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Job processed successfully',
        jobId,
        gapDetected: analysis.gapDetected,
        gapAmount: analysis.gapAmount,
      })
    };
  } catch (error) {
    console.error('Processing Error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process Textract results',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

