(function () {
  var b = document.body, M = b.getAttribute("data-module") || "", Y = +(b.getAttribute("data-ym") || 0);
  var live = document.getElementById("live"), last = {};
  function say(t) { if (live) live.textContent = t; }
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  function goal(n) {
    var t = Date.now();
    if (last[n] && t - last[n] < 1500) return;
    last[n] = t;
    if (Y) window.ym(Y, "reachGoal", n);
  }
  function copyText(code) {
    function fb() {
      var a = document.createElement("textarea");
      a.value = code;
      a.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(a);
      a.select();
      try { document.execCommand("copy"); } catch (e) {}
      a.remove();
    }
    if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(code).then(function () {}, fb);
    else fb();
    say("Скопировано");
    goal("promo_copy");
  }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function bd(d) { return p2(d.getDate()) + "-" + p2(d.getMonth() + 1) + "-" + d.getFullYear(); }
  function go(from, to, adults) {
    var u = M;
    if (from && to) u += "?dfrom=" + bd(from) + "&dto=" + bd(to) + "&adults=" + encodeURIComponent(adults || 2);
    goal("booking_click");
    location.href = u;
  }
  var form = document.getElementById("book-fallback");
  if (form) {
    var today = iso(new Date());
    form.dfrom.min = today;
    form.dto.min = today;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.dfrom.value || !form.dto.value) { go(); return; }
      go(new Date(form.dfrom.value + "T12:00:00"), new Date(form.dto.value + "T12:00:00"), form.adults.value || 2);
    });
  }
  document.addEventListener("click", function (e) {
    var n = e.target && e.target.closest && e.target.closest("a,button");
    if (!n) return;
    var h = n.getAttribute("href") || "";
    if (h.indexOf("tel:") === 0) goal("phone_click");
    else if (h.indexOf("wa.me") !== -1) goal("whatsapp_click");
    else if (h.indexOf("t.me") !== -1) goal("telegram_click");
    if (n.classList.contains("js-book")) goal("booking_click");
    if (n.id === "promo") copyText(n.getAttribute("data-code") || "");
    if (n.id === "voice") voice();
  });
  addEventListener("blur", function () {
    var el = document.activeElement;
    if (el && el.tagName === "IFRAME" && el.closest && el.closest(".bn")) goal("booking_click");
  });
  var mo = "января февраля марта апреля мая июня июля августа сентября октября ноября декабря".split(" ");
  function noon(y, m, d) { return new Date(y, m - 1, d, 12); }
  function parse(text) {
    var t = text.toLowerCase().replace(/ё/g, "е"), now = new Date(), s = null, en = null, nights = null, guests = null, y;
    now.setHours(12, 0, 0, 0);
    y = now.getFullYear();
    var r = t.match(/(\d{1,2})\s*(?:по|до|-)\s*(\d{1,2})\s+([а-я]+)/);
    if (r && mo.indexOf(r[3]) >= 0) {
      var m = mo.indexOf(r[3]) + 1;
      s = noon(y, m, +r[1]);
      en = noon(y, m, +r[2]);
      if (s < now - 864e5) { s.setFullYear(y + 1); en.setFullYear(y + 1); }
    }
    if (!s) {
      if (t.indexOf("послезавтра") >= 0) s = new Date(+now + 1728e5);
      else if (t.indexOf("завтра") >= 0) s = new Date(+now + 864e5);
      else if (t.indexOf("сегодня") >= 0) s = new Date(+now);
      else {
        var num = t.match(/(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?/);
        var w = t.match(/(\d{1,2})\s+([а-я]+)/);
        if (num) s = noon(num[3] ? (+num[3] < 100 ? 2000 + +num[3] : +num[3]) : y, +num[2], +num[1]);
        else if (w && mo.indexOf(w[2]) >= 0) {
          s = noon(y, mo.indexOf(w[2]) + 1, +w[1]);
          if (s < now - 864e5) s.setFullYear(y + 1);
        }
      }
    }
    var nm = t.match(/(\d+)\s*ноч/);
    var nw = t.match(/(одну|две|три|четыре|пять|шесть|семь)\s*ноч/);
    var gm = t.match(/(\d+)\s*(?:гост|взросл|человек|чел)/);
    if (nm) nights = +nm[1];
    else if (nw) nights = { одну: 1, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7 }[nw[1]];
    if (gm) guests = +gm[1];
    else {
      var gw = { один: 1, одного: 1, двое: 2, двоих: 2, трое: 3, троих: 3, четверо: 4 };
      for (var k in gw) if (!guests && t.indexOf(k) >= 0) guests = gw[k];
    }
    if (!guests) guests = 2;
    if (s && !en) { en = new Date(s); en.setDate(en.getDate() + (nights || 1)); }
    return { start: s, end: en, guests: guests };
  }
  function voice() {
    goal("voice_search");
    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { say("Нет голоса"); return; }
    var rec = new R();
    rec.lang = "ru-RU";
    say("Слушаю");
    rec.onresult = function (ev) {
      var p = parse(ev.results[0][0].transcript);
      if (!p.start) { say("Не разобрал даты"); return; }
      if (form) { form.dfrom.value = iso(p.start); form.dto.value = iso(p.end); form.adults.value = p.guests; }
      say("Открываю");
      go(p.start, p.end, p.guests);
    };
    rec.onerror = function () { say("Ещё раз"); };
    try { rec.start(); } catch (e) { say("Нет микрофона"); }
  }
  function widget() {
    if (b.getAttribute("data-widget") !== "1" || window.__vw) return;
    window.__vw = 1;
    var s = document.createElement("script");
    s.src = b.getAttribute("data-widget-src");
    s.async = true;
    s.onload = function () {
      if (window.Bnovo_Widget) Bnovo_Widget.init(function () {
        Bnovo_Widget.open("_bn_widget_adaptive", { type: "horizontal", uid: b.getAttribute("data-uid"), width: "100%", _logo_background: "none" });
        var f = document.querySelector("iframe");
        if (f) f.title = "Бронь";
      });
    };
    document.body.appendChild(s);
  }
  function metrika() {
    if (window.__ym || !Y) return;
    window.__ym = 1;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://mc.yandex.ru/metrika/tag.js";
    document.head.appendChild(s);
    ym.l = 1 * new Date();
    ym(Y, "init", { webvisor: false });
  }
  if (b.getAttribute("data-widget") === "1") requestAnimationFrame(function () { requestAnimationFrame(widget); });
  addEventListener("load", metrika);
})();
