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
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// AWS_REGION is automatically provided by Lambda runtime
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
});

const dynamodb = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-2',
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
    // Note: Ensure this model is enabled in your AWS Bedrock account
    const modelId = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20241022-v2:0";
    
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

    // 2. Extract: Fetch Textract Result from S3
    // IMPORTANT: The SNS message contains DocumentLocation pointing to the ORIGINAL PDF
    // But because we used OutputConfig in StartDocumentAnalysis, Textract saves results
    // to a different location: processed/{jobId}/output.json
    // We must construct the correct path based on the JobId
    
    // Get bucket from SNS message or environment
    const documentLocation = message.DocumentLocation;
    const bucket = documentLocation?.S3Bucket || process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
    
    if (!bucket) {
      throw new Error('S3 bucket name not found in environment variables or SNS message');
    }
    
    // Textract stores results as numbered files: processed/{jobId}/1, processed/{jobId}/2, etc.
    // Each file contains the results for one page. We need to read all pages and combine them.
    // Note: Textract may create paths with double slashes, so we normalize
    const prefix = `processed/${jobId}/`.replace(/\/+/g, '/');
    
    console.log(`Fetching Textract results from s3://${bucket}/${prefix}`);
    console.log(`JobId: ${jobId}, Bucket: ${bucket}`);

    // List all files in the processed/{jobId}/ folder
    const { ListObjectsV2Command } = require("@aws-sdk/client-s3");
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });
    
    const listResponse = await s3.send(listCommand);
    
    // Filter out the .s3_access_check file and get only numbered result files
    const resultFiles = (listResponse.Contents || [])
      .map(obj => obj.Key)
      .filter(key => {
        // Get filename (last part after /)
        const filename = key.split('/').pop();
        // Include files that are numeric (page numbers) or 'output.json'
        return filename && (filename.match(/^\d+$/) || filename === 'output.json');
      })
      .sort((a, b) => {
        // Sort by filename (numeric order for numbered files)
        const aNum = parseInt(a.split('/').pop()) || 0;
        const bNum = parseInt(b.split('/').pop()) || 0;
        return aNum - bNum;
      });
    
    if (resultFiles.length === 0) {
      throw new Error(`No Textract result files found in s3://${bucket}/${prefix}`);
    }
    
    console.log(`Found ${resultFiles.length} result file(s): ${resultFiles.join(', ')}`);
    
    // Read and combine all result files
    const allBlocks = [];
    const allDocumentMetadata = [];
    
    for (const fileKey of resultFiles) {
      try {
        const getObj = new GetObjectCommand({ Bucket: bucket, Key: fileKey });
        const s3Response = await s3.send(getObj);
        const jsonBody = await streamToString(s3Response.Body);
        
        // Validate it's JSON (not PDF)
        if (jsonBody.trim().startsWith('%PDF')) {
          console.warn(`Skipping ${fileKey} - appears to be PDF, not JSON`);
          continue;
        }
        
        const pageData = JSON.parse(jsonBody);
        
        // Combine blocks from all pages
        if (pageData.Blocks && Array.isArray(pageData.Blocks)) {
          allBlocks.push(...pageData.Blocks);
        }
        
        // Collect document metadata (usually same across pages, but keep all)
        if (pageData.DocumentMetadata) {
          allDocumentMetadata.push(pageData.DocumentMetadata);
        }
        
        console.log(`Loaded ${pageData.Blocks?.length || 0} blocks from ${fileKey}`);
      } catch (err) {
        console.error(`Error reading ${fileKey}:`, err);
        // Continue with other files
      }
    }
    
    if (allBlocks.length === 0) {
      throw new Error(`No valid Textract blocks found in result files`);
    }
    
    // Combine into a single Textract response structure
    const textractData = {
      Blocks: allBlocks,
      DocumentMetadata: allDocumentMetadata[0] || { Pages: resultFiles.length },
      // Include other metadata if present
      JobStatus: 'SUCCEEDED',
      JobId: jobId,
    };
    
    console.log(`Combined ${allBlocks.length} total blocks from ${resultFiles.length} file(s)`);

    // 3. Transform: Linearize Text
    // Concatenate lines to create a searchable "blob" for AI analysis
    const fullText = linearizeTextractBlocks(textractData.Blocks);

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

