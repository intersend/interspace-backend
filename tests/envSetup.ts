const dotenv = require('dotenv');

dotenv.config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/interspace_test';
process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.SILENCE_ADMIN_TOKEN = 'test-admin-token';
process.env.SILENCE_NODE_URL = 'http://localhost';
process.env.ORBY_INSTANCE_PRIVATE_API_KEY = 'test-private-key';
process.env.ORBY_INSTANCE_PUBLIC_API_KEY = 'test-public-key';
process.env.ORBY_PRIVATE_INSTANCE_URL = 'http://localhost';
