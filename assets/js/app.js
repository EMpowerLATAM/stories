/* EMpower Stories of Change: reads the stories from the Google Sheet and renders the map, filters, cards and story dialog. */
(() => {
  const CFG = window.STORIES_CONFIG, I = window.I18N;

  const LANGS = ["en", "es", "pt", "hi", "tr", "id", "vi", "zh"];
  const LNAME = { en: "English", es: "Español", pt: "Português", hi: "हिन्दी", tr: "Türkçe", id: "Bahasa Indonesia", vi: "Tiếng Việt", zh: "中文" };
  const HTMLLANG = { en: "en", es: "es", pt: "pt-BR", hi: "hi", tr: "tr", id: "id", vi: "vi", zh: "zh-Hans" };
  const DIMS = ["Economic Well-Being", "Safe, Healthy Lives", "Inclusive Learning", "Capacity Strengthening", "Other Areas"];
  const REGIONS = ["Africa", "Asia", "Latam", "Turkey", "Europe", "USA", "Global"];
  const RCOL = { Africa: "#FC7366", Asia: "#A789E7", Latam: "#FFC955", Turkey: "#3FB8AF", Europe: "#8FB3E8", USA: "#F3EDE2", Global: "#F3EDE2" };
  // Country name in the sheet → [ISO 3166 alpha-2 (for translated names), numeric id (for the map), optional [lon, lat] marker]
  const COUNTRIES = {
    "Argentina": ["AR", "032"], "Armenia": ["AM", "051"], "Brazil": ["BR", "076"], "China": ["CN", "156"], "Colombia": ["CO", "170"],
    "Ghana": ["GH", "288"], "Hong Kong": ["HK", "344", [114.17, 22.32]], "India": ["IN", "356"], "Indonesia": ["ID", "360"],
    "Mexico": ["MX", "484"], "Nigeria": ["NG", "566"], "Peru": ["PE", "604"], "Philippines": ["PH", "608"], "Russia": ["RU", "643", [40, 55]],
    "South Africa": ["ZA", "710"], "Turkey": ["TR", "792"], "Ukraine": ["UA", "804"], "United Kingdom": ["GB", "826"], "Vietnam": ["VN", "704"],
    "Kenya": ["KE", "404"], "Uganda": ["UG", "800"], "Thailand": ["TH", "764"], "Nepal": ["NP", "524"], "Cameroon": ["CM", "120"],
    "Botswana": ["BW", "072"], "Georgia": ["GE", "268"], "Chile": ["CL", "152"], "Guatemala": ["GT", "320"], "United States": ["US", "840"]
  };
  // Sheet column for each language (the header starts with this text).
  const LCOL = { es: "Español", pt: "Português", hi: "हिन्दी", tr: "Türkçe", id: "Bahasa Indonesia", vi: "Tiếng Việt", zh: "中文" };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isPreview = new URLSearchParams(location.search).has("preview");

  let lang = "en";
  try { const saved = localStorage.getItem("stories-lang"); if (LANGS.includes(saved)) lang = saved; } catch (e) {}
  let D = [];
  const empty = () => ({ q: "", region: "", country: "", year: "", type: "", dims: [], subs: [] });
  let st = empty();

  // Texts: "Site texts" tab of the sheet first (language, then English), then the built-in defaults in i18n.js.
  let SHEET = {};
  const fromSheet = (k) => (SHEET[k] ? SHEET[k][lang] || SHEET[k].en || "" : undefined); // a row left empty hides that text
  const t = (k) => fromSheet(k) ?? I[lang]?.ui[k] ?? I.en.ui[k] ?? "";
  const tx = (group, k) => fromSheet(group + ":" + k) || I[lang]?.tax[group]?.[k] || I.en.tax[group]?.[k] || k;
  const nf = () => new Intl.NumberFormat(HTMLLANG[lang]);
  const nStories = (n) => (n === 1 ? t("result1") : t("results").replace("{n}", nf().format(n)));
  const dn = {};
  const cname = (s) => {
    const own = fromSheet("countries:" + s.country);
    if (own) return own;
    if (!s.iso) return s.country;
    try { return (dn[lang] ||= new Intl.DisplayNames([HTMLLANG[lang]], { type: "region" })).of(s.iso); } catch (e) { return s.country; }
  };
  const txt = (s) => (s.t[lang] ? s.t[lang] : s.t.en);
  const subsOf = (s) => DIMS.flatMap((d) => s.themes[d] || []);

  /* ---------- Data ---------- */

  // Minimal CSV parser (quoted fields, commas and line breaks inside quotes).
  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') q = false;
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  const clean = (v) => {
    v = (v || "").trim();
    return /^(#|Loading|Cargando)/i.test(v) ? "" : v; // skip formula errors and unfinished GOOGLETRANSLATE results
  };

  function toStories(rows) {
    const head = rows[0].map((h) => h.trim());
    const col = (name) => head.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
    const C = {
      id: col("Story ID"), status: col("Status"), year: head.findIndex((h) => h.toLowerCase() === "year"), date: col("Approved At"), country: col("Program Org Geo Country"), org: col("Program Org Name"),
      region: col("Region"), type: col("Story type"), title: col("Title (for web)"),
      story: col("Polished story"), quote: col("Highlight quote"), photo1: col("Photo 1"), photo2: col("Photo 2"), video: col("Video")
    };
    const dimCol = Object.fromEntries(DIMS.map((d) => [d, col(d)]));
    const langCol = Object.fromEntries(Object.entries(LCOL).map(([L, name]) => [L, [col("Title – " + name), col("Story – " + name)]]));
    const show = new Set(CFG.publish.concat(isPreview ? CFG.preview : []));
    const get = (r, i) => (i > -1 ? clean(r[i]) : "");

    return rows.slice(1).map((r) => {
      const s = { id: get(r, C.id), status: get(r, C.status), title: get(r, C.title), story: get(r, C.story) };
      if (!s.id || !s.title || !s.story || !show.has(s.status)) return null;
      const c = COUNTRIES[get(r, C.country)] || [];
      const t = { en: { title: s.title, story: s.story } };
      for (const L in langCol) {
        const [ti, si] = langCol[L], title = get(r, ti), story = get(r, si);
        if (title && story) t[L] = { title, story };
      }
      const themes = {};
      DIMS.forEach((d) => { const v = get(r, dimCol[d]); if (v) themes[d] = v.split(/\s*,\s*/).filter(Boolean); });
      const year = ((get(r, C.year) || get(r, C.date)).match(/(?:19|20)\d{2}/) || [""])[0];
      return {
        id: s.id, t, themes, year, country: get(r, C.country), iso: c[0], num: c[1], ll: c[2], org: get(r, C.org),
        region: get(r, C.region) || "Global", type: get(r, C.type), quote: get(r, C.quote),
        photos: [get(r, C.photo1), get(r, C.photo2)].filter(Boolean), video: get(r, C.video)
      };
    }).filter(Boolean);
  }

  const sheetCSV = (name) =>
    fetch("https://docs.google.com/spreadsheets/d/" + CFG.sheetId + "/gviz/tq?tqx=out:csv&headers=1&sheet=" + encodeURIComponent(name))
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(parseCSV);
  const loadStories = () => sheetCSV(CFG.sheetName).then(toStories);

  // "Site texts" tab: one row per text, column "key" plus one column per language code (en, es, pt…).
  function loadTexts() {
    if (!CFG.textsSheet) return Promise.resolve({});
    return sheetCSV(CFG.textsSheet).then((rows) => {
      const head = rows[0].map((h) => h.trim().toLowerCase()), ki = head.indexOf("key"), out = {};
      if (ki < 0) return out;
      rows.slice(1).forEach((r) => {
        const k = (r[ki] || "").trim();
        if (!k) return;
        out[k] = {};
        LANGS.forEach((L) => { const i = head.indexOf(L), v = i > -1 ? (r[i] || "").trim() : ""; if (v) out[k][L] = v; });
      });
      return out;
    }).catch((e) => { console.warn("Site texts not loaded, using defaults", e); return {}; });
  }

  /* ---------- Media links ---------- */

  const driveId = (u) => (u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/) || [])[1];
  const imgSrc = (u) => { const id = driveId(u); return id ? "https://drive.google.com/thumbnail?id=" + id + "&sz=w1200" : u; };
  function videoEmbed(u) {
    const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
    if (yt) return "https://www.youtube-nocookie.com/embed/" + yt[1];
    const vm = u.match(/vimeo\.com\/(\d+)/);
    if (vm) return "https://player.vimeo.com/video/" + vm[1];
    const id = driveId(u);
    return id ? "https://drive.google.com/file/d/" + id + "/preview" : "";
  }

  /* ---------- Static texts and language ---------- */

  function applyStatic() {
    document.documentElement.lang = HTMLLANG[lang];
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $("q").placeholder = t("search");
    document.title = t("page_title");
    document.querySelector('meta[name="description"]').content = t("page_description");
    document.querySelectorAll("[data-href]").forEach((a) => { const u = t(a.dataset.href); if (u) a.href = u; a.hidden = !u; });
    $("preview").hidden = !isPreview;
    $("langs").innerHTML = LANGS.map((L) => `<button type="button" data-lang="${L}" lang="${HTMLLANG[L]}" title="${LNAME[L]}" aria-label="${LNAME[L]}" aria-pressed="${L === lang}">${L.toUpperCase()}</button>`).join("");
    $("lang-select").innerHTML = LANGS.map((L) => `<option value="${L}"${L === lang ? " selected" : ""}>${LNAME[L]}</option>`).join("");
  }

  function setLang(L) {
    lang = L;
    try { localStorage.setItem("stories-lang", L); } catch (e) {}
    applyStatic(); stats(); fillFilters(); render(true); labelBubbles();
    if (openId) openStory(openId, true);
  }

  function stats() {
    const uniq = (k) => new Set(D.map((s) => s[k])).size;
    // A number typed in "Site texts" (num_…) replaces the automatic count; an empty label hides the figure.
    $("stats").innerHTML = [["stories", D.length], ["countries", uniq("country")], ["orgs", uniq("org")], ["regions", uniq("region")]]
      .filter(([k]) => t("s_" + k))
      .map(([k, n]) => `<div class="stat"><b>${esc(t("num_" + k) || nf().format(n))}</b><span>${esc(t("s_" + k))}</span></div>`).join("");
  }

  /* ---------- Filters ---------- */

  function matches(s, skip) {
    for (const k of ["region", "country", "year", "type"]) if (skip !== k && st[k] && s[k] !== st[k]) return false;
    if (skip !== "dims" && st.dims.length && !st.dims.some((d) => s.themes[d])) return false;
    if (skip !== "subs" && st.subs.length && !st.subs.some((x) => subsOf(s).includes(x))) return false;
    if (st.q) {
      const x = txt(s), hay = [x.title, x.story, s.t.en.title, s.org, s.country, cname(s)].join(" ").toLowerCase();
      if (st.q.toLowerCase().split(/\s+/).some((w) => w && !hay.includes(w))) return false;
    }
    return true;
  }
  function countBy(skip, fn) {
    const m = {};
    D.filter((s) => matches(s, skip)).forEach((s) => [].concat(fn(s)).forEach((v) => { m[v] = (m[v] || 0) + 1; }));
    return m;
  }

  function fillFilters() {
    const byCountry = Object.fromEntries(D.map((s) => [s.country, s]));
    const defs = {
      region: ["all_regions", (v) => tx("regions", v), REGIONS],
      country: ["all_countries", (v) => cname(byCountry[v])],
      year: ["all_years", (v) => v, [...new Set(D.map((s) => s.year))].filter(Boolean).sort().reverse()],
      type: ["all_types", (v) => tx("types", v)]
    };
    for (const key in defs) {
      const [allKey, label, order] = defs[key], m = countBy(key, (s) => s[key]);
      let vals = order ? order.filter((v) => m[v]) : Object.keys(m).filter(Boolean).sort((a, b) => label(a).localeCompare(label(b), HTMLLANG[lang]));
      if (st[key] && !vals.includes(st[key])) vals.unshift(st[key]);
      $("f-" + key).innerHTML = `<option value="">${esc(t(allKey))}</option>` +
        vals.map((v) => `<option value="${esc(v)}"${st[key] === v ? " selected" : ""}>${esc(label(v))} (${m[v] || 0})</option>`).join("");
    }
    const dm = countBy("dims", (s) => Object.keys(s.themes));
    $("dims").innerHTML = DIMS.filter((d) => dm[d] || st.dims.includes(d))
      .map((d) => `<button type="button" class="chip" data-dim="${esc(d)}" aria-pressed="${st.dims.includes(d)}">${esc(tx("dims", d))} <span class="n">${dm[d] || 0}</span></button>`).join("");
    const sm = countBy("subs", subsOf);
    const subs = [...new Set(st.dims.flatMap((d) => D.flatMap((s) => s.themes[d] || [])))];
    $("subs").innerHTML = subs.map((x) => `<button type="button" class="chip sub" data-sub="${esc(x)}" aria-pressed="${st.subs.includes(x)}">${esc(tx("subs", x))} <span class="n">${sm[x] || 0}</span></button>`).join("");
  }

  /* ---------- Cards ---------- */

  function card(s, i) {
    const x = txt(s), first = x.story.split(/\n\s*\n/)[0];
    const ex = first.length > 200 ? first.slice(0, 195).replace(/\s+\S*$/, "") + "…" : first;
    const tags = subsOf(s).slice(0, 3).map((v) => `<span class="tag">${esc(tx("subs", v))}</span>`).join("");
    const img = s.photos[0] ? `<img src="${esc(imgSrc(s.photos[0]))}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `<button type="button" class="card${i === 0 ? " feat" : ""}" data-id="${esc(s.id)}" style="--c:${RCOL[s.region] || RCOL.Global}">${img}
      <span class="meta"><span>${esc(cname(s))}</span><span>${esc(tx("types", s.type))}</span>${s.year ? `<span>${s.year}</span>` : ""}</span>
      <h3>${esc(x.title)}</h3><p>${esc(ex)}</p><span class="tags">${tags}</span>
      <span class="more">${esc(t("read"))} →</span></button>`;
  }

  const PAGE = 24;
  let shown = PAGE;
  function render(keepPage) {
    if (!keepPage) shown = PAGE;
    const list = D.filter((s) => matches(s));
    $("count").textContent = nStories(list.length);
    const any = st.q || st.region || st.country || st.year || st.type || st.dims.length || st.subs.length;
    $("clear").style.visibility = any ? "visible" : "hidden";
    $("grid").innerHTML = list.length ? list.slice(0, shown).map(card).join("") : `<p class="empty">${esc(t("none"))}</p>`;
    $("more").hidden = list.length <= shown;
    if (window.d3) d3.selectAll(".bub").classed("on", (p) => st.country === p.country);
  }

  /* ---------- Story dialog ---------- */

  let openId = null, lastFocus = null;
  function openStory(id, keep) {
    const s = D.find((o) => o.id === id);
    if (!s) return;
    openId = id;
    const x = txt(s), translated = lang === "en" || !!s.t[lang];
    const themes = DIMS.filter((d) => s.themes[d]).map((d) => tx("dims", d) + ": " + s.themes[d].map((v) => tx("subs", v)).join(", ")).join(" · ");
    const paras = x.story.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join("");
    const emb = s.video ? videoEmbed(s.video) : "";
    const media = s.photos.map((p) => `<img src="${esc(imgSrc(p))}" alt="${esc(t("photo"))}" loading="lazy" onerror="this.remove()">`).join("") +
      (emb ? `<iframe src="${esc(emb)}" title="${esc(t("watch"))}" allow="fullscreen; picture-in-picture" loading="lazy"></iframe>` : "");
    const body = $("dlg-body");
    body.style.setProperty("--c", RCOL[s.region] || RCOL.Global);
    body.innerHTML = `<button class="x" type="button" data-close aria-label="${esc(t("close"))}">×</button>
      <span class="meta">${esc(cname(s))} · ${esc(tx("regions", s.region))} · ${esc(tx("types", s.type))}</span>
      <h2 id="dlg-title">${esc(x.title)}</h2>
      ${translated ? "" : `<p class="note">${esc(t("fallback"))}</p>`}
      ${media ? `<div class="media">${media}</div>` : ""}
      ${s.quote && lang === "en" ? `<blockquote>${esc(s.quote)}</blockquote>` : ""}
      <div class="story" lang="${translated ? HTMLLANG[lang] : "en"}">${paras}</div>
      ${s.video && !emb ? `<p><a href="${esc(s.video)}" target="_blank" rel="noopener">${esc(t("watch"))} ↗</a></p>` : ""}
      <dl><dt>${esc(t("partner"))}</dt><dd>${esc(s.org)}</dd>${s.year ? `<dt>${esc(t("f_year"))}</dt><dd>${s.year}</dd>` : ""}${themes ? `<dt>${esc(t("themes"))}</dt><dd>${esc(themes)}</dd>` : ""}</dl>
      <div class="actions"><button class="btn" type="button" id="share">${esc(t("share"))}</button><button class="btn primary" type="button" data-close>${esc(t("close"))}</button></div>`;
    $("share").onclick = (e) => {
      const b = e.currentTarget, url = location.href.split("#")[0] + "#story-" + s.id;
      navigator.clipboard?.writeText(url).then(() => { b.textContent = t("copied"); }, () => { b.textContent = url; });
    };
    if (!keep) {
      lastFocus = document.activeElement;
      if (!$("dlg").open) $("dlg").showModal();
      history.replaceState(null, "", "#story-" + s.id);
    }
  }

  /* ---------- Map ---------- */

  function drawMap(world) {
    const W = 900, H = 470, svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`);
    const land = topojson.feature(world, world.objects.countries);
    land.features = land.features.filter((f) => f.properties.name !== "Antarctica");
    const proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], land), path = d3.geoPath(proj);
    const nums = new Set(D.map((s) => s.num));
    svg.append("g").selectAll("path").data(land.features).join("path").attr("d", path).attr("class", (f) => "land" + (nums.has(f.id) ? " has" : ""));

    const by = {};
    D.forEach((s) => { if (s.num) (by[s.country] ||= { ...s, n: 0 }).n++; });
    const pts = Object.values(by).map((p) => {
      const f = land.features.find((x) => x.id === p.num), ll = p.ll || (f && d3.geoCentroid(f));
      return { ...p, xy: ll && proj(ll) };
    }).filter((p) => p.xy).sort((a, b) => b.n - a.n);
    const r = d3.scaleSqrt().domain([1, d3.max(pts, (p) => p.n) || 1]).range([6, 26]);
    const tip = $("tip"), wrap = $("map-wrap");

    svg.append("g").selectAll("circle").data(pts).join("circle")
      .attr("class", "bub").attr("cx", (p) => p.xy[0]).attr("cy", (p) => p.xy[1]).attr("r", (p) => r(p.n))
      .style("--c", (p) => RCOL[p.region] || RCOL.Global).attr("tabindex", 0).attr("role", "button")
      .on("mouseenter focus", function (ev, p) {
        const b = wrap.getBoundingClientRect(), c = this.getBoundingClientRect();
        tip.textContent = cname(p) + " · " + nStories(p.n);
        tip.style.left = c.left - b.left + c.width / 2 - tip.offsetWidth / 2 + "px";
        tip.style.top = c.top - b.top - 40 + "px";
        tip.classList.add("show");
      })
      .on("mouseleave blur", () => tip.classList.remove("show"))
      .on("click keydown", (ev, p) => {
        if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        st.country = st.country === p.country ? "" : p.country; st.region = "";
        fillFilters(); render(); $("stories").scrollIntoView();
      });
    labelBubbles();
  }
  const labelBubbles = () => window.d3 && d3.selectAll(".bub").attr("aria-label", (p) => cname(p) + ": " + nStories(p.n));

  /* ---------- Events ---------- */

  $("langs").addEventListener("click", (e) => { const b = e.target.closest("[data-lang]"); if (b) setLang(b.dataset.lang); });
  $("lang-select").addEventListener("change", (e) => setLang(e.target.value));
  $("grid").addEventListener("click", (e) => { const c = e.target.closest(".card"); if (c) openStory(c.dataset.id); });
  $("dims").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dim]"); if (!b) return;
    const d = b.dataset.dim;
    st.dims = st.dims.includes(d) ? st.dims.filter((x) => x !== d) : st.dims.concat(d);
    const allowed = new Set(st.dims.flatMap((dd) => D.flatMap((s) => s.themes[dd] || [])));
    st.subs = st.subs.filter((x) => allowed.has(x));
    fillFilters(); render();
  });
  $("subs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sub]"); if (!b) return;
    const x = b.dataset.sub;
    st.subs = st.subs.includes(x) ? st.subs.filter((v) => v !== x) : st.subs.concat(x);
    fillFilters(); render();
  });
  document.querySelectorAll("select[data-key]").forEach((el) => el.addEventListener("change", () => {
    st[el.dataset.key] = el.value;
    if (el.dataset.key === "region") st.country = "";
    fillFilters(); render();
  }));
  let qt;
  $("q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value.trim(); fillFilters(); render(); }, 150); });
  $("more").addEventListener("click", () => { shown += PAGE; render(true); });
  $("clear").addEventListener("click", () => { st = empty(); $("q").value = ""; fillFilters(); render(); });
  $("dlg").addEventListener("click", (e) => { if (e.target === $("dlg") || e.target.closest("[data-close]")) $("dlg").close(); });
  $("dlg").addEventListener("close", () => { openId = null; history.replaceState(null, "", location.pathname + location.search); lastFocus?.focus(); });
  const route = () => { if (location.hash.startsWith("#story-")) openStory(location.hash.slice(7)); };
  window.addEventListener("hashchange", route);

  /* ---------- Start ---------- */

  applyStatic();
  Promise.all([loadStories(), loadTexts(), fetch("assets/data/world-110m.json").then((r) => r.json()).catch(() => null)])
    .then(([stories, texts, world]) => {
      D = stories; SHEET = texts;
      applyStatic();
      stats(); fillFilters(); render();
      try { if (world && window.d3 && window.topojson) drawMap(world); else $("map-wrap").hidden = true; } catch (e) { $("map-wrap").hidden = true; console.warn(e); }
      route();
    })
    .catch((e) => { $("grid").innerHTML = `<p class="empty">${esc(t("error"))}</p>`; console.warn(e); });
})();
