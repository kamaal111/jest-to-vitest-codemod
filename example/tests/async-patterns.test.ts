import { describe, it, expect } from '@jest/globals';

import { fetchUser } from '../src/user-service';

describe('async-patterns', () => {
  describe('done callback pattern', () => {
    it('fetches user using done callback', done => {
      setTimeout(() => {
        const user = fetchUser(1);
        expect(user.id).toBe(1);
        expect(user.name).toBe('User 1');
        done();
      }, 0);
    });

    it('handles error via done callback', done => {
      setTimeout(() => {
        try {
          const user = fetchUser(2);
          expect(user.email).toBe('user2@example.com');
          done();
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)));
        }
      }, 0);
    });

    test('test() also supports done callback', done => {
      setTimeout(() => {
        const user = fetchUser(3);
        expect(user.name).toBe('User 3');
        done();
      }, 0);
    });

    test('test() with timeout and done callback', done => {
      setTimeout(() => {
        const user = fetchUser(4);
        expect(user.id).toBe(4);
        done();
      }, 0);
    }, 5000);
  });
});
