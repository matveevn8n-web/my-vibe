import { gzipSync } from "node:zlib";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");
const outDir = join(repo, "docs");
const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
const source = JSON.parse(readFileSync(join(root, "data", "apartments.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "img", "manifest.json"), "utf8"));
const css = readFileSync(join(root, "src", "styles.css"), "utf8").replace(/\s+/g, " ").trim();
const client = minifyJs(readFileSync(join(root, "src", "client.js"), "utf8"));

function minifyJs(code) {
  let out = "";
  let i = 0;
  const ident = /[A-Za-z0-9_$\u0400-\u04FF]/;
  while (i < code.length) {
    const c = code[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === c) { j++; break; }
        j++;
      }
      out += code.slice(i, j);
      i = j;
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      const nl = code.indexOf("\n", i);
      i = nl < 0 ? code.length : nl;
      continue;
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j < code.length && /\s/.test(code[j])) j++;
      const prev = out.at(-1) || "";
      const next = code[j] || "";
      if (ident.test(prev) && ident.test(next)) out += " ";
      else if ((prev === "+" && next === "+") || (prev === "-" && next === "-")) out += " ";
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out.trim();
}

const base = config.baseUrl.replace(/\/$/, "");
const apartments = source.apartments.filter((item) => item.active);
if (apartments.some((item) => /151/.test(item.id) || /151/.test(item.name))) {
  throw new Error("City #151 продана и не должна попасть в сборку");
}
if (!apartments.length) throw new Error("Нет активных квартир");

const minPrice = Math.min(...apartments.map((item) => item.priceFrom));

function esc(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
function rub(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + "\u00a0₽";
}
function area(value) {
  return String(value).replace(".", ",") + "\u00a0м²";
}
function href(path) {
  return (config.basePath || "") + path;
}
function abs(path) {
  return base + path;
}
function address(item) {
  return `${item.city}, ${item.street}`;
}
function bookingUrl(item) {
  return item.bookingUrl || config.bnovo.module;
}
function amenities(item) {
  const list = [...config.sharedAmenities];
  if (item.extra) list.splice(1, 0, item.extra);
  return list;
}

const NAV = [
  ["/apartments/", "Квартиры"],
  ["/terms/", "Условия"],
  ["/faq/", "FAQ"],
  ["/contacts/", "Контакты"],
];

function picture(id, alt, { priority = false, lazy = false, sizes }) {
  const dim = manifest[id];
  if (!dim) throw new Error(`Нет размеров фото ${id}`);
  const eager = priority ? ' fetchpriority="high"' : "";
  const load = lazy ? ' loading="lazy" decoding="async"' : "";
  return `<picture>
<source type="image/avif" srcset="${href(`/img/${id}-480.avif`)} 480w, ${href(`/img/${id}-960.avif`)} 960w" sizes="${sizes}">
<source type="image/webp" srcset="${href(`/img/${id}-480.webp`)} 480w, ${href(`/img/${id}-960.webp`)} 960w" sizes="${sizes}">
<img src="${href(`/img/${id}-960.webp`)}" alt="${esc(alt)}" width="${dim.width}" height="${dim.height}"${eager}${load}>
</picture>`;
}

function lodging() {
  return {
    "@type": ["LodgingBusiness", "Organization"],
    "@id": `${base}/#org`,
    name: config.name,
    url: `${base}/`,
    telephone: config.phoneTel,
    email: config.email,
    image: abs("/img/view-960.webp"),
    address: {
      "@type": "PostalAddress",
      streetAddress: "Московское ш., д. 27, офис 316",
      postalCode: "443080",
      addressLocality: "Самара",
      addressRegion: "Самарская область",
      addressCountry: "RU",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: config.geo.lat,
      longitude: config.geo.lng,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: config.rating.value,
      bestRating: config.rating.best,
      reviewCount: config.rating.count,
    },
    checkinTime: config.checkIn,
    checkoutTime: config.checkOut,
    currenciesAccepted: "RUB",
    priceRange: `${rub(minPrice).replaceAll("\u00a0", " ")}+`,
    sameAs: [config.vk, config.telegram, config.youtube],
    slogan: config.home.h1,
    areaServed: "Самара",
    amenityFeature: config.sharedAmenities.map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
    potentialAction: {
      "@type": "ReserveAction",
      name: "Забронировать",
      target: config.bnovo.module,
    },
    description: `${config.promo.label}. ${config.promo.note}`,
  };
}

function apartmentNode(item) {
  const maxGuests = item.guests + (item.extraGuests || 0);
  return {
    "@type": ["Apartment", "Product"],
    "@id": `${base}/apartments/#${item.id}`,
    name: item.name,
    url: `${base}/apartments/#${item.id}`,
    image: abs(`/img/${item.photo}-960.webp`),
    containedInPlace: { "@id": `${base}/#org` },
    address: {
      "@type": "PostalAddress",
      streetAddress: item.street,
      addressLocality: item.city,
      addressRegion: item.region,
      addressCountry: "RU",
    },
    geo: { "@type": "GeoCoordinates", latitude: item.lat, longitude: item.lng },
    floorLevel: String(item.floor),
    floorSize: { "@type": "QuantitativeValue", value: item.area, unitCode: "MTK" },
    occupancy: {
      "@type": "QuantitativeValue",
      maxValue: maxGuests,
      unitText: item.guestsLabel,
    },
    amenityFeature: amenities(item).map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
    offers: {
      "@type": "Offer",
      price: String(item.priceFrom),
      priceCurrency: "RUB",
      availability: "https://schema.org/InStock",
      url: bookingUrl(item),
      description: `Цена от ${item.priceFrom} ₽ за сутки. ${config.promo.label}.`,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(item.priceFrom),
        priceCurrency: "RUB",
        unitText: "сутки",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "DAY" },
      },
    },
  };
}

const FAQ = [
  {
    q: "Где находятся апартаменты?",
    a: "Galaxy — Самара, ул. Ново-Садовая, 106Г, корп. 1: видовые квартиры на ракету, Волгу и Третьяковку. Рядом набережная, кофейни, пекарни, рестораны, в том числе на первом этаже, и супермаркеты. Downtown и Center — исторический центр: ул. Пушкина, ул. Ленинская и ул. Буянова. Рядом набережная, главная площадь, кофейни, рестораны и сетевые супермаркеты. City — ул. Гая, 27Б, географический центр города: до набережной около 3 км, до ракеты-носителя «Союз» около 2 км, рядом супермаркеты и кафе.",
  },
  {
    q: "Есть ли парковка?",
    a: "Да. У каждого жилого комплекса есть бесплатная общественная парковка.",
  },
  {
    q: "Можно с детьми?",
    a: "Да, все апартаменты подходят семьям. Размещение — на имеющихся кроватях. На диван дополнительный комплект белья привозим бесплатно по запросу.",
  },
  {
    q: "Что предоставляется бесплатно?",
    a: "Чай и капсулы кофе — комплимент в каждой квартире. Дополнительное бельё на диван для детей тоже бесплатно по запросу.",
  },
  {
    q: "Как пользоваться бытовой техникой?",
    a: `Короткая видеоинструкция по самостоятельному заезду: ${config.youtubeCheckin}. В квартире есть интернет, Smart TV 50 дюймов, кухня, капсульная кофемашина, стиральная машина и утюг.`,
  },
  {
    q: "Как забронировать?",
    a: `Выберите даты и число гостей в модуле на главной или откройте модуль бронирования: ${config.bnovo.module}. Промокод ${config.promo.code} даёт −10% при прямом бронировании, его вводят в модуле. Можно позвонить: ${config.phoneDisplay}.`,
  },
];

function jsonLd(graph) {
  const payload = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${payload}</script>`;
}

function header(current) {
  const links = NAV.map(([path, label]) => {
    const currentAttr = path === current ? ' aria-current="page"' : "";
    return `<a href="${href(path)}"${currentAttr}>${label}</a>`;
  }).join("");
  return `<a class="skip" href="#content">К содержанию</a>
<header class="top">
<a class="logo" href="${href("/")}">MATVEEV APARTMENTS®</a>
<nav class="desk" aria-label="Разделы">${links}</nav>
<details class="nav">
<summary aria-label="Меню"><span class="burger"></span></summary>
<nav class="panel" aria-label="Разделы">${links}</nav>
</details>
<a class="phone" href="tel:${config.phoneTel}" aria-label="Позвонить ${config.phoneDisplay}">
<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 3.5 9 6l-1.5 2a12 12 0 0 0 6.5 6.5L16 13l2.5 2.5c.4.4.5 1 .3 1.5A7 7 0 0 1 7 7.2c.2-.5.8-.7 1.3-.4Z"/></svg>
</a>
</header>`;
}

function footer() {
  return `<footer class="foot">
<a href="${config.whatsapp}">WhatsApp</a>
<a href="${config.telegram}">Telegram</a>
<a href="tel:${config.phoneTel}"><span class="only-narrow">Телефон</span><span class="only-wide">${esc(config.phoneDisplay)}</span></a>
<a href="${config.offerUrl}">Оферта</a>
<a href="${config.privacyUrl}">Политика ПД</a>
</footer>`;
}

function head({ title, description, path, graph, home }) {
  const url = abs(path);
  const prefetch = NAV.filter(([item]) => item !== path)
    .map(([item]) => `<link rel="prefetch" href="${href(item)}">`)
    .join("");
  const voice = config.voiceSearch && home
    ? `<script>if(self.webkitSpeechRecognition||self.SpeechRecognition)document.documentElement.classList.add("voice-ok")</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#f3efe6">
<meta name="geo.region" content="${config.geo.region}">
<meta name="geo.placename" content="${esc(config.geo.placename)}">
<meta name="geo.position" content="${config.geo.lat};${config.geo.lng}">
<meta name="ICBM" content="${config.geo.lat}, ${config.geo.lng}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="${esc(config.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${abs("/img/view-960.webp")}">
<link rel="icon" href="${href("/favicon.svg")}" type="image/svg+xml">
<link rel="alternate" type="application/json" href="${href("/apartments.json")}" title="Квартиры">
<link rel="alternate" type="text/plain" href="${href("/llms.txt")}" title="Описание для языковых моделей">
${prefetch}
<style>${css}</style>
${voice}
${jsonLd(graph)}
</head>`;
}

function bodyAttrs(home) {
  return `class="${home ? "home" : "page"}" data-module="${esc(config.bnovo.module)}" data-ym="${config.metrika.id}" data-widget="${home ? "1" : "0"}" data-widget-src="${esc(config.bnovo.widget)}" data-uid="${esc(config.bnovo.uid)}"`;
}

function shell({ title, description, path, main, graph, home = false }) {
  return `${head({ title, description, path, graph, home })}
<body ${bodyAttrs(home)}>
${header(path)}
${main}
${footer()}
<p id="live" class="live" aria-live="polite"></p>
<script>${client}</script>
<noscript><img src="https://mc.yandex.ru/watch/${config.metrika.id}" alt="" width="1" height="1" style="position:absolute;left:-9999px"></noscript>
</body>
</html>
`;
}

function homePage() {
  const facts = `рейтинг ${config.rating.value} · от ${rub(minPrice)} · заезд 24/7 без ключей · рядом набережная`;
  const photos = config.heroes.map((hero, index) => picture(hero.id, hero.alt, {
    priority: index === 0,
    sizes: index === 0 ? "(min-width: 900px) 56vw, 58vw" : "(min-width: 900px) 40vw, 40vw",
  })).join("");
  const voice = config.voiceSearch
    ? `<button class="voice" id="voice" type="button" title="Например: с 20 по 23 ноября, двое гостей">Сказать даты голосом</button>`
    : "";
  const main = `<main class="home-main" id="content">
<h1>${esc(config.home.h1)}</h1>
<p class="facts">${facts}</p>
<div class="offer-row">
<button class="offer" id="promo" type="button" data-code="${esc(config.promo.code)}">${esc(config.promo.label).replace(config.promo.code, `<strong>${esc(config.promo.code)}</strong>`)}</button>
${voice}
</div>
<p class="note">${esc(config.promo.note)}</p>
<div class="bn">
<div id="_bn_widget_adaptive"></div>
<form class="book" id="book-fallback" action="${esc(config.bnovo.module)}">
<label>Заезд <input type="date" name="dfrom" required autocomplete="off"></label>
<label>Выезд <input type="date" name="dto" required autocomplete="off"></label>
<label>Гости <input type="number" name="adults" min="1" max="6" value="2" inputmode="numeric" required></label>
<button class="find" id="find" type="submit">Найти</button>
</form>
</div>
<div class="photos">${photos}</div>
</main>`;
  return shell({
    title: config.home.title,
    description: config.home.description,
    path: "/",
    home: true,
    graph: [lodging(), ...apartments.map(apartmentNode)],
    main,
  });
}

function apartmentsPage() {
  const cards = apartments.map((item) => {
    const extra = item.extra ? `<li>${esc(item.extra)}</li>` : "";
    return `<article class="card" id="${item.id}">
${picture(item.photo, item.alt, { lazy: true, sizes: "(min-width: 640px) 168px, 100vw" })}
<div>
<h2>${esc(item.name)}</h2>
<p class="meta"><a href="${esc(item.map)}">${esc(address(item))}</a> · ${item.floor} этаж · ${area(item.area)} · ${esc(item.guestsLabel)}</p>
<p class="price">от ${rub(item.priceFrom)} в сутки</p>
<ul>
<li>Кровать king-size 180×200</li>
${extra}
<li>Интернет, Smart TV 50″, кухня, капсульная кофемашина</li>
<li>Стиральная машина, утюг, сатиновое бельё, чай и кофе</li>
</ul>
<a class="btn js-book" href="${esc(bookingUrl(item))}">Забронировать</a>
</div>
</article>`;
  }).join("\n");
  const main = `<main class="wrap" id="content">
<h1>Квартиры у Волги</h1>
<p class="lead">Восемь квартир в Самаре. Заезд с ${config.checkIn}, выезд до ${config.checkOut}, самостоятельный заезд 24/7. Прямое бронирование дешевле на 10% по промокоду ${esc(config.promo.code)}.</p>
${cards}
</main>`;
  return shell({
    title: "Квартиры посуточно у Волги — список | Matveev Apartments",
    description: `Квартиры Matveev Apartments в центре Самары: адреса, этаж, площадь и цена от ${rub(minPrice).replaceAll("\u00a0", " ")} в сутки.`,
    path: "/apartments/",
    graph: [lodging(), ...apartments.map(apartmentNode)],
    main,
  });
}

function termsPage() {
  const main = `<main class="wrap" id="content">
<h1>Условия и стандарты</h1>
<p class="lead">Одинаковые правила для всех квартир Matveev Apartments. Цена на сайте — «от», итог считает модуль бронирования после выбора дат.</p>
<section class="section">
<h2>Заезд и выезд</h2>
<p>Заезд с ${config.checkIn}, выезд до ${config.checkOut}. Самостоятельный заезд круглосуточно, без ключей у администратора: код и инструкция приходят после брони. <a href="${esc(config.youtubeCheckin)}">Видео, как заехать</a>.</p>
</section>
<section class="section">
<h2>От 5 ночей</h2>
<p>При проживании от 5 ночей — особые условия. Уборка и смена белья каждые 5 дней. Для командировки готовим закрывающие документы.</p>
</section>
<section class="section">
<h2>Прямое бронирование</h2>
<p>${esc(config.promo.label)}. Промокод вводят в модуле бронирования. Он действует на все номера и тарифы.</p>
</section>
<section class="section">
<h2>Семьи с детьми</h2>
<p>Все квартиры семейные. Гости спят на имеющихся местах: кровать king-size 180×200, а где указан диван или кресло — ещё и на нём. Дополнительное бельё на диван бесплатно по запросу.</p>
</section>
<section class="section">
<h2>Что есть в квартире</h2>
<ul>
<li>Интернет</li>
<li>Smart TV 50″</li>
<li>Кухня и капсульная кофемашина</li>
<li>Стиральная машина и утюг</li>
<li>Сатиновое бельё и косметика</li>
<li>Чай и кофе в подарок</li>
</ul>
</section>
<section class="section">
<h2>Для кого</h2>
<p>Отдых, командировка, романтический уикенд и семьи. У каждого дома есть бесплатная общественная парковка.</p>
</section>
</main>`;
  return shell({
    title: "Условия проживания | Matveev Apartments",
    description: "Заезд с 15:00, выезд до 12:00, самостоятельный заезд 24/7, уборка каждые 5 дней и документы для командировок.",
    path: "/terms/",
    graph: [lodging()],
    main,
  });
}

function faqPage() {
  const items = FAQ.map((item) => `<details>
<summary>${esc(item.q)}</summary>
<p>${esc(item.a)}</p>
</details>`).join("");
  const main = `<main class="wrap" id="content">
<h1>Вопросы и ответы</h1>
<div class="faq">${items}</div>
</main>`;
  const faqNode = {
    "@type": "FAQPage",
    "@id": `${base}/faq/#faq`,
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return shell({
    title: "Вопросы и ответы | Matveev Apartments",
    description: "Где квартиры Galaxy, Downtown, Center и City, есть ли парковка, можно ли с детьми и как забронировать.",
    path: "/faq/",
    graph: [lodging(), faqNode],
    main,
  });
}

function contactsPage() {
  const main = `<main class="wrap contacts" id="content">
<h1>Контакты</h1>
<p>Телефон: <a href="tel:${config.phoneTel}">${esc(config.phoneDisplay)}</a></p>
<p>WhatsApp: <a href="${config.whatsapp}">написать</a></p>
<p>Telegram: <a href="${config.telegram}">@Serg_1506</a></p>
<p>Почта: <a href="mailto:${config.email}">${esc(config.email)}</a></p>
<p>ВКонтакте: <a href="${config.vk}">vk.com/matveevapartments</a></p>
<p>Бронирование: <a class="js-book" href="${esc(config.bnovo.module)}">модуль Bnovo</a></p>
<h2>Реквизиты</h2>
<p>${esc(config.legalName)}</p>
<p>ОГРНИП ${esc(config.ogrnip)}</p>
<p>${esc(config.legalAddress)}</p>
<p><a href="${config.offerUrl}">Договор оферты</a> · <a href="${config.privacyUrl}">Политика обработки персональных данных</a></p>
<p class="fine">Машиночитаемые данные: <a href="${href("/apartments.json")}">apartments.json</a> и <a href="${href("/llms.txt")}">llms.txt</a>.</p>
</main>`;
  return shell({
    title: "Контакты | Matveev Apartments",
    description: "Телефон, WhatsApp, Telegram и почта Matveev Apartments в Самаре. ИП Матвеев С.Г.",
    path: "/contacts/",
    graph: [lodging()],
    main,
  });
}

function notFoundPage() {
  const main = `<main class="wrap" id="content">
<h1>Страница не найдена</h1>
<p class="lead">Такого адреса нет. Квартиры и бронирование — на главной.</p>
<p><a class="btn" href="${href("/")}">На главную</a></p>
</main>`;
  return shell({
    title: "Страница не найдена | Matveev Apartments",
    description: "Страница не найдена. Квартиры посуточно у Волги — Matveev Apartments, Самара.",
    path: "/404.html",
    graph: [lodging()],
    main,
  });
}

function publicData() {
  return {
    name: config.name,
    city: "Самара",
    currency: "RUB",
    priceFrom: minPrice,
    promoCode: config.promo.code,
    promo: config.promo.label,
    bookingUrl: config.bnovo.module,
    checkIn: config.checkIn,
    checkOut: config.checkOut,
    selfCheckIn: "24/7 без ключей",
    longStay: "При проживании от 5 ночей уборка и смена белья каждые 5 дней. От 5 ночей — особые условия и закрывающие документы для командировок.",
    phone: config.phoneTel,
    email: config.email,
    whatsapp: config.whatsapp,
    telegram: config.telegram,
    vk: config.vk,
    rating: Number(config.rating.value),
    reviewCount: Number(config.rating.count),
    apartments: apartments.map((item) => ({
      id: item.id,
      active: true,
      name: item.name,
      complex: item.complex,
      address: address(item),
      street: item.street,
      city: item.city,
      region: item.region,
      map: item.map,
      geo: { lat: item.lat, lng: item.lng },
      floor: item.floor,
      areaM2: item.area,
      guests: item.guests,
      extraGuests: item.extraGuests || 0,
      guestsLabel: item.guestsLabel,
      children: item.children,
      extra: item.extra || null,
      priceFrom: item.priceFrom,
      currency: "RUB",
      bookingUrl: bookingUrl(item),
      photo: abs(`/img/${item.photo}-960.webp`),
      amenities: amenities(item),
    })),
  };
}

function llmsText(data) {
  const lines = data.apartments.map((item) => {
    const extra = item.extra ? `, ${item.extra}` : "";
    return `- ${item.name}. ${item.address}, ${item.floor} этаж, ${String(item.areaM2).replace(".", ",")} м², ${item.guestsLabel}${extra}, от ${String(item.priceFrom).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽/сутки. Бронь: ${item.bookingUrl}. Карта: ${item.map}`;
  });
  return `# Matveev Apartments

> Дизайнерские квартиры посуточно в центре Самары у Волги и набережной. Рейтинг ${config.rating.value}, более ${config.rating.count} отзывов. Заезд с ${config.checkIn}, выезд до ${config.checkOut}, самостоятельный заезд 24/7 без ключей. Цены от ${String(minPrice).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽ за сутки. Прямое бронирование дешевле на 10% по промокоду ${config.promo.code}.

Сайт: ${base}/
Бронирование: ${config.bnovo.module}
Промокод: ${config.promo.code} (−10% на все номера и тарифы, гость вводит его в модуле)

## Квартиры

${lines.join("\n")}

## Правила

- Заезд с ${config.checkIn}, выезд до ${config.checkOut}.
- Самостоятельный заезд 24/7. Видео: ${config.youtubeCheckin}
- От 5 ночей: уборка и смена белья каждые 5 дней, особые условия, закрывающие документы для командировок.
- Можно с детьми, размещение на имеющихся спальных местах. Дополнительное бельё на диван бесплатно по запросу.
- Парковка: бесплатная общественная у каждого дома.
- В каждой квартире: интернет, Smart TV 50 дюймов, кухня, капсульная кофемашина, стиральная машина и утюг, сатиновое бельё, косметика, чай и кофе в подарок.
- Кровать king-size 180×200.

## Контакты

- Телефон: ${config.phoneDisplay}
- WhatsApp: ${config.whatsapp}
- Telegram: ${config.telegram}
- Почта: ${config.email}
- ВКонтакте: ${config.vk}
- ${config.legalName}, ОГРНИП ${config.ogrnip}, ${config.legalAddress}
- Оферта: ${config.offerUrl}
- Политика ПД: ${config.privacyUrl}

## Страницы

- [Главная](${base}/)
- [Квартиры](${base}/apartments/)
- [Условия](${base}/terms/)
- [Вопросы и ответы](${base}/faq/)
- [Контакты](${base}/contacts/)
- [Данные квартир](${base}/apartments.json)
`;
}

function sitemap() {
  const paths = ["/", "/apartments/", "/terms/", "/faq/", "/contacts/"];
  const urls = paths.map((path) => `  <url><loc>${abs(path)}</loc><lastmod>${config.updated}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const pages = {
  "index.html": homePage(),
  "apartments/index.html": apartmentsPage(),
  "terms/index.html": termsPage(),
  "faq/index.html": faqPage(),
  "contacts/index.html": contactsPage(),
  "404.html": notFoundPage(),
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const [file, html] of Object.entries(pages)) {
  const target = join(outDir, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

const data = publicData();
writeFileSync(join(outDir, "apartments.json"), JSON.stringify(data, null, 2) + "\n");
writeFileSync(join(outDir, "llms.txt"), llmsText(data));
writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
writeFileSync(join(outDir, "sitemap.xml"), sitemap());
writeFileSync(join(outDir, "CNAME"), "volga.matveevapartments.ru\n");
writeFileSync(join(outDir, ".nojekyll"), "");
writeFileSync(join(outDir, "favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#143f45"/><path d="M4 21c3.2-5 6.4-5 9.6 0s6.4 5 9.6 0 6.4-5 9.6 0" fill="none" stroke="#f3efe6" stroke-width="1.6"/><text x="16" y="16" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#f3efe6">M</text></svg>\n`);

mkdirSync(join(outDir, "img"), { recursive: true });
for (const name of readdirSync(join(root, "img"))) {
  if (/\.(avif|webp)$/.test(name)) cpSync(join(root, "img", name), join(outDir, "img", name));
}

const homeHtml = pages["index.html"];
const gzipBytes = gzipSync(homeHtml).length;
const ownJs = [...homeHtml.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .join("").length;
const homePhotos = ["view-960.avif", "galaxy-435-960.avif", "view-480.avif", "galaxy-435-480.avif"];
console.log(`активных квартир: ${apartments.length}`);
console.log(`главная gzip: ${(gzipBytes / 1024).toFixed(1)} КБ`);
console.log(`свой JS: ${(ownJs / 1024).toFixed(1)} КБ`);
if (gzipBytes > 30 * 1024) throw new Error(`Главная тяжелее бюджета: ${gzipBytes} байт gzip`);
if (ownJs > 5 * 1024) throw new Error(`Свой JS тяжелее бюджета: ${ownJs} байт`);
console.log("сборка готова:", outDir);
