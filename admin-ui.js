/* =========================================================
   MOSHKFAM — admin-ui.js
   بهبودهای کوچک پنل مدیر نرم‌افزار و پنل کارشناس فروش.
   بعد از برنامهٔ اصلی و جدا از آن اجرا می‌شود؛ اگر خطایی داشته باشد فقط همین بهبودها کار نمی‌کنند
   و خود سایت بدون تغییر کار می‌کند.
========================================================= */
(function () {
  "use strict";
  if (window.__mkAdminUi) return;
  window.__mkAdminUi = true;

  var GROUPS = [
    { title: "محصولات", keys: ["products", "edit-products", "archives"] },
    { title: "نماینده‌ها و قیمت‌ها", keys: ["customers", "edit-customers", "prices"] },
    { title: "مدیریت سیستم", keys: ["admins", "limits", "footer", "cleanup"] }
  ];

  function byId(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function sectionOf(button) {
    var m = /showAdminSection\(\s*['"]([^'"]+)['"]/.exec(button.getAttribute("onclick") || "");
    return m ? m[1] : "";
  }

  /* منو: دسته‌بندی دکمه‌ها (همان دکمه‌ها با همان onclick؛ فقط جابه‌جا می‌شوند) */
  function buildMenu() {
    var menu = document.querySelector("#adminHome .admin-menu");
    if (!menu || menu.getAttribute("data-grouped") === "1") return;
    var items = [].slice.call(menu.querySelectorAll(".admin-menu-item"));
    var used = [];
    var frag = document.createDocumentFragment();

    function makeGroup(title, buttons) {
      var box = document.createElement("div");
      box.className = "admin-menu-group";
      var head = document.createElement("div");
      head.className = "admin-menu-group-title";
      head.textContent = title;
      var grid = document.createElement("div");
      grid.className = "admin-menu-grid";
      buttons.forEach(function (b) { grid.appendChild(b); used.push(b); });
      box.appendChild(head);
      box.appendChild(grid);
      frag.appendChild(box);
    }

    GROUPS.forEach(function (g) {
      var list = [];
      g.keys.forEach(function (k) {
        items.forEach(function (b) { if (sectionOf(b) === k && used.indexOf(b) < 0 && list.indexOf(b) < 0) list.push(b); });
      });
      if (list.length) makeGroup(g.title, list);
    });
    var rest = items.filter(function (b) { return used.indexOf(b) < 0; });
    if (rest.length) makeGroup("سایر", rest);

    menu.appendChild(frag);
    menu.setAttribute("data-grouped", "1");
  }

  /* هر گروهی که همهٔ دکمه‌هایش برای این نقش مخفی است، پنهان شود (مثلاً کارشناس فروش) */
  function syncGroups() {
    [].forEach.call(document.querySelectorAll("#adminHome .admin-menu-group"), function (g) {
      var any = [].some.call(g.querySelectorAll(".admin-menu-item"), function (b) { return !b.classList.contains("hidden"); });
      g.classList.toggle("is-empty", !any);
    });
  }

  /* دکمهٔ بستن داخل هدر چسبان قرار می‌گیرد تا همیشه در دسترس باشد */
  function moveClose() {
    var card = document.querySelector("#adminModal .admin-card");
    var header = card && card.querySelector(".admin-header");
    if (!card || !header || header.querySelector(".adm-close")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "adm-close";
    b.setAttribute("aria-label", "بستن پنل");
    b.textContent = "×";
    b.addEventListener("click", function () { if (typeof window.closeAdmin === "function") window.closeAdmin(); });
    header.appendChild(b);
  }

  function slimBackButtons() {
    [].forEach.call(document.querySelectorAll("#adminModal .admin-back"), function (b) { b.textContent = "→ بازگشت به منو"; });
  }

  /* کارت حساب کاربری به فارسی (قبلاً Name / Username / Role انگلیسی بود) */
  function renderAccount() {
    var el = byId("adminAccountInfo");
    if (!el) return;
    var user = null, adminFlag = false;
    try { user = currentUser; adminFlag = !!isAdmin; } catch (e) {}
    if (!user) { el.textContent = "کاربر وارد نشده است."; return; }
    var name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "کاربر";
    var role = String(user.role || "").toLowerCase();
    var label = (adminFlag || role === "admin" || role === "super_admin") ? "مدیر نرم‌افزار" : (role === "sales" ? "کارشناس فروش" : "نماینده");
    el.innerHTML =
      '<span class="adm-avatar">' + esc(Array.from(name)[0] || "👤") + "</span>" +
      '<span class="adm-who"><b>' + esc(name) + "</b><small>" + esc(label) + (user.username ? " · @" + esc(user.username) : "") + "</small></span>";
  }

  function scrollTop() {
    var card = document.querySelector("#adminModal .admin-card");
    if (card) card.scrollTop = 0;
  }

  function wrap(name, after) {
    var original = window[name];
    if (typeof original !== "function" || original.__mkWrapped) return;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      try { after(); } catch (e) {}
      return result;
    };
    wrapped.__mkWrapped = true;
    window[name] = wrapped;
  }

  function init() {
    buildMenu();
    moveClose();
    slimBackButtons();
    window.renderAdminAccount = renderAccount;
    wrap("updateAccountUI", syncGroups);
    wrap("showAdminHome", function () { syncGroups(); scrollTop(); });
    wrap("showAdminSection", scrollTop);
    wrap("openAdmin", function () { syncGroups(); scrollTop(); });
    renderAccount();
    syncGroups();
    document.addEventListener("keydown", function (e) {
      var modal = byId("adminModal");
      if (e.key === "Escape" && modal && !modal.classList.contains("hidden") && typeof window.closeAdmin === "function") window.closeAdmin();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
