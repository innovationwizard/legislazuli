# SAM Deployment Setup Instructions

## Current Situation

Your AWS user `latina-s3-user` needs additional permissions to deploy the SAM application. The policy document has been created at `sam-deploy-policy.json`.

## Option 1: Have an Admin Create and Attach the Policy

If you have an AWS administrator who can help, provide them with:

1. **Policy Document**: `sam-deploy-policy.json` (already created)

2. **Commands to run**:
```bash
# 1. Create the Policy
aws iam create-policy \
    --policy-name LegislazuliDeployerPolicy \
    --policy-document file://sam-deploy-policy.json

# 2. Attach it to your user
aws iam attach-user-policy \
    --user-name latina-s3-user \
    --policy-arn arn:aws:iam::524390297512:policy/LegislazuliDeployerPolicy
```

## Option 2: Use a Different AWS Profile/Role

If you have access to another AWS profile with admin/deployment permissions:

```bash
# List available profiles
aws configure list-profiles

# Deploy with a different profile
sam deploy --profile <profile-name>
```

## Option 3: Request Temporary Admin Access

Ask your AWS administrator to temporarily grant you:
- `iam:CreatePolicy`
- `iam:AttachUserPolicy`

Or have them create and attach the policy for you.

## Option 4: Use AWS Console

An admin can create the policy via AWS Console:

1. Go to IAM → Policies → Create Policy
2. Click "JSON" tab
3. Paste the contents of `sam-deploy-policy.json`
4. Name it: `LegislazuliDeployerPolicy`
5. Create the policy
6. Go to Users → `latina-s3-user` → Add permissions → Attach policies
7. Select `LegislazuliDeployerPolicy` and attach

## After Policy is Attached

Once the policy is attached, you can deploy:

```bash
cd legislazuli-backend
sam build
sam deploy
```

## Required Permissions Summary

The policy includes permissions for:
- ✅ CloudFormation (create/update stacks)
- ✅ S3 (deployment bucket + application bucket)
- ✅ Lambda (create/update functions)
- ✅ IAM (create roles for Lambda)
- ✅ SNS (create topics)
- ✅ DynamoDB (create tables)
- ✅ Textract (invoke APIs)
- ✅ Bedrock (invoke Claude model)
- ✅ CloudWatch Logs (for Lambda logging)

