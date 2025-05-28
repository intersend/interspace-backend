describe('Basic Test Setup', () => {
  test('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  test('should verify test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
