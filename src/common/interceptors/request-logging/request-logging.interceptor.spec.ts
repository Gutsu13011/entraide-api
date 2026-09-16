import { RequestLoggingInterceptor } from './request-logging.interceptor.js';

describe('RequestLoggingInterceptor', () => {
  it('should be defined', () => {
    expect(new RequestLoggingInterceptor()).toBeDefined();
  });
});
