const WORKER_URL="https://moshkfam-telegram-bot.dehghaniweb.workers.dev";
const GITHUB_IMAGES="https://dehghaniweb.github.io/moshkfam/images/";
const RAW_IMAGES="https://raw.githubusercontent.com/dehghaniweb/moshkfam/main/images/";

const tg=window.Telegram&&window.Telegram.WebApp?window.Telegram.WebApp:null;

let products=[];
let filteredProducts=[];
let customers=[];
let activeCategory="all";
let currentProduct=null;
let telegramAuthData=null;
let isAdmin=false;
let selectedCustomer=null;

if(tg){
  tg.ready();
  tg.expand();
}

document.addEventListener("DOMContentLoaded",async()=>{
  document.getElementById("searchInput").addEventListener("input",renderProducts);
  document.getElementById("customerSelect").addEventListener("change",loadCustomerPrices);
  await authenticateTelegram();
  await loadProducts();
});

async function post(path,data={}){
  const r=await fetch(WORKER_URL+path,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(data)
  });

  const text=await r.text();
  let json;

  try{
    json=JSON.parse(text);
  }catch{
    throw new Error(text||"پاسخ نامعتبر از سرور");
  }

  if(!r.ok||json.ok===false){
    throw new Error(json.error||json.message||"خطا");
  }

  return json;
}

async function authenticateTelegram(){
  const initData=tg?.initData||"";

  if(!initData){
    document.getElementById("account").classList.remove("hidden");
    document.getElementById("accountName").textContent="کاربر";
    document.getElementById("accountInfo").textContent=
      "برای ورود کامل، سایت را از داخل ربات تلگرام باز کنید.";
    return;
  }

  try{
    const data=await post("/api/telegram-auth",{initData});

    telegramAuthData=data;
    isAdmin=!!data.is_admin;

    const u=data.telegram_user||data.user||{
      id:data.telegram_user_id,
      username:data.username,
      first_name:data.first_name,
      last_name:data.last_name
    };

    const name=[u.first_name,u.last_name]
      .filter(Boolean)
      .join(" ")||"کاربر";

    const username=u.username?"@"+u.username:"";

    document.getElementById("account").classList.remove("hidden");
    document.getElementById("accountName").textContent=name;
    document.getElementById("accountUser").textContent=username;

    document.getElementById("accountInfo").innerHTML=
      "🆔 شناسه تلگرام: <b>"+
      escapeHtml(String(u.id||data.telegram_user_id||""))+
      "</b>"+
      (isAdmin?
        "<br>👑 دسترسی مدیر فعال است":
        "<br>👤 مشتری");

    if(isAdmin){
      document.getElementById("adminButton").classList.remove("hidden");
      document.getElementById("adminButton").onclick=openAdmin;
    }

  }catch(e){
    showError("خطا در ورود تلگرام: "+e.message);
  }
}

async function loadProducts(){
  setLoading(true);

  try{
    let url=WORKER_URL+"/api/products";

    if(tg?.initData){
      url+="?initData="+encodeURIComponent(tg.initData);
    }

    const r=await fetch(url);
    const text=await r.text();
    let data;

    try{
      data=JSON.parse(text);
    }catch{
      throw new Error(text||"پاسخ نامعتبر از سرور");
    }

    if(!r.ok||data.ok===false){
      throw new Error(data.error||"خطا در دریافت محصولات");
    }

    products=data.products||data.data||[];

    buildCategories();
    renderProducts();

  }catch(e){
    showError("خطا در دریافت محصولات: "+e.message);
    console.error(e);
  }finally{
    setLoading(false);
  }
}

function getProductName(p){
  return p.name_fa||p.name_en||"بدون نام";
}

function getImage(p){
  const id=Number(p.id);

  if(Number.isFinite(id)&&id>=1&&id<=10){
    return GITHUB_IMAGES+
      "product-"+String(id).padStart(2,"0")+".jpg";
  }

  return GITHUB_IMAGES+"logo.png";
}

function buildCategories(){
  const box=document.getElementById("categories");

  const categories=[
    ...new Set(
      products
        .map(p=>p.category)
        .filter(Boolean)
    )
  ];

  box.innerHTML=
    '<button class="active" data-cat="all">همه</button>'+
    categories.map(c=>
      '<button data-cat="'+escapeAttr(c)+'">'+
      escapeHtml(c)+
      "</button>"
    ).join("");

  box.querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{
      box.querySelectorAll("button")
        .forEach(x=>x.classList.remove("active"));

      b.classList.add("active");
      activeCategory=b.dataset.cat;
      renderProducts();
    };
  });
}

function renderProducts(){
  const search=(
    document.getElementById("searchInput").value||""
  ).trim().toLowerCase();

  filteredProducts=products.filter(p=>{
    const categoryOk=
      activeCategory==="all"||
      String(p.category||"")===activeCategory;

    const text=[
      p.name_fa,
      p.name_en,
      p.category,
      p.package,
      p.maker,
      p.intro,
      p.composition,
      p.use_text,
      p.warnings,
      Array.isArray(p.benefits)?p.benefits.join(" "):p.benefits
    ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

    return categoryOk&&(!search||text.includes(search));
  });

  document.getElementById("productCount").textContent=
    filteredProducts.length+" محصول";

  const grid=document.getElementById("productGrid");

  if(!filteredProducts.length){
    grid.innerHTML="";
    document.getElementById("empty").classList.remove("hidden");
    return;
  }

  document.getElementById("empty").classList.add("hidden");

  grid.innerHTML=filteredProducts.map(productCard).join("");

  grid.querySelectorAll("[data-product]").forEach(el=>{
    el.onclick=()=>openProduct(el.dataset.product);
  });
}

function productCard(p){
  const image=getImage(p);
  const price=getProductPrice(p);

  return `
  <article class="product-card">

    <img
      class="product-image"
      src="${escapeAttr(image)}"
      loading="lazy"
      onerror="this.onerror=null;this.src='${GITHUB_IMAGES}logo.png'"
    >

    <div class="product-body">

      <div class="product-category">
        ${escapeHtml(p.category||"محصول کشاورزی")}
      </div>

      <div class="product-title">
        ${escapeHtml(getProductName(p))}
      </div>

      <div class="${price.private?"price private-price":"price"}">
        ${escapeHtml(price.text)}
      </div>

      <div class="card-buttons">

        <button data-product="${escapeAttr(String(p.id))}">
          مشاهده
        </button>

        ${
          p.video_url
          ?
          `<button
            class="video"
            onclick="event.stopPropagation();openExternalUrl('${escapeAttr(p.video_url)}')">
            ▶ ویدئو
          </button>`
          :
          ""
        }

      </div>

    </div>
  </article>`;
}

function openProduct(id){
  const p=products.find(
    x=>String(x.id)===String(id)
  );

  if(!p)return;

  currentProduct=p;

  const price=getProductPrice(p);
  const image=getImage(p);

  let benefits="";

  if(Array.isArray(p.benefits)){
    benefits=p.benefits.join("، ");
  }else{
    benefits=p.benefits||"";
  }

  document.getElementById("modalContent").innerHTML=`

    <img
      class="detail-image"
      src="${escapeAttr(image)}"
      onerror="this.onerror=null;this.src='${GITHUB_IMAGES}logo.png'"
    >

    <div class="detail-title">
      ${escapeHtml(getProductName(p))}
    </div>

    <div class="detail-box">
      <b>دسته‌بندی:</b>
      ${escapeHtml(p.category||"-")}
    </div>

    ${
      p.package||p.maker
      ?
      `<div class="detail-box">
        ${p.package?
          "<b>بسته‌بندی:</b> "+
          escapeHtml(p.package):
          ""}
        ${p.package&&p.maker?"<br>":""}
        ${p.maker?
          "<b>تولیدکننده:</b> "+
          escapeHtml(p.maker):
          ""}
      </div>`
      :
      ""
    }

    <div class="detail-price">
      ${escapeHtml(price.text)}
    </div>

    ${
      p.intro
      ?
      `<div class="detail-box">
        <b>📝 معرفی</b><br>
        ${escapeHtml(p.intro)}
      </div>`
      :
      ""
    }

    ${
      p.composition
      ?
      `<div class="detail-box">
        <b>🧪 آنالیز / ترکیبات</b><br>
        ${escapeHtml(p.composition)}
      </div>`
      :
      ""
    }

    ${
      benefits
      ?
      `<div class="detail-box">
        <b>🌾 محصولات و مزایا</b><br>
        ${escapeHtml(benefits)}
      </div>`
      :
      ""
    }

    ${
      p.use_text
      ?
      `<div class="detail-box">
        <b>📚 راهنمای مصرف</b><br>
        ${escapeHtml(p.use_text)}
      </div>`
      :
      ""
    }

    ${
      p.warnings
      ?
      `<div class="detail-box">
        <b>⚠️ هشدار</b><br>
        ${escapeHtml(p.warnings)}
      </div>`
      :
      ""
    }

    ${
      p.video_url
      ?
      `<button
        class="video-button"
        onclick="openExternalUrl('${escapeAttr(p.video_url)}')">
        ▶ مشاهده ویدئوی محصول
      </button>`
      :
      ""
    }

    ${
      p.catalog_pdf_url
      ?
      `<button
        class="catalog-button"
        onclick="openExternalUrl('${escapeAttr(p.catalog_pdf_url)}')">
        📄 مشاهده کاتالوگ / PDF
      </button>`
      :
      ""
    }

  `;

  document.getElementById("modal").classList.remove("hidden");
}

function getProductPrice(p){
  if(
    p.has_private_price&&
    p.customer_price!==null&&
    p.customer_price!==undefined
  ){
    return{
      private:true,
      text:
        "💎 قیمت اختصاصی: "+
        formatPrice(
          p.customer_price,
          p.customer_currency||"تومان"
        )
    };
  }

  const value=p.base_price;

  if(
    value===null||
    value===undefined||
    value===""
  ){
    return{
      private:false,
      text:"برای اطلاع از قیمت تماس بگیرید"
    };
  }

  return{
    private:false,
    text:
      "قیمت: "+
      formatPrice(
        value,
        p.base_currency||"تومان"
      )
  };
}

function formatPrice(value,currency){
  const n=Number(value);

  if(!Number.isFinite(n)){
    return String(value)+" "+currency;
  }

  return n.toLocaleString("fa-IR")+" "+currency;
}

function openExternalUrl(url){
  if(!url)return;

  if(tg?.openLink){
    tg.openLink(url);
  }else{
    window.open(url,"_blank");
  }
}

function closeModal(){
  document.getElementById("modal").classList.add("hidden");
}

async function openAdmin(){
  if(!isAdmin){
    alert("دسترسی مدیریت ندارید.");
    return;
  }

  document.getElementById("adminModal")
    .classList.remove("hidden");

  document.getElementById("adminLoading")
    .classList.remove("hidden");

  document.getElementById("adminProducts").innerHTML="";

  document.getElementById("customerSelect").innerHTML=
    '<option value="">در حال دریافت مشتریان...</option>';

  try{
    await Promise.all([
      loadAdminProducts(),
      loadCustomers()
    ]);
  }catch(e){
    showAdminError(e.message);
  }finally{
    document.getElementById("adminLoading")
      .classList.add("hidden");
  }
}

function closeAdmin(){
  document.getElementById("adminModal")
    .classList.add("hidden");
}

async function loadAdminProducts(){
  const data=await post(
    "/api/admin/products",
    {
      initData:tg?.initData||""
    }
  );

  const list=data.products||[];

  document.getElementById("adminProducts").innerHTML=
    list.map(adminProduct).join("");
}

function adminProduct(p){
  const video=p.video_url||"";

  return `
  <div class="admin-product">

    <div class="admin-product-title">
      🌿 ${escapeHtml(getProductName(p))}
    </div>

    <div class="admin-row">

      <input
        id="price-${p.id}"
        type="number"
        value="${p.base_price??""}"
        placeholder="قیمت عمومی">

      <button onclick="savePublicPrice(${p.id})">
        ذخیره قیمت
      </button>

    </div>

    <div class="admin-row">

      <input
        id="video-${p.id}"
        class="file-input"
        type="file"
        accept="video/*">

      <button onclick="uploadVideo(${p.id})">
        🎥 آپلود
      </button>

    </div>

    ${
      video
      ?
      `
      <video
        class="video-preview"
        controls
        src="${escapeAttr(video)}">
      </video>

      <div class="admin-row">

        <button
          class="secondary"
          onclick="openExternalUrl('${escapeAttr(video)}')">
          ▶ مشاهده
        </button>

        <button
          class="danger"
          onclick="removeVideo(${p.id})">
          🗑 حذف ویدئو
        </button>

      </div>
      `
      :
      "<small>ویدئویی برای این محصول ثبت نشده است.</small>"
    }

    <div class="admin-row">
      <button onclick="selectProductForCustomer(${p.id})">
        👤 قیمت مشتری
      </button>
    </div>

  </div>`;
}

async function savePublicPrice(productId){
  const input=document.getElementById("price-"+productId);

  if(!input){
    alert("فیلد قیمت پیدا نشد.");
    return;
  }

  const value=input.value.trim();

  if(value===""){
    alert("لطفاً قیمت را وارد کنید.");
    return;
  }

  try{
    await post(
      "/api/admin/update-price",
      {
        initData:tg?.initData||"",
        product_id:Number(productId),
        price:Number(value),
        currency:"تومان"
      }
    );

    alert("قیمت عمومی ذخیره شد.");

    await loadProducts();
    await loadAdminProducts();

  }catch(e){
    alert(e.message);
  }
}

async function loadCustomers(){
  const data=await post(
    "/api/admin/customers",
    {
      initData:tg?.initData||""
    }
  );

  customers=data.customers||[];

  const select=document.getElementById("customerSelect");

  select.innerHTML=
    '<option value="">انتخاب مشتری</option>'+
    customers.map(c=>{

      const name=[
        c.first_name,
        c.last_name
      ]
      .filter(Boolean)
      .join(" ")||"بدون نام";

      const user=c.username?
        " @"+c.username:
        "";

      const telegramId=
        c.telegram_id||
        c.telegram_user_id||
        "";

      return `
      <option value="${escapeAttr(String(c.id))}">
        ${escapeHtml(
          name+
          user+
          " — "+
          telegramId
        )}
      </option>`;

    }).join("");

  document.getElementById("adminAccountInfo").innerHTML=
    "تعداد مشتریان ثبت‌شده: <b>"+
    customers.length+
    "</b>";
}

async function loadCustomerPrices(){
  const id=document.getElementById("customerSelect").value;

  if(!id){
    selectedCustomer=null;

    document.getElementById("customerInfo")
      .classList.add("hidden");

    document.getElementById("customerPrices")
      .innerHTML="";

    return;
  }

  selectedCustomer=customers.find(
    c=>String(c.id)===String(id)
  );

  if(selectedCustomer){

    const name=[
      selectedCustomer.first_name,
      selectedCustomer.last_name
    ]
    .filter(Boolean)
    .join(" ")||"بدون نام";

    const telegramId=
      selectedCustomer.telegram_id||
      selectedCustomer.telegram_user_id||
      "-";

    document.getElementById("customerInfo")
      .classList.remove("hidden");

    document.getElementById("customerInfo").innerHTML=
      "<b>نام:</b> "+
      escapeHtml(name)+
      "<br><b>Username:</b> "+
      escapeHtml(
        selectedCustomer.username?
        "@"+selectedCustomer.username:
        "-"
      )+
      "<br><b>Telegram ID:</b> "+
      escapeHtml(String(telegramId));
  }

  await renderCustomerPrices();
}

async function renderCustomerPrices(){
  if(!selectedCustomer)return;

  try{
    const data=await post(
      "/api/admin/customer-prices",
      {
        initData:tg?.initData||"",
        customer_id:Number(selectedCustomer.id)
      }
    );

    const prices=data.prices||[];
    const map={};

    prices.forEach(x=>{
      map[String(x.product_id)]=x;
    });

    document.getElementById("customerPrices").innerHTML=
      products.map(p=>{

        const cp=map[String(p.id)];

        return `
        <div class="customer-price-row">

          <strong>
            ${escapeHtml(getProductName(p))}
          </strong>

          <div class="admin-row">

            <input
              id="cp-${p.id}"
              type="number"
              value="${cp?.price??""}"
              placeholder="قیمت اختصاصی">

            <button onclick="saveCustomerPrice(${p.id})">
              ذخیره
            </button>

            ${
              cp
              ?
              `
              <button
                class="danger"
                onclick="deleteCustomerPrice(${p.id})">
                حذف
              </button>
              `
              :
              ""
            }

          </div>

        </div>`;

      }).join("");

  }catch(e){
    showAdminError(e.message);
  }
}

function selectProductForCustomer(productId){
  const select=document.getElementById("customerSelect");

  document.getElementById("customerSection")
    .scrollIntoView({
      behavior:"smooth"
    });

  if(!select.value){
    alert("ابتدا مشتری را انتخاب کنید.");
    return;
  }

  setTimeout(()=>{
    const input=document.getElementById("cp-"+productId);

    if(input){
      input.focus();

      input.scrollIntoView({
        behavior:"smooth",
        block:"center"
      });
    }
  },300);
}

async function saveCustomerPrice(productId){
  if(!selectedCustomer){
    alert("ابتدا مشتری را انتخاب کنید.");
    return;
  }

  const input=document.getElementById("cp-"+productId);

  if(!input){
    alert("فیلد قیمت پیدا نشد.");
    return;
  }

  const value=input.value.trim();

  if(value===""){
    alert("لطفاً قیمت را وارد کنید.");
    return;
  }

  try{
    await post(
      "/api/admin/set-customer-price",
      {
        initData:tg?.initData||"",
        customer_id:Number(selectedCustomer.id),
        product_id:Number(productId),
        price:Number(value),
        currency:"تومان"
      }
    );

    alert("قیمت اختصاصی ذخیره شد.");

    await loadProducts();
    await renderCustomerPrices();

  }catch(e){
    alert(e.message);
  }
}

async function deleteCustomerPrice(productId){
  if(!selectedCustomer)return;

  if(!confirm("قیمت اختصاصی این مشتری حذف شود؟")){
    return;
  }

  try{
    await post(
      "/api/admin/set-customer-price",
      {
        initData:tg?.initData||"",
        customer_id:Number(selectedCustomer.id),
        product_id:Number(productId),
        price:null,
        currency:"تومان"
      }
    );

    await loadProducts();
    await renderCustomerPrices();

  }catch(e){
    alert(e.message);
  }
}

async function uploadVideo(productId){
  const input=document.getElementById("video-"+productId);
  const file=input?.files?.[0];

  if(!file){
    alert("ابتدا فایل ویدئو را انتخاب کنید.");
    return;
  }

  if(!file.type.startsWith("video/")){
    alert("فقط فایل ویدئویی مجاز است.");
    return;
  }

  if(file.size>100*1024*1024){
    alert("حداکثر حجم ویدئو 100 مگابایت است.");
    return;
  }

  const fd=new FormData();

  fd.append("product_id",String(productId));
  fd.append("video",file);

  try{
    const r=await fetch(
      WORKER_URL+"/api/admin/upload-video",
      {
        method:"POST",
        headers:{
          "X-Telegram-Init-Data":
            tg?.initData||""
        },
        body:fd
      }
    );

    const text=await r.text();
    let data;

    try{
      data=JSON.parse(text);
    }catch{
      throw new Error(
        text||"پاسخ نامعتبر از سرور"
      );
    }

    if(!r.ok||data.ok===false){
      throw new Error(
        data.error||"خطا در آپلود"
      );
    }

    alert("ویدئو با موفقیت آپلود شد.");

    await loadProducts();
    await loadAdminProducts();

  }catch(e){
    alert("خطا در آپلود ویدئو: "+e.message);
  }
}

async function removeVideo(productId){
  if(!confirm("ویدئوی این محصول حذف شود؟")){
    return;
  }

  try{
    await post(
      "/api/admin/remove-video",
      {
        initData:tg?.initData||"",
        product_id:Number(productId)
      }
    );

    alert("ویدئو حذف شد.");

    await loadProducts();
    await loadAdminProducts();

  }catch(e){
    alert(e.message);
  }
}

function setLoading(v){
  document.getElementById("loading")
    .classList
    .toggle("hidden",!v);
}

function showError(msg){
  const el=document.getElementById("error");

  el.textContent=msg;
  el.classList.remove("hidden");
}

function showAdminError(msg){
  const el=document.getElementById("adminError");

  el.textContent=msg;
  el.classList.remove("hidden");
}

function escapeHtml(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function escapeAttr(value){
  return escapeHtml(value);
}
