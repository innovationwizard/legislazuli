# Attach Policy to legislazuli-user

The `legislazuli-user` needs the `LegislazuliDeployerPolicy` attached. 

## If you have admin access:

```bash
# Attach the policy (if it already exists)
aws iam attach-user-policy \
    --user-name legislazuli-user \
    --policy-arn arn:aws:iam::524390297512:policy/LegislazuliDeployerPolicy

# Or create and attach if it doesn't exist
aws iam create-policy \
    --policy-name LegislazuliDeployerPolicy \
    --policy-document file://sam-deploy-policy.json

aws iam attach-user-policy \
    --user-name legislazuli-user \
    --policy-arn arn:aws:iam::524390297512:policy/LegislazuliDeployerPolicy
```

## Current Error:

The user is missing `cloudformation:DescribeChangeSet` permission. The updated policy includes all necessary CloudFormation permissions.

## After attaching the policy:

```bash
cd legislazuli-backend
sam deploy --profile legislazuli
```

