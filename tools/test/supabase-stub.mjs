// Stub tối giản cho @supabase/supabase-js dùng trong kiểm thử offline.
// Chuỗi truy vấn giả: mọi bộ lọc/sắp xếp (select, eq, neq, order(..., { nullsFirst }), limit, in, is, ...)
// trả lại chính chuỗi; await ra { data: [], error: null }; single()/maybeSingle() ra { data: null, error: null }.
// Dùng cho cả bảng orders/products/settings/profiles và bảng members (thành viên): rỗng, không lỗi.
function chain(table = '') {
  const list = { data: [], error: null, count: 0 };
  const one = { data: null, error: null };
  const handler = {
    get(target, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(list).then(res, rej);
      if (prop === 'catch') return (fn) => Promise.resolve(list).catch(fn);
      if (prop === 'finally') return (fn) => Promise.resolve(list).finally(fn);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(one);
      // eq, neq, order, limit, select, insert, update, delete, in, is, or, range, ...
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
    from: (table) => chain(table),
    rpc: () => chain('rpc'),
    channel: () => channel,
    removeChannel: () => {},
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  };
}
export default { createClient };
