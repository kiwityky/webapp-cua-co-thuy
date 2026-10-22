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

-- Chuẩn hóa số điện thoại: chỉ giữ chữ số, +84xxxxxxxxx / 84xxxxxxxxx -> 0xxxxxxxxx
create or replace function public.norm_phone(p text) returns text
language sql immutable as $$
  select case when d ~ '^84[0-9]{9,10}$' then '0' || substr(d, 3) else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) s;
$$;

-- Thành viên của cửa hàng = khách đã có đơn "đã giao". Khóa theo số điện thoại.
-- Bảng này do trigger/hàm quản lý; client chỉ đọc (RLS) và gọi update_member/link_member.
create table if not exists public.members (
  id             bigint generated always as identity primary key,
  phone          text not null unique,                       -- đã chuẩn hóa
  full_name      text,
  address        text,
  note           text,
  user_id        uuid unique references public.profiles(id) on delete set null,  -- tài khoản đã gắn (nhân viên gắn)
  points         integer not null default 0,
  total_spent    integer not null default 0,
  order_count    integer not null default 0,
  first_order_at timestamptz,
  last_order_at  timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists public.orders (
  id             bigint generated always as identity primary key,
  customer_id    uuid references public.profiles(id) on delete set null,
  customer_name  text not null,
  phone          text not null,
  address        text not null,
  note           text,
  delivery_time  text,           -- thời gian khách muốn nhận, ghi tự do (vd. "sáng mai 7h")
  payment_method text not null default 'cod' check (payment_method in ('cod','chuyen_khoan')),
  payment_status text not null default 'chua_thu' check (payment_status in ('chua_thu','da_thu')),
  status         text not null default 'moi'
                 check (status in ('moi','xac_nhan','dang_giao','da_giao','huy')),
  total          integer not null default 0,
  points_awarded integer not null default 0,
  member_id      bigint references public.members(id) on delete set null,
  delivered_at   timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Bảng đã tạo từ bản cũ: thêm cột mới (chạy lại file này an toàn)
alter table public.orders add column if not exists delivery_time text;
alter table public.orders add column if not exists payment_method text not null default 'cod'
  check (payment_method in ('cod','chuyen_khoan'));
alter table public.orders add column if not exists payment_status text not null default 'chua_thu'
  check (payment_status in ('chua_thu','da_thu'));
alter table public.orders add column if not exists member_id bigint references public.members(id) on delete set null;
alter table public.orders add column if not exists delivered_at timestamptz;
-- Đã bỏ tính năng ghi chú nội bộ: dọn cột cũ nếu CSDL từng chạy bản trước
alter table public.orders drop column if exists staff_note;
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists orders_status_idx   on public.orders(status, created_at desc);
create index if not exists orders_member_idx   on public.orders(member_id);
create index if not exists orders_delivered_idx on public.orders(delivered_at desc) where status = 'da_giao';

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

-- Khách tự sửa profile được, nhưng KHÔNG được tự đổi role
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and not public.is_admin()
     and new.role is distinct from old.role then
    raise exception 'Không có quyền đổi vai trò';
  end if;
  return new;
end $$;

-- Điểm giờ nằm ở bảng members (bản cũ để ở profiles.points)
alter table public.profiles drop column if exists points;

drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------- Đơn "đã giao": lưu khách thành thành viên + tích điểm ----------
-- Chuyển sang da_giao: tạo/cập nhật thành viên theo số điện thoại, cộng điểm, tổng tiền, số đơn.
-- Chuyển ngược khỏi da_giao: hoàn lại các số trên (thành viên và thông tin vẫn được giữ).
create or replace function public.order_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare rate integer; pts integer; mid bigint;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status = 'da_giao' and old.status <> 'da_giao' then
    select coalesce(nullif(value,'')::int, 10000) into rate from settings where key = 'vnd_per_point';
    pts := floor(new.total / greatest(coalesce(rate,10000),1));
    insert into members (phone, full_name, address, user_id, points, total_spent, order_count,
                         first_order_at, last_order_at)
    values (norm_phone(new.phone), new.customer_name, new.address,
            -- chỉ tự gắn tài khoản khi thành viên MỚI do chính tài khoản đó đặt; các trường hợp khác nhân viên gắn tay
            (select new.customer_id where new.customer_id is not null
               and not exists (select 1 from members z where z.user_id = new.customer_id)),
            pts, new.total, 1, now(), now())
    on conflict (phone) do update set
      points       = members.points + pts,
      total_spent  = members.total_spent + new.total,
      order_count  = members.order_count + 1,
      last_order_at = now(),
      full_name    = coalesce(nullif(trim(members.full_name),''), excluded.full_name),
      address      = coalesce(nullif(trim(excluded.address),''), members.address)
    returning id into mid;
    new.member_id := mid;
    new.points_awarded := pts;
    new.delivered_at := now();
  elsif old.status = 'da_giao' and new.status <> 'da_giao' then
    if old.member_id is not null then
      update members set points = greatest(points - old.points_awarded, 0),
                         total_spent = greatest(total_spent - old.total, 0),
                         order_count = greatest(order_count - 1, 0)
      where id = old.member_id;
    end if;
    new.member_id := null;
    new.points_awarded := 0;
    new.delivered_at := null;
  end if;
  return new;
end $$;

drop trigger if exists order_points on public.orders;
create trigger order_points before update on public.orders
  for each row execute function public.order_points();

-- Admin xóa một đơn đã giao: hoàn lại số liệu của thành viên
create or replace function public.order_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'da_giao' and old.member_id is not null then
    update members set points = greatest(points - old.points_awarded, 0),
                       total_spent = greatest(total_spent - old.total, 0),
                       order_count = greatest(order_count - 1, 0)
    where id = old.member_id;
  end if;
  return old;
end $$;

drop trigger if exists order_delete on public.orders;
create trigger order_delete before delete on public.orders
  for each row execute function public.order_delete();

-- ---------- Tạo đơn: giá luôn lấy từ bảng products (khách không sửa giá được) ----------
-- p_items: [{"product_id": 1, "quantity": 1.5}, ...]
-- Bỏ chữ ký cũ (chưa có thời gian giao) để không bị trùng hàm
drop function if exists public.create_order(text,text,text,text,jsonb,uuid);
drop function if exists public.create_order(text,text,text,text,jsonb,uuid,text);
create or replace function public.create_order(
  p_customer_name text, p_phone text, p_address text, p_note text,
  p_items jsonb, p_customer_id uuid default null, p_delivery_time text default null,
  p_payment_method text default 'cod'
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
  if length(norm_phone(p_phone)) not between 9 and 11 then
    raise exception 'Số điện thoại không hợp lệ';
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
  if coalesce(p_payment_method,'cod') not in ('cod','chuyen_khoan') then
    raise exception 'Hình thức thanh toán không hợp lệ';
  end if;

  if is_staff() then
    -- Nhân viên đặt hộ: gắn vào tài khoản của thành viên đã được nhân viên gắn theo số điện thoại
    v_cust := coalesce(p_customer_id,
              (select user_id from members where phone = norm_phone(p_phone)));
  else
    v_cust := auth.uid();
  end if;

  insert into orders (customer_id, customer_name, phone, address, note, delivery_time, payment_method, created_by)
  values (v_cust, trim(p_customer_name), trim(p_phone), trim(p_address), p_note,
          nullif(trim(coalesce(p_delivery_time,'')),''), coalesce(p_payment_method,'cod'), auth.uid())
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
-- Đơn giá: lấy "unit_price" nhân viên nhập nếu có; không có thì giữ đơn giá cũ nếu cùng sản phẩm,
-- sản phẩm mới thêm vào lấy giá bán hiện tại.
-- Đơn đã giao: điểm và tổng tiền của thành viên được cộng/trừ phần chênh lệch cho khớp tổng tiền mới.
-- p_items: [{"product_id": 1, "quantity": 1.5, "unit_price": 250000}, ...]  (unit_price tùy chọn)
drop function if exists public.update_order(bigint,text,text,text,text,jsonb);
drop function if exists public.update_order(bigint,text,text,text,text,jsonb,text);
create or replace function public.update_order(
  p_order bigint, p_customer_name text, p_phone text, p_address text, p_note text,
  p_items jsonb, p_delivery_time text default null,
  p_payment_method text default null, p_payment_status text default null
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
  if length(norm_phone(p_phone)) not between 9 and 11 then
    raise exception 'Số điện thoại không hợp lệ';
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
  if p_payment_method is not null and p_payment_method not in ('cod','chuyen_khoan') then
    raise exception 'Hình thức thanh toán không hợp lệ';
  end if;
  if p_payment_status is not null and p_payment_status not in ('chua_thu','da_thu') then
    raise exception 'Trạng thái thanh toán không hợp lệ';
  end if;

  select coalesce(max(id),0) into v_max from order_items where order_id = p_order;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from products where id = (it->>'product_id')::bigint;
    if not found then raise exception 'Sản phẩm không tồn tại'; end if;
    q := (it->>'quantity')::numeric;
    if q is null or q <= 0 or q > 100 then raise exception 'Số lượng không hợp lệ'; end if;
    if nullif(it->>'unit_price','') is not null then
      v_price := round((it->>'unit_price')::numeric);
      if v_price < 0 or v_price > 100000000 then raise exception 'Đơn giá không hợp lệ'; end if;
    else
      select unit_price into v_price from order_items
        where order_id = p_order and product_id = pr.id and id <= v_max order by id limit 1;
      v_price := coalesce(v_price, pr.price);
    end if;
    insert into order_items (order_id, product_id, product_name, unit_price, quantity, unit)
    values (p_order, pr.id, pr.name, v_price, q, pr.unit);
    v_total := v_total + round(v_price * q);
  end loop;
  delete from order_items where order_id = p_order and id <= v_max;

  v_new := o.points_awarded;
  if o.status = 'da_giao' and o.member_id is not null then
    select coalesce(nullif(value,'')::int, 10000) into rate from settings where key = 'vnd_per_point';
    v_new := floor(v_total / greatest(coalesce(rate,10000),1));
    update members set points = greatest(points + v_new - o.points_awarded, 0),
                       total_spent = greatest(total_spent + v_total - o.total, 0)
    where id = o.member_id;
  end if;

  update orders set customer_name = trim(p_customer_name), phone = trim(p_phone),
    address = trim(p_address), note = nullif(trim(coalesce(p_note,'')),''),
    delivery_time = nullif(trim(coalesce(p_delivery_time,'')),''),
    payment_method = coalesce(p_payment_method, o.payment_method),
    payment_status = coalesce(p_payment_status, o.payment_status),
    total = v_total, points_awarded = v_new
  where id = p_order;
end $$;

-- Nhân viên sửa thông tin thành viên (không sửa được điểm)
create or replace function public.update_member(
  p_member bigint, p_full_name text, p_address text, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Chỉ nhân viên'; end if;
  if length(coalesce(p_full_name,'')) > 100 or length(coalesce(p_address,'')) > 300
     or length(coalesce(p_note,'')) > 500 then
    raise exception 'Thông tin quá dài';
  end if;
  update members set full_name = nullif(trim(coalesce(p_full_name,'')),''),
                     address   = nullif(trim(coalesce(p_address,'')),''),
                     note      = nullif(trim(coalesce(p_note,'')),'')
  where id = p_member;
  if not found then raise exception 'Không tìm thấy thành viên'; end if;
end $$;

-- Nhân viên gắn tài khoản đăng nhập của khách vào thành viên (p_email trống = bỏ gắn).
-- Gắn xong khách thấy điểm và các đơn của thành viên khi đăng nhập.
create or replace function public.link_member(p_member bigint, p_email text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_staff() then raise exception 'Chỉ nhân viên'; end if;
  perform 1 from members where id = p_member for update;
  if not found then raise exception 'Không tìm thấy thành viên'; end if;
  if coalesce(trim(p_email),'') = '' then
    update members set user_id = null where id = p_member;
    return;
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'Không tìm thấy email'; end if;
  if exists (select 1 from profiles where id = uid and role <> 'customer') then
    raise exception 'Đây là tài khoản nhân viên, không gắn làm thành viên';
  end if;
  if exists (select 1 from members where user_id = uid and id <> p_member) then
    raise exception 'Tài khoản này đã gắn với thành viên khác';
  end if;
  update members set user_id = uid where id = p_member;
  update orders set customer_id = uid where member_id = p_member and customer_id is null;
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
alter table public.members     enable row level security;

-- profiles: xem/sửa của mình; nhân viên xem tất cả; admin sửa tất cả
drop policy if exists p_profiles_select on public.profiles;
create policy p_profiles_select on public.profiles for select
  using (id = auth.uid() or is_staff());
drop policy if exists p_profiles_update on public.profiles;
create policy p_profiles_update on public.profiles for update
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- members: khách chỉ thấy dòng của mình (đã được nhân viên gắn tài khoản); nhân viên thấy tất cả.
-- Không có policy ghi: chỉ trigger và hàm update_member/link_member mới sửa được.
drop policy if exists p_members_select on public.members;
create policy p_members_select on public.members for select
  using (user_id = auth.uid() or is_staff());

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
revoke execute on function public.create_order(text,text,text,text,jsonb,uuid,text,text) from anon, public;
revoke execute on function public.cancel_my_order(bigint) from anon, public;
revoke execute on function public.update_order(bigint,text,text,text,text,jsonb,text,text,text) from anon, public;
revoke execute on function public.update_member(bigint,text,text,text) from anon, public;
revoke execute on function public.link_member(bigint,text) from anon, public;
revoke execute on function public.set_role(text,text) from anon, public;
revoke execute on function public.list_staff() from anon, public;
grant  execute on function public.create_order(text,text,text,text,jsonb,uuid,text,text) to authenticated;
grant  execute on function public.cancel_my_order(bigint) to authenticated;
grant  execute on function public.update_order(bigint,text,text,text,text,jsonb,text,text,text) to authenticated;
grant  execute on function public.update_member(bigint,text,text,text) to authenticated;
grant  execute on function public.link_member(bigint,text) to authenticated;
grant  execute on function public.set_role(text,text) to authenticated;
grant  execute on function public.list_staff() to authenticated;

-- Realtime: nhân viên thấy đơn mới ngay (RLS vẫn áp dụng)
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;

-- ---------- Giá vốn + công thức giá bán ----------
-- Nhân viên nhập giá vốn (giá mua vào) và % lãi từng loại; products.price (giá bán) do trigger tính:
--   giá bán = giá vốn × (1 + % lãi), làm tròn LÊN bội số 10.000đ.
-- Bảng product_costs chỉ nhân viên đọc được (khách không thấy giá vốn).
alter table public.products add column if not exists price_updated_at timestamptz not null default now();

create table if not exists public.product_costs (
  product_id  bigint primary key references public.products(id) on delete cascade,
  cost        integer not null default 0 check (cost >= 0),                       -- giá vốn, VND / đơn vị
  markup_pct  numeric(5,2) not null default 15 check (markup_pct between 0 and 500), -- % lãi
  updated_at  timestamptz not null default now()
);

create or replace function public.calc_sell_price(p_cost integer, p_pct numeric) returns integer
language sql immutable as $$
  select (ceil(p_cost::numeric * (100 + p_pct) / 100 / 10000) * 10000)::integer;
$$;

-- Sản phẩm có giá vốn: giá bán luôn theo công thức. Đổi giá thì ghi lại thời điểm.
create or replace function public.products_price_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c product_costs%rowtype;
begin
  select * into c from product_costs where product_id = new.id;
  if found then new.price := calc_sell_price(c.cost, c.markup_pct); end if;
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    new.price_updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists products_price_guard on public.products;
create trigger products_price_guard before insert or update on public.products
  for each row execute function public.products_price_guard();

create or replace function public.product_costs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists product_costs_touch on public.product_costs;
create trigger product_costs_touch before insert or update on public.product_costs
  for each row execute function public.product_costs_touch();

-- Chạy SAU khi lưu giá vốn để products_price_guard đọc được giá vốn mới
create or replace function public.product_costs_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update products set price = calc_sell_price(new.cost, new.markup_pct)
  where id = new.product_id and price is distinct from calc_sell_price(new.cost, new.markup_pct);
  return null;
end $$;

drop trigger if exists product_costs_apply on public.product_costs;
create trigger product_costs_apply after insert or update on public.product_costs
  for each row execute function public.product_costs_apply();

alter table public.product_costs enable row level security;
drop policy if exists p_product_costs_all on public.product_costs;
create policy p_product_costs_all on public.product_costs for all
  using (is_staff()) with check (is_staff());

-- ---------- Sửa chính tả "Cua dơn" -> "Cua don" (DB đã seed từ bản cũ) ----------
update public.products    set name = 'Cua don'      where name = 'Cua dơn';
update public.order_items set product_name = 'Cua don' where product_name = 'Cua dơn';

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

-- Giá vốn ban đầu: suy ngược từ giá bán hiện tại (nhân viên sửa lại theo giá mua thật).
-- % lãi: Cua don 15, Cua tứ 16, Y3 17, Y5 18, Y7 19, Cua gạch 20.
insert into public.product_costs (product_id, cost, markup_pct)
select p.id, (floor(p.price::numeric * 100 / (100 + m.pct) / 1000) * 1000)::integer, m.pct
from public.products p
cross join lateral (select case lower(p.name)
  when 'cua don' then 15 when 'cua tứ' then 16 when 'cua y3' then 17
  when 'cua y5' then 18 when 'cua y7' then 19 when 'cua gạch' then 20 else 15 end::numeric as pct) m
on conflict (product_id) do nothing;

-- ---------- Cập nhật từ bản cũ: dựng thành viên từ các đơn đã giao trước đây ----------
-- Chạy lại nhiều lần vẫn an toàn: điểm/tổng tiền/số đơn luôn tính lại từ các đơn đã giao.
create or replace function public.rebuild_members() returns void
language plpgsql security definer set search_path = public as $$
declare rate integer; new_ids bigint[];
begin
  select coalesce(nullif(value,'')::int, 10000) into rate from settings where key = 'vnd_per_point';
  rate := greatest(coalesce(rate,10000),1);

  update orders set delivered_at = coalesce(delivered_at, updated_at)
  where status = 'da_giao' and delivered_at is null;

  -- đơn đã giao từ bản cũ chưa có điểm (khách không đăng nhập trước đây): tính điểm bù
  update orders set points_awarded = floor(total / rate)
  where status = 'da_giao' and points_awarded = 0 and total > 0;

  with ins as (
    insert into members (phone, full_name, address)
    select distinct on (norm_phone(phone)) norm_phone(phone), customer_name, address
    from orders
    where status = 'da_giao' and length(norm_phone(phone)) between 9 and 11
    order by norm_phone(phone), delivered_at desc
    on conflict (phone) do nothing
    returning id)
  select coalesce(array_agg(id), '{}') into new_ids from ins;

  update orders o set member_id = m.id
  from members m
  where o.status = 'da_giao' and o.member_id is null and m.phone = norm_phone(o.phone);

  -- chỉ với thành viên vừa dựng lần này (không đè lên việc nhân viên đã bỏ gắn): tự gắn tài khoản
  -- khi mọi đơn của thành viên đều do đúng một tài khoản đặt
  update members m set user_id = x.uid
  from (select member_id, min(customer_id::text)::uuid as uid
        from orders
        where status = 'da_giao' and member_id is not null
        group by member_id
        having count(*) = count(customer_id) and count(distinct customer_id) = 1) x
  where m.id = x.member_id and m.user_id is null and m.id = any(new_ids)
    and not exists (select 1 from members z where z.user_id = x.uid);

  update members m set points = s.p, total_spent = s.t, order_count = s.c,
                       first_order_at = s.f, last_order_at = s.l
  from (select member_id, sum(points_awarded)::int p, sum(total)::int t, count(*)::int c,
               min(delivered_at) f, max(delivered_at) l
        from orders where status = 'da_giao' and member_id is not null
        group by member_id) s
  where m.id = s.member_id;
end $$;

revoke execute on function public.rebuild_members() from anon, authenticated, public;
select public.rebuild_members();
