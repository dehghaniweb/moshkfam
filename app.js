const WORKER_URL="https://moshkfam-telegram-bot.dehghaniweb.workers.dev";
const GITHUB_IMAGES="https://dehghaniweb.github.io/moshkfam/images/";

const tg=window.Telegram&&window.Telegram.WebApp?window.Telegram.WebApp:null;

if(tg){
  try{
    tg.ready();
    tg.expand();
  }catch(e){}
}

let products=[];
let categories=[];
let activeCategory="";
let currentUser=null;
let isAdmin=false;
let selectedCustomer=null;

const searchInput=document.getElementById("searchInput");
const productGrid=document.getElementById("productGrid");
const productCount=document.getElementById("productCount");
const loading=document.getElementById("loading");
const errorBox=document.getElementById("error");
const empty=document.getElementById("empty");
const categoriesBox=document.getElementById("categories");

function escapeHtml(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

async function post(path,data={}){
  const response=await fetch(WORKER_URL+path,{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify(data)
  });

  const text=await response.text();

  let result;

  try{
    result=text?JSON.parse(text):{};
  }catch(e){
    throw new Error("Invalid JSON: "+text.slice(0,300));
  }

  if(!response.ok){
    throw new Error(result.error||result.message||"خطای سرور");
  }

  return result;
}

function getProductName(p){
  return p.name_fa||p.name_en||"بدون نام";
}

function getImage(p){
  const id=Number(p.id);

  if(id>=1&&id<=20){
    return GITHUB_IMAGES+"product-"+String(id).padStart(2,"0")+".jpg";
  }

  return GITHUB_IMAGES+"logo.png";
}

function getCatalog(p){
  const id=Number(p.id);

  if(id>=1&&id<=20){
    return GITHUB_IMAGES+"catalog-"+String(id).padStart(2,"0")+".jpg";
  }

  return "";
}

function formatPrice(value,currency="تومان"){
  if(value===null||value===undefined||value==="") return "";

  const number=Number(value);

  if(!Number.isFinite(number)) return "";

  return number.toLocaleString("fa-IR")+" "+(currency||"تومان");
}

function getPublicPrice(p){
  if(p.base_price===null||p.base_price===undefined||p.base_price===""){
    return "";
  }

  return formatPrice(p.base_price,p.base_currency);
}

function getPrivatePrice(p){
  if(!p.customer_price){
    return "";
  }

  return formatPrice(
    p.customer_price,
    p.customer_currency||p.base_currency||"تومان"
  );
}

function getPriceText(p){
  const privatePrice=getPrivatePrice(p);

  if(privatePrice){
    return `<span class="private-price">قیمت اختصاصی: ${privatePrice}</span>`;
  }

  const publicPrice=getPublicPrice(p);

  if(publicPrice){
    return `<span class="price">${publicPrice}</span>`;
  }

  return "";
}

function getTelegramUser(){
  if(!tg||!tg.initDataUnsafe||!tg.initDataUnsafe.user){
    return null;
  }

  return tg.initDataUnsafe.user;
}

async function authenticate(){
  const user=getTelegramUser();

  if(!user){
    return;
  }

  try{
    const result=await post("/api/auth",{
      initData:tg.initData||"",
      user_id:user.id,
      telegram_id:user.id,
      username:user.username||"",
      first_name:user.first_name||"",
      last_name:user.last_name||"",
      language_code:user.language_code||""
    });

    currentUser=result.user||result.customer||result;

    isAdmin=Boolean(
      result.is_admin||
      result.admin||
      currentUser.is_admin
    );

    showAccount();

    if(isAdmin){
      const adminButton=document.getElementById("adminButton");

      if(adminButton){
        adminButton.classList.remove("hidden");
      }
    }
  }catch(e){
    console.error("Authentication error:",e);

    currentUser={
      telegram_id:user.id,
      user_id:user.id,
      username:user.username||"",
      first_name:user.first_name||"",
      last_name:user.last_name||""
    };

    showAccount();
  }
}

function showAccount(){
  const account=document.getElementById("account");
  const accountName=document.getElementById("accountName");
  const accountUser=document.getElementById("accountUser");
  const accountInfo=document.getElementById("accountInfo");

  if(!account||!currentUser) return;

  const first=currentUser.first_name||"";
  const last=currentUser.last_name||"";
  const fullName=(first+" "+last).trim();

  accountName.textContent=fullName||currentUser.username||"کاربر";

  accountUser.textContent=currentUser.username
    ? "@"+currentUser.username
    : "";

  const telegramId=
    currentUser.telegram_id||
    currentUser.user_id||
    currentUser.id||
    "";

  accountInfo.innerHTML=
    `شناسه تلگرام: <strong>${escapeHtml(telegramId)}</strong>`;

  account.classList.remove("hidden");
}

async function loadProducts(){
  loading.classList.remove("hidden");
  errorBox.classList.add("hidden");
  empty.classList.add("hidden");

  try{
    const result=await post("/api/products",{
      telegram_id:
        currentUser?.telegram_id||
        currentUser?.user_id||
        getTelegramUser()?.id||
        null
    });

    products=
      Array.isArray(result.products)
        ? result.products
        : Array.isArray(result)
          ? result
          : [];

    renderCategories();
    renderProducts();

  }catch(e){
    console.error(e);

    errorBox.textContent="خطا در دریافت محصولات: "+e.message;
    errorBox.classList.remove("hidden");

  }finally{
    loading.classList.add("hidden");
  }
}

function renderCategories(){
  const set=new Set();

  products.forEach(p=>{
    if(p.category){
      set.add(p.category);
    }
  });

  categories=[...set].sort((a,b)=>a.localeCompare(b,"fa"));

  categoriesBox.innerHTML="";

  const allButton=document.createElement("button");

  allButton.textContent="همه";
  allButton.className=activeCategory===""?"active":"";

  allButton.onclick=()=>{
    activeCategory="";
    renderCategories();
    renderProducts();
  };

  categoriesBox.appendChild(allButton);

  categories.forEach(category=>{
    const button=document.createElement("button");

    button.textContent=category;
    button.className=
      activeCategory===category
        ?"active"
        :"";

    button.onclick=()=>{
      activeCategory=category;
      renderCategories();
      renderProducts();
    };

    categoriesBox.appendChild(button);
  });
}

function renderProducts(){
  const q=(searchInput?.value||"").trim().toLowerCase();

  const filtered=products.filter(p=>{
    const name=getProductName(p).toLowerCase();
    const category=(p.category||"").toLowerCase();
    const intro=(p.intro||"").toLowerCase();

    const matchSearch=
      !q||
      name.includes(q)||
      category.includes(q)||
      intro.includes(q);

    const matchCategory=
      !activeCategory||
      p.category===activeCategory;

    return matchSearch&&matchCategory;
  });

  productCount.textContent=filtered.length+" محصول";

  if(!filtered.length){
    productGrid.innerHTML="";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  productGrid.innerHTML=filtered.map(p=>{
    const id=Number(p.id);
    const name=getProductName(p);
    const image=getImage(p);

    const intro=
      p.intro||
      "برای مشاهده مشخصات و اطلاعات کامل محصول، روی این کارت بزنید.";

    const price=getPriceText(p);

    return `
      <div class="product-card" onclick="openProduct(${id})">

        <img
          class="product-image"
          src="${image}"
          alt="${escapeHtml(name)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='${GITHUB_IMAGES}logo.png'"
        >

        <div class="product-body">

          ${
            p.category
              ? `<div class="product-category">${escapeHtml(p.category)}</div>`
              : ""
          }

          <div class="product-title">
            ${escapeHtml(name)}
          </div>

          <div class="product-short">
            ${escapeHtml(intro)}
          </div>

          ${
            price
              ? `<div class="price">${price}</div>`
              : ""
          }

          ${
            p.video_url
              ? `<div class="product-video-label">🎥 ویدئوی معرفی محصول</div>`
              : ""
          }

        </div>

      </div>
    `;
  }).join("");
}

function openProduct(id){
  const product=products.find(
    p=>Number(p.id)===Number(id)
  );

  if(!product) return;

  const modal=document.getElementById("modal");
  const content=document.getElementById("modalContent");

  const name=getProductName(product);
  const image=getImage(product);
  const catalog=getCatalog(product);

  const publicPrice=getPublicPrice(product);
  const privatePrice=getPrivatePrice(product);

  let priceHtml="";

  if(privatePrice){
    priceHtml=`
      <div class="detail-price private-price">
        💰 قیمت اختصاصی شما:
        ${escapeHtml(privatePrice)}
      </div>
    `;
  }else if(publicPrice){
    priceHtml=`
      <div class="detail-price">
        💰 قیمت:
        ${escapeHtml(publicPrice)}
      </div>
    `;
  }

  content.innerHTML=`

    <img
      class="detail-image"
      src="${image}"
      alt="${escapeHtml(name)}"
      onerror="this.onerror=null;this.src='${GITHUB_IMAGES}logo.png'"
    >

    <div class="detail-title">
      ${escapeHtml(name)}
    </div>

    ${
      product.category
        ? `<div class="product-category">${escapeHtml(product.category)}</div>`
        : ""
    }

    ${priceHtml}

    ${
      product.intro
        ? `
          <div class="detail-box">
            <strong>📝 معرفی محصول</strong>
            <div class="detail-description">
              ${escapeHtml(product.intro)}
            </div>
          </div>
        `
        :""
    }

    ${
      product.composition
        ? `
          <div class="detail-box">
            <strong>🧪 ترکیبات و آنالیز</strong>
            <div class="detail-description">
              ${escapeHtml(product.composition)}
            </div>
          </div>
        `
        :""
    }

    ${
      product.benefits
        ? `
          <div class="detail-box">
            <strong>🌱 مزایا</strong>
            <div class="detail-description">
              ${escapeHtml(
                Array.isArray(product.benefits)
                  ? product.benefits.join("، ")
                  : product.benefits
              )}
            </div>
          </div>
        `
        :""
    }

    ${
      product.use_text
        ? `
          <div class="detail-box">
            <strong>📋 روش مصرف</strong>
            <div class="detail-description">
              ${escapeHtml(product.use_text)}
            </div>
          </div>
        `
        :""
    }

    ${
      product.warnings
        ? `
          <div class="detail-box">
            <strong>⚠️ هشدارها</strong>
            <div class="detail-description">
              ${escapeHtml(product.warnings)}
            </div>
          </div>
        `
        :""
    }

    ${
      product.video_url
        ? `
          <div class="detail-box">
            <strong>🎥 ویدئوی معرفی</strong>
            <video
              class="video-preview"
              controls
              playsinline
              preload="metadata"
              src="${escapeHtml(product.video_url)}"
            ></video>
          </div>
        `
        :""
    }

    ${
      catalog
        ? `
          <div class="catalog-container">

            <h3>📚 کاتالوگ محصول</h3>

            <img
              class="catalog-image"
              src="${catalog}"
              alt="کاتالوگ ${escapeHtml(name)}"
              loading="lazy"
              onerror="this.style.display='none'"
            >

            <a
              class="catalog-button"
              href="${catalog}"
              target="_blank"
              rel="noopener"
            >
              📄 باز کردن کاتالوگ
            </a>

          </div>
        `
        :""
    }

  `;

  modal.classList.remove("hidden");

  if(tg){
    try{
      tg.BackButton.show();
      tg.BackButton.onClick(closeModal);
    }catch(e){}
  }
}

function closeModal(){
  const modal=document.getElementById("modal");

  if(modal){
    modal.classList.add("hidden");
  }

  if(tg){
    try{
      tg.BackButton.hide();
    }catch(e){}
  }
}

async function openAdmin(){
  if(!isAdmin){
    alert("دسترسی مدیریت ندارید.");
    return;
  }

  const modal=document.getElementById("adminModal");

  if(modal){
    modal.classList.remove("hidden");
  }

  await loadAdminPanel();
}

function closeAdmin(){
  const modal=document.getElementById("adminModal");

  if(modal){
    modal.classList.add("hidden");
  }
}

async function loadAdminPanel(){
  const adminLoading=document.getElementById("adminLoading");
  const adminError=document.getElementById("adminError");

  adminLoading.classList.remove("hidden");
  adminError.classList.add("hidden");

  try{
    const result=await post("/api/admin/products",{
      telegram_id:
        currentUser?.telegram_id||
        currentUser?.user_id||
        getTelegramUser()?.id||
        null
    });

    const list=
      Array.isArray(result.products)
        ? result.products
        : Array.isArray(result)
          ? result
          : [];

    renderAdminAccount();
    renderAdminProducts(list);
    await loadCustomers();

  }catch(e){
    console.error(e);

    adminError.textContent=e.message;
    adminError.classList.remove("hidden");

  }finally{
    adminLoading.classList.add("hidden");
  }
}

function renderAdminAccount(){
  const box=document.getElementById("adminAccountInfo");

  if(!box) return;

  const telegramUser=getTelegramUser();

  const telegramId=
    currentUser?.telegram_id||
    currentUser?.user_id||
    telegramUser?.id||
    "";

  const username=
    currentUser?.username||
    telegramUser?.username||
    "";

  const firstName=
    currentUser?.first_name||
    telegramUser?.first_name||
    "";

  const lastName=
    currentUser?.last_name||
    telegramUser?.last_name||
    "";

  box.innerHTML=`
    <div><strong>نام:</strong> ${escapeHtml((firstName+" "+lastName).trim()||"—")}</div>
    <div><strong>Username:</strong> ${escapeHtml(username?"@"+username:"—")}</div>
    <div><strong>Telegram ID:</strong> ${escapeHtml(telegramId||"—")}</div>
    <div><strong>دسترسی:</strong> مدیر سیستم</div>
  `;
}

function renderAdminProducts(list){
  const box=document.getElementById("adminProducts");

  if(!box) return;

  if(!list.length){
    box.innerHTML="<div class='message'>محصولی وجود ندارد.</div>";
    return;
  }

  box.innerHTML=list.map(p=>{
    const name=getProductName(p);
    const video=p.video_url||"";
    const basePrice=
      p.base_price===null||
      p.base_price===undefined
        ?""
        :p.base_price;

    return `
      <div class="admin-product">

        <div class="admin-product-title">
          ${escapeHtml(name)}
        </div>

        <div class="admin-row">
          <input
            type="number"
            step="any"
            id="price-${Number(p.id)}"
            value="${escapeHtml(basePrice)}"
            placeholder="قیمت عمومی"
          >

          <button
            onclick="savePublicPrice(${Number(p.id)})"
          >
            💾 ذخیره قیمت
          </button>
        </div>

        ${
          video
            ? `
              <video
                class="video-preview"
                controls
                preload="metadata"
                src="${escapeHtml(video)}"
              ></video>

              <div class="admin-row">
                <button
                  class="danger"
                  onclick="deleteProductVideo(${Number(p.id)})"
                >
                  🗑 حذف ویدئو
                </button>
              </div>
            `
            :""
        }

        <div class="admin-row">
          <input
            class="file-input"
            type="file"
            accept="video/*"
            id="video-${Number(p.id)}"
          >

          <button
            onclick="uploadProductVideo(${Number(p.id)})"
          >
            🎥 آپلود ویدئو
          </button>
        </div>

      </div>
    `;
  }).join("");
}

async function savePublicPrice(productId){
  const input=document.getElementById("price-"+productId);

  if(!input) return;

  const raw=input.value.trim();

  let price=null;

  if(raw!==""){
    price=Number(raw);

    if(!Number.isFinite(price)){
      alert("قیمت واردشده صحیح نیست.");
      return;
    }
  }

  try{
    await post("/api/admin/update-price",{
      telegram_id:
        currentUser?.telegram_id||
        currentUser?.user_id||
        getTelegramUser()?.id||
        null,
      product_id:Number(productId),
      price:price,
      currency:"تومان"
    });

    const product=products.find(
      p=>Number(p.id)===Number(productId)
    );

    if(product){
      product.base_price=price;
      product.base_currency="تومان";
    }

    renderProducts();

    alert("قیمت ذخیره شد.");

  }catch(e){
    console.error(e);
    alert("خطا در ذخیره قیمت:\n"+e.message);
  }
}

async function uploadProductVideo(productId){
  const input=document.getElementById("video-"+productId);

  if(!input||!input.files||!input.files[0]){
    alert("ابتدا فایل ویدئو را انتخاب کنید.");
    return;
  }

  const file=input.files[0];

  try{
    const base64=await fileToBase64(file);

    const result=await post("/api/admin/upload-video",{
      telegram_id:
        currentUser?.telegram_id||
        currentUser?.user_id||
        getTelegramUser()?.id||
        null,
      product_id:Number(productId),
      file_name:file.name,
      content_type:file.type||"video/mp4",
      file_data:base64
    });

    if(result.video_url){
      const product=products.find(
        p=>Number(p.id)===Number(productId)
      );

      if(product){
        product.video_url=result.video_url;
      }
    }

    alert("ویدئو با موفقیت آپلود شد.");

    await loadAdminPanel();
    renderProducts();

  }catch(e){
    console.error(e);
    alert("خطا در آپلود ویدئو:\n"+e.message);
  }
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();

    reader.onload=()=>{
      const result=String(reader.result||"");
      const comma=result.indexOf(",");

      resolve(
        comma>=0
          ? result.slice(comma+1)
          : result
      );
    };

    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

async function deleteProductVideo(productId){
  if(!confirm("ویدئوی این محصول حذف شود؟")){
    return;
  }

  try{
    await post("/api/admin/delete-video",{
      telegram_id:
        currentUser?.telegram_id||
        currentUser?.user_id||
        getTelegramUser()?.id||
        null,
      product_id:Number(productId)
    });

    const product=products.find(
      p=>Number(p.id)===Number(productId)
    );

    if(product){
      product.video_url="";
    }

    alert("ویدئو حذف شد.");

    await loadAdminPanel();
    renderProducts();

  }catch(e){
    console.error(e);
    alert("خطا در حذف ویدئو:\n"+e.message);
  }
}

async function loadCustomers(){
  const select=document.getElementById("customerSelect");

  if(!select) return;

  try{
    const result=await post("/api/admin/customers",{
      telegram_id:
        currentUser?.telegram_id||
        currentUser?.user_id||
        getTelegramUser()?.id||
        null
    });

    const customers=
      Array.isArray(result.customers)
        ? result.customers
        : Array.isArray(result)
          ? result
          : [];

    select.innerHTML=
      `<option value="">انتخاب مشتری</option>`;

    customers.forEach(customer=>{
      const option=document.createElement("option");

      option.value=customer.id;

      const name=
        customer.name||
        customer.full_name||
        customer.first_name||
        customer.username||
        "مشتری";

      const username=
        customer.username
          ? " @"+customer.username
          :"";

      option.textContent=
        name+
        username+
        " | ID: "+
        (customer.telegram_id||customer.id);

      select.appendChild(option);
    });

  }catch(e){
    console.error("Customers error:",e);
  }
}

async function loadCustomerPrices(customerId){
  const info=document.getElementById("customerInfo");
  const box=document.getElementById("customerPrices");

  if(!customerId){
    selectedCustomer=null;

    info.classList.add("hidden");
    box.innerHTML="";

    return;
  }

  try{
    const result=await post("/api/admin/customer-prices",{
      telegram_id:
        currentUser?.telegram_id||
        currentUser?.user_id||
        getTelegramUser()?.id||
        null,
      customer_id:Number(customerId)
    });

    selectedCustomer=
      result.customer||
      null;

    if(selectedCustomer){
      info.innerHTML=`
        <strong>
          ${escapeHtml(
            selectedCustomer.name||
            selectedCustomer.full_name||
            selectedCustomer.username||
            "مشتری"
          )}
        </strong>
        <br>
        Telegram ID:
        ${escapeHtml(selectedCustomer.telegram_id||"—")}
      `;

      info.classList.remove("hidden");
    }

    const prices=
      Array.isArray(result.prices)
        ? result.prices
        : [];

    renderCustomerPrices(prices,Number(customerId));

  }catch(e){
    console.error(e);
    box.innerHTML=
      `<div class="message error">${escapeHtml(e.message)}</div>`;
  }
}

function renderCustomerPrices(prices,customerId){
  const box=document.getElementById("customerPrices");

  if(!box) return;

  const priceMap={};

  prices.forEach(item=>{
    priceMap[Number(item.product_id)]=item;
  });

  box.innerHTML=products.map(p=>{
    const item=priceMap[Number(p.id)];
    const value=
      item&&item.price!==null&&item.price!==undefined
        ?item.price
        :"";

    return `
      <div class="customer-price-row">

        <strong>
          ${escapeHtml(getProductName(p))}
        </strong>

        <div class="admin-row">

          <input
            type="number"
            step="any"
            id="customer-price-${Number(p.id)}"
            value="${escapeHtml(value)}"
            placeholder="قیمت اختصاصی"
          >

          <button
            onclick="saveCustomerPrice(
              ${Number(customerId)},
              ${Number(p.id)}
            )"
          >
            💾 ذخیره
          </button>

        </div>

      </div>
    `;
  }).join("");
}

async function saveCustomerPrice(customerId,productId){
  const input=document.getElementById(
    "customer-price-"+productId
  );

  if(!input) return;

  const raw=input.value.trim();

  let price=null;

  if(raw!==""){
    price=Number(raw);

    if(!Number.isFinite(price)){
      alert("قیمت واردشده صحیح نیست.");
      return;
    }
  }

  try{
    await post("/api/admin/update-customer-price",{
      telegram_id:
        currentUser?.telegram_id||
        currentUser?.user_id||
        getTelegramUser()?.id||
        null,
      customer_id:Number(customerId),
      product_id:Number(productId),
      price:price,
      currency:"تومان"
    });

    alert("قیمت اختصاصی ذخیره شد.");

    await loadCustomerPrices(customerId);
    await loadProducts();

  }catch(e){
    console.error(e);
    alert("خطا در ذخیره قیمت اختصاصی:\n"+e.message);
  }
}

if(searchInput){
  searchInput.addEventListener("input",renderProducts);
}

const adminButton=document.getElementById("adminButton");

if(adminButton){
  adminButton.addEventListener("click",openAdmin);
}

const customerSelect=document.getElementById("customerSelect");

if(customerSelect){
  customerSelect.addEventListener("change",()=>{
    loadCustomerPrices(customerSelect.value);
  });
}

window.openProduct=openProduct;
window.closeModal=closeModal;
window.openAdmin=openAdmin;
window.closeAdmin=closeAdmin;
window.savePublicPrice=savePublicPrice;
window.uploadProductVideo=uploadProductVideo;
window.deleteProductVideo=deleteProductVideo;
window.loadCustomerPrices=loadCustomerPrices;
window.saveCustomerPrice=saveCustomerPrice;

(async function init(){
  try{
    await authenticate();
  }catch(e){
    console.error(e);
  }

  await loadProducts();
})();
