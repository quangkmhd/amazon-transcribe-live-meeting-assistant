#!/bin/bash

# Script to apply the virtual_participants migration to Supabase
# This script uses psql to directly execute the migration SQL

set -e  # Exit on error

echo "🚀 Applying Virtual Participants Migration to Supabase..."
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if SUPABASE_URL is set
if [ -z "$SUPABASE_URL" ]; then
    echo "❌ Error: SUPABASE_URL not set"
    echo "   Please set SUPABASE_URL in your .env file"
    exit 1
fi

# Extract database connection info from SUPABASE_URL
PROJECT_REF=$(echo $SUPABASE_URL | sed -n 's/.*\/\/\([^.]*\).*/\1/p')

echo "📋 Migration Details:"
echo "   Project: $PROJECT_REF"
echo "   File: supabase/migrations/009_create_virtual_participants.sql"
echo ""

# Method 1: Try using psql if available
if command -v psql &> /dev/null; then
    echo "✅ psql found, attempting direct connection..."
    echo ""
    echo "⚠️  Note: This requires your database password"
    echo "   Get it from: Supabase Dashboard → Settings → Database → Connection string"
    echo ""
    
    # Prompt for password
    read -sp "Enter your Supabase database password: " DB_PASSWORD
    echo ""
    echo ""
    
    # Construct connection string
    DB_URL="postgresql://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"
    
    echo "🔄 Executing migration..."
    psql "$DB_URL" -f supabase/migrations/009_create_virtual_participants.sql
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Migration applied successfully!"
        echo ""
        echo "📋 Next steps:"
        echo "   1. Verify table exists: Supabase Dashboard → Table Editor → virtual_participants"
        echo "   2. Start the UI: cd lma-ai-stack/source/ui && npm start"
        echo "   3. Test the fix by navigating to Virtual Participants page"
        echo ""
    else
        echo ""
        echo "❌ Migration failed. Please apply manually via Supabase Dashboard."
        exit 1
    fi
else
    echo "⚠️  psql not found in PATH"
    echo ""
    echo "📝 Manual Application Required:"
    echo ""
    echo "   1. Open Supabase Dashboard: https://app.supabase.com/project/${PROJECT_REF}"
    echo "   2. Go to: SQL Editor"
    echo "   3. Create a new query"
    echo "   4. Copy and paste the entire contents of:"
    echo "      supabase/migrations/009_create_virtual_participants.sql"
    echo "   5. Click 'Run' or press Ctrl+Enter"
    echo "   6. Verify all statements executed successfully"
    echo ""
    echo "✅ After applying the migration:"
    echo "   - Start the UI: cd lma-ai-stack/source/ui && npm start"
    echo "   - Navigate to Virtual Participants page"
    echo "   - Error should be gone!"
    echo ""
fi

