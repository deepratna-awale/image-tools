# AWS Deployment Guide for Image Processing Backend

This guide covers deploying the image processing backend to AWS using ECS Fargate, SQS, and S3.

## Architecture Overview

```
Internet → ALB → ECS Fargate (API) → SQS → ECS Fargate (Workers)
                      ↓                        ↓
                    S3 (Input/Output)    S3 (Input/Output)
```

## Prerequisites

1. AWS CLI configured with appropriate permissions
2. Docker installed
3. ECR repositories created
4. IAM roles and policies set up

## Step 1: Set up AWS Resources

### Create S3 Buckets
```bash
aws s3 mb s3://your-image-processing-bucket
aws s3 mb s3://your-image-processing-results
```

### Create SQS Queues
```bash
# Background removal queue
aws sqs create-queue --queue-name background-removal-queue

# Background changing queue
aws sqs create-queue --queue-name background-changing-queue

# Sky replacement queue
aws sqs create-queue --queue-name sky-replacement-queue

# Outpainting queue
aws sqs create-queue --queue-name outpainting-queue

# Dead letter queue for failed jobs
aws sqs create-queue --queue-name image-processing-dlq
```

### Create ECR Repositories
```bash
aws ecr create-repository --repository-name image-processing-api
aws ecr create-repository --repository-name image-processing-worker
```

## Step 2: Build and Push Docker Images

### Build API Image
```bash
cd backend
docker build -f deployment/docker/Dockerfile --target production -t image-processing-api .

# Tag and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

docker tag image-processing-api:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/image-processing-api:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/image-processing-api:latest
```

### Build Worker Image
```bash
# Use same Dockerfile but different command
docker build -f deployment/docker/Dockerfile --target production -t image-processing-worker .
docker tag image-processing-worker:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/image-processing-worker:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/image-processing-worker:latest
```

## Step 3: Create IAM Roles

### ECS Task Execution Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### Task Role for Image Processing
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-image-processing-bucket/*",
        "arn:aws:s3:::your-image-processing-results/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:SendMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": [
        "arn:aws:sqs:us-east-1:YOUR_ACCOUNT:background-removal-queue",
        "arn:aws:sqs:us-east-1:YOUR_ACCOUNT:background-changing-queue",
        "arn:aws:sqs:us-east-1:YOUR_ACCOUNT:sky-replacement-queue",
        "arn:aws:sqs:us-east-1:YOUR_ACCOUNT:outpainting-queue",
        "arn:aws:sqs:us-east-1:YOUR_ACCOUNT:image-processing-dlq"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-1:YOUR_ACCOUNT:parameter/image-processing/*"
      ]
    }
  ]
}
```

## Step 4: Create ECS Cluster and Services

### Create ECS Cluster
```bash
aws ecs create-cluster --cluster-name image-processing-cluster
```

### Register Task Definitions
```bash
# Update task definitions with your account info
aws ecs register-task-definition --cli-input-json file://deployment/aws/ecs/api-task-definition.json
aws ecs register-task-definition --cli-input-json file://deployment/aws/ecs/worker-task-definition.json
```

### Create ALB and Target Group
```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name image-processing-alb \
  --subnets subnet-12345 subnet-67890 \
  --security-groups sg-12345

# Create target group
aws elbv2 create-target-group \
  --name image-processing-api-tg \
  --protocol HTTP \
  --port 8000 \
  --vpc-id vpc-12345 \
  --target-type ip \
  --health-check-path /health
```

### Create ECS Services
```bash
# API Service
aws ecs create-service \
  --cluster image-processing-cluster \
  --service-name image-processing-api \
  --task-definition image-processing-api:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345,subnet-67890],securityGroups=[sg-12345],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:YOUR_ACCOUNT:targetgroup/image-processing-api-tg,containerName=api-container,containerPort=8000

# Worker Service
aws ecs create-service \
  --cluster image-processing-cluster \
  --service-name image-processing-worker \
  --task-definition image-processing-worker:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345,subnet-67890],securityGroups=[sg-12345]}"
```

## Step 5: Configure Auto Scaling

### API Service Auto Scaling
```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/image-processing-cluster/image-processing-api \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/image-processing-cluster/image-processing-api \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name image-processing-api-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{"TargetValue":70.0,"PredefinedMetricSpecification":{"PredefinedMetricType":"ECSServiceAverageCPUUtilization"}}'
```

### Worker Service Auto Scaling (Based on Queue Depth)
```bash
# Register scalable target for workers
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/image-processing-cluster/image-processing-worker \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 20

# Create custom metric for queue depth scaling
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/image-processing-cluster/image-processing-worker \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name worker-queue-depth-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://queue-depth-scaling-policy.json
```

## Step 6: Set up Monitoring

### CloudWatch Alarms
```bash
# High queue depth alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "High-Queue-Depth" \
  --alarm-description "Alarm when queue depth is high" \
  --metric-name ApproximateNumberOfMessages \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=QueueName,Value=background-removal-queue \
  --evaluation-periods 2

# API latency alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "High-API-Latency" \
  --alarm-description "Alarm when API latency is high" \
  --metric-name TargetResponseTime \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## Environment Variables

Set these in your task definitions or parameter store:

```
# Required
AWS_REGION=us-east-1
QUEUE_TYPE=sqs
STORAGE_TYPE=s3
S3_BUCKET_NAME=your-image-processing-bucket
S3_RESULTS_BUCKET=your-image-processing-results

# Optional
LOG_LEVEL=INFO
MAX_FILE_SIZE=10485760
JOB_RESULT_TTL=3600
WORKER_CONCURRENCY=2
```

## Cost Optimization

1. **Use Spot Instances for Workers**: Workers can handle interruptions gracefully
2. **S3 Lifecycle Policies**: Auto-delete old processed images
3. **CloudWatch Logs Retention**: Set appropriate retention periods
4. **ECS Service Auto Scaling**: Scale down during low usage
5. **Reserved Capacity**: For consistent workloads

## Security Best Practices

1. **Network Security**: Use private subnets for workers
2. **IAM Least Privilege**: Minimal permissions for each component
3. **Secrets Management**: Use Parameter Store/Secrets Manager
4. **VPC Endpoints**: For S3 and SQS access
5. **WAF**: Protect the ALB
6. **Container Scanning**: Use ECR vulnerability scanning

## Monitoring and Alerting

Key metrics to monitor:
- Queue depth for each service
- API response times
- Error rates
- Worker processing times
- S3 costs
- ECS CPU/Memory utilization

## Disaster Recovery

1. **Multi-AZ Deployment**: Deploy across multiple availability zones
2. **Cross-Region Backup**: Replicate critical S3 data
3. **Database Backups**: If using RDS for job metadata
4. **Infrastructure as Code**: Use CloudFormation/Terraform
5. **Runbook**: Document recovery procedures
