#!/bin/bash

echo "=== Quick Push for Interspace Backend ==="
echo ""
echo "Current Status:"
echo "Branch: $(git branch --show-current)"
echo "Remote: $(git remote get-url origin)"
echo ""
echo "This will FORCE PUSH to override the remote repository."
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

echo ""
echo "Pushing to GitHub..."
echo ""
echo "When prompted:"
echo "  Username: ardaerturk"
echo "  Password: [Your GitHub Personal Access Token]"
echo ""
echo "To create a token:"
echo "1. Open: https://github.com/settings/tokens"
echo "2. Click 'Generate new token (classic)'"
echo "3. Name: 'interspace-push'"
echo "4. Select scope: 'repo' (full control)"
echo "5. Generate and copy the token"
echo ""

# Try to push
git push origin main --force-with-lease

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "Next steps for interspace-duo-node:"
    echo "1. cd ../interspace-duo-node"
    echo "2. git add -A"
    echo "3. git commit -m 'feat: sync with backend updates'"
    echo "4. git push origin main"
else
    echo ""
    echo "❌ Push failed. Please check your credentials and try again."
fi