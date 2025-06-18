# CONTRIBUTING GUIDE

**Purpose**: Guidelines for contributing to Interspace Backend  
**Audience**: Internal and external developers

## Code Standards

### TypeScript Guidelines
```typescript
// ✅ Good: Explicit types
interface UserProfile {
  id: string;
  name: string;
  walletAddress: string;
}

// ❌ Bad: Any types
function processData(data: any) { }

// ✅ Good: Async/await
async function getProfile(id: string): Promise<UserProfile> {
  return await profileService.findById(id);
}

// ❌ Bad: Nested callbacks
function getProfile(id, callback) { }
```

### Naming Conventions
- **Files**: camelCase (`smartProfileService.ts`)
- **Classes**: PascalCase (`SmartProfileService`)
- **Functions**: camelCase (`createProfile`)
- **Constants**: UPPER_SNAKE (`MAX_PROFILES`)
- **Interfaces**: PascalCase with I prefix optional (`IUserProfile` or `UserProfile`)

### File Organization
```
src/
├── controllers/     # Request handlers
├── services/        # Business logic
├── middleware/      # Express middleware
├── routes/          # Route definitions
├── types/           # TypeScript types
├── utils/           # Utilities
└── index.ts         # Entry point
```

## Development Workflow

### 1. Branch Strategy
```bash
# Feature branches
git checkout -b feature/add-wallet-connect

# Bug fixes
git checkout -b fix/auth-token-expiry

# Hotfixes
git checkout -b hotfix/critical-security-patch
```

### 2. Commit Messages
```bash
# Format: <type>(<scope>): <subject>

# Examples:
git commit -m "feat(auth): add social login support"
git commit -m "fix(profile): resolve duplicate name issue"
git commit -m "docs(api): update endpoint documentation"
git commit -m "test(mpc): add integration tests"
git commit -m "refactor(service): optimize database queries"
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Tests
- `refactor`: Code refactoring
- `perf`: Performance
- `chore`: Maintenance

### 3. Pull Request Process
1. **Create PR early** (draft if WIP)
2. **Fill PR template** completely
3. **Link related issues**
4. **Add reviewers**
5. **Ensure CI passes**
6. **Address feedback**
7. **Squash and merge**

## Testing Requirements

### Unit Tests
```typescript
// Required for all services
describe('SmartProfileService', () => {
  it('should create profile with session wallet', async () => {
    const profile = await service.createProfile({
      name: 'Test Profile',
      userId: 'test-user'
    });
    
    expect(profile).toBeDefined();
    expect(profile.sessionWalletAddress).toMatch(/^0x/);
  });
});
```

### Integration Tests
```typescript
// Required for API endpoints
describe('POST /api/v1/profiles', () => {
  it('should return 201 with valid data', async () => {
    const response = await request(app)
      .post('/api/v1/profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Profile' });
      
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

### Test Coverage
- Minimum 80% coverage required
- Critical paths must have 100%
- Run: `npm run test:coverage`

## Code Review Checklist

### Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] Authentication checks
- [ ] Authorization verified

### Performance
- [ ] Database queries optimized
- [ ] No N+1 queries
- [ ] Pagination implemented
- [ ] Caching considered
- [ ] Async operations used

### Code Quality
- [ ] Types properly defined
- [ ] Error handling complete
- [ ] Logging appropriate
- [ ] Comments for complex logic
- [ ] No console.log statements
- [ ] DRY principles followed

### Testing
- [ ] Unit tests written
- [ ] Integration tests added
- [ ] Edge cases covered
- [ ] Error cases tested
- [ ] Mocks used appropriately

## API Design Guidelines

### RESTful Conventions
```
GET    /api/v1/profiles           # List
POST   /api/v1/profiles           # Create
GET    /api/v1/profiles/:id       # Read
PUT    /api/v1/profiles/:id       # Update
DELETE /api/v1/profiles/:id       # Delete

POST   /api/v1/profiles/:id/link  # Action
```

### Response Format
```typescript
// Success
{
  "success": true,
  "data": { /* response data */ }
}

// Error
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### Status Codes
- `200` OK
- `201` Created
- `400` Bad Request
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `429` Too Many Requests
- `500` Internal Error

## Database Guidelines

### Migrations
```bash
# Create migration
npm run prisma:migrate:dev -- --name add_user_field

# Migration file naming
YYYYMMDDHHMMSS_descriptive_name.sql
```

### Schema Changes
1. Always backward compatible
2. Add defaults for new fields
3. Create indexes for queries
4. Document relationships

### Query Optimization
```typescript
// ✅ Good: Select specific fields
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true }
});

// ❌ Bad: Select everything
const user = await prisma.user.findUnique({
  where: { id },
  include: { everything: true }
});
```

## Documentation

### Code Comments
```typescript
/**
 * Creates a new SmartProfile with session wallet
 * @param data Profile creation data
 * @returns Created profile with wallet address
 * @throws {ProfileLimitError} If user exceeds profile limit
 */
async function createProfile(data: CreateProfileDto): Promise<Profile> {
  // Implementation
}
```

### API Documentation
- Update OpenAPI spec
- Include request/response examples
- Document error codes
- Add authentication requirements

## Security Practices

### Never Do
```typescript
// ❌ Log sensitive data
logger.info('User login', { password });

// ❌ Disable security features
app.use(cors({ origin: '*' }));

// ❌ Trust user input
const query = `SELECT * FROM users WHERE id = ${userId}`;
```

### Always Do
```typescript
// ✅ Sanitize logs
logger.info('User login', { email });

// ✅ Validate input
const { error } = schema.validate(req.body);

// ✅ Use parameterized queries
prisma.user.findUnique({ where: { id } });
```

## Release Process

### 1. Pre-release
- [ ] All tests passing
- [ ] Security scan clean
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Version bumped

### 2. Release
```bash
# Tag release
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

### 3. Post-release
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Update status page
- [ ] Notify stakeholders

## Getting Started

### First Time Setup
```bash
# Clone repository
git clone https://github.com/intersend/interspace-backend.git

# Install dependencies
npm install

# Setup environment
cp .env.example .env.development

# Run tests
npm test

# Start development
npm run dev
```

### Making Changes
1. Create feature branch
2. Make changes
3. Add tests
4. Run checks: `npm run check`
5. Commit with proper message
6. Push and create PR

---

**Remember**: Quality over speed. Take time to write clean, tested, documented code.