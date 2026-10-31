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
  const role=$("newAdminRole")?.value||"admin";

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
      first_name,last_name,telegram_user_id,username,password,permissions,role
    });
    if(!r?.ok) throw new Error(r?.error||"سرور مدیر را ایجاد نکرد.");

    ["newAdminFirstName","newAdminLastName","newAdminTelegramId","newAdminUsername","newAdminPassword"].forEach(id=>{
      const el=$(id);
      if(el) el.value="";
    });
    await loadAdminUsers();
    appAlert("✅ حساب با موفقیت اضافه شد.");
  }catch(e){
    console.error("Create admin:",e);
    appAlert("❌ افزودن حساب انجام نشد:\n"+(e.message||"خطای نامشخص"));
  }finally{
    if(button){button.disabled=false;button.textContent="🛡️ افزودن حساب";}
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
      const perms=Array.isArray(a.permissions)?a.permissions:[];
      if(main){
        const primaryBody=`<div class="admin-edit-grid admin-system-edit-grid">
          <label>نام<input id="afirst-${escapeHtml(key)}" value="${escapeHtml(a.first_name||"")}"></label>
          <label>نام خانوادگی<input id="alast-${escapeHtml(key)}" value="${escapeHtml(a.last_name||"")}"></label>
          <label>نوع حساب<select id="arole-${escapeHtml(key)}" disabled><option value="super_admin" selected>مدیر نرم‌افزار</option></select></label>
          <label>Telegram ID<input id="atele-${escapeHtml(key)}" value="${escapeHtml(a.telegram_user_id||"")}" inputmode="numeric"></label>
          <label>نام کاربری وب<input id="auser-${escapeHtml(key)}" value="${escapeHtml(a.username||"")}" autocomplete="off"></label>
          <label class="password-field">رمز عبور وب<div class="password-input-wrap"><input id="apass-${escapeHtml(key)}" type="text" value="${escapeHtml(a.password||"")}" placeholder="${a.password?"رمز فعلی":"برای تعریف رمز وب وارد کنید"}" autocomplete="off"><button type="button" class="password-eye" id="eye-apass-${escapeHtml(key)}" onclick="togglePasswordVisibility('apass-${escapeHtml(key)}','eye-apass-${escapeHtml(key)}'); return false;" aria-label="نمایش رمز عبور" title="نمایش رمز عبور">🙈</button></div></label>
        </div>
        <div class="admin-permission-box"><strong>سطح دسترسی</strong><div class="admin-permission-grid">${ADMIN_PERMISSION_KEYS.map(k=>`<label><input type="checkbox" id="aperm-${escapeHtml(key)}-${k}" checked disabled> ${({products:'محصولات',customers:'نماینده‌ها',prices:'قیمت‌های اختصاصی',requests:'سفارش‌ها و یادداشت‌ها',footer:'اطلاعات شرکت'})[k]}</label>`).join('')}</div></div>
        <div class="admin-system-actions">
          <button type="button" class="admin-save-customer-button" data-update-admin="${escapeHtml(key)}">💾 ذخیره مدیر / کارشناس</button>
        </div>`;
        return adminAccordion(`admin-system-primary-${key}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>🛡️ ${escapeHtml(name)}</strong><small>مدیر اصلی · قابل ویرایش</small>`, primaryBody, "admin-system-accordion admin-primary-accordion");
      }
      const body=`<div class="admin-edit-grid admin-system-edit-grid">
          <label>نام<input id="afirst-${escapeHtml(key)}" value="${escapeHtml(a.first_name||"")}"></label>
          <label>نام خانوادگی<input id="alast-${escapeHtml(key)}" value="${escapeHtml(a.last_name||"")}"></label>
          <label>نوع حساب<select id="arole-${escapeHtml(key)}"><option value="admin" ${String(a.role||"").toLowerCase() === "admin" ? "selected" : ""}>مدیر نرم‌افزار</option><option value="sales" ${String(a.role||"").toLowerCase() === "sales" ? "selected" : ""}>کارشناس فروش</option></select></label>
          <label>Telegram ID<input id="atele-${escapeHtml(key)}" value="${escapeHtml(a.telegram_user_id||"")}" inputmode="numeric"></label>
          <label>نام کاربری وب<input id="auser-${escapeHtml(key)}" value="${escapeHtml(a.username||"")}" autocomplete="off"></label>
          <label class="password-field">رمز عبور وب<div class="password-input-wrap"><input id="apass-${escapeHtml(key)}" type="text" value="${escapeHtml(a.password||"")}" placeholder="${a.password?"رمز فعلی":"برای تغییر/تعریف رمز وارد کنید"}" autocomplete="off"><button type="button" class="password-eye" id="eye-apass-${escapeHtml(key)}" onclick="togglePasswordVisibility('apass-${escapeHtml(key)}','eye-apass-${escapeHtml(key)}'); return false;" aria-label="نمایش رمز عبور" title="نمایش رمز عبور">🙈</button></div></label>
          <label>وضعیت<select id="astatus-${escapeHtml(key)}"><option value="active" ${a.status!=="disabled"?'selected':''}>فعال</option><option value="disabled" ${a.status==="disabled"?'selected':''}>غیرفعال</option></select></label>
        </div>
        <div class="admin-permission-box"><strong>سطح دسترسی حساب</strong><div class="admin-permission-grid">${ADMIN_PERMISSION_KEYS.map(k=>`<label><input type="checkbox" id="aperm-${escapeHtml(key)}-${k}" ${perms.includes(k)?'checked':''}> ${({products:'محصولات',customers:'نماینده‌ها',prices:'قیمت‌های اختصاصی',requests:'سفارش‌ها و یادداشت‌ها',footer:'اطلاعات شرکت'})[k]}</label>`).join('')}</div></div>
        <div class="admin-system-actions">
          <button type="button" class="admin-save-customer-button" data-update-admin="${escapeHtml(key)}">💾 ذخیره مدیر / کارشناس</button>
          <button type="button" class="admin-danger admin-delete-admin-button" data-delete-admin="${escapeHtml(key)}">🗑️ حذف مدیر / کارشناس</button>
        </div>`;
      return adminAccordion(`admin-system-edit-${key}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>🛡️ ${escapeHtml(name)}</strong><small>${a.username ? escapeHtml(a.username) : (a.telegram_user_id ? `Telegram: ${escapeHtml(a.telegram_user_id)}` : (String(a.role||"").toLowerCase()==="sales" ? "کارشناس فروش" : "مدیر نرم‌افزار"))}</small>`, body, "admin-system-accordion");
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
    role:$("arole-"+key)?.value||"admin",
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
  }catch(e){appAlert("❌ ویرایش حساب انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}

async function deleteAdminUser(id){
  if(!id)return;
  if(!(await appConfirm("آیا این مدیر نرم‌افزار حذف شود؟")))return;
  try{
    const row=document.querySelector(`[data-delete-admin="${CSS.escape(String(id))}"]`)?.closest('.admin-system-edit-row');
    const tgId=row?.querySelector('input[id^="atele-"]')?.value.trim()||"";
    await postJson("/api/admin/delete-admin",{id,telegram_user_id:tgId});
    await loadAdminUsers();
    appAlert("✅ حساب حذف شد.");
  }catch(e){appAlert("❌ حذف حساب انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}

/* =========================================================
   LETTER INBOX / MAILBOX
========================================================= */

let letterThreads = [];
let letterCurrentThread = null;
let letterPollingTimer = null;
let letterLocalReadIds = new Set();
let letterHoldTimer = null;
let letterHoldTriggered = false;
function loadLetterLocalReadIds(){
  try{
    const key=`moshkfam_letter_reads_${String(currentUser?.id||currentUser?.customer_id||currentUser?.telegram_user_id||'')}`;
    const raw=localStorage.getItem(key);
    letterLocalReadIds=new Set(Array.isArray(JSON.parse(raw||'[]'))?JSON.parse(raw||'[]').map(Number).filter(Number.isFinite):[]);
  }catch{letterLocalReadIds=new Set();}
}
function saveLetterLocalReadIds(){
  try{
    const key=`moshkfam_letter_reads_${String(currentUser?.id||currentUser?.customer_id||currentUser?.telegram_user_id||'')}`;
    localStorage.setItem(key,JSON.stringify([...letterLocalReadIds].slice(-500)));
  }catch{}
}
loadLetterLocalReadIds();

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
function formatJalaliDateInput(el){
  if(!el)return;
  const raw=enDigits(String(el.value||''));
  const before=String(el.value||'').slice(0,Math.max(0,el.selectionStart||0));
  const beforeDigits=(before.match(/[0-9۰-۹]/g)||[]).length;
  const digits=raw.replace(/\D/g,'').slice(0,8);
  let out='';
  if(digits.length>0)out=digits.slice(0,4);
  if(digits.length>4)out+='/'+digits.slice(4,6);
  if(digits.length>6)out+='/'+digits.slice(6,8);
  const digitCount=Math.min(beforeDigits,digits.length);
  let pos=digitCount;
  if(digitCount>4)pos+=1;
  if(digitCount>6)pos+=1;
  el.value=faDigits(out);
  try{el.setSelectionRange(pos,pos);}catch{}
}
function bindJalaliDateInputs(){['letterDateFrom','letterDateTo'].forEach(id=>{const el=$(id);if(!el||el.dataset.jalaliBound)return;el.dataset.jalaliBound='1';el.maxLength=10;el.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End','Tab','Backspace','Delete'].includes(e.key)||e.ctrlKey||e.metaKey)return;if(!/[0-9۰-۹]/.test(e.key))e.preventDefault();});el.addEventListener('input',()=>{formatJalaliDateInput(el);updateLetterDateSubtext(el);});el.addEventListener('blur',()=>{formatJalaliDateInput(el);const value=normalizeJalaliInput(el.value);const complete=/^\d{4}\/\d{2}\/\d{2}$/.test(value);const iso=complete?jalaliInputToGregorian(el.value):null;if(el.value.trim()&&!iso){el.value='';updateLetterDateSubtext(el);appAlert('تاریخ شمسی را به صورت سال ۴ رقمی / ماه ۲ رقمی / روز ۲ رقمی وارد کنید.');}});});}
function bindLetterLiveFilters(){ const ids=['letterReadFilter','letterSenderFilter']; ids.forEach(id=>{const el=$(id);if(!el||el.dataset.liveBound)return;el.dataset.liveBound='1';el.addEventListener('change',()=>loadLetterInbox());}); ['letterDateFrom','letterDateTo'].forEach(id=>{const el=$(id);if(!el||el.dataset.liveChangeBound)return;el.dataset.liveChangeBound='1';el.addEventListener('change',()=>loadLetterInbox());}); }
function updateLetterTodayHeader(){
  const now=new Date(),j=gregorianToJalali(now), weekdays=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
  const name=(currentUser?.first_name||currentUser?.username||currentUser?.name||'کاربر')+(currentUser?.last_name?` ${currentUser.last_name}`:'');
  if($('letterTodayJalali'))$('letterTodayJalali').textContent=`امروز ${faDigits(j.jy)}/${faDigits(String(j.jm).padStart(2,'0'))}/${faDigits(String(j.jd).padStart(2,'0'))}`;
  if($('letterTodayWeekday'))$('letterTodayWeekday').textContent=`روز ${weekdays[now.getDay()]}`;
  if($('letterTodayGregorian'))$('letterTodayGregorian').textContent=`معادل میلادی: ${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
  if($('letterAccountSenderButton'))$('letterAccountSenderButton').textContent=`فرستنده این حساب: ${name}`;
}
function openLetterInbox(){
  if(!currentUser)return;
  loadLetterLocalReadIds();
  const modal=$('letterInboxModal'); if(!modal)return;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  bindJalaliDateInputs(); bindLetterLiveFilters(); updateLetterTodayHeader();
  // هنگام باز شدن صندوق، همه نامه‌ها به‌صورت پیش‌فرض نمایش داده شوند؛
  // فیلتر «امروز» فقط با دکمه «امروز» فعال می‌شود.
  if($('letterDateFrom'))$('letterDateFrom').value='';
  if($('letterDateTo'))$('letterDateTo').value='';
  if($('letterReadFilter'))$('letterReadFilter').value='all';
  if($('letterSenderFilter'))$('letterSenderFilter').value='';
  updateLetterDateSubtext($('letterDateFrom'));updateLetterDateSubtext($('letterDateTo'));loadLetterInbox();
}
function closeLetterInbox(){const m=$('letterInboxModal');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}}

function canUseAdminLetters(){
  // فقط مدیر نرم‌افزار و کارشناس فروش می‌توانند گیرنده نماینده انتخاب کنند.
  // نماینده/مشتری همیشه نامه را مستقیم برای کارشناس فروش می‌فرستد.
  const role=String(currentUser?.role||"").toLowerCase();
  return !!currentUser && (isAdmin || role==="admin" || role==="super_admin" || role==="sales");
}

async function loadLetterRecipients(){
  const wrap=$('letterRecipientWrap');
  const sel=$('letterRecipientSelect');
  if(!wrap||!sel)return;
  if(!canUseAdminLetters()){wrap.classList.add('hidden');return;}
  wrap.classList.remove('hidden');
  sel.disabled=true;
  sel.innerHTML='<option value="">در حال دریافت فهرست نماینده‌ها...</option>';
  try{
    const r=await postJson('/api/admin/letter-recipients',{});
    const customers=Array.isArray(r)?r:(Array.isArray(r?.customers)?r.customers:(Array.isArray(r?.data?.customers)?r.data.customers:[]));
    const reps=customers.filter(c=>{
      const role=String(c?.role||'customer').toLowerCase();
      return role==='customer'||role==='representative'||role==='rep';
    });
    sel.innerHTML='<option value="">انتخاب نماینده...</option>';
    sel.value='';
    sel.removeAttribute('data-recipient-id');
    sel.removeAttribute('data-selected-customer-id');
    if(!reps.length){
      sel.innerHTML='<option value="">نماینده‌ای برای انتخاب وجود ندارد</option>';
      const optionBox=$('letterRecipientOptions');
      if(optionBox)optionBox.innerHTML='<div class="letter-recipient-empty">نماینده فعالی برای انتخاب وجود ندارد.</div>';
      sel.disabled=false;
      return;
    }
    const optionBox=$('letterRecipientOptions');
    if(optionBox) optionBox.innerHTML='';
    reps.forEach((c,index)=>{
      const id=String(c.id ?? c.customer_id ?? '').trim();
      if(!id)return;
      const name=[c.first_name,c.last_name].filter(Boolean).join(' ')||c.name||c.username||'نماینده';
      const user=c.username?`@${String(c.username).replace(/^@/,'')}`:'بدون نام کاربری';
      const opt=document.createElement('option');
      opt.value=id; opt.dataset.customerId=id; opt.dataset.name=name; opt.dataset.user=user; opt.textContent=`${name} — ${user}`;
      sel.appendChild(opt);
      if(optionBox){
        const btn=document.createElement('button');
        btn.type='button'; btn.className='letter-recipient-option'; btn.dataset.id=id;
        btn.dataset.search=`${name} ${user}`.toLocaleLowerCase('fa-IR');
        btn.innerHTML=`<span class="recipient-option-avatar">👤</span><span class="recipient-option-text"><span class="recipient-option-name">${escapeHtml(name)}</span><span class="recipient-option-user">${escapeHtml(user)}</span></span><span class="recipient-option-number">${formatNumber(index+1)}</span>`;
        btn.onclick=()=>selectLetterRecipient(id);
        optionBox.appendChild(btn);
      }
    });
    sel.disabled=false;
    sel.style.pointerEvents='auto';
    const syncRecipientSelection=()=>{
      const selected=sel.options[sel.selectedIndex];
      const value=String(selected?.value || selected?.dataset?.customerId || '').trim();
      sel.dataset.recipientId=value;
      sel.dataset.selectedCustomerId=value;
    };
    sel.onchange=syncRecipientSelection;
    sel.oninput=syncRecipientSelection;
    sel.addEventListener('change',syncRecipientSelection,{once:false});
    sel.dataset.recipientId='';
    sel.dataset.selectedCustomerId='';
  }catch(e){
    console.error('Letter recipients:',e);
    sel.innerHTML=`<option value="">خطا در دریافت فهرست نماینده‌ها</option>`;
    sel.disabled=false;
    sel.title=e.message||'خطا در دریافت فهرست نماینده‌ها';
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
  const trigger=$('letterRecipientTrigger');
  if(trigger)trigger.setAttribute('aria-expanded',opening?'true':'false');
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
  const trigger=$('letterRecipientTrigger');
  const nameEl=picker?.querySelector('.recipient-trigger-name');
  const userEl=picker?.querySelector('.recipient-trigger-user');
  if(nameEl)nameEl.textContent=opt?.dataset?.name||'انتخاب نماینده';
  if(userEl)userEl.textContent=opt?.dataset?.user||'فهرست نمایندگان';
  if(trigger)trigger.setAttribute('aria-expanded','false');
  picker?.querySelectorAll('.letter-recipient-option').forEach(btn=>btn.classList.toggle('active',btn.dataset.id===sel.value));
}

function openLetterCompose(){
  if(!currentUser)return appAlert('⚠️ ابتدا وارد حساب کاربری خود شوید.');
  const modal=$('letterComposeModal'); if(!modal)return;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  const subject=$('letterComposeSubject'), body=$('letterComposeBody');
  if(subject)subject.value=''; if(body)body.value='';
  const role=String(currentUser?.role||'').toLowerCase();
  const adminMode=canUseAdminLetters();
  if(adminMode){
    $('letterComposeHelp')?.replaceChildren(document.createTextNode('نامه را برای نماینده موردنظر ارسال کنید.'));
    $('letterRecipientWrap')?.classList.remove('hidden');
    loadLetterRecipients();
  }else{
    // نماینده گیرنده را انتخاب نمی‌کند؛ پیام مستقیم برای کارشناس فروش ارسال می‌شود.
    $('letterComposeHelp')?.replaceChildren(document.createTextNode('پیام شما مستقیماً برای کارشناس فروش ارسال می‌شود.'));
    $('letterRecipientWrap')?.classList.add('hidden');
    if($('letterRecipientSelect')){ $('letterRecipientSelect').value=''; $('letterRecipientSelect').removeAttribute('data-recipient-id'); }
  }
  setTimeout(()=>subject?.focus(),80);
}
function closeLetterCompose(){const m=$('letterComposeModal');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}}
function resetLetterFilters(){const t=localDateInputValue();setJalaliInput('letterDateFrom',t);setJalaliInput('letterDateTo',t);$('letterReadFilter').value='all';if($('letterSenderFilter'))$('letterSenderFilter').value='';updateLetterDateSubtext($('letterDateFrom'));updateLetterDateSubtext($('letterDateTo'));loadLetterInbox();}
function showAllLetters(){$('letterDateFrom').value='';$('letterDateTo').value='';$('letterReadFilter').value='all';if($('letterSenderFilter'))$('letterSenderFilter').value='';updateLetterDateSubtext($('letterDateFrom'));updateLetterDateSubtext($('letterDateTo'));loadLetterInbox();}

async function loadLetterUnreadCount(){
  if(!currentUser)return;
  try{
    const endpoint=canUseAdminLetters()?"/api/admin/letters-unread-count":"/api/customer/letters-unread-count";
    const r=await postJson(endpoint,{});
    const unreadIds=Array.isArray(r?.unread_ids)?r.unread_ids.map(Number).filter(Number.isFinite):[];
    const serverSet=new Set(unreadIds);
    // IDs that are no longer unread on the server can be forgotten locally.
    letterLocalReadIds=new Set([...letterLocalReadIds].filter(id=>serverSet.has(id)));
    const n=unreadIds.length ? unreadIds.filter(id=>!letterLocalReadIds.has(id)).length : Number(r?.count||0);
    setAdminCount("letterInboxCount",n);
    const b=$("letterInboxCount");if(b)b.classList.toggle("has-unread",n>0);
    saveLetterLocalReadIds();
  }catch(e){console.warn("Letter unread count",e);}
}
// V1.0.58: هر ۶۰ ثانیه (قبلاً ۱۰ ثانیه) و فقط وقتی صفحه دیده می‌شود؛ با برگشتن به صفحه بلافاصله به‌روز می‌شود.
const BADGE_POLL_MS=60000;
function startLetterPolling(){if(letterPollingTimer)clearInterval(letterPollingTimer);if(!currentUser)return;loadLetterUnreadCount();letterPollingTimer=setInterval(()=>{if(!document.hidden)loadLetterUnreadCount();},BADGE_POLL_MS);if(!window.__moshkfamLetterVisibilityBound){window.__moshkfamLetterVisibilityBound=true;document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentUser)loadLetterUnreadCount();});window.addEventListener('focus',()=>{if(currentUser)loadLetterUnreadCount();});}}

async function loadLetterInbox(){
  const list=$("letterList"), thread=$("letterThread"); if(!list||!thread)return;
  list.innerHTML='<div class="message">در حال دریافت نامه‌ها...</div>';
  try{
    const selectedStatus=$("letterReadFilter")?.value||"all"; const payload={from:jalaliInputToGregorian($("letterDateFrom")?.value)||"",to:jalaliInputToGregorian($("letterDateTo")?.value)||"",read_filter:(selectedStatus==='incoming'||selectedStatus==='outgoing')?'all':selectedStatus,sender_id:$("letterSenderFilter")?.value||"",direction_filter:(selectedStatus==='incoming'||selectedStatus==='outgoing')?selectedStatus:'all'};
    const endpoint=canUseAdminLetters()?"/api/admin/letters":"/api/customer/letters";
    const r=await postJson(endpoint,payload); letterThreads=Array.isArray(r?.messages)?r.messages:[];
    letterThreads.sort((a,b)=>new Date(b?.created_at||0)-new Date(a?.created_at||0));
    if(selectedStatus==='incoming'||selectedStatus==='outgoing'){ letterThreads=letterThreads.filter(m=>{ const sid=String(m?.sender_customer_id??m?.sender_user_id??m?.sender_telegram_user_id??''); const myIds=[currentUser?.id,currentUser?.customer_id,currentUser?.telegram_user_id].filter(v=>v!=null).map(String); const adminSender=!!(m?.sender_is_admin||m?.sender_role==='admin'||m?.sender_role==='super_admin'); const outgoing=myIds.includes(sid) || (canUseAdminLetters() && adminSender); return selectedStatus==='outgoing'?outgoing:!outgoing; }); }
    renderLetterSenderFilter(letterThreads);
    if(!letterThreads.length){list.innerHTML='<div class="message">نامه‌ای با این فیلتر پیدا نشد.</div>';return;}
    list.innerHTML=letterThreads.map((m,i)=>{
      const unread=!m.read && !letterLocalReadIds.has(Number(m.id));
      const subjectText=String(m.subject||'');
      const typeClass=subjectText.includes('🛒')?'type-cart':subjectText.includes('📝')?'type-note':subjectText.includes('📦')?'type-order':subjectText.includes('↩️')?'type-reply':'type-letter';
      const displayTitle=subjectText.includes('🛒')?'سفارش سبد خرید':'نامه';
      const sender=m.sender_name||m.sender_username||"کاربر";
      return `<div class="letter-item ${unread?'unread':''} ${typeClass}" data-letter-index="${i}" onclick="if(!this.dataset.skipClick)openLetterThread(${i})" onpointerdown="startLetterHold(${i},this)" onpointerup="cancelLetterHold(this)" onpointercancel="cancelLetterHold(this)" onpointerleave="cancelLetterHold(this)" oncontextmenu="return false;"><div class="letter-item-head"><span>${unread?'● جدید':'✓ خوانده شده'}</span><span>${escapeHtml(formatLetterDate(m.created_at))}</span></div><div class="letter-item-subject">${displayTitle}</div><div class="letter-item-preview">${escapeHtml(m.body||'')}</div><div class="letter-item-head"><span>👤 ${escapeHtml(sender)}</span><span>${m.reply_count?`↩️ ${formatNumber(m.reply_count)}`:''}</span></div></div>`;
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
function cancelLetterHold(el){
  if(letterHoldTimer){clearTimeout(letterHoldTimer);letterHoldTimer=null;}
  if(letterHoldTriggered){
    letterHoldTriggered=false;
    if(el){el.dataset.skipClick='1';setTimeout(()=>{try{delete el.dataset.skipClick;}catch{}},80);}
  }
}
function startLetterHold(index,el){
  if(letterHoldTimer)clearTimeout(letterHoldTimer);
  letterHoldTriggered=false;
  letterHoldTimer=setTimeout(async()=>{
    letterHoldTimer=null;
    letterHoldTriggered=true;
    const m=letterThreads[index];
    if(!m)return;
    if(m.read && !letterLocalReadIds.has(Number(m.id)))return;
    const ok=await appConfirm('این نامه به عنوان «خوانده شده» علامت‌گذاری شود؟');
    if(!ok)return;
    try{
      const threadId=m.thread_id||m.id;
      const r=await postJson(canUseAdminLetters()?"/api/admin/letter-mark-read":"/api/customer/letter-mark-read",{thread_id:threadId});
      m.read=true;
      if(Number.isFinite(Number(m.id)))letterLocalReadIds.add(Number(m.id));
      saveLetterLocalReadIds();
      if(el){
        el.classList.remove('unread');
        const first=el.querySelector('.letter-item-head:first-child span:first-child');
        if(first)first.textContent='✓ خوانده شده';
      }
      await loadLetterUnreadCount();
    }catch(e){
      console.warn('Letter hold mark-read:',e);
      appAlert('❌ خوانده‌شدن نامه ثبت نشد:\n'+(e.message||''));
    }
  },700);
}

async function openLetterThread(index){
  const m=letterThreads[index];if(!m)return;
  const threadId=m.thread_id||m.id;
  if(threadId==null||threadId===""){
    renderLetterThreadFallback(m,"شناسه نامه برای باز کردن گفتگو موجود نیست.");
    return;
  }
  letterCurrentThread=String(threadId);
  const thread=$("letterThread");if(!thread)return;thread.innerHTML='<div class="message">در حال دریافت گفتگو...</div>';
  try{
    const endpoint=canUseAdminLetters()?"/api/admin/letter-thread":"/api/customer/letter-thread";
    const request=postJson(endpoint,{thread_id:threadId});
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('زمان دریافت گفتگو بیش از حد طولانی شد.')),8000));
    const r=await Promise.race([request,timeout]);
    const messages=Array.isArray(r?.messages)?r.messages:[];
    // Every incoming message in the opened thread is considered read immediately.
    messages.forEach(x=>{
      const incoming=canUseAdminLetters() ? String(x?.recipient_role||'').toLowerCase()==='admins' : String(x?.recipient_customer_id||'')===String(currentUser?.id||'');
      if(incoming && Number.isFinite(Number(x?.id))) letterLocalReadIds.add(Number(x.id));
    });
    saveLetterLocalReadIds();
    if(!messages.length){
      renderLetterThreadFallback(m,"برای این نامه گفتگوی جداگانه‌ای پیدا نشد.");
      return;
    }
    renderLetterThreadMessages(m,messages,thread);
    try{
      const mr=await postJson(canUseAdminLetters()?"/api/admin/letter-mark-read":"/api/customer/letter-mark-read",{thread_id:threadId});
      m.read=true;
      if(Number.isFinite(Number(m.id))) letterLocalReadIds.add(Number(m.id));
      saveLetterLocalReadIds();
      renderLetterListAfterRead(index);
      await loadLetterUnreadCount();
      if(Number(mr?.marked||0)>0){
        const badge=$("letterInboxCount");
        if(badge && Number(enDigits(badge.textContent||0))===0) badge.classList.remove("has-unread");
      }
    }catch(markErr){console.warn('Letter mark-read:',markErr);}
  }catch(e){
    console.warn('Letter thread:',e);
    renderLetterThreadFallback(m,e?.message||'دریافت گفتگوی نامه انجام نشد.');
  }
}
function renderLetterThreadMessages(m,messages,thread){
  const subject=m.subject||messages[0]?.subject||"بدون عنوان";
  const inboxCard=document.querySelector('#letterInboxModal .letter-inbox-modal-card');
  inboxCard?.classList.add('thread-open');
  thread.innerHTML=`<div class="thread-head"><button type="button" class="letter-thread-back" onclick="showLetterList()">← بازگشت به نامه‌ها</button><div><h3>✉️ ${escapeHtml(subject)}</h3><small>گفتگوی کامل نامه و پاسخ‌ها</small></div></div><div class="thread-messages">${messages.map((x,idx)=>{const mine=String(x.sender_customer_id||'')===String(currentUser?.id||'');const subjectValue=String(x.subject||subject||'');const kind=idx>0?'type-reply':subjectValue.includes('🛒')?'type-cart':subjectValue.includes('📝')?'type-note':subjectValue.includes('📦')?'type-order':'type-letter';return `<div class="thread-message ${mine?'mine':''} ${kind}"><div class="tm-head"><strong>${escapeHtml(x.sender_name||x.sender_username||'کاربر')}</strong><span>${escapeHtml(formatLetterDate(x.created_at))}</span></div><div class="tm-body">${escapeHtml(x.body||'')}</div></div>`}).join('')}</div><div class="thread-reply"><textarea id="letterReplyBody" class="letter-textarea" rows="4" placeholder="پاسخ خود را بنویسید..."></textarea><button class="admin-primary" type="button" onclick="sendLetterReply(${Number(m.thread_id||m.id)})">📨 ارسال پاسخ</button></div>`;
}
function renderLetterThreadFallback(m,reason){
  const thread=$("letterThread");if(!thread)return;
  const inboxCard=document.querySelector('#letterInboxModal .letter-inbox-modal-card');
  inboxCard?.classList.add('thread-open');
  const subject=m.subject||'نامه';
  const sender=m.sender_name||m.sender_username||'کاربر';
  thread.innerHTML=`<div class="thread-head"><button type="button" class="letter-thread-back" onclick="showLetterList()">← بازگشت به نامه‌ها</button><div><h3>✉️ ${escapeHtml(subject)}</h3><small>${escapeHtml(reason||'نمایش مستقیم نامه')}</small></div></div><div class="thread-messages"><div class="thread-message type-letter"><div class="tm-head"><strong>${escapeHtml(sender)}</strong><span>${escapeHtml(formatLetterDate(m.created_at))}</span></div><div class="tm-body">${escapeHtml(m.body||'')}</div></div></div>`;
}
function showLetterList(){
  const card=document.querySelector('#letterInboxModal .letter-inbox-modal-card');
  card?.classList.remove('thread-open');
  letterCurrentThread=null;
}
function renderLetterListAfterRead(index){
  const el=document.querySelector(`.letter-item[data-letter-index="${Number(index)}"]`);
  if(!el)return;
  el.classList.remove('unread');
  const first=el.querySelector('.letter-item-head:first-child span:first-child');
  if(first)first.textContent='✓ خوانده شده';
}
async function sendLetterReply(threadId){const body=$("letterReplyBody")?.value.trim();if(!body)return appAlert("لطفاً متن پاسخ را بنویسید.");try{await postJson(canUseAdminLetters()?"/api/admin/letter-reply":"/api/customer/letter-reply",{thread_id:Number(threadId),body});appAlert("✅ پاسخ با موفقیت ارسال شد.");await loadLetterInbox();}catch(e){appAlert("❌ ارسال پاسخ انجام نشد:\n"+(e.message||''));}}
async function sendNewLetter(){
  const subjectEl=$("letterComposeSubject"), bodyEl=$("letterComposeBody"), recipientEl=$("letterRecipientSelect");
  const subject=String(subjectEl?.value||"").trim();
  const body=String(bodyEl?.value||"").trim();
  const selectedOption=recipientEl?.options?.[recipientEl.selectedIndex];
  const recipientId=String(
    recipientEl?.value ||
    selectedOption?.dataset?.customerId ||
    selectedOption?.value ||
    recipientEl?.dataset?.recipientId ||
    recipientEl?.dataset?.selectedCustomerId ||
    ""
  ).trim();
  if(!subject){subjectEl?.focus();return appAlert("⚠️ عنوان نامه را وارد کنید.");}
  if(!body){bodyEl?.focus();return appAlert("⚠️ متن نامه را وارد کنید.");}
  const role=String(currentUser?.role||'').toLowerCase();
  const adminMode=canUseAdminLetters();
  if(adminMode && !recipientId){recipientEl?.focus();return appAlert("⚠️ ابتدا یک نماینده را از فهرست گیرنده‌ها انتخاب کنید.");}
  if(adminMode && recipientEl && selectedOption && selectedOption.value!==recipientId) recipientEl.value=recipientId;
  const button=document.querySelector('#letterComposeModal .admin-primary');
  if(button){button.disabled=true;button.textContent="⏳ در حال ارسال...";}
  try{
    const payload=adminMode
      ? {recipient_customer_id:recipientId,subject:subject,body:body}
      : {subject:subject,body:body};
    const result=await postJson(adminMode?'/api/admin/letter':'/api/customer/letter',payload);
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

