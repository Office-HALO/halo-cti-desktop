let listeners = [];
let counter = 0;

export function showToast(type, msg) {
  const id = ++counter;
  const toast = { id, type, msg };
  listeners.forEach((fn) => fn({ type: 'add', toast }));
  setTimeout(() => {
    listeners.forEach((fn) => fn({ type: 'remove', id }));
  }, 3500);
}

export function subscribeToast(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
