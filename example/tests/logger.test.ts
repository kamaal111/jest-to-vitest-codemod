import { createLogger, type Logger } from '../src/logger';

describe('logger', () => {
  let mockWriter: jest.Mock;
  let logger: Logger;

  beforeEach(() => {
    mockWriter = jest.fn();
    logger = createLogger(mockWriter);
  });

  afterEach(() => jest.restoreAllMocks());

  it('should log info messages', () => {
    logger.log('info', 'hello');
    expect(mockWriter).toHaveBeenCalledWith('[INFO] hello');
  });

  it('should log warn messages', () => {
    logger.log('warn', 'be careful');
    expect(mockWriter).toHaveBeenCalledWith('[WARN] be careful');
  });

  it('should log error messages', () => {
    logger.log('error', 'something broke');
    expect(mockWriter).toHaveBeenCalledWith('[ERROR] something broke');
  });

  it('should call writer exactly once per log call', () => {
    logger.log('info', 'test');
    expect(mockWriter).toHaveBeenCalledTimes(1);
  });
});
