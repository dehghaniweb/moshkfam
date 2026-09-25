"use strict";

/* =========================================================
   MOSHKFAM FARs - app.js
   نسخه نهایی
   - ضد کش خودکار
   - سازگار با Web و Telegram WebApp
   - محصولات
   - جستجو و دسته‌بندی
   - احراز هویت تلگرام
   - پنل مدیریت
   - قیمت اختصاصی مشتری
   - ویدئو و فایل‌ها
========================================================= */

/* =========================================================
   MOSHKFAM - FORCE CACHE CLEAR (App.js only)
   ========================================================= */
(async function forceClearCacheFromApp() {
  try {
    const version = "moshkfam-app-20260923-01";
    const flag = "moshkfam_cache_cleared_" + version;

    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, "1");

    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }

    // اجرای دوباره App.js از نسخه تازه
    window.location.reload();
  } catch (e) {
    console.warn("Cache clear:", e);
  }
})();

const WORKER_URL =
  "https://moshkfam-telegram-bot.dehghaniweb.workers.dev";

const tg =
  window.Telegram && window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;


/* =========================================================
   STATE
========================================================= */

let products = [];
let categories = [];
let activeCategory = "";
let currentUser = null;
let isAdmin = false;
let selectedCustomer = null;
let cartItems = {};
let adminPermissions = [];
const ADMIN_PERMISSION_KEYS = ["products","customers","prices","requests","footer"];



/* =========================================================
   TELEGRAM INIT
========================================================= */

if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch (e) {
    console.warn("Telegram init:", e);
  }
}


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeNumericValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬،]/g, ",")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value) {
  const n = normalizeNumericValue(value);
  if (n === null) return "";
  return new Intl.NumberFormat("fa-IR").format(n);
}

function formatDate(value) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function getEffectivePrice(product) {
  const custom = normalizeNumericValue(product?.custom_price);
  if (custom !== null) return custom;
  return normalizeNumericValue(product?.base_price);
}

function getPriceText(product) {
  const publicPrice = normalizeNumericValue(product?.base_price);
  const customPrice = normalizeNumericValue(product?.custom_price);
  const hasPublic = publicPrice !== null;
  const hasCustom = customPrice !== null;
  const publicCurrency = product?.base_currency || "تومان";
  const customCurrency = product?.custom_currency || publicCurrency;
  if (hasCustom && (!hasPublic || customPrice !== publicPrice)) {
    return `<div class="price price-custom-wrap"><span class="public-price-old">${formatNumber(publicPrice)} ${escapeHtml(publicCurrency)}</span><span class="custom-price-current">${formatNumber(customPrice)} ${escapeHtml(customCurrency)}</span></div>`;
  }
  if (hasPublic) return `<div class="price">${formatNumber(publicPrice)} ${escapeHtml(publicCurrency)}</div>`;
  return `<div class="price private-price">برای اطلاع از قیمت تماس بگیرید.</div>`;
}

function normalizeDigits(value){
  return String(value ?? "").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function getProductPackageKg(product){
  const raw=normalizeDigits(product?.package||"").replace(/٬/g,",").replace(/,/g,".");
  const m=raw.match(/(\d+(?:\.\d+)?)\s*(?:کیلوگرم|کیلوگرمی|کیلو|kg|kgs)/i);
  const kg=m?Number(m[1]):NaN;
  return Number.isFinite(kg)&&kg>0?kg:1;
}
function formatDecimal(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return "۰";
  return formatNumber(Number.isInteger(n)?n:Number(n.toFixed(3)));
}
function getCartAmountKg(item,product){
  const packageKg=getProductPackageKg(product);
  if(Number.isFinite(Number(item.amountKg)) && Number(item.amountKg)>0) return Number(item.amountKg);
  return (Number(item.quantity)||0)*packageKg;
}
function getCartUnitValue(item,product){
  const kg=getCartAmountKg(item,product);
  return item.unit==="ton" ? kg/1000 : kg;
}
function cartStorageKey(){
  const id = currentUser?.id || currentUser?.telegram_user_id || currentUser?.username || "guest";
  return "moshkfam_cart_" + String(id);
}
function loadCart(){
  try{
    cartItems=JSON.parse(localStorage.getItem(cartStorageKey())||"{}");
    Object.values(cartItems).forEach(item=>{
      const p=products.find(x=>Number(x.id)===Number(item.productId));
      if(p){
        item.unit=item.unit==="ton"?"ton":"kg";
        item.amountKg=getCartAmountKg(item,p);
        item.quantity=Math.round(item.amountKg/getProductPackageKg(p));
      }
    });
  }catch{cartItems={};}
  updateCartBadge();
}
function saveCart(){try{localStorage.setItem(cartStorageKey(),JSON.stringify(cartItems));}catch{}updateCartBadge();}
function updateCartBadge(){
  const badge=$("cartCount"); if(!badge)return;
  const n=Object.keys(cartItems).length;
  badge.textContent=formatNumber(n); badge.classList.toggle("empty",n===0);
}
let cartToastTimer = null;
function showCartToast(message = "به سبد خرید اضافه شد") {
  let toast = $("cartToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cartToast";
    toast.className = "cart-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = `✓ ${message}`;
  toast.classList.remove("show", "hide");
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(cartToastTimer);
  cartToastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(() => toast.classList.remove("hide"), 280);
  }, 1700);
}

function addToCart(productId,event){
  if(event){event.preventDefault();event.stopPropagation();}
  if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری خود شوید.");return;}
  const product=products.find(p=>Number(p.id)===Number(productId));
  if(!product){appAlert("❌ محصول پیدا نشد.");return;}
  const price=getEffectivePrice(product);
  if(!Number.isFinite(price)){appAlert("⚠️ این محصول هنوز قیمت مشخصی ندارد.");return;}
  const key=String(productId), packageKg=getProductPackageKg(product);
  if(!cartItems[key]) cartItems[key]={productId:Number(productId),quantity:1,amountKg:packageKg,unit:"kg"};
  else{
    cartItems[key].unit=cartItems[key].unit==="ton"?"ton":"kg";
    cartItems[key].amountKg=getCartAmountKg(cartItems[key],product)+packageKg;
    cartItems[key].quantity=Math.round(cartItems[key].amountKg/packageKg);
  }
  saveCart();
  showCartToast("به سبد خرید اضافه شد");
}
function changeCartQty(productId,delta){
  const key=String(productId); if(!cartItems[key])return;
  const p=products.find(x=>Number(x.id)===Number(productId)); if(!p)return;
  const packageKg=getProductPackageKg(p);
  const currentKg=getCartAmountKg(cartItems[key],p);
  const nextKg=Math.max(0,currentKg+(Number(delta)||0)*packageKg);
  if(nextKg===0){delete cartItems[key];}
  else{cartItems[key].amountKg=nextKg;cartItems[key].quantity=Math.round(nextKg/packageKg);}
  saveCart();renderCart();
}
function setCartUnit(productId,unit){
  const key=String(productId); if(!cartItems[key])return;
  cartItems[key].unit=unit==="ton"?"ton":"kg";
  saveCart();renderCart();
}
function updateCartAmountLive(productId,value){
  const key=String(productId); if(!cartItems[key])return;
  const p=products.find(x=>Number(x.id)===Number(productId)); if(!p)return;
  const unit=cartItems[key].unit==="ton"?"ton":"kg";
  const entered=Number(normalizeDigits(value).replace(/,/g,"."));
  if(!Number.isFinite(entered)||entered<=0)return;
  const amountKg=unit==="ton"?entered*1000:entered;
  const packageKg=getProductPackageKg(p);
  const packages=amountKg/packageKg;
  const price=getEffectivePrice(p);
  if(!Number.isFinite(price))return;
  const lineTotal=price*packages;
  const lineEl=$("cart-line-total-"+Number(productId));
  if(lineEl) lineEl.textContent=formatNumber(Math.round(lineTotal))+" تومان";
  const helpEl=$("cart-weight-help-"+Number(productId));
  if(helpEl) helpEl.innerHTML=`مقدار سفارش: <b>${formatDecimal(amountKg)} کیلوگرم</b> · معادل <b>${formatDecimal(packages)} بسته ${formatDecimal(packageKg)} کیلویی</b>`;
  let grand=0;
  Object.values(cartItems).forEach(item=>{
    const pr=products.find(x=>Number(x.id)===Number(item.productId));
    if(!pr) return;
    const effectivePrice=getEffectivePrice(pr);
    if(!Number.isFinite(effectivePrice)) return;
    if(String(item.productId)===key) grand+=lineTotal;
    else grand+=effectivePrice*(Number(item.quantity)||0);
  });
  const totalEl=$("cartTotal");
  if(totalEl) totalEl.textContent=formatNumber(Math.round(grand))+" تومان";
  // Live update: keep the package count synchronized with the entered amount.
  const totalNode=document.getElementById(`cart-line-total-${Number(productId)}`);
  const row=totalNode?.closest('.cart-row-weight');
  const qtyEl=row?.querySelector('.cart-qty b');
  if(qtyEl) qtyEl.textContent=formatDecimal(packages)+" بسته";
}
function setCartAmount(productId,value){
  const key=String(productId); if(!cartItems[key])return;
  const p=products.find(x=>Number(x.id)===Number(productId)); if(!p)return;
  const unit=cartItems[key].unit==="ton"?"ton":"kg";
  const entered=Number(normalizeDigits(value).replace(/,/g,"."));
  if(!Number.isFinite(entered)||entered<=0){return;}
  const amountKg=unit==="ton"?entered*1000:entered;
  const packageKg=getProductPackageKg(p);
  const packages=amountKg/packageKg;
  if(Math.abs(packages-Math.round(packages))>1e-9){
    appAlert(`⚠️ مقدار ${formatDecimal(amountKg)} کیلوگرم برای بسته ${formatDecimal(packageKg)} کیلوگرمی قابل ثبت نیست.\nلطفاً مقدار را مضربی از ${formatDecimal(packageKg)} کیلوگرم وارد کنید.`);
    renderCart();return;
  }
  cartItems[key].amountKg=amountKg;
  cartItems[key].quantity=Math.round(packages);
  saveCart();renderCart();
}
function removeFromCart(productId){delete cartItems[String(productId)];saveCart();renderCart();appAlert("✅ کالا از سبد خرید حذف شد.");}
function openCart(){if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری خود شوید.");return;}loadCart();renderCart();$("cartModal")?.classList.remove("hidden");}
function closeCart(){$("cartModal")?.classList.add("hidden");}
function renderCart(){
  const box=$("cartItems"),totalEl=$("cartTotal"); if(!box)return;
  const rows=Object.values(cartItems).filter(x=>(Number(x.quantity)||0)>0).map(item=>{
    const p=products.find(x=>Number(x.id)===Number(item.productId)); if(!p)return "";
    const price=getEffectivePrice(p), packageKg=getProductPackageKg(p), amountKg=getCartAmountKg(item,p), unit=item.unit==="ton"?"ton":"kg", unitValue=getCartUnitValue(item,p), total=price*(Number(item.quantity)||0);
    return `<div class="cart-row cart-row-weight">
      <div class="cart-row-info"><strong>${escapeHtml(p.name_fa||p.name_en||"محصول")}</strong><span>${formatNumber(price)} ${escapeHtml(p.base_currency||"تومان")} · بسته ${formatDecimal(packageKg)} کیلوگرمی</span></div>
      <div class="cart-weight-editor">
        <label>واحد<select onchange="setCartUnit(${Number(p.id)},this.value)"><option value="kg" ${unit==="kg"?"selected":""}>کیلوگرم</option><option value="ton" ${unit==="ton"?"selected":""}>تن</option></select></label>
        <label>مقدار<input type="number" min="0.001" step="0.001" value="${unitValue}" oninput="updateCartAmountLive(${Number(p.id)},this.value)" onchange="setCartAmount(${Number(p.id)},this.value)" onkeydown="if(event.key==='Enter'){this.blur();}"></label>
      </div>
      <div class="cart-qty"><button type="button" onclick="changeCartQty(${Number(p.id)},-1)">−</button><b>${formatNumber(item.quantity)} بسته</b><button type="button" onclick="changeCartQty(${Number(p.id)},1)">+</button></div>
      <strong id="cart-line-total-${Number(p.id)}" class="cart-line-total">${formatNumber(total)} تومان</strong>
      <button type="button" class="cart-remove" onclick="removeFromCart(${Number(p.id)})">🗑️</button>
      <div id="cart-weight-help-${Number(p.id)}" class="cart-weight-help">مقدار سفارش: <b>${formatDecimal(amountKg)} کیلوگرم</b> · معادل <b>${formatNumber(item.quantity)} بسته ${formatDecimal(packageKg)} کیلویی</b></div>
    </div>`;
  }).filter(Boolean);
  box.innerHTML=rows.length?rows.join(""):"<div class=\"message\">سبد خرید خالی است.</div>";
  const total=Object.values(cartItems).reduce((sum,item)=>{const p=products.find(x=>Number(x.id)===Number(item.productId));const price=getEffectivePrice(p);return sum+(Number.isFinite(price)?price*(Number(item.quantity)||0):0)},0);
  if(totalEl)totalEl.textContent=formatNumber(total)+" تومان";
}
async function submitCartOrder(){
  if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری شوید.");return;}
  const entries=Object.values(cartItems).filter(x=>(Number(x.quantity)||0)>0); if(!entries.length){appAlert("⚠️ سبد خرید خالی است.");return;}
  const lines=entries.map(item=>{
    const p=products.find(x=>Number(x.id)===Number(item.productId)); if(!p)return "";
    const price=getEffectivePrice(p),packageKg=getProductPackageKg(p),amountKg=getCartAmountKg(item,p),unit=item.unit==="ton"?"ton":"kg",unitValue=getCartUnitValue(item,p);
    return `${p.name_fa||p.name_en||"محصول"} × ${formatDecimal(unitValue)} ${unit==="ton"?"تن":"کیلوگرم"} = ${formatNumber(item.quantity)} بسته ${formatDecimal(packageKg)} کیلویی = ${formatNumber(price*(Number(item.quantity)||0))} تومان`;
  }).filter(Boolean);
  const total=entries.reduce((sum,item)=>{const p=products.find(x=>Number(x.id)===Number(item.productId));const price=getEffectivePrice(p);return sum+(Number.isFinite(price)?price*(Number(item.quantity)||0):0)},0);
  try{await postJson("/api/customer/request",{type:"order",text:"🛒 سفارش سبد خرید\n"+lines.join("\n")+`\nمجموع: ${formatNumber(total)} تومان`});cartItems={};saveCart();renderCart();closeCart();await loadOrderHistoryCount();appAlert("✅ سفارش سبد خرید با موفقیت ثبت شد.");}catch(e){appAlert("❌ ثبت سفارش انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}


/* =========================================================
   API - AUTOMATIC NO CACHE
========================================================= */

function buildApiUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return (
    WORKER_URL +
    path +
    separator +
    "_nocache=" +
    Date.now()
  );
}

async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  // Telegram WebApp authentication header
  // Worker validates this signed initData before allowing admin/customer actions.
  if (tg && tg.initData) {
    headers["X-Telegram-Init-Data"] = tg.initData;
  }
  const sessionToken = getStoredToken();
  if (sessionToken) headers["Authorization"] = "Bearer " + sessionToken;

  const response = await fetch(buildApiUrl(path), {
    ...options,
    cache: "no-store",
    headers
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      data.error
        ? data.error
        : `HTTP ${response.status}`;
    const details =
      data && typeof data === "object" && data.details
        ? `\n${typeof data.details === "string" ? data.details : JSON.stringify(data.details)}`
        : "";
    throw new Error(message + details);
  }

  return data;
}

async function get(path) {
  return apiRequest(path, {
    method: "GET"
  });
}

async function postJson(path, body) {
  return apiRequest(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  });
}


/* =========================================================
   UI MESSAGE
========================================================= */

function showError(message) {
  const el = $("error");

  if (!el) return;

  el.textContent = message || "خطایی رخ داد.";
  el.classList.remove("hidden");
}

function hideError() {
  const el = $("error");

  if (el) {
    el.classList.add("hidden");
  }
}


/* =========================================================
   WEB / ANDROID LOGIN SESSION
========================================================= */
function getStoredToken(){try{return localStorage.getItem("moshkfam_session")||"";}catch{return "";}}
function setStoredToken(t){try{if(t)localStorage.setItem("moshkfam_session",t);else localStorage.removeItem("moshkfam_session");}catch{}}
async function loginWithUsernamePassword(){
  const username=$("loginUsername")?.value.trim()||"", password=$("loginPassword")?.value||"", msg=$("loginMessage");
  if(!username||!password){if(msg)msg.textContent="نام کاربری و رمز عبور را وارد کنید.";return;}
  if(msg)msg.textContent="در حال ورود...";
  try{const r=await postJson("/api/login",{username,password});setStoredToken(r.token);currentUser=r.user||null;isAdmin=String(r.user?.role||"").toLowerCase()==="admin" || String(r.user?.role||"").toLowerCase()==="super_admin";adminPermissions=[];try{const session=await apiRequest("/api/session",{method:"GET"});if(session?.authenticated&&session.user){currentUser=session.user;isAdmin=!!session.isAdmin || String(session.user.role||"").toLowerCase()==="admin" || String(session.user.role||"").toLowerCase()==="super_admin";adminPermissions=Array.isArray(session.permissions)?session.permissions:[];}}catch(sessionError){console.warn("Login permission session:",sessionError);}if($("loginPassword"))$("loginPassword").value="";if(msg)msg.textContent="✅ ورود با موفقیت انجام شد.";updateAccountUI();loadCart();await loadProducts();await loadOrderHistoryCount();if(currentUser){await loadLetterUnreadCount();startLetterPolling();}}catch(e){if(msg)msg.textContent=e.message||"ورود انجام نشد.";}
}
async function loadWebSession(){const t=getStoredToken();if(!t)return;try{const r=await apiRequest("/api/session",{method:"GET"});if(r?.authenticated&&r.user){currentUser=r.user;isAdmin=!!r.isAdmin || String(r.user.role||"").toLowerCase()==="admin" || String(r.user.role||"").toLowerCase()==="super_admin";adminPermissions=Array.isArray(r.permissions)?r.permissions:[];updateAccountUI();loadCart();await loadOrderHistoryCount();if(currentUser){await loadLetterUnreadCount();startLetterPolling();}}else setStoredToken("");}catch{setStoredToken("");}}
async function logoutUser(){try{await apiRequest("/api/logout",{method:"POST"});}catch{}setStoredToken("");currentUser=null;isAdmin=false;cartItems={};updateCartBadge();updateAccountUI();await loadProducts();}
async function loadSiteSettings(){try{const r=await get("/api/site-settings"),st=r?.settings||{};if($("footerCompanyName"))$("footerCompanyName").textContent="🌱 "+(st.company_name||"مشکفام فارس");if($("footerText"))$("footerText").textContent=st.footer_text||"";if($("footerPhone"))$("footerPhone").textContent=st.phone?"☎️ "+st.phone:"";if($("footerAddress"))$("footerAddress").textContent=st.address?"📍 "+st.address:"";if($("settingCompanyName"))$("settingCompanyName").value=st.company_name||"مشکفام فارس";if($("settingFooterText"))$("settingFooterText").value=st.footer_text||"";if($("settingPhone"))$("settingPhone").value=st.phone||"";if($("settingAddress"))$("settingAddress").value=st.address||"";}catch(e){console.warn("Settings:",e);}}
async function saveSiteSettings(){try{await postJson("/api/admin/site-settings",{company_name:$("settingCompanyName")?.value.trim()||"مشکفام فارس",footer_text:$("settingFooterText")?.value||"",phone:$("settingPhone")?.value.trim()||"",address:$("settingAddress")?.value||""});await loadSiteSettings();alert("✅ اطلاعات پایین صفحه ذخیره شد.");}catch(e){alert("❌ ذخیره تنظیمات انجام نشد:\n"+e.message);}}
async function createProduct(){
  const fa = $("newProductNameFa")?.value.trim() || "";
  const toNumber = v => {
    const raw=String(v??"").trim().replace(/[٬,\s]/g,"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
    return raw==="" ? null : Number(raw);
  };
  const p={name_fa:fa,name_en:$("newProductNameEn")?.value.trim()||"",category:$("newProductCategory")?.value.trim()||"",package:$("newProductPackage")?.value.trim()||"",maker:$("newProductMaker")?.value.trim()||"",base_price:toNumber($("newProductPrice")?.value),base_currency:"تومان",active:true};
  if(!p.name_fa){alert("نام فارسی محصول را وارد کنید.");return;}
  try{
    const result=await postJson("/api/admin/create-product",p);
    if(!result?.product?.id) throw new Error("سرور محصول جدید را ثبت نکرد.");
    alert("✅ محصول جدید ایجاد شد.");
    ["newProductNameFa","newProductNameEn","newProductCategory","newProductPackage","newProductMaker","newProductPrice"].forEach(id=>{if($(id))$(id).value=""});
    await loadProducts(); await loadAdminProducts();
  }catch(e){console.error("Create product:",e);alert("❌ افزودن محصول انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}
async function deleteProduct(id){if(!(await appConfirm("آیا از حذف کامل این محصول مطمئن هستید؟")))return;try{await postJson("/api/admin/delete-product",{product_id:Number(id)});alert("✅ محصول حذف شد.");await loadProducts();await loadAdminProducts();}catch(e){alert("❌ حذف محصول انجام نشد:\n"+e.message);}}
function togglePasswordVisibility(inputId, buttonId) {
  const input = $(inputId);
  const button = $(buttonId);
  if (!input) return;
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  if (button) {
    button.textContent = showing ? "👁️" : "🙈";
    button.setAttribute("aria-label", showing ? "نمایش رمز عبور" : "مخفی کردن رمز عبور");
    button.title = showing ? "نمایش رمز عبور" : "مخفی کردن رمز عبور";
  }
}

async function createCustomerUser(){const p={first_name:$("newUserFirstName")?.value.trim(),last_name:$("newUserLastName")?.value.trim(),username:$("newUserUsername")?.value.trim(),password:$("newUserPassword")?.value||""};try{await postJson("/api/admin/create-customer",p);alert("✅ نماینده اضافه شد.");["newUserFirstName","newUserLastName","newUserUsername","newUserPassword"].forEach(id=>{if($(id))$(id).value=""});await loadCustomers();}catch(e){alert("❌ افزودن نماینده انجام نشد:\n"+e.message);}}
async function deleteCustomerUser(id){
  const customerId=String(id||"").trim();
  if(!customerId){alert("❌ شناسه نماینده مشخص نیست.");return false;}
  try{
    await postJson("/api/admin/delete-customer",{customer_id:customerId});
    alert("✅ نماینده با موفقیت حذف شد.");
    await loadCustomers();
  }catch(e){
    const detail=e?.message||String(e||"خطای نامشخص");
    alert("❌ حذف نماینده انجام نشد:\n"+detail);
  }
  return false;
}

async function updateCustomerUser(id){
  const cid=String(id||"").trim();
  if(!cid){alert("❌ شناسه نماینده مشخص نیست.");return false;}
  const first=adminVisibleElement("ufirst-"+cid);
  const last=adminVisibleElement("ulast-"+cid);
  const user=adminVisibleElement("uuser-"+cid);
  const status=adminVisibleElement("ustatus-"+cid);
  const passEl=adminVisibleElement("upass-"+cid);
  const p={customer_id:cid,first_name:first?.value.trim()||"",last_name:last?.value.trim()||"",username:user?.value.trim()||"",status:status?.value||"active"};
  const pass=passEl?.value||"";
  if(pass)p.password=pass;
  try{
    const result=await postJson("/api/admin/customer-profile",p);
    if(!result || result.ok===false) throw new Error(result?.details||result?.error||"سرور تغییرات را تأیید نکرد.");
    alert("✅ اطلاعات نماینده ذخیره شد.");
    await loadCustomers();
  }catch(e){
    console.error("Update customer:",e);
    alert("❌ ویرایش نماینده انجام نشد:\n"+(e?.message||String(e)));
  }
  return false;
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function authenticate() {
  if (!tg || !tg.initData) {
    return;
  }

  try {
    const result = await postJson("/api/telegram-auth", {
      initData: tg.initData
    });

    if (result && result.user) {
      currentUser = result.user;
    }

    if (result && result.isAdmin) {
      isAdmin = true;
      adminPermissions = Array.isArray(result.permissions) ? result.permissions : [];
    }

    updateAccountUI();

  } catch (error) {
    console.warn("Telegram authentication failed:", error);
  }
}

async function loadCurrentUser() {
  if (!tg || !tg.initData) {
    return;
  }

  try {
    const result = await postJson("/api/whoami", {
      initData: tg.initData
    });

    if (result && result.user) {
      currentUser = result.user;
    }

    if (result && typeof result.isAdmin === "boolean") {
      isAdmin = result.isAdmin;
      adminPermissions = Array.isArray(result.permissions) ? result.permissions : [];
    }

    updateAccountUI();

  } catch (error) {
    console.warn("whoami:", error);
  }
}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI() {
  const account = $("account");
  const adminButton = $("adminButton");
  const loginBox = $("loginBox");
  const logoutButton = $("logoutButton");

  if (!currentUser) {
    if(loginBox) loginBox.classList.remove("hidden");
    if(logoutButton) logoutButton.classList.add("hidden");
    if (account) {
      account.classList.add("hidden");
    }

    if (adminButton) {
      adminButton.classList.add("hidden");
    }

    const mobileAccount = $("mobileAccountInfo");
    if (mobileAccount) mobileAccount.classList.add("hidden");
    const ordersButton = $("ordersButton");
    if (ordersButton) ordersButton.classList.add("hidden");

    return;
  }

  if (account) {
    account.classList.remove("hidden");
  }

  const name =
    [
      currentUser.first_name,
      currentUser.last_name
    ]
      .filter(Boolean)
      .join(" ") ||
    currentUser.username ||
    "کاربر";

  const username =
    currentUser.username
      ? "@" + currentUser.username
      : "";

  if ($("accountName")) {
    $("accountName").textContent = name;
  }

  if ($("accountUser")) {
    $("accountUser").textContent = username;
  }

  if ($("accountInfo")) {
    $("accountInfo").textContent =
      isAdmin || currentUser.role === "admin"
        ? "مدیر سیستم"
        : "مشتری";
  }

  const customerButton = $("customerButton");
  if(loginBox) loginBox.classList.add("hidden");
  if(logoutButton) logoutButton.classList.remove("hidden");

  if (adminButton) {
    if (isAdmin) {
      adminButton.classList.remove("hidden");
    } else {
      adminButton.classList.add("hidden");
    }
  }

  if (customerButton) {
    if (isAdmin) {
      customerButton.classList.add("hidden");
    } else {
      customerButton.classList.remove("hidden");
    }
  }

  const ordersButton = $("ordersButton");
  if (ordersButton) ordersButton.classList.remove("hidden");

  const inboxButton = $("letterInboxButton");
  if (inboxButton) {
    inboxButton.classList.toggle("hidden", !currentUser);
  }

  const mobileAccount = $("mobileAccountInfo");
  if (mobileAccount) {
    mobileAccount.innerHTML = `
      <span class="mobile-account-avatar">👤</span>
      <span class="mobile-account-text">
        <strong>${escapeHtml(name)}</strong>
        <small>${username ? escapeHtml(username) + " · " : ""}${isAdmin ? "مدیر سیستم" : "نماینده"}</small>
      </span>`;
    mobileAccount.classList.remove("hidden");
  }
}


/* =========================================================
   PRODUCTS
========================================================= */


async function loadProductDetailGallery(productId){
  const box=document.getElementById(`product-detail-gallery-${Number(productId)}`); if(!box)return;
  try{const r=await get(`/api/product-detail-images?product_id=${encodeURIComponent(productId)}`); const images=Array.isArray(r?.images)?r.images:[]; if(!images.length){box.innerHTML="";return;} box.innerHTML=`<div class="product-gallery-grid">${images.map((im,i)=>`<figure class="product-gallery-item"><img src="${escapeHtml(im.file_url||"")}" alt="${escapeHtml(im.caption||"تصویر محصول")}" loading="lazy"><figcaption>${escapeHtml(im.caption||"")}</figcaption></figure>`).join("")}</div>`;}catch(e){console.warn("Product gallery:",e);box.innerHTML="";}
}

async function loadProducts() {
  const loading = $("loading");

  if (loading) {
    loading.classList.remove("hidden");
    loading.textContent = "در حال دریافت محصولات...";
  }

  hideError();

  try {
    const result = await get("/api/products");

    if (Array.isArray(result)) {
      products = result;
    } else if (
      result &&
      Array.isArray(result.products)
    ) {
      products = result.products;
    } else {
      products = [];
    }

    buildCategories();
    renderCategories();
    renderProducts();

  } catch (error) {
    console.error("Products error:", error);

    products = [];

    showError(
      "❌ دریافت محصولات انجام نشد. اتصال اینترنت یا سرور را بررسی کنید."
    );

  } finally {
    if (loading) {
      loading.classList.add("hidden");
    }
  }
}


/* =========================================================
   CATEGORIES
========================================================= */

function buildCategories() {
  const set = new Set();

  products.forEach(product => {
    if (product.category) {
      set.add(String(product.category).trim());
    }
  });

  categories = Array.from(set);
}

function renderCategories() {
  const container = $("categories");

  if (!container) return;

  let html = `
    <button
      class="category-circle ${
        activeCategory === "" ? "active" : ""
      }"
      data-category=""
    >
      همه
    </button>
  `;

  categories.forEach(category => {
    html += `
      <button
        class="category-circle ${
          activeCategory === category ? "active" : ""
        }"
        data-category="${escapeHtml(category)}"
      >
        ${escapeHtml(category)}
      </button>
    `;
  });

  container.innerHTML = html;

  container
    .querySelectorAll(".category-circle")
    .forEach(button => {
      button.addEventListener("click", () => {
        activeCategory =
          button.dataset.category || "";

        renderCategories();
        renderProducts();
      });
    });
}


/* =========================================================
   SEARCH
========================================================= */

function getFilteredProducts() {
  const input = $("searchInput");

  const query = input
    ? input.value.trim().toLowerCase()
    : "";

  return products.filter(product => {
    const categoryOK =
      !activeCategory ||
      String(product.category || "") ===
        activeCategory;

    if (!categoryOK) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchable = [
      product.name_fa,
      product.name_en,
      product.category,
      product.package,
      product.maker,
      product.intro,
      product.composition,
      product.use_text,
      product.warnings
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(query);
  });
}


/* =========================================================
   PRODUCT CARDS
========================================================= */

function renderProducts() {
  const grid = $("productGrid");
  const empty = $("empty");
  const count = $("productCount");

  if (!grid) return;

  const filtered = getFilteredProducts();

  if (count) {
    count.textContent =
      `${formatNumber(filtered.length)} محصول`;
  }

  if (!filtered.length) {
    grid.innerHTML = "";

    if (empty) {
      empty.classList.remove("hidden");
    }

    return;
  }

  if (empty) {
    empty.classList.add("hidden");
  }

  grid.innerHTML = filtered
    .map(renderProductCard)
    .join("");
}

function renderProductCard(product) {
  const id = product.id;

  const name =
    product.name_fa ||
    product.name_en ||
    "محصول";

  const imageUrl =
    product.image_url || "";

  return `
    <article
      class="product-card"
      data-product-id="${escapeHtml(id)}"
      role="button"
      tabindex="0"
      onclick="openProduct(${Number(id)})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openProduct(${Number(id)})}"
    >

      <div class="product-image">

        ${
          imageUrl
            ? `
              <img
                src="${escapeHtml(imageUrl)}"
                alt="${escapeHtml(name)}"
                loading="lazy"
                onerror="
                  this.style.display='none';
                  this.parentElement.classList.add('image-error');
                "
              >
            `
            : `
              <div class="no-image">
                🌱
              </div>
            `
        }

      </div>

      <div class="product-body">

        <h3>
          ${escapeHtml(name)}
        </h3>

        ${
          product.name_en
            ? `
              <div class="product-en">
                ${escapeHtml(product.name_en)}
              </div>
            `
            : ""
        }

        ${
          product.category
            ? `
              <div class="product-category">
                ${escapeHtml(product.category)}
              </div>
            `
            : ""
        }

        ${
          product.package
            ? `
              <div class="product-package">
                📦 ${escapeHtml(product.package)}
              </div>
            `
            : ""
        }

        ${getPriceText(product)}

        <button type="button" class="product-cart-button" onclick="addToCart(${Number(id)}, event)">🛒 افزودن به سبد</button>

      </div>
    </article>
  `;
}


/* =========================================================
   APP DIALOGS + CATALOG VIEWER
   جایگزین پیام‌های native برای سازگاری کامل Web و Android WebView
========================================================= */

let appDialogResolver = null;

function appDialogClose(result) {
  const dialog = $("appDialog");
  if (dialog) {
    dialog.classList.add("hidden");
    dialog.setAttribute("aria-hidden", "true");
  }
  const resolver = appDialogResolver;
  appDialogResolver = null;
  if (resolver) resolver(result);
}

function appDialogOk() { appDialogClose(true); }
function appDialogCancel() { appDialogClose(false); }

function showAppDialog(message, confirmMode = false) {
  const dialog = $("appDialog");
  const msg = $("appDialogMessage");
  const ok = $("appDialogOk");
  const cancel = $("appDialogCancel");
  const close = $("appDialogClose");
  const icon = $("appDialogIcon");
  if (!dialog || !msg || !ok || !cancel) return;

  msg.textContent = String(message ?? "");
  const text = String(message ?? "");
  icon.textContent = text.includes("❌") ? "❌" : text.includes("⚠️") ? "⚠️" : text.includes("✅") ? "✅" : "ℹ️";
  cancel.classList.toggle("hidden", !confirmMode);
  ok.textContent = confirmMode ? "تأیید" : "باشه";
  if (close) close.style.display = confirmMode ? "" : "none";
  dialog.classList.remove("hidden");
  dialog.setAttribute("aria-hidden", "false");
  setTimeout(() => ok.focus(), 0);

  if (!confirmMode) return;
  return new Promise(resolve => { appDialogResolver = resolve; });
}

function appAlert(message) { showAppDialog(message, false); }
function appConfirm(message) { return showAppDialog(message, true); }

window.alert = appAlert;

function openCatalog(url, name) {
  const modal = $("catalogModal");
  const frame = $("catalogModalFrame");
  const title = $("catalogModalTitle");
  const external = $("catalogModalExternal");
  if (!modal || !frame) return;
  frame.src = String(url || "");
  if (title) title.textContent = "📄 کاتالوگ " + (name || "محصول");
  if (external) external.href = String(url || "");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeCatalog() {
  const modal = $("catalogModal");
  const frame = $("catalogModalFrame");
  if (frame) frame.src = "about:blank";
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
}

/* =========================================================
   PRODUCT MODAL
========================================================= */

function openProduct(id) {
  const product = products.find(
    p => Number(p.id) === Number(id)
  );

  if (!product) {
    return;
  }

  const modal = $("modal");
  const content = $("modalContent");

  if (!modal || !content) {
    return;
  }

  const name =
    product.name_fa ||
    product.name_en ||
    "محصول";

  let html = `
    <div class="product-detail">
      <button class="back-product" onclick="closeModal()">← بازگشت به محصولات</button>

      ${
        product.image_url
          ? `
            <img
              class="detail-image"
              src="${escapeHtml(product.image_url)}"
              alt="${escapeHtml(name)}"
            >
          `
          : ""
      }

      <h2>
        ${escapeHtml(name)}
      </h2>

      ${
        product.name_en
          ? `
            <div class="detail-en">
              ${escapeHtml(product.name_en)}
            </div>
          `
          : ""
      }

      ${getPriceText(product)}

      ${
        product.category
          ? `
            <div class="detail-row">
              <strong>دسته‌بندی:</strong>
              <span>${escapeHtml(product.category)}</span>
            </div>
          `
          : ""
      }

      ${
        product.package
          ? `
            <div class="detail-row">
              <strong>بسته‌بندی:</strong>
              <span>${escapeHtml(product.package)}</span>
            </div>
          `
          : ""
      }

      ${
        product.maker
          ? `
            <div class="detail-row">
              <strong>تولیدکننده:</strong>
              <span>${escapeHtml(product.maker)}</span>
            </div>
          `
          : ""
      }

      ${
        product.intro
          ? `
            <section class="detail-section">
              <h3>معرفی محصول</h3>
              <p>${escapeHtml(product.intro)}</p>
            </section>
          `
          : ""
      }

      ${
        product.composition
          ? `
            <section class="detail-section">
              <h3>ترکیبات</h3>
              <p>${escapeHtml(product.composition)}</p>
            </section>
          `
          : ""
      }

      ${
        product.benefits &&
        Array.isArray(product.benefits) &&
        product.benefits.length
          ? `
            <section class="detail-section">
              <h3>مزایا</h3>
              <ul>
                ${product.benefits
                  .map(
                    item =>
                      `<li>${escapeHtml(item)}</li>`
                  )
                  .join("")}
              </ul>
            </section>
          `
          : ""
      }

      ${
        product.use_text
          ? `
            <section class="detail-section">
              <h3>نحوه مصرف</h3>
              <p>${escapeHtml(product.use_text)}</p>
            </section>
          `
          : ""
      }

      ${
        product.warnings
          ? `
            <section class="detail-section warning">
              <h3>⚠️ هشدارها</h3>
              <p>${escapeHtml(product.warnings)}</p>
            </section>
          `
          : ""
      }

      <div id="product-detail-gallery-${Number(product.id)}" class="product-detail-gallery"></div>

      ${
        product.video_url
          ? `
            <div class="video-box">
              <video
                controls
                playsinline
                preload="metadata"
                src="${escapeHtml(product.video_url)}"
              ></video>
            </div>
          `
          : ""
      }


      ${
        product.catalog_pdf_url
          ? `
            <section class="catalog-section">
              <h3>📄 کاتالوگ</h3>
              <div class="catalog-frame-wrap">
                <iframe
                  src="${escapeHtml(product.catalog_pdf_url)}"
                  title="کاتالوگ ${escapeHtml(product.name_fa || "محصول")}"
                  loading="lazy"
                ></iframe>
              </div>
              <a
                 href="#"
                 data-catalog-url="${escapeHtml(product.catalog_pdf_url)}"
                 data-catalog-name="${escapeHtml(product.name_fa || "محصول")}"
                 class="catalog-fallback catalog-open"
               >
                 باز کردن کاتالوگ در صفحه جداگانه
               </a>
            </section>
          `
          : ""
      }


    </div>
  `;

  content.innerHTML = html;
  loadProductDetailGallery(product.id);

  modal.classList.remove("hidden");

  if (tg && tg.BackButton) {
    try {
      tg.BackButton.show();
    } catch (e) {}
  }
}

function closeModal() {
  const modal = $("modal");

  if (modal) {
    modal.classList.add("hidden");
  }

  if (tg && tg.BackButton) {
    try {
      tg.BackButton.hide();
    } catch (e) {}
  }
}


/* =========================================================
   ADMIN
========================================================= */

async function openAdmin() {
  const modal = $("adminModal");
  const error = $("adminError");

  if (!modal) return;

  modal.classList.remove("hidden");

  if (error) {
    error.classList.add("hidden");
    error.textContent = "";
  }

  // Refresh authentication before opening the management data.
  try {
    await loadCurrentUser();
  } catch (e) {
    console.warn("Admin authentication refresh:", e);
  }

  if (!isAdmin) {
    if (error) {
      error.textContent =
        "❌ این حساب به پنل مدیریت دسترسی ندارد. لطفاً سامانه را از داخل ربات تلگرام و با حساب مدیر باز کنید.";
      error.classList.remove("hidden");
    }
    return;
  }

  await loadAdminData();
}

function closeAdmin() {
  const modal = $("adminModal");

  if (modal) {
    modal.classList.add("hidden");
  }
}

async function loadAdminData() {
  const loading = $("adminLoading");
  const error = $("adminError");

  if (loading) {
    loading.classList.remove("hidden");
  }

  if (error) {
    error.classList.add("hidden");
  }

  try {
    await Promise.all([
      loadAdminProducts(),
      loadCustomers(),
      loadAdminRequests()
    ]);

    renderAdminAccount();

  } catch (e) {
    console.error(e);

    if (error) {
      error.textContent =
        "❌ دریافت اطلاعات مدیریت انجام نشد.";
      error.classList.remove("hidden");
    }

  } finally {
    if (loading) {
      loading.classList.add("hidden");
    }
  }
}

function renderAdminAccount() {
  const el = $("adminAccountInfo");

  if (!el) return;

  if (!currentUser) {
    el.innerHTML = "کاربر وارد نشده است.";
    return;
  }

  const name =
    [
      currentUser.first_name,
      currentUser.last_name
    ]
      .filter(Boolean)
      .join(" ") ||
    currentUser.username ||
    "کاربر";

  el.innerHTML = `
    <div>
      <strong>Name:</strong>
      ${escapeHtml(name)}
    </div>

    ${
      currentUser.username
        ? `
          <div>
            <strong>Username:</strong>
            @${escapeHtml(currentUser.username)}
          </div>
        `
        : ""
    }

    <div>
      <strong>Role:</strong>
      ${escapeHtml(isAdmin ? "admin" : (currentUser.role || "customer"))}
    </div>
  `;
}


/* =========================================================
   ADMIN PRODUCTS
========================================================= */

function toggleAdminAccordion(id){
  const item=$(id);
  if(!item || item.dataset.toggleBusy === "1") return;
  item.dataset.toggleBusy = "1";
  window.setTimeout(() => {
    item.classList.toggle("open");
    const button=item.querySelector(":scope > .admin-accordion-title");
    if(button) {
      const open = item.classList.contains("open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
      const chevron = button.querySelector(".admin-accordion-chevron");
      if (chevron) chevron.setAttribute("data-open", open ? "1" : "0");
    }
    item.dataset.toggleBusy = "0";
  }, 45);
}
function adminAccordion(id,title,body,extraClass=""){
  return `<div id="${escapeHtml(id)}" class="admin-accordion ${escapeHtml(extraClass)}">
    <button type="button" class="admin-accordion-title" aria-expanded="false" onclick="toggleAdminAccordion('${escapeHtml(id)}'); return false;">
      <span class="admin-accordion-title-text">${title}</span><span class="admin-accordion-chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="admin-accordion-body">${body}</div>
  </div>`;
}

function setAdminCount(id, count) {
  const el = $(id);
  if (el) el.textContent = formatNumber(count);
}

function renderAdminProductList(list, container){
  const allowDelete = container && container.id === "adminProducts";
  if(!container) return;
  if (allowDelete) {
    container.innerHTML = list.map((product, index) => {
      const id = Number(product.id);
      const nameFa = product.name_fa || product.name_en || "محصول";
      const nameEn = product.name_en || "";
      const body=`<div class="admin-accordion-summary"><span>شناسه محصول: ${escapeHtml(id)}</span></div>
        <button type="button" class="admin-danger admin-delete-product-button" onclick="deleteProduct(${id}); return false;">🗑️ حذف محصول</button>`;
      return adminAccordion(`admin-product-delete-${id}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>📦 ${escapeHtml(nameFa)}</strong>${nameEn ? `<small>${escapeHtml(nameEn)}</small>` : ""}`, body, "admin-product-accordion");
    }).join("");
    return;
  }
  container.innerHTML = list.map((product, index) => {
      const id = Number(product.id);
      const nameFa = product.name_fa || "";
      const nameEn = product.name_en || "";
      const benefits = Array.isArray(product.benefits) ? product.benefits.join("\n") : (product.benefits || "");
      const body=`
          <div class="admin-edit-grid">
            <label>نام فارسی<input id="namefa-${id}" value="${escapeHtml(nameFa)}"></label>
            <label>نام انگلیسی<input id="nameen-${id}" value="${escapeHtml(nameEn)}"></label>
            <label>دسته‌بندی<input id="category-${id}" value="${escapeHtml(product.category || "")}"></label>
            <label>بسته‌بندی<input id="package-${id}" value="${escapeHtml(product.package || "")}"></label>
            <label>سازنده<input id="maker-${id}" value="${escapeHtml(product.maker || "")}"></label>
            <label>قیمت پایه<input type="text" inputmode="decimal" id="price-${id}" value="${product.base_price ?? ""}" placeholder="قیمت پایه"></label>
          </div>
          <div class="admin-edit-grid admin-edit-grid-wide">
            <label>معرفی<textarea id="intro-${id}">${escapeHtml(product.intro || "")}</textarea></label>
            <label>ترکیبات<textarea id="composition-${id}">${escapeHtml(product.composition || "")}</textarea></label>
            <label>نحوه مصرف<textarea id="use-${id}">${escapeHtml(product.use_text || "")}</textarea></label>
            <label>هشدارها<textarea id="warnings-${id}">${escapeHtml(product.warnings || "")}</textarea></label>
            <label>مزایا<textarea id="benefits-${id}">${escapeHtml(benefits)}</textarea></label>
          </div>
          <label class="admin-active"><input type="checkbox" id="active-${id}" ${product.active !== false ? "checked" : ""}> محصول فعال و قابل نمایش برای مشتریان</label>
          <div class="admin-product-buttons"><button type="button" onclick="saveProduct(${id}); return false;">💾 ذخیره اطلاعات محصول</button></div>
          <div class="admin-product-images-manager" id="admin-detail-images-${id}">
            <div class="admin-media-heading"><strong>🖼️ عکس‌های محصول</strong><button type="button" onclick="loadAdminProductGallery(${id}); return false;">بارگذاری عکس‌های جزئیات</button></div>
            <div class="admin-detail-gallery-list"><div class="admin-gallery-empty">برای مدیریت عکس‌های جزئیات کلیک کنید.</div></div>
          </div>
          <div class="admin-media-grid">
            <div class="admin-media-box"><label>🖼️ تصویر اصلی جدید<input type="file" id="image-${id}" accept="image/*"></label><button type="button" onclick="uploadProductImage(${id}); return false;">آپلود / جایگزینی تصویر اصلی</button>${product.image_url ? `<button type="button" class="danger" onclick="removeProductImage(${id}); return false;">بایگانی تصویر اصلی</button>` : ""}</div>
            <div class="admin-media-box"><label>🎬 ویدئوی جدید<input type="file" id="video-${id}" accept="video/*"></label><button type="button" onclick="uploadProductVideo(${id}); return false;">آپلود / جایگزینی ویدئو</button>${product.video_url ? `<button type="button" class="danger" onclick="removeProductVideo(${id}); return false;">بایگانی ویدئو</button>` : ""}</div>
            <div class="admin-media-box"><label>📄 کاتالوگ جدید<input type="file" id="catalog-${id}" accept="application/pdf,.pdf,image/*"></label><button type="button" onclick="uploadProductCatalog(${id}); return false;">آپلود / جایگزینی کاتالوگ</button>${product.catalog_pdf_url ? `<button type="button" class="danger" onclick="removeProductCatalog(${id}); return false;">بایگانی کاتالوگ</button>` : ""}</div>
          </div>`;
      return adminAccordion(`admin-product-edit-${id}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>📦 ${escapeHtml(nameFa || nameEn || "محصول")}</strong>${nameEn ? `<small>${escapeHtml(nameEn)}</small>` : ""}`, body, "admin-product-accordion");
  }).join("");
}

async function loadAdminProducts() {
  const containers = [$('adminProducts'), $('adminEditProducts')].filter(Boolean);
  if (!containers.length) return;
  try {
    const result = await postJson('/api/admin/products', {});
    const list = Array.isArray(result) ? result : (Array.isArray(result?.products) ? result.products : products);
    setAdminCount("adminProductCountAdd", list.length);
    setAdminCount("adminProductCountEdit", list.length);
    containers.forEach(container => renderAdminProductList(list, container));
  } catch (error) {
    console.error('Admin products:', error);
    containers.forEach(container => { container.innerHTML = '<div class="message error">دریافت محصولات مدیریت انجام نشد.</div>'; });
  }
}

function adminVisibleElement(id){
  const nodes=Array.from(document.querySelectorAll(`[id="${CSS.escape(id)}"]`));
  return nodes.find(el=>{const sec=el.closest('[id^="adminSection-"]');return sec && !sec.classList.contains('hidden') && el.offsetParent!==null;}) || $(id);
}
function adminNumber(value){
  const raw=String(value??'').trim().replace(/[٬,\s]/g,'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  return raw===''?null:Number(raw);
}
async function saveProduct(productId) {
  const id=Number(productId);
  const value=adminVisibleElement;
  const benefitsText=value(`benefits-${id}`)?.value||'';
  const payload={product_id:id,name_fa:value(`namefa-${id}`)?.value.trim()||'',name_en:value(`nameen-${id}`)?.value.trim()||'',category:value(`category-${id}`)?.value.trim()||'',package:value(`package-${id}`)?.value.trim()||'',maker:value(`maker-${id}`)?.value.trim()||'',intro:value(`intro-${id}`)?.value||'',composition:value(`composition-${id}`)?.value||'',use_text:value(`use-${id}`)?.value||'',warnings:value(`warnings-${id}`)?.value||'',benefits:benefitsText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),active:!!value(`active-${id}`)?.checked,base_price:adminNumber(value(`price-${id}`)?.value),base_currency:'تومان'};
  if(!payload.name_fa){alert('نام فارسی محصول نمی‌تواند خالی باشد.');return;}
  try{const result=await postJson('/api/admin/update-product',payload);if(!result?.product?.length && !result?.product?.id)throw new Error('سرور رکورد محصول را تغییر نداد.');alert('✅ اطلاعات محصول ذخیره شد.');await loadProducts();await loadAdminProducts();}catch(error){console.error('Save product:',error);alert('❌ خطا در ذخیره محصول:\n'+error.message);}
}

async function uploadAdminProductGalleryImage(productId){
  const fileInput=document.getElementById(`detail-file-${Number(productId)}`); const captionInput=document.getElementById(`detail-caption-${Number(productId)}`); if(!fileInput?.files?.length)return alert("لطفاً تصویر را انتخاب کنید.");
  const fd=new FormData(); fd.append("product_id",String(productId)); fd.append("caption",captionInput?.value||""); fd.append("file",fileInput.files[0],fileInput.files[0].name);
  try{await apiRequest("/api/admin/upload-product-detail-image",{method:"POST",body:fd}); alert("✅ تصویر جزئیات اضافه شد."); fileInput.value=""; if(captionInput)captionInput.value=""; await loadAdminProductGallery(productId);}catch(e){alert("❌ خطا در آپلود تصویر جزئیات:\n"+e.message);}
}
async function saveAdminProductGalleryCaption(id,productId){const input=document.getElementById(`detail-cap-${Number(id)}`);try{await postJson("/api/admin/update-product-detail-image",{id:Number(id),caption:input?.value||""});alert("✅ عنوان تصویر ذخیره شد.");}catch(e){alert("❌ خطا:\n"+e.message);}}
async function replaceAdminProductGalleryImage(id,productId){const input=document.getElementById(`detail-replace-${Number(id)}`);if(!input?.files?.length)return alert("لطفاً تصویر جدید را انتخاب کنید.");const fd=new FormData();fd.append("id",String(id));fd.append("file",input.files[0],input.files[0].name);try{await apiRequest("/api/admin/replace-product-detail-image",{method:"POST",body:fd});alert("✅ تصویر جایگزین شد.");await loadAdminProductGallery(productId);}catch(e){alert("❌ خطا در جایگزینی:\n"+e.message);}}
async function deleteAdminProductGalleryImage(id,productId){if(!(await appConfirm("این تصویر به بایگانی منتقل و از جزئیات محصول حذف شود؟")))return;try{await postJson("/api/admin/delete-product-detail-image",{id:Number(id)});alert("✅ تصویر بایگانی شد.");await loadAdminProductGallery(productId);}catch(e){alert("❌ خطا:\n"+e.message);}}
async function loadAdminProductGallery(productId){const wrap=document.getElementById(`admin-detail-images-${Number(productId)}`);if(!wrap)return;try{const r=await get(`/api/product-detail-images?product_id=${encodeURIComponent(productId)}`);const images=Array.isArray(r?.images)?r.images:[];const list=wrap.querySelector('.admin-detail-gallery-list');list.innerHTML=`<div class="admin-detail-upload"><input type="file" id="detail-file-${Number(productId)}" accept="image/*"><input id="detail-caption-${Number(productId)}" placeholder="عنوان / توضیح تصویر"><button type="button" onclick="uploadAdminProductGalleryImage(${Number(productId)});return false;">➕ افزودن تصویر</button></div>${images.length?images.map(im=>`<div class="admin-gallery-row"><img src="${escapeHtml(im.file_url||"")}" alt=""><div class="admin-gallery-fields"><input id="detail-cap-${Number(im.id)}" value="${escapeHtml(im.caption||"")}" placeholder="عنوان تصویر"><div><button type="button" onclick="saveAdminProductGalleryCaption(${Number(im.id)},${Number(productId)});return false;">💾 عنوان</button><input type="file" id="detail-replace-${Number(im.id)}" accept="image/*"><button type="button" onclick="replaceAdminProductGalleryImage(${Number(im.id)},${Number(productId)});return false;">🔄 جایگزین</button><button type="button" class="danger" onclick="deleteAdminProductGalleryImage(${Number(im.id)},${Number(productId)});return false;">🗄️ بایگانی</button></div></div></div>`).join(""):"<div class=\"admin-gallery-empty\">هنوز عکس جزئیاتی ثبت نشده است.</div>"}`;}catch(e){console.error(e);alert("❌ دریافت عکس‌های جزئیات انجام نشد.\n"+e.message);}}
async function loadImageArchives(){const box=document.getElementById('imageArchivesList');if(!box)return;box.innerHTML='<div class="message">در حال دریافت بایگانی...</div>';try{const r=await get('/api/admin/image-archives');const files=Array.isArray(r?.files)?r.files:[];box.innerHTML=files.length?files.map(f=>`<div class="archive-image-row"><img src="${escapeHtml(f.file_url)}"><div><strong>${escapeHtml(f.name)}</strong><small>${escapeHtml(f.created_at||'')}</small><div class="archive-restore"><input type="number" min="1" id="archive-product-${escapeHtml(f.name.replace(/[^a-zA-Z0-9]/g,''))}" placeholder="شماره محصول"><button type="button" onclick="restoreArchivedImage(${JSON.stringify(f.storage_key)},this);return false;">↩️ بازگردانی</button></div></div></div>`).join(''):'<div class="message">بایگانی تصویری خالی است.</div>';}catch(e){box.innerHTML=`<div class="message error">دریافت بایگانی انجام نشد: ${escapeHtml(e.message)}</div>`;}}
async function restoreArchivedImage(storageKey,button){const wrap=button.closest('.archive-restore');const productId=Number(wrap?.querySelector('input')?.value);if(!productId)return alert('شماره محصول را وارد کنید.');if(!(await appConfirm('این تصویر به عنوان تصویر اصلی محصول بازگردانی شود؟')))return;try{await postJson('/api/admin/restore-image-archive',{storage_key:storageKey,product_id:productId});alert('✅ تصویر بازگردانی شد.');await loadImageArchives();await loadProducts();await loadAdminProducts();}catch(e){alert('❌ بازگردانی انجام نشد:\n'+e.message);}}

async function uploadProductImage(productId) {
  const input = adminVisibleElement(`image-${Number(productId)}`);
  if (!input?.files?.length) return alert("لطفاً تصویر را انتخاب کنید.");
  const fd = new FormData();
  fd.append("product_id", String(productId));
  fd.append("file", input.files[0], input.files[0].name);
  try {
    await apiRequest("/api/admin/upload-image", { method:"POST", body:fd });
    alert("✅ تصویر جدید ثبت شد. تصویر قبلی به old منتقل شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در تصویر:\n" + e.message); }
}

async function removeProductImage(productId) {
  if (!(await appConfirm("تصویر فعلی به پوشه old منتقل و از محصول خارج شود؟"))) return;
  try {
    await postJson("/api/admin/remove-image", {product_id:Number(productId)});
    alert("✅ تصویر بایگانی شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در تصویر:\n" + e.message); }
}

async function uploadProductCatalog(productId) {
  const input = adminVisibleElement(`catalog-${Number(productId)}`);
  if (!input?.files?.length) return alert("لطفاً کاتالوگ را انتخاب کنید.");
  const fd = new FormData(); fd.append("product_id", String(productId)); fd.append("file", input.files[0], input.files[0].name);
  try {
    await apiRequest("/api/admin/upload-catalog", {method:"POST", body:fd});
    alert("✅ کاتالوگ جدید ثبت شد. کاتالوگ قبلی به old منتقل شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در کاتالوگ:\n" + e.message); }
}

async function removeProductCatalog(productId) {
  if (!(await appConfirm("کاتالوگ فعلی به پوشه old منتقل و از محصول خارج شود؟"))) return;
  try {
    await postJson("/api/admin/remove-catalog", {product_id:Number(productId)});
    alert("✅ کاتالوگ بایگانی شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در کاتالوگ:\n" + e.message); }
}

async function updateProductPrice(productId) {
  const input = adminVisibleElement(`price-${Number(productId)}`);
  if (!input) { alert("کادر قیمت محصول پیدا نشد."); return; }
  const raw = String(input.value ?? "").trim();
  const normalized = raw.replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const price = normalized === "" ? null : Number(normalized);
  if (price !== null && !Number.isFinite(price)) { alert("قیمت واردشده معتبر نیست."); return; }
  try {
    const result = await postJson("/api/admin/update-price", { product_id:Number(productId), price, currency:"تومان" });
    if (!result?.product || (Array.isArray(result.product) && !result.product.length)) throw new Error("سرور قیمت را تغییر نداد.");
    alert("✅ قیمت ذخیره شد.");
    await loadProducts();
    await loadAdminProducts();
  } catch (error) {
    alert("❌ خطا در ذخیره قیمت:\n" + error.message);
  }
}


/* =========================================================
   VIDEO
========================================================= */

async function uploadProductVideo(productId) {
  const input =
    $(`video-${Number(productId)}`);

  if (!input || !input.files.length) {
    alert("لطفاً یک فایل ویدئو انتخاب کنید.");
    return;
  }

  const file = input.files[0];

  if (file.size > 100 * 1024 * 1024) {
    alert("❌ حجم ویدئو نباید بیشتر از 100MB باشد.");
    return;
  }

  const formData = new FormData();

  formData.append(
    "product_id",
    String(productId)
  );

  formData.append(
    "file",
    file,
    file.name
  );

  try {
    await apiRequest(
      "/api/admin/upload-video",
      {
        method: "POST",
        body: formData
      }
    );

    alert("✅ ویدئو با موفقیت آپلود شد.");

    await loadProducts();
    await loadAdminProducts();

  } catch (error) {
    alert(
      "❌ خطا در آپلود ویدئو:\n" +
      error.message
    );
  }
}

async function removeProductVideo(productId) {
  if (
    !(await appConfirm("آیا از حذف ویدئوی این محصول مطمئن هستید؟"))
  ) {
    return;
  }

  try {
    await postJson(
      "/api/admin/remove-video",
      {
        product_id: Number(productId)
      }
    );

    alert("✅ ویدئو حذف شد.");

    await loadProducts();
    await loadAdminProducts();

  } catch (error) {
    alert(
      "❌ خطا در حذف ویدئو:\n" +
      error.message
    );
  }
}


/* =========================================================
   CUSTOMERS
========================================================= */

async function loadCustomers() {
  const select = $("customerSelect");

  if (!select) return;

  try {
    const result =
      await postJson(
        "/api/admin/customers",
        {}
      );

    const customers =
      Array.isArray(result)
        ? result
        : Array.isArray(result?.customers)
          ? result.customers
          : [];

    select.innerHTML =
      `<option value="">انتخاب مشتری</option>`;

    customers.forEach(customer => {

      const name =
        [
          customer.first_name,
          customer.last_name
        ]
          .filter(Boolean)
          .join(" ") ||
        customer.username ||
        `مشتری ${customer.id}`;

      const option =
        document.createElement("option");

      option.value = customer.id;

      option.textContent =
        customer.username
          ? `${name} (${customer.username})`
          : name;

      option.dataset.customer =
        JSON.stringify(customer);

      select.appendChild(option);
    });

  } catch (error) {
    console.error("Customers:", error);
  }
  const editBox=$("adminUsers"), deleteBox=$("adminUsersDelete");
  if(editBox || deleteBox){
    try{
      const r=await postJson("/api/admin/customers",{});
      const cs=Array.isArray(r?.customers)?r.customers:(Array.isArray(r)?r:[]);
      setAdminCount("adminCustomerCountAdd", cs.length);
      setAdminCount("adminCustomerCountEdit", cs.length);
      const editHtml=cs.length?cs.map((c,index)=>{
        const id=String(c.id);
        const name=[c.first_name,c.last_name].filter(Boolean).join(" ") || c.username || "نماینده";
        const body=`<div class="admin-edit-grid"><label>نام<input id="ufirst-${id}" value="${escapeHtml(c.first_name||"")}"></label><label>نام خانوادگی<input id="ulast-${id}" value="${escapeHtml(c.last_name||"")}"></label><label>یوزر<input id="uuser-${id}" value="${escapeHtml(c.username||"")}"></label><label class="password-field">رمز عبور<div class="password-input-wrap"><input id="upass-${id}" type="text" value="${escapeHtml(c.password||"")}" placeholder="رمز عبور" autocomplete="off"><button type="button" class="password-eye" id="eye-upass-${id}" onclick="togglePasswordVisibility('upass-${id}','eye-upass-${id}'); return false;" aria-label="مخفی کردن رمز عبور" title="مخفی کردن رمز عبور">🙈</button></div></label><label>وضعیت<select id="ustatus-${id}"><option value="active" ${c.status!=="disabled"?"selected":""}>فعال</option><option value="disabled" ${c.status==="disabled"?"selected":""}>غیرفعال</option></select></label></div><button type="button" class="admin-save-customer-button" data-update-customer="${escapeHtml(id)}">💾 ذخیره</button>`;
        return adminAccordion(`admin-customer-edit-${id}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>👤 ${escapeHtml(name)}</strong><small>${escapeHtml(c.username?c.username:"")}</small>`, body, "admin-customer-accordion");
      }).join(""): `<div class="message">هنوز نماینده‌ای تعریف نشده است.</div>`;
      const deleteHtml=cs.length?cs.map((c,index)=>{
        const id=String(c.id);
        const name=[c.first_name,c.last_name].filter(Boolean).join(" ") || c.username || "نماینده";
        const body=`<div class="admin-accordion-summary"><span>نام کاربری: ${escapeHtml(c.username||"—")}</span>${c.phone?`<span>تلفن: ${escapeHtml(c.phone)}</span>`:""}</div><button type="button" class="admin-danger admin-delete-customer-button" data-delete-customer="${escapeHtml(id)}">🗑️ حذف نماینده</button>`;
        return adminAccordion(`admin-customer-delete-${id}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>👤 ${escapeHtml(name)}</strong><small>${escapeHtml(c.username?c.username:"")}</small>`, body, "admin-customer-accordion");
      }).join(""): `<div class="message">هنوز نماینده‌ای تعریف نشده است.</div>`;
      if(editBox) editBox.innerHTML=editHtml;
      if(deleteBox) deleteBox.innerHTML=deleteHtml;
    }catch(e){
      if(editBox) editBox.innerHTML=`<div class="message error">خطا در دریافت کاربران.</div>`;
      if(deleteBox) deleteBox.innerHTML=`<div class="message error">خطا در دریافت کاربران.</div>`;
    }
  }
  renderCustomerPicker();
}

function renderCustomerPicker(){
  const select=$("customerSelect");
  if(!select) return;
  let picker=$("customerPicker");
  if(!picker){
    picker=document.createElement("div");
    picker.id="customerPicker";
    picker.className="customer-picker";
    select.parentElement.appendChild(picker);
  }
  const current=select.value||"";
  const options=[...select.options].map(o=>({value:o.value,text:o.textContent}));
  picker.innerHTML=`
    <button type="button" class="customer-picker-trigger" onclick="toggleCustomerPicker()">
      <span>${escapeHtml(options.find(o=>o.value===current)?.text||"انتخاب مشتری")}</span><b>⌄</b>
    </button>
    <div class="customer-picker-list hidden">
      ${options.map(o=>`<button type="button" class="customer-picker-option ${o.value===current?"active":""}" onclick="selectCustomerPicker('${escapeHtml(o.value)}')">${escapeHtml(o.text)}</button>`).join("")}
    </div>`;
  select.classList.add("customer-select-hidden");
}
function toggleCustomerPicker(){
  const list=$("customerPicker")?.querySelector(".customer-picker-list");
  if(list) list.classList.toggle("hidden");
}
function selectCustomerPicker(value){
  const select=$("customerSelect");
  if(!select) return;
  select.value=value||"";
  const list=$("customerPicker")?.querySelector(".customer-picker-list");
  if(list) list.classList.add("hidden");
  const trigger=$("customerPicker")?.querySelector(".customer-picker-trigger span");
  const opt=select.selectedOptions?.[0];
  if(trigger) trigger.textContent=opt?.textContent||"انتخاب مشتری";
  select.dispatchEvent(new Event("change",{bubbles:true}));
}
function searchCustomerPriceCustomer(){
  const q=String($("customerPriceSearch")?.value||"").trim().toLocaleLowerCase("fa-IR");
  const options=$("customerPicker")?.querySelectorAll(".customer-picker-option")||[];
  options.forEach(btn=>{btn.style.display=!q || (btn.textContent||"").toLocaleLowerCase("fa-IR").includes(q)?"":"none";});
}

async function loadCustomerPrices(customerId) {
  const container = $("customerPrices");
  const info = $("customerInfo");
  if (!container) return;

  container.innerHTML = `<div class="message">در حال دریافت قیمت‌ها...</div>`;

  try {
    const result = await postJson("/api/admin/customer-prices", { customer_id: customerId });
    const prices = Array.isArray(result) ? result : (Array.isArray(result?.prices) ? result.prices : []);
    const priceMap = new Map(prices.map(item => [Number(item.product_id), item]));

    if (info) {
      const opt = $("customerSelect")?.selectedOptions?.[0];
      const customer = opt?.dataset?.customer ? JSON.parse(opt.dataset.customer) : null;
      info.innerHTML = customer ? `
        <strong>مشتری:</strong> ${escapeHtml([customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.username || "مشتری")}
        ${customer.telegram_user_id ? `<span> | Telegram ID: ${escapeHtml(customer.telegram_user_id)}</span>` : ""}
      ` : "";
      info.classList.remove("hidden");
    }

    if (!products.length) {
      container.innerHTML = `<div class="message">محصولی برای قیمت‌گذاری وجود ندارد.</div>`;
      return;
    }

    container.innerHTML = `<div class="customer-price-tools"><button type="button" class="admin-danger" onclick="resetCustomerPrices('${escapeHtml(customerId)}')">↩️ برگرداندن تمام قیمت‌ها به قیمت عمومی</button><span>با این کار همه قیمت‌های اختصاصی این مشتری حذف می‌شود.</span></div>` + products.map(product => {
      const pid = Number(product.id);
      const item = priceMap.get(pid);
      return `
        <div class="customer-price-row">
          <div>${escapeHtml(product.name_fa || product.name_en || `محصول ${pid}`)}</div>
          <input type="text" inputmode="numeric" id="customer-price-${pid}" value="${item?.price ?? ""}" placeholder="قیمت اختصاصی (خالی = حذف)" oninput="formatCustomerPriceInput(this)">
          <button onclick="setCustomerPrice('${escapeHtml(customerId)}', ${pid})">ذخیره</button>
        </div>`;
    }).join("");
  } catch (error) {
    container.innerHTML = `<div class="message error">خطا در دریافت قیمت مشتری.</div>`;
  }
}

function formatCustomerPriceInput(input){
  const digits=String(input.value||"").replace(/[^0-9۰-۹٠-٩]/g,"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
  if(!digits){input.value="";return;}
  input.value=digits.replace(/\B(?=(\d{3})+(?!\d))/g,"'");
}
async function resetCustomerPrices(customerId){
  if(!(await appConfirm("آیا تمام قیمت‌های اختصاصی این مشتری به قیمت عمومی برگردانده شود؟")))return;
  try{const r=await postJson("/api/admin/reset-customer-prices",{customer_id:customerId}); if(!r?.ok)throw new Error(r?.error||"سرور تأیید نکرد."); await loadCustomerPrices(customerId); appAlert("✅ تمام قیمت‌های این مشتری به قیمت عمومی برگشت داده شد.");}
  catch(e){appAlert("❌ بازگردانی قیمت‌ها انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}

async function setCustomerPrice(
  customerId,
  productId
) {
  const input = adminVisibleElement(`customer-price-${Number(productId)}`);

  if (!input) return;

  const value = input.value.trim();
  const normalized = value.replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

  try {
    await postJson(
      "/api/admin/set-customer-price",
      {
        customer_id: customerId,
        product_id: Number(productId),
        price:
          normalized === ""
            ? null
            : Number(normalized),
        currency: "تومان"
      }
    );

    alert("✅ قیمت اختصاصی ذخیره شد.");

    await loadCustomerPrices(customerId);

  } catch (error) {
    alert(
      "❌ خطا در ذخیره قیمت مشتری:\n" +
      error.message
    );
  }
}


/* =========================================================
   SYSTEM ADMINS
========================================================= */

async function createAdminUser(){
  const first_name=$("newAdminFirstName")?.value.trim()||"";
  const last_name=$("newAdminLastName")?.value.trim()||"";
  const telegram_user_id=$("newAdminTelegramId")?.value.trim()||"";
  const username=$("newAdminUsername")?.value.trim()||"";
  const password=$("newAdminPassword")?.value||"";
  const permissions=ADMIN_PERMISSION_KEYS.filter(key=>$("newAdminPerm-"+key)?.checked);

  if(!telegram_user_id && !(username && password)){
    appAlert("⚠️ حداقل Telegram ID یا هر دو مورد نام کاربری و رمز عبور وب را وارد کنید.");
    return;
  }
  if(username && username.length < 3){
    appAlert("⚠️ نام کاربری وب باید حداقل ۳ کاراکتر باشد.");
    return;
  }
  if(username && !/^[a-zA-Z0-9_.-]+$/.test(username)){
    appAlert("⚠️ نام کاربری وب فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.");
    return;
  }
  if(username && !password){
    appAlert("⚠️ برای نام کاربری وب، رمز عبور را هم وارد کنید.");
    return;
  }

  const button=document.querySelector('.admin-admin-create .admin-add-user-button');
  if(button){button.disabled=true;button.textContent="⏳ در حال افزودن...";}
  try{
    const r=await postJson("/api/admin/create-admin",{
      first_name,last_name,telegram_user_id,username,password,permissions
    });
    if(!r?.ok) throw new Error(r?.error||"سرور مدیر را ایجاد نکرد.");

    ["newAdminFirstName","newAdminLastName","newAdminTelegramId","newAdminUsername","newAdminPassword"].forEach(id=>{
      const el=$(id);
      if(el) el.value="";
    });
    await loadAdminUsers();
    appAlert("✅ مدیر جدید با موفقیت اضافه شد.");
  }catch(e){
    console.error("Create admin:",e);
    appAlert("❌ افزودن مدیر انجام نشد:\n"+(e.message||"خطای نامشخص"));
  }finally{
    if(button){button.disabled=false;button.textContent="🛡️ افزودن مدیر";}
  }
}

async function loadAdminUsers(){
  const container=$("adminUsersList");
  if(!container) return;
  container.innerHTML='<div class="message">در حال دریافت مدیران سیستم...</div>';
  try{
    const r=await postJson("/api/admin/admin-users",{});
    const admins=Array.isArray(r?.admins)?r.admins:[];
    const createBox=$("admin-create-admin-box");
    if(createBox) createBox.classList.toggle("hidden", r?.can_create_admin === false);
    setAdminCount("adminManagerCount", admins.length);
    if(!admins.length){container.innerHTML='<div class="message">هنوز مدیر دیگری تعریف نشده است.</div>';return;}
    container.innerHTML=admins.map((a,index)=>{
      const id=String(a.id||"");
      const key=id || String(a.telegram_user_id||"");
      const main=!!a.is_primary;
      const name=[a.first_name,a.last_name].filter(Boolean).join(" ")||a.username||"مدیر";
      if(main){
        const body=`<div class="admin-accordion-summary"><span>👑 مدیر اصلی</span><span>دسترسی کامل · غیرقابل حذف</span>${a.telegram_user_id?`<span>Telegram ID: ${escapeHtml(a.telegram_user_id)}</span>`:""}</div>`;
        return adminAccordion(`admin-system-primary-${key}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>🛡️ ${escapeHtml(name)}</strong><small>مدیر اصلی</small>`, body, "admin-system-accordion admin-primary-accordion");
      }
      const perms=Array.isArray(a.permissions)?a.permissions:[];
      const body=`<div class="admin-edit-grid admin-system-edit-grid">
          <label>نام<input id="afirst-${escapeHtml(key)}" value="${escapeHtml(a.first_name||"")}"></label>
          <label>نام خانوادگی<input id="alast-${escapeHtml(key)}" value="${escapeHtml(a.last_name||"")}"></label>
          <label>Telegram ID<input id="atele-${escapeHtml(key)}" value="${escapeHtml(a.telegram_user_id||"")}" inputmode="numeric"></label>
          <label>نام کاربری وب<input id="auser-${escapeHtml(key)}" value="${escapeHtml(a.username||"")}" autocomplete="off"></label>
          <label class="password-field">رمز جدید<div class="password-input-wrap"><input id="apass-${escapeHtml(key)}" type="password" placeholder="برای تغییر رمز وارد کنید" autocomplete="new-password"><button type="button" class="password-eye" id="eye-apass-${escapeHtml(key)}" onclick="togglePasswordVisibility('apass-${escapeHtml(key)}','eye-apass-${escapeHtml(key)}'); return false;" aria-label="نمایش رمز جدید" title="نمایش رمز جدید">👁️</button></div></label>
          <label>وضعیت<select id="astatus-${escapeHtml(key)}"><option value="active" ${a.status!=="disabled"?'selected':''}>فعال</option><option value="disabled" ${a.status==="disabled"?'selected':''}>غیرفعال</option></select></label>
        </div>
        <div class="admin-permission-box"><strong>سطح دسترسی مدیر</strong><div class="admin-permission-grid">${ADMIN_PERMISSION_KEYS.map(k=>`<label><input type="checkbox" id="aperm-${escapeHtml(key)}-${k}" ${perms.includes(k)?'checked':''}> ${({products:'محصولات',customers:'نماینده‌ها',prices:'قیمت‌های اختصاصی',requests:'سفارش‌ها و یادداشت‌ها',footer:'اطلاعات شرکت'})[k]}</label>`).join('')}</div></div>
        <div class="admin-system-actions">
          <button type="button" class="admin-save-customer-button" data-update-admin="${escapeHtml(key)}">💾 ذخیره مدیر</button>
          <button type="button" class="admin-danger admin-delete-admin-button" data-delete-admin="${escapeHtml(key)}">🗑️ حذف مدیر</button>
        </div>`;
      return adminAccordion(`admin-system-edit-${key}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>🛡️ ${escapeHtml(name)}</strong><small>${a.username ? escapeHtml(a.username) : (a.telegram_user_id ? `Telegram: ${escapeHtml(a.telegram_user_id)}` : "مدیر سیستم")}</small>`, body, "admin-system-accordion");
    }).join("");
  }catch(e){container.innerHTML=`<div class="message error">❌ دریافت مدیران انجام نشد.<br>${escapeHtml(e.message||"")}</div>`;}
}

async function updateAdminUser(key){
  if(!key)return;
  const permissions=ADMIN_PERMISSION_KEYS.filter(k=>$("aperm-"+key+"-"+k)?.checked);
  const payload={
    id:key,
    first_name:$("afirst-"+key)?.value.trim()||"",
    last_name:$("alast-"+key)?.value.trim()||"",
    telegram_user_id:$("atele-"+key)?.value.trim()||"",
    username:$("auser-"+key)?.value.trim()||"",
    password:$("apass-"+key)?.value||"",
    status:$("astatus-"+key)?.value||"active",
    permissions
  };
  if(!payload.telegram_user_id && !payload.username){
    appAlert("⚠️ Telegram ID یا نام کاربری وب باید باقی بماند."); return;
  }
  try{
    await postJson("/api/admin/update-admin",payload);
    await loadAdminUsers();
    appAlert("✅ اطلاعات مدیر و سطح دسترسی با موفقیت ذخیره شد.");
  }catch(e){appAlert("❌ ویرایش مدیر انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}

async function deleteAdminUser(id){
  if(!id)return;
  if(!(await appConfirm("آیا این مدیر سیستم حذف شود؟")))return;
  try{
    const row=document.querySelector(`[data-delete-admin="${CSS.escape(String(id))}"]`)?.closest('.admin-system-edit-row');
    const tgId=row?.querySelector('input[id^="atele-"]')?.value.trim()||"";
    await postJson("/api/admin/delete-admin",{id,telegram_user_id:tgId});
    await loadAdminUsers();
    appAlert("✅ مدیر سیستم حذف شد.");
  }catch(e){appAlert("❌ حذف مدیر انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}

/* =========================================================
   LETTER INBOX / MAILBOX
========================================================= */

let letterThreads = [];
let letterCurrentThread = null;
let letterPollingTimer = null;

function localDateInputValue(d=new Date()){
  const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,10);
}

/* Persian/Jalali date helpers — UI is Persian, API continues using Gregorian dates. */
function jalaliToGregorian(jy,jm,jd){
  jy=Number(jy);jm=Number(jm);jd=Number(jd);
  let jYear=jy+1595;
  let days=-355668 + 365*jYear + Math.floor(jYear/33)*8 + Math.floor(((jYear%33)+3)/4) + jd + (jm<7?(jm-1)*31:(jm-7)*30+186);
  let gy=400*Math.floor(days/146097); days%=146097;
  if(days>36524){gy+=100*Math.floor(--days/36524);days%=36524;if(days>=365)days++;}
  gy+=4*Math.floor(days/1461);days%=1461;
  if(days>365){gy+=Math.floor((days-1)/365);days=(days-1)%365;}
  const gd=days+1;
  const leap=(gy%4===0&&gy%100!==0)||gy%400===0;
  const monthDays=[0,31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  let gm=1, rem=gd; while(rem>monthDays[gm]){rem-=monthDays[gm];gm++;}
  return {gy,gm,gd:rem};
}
function gregorianToJalali(date){
  const g=new Date(date), gy=g.getFullYear(),gm=g.getMonth()+1,gd=g.getDate();
  const gDays=[0,31,28,31,30,31,30,31,31,30,31,30,31];
  let gy2=gy-1600, gm2=gm-1, gd2=gd-1;
  let day=365*gy2+Math.floor((gy2+3)/4)-Math.floor((gy2+99)/100)+Math.floor((gy2+399)/400);
  for(let i=0;i<gm2;i++) day+=gDays[i+1];
  if(gm2>1&&((gy%4===0&&gy%100!==0)||gy%400===0))day++;
  day+=gd2;
  let jday=day-79, jNp=Math.floor(jday/12053); jday%=12053;
  let jy=979+33*jNp+4*Math.floor(jday/1461); jday%=1461;
  if(jday>=366){jy+=Math.floor((jday-1)/365);jday=(jday-1)%365;}
  const jm=jday<186?1+Math.floor(jday/31):7+Math.floor((jday-186)/30);
  const jd=1+(jday<186?jday%31:(jday-186)%30);
  return {jy,jm,jd};
}
function faDigits(v){return String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);}
function enDigits(v){return String(v).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));}
function normalizeJalaliInput(v){return enDigits(String(v||'').trim()).replace(/[-.]/g,'/').replace(/\s+/g,'');}
function jalaliInputToGregorian(v){
  const m=normalizeJalaliInput(v).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); if(!m)return null;
  const [_,jy,jm,jd]=m.map(Number); if(jy<1300||jm<1||jm>12||jd<1||jd>(jm<=6?31:jm<=11?30:30))return null;
  const g=jalaliToGregorian(jy,jm,jd); const d=new Date(g.gy,g.gm-1,g.gd); return localDateInputValue(d);
}
function setJalaliInput(id,iso){const el=$(id);if(!el)return;if(!iso){el.value='';return;}const d=new Date(`${iso}T12:00:00`),j=gregorianToJalali(d);el.value=`${faDigits(j.jy)}/${faDigits(String(j.jm).padStart(2,'0'))}/${faDigits(String(j.jd).padStart(2,'0'))}`;}
function updateLetterDateSubtext(input){
  if(!input)return; let sub=input.parentElement.querySelector('.jalali-date-gregorian'); if(!sub){sub=document.createElement('small');sub.className='jalali-date-gregorian';input.parentElement.appendChild(sub);}
  const iso=jalaliInputToGregorian(input.value); sub.textContent=iso?`معادل میلادی: ${iso.replace(/-/g,'/')}`:'تاریخ میلادی پس از انتخاب نمایش داده می‌شود';
}
function bindJalaliDateInputs(){['letterDateFrom','letterDateTo'].forEach(id=>{const el=$(id);if(!el||el.dataset.jalaliBound)return;el.dataset.jalaliBound='1';el.addEventListener('input',()=>updateLetterDateSubtext(el));el.addEventListener('blur',()=>{const iso=jalaliInputToGregorian(el.value);if(el.value.trim()&&!iso){el.value='';updateLetterDateSubtext(el);appAlert('تاریخ شمسی واردشده معتبر نیست.');}});});}
function updateLetterTodayHeader(){
  const now=new Date(),j=gregorianToJalali(now), weekdays=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
  const name=(currentUser?.first_name||currentUser?.username||currentUser?.name||'کاربر')+(currentUser?.last_name?` ${currentUser.last_name}`:'');
  if($('letterTodayJalali'))$('letterTodayJalali').textContent=`امروز ${faDigits(j.jy)}/${faDigits(String(j.jm).padStart(2,'0'))}/${faDigits(String(j.jd).padStart(2,'0'))}`;
  if($('letterTodayWeekday'))$('letterTodayWeekday').textContent=`روز ${weekdays[now.getDay()]}`;
  if($('letterTodayGregorian'))$('letterTodayGregorian').textContent=`معادل میلادی: ${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
  if($('letterLoggedInSender'))$('letterLoggedInSender').textContent=`فرستنده این حساب: ${name}`;
}
function openLetterInbox(){
  if(!currentUser)return;
  const modal=$('letterInboxModal'); if(!modal)return;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  bindJalaliDateInputs(); updateLetterTodayHeader();
  const today=localDateInputValue();
  if(!$('letterDateFrom').value)setJalaliInput('letterDateFrom',today);
  if(!$('letterDateTo').value)setJalaliInput('letterDateTo',today);
  updateLetterDateSubtext($('letterDateFrom'));updateLetterDateSubtext($('letterDateTo'));loadLetterInbox();
}
function closeLetterInbox(){const m=$('letterInboxModal');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}}

async function loadLetterRecipients(){
  const wrap=$('letterRecipientWrap');
  const sel=$('letterRecipientSelect');
  if(!wrap||!sel)return;
  const role=String(currentUser?.role||'').toLowerCase();
  const adminMode=isAdmin || role==='admin' || role==='super_admin';
  if(!adminMode){wrap.classList.add('hidden');return;}
  wrap.classList.remove('hidden');
  sel.disabled=true;
  sel.innerHTML='<option value="">در حال دریافت فهرست نماینده‌ها...</option>';
  try{
    const r=await postJson('/api/admin/customers',{});
    const customers=Array.isArray(r)?r:(Array.isArray(r?.customers)?r.customers:(Array.isArray(r?.data?.customers)?r.data.customers:(Array.isArray(r?.data)?r.data:[])));
    if(!customers.length){
      sel.innerHTML='<option value="">نماینده‌ای برای انتخاب وجود ندارد</option>';
      sel.disabled=true;
      return;
    }
    sel.innerHTML='<option value="">انتخاب نماینده...</option>'+customers.map(c=>{
      const id=String(c.id||c.customer_id||'');
      const name=[c.first_name,c.last_name].filter(Boolean).join(' ')||c.name||c.username||'نماینده';
      const user=c.username?`@${String(c.username).replace(/^@/,'')}`:'بدون نام کاربری';
      return `<option value="${escapeHtml(id)}">${escapeHtml(name)} — ${escapeHtml(user)}</option>`;
    }).join('');
    sel.disabled=false;
  }catch(e){
    console.error('Letter recipients:',e);
    sel.innerHTML='<option value="">خطا در دریافت فهرست نماینده‌ها</option>';
    sel.disabled=true;
  }
}

function renderLetterRecipientPicker(){}
function toggleLetterRecipientPicker(event){
  if(event){event.preventDefault();event.stopPropagation();}
  const picker=$('letterRecipientPicker');
  const list=picker?.querySelector('.letter-recipient-list');
  if(!list)return;
  const opening=list.classList.contains('hidden');
  list.classList.toggle('hidden',!opening);
  if(opening){
    list.style.display='block';
    setTimeout(()=>{const input=$('letterRecipientSearch');input?.focus();input?.select();},30);
  }else{
    list.style.display='none';
  }
}
function filterLetterRecipients(){
  const q=String($('letterRecipientSearch')?.value||'').trim().toLocaleLowerCase('fa-IR');
  document.querySelectorAll('#letterRecipientOptions .letter-recipient-option').forEach(btn=>{
    const hay=String(btn.dataset.search||'');
    btn.style.display=!q||hay.includes(q)?'':'none';
  });
}
function selectLetterRecipient(value){
  const sel=$('letterRecipientSelect');
  if(!sel)return;
  sel.value=String(value||'');
  const list=$('letterRecipientPicker')?.querySelector('.letter-recipient-list');
  if(list){list.classList.add('hidden');list.style.display='none';}
  const options=[...sel.options];
  const opt=options.find(o=>o.value===sel.value);
  const picker=$('letterRecipientPicker');
  const nameEl=picker?.querySelector('.recipient-trigger-name');
  const userEl=picker?.querySelector('.recipient-trigger-user');
  if(nameEl)nameEl.textContent=opt?.dataset?.name||'انتخاب نماینده';
  if(userEl)userEl.textContent=opt?.dataset?.user||'فهرست نمایندگان';
  picker?.querySelectorAll('.letter-recipient-option').forEach(btn=>btn.classList.toggle('active',btn.dataset.id===sel.value));
}

function openLetterCompose(){
  if(!currentUser)return appAlert('⚠️ ابتدا وارد حساب کاربری خود شوید.');
  const modal=$('letterComposeModal'); if(!modal)return;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  const subject=$('letterComposeSubject'), body=$('letterComposeBody');
  if(subject)subject.value=''; if(body)body.value='';
  const role=String(currentUser?.role||'').toLowerCase();
  const adminMode=isAdmin || role==='admin' || role==='super_admin';
  if(adminMode){
    $('letterComposeHelp')?.replaceChildren(document.createTextNode('نامه را برای نماینده موردنظر ارسال کنید.'));
    loadLetterRecipients();
  }else{
    $('letterComposeHelp')?.replaceChildren(document.createTextNode('پیام خود را برای مشکفام فارس بنویسید.'));
    $('letterRecipientWrap')?.classList.add('hidden');
  }
  setTimeout(()=>subject?.focus(),80);
}
function closeLetterCompose(){const m=$('letterComposeModal');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}}
function resetLetterFilters(){const t=localDateInputValue();setJalaliInput('letterDateFrom',t);setJalaliInput('letterDateTo',t);$('letterReadFilter').value='all';if($('letterSenderFilter'))$('letterSenderFilter').value='';updateLetterDateSubtext($('letterDateFrom'));updateLetterDateSubtext($('letterDateTo'));loadLetterInbox();}
function showAllLetters(){$('letterDateFrom').value='';$('letterDateTo').value='';$('letterReadFilter').value='all';if($('letterSenderFilter'))$('letterSenderFilter').value='';updateLetterDateSubtext($('letterDateFrom'));updateLetterDateSubtext($('letterDateTo'));loadLetterInbox();}

async function loadLetterUnreadCount(){
  if(!currentUser)return;
  try{
    const endpoint=isAdmin?"/api/admin/letters-unread-count":"/api/customer/letters-unread-count";
    const r=await postJson(endpoint,{}); const n=Number(r?.count||0);
    setAdminCount("letterInboxCount",n);
    const b=$("letterInboxCount");if(b)b.classList.toggle("has-unread",n>0);
  }catch(e){console.warn("Letter unread count",e);}
}
function startLetterPolling(){if(letterPollingTimer)clearInterval(letterPollingTimer);if(!currentUser)return;loadLetterUnreadCount();letterPollingTimer=setInterval(loadLetterUnreadCount,15000);}

async function loadLetterInbox(){
  const list=$("letterList"), thread=$("letterThread"); if(!list||!thread)return;
  list.innerHTML='<div class="message">در حال دریافت نامه‌ها...</div>';
  try{
    const payload={from:jalaliInputToGregorian($("letterDateFrom")?.value)||"",to:jalaliInputToGregorian($("letterDateTo")?.value)||"",read_filter:$("letterReadFilter")?.value||"all",sender_id:$("letterSenderFilter")?.value||""};
    const endpoint=isAdmin?"/api/admin/letters":"/api/customer/letters";
    const r=await postJson(endpoint,payload); letterThreads=Array.isArray(r?.messages)?r.messages:[];
    renderLetterSenderFilter(letterThreads);
    if(!letterThreads.length){list.innerHTML='<div class="message">نامه‌ای با این فیلتر پیدا نشد.</div>';return;}
    list.innerHTML=letterThreads.map((m,i)=>{
      const unread=!m.read;
      const subjectText=String(m.subject||'');
      const typeClass=subjectText.includes('🛒')?'type-cart':subjectText.includes('📝')?'type-note':subjectText.includes('↩️')?'type-reply':'type-letter';
      const sender=m.sender_name||m.sender_username||"کاربر";
      return `<div class="letter-item ${unread?'unread':''} ${typeClass}" onclick="openLetterThread(${i})"><div class="letter-item-head"><span>${unread?'● جدید':'✓ خوانده شده'}</span><span>${escapeHtml(formatLetterDate(m.created_at))}</span></div><div class="letter-item-subject">${escapeHtml(m.subject||'بدون عنوان')}</div><div class="letter-item-preview">${escapeHtml(m.body||'')}</div><div class="letter-item-head"><span>👤 ${escapeHtml(sender)}</span><span>${m.reply_count?`↩️ ${formatNumber(m.reply_count)}`:''}</span></div></div>`;
    }).join("");
    if(letterCurrentThread!=null){const idx=letterThreads.findIndex(x=>String(x.thread_id||x.id)===String(letterCurrentThread));if(idx>=0)openLetterThread(idx);}
    await loadLetterUnreadCount();
  }catch(e){list.innerHTML=`<div class="message error">دریافت صندوق نامه انجام نشد.<br>${escapeHtml(e.message||'')}</div>`;}
}
function renderLetterSenderFilter(messages){
  const sel=$("letterSenderFilter");if(!sel||!isAdmin)return;
  const current=sel.value; const seen=new Map();messages.forEach(m=>{if(m.sender_customer_id&&!seen.has(String(m.sender_customer_id)))seen.set(String(m.sender_customer_id),m.sender_name||m.sender_username||"کاربر")});
  sel.innerHTML='<option value="">همه فرستنده‌ها</option>'+Array.from(seen.entries()).map(([id,name])=>`<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");if(current)sel.value=current;
}
function formatLetterDate(v){try{return new Date(v).toLocaleString('fa-IR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return v||'';}}
async function openLetterThread(index){
  const m=letterThreads[index];if(!m)return;letterCurrentThread=String(m.thread_id||m.id);
  const thread=$("letterThread");if(!thread)return;thread.innerHTML='<div class="message">در حال دریافت گفتگو...</div>';
  try{
    const endpoint=isAdmin?"/api/admin/letter-thread":"/api/customer/letter-thread";
    const r=await postJson(endpoint,{thread_id:m.thread_id||m.id}); const messages=Array.isArray(r?.messages)?r.messages:[];
    const subject=m.subject||messages[0]?.subject||"بدون عنوان";
    thread.innerHTML=`<div class="thread-head"><h3>✉️ ${escapeHtml(subject)}</h3><small>گفتگوی کامل نامه و پاسخ‌ها</small></div><div class="thread-messages">${messages.map((x,idx)=>{const mine=String(x.sender_customer_id||'')===String(currentUser?.id||'');const subjectValue=String(x.subject||subject||'');const kind=subjectValue.includes('🛒')?'type-cart':subjectValue.includes('📝')?'type-note':idx>0?'type-reply':'type-letter';return `<div class="thread-message ${mine?'mine':''} ${kind}"><div class="tm-head"><strong>${escapeHtml(x.sender_name||x.sender_username||'کاربر')}</strong><span>${escapeHtml(formatLetterDate(x.created_at))}</span></div><div class="tm-body">${escapeHtml(x.body||'')}</div></div>`}).join('')}</div><div class="thread-reply"><textarea id="letterReplyBody" class="letter-textarea" rows="4" placeholder="پاسخ خود را بنویسید..."></textarea><button class="admin-primary" type="button" onclick="sendLetterReply(${Number(m.thread_id||m.id)})">📨 ارسال پاسخ</button></div>`;
    await postJson(isAdmin?"/api/admin/letter-mark-read":"/api/customer/letter-mark-read",{thread_id:m.thread_id||m.id});
    m.read=true;renderLetterListAfterRead();await loadLetterUnreadCount();
  }catch(e){thread.innerHTML=`<div class="message error">دریافت گفتگو انجام نشد.<br>${escapeHtml(e.message||'')}</div>`;}
}
function renderLetterListAfterRead(){document.querySelectorAll('.letter-item').forEach(el=>el.classList.remove('unread'));}
async function sendLetterReply(threadId){const body=$("letterReplyBody")?.value.trim();if(!body)return appAlert("لطفاً متن پاسخ را بنویسید.");try{await postJson(isAdmin?"/api/admin/letter-reply":"/api/customer/letter-reply",{thread_id:Number(threadId),body});appAlert("✅ پاسخ با موفقیت ارسال شد.");await loadLetterInbox();}catch(e){appAlert("❌ ارسال پاسخ انجام نشد:\n"+(e.message||''));}}
async function sendNewLetter(){
  const subjectEl=$("letterComposeSubject"), bodyEl=$("letterComposeBody"), recipientEl=$("letterRecipientSelect");
  const subject=String(subjectEl?.value||"").trim();
  const body=String(bodyEl?.value||"").trim();
  const recipientId=String(recipientEl?.value||"").trim();
  if(!subject){subjectEl?.focus();return appAlert("⚠️ عنوان نامه را وارد کنید.");}
  if(!body){bodyEl?.focus();return appAlert("⚠️ متن نامه را وارد کنید.");}
  if(isAdmin && (!recipientId || !Number.isFinite(Number(recipientId)))){recipientEl?.focus();return appAlert("⚠️ ابتدا یک نماینده را از فهرست گیرنده‌ها انتخاب کنید.");}
  const button=document.querySelector('#letterComposeModal .admin-primary');
  if(button){button.disabled=true;button.textContent="⏳ در حال ارسال...";}
  try{
    const payload=isAdmin
      ? {recipient_customer_id:Number(recipientId),subject:subject,body:body}
      : {subject:subject,body:body};
    const result=await postJson(isAdmin?'/api/admin/letter':'/api/customer/letter',payload);
    if(result?.ok===false) throw new Error(result.error||'سرور نامه را ثبت نکرد.');
    closeLetterCompose();
    appAlert("✅ نامه با موفقیت ارسال شد.");
    await loadLetterInbox();await loadLetterUnreadCount();
  }catch(e){
    console.error('Send letter:',e);
    appAlert("❌ ارسال نامه انجام نشد:\n"+(e.message||'خطای نامشخص'));
  }finally{
    if(button){button.disabled=false;button.textContent="📨 ارسال نامه";}
  }
}

/* =========================================================
   CUSTOMER ORDER / NOTE
========================================================= */

function openCustomerRequest() {
  const modal = $("customerRequestModal");
  if (!modal) return;
  modal.classList.remove("hidden");
}

function closeCustomerRequest() {
  const modal = $("customerRequestModal");
  if (modal) modal.classList.add("hidden");
}

async function submitCustomerRequest() {
  const input = $("customerRequestText");
  const typeInput = $("customerRequestType");

  const text = input ? input.value.trim() : "";
  const type = typeInput?.value === "note" ? "note" : "order";

  if (!text) {
    alert("لطفاً متن سفارش یا یادداشت را بنویسید.");
    return;
  }

  try {
    await postJson("/api/customer/request", {
      type,
      text
    });

    if (input) {
      input.value = "";
    }

    closeCustomerRequest();
    if(type==="order") await loadOrderHistoryCount();

    // از tg.showPopup استفاده نمی‌کنیم؛ این متد در بعضی WebViewها
    // باعث خطای WebAppMethod Unsupported می‌شود.
    alert(
      type === "note"
        ? "✅ یادداشت شما با موفقیت ثبت شد."
        : "✅ سفارش شما با موفقیت ثبت شد."
    );

  } catch (error) {
    console.error("Customer request error:", error);

    alert(
      "❌ ثبت درخواست انجام نشد:\n" +
      (error?.message || "خطای نامشخص")
    );
  }
}

async function loadAdminRequests() {
  const container = $("adminRequests");
  if (!container) return;
  container.innerHTML = `<div class="message">در حال دریافت سفارش‌ها و یادداشت‌ها...</div>`;

  try {
    const result = await postJson("/api/admin/customer-requests", {});
    const requests = Array.isArray(result) ? result : (result?.requests || []);
    if (!requests.length) {
      container.innerHTML = `<div class="message">هنوز سفارش یا یادداشتی ثبت نشده است.</div>`;
      return;
    }

    const statusLabels = {new:"جدید",seen:"دیده شد",in_progress:"در حال بررسی",done:"انجام شد",cancelled:"لغو شد"};
    container.innerHTML = requests.map(r => {
      const c = r.customers || {};
      const name = [c.first_name,c.last_name].filter(Boolean).join(" ") || c.username || "مشتری";
      const username = c.username ? `@${escapeHtml(c.username)}` : "";
      const typeLabel = r.request_type === "note" ? "📝 یادداشت" : "🛒 سفارش";
      const date = r.created_at ? new Date(r.created_at).toLocaleString("fa-IR") : "";
      return `<div class="admin-request-card">
        <div class="admin-request-head"><strong>${typeLabel}</strong><span>${escapeHtml(date)}</span></div>
        <div class="admin-request-customer">👤 ${escapeHtml(name)} ${username ? `(${username})` : ""} <small>ID: ${escapeHtml(c.telegram_user_id || r.telegram_user_id || "-")}</small></div>
        <div class="admin-request-text">${escapeHtml(r.text || "")}</div>
        <div class="admin-request-actions">
          <select onchange="updateCustomerRequestStatus(${Number(r.id)}, this.value)">
            ${Object.entries(statusLabels).map(([key,label]) => `<option value="${key}" ${r.status===key?"selected":""}>${label}</option>`).join("")}
          </select>
          <button type="button" class="admin-danger" onclick="deleteCustomerRequest(${Number(r.id)})">🗑️ حذف</button>
        </div>
      </div>`;
    }).join("");
    await markAdminRequestsRead();
    await loadAdminInboxCount();
  } catch (error) {
    container.innerHTML = `<div class="message error">خطا در دریافت سفارش‌ها و یادداشت‌ها.<br>${escapeHtml(error.message || "")}</div>`;
  }
}

async function loadAdminInboxCount(){
  if(!isAdmin) return;
  try{
    const r=await postJson("/api/admin/unread-count",{});
    const n=Number(r?.count||0);
    setAdminCount("adminInboxCount",n);
    const badge=$("adminInboxCount");
    if(badge) badge.classList.toggle("has-unread",n>0);
  }catch{}
}
async function markAdminRequestsRead(){
  try{await postJson("/api/admin/mark-requests-read",{});}catch{}
}
let adminInboxTimer=null;
function startAdminInboxPolling(){
  if(adminInboxTimer) clearInterval(adminInboxTimer);
  if(!isAdmin) return;
  loadAdminInboxCount();
  adminInboxTimer=setInterval(loadAdminInboxCount,15000);
}
async function loadOrderHistoryCount(){
  const badge=$("ordersCount");
  if(!badge) return;
  if(!currentUser){badge.textContent="۰";badge.classList.add("empty");return;}
  try{
    const r=await postJson("/api/customer/orders",{});
    const orders=Array.isArray(r?.orders)?r.orders:[];
    badge.textContent=formatNumber(orders.length);
    badge.classList.toggle("empty",orders.length===0);
  }catch{badge.textContent="۰";badge.classList.add("empty");}
}
async function openOrderHistory(){
  if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری خود شوید.");return;}
  const modal=$("orderHistoryModal"),box=$("orderHistoryItems");
  if(!modal||!box)return;
  modal.classList.remove("hidden");
  box.innerHTML='<div class="message">در حال دریافت سفارش‌های قبلی...</div>';
  try{
    const r=await postJson("/api/customer/orders",{});
    const orders=Array.isArray(r?.orders)?r.orders:[];
    if(!orders.length){box.innerHTML='<div class="message">هنوز سفارشی ثبت نشده است.</div>';return;}
    box.innerHTML=orders.map(o=>{
      const date=o.created_at?new Date(o.created_at).toLocaleString("fa-IR"):"";
      return `<div class="order-history-card"><div class="order-history-head"><strong>🛒 سفارش #${escapeHtml(o.id)}</strong><span>${escapeHtml(date)}</span></div><div class="order-history-text">${escapeHtml(o.text||"")}</div></div>`;
    }).join("");
  }catch(e){box.innerHTML=`<div class="message error">دریافت سفارش‌ها انجام نشد.<br>${escapeHtml(e.message||"")}</div>`;}
}
function closeOrderHistory(){$("orderHistoryModal")?.classList.add("hidden");}

async function deleteCustomerRequest(id){
  if(!(await appConfirm("آیا این سفارش/یادداشت حذف شود؟"))) return;
  try{ const r=await postJson("/api/admin/delete-request",{id:Number(id)}); if(!r?.ok)throw new Error(r?.error||"سرور تأیید نکرد."); await loadAdminRequests(); appAlert("✅ مورد با موفقیت حذف شد."); }
  catch(e){ appAlert("❌ حذف انجام نشد:\n"+(e.message||"خطای نامشخص")); }
}

async function updateCustomerRequestStatus(id, status) {
  try {
    await postJson("/api/admin/update-request-status", {id:Number(id), status});
    await loadAdminRequests();
    await loadSiteSettings();
  } catch (error) {
    alert("❌ تغییر وضعیت انجام نشد:\n" + error.message);
  }
}

/* =========================================================
   EVENTS
========================================================= */

document.addEventListener("click", function(event){
  const link = event.target.closest(".catalog-open");
  if (!link) return;
  event.preventDefault();
  openCatalog(link.getAttribute("data-catalog-url") || "", link.getAttribute("data-catalog-name") || "محصول");
});

function setupEvents() {
    const loginButton=$("loginButton"); if(loginButton)loginButton.addEventListener("click",loginWithUsernamePassword);
    [$("loginUsername"),$("loginPassword")].forEach(el=>{if(el)el.addEventListener("keydown",e=>{if(e.key==="Enter")loginWithUsernamePassword();});});
    const logoutButton=$("logoutButton"); if(logoutButton)logoutButton.addEventListener("click",logoutUser);

    const search =
      $("searchInput");

    if (search) {
      search.addEventListener(
        "input",
        () => {
          renderProducts();
        }
      );
    }

    const adminButton =
      $("adminButton");

    if (adminButton) {
      adminButton.addEventListener(
        "click",
        openAdmin
      );
    }

    const customerButton = $("customerButton");
    if (customerButton) {
      customerButton.addEventListener("click", openCustomerRequest);
    }

    const customerSelect =
      $("customerSelect");

    if (customerSelect) {
      customerSelect.addEventListener(
        "change",
        () => {

          selectedCustomer =
            customerSelect.value || null;

          if (selectedCustomer) {
            loadCustomerPrices(
              selectedCustomer
            );
          } else {

            const info =
              $("customerInfo");

            const prices =
              $("customerPrices");

            if (info) {
              info.classList.add("hidden");
            }

            if (prices) {
              prices.innerHTML = "";
            }
          }
        }
      );
    }

    /* Telegram Back Button */
    if (tg && tg.BackButton) {
      try {
        tg.BackButton.onClick(() => {
          const appDialog = $("appDialog");
          const catalogModal = $("catalogModal");

          if (appDialog && !appDialog.classList.contains("hidden")) {
            appDialogCancel();
            return;
          }

          if (catalogModal && !catalogModal.classList.contains("hidden")) {
            closeCatalog();
            return;
          }

          const modal = $("modal");
          const adminModal = $("adminModal");

          if (modal && !modal.classList.contains("hidden")) {
            closeModal();
            return;
          }

          if (adminModal && !adminModal.classList.contains("hidden")) {
            closeAdmin();
            try {
              tg.BackButton.hide();
            } catch (e) {}
          }
        });
      } catch (e) {
        console.warn("Telegram BackButton is not supported:", e);
      }
    }

}

setupEvents();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(e => console.warn("PWA:", e));
  });
}

function finishBootLoader() {
  const app = document.querySelector(".app");
  const loader = document.getElementById("bootLoader");

  if (app) app.style.visibility = "visible";
  document.body.classList.remove("booting");

  if (loader) {
    loader.classList.add("hide");
    setTimeout(() => loader.remove(), 300);
  }
}

/* =========================================================
   INITIAL LOAD
========================================================= */

(async function init() {

  try {
    await authenticate();
  } catch (error) {
    console.error(
      "Authentication init:",
      error
    );
  }

  try {
    await loadCurrentUser();
    await loadWebSession();
    loadCart();
    startAdminInboxPolling();
  } catch (error) {
    console.error(
      "User init:",
      error
    );
  }

  try {
    await loadSiteSettings();
    await loadProducts();
  } finally {
    finishBootLoader();
  }

})();


/* =========================================================
   GLOBAL FUNCTIONS
   برای onclick های داخل HTML
========================================================= */

window.openProduct =
  openProduct;
window.openCart=openCart;
window.closeCart=closeCart;
window.openOrderHistory=openOrderHistory;
window.closeOrderHistory=closeOrderHistory;
window.openLetterInbox=openLetterInbox;window.closeLetterInbox=closeLetterInbox;window.openLetterCompose=openLetterCompose;window.closeLetterCompose=closeLetterCompose;window.loadLetterInbox=loadLetterInbox;window.openLetterThread=openLetterThread;window.sendLetterReply=sendLetterReply;window.sendNewLetter=sendNewLetter;window.resetLetterFilters=resetLetterFilters;window.showAllLetters=showAllLetters;window.toggleLetterRecipientPicker=toggleLetterRecipientPicker;window.selectLetterRecipient=selectLetterRecipient;window.filterLetterRecipients=filterLetterRecipients;
window.toggleCustomerPicker=toggleCustomerPicker;
window.selectCustomerPicker=selectCustomerPicker;
window.searchCustomerPriceCustomer=searchCustomerPriceCustomer;
window.addToCart=addToCart;
window.changeCartQty=changeCartQty;
window.removeFromCart=removeFromCart;
window.submitCartOrder=submitCartOrder;
window.setCustomerPrice=setCustomerPrice;
window.resetCustomerPrices=resetCustomerPrices;
window.formatCustomerPriceInput=formatCustomerPriceInput;
window.deleteCustomerRequest=deleteCustomerRequest;

window.closeModal =
  closeModal;
window.openCatalog = openCatalog;
window.closeCatalog = closeCatalog;
window.appDialogOk = appDialogOk;
window.appDialogCancel = appDialogCancel;


/* =========================================================
   ADMIN SECTION NAVIGATION
   فقط برای هماهنگی با منوی بخش‌بندی‌شده پنل مدیریت
========================================================= */

async function loadServiceLimits(){
  const panel=$("serviceLimitsPanel"); if(!panel)return;
  panel.innerHTML='<div class="limits-loading">در حال دریافت گزارش مصرف...</div>';
  try{
    const r=await postJson('/api/admin/service-limits',{});
    const services=Array.isArray(r?.services)?r.services:[];
    const routes=Array.isArray(r?.routes)?r.routes:[];
    const cards=services.map(x=>{
      const pct=Number.isFinite(Number(x.percentage))?Math.max(0,Math.min(100,Number(x.percentage))):0;
      const recorded=x.recorded===true;
      return `<div class="limit-service-card"><h4>${escapeHtml(x.icon||'◉')} ${escapeHtml(x.name||'سرویس')}</h4><div class="limit-metric"><span>امروز</span><b>${escapeHtml(x.today_display||'ثبت نشده')}</b></div><div class="limit-metric"><span>سقف روزانه</span><b>${escapeHtml(x.cap_display||'تعریف نشده')}</b></div>${recorded?`<div class="limit-progress"><span style="width:${pct}%"></span></div><div class="limit-metric"><span>درصد مصرف</span><b>${escapeHtml(String(pct))}%</b></div>`:''}<span class="limit-status ${recorded?'recorded':''}">${recorded?'✓ مصرف واقعی ثبت شده':'ℹ️ داده مصرف واقعی ثبت نشده'}</span>${x.note?`<p>${escapeHtml(x.note)}</p>`:''}</div>`;
    }).join('');
    const routeHtml=routes.length?`<div class="limit-service-card limit-routes"><h4>🔝 ۱۰ مسیر API پرترافیک</h4>${routes.slice(0,10).map((x,i)=>`<div class="limit-route-row"><span>${escapeHtml(faDigits(i+1))}. ${escapeHtml(x.route||'—')}</span><b>${escapeHtml(x.count_display||'ثبت نشده')}</b></div>`).join('')}</div>`:'';
    panel.innerHTML=cards+routeHtml||'<div class="limits-loading">گزارش مصرفی موجود نیست.</div>';
  }catch(e){panel.innerHTML=`<div class="message error">دریافت گزارش محدودیت‌ها انجام نشد.<br>${escapeHtml(e.message||'خطای نامشخص')}</div>`;}
}

function showAdminHome() {
  const home = $("adminHome");
  const sections = document.querySelectorAll("[id^='adminSection-']");

  sections.forEach(section => section.classList.add("hidden"));
  if (home) home.classList.remove("hidden");
}

async function showAdminSection(sectionName) {
  const permissionMap={products:"products","edit-products":"products",customers:"customers","edit-customers":"customers",prices:"prices",requests:"requests",footer:"footer",admins:"admins",archives:"products"};
  const needed=permissionMap[sectionName];
  if(needed && sectionName !== "requests" && !(adminPermissions.includes(needed) || adminPermissions.includes("admins") && needed==="admins")){
    appAlert("❌ سطح دسترسی این بخش برای شما فعال نیست.");
    return;
  }
  const home = $("adminHome");
  const sections = document.querySelectorAll("[id^='adminSection-']");

  if (home) home.classList.add("hidden");
  sections.forEach(section => section.classList.add("hidden"));

  const section = $("adminSection-" + sectionName);
  if (!section) return;
  section.classList.remove("hidden");

  try {
    if (sectionName === "products" || sectionName === "edit-products") {
      await loadAdminProducts();
    }

    if (sectionName === "customers" || sectionName === "edit-customers" || sectionName === "prices") {
      await loadCustomers();
    }

    if (sectionName === "requests") {
      await loadAdminRequests();
      await loadAdminInboxCount();
    }

    if (sectionName === "admins") {
      await loadAdminUsers();
    }

    if (sectionName === "footer") {
      await loadSiteSettings();
    }
    if (sectionName === "archives") {
      await loadImageArchives();
    }
    if (sectionName === "limits") {
      await loadServiceLimits();
    }
  } catch (error) {
    console.error("Admin section:", error);
  }
}

function searchAdminItems(inputId, containerId) {
  const input = $(inputId);
  const container = $(containerId);
  if (!input || !container) return;

  const query = input.value.trim().toLocaleLowerCase("fa-IR");
  container.querySelectorAll(":scope > div").forEach(item => {
    const text = (item.textContent || "").toLocaleLowerCase("fa-IR");
    item.style.display = !query || text.includes(query) ? "" : "none";
  });
}

// حذف نماینده با event delegation؛ مستقل از onclick های HTML و مقاوم در برابر رندر مجدد
document.addEventListener("click", function(event){
  const updateAdminButton = event.target.closest("[data-update-admin]");
  if (updateAdminButton) {
    event.preventDefault(); event.stopPropagation();
    const id=updateAdminButton.getAttribute("data-update-admin") || "";
    updateAdminButton.disabled=true;
    updateAdminButton.textContent="⏳ در حال ذخیره...";
    updateAdminUser(id).finally(()=>{if(updateAdminButton.isConnected){updateAdminButton.disabled=false;updateAdminButton.textContent="💾 ذخیره مدیر";}});
    return;
  }
  const deleteAdminButton = event.target.closest("[data-delete-admin]");
  if (deleteAdminButton) {
    event.preventDefault(); event.stopPropagation();
    deleteAdminUser(deleteAdminButton.getAttribute("data-delete-admin") || "");
    return;
  }
  const deleteButton = event.target.closest("[data-delete-customer]");
  if (deleteButton) {
    event.preventDefault(); event.stopPropagation();
    deleteCustomerUser(deleteButton.getAttribute("data-delete-customer") || "");
    return;
  }
  const saveButton = event.target.closest("[data-update-customer]");
  if (saveButton) {
    event.preventDefault(); event.stopPropagation();
    const id = saveButton.getAttribute("data-update-customer") || "";
    saveButton.disabled = true;
    saveButton.textContent = "⏳ در حال ذخیره...";
    updateCustomerUser(id).finally(() => {
      if (saveButton.isConnected) { saveButton.disabled=false; saveButton.textContent="💾 ذخیره"; }
    });
  }
}, true);

window.toggleAdminAccordion = toggleAdminAccordion;
window.showAdminSection = showAdminSection;
window.showAdminHome = showAdminHome;
window.searchAdminItems = searchAdminItems;
window.createAdminUser = createAdminUser;
window.deleteAdminUser = deleteAdminUser;
window.updateAdminUser = updateAdminUser;
window.loadAdminUsers = loadAdminUsers;

window.openAdmin =
  openAdmin;

window.closeAdmin =
  closeAdmin;

window.updateProductPrice = updateProductPrice;
window.uploadProductImage = uploadProductImage;
window.loadAdminProductGallery = loadAdminProductGallery;
window.uploadAdminProductGalleryImage = uploadAdminProductGalleryImage;
window.saveAdminProductGalleryCaption = saveAdminProductGalleryCaption;
window.replaceAdminProductGalleryImage = replaceAdminProductGalleryImage;
window.deleteAdminProductGalleryImage = deleteAdminProductGalleryImage;
window.loadImageArchives = loadImageArchives;
window.restoreArchivedImage = restoreArchivedImage;
window.removeProductImage = removeProductImage;
window.uploadProductCatalog = uploadProductCatalog;
window.removeProductCatalog = removeProductCatalog;

window.uploadProductVideo =
  uploadProductVideo;

window.removeProductVideo =
  removeProductVideo;

window.loadCustomerPrices =
  loadCustomerPrices;

window.setCustomerPrice =
  setCustomerPrice;
window.openCustomerRequest = openCustomerRequest;
window.closeCustomerRequest = closeCustomerRequest;
window.submitCustomerRequest = submitCustomerRequest;
window.updateCustomerRequestStatus = updateCustomerRequestStatus;
window.createProduct=createProduct;window.deleteProduct=deleteProduct;window.createCustomerUser=createCustomerUser;window.deleteCustomerUser=deleteCustomerUser;window.updateCustomerUser=updateCustomerUser;window.saveSiteSettings=saveSiteSettings;
