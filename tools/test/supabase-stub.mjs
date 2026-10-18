// Stub tối giản cho @supabase/supabase-js dùng trong kiểm thử offline.
function chain() {
  const result = { data: [], error: null, count: 0 };
  const handler = {
    get(target, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      if (prop === 'catch') return (fn) => Promise.resolve(result).catch(fn);
      if (prop === 'finally') return (fn) => Promise.resolve(result).finally(fn);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve({ data: null, error: null });
      return () => proxy;
    },
  };
  const proxy = new Proxy(function () {}, handler);
  return proxy;
}
export function createClient() {
  const sub = { unsubscribe() {} };
  const channel = { on() { return channel; }, subscribe() { return channel; }, unsubscribe() { return Promise.resolve('ok'); } };
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: sub } }),
      signInWithPassword: async () => ({ data: null, error: { message: 'stub' } }),
      signInWithOtp: async () => ({ data: null, error: { message: 'stub' } }),
      signUp: async () => ({ data: null, error: { message: 'stub' } }),
      signOut: async () => ({ error: null }),
    },
    from: () => chain(),
    rpc: () => chain(),
    channel: () => channel,
    removeChannel: () => {},
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  };
}
export default { createClient };
