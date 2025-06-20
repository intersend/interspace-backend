#!/bin/bash

echo "=== GitHub Push Script for Interspace Repositories ==="
echo ""
echo "This script will help you push both repositories to GitHub."
echo "You'll need to authenticate with GitHub when prompted."
echo ""

# Function to push repository
push_repo() {
    local repo_name=$1
    local repo_path=$2
    
    echo "=== Processing $repo_name ==="
    cd "$repo_path"
    
    # Check if we're in a git repository
    if [ ! -d .git ]; then
        echo "ERROR: $repo_path is not a git repository"
        return 1
    fi
    
    # Show current status
    echo "Current branch: $(git branch --show-current)"
    echo "Remote URL: $(git remote get-url origin)"
    
    # Push to GitHub
    echo ""
    echo "Pushing to GitHub (you may be prompted for credentials)..."
    echo "NOTE: Use a GitHub Personal Access Token as the password"
    echo "To create one: https://github.com/settings/tokens"
    echo ""
    
    # Try to push
    if git push origin main --force-with-lease; then
        echo "✅ Successfully pushed $repo_name"
    else
        echo "❌ Failed to push $repo_name"
        echo "If authentication failed, please:"
        echo "1. Go to https://github.com/settings/tokens"
        echo "2. Create a new token with 'repo' scope"
        echo "3. Use your GitHub username and the token as password"
        return 1
    fi
    
    return 0
}

# Push interspace-backend
echo "=== Step 1: Pushing interspace-backend ==="
push_repo "interspace-backend" "/Users/ardaerturk/Documents/GitHub/interspace-backend"

echo ""
echo "=== Step 2: Preparing interspace-duo-node ==="
echo "Would you like to push interspace-duo-node as well? (y/n)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    # First check if duo-node has changes
    cd /Users/ardaerturk/Documents/GitHub/interspace-duo-node
    
    # Check git status
    if [ -d .git ]; then
        echo "Checking git status for interspace-duo-node..."
        git status --short
        
        # If there are changes, commit them
        if [ -n "$(git status --short)" ]; then
            echo ""
            echo "Found uncommitted changes. Would you like to commit them? (y/n)"
            read -r commit_response
            
            if [[ "$commit_response" =~ ^[Yy]$ ]]; then
                git add -A
                git commit -m "feat: sync with latest interspace-backend updates

- Updated configurations to match backend
- Ready for deployment

Co-authored-by: Claude <noreply@anthropic.com>"
            fi
        fi
        
        # Push duo-node
        push_repo "interspace-duo-node" "/Users/ardaerturk/Documents/GitHub/interspace-duo-node"
    else
        echo "ERROR: interspace-duo-node is not a git repository"
        echo "Would you like to initialize it? (y/n)"
        read -r init_response
        
        if [[ "$init_response" =~ ^[Yy]$ ]]; then
            cd /Users/ardaerturk/Documents/GitHub/interspace-duo-node
            git init
            git add -A
            git commit -m "Initial commit"
            git branch -M main
            
            echo ""
            echo "Please enter the GitHub repository URL for interspace-duo-node:"
            echo "Format: https://github.com/USERNAME/interspace-duo-node.git"
            read -r repo_url
            
            git remote add origin "$repo_url"
            push_repo "interspace-duo-node" "/Users/ardaerturk/Documents/GitHub/interspace-duo-node"
        fi
    fi
fi

echo ""
echo "=== Push Script Complete ==="
echo ""
echo "If you encountered authentication issues:"
echo "1. Create a Personal Access Token at https://github.com/settings/tokens"
echo "2. Select 'repo' scope"
echo "3. Use your GitHub username and the token as the password"
echo ""
echo "For permanent authentication, consider setting up SSH keys:"
echo "https://docs.github.com/en/authentication/connecting-to-github-with-ssh"