import { add, multiply } from '../src/calculator';
import { createLogger } from '../src/logger';

jest.mock('../src/calculator', () => ({
  ...jest.requireActual('../src/calculator'),
  add: jest.fn(() => 99),
}));

let logSpy: jest.SpyInstance;
let mockedAdd: jest.MockedFunction<typeof add>;
let mockedLogger: jest.Mocked<ReturnType<typeof createLogger>>;

class Greeter {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

let mockedGreeter: jest.MockedClass<typeof Greeter>;

beforeAll(() => jest.useFakeTimers());

afterAll(() => jest.useRealTimers());

describe('mock transformation cases', () => {
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockedAdd = add as jest.MockedFunction<typeof add>;
    mockedAdd.mockImplementation(() => 99);
    mockedLogger = { log: jest.fn() } as jest.Mocked<ReturnType<typeof createLogger>>;
    mockedGreeter = Greeter as unknown as jest.MockedClass<typeof Greeter>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  it('mocked add returns 99', () => {
    expect(add(1, 2)).toBe(99);
  });

  it('multiply returns actual result via requireActual', () => {
    expect(multiply(2, 3)).toBe(6);
  });

  it('spyOn captures console.log calls', () => {
    console.log('hello world');
    expect(logSpy).toHaveBeenCalledWith('hello world');
  });

  it('mockedAdd is defined', () => {
    expect(mockedAdd).toBeDefined();
  });

  it('mockedLogger mock methods work', () => {
    mockedLogger.log('info', 'test message');
    expect(mockedLogger.log).toHaveBeenCalledWith('info', 'test message');
  });

  it('mockedGreeter is defined', () => {
    expect(mockedGreeter).toBeDefined();
  });
});

xdescribe('transformation coverage for problematic runtime cases', () => {
  it('jest.setTimeout transformation', () => {
    jest.setTimeout(50_000);
  });

  it('jest.createMockFromModule transformation', () => {
    const mock = jest.createMockFromModule('../src/calculator');
    expect(mock).toBeDefined();
  });

  it('jest.setMock transformation', () => {
    jest.setMock('../src/logger', { createLogger: jest.fn() });
    expect(true).toBe(true);
  });

  it('jest.dontMock transformation', () => {
    jest.dontMock('../src/logger');
    expect(true).toBe(true);
  });

  it('jest.requireMock transformation inside a helper', async () => {
    const loadCalculator = () => {
      return jest.requireMock('../src/calculator');
    };

    const calculator = await loadCalculator();
    expect(calculator).toBeDefined();
  });
});
