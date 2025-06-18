#!/usr/bin/env node

// Production start script with proper tsconfig-paths configuration
require('tsconfig-paths/register');

// Load environment variables
require('dotenv').config();

// Start the application
require('../dist/index.js');