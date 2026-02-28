export interface User {
  id: number;
  name: string;
  email: string;
}

export function fetchUser(id: number): User {
  return { id, name: `User ${id}`, email: `user${id}@example.com` };
}

export function formatUser(user: User): string {
  return `${user.name} <${user.email}>`;
}

export function createNotifier(callback: (message: string) => void) {
  return {
    notify(user: User) {
      callback(`Hello, ${user.name}!`);
    },
  };
}
