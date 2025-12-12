/**
 * Webhook endpoint for AWS Textract completion notifications
 * Called by AWS SNS when Textract async job completes
 * 
 * Configure in AWS:
 * 1. Create SNS Topic
 * 2. Subscribe this endpoint URL to the topic
 * 3. Configure Textract to send notifications to SNS topic
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/supabase';
import { getDocumentAnalysis, extractTextFromBlocks } from '@/lib/aws/textract-async';
import { deleteFromS3 } from '@/lib/aws/s3';
import { processExtractionJob } from '@/lib/jobs/extraction-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow time for processing

export async function POST(request: NextRequest) {
  try {
    // Verify SNS signature (production should verify AWS signature)
    // For now, we'll accept requests - in production, verify x-amz-sns-signature
    
    const body = await request.text();
    let snsMessage: any;

    try {
      snsMessage = JSON.parse(body);
    } catch {
      // SNS sends URL-encoded JSON in some cases
      const urlParams = new URLSearchParams(body);
      const message = urlParams.get('Message');
      if (message) {
        snsMessage = JSON.parse(message);
      } else {
        return NextResponse.json({ error: 'Invalid SNS message format' }, { status: 400 });
      }
    }

    // Handle SNS subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      // Subscribe to the topic by visiting SubscribeURL
      console.log('SNS Subscription Confirmation received');
      return NextResponse.json({ status: 'confirmed' });
    }

    // Handle notification
    if (snsMessage.Type === 'Notification') {
      const textractMessage = JSON.parse(snsMessage.Message);
      const jobId = textractMessage.JobId;
      const status = textractMessage.Status;

      if (!jobId) {
        return NextResponse.json({ error: 'Missing JobId' }, { status: 400 });
      }

      const supabase = createServerClient();

      // Find the job in database
      const { data: textractJob, error: jobError } = await supabase
        .from('textract_jobs')
        .select('*')
        .eq('job_id', jobId)
        .single();

      if (jobError || !textractJob) {
        console.error('Textract job not found:', jobId);
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      // Get full results from Textract
      const jobResult = await getDocumentAnalysis(jobId);

      // Update job status
      const updateData: any = {
        status: jobResult.status,
        status_message: jobResult.statusMessage,
        updated_at: new Date().toISOString(),
      };

      if (jobResult.status === 'SUCCEEDED') {
        updateData.textract_response = { Blocks: jobResult.blocks };
        updateData.extracted_text = jobResult.extractedText || extractTextFromBlocks(jobResult.blocks || []);
        updateData.completed_at = new Date().toISOString();
      } else if (jobResult.status === 'FAILED') {
        updateData.error_details = { message: jobResult.statusMessage };
        updateData.completed_at = new Date().toISOString();
      }

      await supabase
        .from('textract_jobs')
        .update(updateData)
        .eq('id', textractJob.id);

      // If succeeded, trigger LLM processing
      if (jobResult.status === 'SUCCEEDED' && jobResult.extractedText) {
        // Find associated extraction job
        const { data: extractionJob } = await supabase
          .from('extraction_jobs')
          .select('*')
          .eq('textract_job_id', textractJob.id)
          .single();

        if (extractionJob) {
          // Process extraction job (LLM inference)
          await processExtractionJob(extractionJob.id, jobResult.extractedText, jobResult.blocks || []);
        }
      }

      // Cleanup: Delete PDF from S3 after processing (optional)
      if (jobResult.status === 'SUCCEEDED' && textractJob.s3_key) {
        await deleteFromS3(textractJob.s3_key);
      }

      return NextResponse.json({ status: 'processed', jobId });
    }

    return NextResponse.json({ error: 'Unknown message type' }, { status: 400 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Handle GET for SNS subscription confirmation
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const topicArn = searchParams.get('TopicArn');
  
  if (topicArn) {
    return NextResponse.json({ message: 'Webhook endpoint ready', topicArn });
  }
  
  return NextResponse.json({ message: 'Textract webhook endpoint' });
}

