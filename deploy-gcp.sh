#!/usr/bin/env bash
set -e

# Automatically detect and configure Google Cloud SDK
if [ -d "$HOME/google-cloud-sdk" ]; then
  export CLOUDSDK_PYTHON="${CLOUDSDK_PYTHON:-$HOME/google-cloud-sdk/python/bin/python3}"
  export PATH="$HOME/google-cloud-sdk/bin:$PATH"
fi

echo "=================================================="
echo "  TaskFlow - Google Cloud Project & Deploy Setup"
echo "=================================================="

# Check if gcloud CLI is installed
if ! command -v gcloud &> /dev/null; then
  echo ""
  echo "❌ Error: Google Cloud SDK ('gcloud') is not installed or not in your PATH."
  echo ""
  echo "To install gcloud on macOS via Homebrew:"
  echo "  brew install --cask google-cloud-sdk"
  echo ""
  echo "Or download directly from Google Cloud:"
  echo "  https://cloud.google.com/sdk/docs/install"
  echo ""
  exit 1
fi

echo "1. Checking Google Cloud authentication..."
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
if [ -z "$ACCOUNT" ]; then
  echo "No active GCP account found. Starting sign-in..."
  gcloud auth login
  ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
fi
echo "✓ Logged in as: $ACCOUNT"

# Generate unique project ID
RAND_SUFFIX=$(od -An -N2 -tu2 /dev/urandom | tr -d ' ' | cut -c1-4)
DEFAULT_PROJECT_ID="taskflow-app-${RAND_SUFFIX}"

echo ""
read -p "Enter a new GCP Project ID (or press Enter for '$DEFAULT_PROJECT_ID'): " USER_PROJECT_ID
PROJECT_ID=${USER_PROJECT_ID:-$DEFAULT_PROJECT_ID}

echo ""
echo "2. Creating GCP project: $PROJECT_ID..."
if gcloud projects describe "$PROJECT_ID" &> /dev/null; then
  echo "✓ Project $PROJECT_ID already exists. Using existing project."
else
  gcloud projects create "$PROJECT_ID" --name="TaskFlow To-Do App"
  echo "✓ Created project: $PROJECT_ID"
fi

echo "Setting default project..."
gcloud config set project "$PROJECT_ID"

echo ""
echo "3. Linking Billing Account (required by GCP for Cloud Run)..."
BILLING_ACCOUNT=$(gcloud billing accounts list --filter=open=true --format="value(name)" | head -n 1)
if [ -n "$BILLING_ACCOUNT" ]; then
  echo "Linking open billing account: $BILLING_ACCOUNT..."
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT" || true
else
  echo "⚠️ No open billing account detected automatically."
  echo "Please link billing in the Google Cloud Console:"
  echo "👉 https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
  read -p "Press Enter once billing is linked to proceed..."
fi

echo ""
echo "4. Enabling required APIs (Cloud Run & Cloud Build)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

echo ""
echo "5. Deploying TaskFlow to Google Cloud Run..."
REGION="us-central1"
read -p "Enter deployment region (default: $REGION): " USER_REGION
REGION=${USER_REGION:-$REGION}

gcloud run deploy taskflow \
  --source . \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080

echo ""
echo "=================================================="
echo "🎉 SUCCESS! TaskFlow is deployed on Google Cloud!"
echo "Service URL:"
gcloud run services describe taskflow --platform managed --region "$REGION" --format="value(status.url)"
echo "=================================================="

