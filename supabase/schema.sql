-- =====================================================================
-- Cua Cô Thúy - Schema + phân quyền (Row Level Security) cho Supabase
-- Chạy toàn bộ file này 1 lần trong Supabase > SQL Editor.
-- =====================================================================

-- ---------- Bảng ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  address     text,
  role        text not null default 'customer' check (role in ('customer','staff','admin')),
  points      integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text,
  price       integer not null check (price >= 0),   -- VND / đơn vị
  unit        text not null default 'kg',
  badge       text,
  sort        integer not null default 0,
  active      boolean not null default true
);

create table if not exists public.settings (
  key   text primary key,
  value text not null
);

create table if not exists public.orders (
  id             bigint generated always as identity primary key,
  customer_id    uuid references public.profiles(id) on delete set null,
  customer_name  text not null,
  phone          text not null,
  address        text not null,
  note           text,
  staff_note     text,
  status         text not null default 'moi'
                 check (status in ('moi','xac_nhan','dang_giao','da_giao','huy')),
  total          integer not null default 0,
  points_awarded integer not null default 0,
  created_by     uuid references public.profiles(id) on delete set null,
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.orders add column if not exists delivery_time text;  -- thời gian giao khách hẹn
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists orders_status_idx   on public.orders(status, created_at desc);

create table if not exists public.order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders(id) on delete cascade,
  product_id   bigint references public.products(id) on delete set null,
  product_name text not null,
  unit_price   integer not null,
  quantity     numeric(8,2) not null check (quantity > 0),
  unit         text not null default 'kg'
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- ---------- Hàm kiểm tra vai trò ----------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('staff','admin'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Tự tạo profile khi có tài khoản mới ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, phone)
  values (new.id,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'phone');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Khách tự sửa profile được, nhưng KHÔNG được tự đổi role/điểm
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and not public.is_admin()
     and (new.role is distinct from old.role or new.points is distinct from old.points) then
    raise exception 'Không có quyền đổi vai trò hoặc điểm';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------- Tích điểm: cộng khi đơn "đã giao", trừ lại nếu đổi trạng thái ----------
create or replace function public.order_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare rate integer;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status = 'da_giao' and old.status <> 'da_giao' and new.customer_id is not null then
    select coalesce(value::int, 10000) into rate from settings where key = 'vnd_per_point';
    new.points_awarded := floor(new.total / greatest(coalesce(rate,10000),1));
    update profiles set points = points + new.points_awarded where id = new.customer_id;
  elsif old.status = 'da_giao' and new.status <> 'da_giao' and old.customer_id is not null then
    update profiles set points = greatest(points - old.points_awarded, 0) where id = old.customer_id;
    new.points_awarded := 0;
  end if;
  return new;
end $$;

drop trigger if exists order_points on public.orders;
create trigger order_points before update on public.orders
  for each row execute function public.order_points();

-- ---------- Tạo đơn: giá luôn lấy từ bảng products (khách không sửa giá được) ----------
-- p_items: [{"product_id": 1, "quantity": 1.5}, ...]
-- Bản cũ chưa có thời gian giao: xóa để không bị trùng hàm khi gọi
drop function if exists public.create_order(text,text,text,text,jsonb,uuid);
create or replace function public.create_order(
  p_customer_name text, p_phone text, p_address text, p_note text,
  p_items jsonb, p_customer_id uuid default null, p_delivery_time text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_order bigint; v_cust uuid; v_total integer := 0;
  it jsonb; pr products%rowtype; q numeric;
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  if coalesce(trim(p_customer_name),'') = '' or coalesce(trim(p_phone),'') = ''
     or coalesce(trim(p_address),'') = '' then
    raise exception 'Thiếu tên, số điện thoại hoặc địa chỉ';
  end if;
  if length(p_customer_name) > 100 or length(p_phone) > 20
     or length(p_address) > 300 or length(coalesce(p_note,'')) > 500
     or length(coalesce(p_delivery_time,'')) > 100 then
    raise exception 'Thông tin quá dài';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn chưa có sản phẩm';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'Đơn có quá nhiều dòng sản phẩm';
  end if;

  if is_staff() then
    -- Nhân viên đặt hộ: gắn vào tài khoản khách nếu trùng số điện thoại
    v_cust := coalesce(p_customer_id,
              (select id from profiles where phone = trim(p_phone) and role = 'customer' limit 1));
  else
    v_cust := auth.uid();
  end if;

  insert into orders (customer_id, customer_name, phone, address, note, delivery_time, created_by)
  values (v_cust, trim(p_customer_name), trim(p_phone), trim(p_address), p_note,
          nullif(trim(coalesce(p_delivery_time,'')),''), auth.uid())
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from products where id = (it->>'product_id')::bigint and active;
    if not found then raise exception 'Sản phẩm không tồn tại'; end if;
    q := (it->>'quantity')::numeric;
    if q is null or q <= 0 or q > 100 then raise exception 'Số lượng không hợp lệ'; end if;
    insert into order_items (order_id, product_id, product_name, unit_price, quantity, unit)
    values (v_order, pr.id, pr.name, pr.price, q, pr.unit);
    v_total := v_total + round(pr.price * q);
  end loop;

  update orders set total = v_total where id = v_order;
  return v_order;
end $$;

-- Nhân viên sửa đơn đã tạo: thông tin khách + danh sách hàng.
-- Dòng hàng giữ nguyên đơn giá cũ nếu cùng sản phẩm; sản phẩm mới thêm vào lấy giá hiện tại.
-- Đơn đã giao: điểm của khách được cộng/trừ phần chênh lệch cho khớp tổng tiền mới.
-- p_items: [{"product_id": 1, "quantity": 1.5}, ...]
drop function if exists public.update_order(bigint,text,text,text,text,jsonb);
create or replace function public.update_order(
  p_order bigint, p_customer_name text, p_phone text, p_address text, p_note text,
  p_items jsonb, p_delivery_time text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; v_total integer := 0; v_max bigint; v_old integer; v_new integer; rate integer;
  it jsonb; pr products%rowtype; q numeric; v_price integer;
begin
  if not is_staff() then raise exception 'Chỉ nhân viên'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  if coalesce(trim(p_customer_name),'') = '' or coalesce(trim(p_phone),'') = ''
     or coalesce(trim(p_address),'') = '' then
    raise exception 'Thiếu tên, số điện thoại hoặc địa chỉ';
  end if;
  if length(p_customer_name) > 100 or length(p_phone) > 20
     or length(p_address) > 300 or length(coalesce(p_note,'')) > 500
     or length(coalesce(p_delivery_time,'')) > 100 then
    raise exception 'Thông tin quá dài';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn chưa có sản phẩm';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'Đơn có quá nhiều dòng sản phẩm';
  end if;

  select coalesce(max(id),0) into v_max from order_items where order_id = p_order;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from products where id = (it->>'product_id')::bigint;
    if not found then raise exception 'Sản phẩm không tồn tại'; end if;
    q := (it->>'quantity')::numeric;
    if q is null or q <= 0 or q > 100 then raise exception 'Số lượng không hợp lệ'; end if;
    select unit_price into v_price from order_items
      where order_id = p_order and product_id = pr.id and id <= v_max order by id limit 1;
    v_price := coalesce(v_price, pr.price);
    insert into order_items (order_id, product_id, product_name, unit_price, quantity, unit)
    values (p_order, pr.id, pr.name, v_price, q, pr.unit);
    v_total := v_total + round(v_price * q);
  end loop;
  delete from order_items where order_id = p_order and id <= v_max;

  v_new := o.points_awarded;
  if o.status = 'da_giao' and o.customer_id is not null then
    select coalesce(value::int, 10000) into rate from settings where key = 'vnd_per_point';
    v_new := floor(v_total / greatest(coalesce(rate,10000),1));
    update profiles set points = greatest(points + v_new - o.points_awarded, 0) where id = o.customer_id;
  end if;

  update orders set customer_name = trim(p_customer_name), phone = trim(p_phone),
    address = trim(p_address), note = nullif(trim(coalesce(p_note,'')),''),
    delivery_time = nullif(trim(coalesce(p_delivery_time,'')),''),
    total = v_total, points_awarded = v_new
  where id = p_order;
end $$;

-- Khách tự hủy đơn khi đơn còn "mới"
create or replace function public.cancel_my_order(p_order bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'huy'
  where id = p_order and customer_id = auth.uid() and status = 'moi';
  if not found then raise exception 'Không hủy được đơn này'; end if;
end $$;

-- Admin gán vai trò theo email
create or replace function public.set_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Chỉ admin'; end if;
  if p_role not in ('customer','staff','admin') then raise exception 'Vai trò sai'; end if;
  update profiles set role = p_role
  where id = (select id from auth.users where lower(email) = lower(trim(p_email)));
  if not found then raise exception 'Không tìm thấy email'; end if;
end $$;

-- Danh sách nhân viên (chỉ admin)
create or replace function public.list_staff()
returns table (email text, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select u.email::text, p.full_name, p.role
  from profiles p join auth.users u on u.id = p.id
  where p.role in ('staff','admin') and is_admin()
  order by p.role, u.email;
$$;

-- ---------- Row Level Security ----------
alter table public.profiles    enable row level security;
alter table public.products    enable row level security;
alter table public.settings    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- profiles: xem/sửa của mình; nhân viên xem tất cả; admin sửa tất cả
drop policy if exists p_profiles_select on public.profiles;
create policy p_profiles_select on public.profiles for select
  using (id = auth.uid() or is_staff());
drop policy if exists p_profiles_update on public.profiles;
create policy p_profiles_update on public.profiles for update
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- products: ai cũng xem hàng đang bán; nhân viên quản lý
drop policy if exists p_products_select on public.products;
create policy p_products_select on public.products for select
  using (active or is_staff());
drop policy if exists p_products_write on public.products;
create policy p_products_write on public.products for all
  using (is_staff()) with check (is_staff());

-- settings: ai cũng đọc; admin sửa
drop policy if exists p_settings_select on public.settings;
create policy p_settings_select on public.settings for select using (true);
drop policy if exists p_settings_write on public.settings;
create policy p_settings_write on public.settings for all
  using (is_admin()) with check (is_admin());

-- orders: khách chỉ thấy đơn của mình; nhân viên thấy và cập nhật tất cả.
-- Không có policy INSERT: đơn chỉ được tạo qua hàm create_order.
drop policy if exists p_orders_select on public.orders;
create policy p_orders_select on public.orders for select
  using (customer_id = auth.uid() or is_staff());
drop policy if exists p_orders_update on public.orders;
create policy p_orders_update on public.orders for update
  using (is_staff()) with check (is_staff());
drop policy if exists p_orders_delete on public.orders;
create policy p_orders_delete on public.orders for delete using (is_admin());

drop policy if exists p_items_select on public.order_items;
create policy p_items_select on public.order_items for select
  using (exists (select 1 from orders o where o.id = order_id
                 and (o.customer_id = auth.uid() or is_staff())));
drop policy if exists p_items_write on public.order_items;
create policy p_items_write on public.order_items for all
  using (is_staff()) with check (is_staff());

-- Quyền gọi hàm
revoke execute on function public.create_order(text,text,text,text,jsonb,uuid,text) from anon, public;
revoke execute on function public.cancel_my_order(bigint) from anon, public;
revoke execute on function public.update_order(bigint,text,text,text,text,jsonb,text) from anon, public;
revoke execute on function public.set_role(text,text) from anon, public;
revoke execute on function public.list_staff() from anon, public;
grant  execute on function public.create_order(text,text,text,text,jsonb,uuid,text) to authenticated;
grant  execute on function public.cancel_my_order(bigint) to authenticated;
grant  execute on function public.update_order(bigint,text,text,text,text,jsonb,text) to authenticated;
grant  execute on function public.set_role(text,text) to authenticated;
grant  execute on function public.list_staff() to authenticated;

-- Realtime: nhân viên thấy đơn mới ngay (RLS vẫn áp dụng)
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;

-- ---------- Dữ liệu ban đầu (bảng giá 18/10/2026) ----------
insert into public.settings (key, value) values
  ('vnd_per_point', '10000')          -- 10.000đ = 1 điểm
on conflict (key) do nothing;

insert into public.products (name, description, price, badge, sort)
select * from (values
  ('Cua don',  '5–6 con/kg',               240000, null,       1),
  ('Cua tứ',   '4 con/kg',                 340000, null,       2),
  ('Cua Y3',   'Khoảng 3 lạng/con',        410000, null,       3),
  ('Cua Y5',   'Khoảng 5 lạng/con',        590000, null,       4),
  ('Cua Y7',   'Từ 7 lạng/con trở lên',    690000, 'Cao cấp',  5),
  ('Cua gạch', '3–4 con/kg · gạch son đỏ', 600000, 'Đặc biệt', 6)
) v(name, description, price, badge, sort)
where not exists (select 1 from public.products);

-- Sửa tên sản phẩm (18/10/2026): "Cua dơn" -> "Cua don" cho khớp bảng giá
update public.products set name = 'Cua don' where name = 'Cua dơn';
