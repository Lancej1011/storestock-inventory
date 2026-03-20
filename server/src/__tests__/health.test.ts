import request from 'supertest';
import { app } from '../app.js';
import { describe, it, expect } from '@jest/globals';

describe('Health Check', () => {
  it('should return 200 and ok status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        timestamp: expect.any(String),
      })
    );
  });
});
