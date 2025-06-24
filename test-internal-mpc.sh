#!/bin/bash

# Create a Cloud Run Job to test MPC connectivity internally

cat > test-mpc-job.yaml << 'EOF'
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: test-mpc-connectivity
  namespace: '784862970473'
spec:
  template:
    spec:
      template:
        spec:
          serviceAccountName: interspace-backend-dev@intersend.iam.gserviceaccount.com
          containers:
          - image: gcr.io/google.com/cloudsdktool/cloud-sdk:alpine
            name: test
            command: ["/bin/sh"]
            args:
            - -c
            - |
              echo "=== Testing MPC Connectivity from within Google Cloud ==="
              
              # Get identity token for duo-node
              TOKEN=$(curl -s -H "Metadata-Flavor: Google" \
                "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https://interspace-duo-node-dev-784862970473-uc.a.run.app")
              
              echo "1. Testing Duo Node Health:"
              curl -s -X GET "https://interspace-duo-node-dev-e67lrclhcq-uc.a.run.app/health" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json"
              
              echo -e "\n\n2. Testing Silence Labs Status through Duo Node:"
              curl -s -X GET "https://interspace-duo-node-dev-e67lrclhcq-uc.a.run.app/v3/status" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json"
              
              echo -e "\n\n3. Testing Backend v2 MPC Endpoints:"
              curl -s -X GET "https://interspace-backend-dev-784862970473.us-central1.run.app/api/v2/mpc/status/test" \
                -H "Content-Type: application/json"
              
              echo -e "\n\n=== Test Complete ==="
          restartPolicy: OnFailure
          parallelism: 1
          taskCount: 1
EOF

echo "Creating Cloud Run Job to test MPC connectivity..."
gcloud run jobs replace test-mpc-job.yaml \
  --region=us-central1 \
  --project=intersend

echo ""
echo "Executing the job..."
gcloud run jobs execute test-mpc-connectivity \
  --region=us-central1 \
  --project=intersend \
  --wait

echo ""
echo "Getting job logs..."
gcloud run jobs executions logs read \
  --job=test-mpc-connectivity \
  --region=us-central1 \
  --project=intersend \
  --limit=100