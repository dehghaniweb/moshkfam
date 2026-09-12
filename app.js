const WORKER_URL="https://moshkfam-telegram-bot.dehghaniweb.workers.dev";

const tg=window.Telegram&&window.Telegram.WebApp
?window.Telegram.WebApp
:null;

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
.replace(/&/g,"&")
.replace(/</g,"<")
.replace(/>/g,">")
.replace(/"/g,""")
.replace(/'/g,"'");
}

function authHeaders(){
const headers={
"Content-Type":"application/json"
};

if(tg&&tg.initData){
headers["X-Telegram-Init-Data"]=tg.initData;
}

return headers;
}

async function request(path,options={}){
const response=await fetch(
WORKER_URL+path,
{
...options,
headers:{
...authHeaders(),
...(options.headers||{})
}
}
);

const text=await response.text();

let result={};

try{
result=text?JSON.parse(text):{};
}catch{
throw new Error(
"پاسخ نامعتبر از سرور: "+
text.slice(0,300)
);
}

if(!response.ok){
throw new Error(
result.error||
"خطای سرور"
);
}

return result;
}

async function post(path,data={}){
return await request(
path,
{
method:"POST",
body:JSON.stringify(data)
}
);
}

function getProductName(product){
return (
product?.name_fa||
product?.name_en||
"بدون نام"
);
}

function getImage(product){
return product?.image_url||"";
}

function getCatalog(product){
return product?.catalog_pdf_url||"";
}

function formatPrice(value,currency="تومان"){
if(
value===null||
value===undefined||
value===""
){
return "";
}

const number=Number(value);

if(!Number.isFinite(number)){
return "";
}

return (
number.toLocaleString("fa-IR")+
" "+
(currency||"تومان")
);
}

function getPublicPrice(product){
return formatPrice(
product?.base_price,
product?.base_currency||"تومان"
);
}

function getPrivatePrice(product){
if(
!product?.has_private_price||
product?.customer_price===null||
product?.customer_price===undefined
){
return "";
}

return formatPrice(
product.customer_price,
product.customer_currency||"تومان"
);
}

function getPriceText(product){
const privatePrice=getPrivatePrice(product);

if(privatePrice){
return "<div class="private-price"> 💰 قیمت اختصاصی شما: ${escapeHtml(privatePrice)} </div>";
}

const publicPrice=getPublicPrice(product);

if(publicPrice){
return "<div class="price"> 💰 ${escapeHtml(publicPrice)} </div>";
}

return "";
}

function getTelegramUser(){
if(
!tg||
!tg.initDataUnsafe||
!tg.initDataUnsafe.user
){
return null;
}

return tg.initDataUnsafe.user;
}

async function authenticate(){
const user=getTelegramUser();

if(!user){
console.warn("Telegram user not available");
return;
}

try{

const result=await post(
  "/api/telegram-auth",
  {
    initData:tg?.initData||""
  }
);

currentUser={
  telegram_id:result.telegram_user_id,
  username:result.username||"",
  first_name:result.first_name||"",
  last_name:result.last_name||"",
  customer_id:result.customer_id||null
};

isAdmin=Boolean(result.is_admin);

showAccount();

const adminButton=
  document.getElementById("adminButton");

if(adminButton){
  if(isAdmin){
    adminButton.classList.remove("hidden");
  }else{
    adminButton.classList.add("hidden");
  }
}

}catch(error){

console.error(
  "Authentication error:",
  error
);

currentUser={
  telegram_id:user.id,
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

if(!account||!currentUser){
return;
}

const fullName=[
currentUser.first_name||"",
currentUser.last_name||""
]
.filter(Boolean)
.join(" ")
.trim();

if(accountName){
accountName.textContent=
fullName||
currentUser.username||
"کاربر";
}

if(accountUser){
accountUser.textContent=
currentUser.username
?"@"+currentUser.username
:"";
}

if(accountInfo){
accountInfo.innerHTML=
"شناسه تلگرام: <strong>"+
escapeHtml(
currentUser.telegram_id||""
)+
"</strong>";
}

account.classList.remove("hidden");
}

async function loadProducts(){
if(loading){
loading.classList.remove("hidden");
}

if(errorBox){
errorBox.classList.add("hidden");
}

if(empty){
empty.classList.add("hidden");
}

try{

const result=await request(
  "/api/products",
  {
    method:"GET"
  }
);

products=
  Array.isArray(result.products)
    ?result.products
    :[];

renderCategories();
renderProducts();

}catch(error){

console.error(
  "Products error:",
  error
);

if(errorBox){
  errorBox.textContent=
    "خطا در دریافت محصولات: "+
    error.message;

  errorBox.classList.remove("hidden");
}

}finally{

if(loading){
  loading.classList.add("hidden");
}

}
}

function renderCategories(){
if(!categoriesBox){
return;
}

const set=new Set();

products.forEach(product=>{
if(product.category){
set.add(product.category);
}
});

categories=[
...set
].sort(
(a,b)=>a.localeCompare(b,"fa")
);

categoriesBox.innerHTML="";

const allButton=
document.createElement("button");

allButton.textContent="همه";
allButton.className=
activeCategory===""
?"active"
:"";

allButton.onclick=()=>{
activeCategory="";
renderCategories();
renderProducts();
};

categoriesBox.appendChild(allButton);

categories.forEach(category=>{

const button=
  document.createElement("button");

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
if(!productGrid){
return;
}

const q=
(searchInput?.value||"")
.trim()
.toLowerCase();

const filtered=
products.filter(product=>{

  const name=
    getProductName(product)
      .toLowerCase();

  const category=
    (product.category||"")
      .toLowerCase();

  const intro=
    (product.intro||"")
      .toLowerCase();

  const matchSearch=
    !q||
    name.includes(q)||
    category.includes(q)||
    intro.includes(q);

  const matchCategory=
    !activeCategory||
    product.category===activeCategory;

  return matchSearch&&matchCategory;
});

if(productCount){
productCount.textContent=
filtered.length+
" محصول";
}

if(!filtered.length){

productGrid.innerHTML="";

if(empty){
  empty.classList.remove("hidden");
}

return;

}

if(empty){
empty.classList.add("hidden");
}

productGrid.innerHTML=
filtered.map(product=>{

  const id=Number(product.id);
  const name=getProductName(product);
  const image=getImage(product);

  const intro=
    product.intro||
    "برای مشاهده مشخصات و اطلاعات کامل محصول، روی این کارت بزنید.";

  const price=getPriceText(product);

  return `
    <div
      class="product-card"
      onclick="openProduct(${id})"
    >

      ${
        image
          ?`
            <img
              class="product-image"
              src="${escapeHtml(image)}"
              alt="${escapeHtml(name)}"
              loading="lazy"
            >
          `
          :""
      }

      <div class="product-body">

        ${
          product.category
            ?`
              <div class="product-category">
                ${escapeHtml(product.category)}
              </div>
            `
            :""
        }

        <div class="product-title">
          ${escapeHtml(name)}
        </div>

        <div class="product-short">
          ${escapeHtml(intro)}
        </div>

        ${price}

        ${
          product.video_url
            ?`
              <div class="product-video-label">
                🎥 ویدئوی معرفی محصول
              </div>
            `
            :""
        }

      </div>

    </div>
  `;

}).join("");

}

function openProduct(id){
const product=
products.find(
item=>Number(item.id)===Number(id)
);

if(!product){
return;
}

const modal=
document.getElementById("modal");

const content=
document.getElementById("modalContent");

if(!modal||!content){
return;
}

const name=getProductName(product);
const image=getImage(product);
const catalog=getCatalog(product);

const publicPrice=
getPublicPrice(product);

const privatePrice=
getPrivatePrice(product);

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

${
  image
    ?`
      <img
        class="detail-image"
        src="${escapeHtml(image)}"
        alt="${escapeHtml(name)}"
      >
    `
    :""
}

<div class="detail-title">
  ${escapeHtml(name)}
</div>

${
  product.category
    ?`
      <div class="product-category">
        ${escapeHtml(product.category)}
      </div>
    `
    :""
}

${priceHtml}

${
  product.intro
    ?`
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
    ?`
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
    ?`
      <div class="detail-box">
        <strong>🌱 مزایا</strong>
        <div class="detail-description">
          ${escapeHtml(
            Array.isArray(product.benefits)
              ?product.benefits.join("، ")
              :product.benefits
          )}
        </div>
      </div>
    `
    :""
}

${
  product.use_text
    ?`
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
    ?`
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
    ?`
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
    ?`
      <div class="catalog-container">

        <h3>📚 کاتالوگ محصول</h3>

        <img
          class="catalog-image"
          src="${escapeHtml(catalog)}"
          alt="کاتالوگ ${escapeHtml(name)}"
          loading="lazy"
        >

        <a
          class="catalog-button"
          href="${escapeHtml(catalog)}"
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

const modal=
document.getElementById("modal");

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

const modal=
document.getElementById("adminModal");

if(modal){
modal.classList.remove("hidden");
}

await loadAdminPanel();
}

function closeAdmin(){

const modal=
document.getElementById("adminModal");

if(modal){
modal.classList.add("hidden");
}
}

async function loadAdminPanel(){

const adminLoading=
document.getElementById("adminLoading");

const adminError=
document.getElementById("adminError");

if(adminLoading){
adminLoading.classList.remove("hidden");
}

if(adminError){
adminError.classList.add("hidden");
}

try{

const result=
  await post(
    "/api/admin/products",
    {}
  );

const list=
  Array.isArray(result.products)
    ?result.products
    :[];

renderAdminAccount();
renderAdminProducts(list);

await loadCustomers();

}catch(error){

console.error(
  "Admin panel error:",
  error
);

if(adminError){
  adminError.textContent=
    error.message;

  adminError.classList.remove("hidden");
}

}finally{

if(adminLoading){
  adminLoading.classList.add("hidden");
}

}
}

function renderAdminAccount(){

const box=
document.getElementById(
"adminAccountInfo"
);

if(!box){
return;
}

const user=
getTelegramUser();

const telegramId=
currentUser?.telegram_id||
user?.id||
"";

const username=
currentUser?.username||
user?.username||
"";

const firstName=
currentUser?.first_name||
user?.first_name||
"";

const lastName=
currentUser?.last_name||
user?.last_name||
"";

box.innerHTML=`
<div>
<strong>نام:</strong>
${escapeHtml(
[
firstName,
lastName
]
.filter(Boolean)
.join(" ")||
"—"
)}
</div>

<div>
  <strong>Username:</strong>
  ${escapeHtml(
    username
      ?"@"+username
      :"—"
  )}
</div>

<div>
  <strong>Telegram ID:</strong>
  ${escapeHtml(
    telegramId||
    "—"
  )}
</div>

<div>
  <strong>دسترسی:</strong>
  مدیر سیستم
</div>

`;
}

function renderAdminProducts(list){

const box=
document.getElementById(
"adminProducts"
);

if(!box){
return;
}

if(!list.length){

box.innerHTML=
  "<div class='message'>محصولی وجود ندارد.</div>";

return;

}

box.innerHTML=
list.map(product=>{

  const id=Number(product.id);
  const name=getProductName(product);

  const basePrice=
    product.base_price===null||
    product.base_price===undefined
      ?""
      :product.base_price;

  return `
    <div class="admin-product">

      <div class="admin-product-title">
        ${escapeHtml(name)}
      </div>

      <div class="admin-row">

        <input
          type="number"
          step="any"
          id="price-${id}"
          value="${escapeHtml(basePrice)}"
          placeholder="قیمت عمومی"
        >

        <button
          onclick="savePublicPrice(${id})"
        >
          💾 ذخیره قیمت
        </button>

      </div>

      ${
        product.video_url
          ?`
            <video
              class="video-preview"
              controls
              preload="metadata"
              src="${escapeHtml(product.video_url)}"
            ></video>

            <div class="admin-row">

              <button
                class="danger"
                onclick="deleteProductVideo(${id})"
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
          id="video-${id}"
        >

        <button
          onclick="uploadProductVideo(${id})"
        >
          🎥 آپلود ویدئو
        </button>

      </div>

    </div>
  `;

}).join("");

}

async function savePublicPrice(productId){

const input=
document.getElementById(
"price-"+productId
);

if(!input){
return;
}

const raw=input.value.trim();

let price=null;

if(raw!==""){

price=Number(raw);

if(!Number.isFinite(price)){

  alert(
    "قیمت واردشده صحیح نیست."
  );

  return;
}

}

try{

const result=
  await post(
    "/api/admin/update-price",
    {
      product_id:Number(productId),
      base_price:price,
      base_currency:"تومان"
    }
  );

const product=
  products.find(
    item=>Number(item.id)===Number(productId)
  );

if(product){

  product.base_price=price;
  product.base_currency="تومان";
}

renderProducts();

if(result.product){
  console.log(
    "Updated product:",
    result.product
  );
}

alert("قیمت ذخیره شد.");

}catch(error){

console.error(error);

alert(
  "خطا در ذخیره قیمت:\n"+
  error.message
);

}
}

async function uploadProductVideo(productId){

const input=
document.getElementById(
"video-"+productId
);

if(
!input||
!input.files||
!input.files[0]
){

alert(
  "ابتدا فایل ویدئو را انتخاب کنید."
);

return;

}

const file=input.files[0];

if(!file.type.startsWith("video/")){

alert(
  "فقط فایل ویدئویی انتخاب کنید."
);

return;

}

if(file.size>10010241024){

alert(
  "حجم ویدئو نباید بیشتر از 100 مگابایت باشد."
);

return;

}

const formData=
new FormData();

formData.append(
"product_id",
String(productId)
);

formData.append(
"video",
file,
file.name
);

try{

const result=
  await request(
    "/api/admin/upload-video",
    {
      method:"POST",
      headers:{
        "X-Telegram-Init-Data":
          tg?.initData||""
      },
      body:formData
    }
  );

const product=
  products.find(
    item=>Number(item.id)===Number(productId)
  );

if(product&&result.video_url){
  product.video_url=
    result.video_url;
}

alert(
  "ویدئو با موفقیت آپلود شد."
);

await loadAdminPanel();
renderProducts();

}catch(error){

console.error(error);

alert(
  "خطا در آپلود ویدئو:\n"+
  error.message
);

}
}

async function deleteProductVideo(productId){

if(!confirm(
"ویدئوی این محصول حذف شود؟"
)){
return;
}

try{

await post(
  "/api/admin/remove-video",
  {
    product_id:Number(productId)
  }
);

const product=
  products.find(
    item=>Number(item.id)===Number(productId)
  );

if(product){
  product.video_url=null;
}

alert("ویدئو حذف شد.");

await loadAdminPanel();
renderProducts();

}catch(error){

console.error(error);

alert(
  "خطا در حذف ویدئو:\n"+
  error.message
);

}
}

async function loadCustomers(){

const select=
document.getElementById(
"customerSelect"
);

if(!select){
return;
}

try{

const result=
  await post(
    "/api/admin/customers",
    {}
  );

const customers=
  Array.isArray(result.customers)
    ?result.customers
    :[];

select.innerHTML=
  '<option value="">انتخاب مشتری</option>';

customers.forEach(customer=>{

  const option=
    document.createElement("option");

  option.value=customer.id;

  const name=
    [
      customer.first_name||"",
      customer.last_name||""
    ]
    .filter(Boolean)
    .join(" ")||
    customer.username||
    "مشتری";

  const username=
    customer.username
      ?" @"+customer.username
      :"";

  option.textContent=
    name+
    username+
    " | ID: "+
    (
      customer.telegram_user_id||
      customer.id
    );

  select.appendChild(option);
});

}catch(error){

console.error(
  "Customers error:",
  error
);

}
}

async function loadCustomerPrices(customerId){

const info=
document.getElementById(
"customerInfo"
);

const box=
document.getElementById(
"customerPrices"
);

if(!customerId){

selectedCustomer=null;

if(info){
  info.classList.add("hidden");
}

if(box){
  box.innerHTML="";
}

return;

}

try{

const result=
  await post(
    "/api/admin/customer-prices",
    {
      customer_id:Number(customerId)
    }
  );

selectedCustomer=
  result.customer||
  null;

const prices=
  Array.isArray(result.prices)
    ?result.prices
    :[];

if(info){

  const customer=
    await getCustomerById(
      Number(customerId)
    );

  if(customer){

    info.innerHTML=`
      <strong>
        ${escapeHtml(
          [
            customer.first_name||"",
            customer.last_name||""
          ]
          .filter(Boolean)
          .join(" ")||
          customer.username||
          "مشتری"
        )}
      </strong>

      <br>

      Username:
      ${escapeHtml(
        customer.username
          ?"@"+customer.username
          :"—"
      )}

      <br>

      Telegram ID:
      ${escapeHtml(
        customer.telegram_user_id||
        "—"
      )}
    `;

    info.classList.remove("hidden");
  }
}

renderCustomerPrices(
  prices,
  Number(customerId)
);

}catch(error){

console.error(error);

if(box){

  box.innerHTML=
    `<div class="message error">
      ${escapeHtml(error.message)}
    </div>`;
}

}
}

async function getCustomerById(customerId){

try{

const result=
  await post(
    "/api/admin/customers",
    {}
  );

const customers=
  Array.isArray(result.customers)
    ?result.customers
    :[];

return customers.find(
  customer=>Number(customer.id)===customerId
)||null;

}catch{
return null;
}
}

function renderCustomerPrices(
prices,
customerId
){

const box=
document.getElementById(
"customerPrices"
);

if(!box){
return;
}

const priceMap={};

prices.forEach(item=>{
priceMap[
Number(item.product_id)
]=item;
});

box.innerHTML=
products.map(product=>{

  const id=Number(product.id);
  const item=priceMap[id];

  const value=
    item&&
    item.price!==null&&
    item.price!==undefined
      ?item.price
      :"";

  return `
    <div class="customer-price-row">

      <strong>
        ${escapeHtml(
          getProductName(product)
        )}
      </strong>

      <div class="admin-row">

        <input
          type="number"
          step="any"
          id="customer-price-${id}"
          value="${escapeHtml(value)}"
          placeholder="قیمت اختصاصی"
        >

        <button
          onclick="saveCustomerPrice(
            ${Number(customerId)},
            ${id}
          )"
        >
          💾 ذخیره
        </button>

      </div>

    </div>
  `;

}).join("");

}

async function saveCustomerPrice(
customerId,
productId
){

const input=
document.getElementById(
"customer-price-"+productId
);

if(!input){
return;
}

const raw=input.value.trim();

let price=null;

if(raw!==""){

price=Number(raw);

if(
  !Number.isFinite(price)||
  price<0
){

  alert(
    "قیمت واردشده صحیح نیست."
  );

  return;
}

}

try{

await post(
  "/api/admin/set-customer-price",
  {
    customer_id:Number(customerId),
    product_id:Number(productId),
    price,
    currency:"تومان"
  }
);

alert(
  price===null
    ?"قیمت اختصاصی حذف شد."
    :"قیمت اختصاصی ذخیره شد."
);

await loadCustomerPrices(
  customerId
);

await loadProducts();

}catch(error){

console.error(error);

alert(
  "خطا در ذخیره قیمت اختصاصی:\n"+
  error.message
);

}
}

if(searchInput){
searchInput.addEventListener(
"input",
renderProducts
);
}

const adminButton=
document.getElementById(
"adminButton"
);

if(adminButton){

adminButton.addEventListener(
"click",
openAdmin
);
}

const customerSelect=
document.getElementById(
"customerSelect"
);

if(customerSelect){

customerSelect.addEventListener(
"change",
()=>{
loadCustomerPrices(
customerSelect.value
);
}
);
}

window.openProduct=openProduct;
window.closeModal=closeModal;
window.openAdmin=openAdmin;
window.closeAdmin=closeAdmin;
window.savePublicPrice=savePublicPrice;
window.uploadProductVideo=
uploadProductVideo;
window.deleteProductVideo=
deleteProductVideo;
window.loadCustomerPrices=
loadCustomerPrices;
window.saveCustomerPrice=
saveCustomerPrice;

(async function init(){

try{
await authenticate();
}catch(error){
console.error(error);
}

await loadProducts();

})();
