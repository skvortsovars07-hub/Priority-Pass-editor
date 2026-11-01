const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PIXEL_RATIO = 3;
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

const TITLES = ["Mr", "Ms"];
const TYPED_TITLE = /^(mr|mrs|ms|miss|mstr|dr)\b/i;
const CARD_WIDTH = 390;

const state = {
  guestCount: 1,
  guests: [{ title: "", name: "" }],
  membership: "",
  validFrom: "",
  validUntil: "",
  untilManual: false,
  qrDataUrl: "",
  qrPayload: "",
};

const els = {
  tariffs: document.getElementById("tariffs"),
  guests: document.getElementById("guests"),
  membership: document.getElementById("membership"),
  validFrom: document.getElementById("validFrom"),
  validUntil: document.getElementById("validUntil"),
  dropzone: document.getElementById("dropzone"),
  qrFile: document.getElementById("qrFile"),
  qrStatus: document.getElementById("qrStatus"),
  downloadBtn: document.getElementById("downloadBtn"),
  downloadPngBtn: document.getElementById("downloadPngBtn"),
  shareBtn: document.getElementById("shareBtn"),
  actionStatus: document.getElementById("actionStatus"),
  resetBtn: document.getElementById("resetBtn"),
  cardWrap: document.getElementById("cardWrap"),
  cardScale: document.getElementById("cardScale"),
  card: document.getElementById("card"),
  cardQr: document.getElementById("cardQr"),
  cardNames: document.getElementById("cardNames"),
  cardNumber: document.getElementById("cardNumber"),
  cardFrom: document.getElementById("cardFrom"),
  cardUntil: document.getElementById("cardUntil"),
};

function mskNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function addDaysISO(iso, days) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

function formatCardDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function syncUntilFromFrom() {
  if (state.untilManual || !state.validFrom) return;
  state.validUntil = addDaysISO(state.validFrom, 2);
  els.validUntil.value = state.validUntil;
}

function setGuestCount(count) {
  state.guestCount = count;
  const next = state.guests.slice(0, count);
  while (next.length < count) next.push({ title: "", name: "" });
  state.guests = next;
  [...els.tariffs.querySelectorAll(".tariff")].forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.guests) === count);
  });
  renderGuestFields();
  renderCard();
}

function hasTypedTitle(name) {
  return TYPED_TITLE.test(name.trim());
}

function guestFullName(guest) {
  const name = guest.name.trim().replaceAll(/\s+/g, " ");
  if (!name) return "";
  if (hasTypedTitle(name)) return name;
  return guest.title ? `${guest.title} ${name}` : name;
}

function guestNeedsTitle(guest) {
  return Boolean(guest.name.trim()) && !hasTypedTitle(guest.name) && !guest.title;
}

function refreshTitleRow(row, guest) {
  const typed = hasTypedTitle(guest.name);
  row.querySelector(".title-pick").hidden = typed;
  row.classList.remove("needs-title");
  row.querySelectorAll(".title-opt").forEach((btn) => {
    const on = btn.dataset.title === guest.title;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function renderGuestFields() {
  els.guests.innerHTML = "";
  state.guests.forEach((guest, i) => {
    const row = document.createElement("div");
    row.className = "guest-row";
    row.innerHTML = `
      <span class="guest-index">${i + 1}</span>
      <input type="text" value="${escapeAttr(guest.name)}" placeholder="${placeholderFor(i)}" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="next">
      <button class="icon-btn" type="button" aria-label="Удалить" ${state.guestCount === 1 ? "disabled" : ""}>×</button>
      <div class="title-pick" role="group" aria-label="Обращение">
        ${TITLES.map((t) => `<button type="button" class="title-opt" data-title="${t}" aria-pressed="false">${t}</button>`).join("")}
      </div>
    `;
    const input = row.querySelector("input");
    const remove = row.querySelector(".icon-btn");
    input.addEventListener("input", () => {
      guest.name = input.value;
      refreshTitleRow(row, guest);
      renderCard();
    });
    row.querySelector(".title-pick").addEventListener("click", (e) => {
      const btn = e.target.closest(".title-opt");
      if (!btn) return;
      guest.title = btn.dataset.title;
      refreshTitleRow(row, guest);
      renderCard();
    });
    remove.addEventListener("click", () => {
      if (state.guestCount === 1) return;
      state.guests.splice(i, 1);
      setGuestCount(state.guests.length);
    });
    refreshTitleRow(row, guest);
    els.guests.appendChild(row);
  });
}

function placeholderFor(i) {
  const samples = [
    "Ivan Petrov",
    "Anna Petrova",
    "Pavel Ivanov",
    "Olga Sokolova",
    "Alex Smirnov",
    "Elena Volkova",
  ];
  return samples[i] || "Guest Name";
}

// Показываем, чего не хватает: гости без обращения подсвечиваются, и мы возвращаем текст ошибки.
function validateGuests() {
  const rows = [...els.guests.querySelectorAll(".guest-row")];
  const filled = state.guests.filter((g) => g.name.trim());
  rows.forEach((row, i) => row.classList.toggle("needs-title", guestNeedsTitle(state.guests[i])));
  if (!filled.length) return "Впишите имя хотя бы одного гостя";
  if (state.guests.some(guestNeedsTitle)) return "Выберите Mr или Ms у каждого гостя";
  return "";
}

function escapeAttr(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderCard() {
  const names = state.guests.map(guestFullName).filter(Boolean);
  const shown = names.length ? names : ["Member Name"];
  els.cardNames.dataset.count = String(shown.length);
  els.cardNames.innerHTML = shown
    .map((name) => `<div class="card-name">${escapeHtml(name)}</div>`)
    .join("");

  els.cardNumber.textContent = state.membership.trim() || "—";
  els.cardFrom.textContent = formatCardDate(state.validFrom);
  els.cardUntil.textContent = formatCardDate(state.validUntil);

  if (state.qrDataUrl) {
    els.cardQr.innerHTML = `<img alt="QR" src="${state.qrDataUrl}">`;
  } else {
    els.cardQr.innerHTML = `<div class="card-qr-placeholder">QR</div>`;
  }
  fitCard();
  scheduleExport();
}

// На узких экранах карту уменьшаем только для показа: сама она всегда 390px, в файл уходит без масштаба.
function fitCard() {
  const avail = els.cardWrap.parentElement.clientWidth - 32;
  const scale = Math.min(1, avail / CARD_WIDTH);
  els.cardScale.style.transform = scale < 1 ? `scale(${scale})` : "";
  els.cardWrap.style.width = `${CARD_WIDTH * scale}px`;
  els.cardWrap.style.height = `${els.card.offsetHeight * scale}px`;
}

function setStatus(text, kind) {
  els.qrStatus.textContent = text;
  els.qrStatus.className = `qr-status ${kind || ""}`;
}

function setMembership(num) {
  const clean = String(num || "").replaceAll(/\D/g, "");
  if (!clean) return false;
  state.membership = clean;
  els.membership.value = clean;
  renderCard();
  return true;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    img.src = src;
  });
}

function drawToCanvas(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, scale };
}

function detectQr(img) {
  const attempts = [1600, 1100, 800, 560, img.width];
  for (const side of attempts) {
    const { canvas, ctx, scale } = drawToCanvas(img, side);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height, {
      inversionAttempts: "attemptBoth",
    });
    if (code && code.location) return { code, scale };
  }
  return null;
}

function binarize(ctx, side) {
  const img = ctx.getImageData(0, 0, side, side);
  const d = img.data;
  let sum = 0;
  const n = side * side;
  for (let i = 0; i < d.length; i += 4) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const mean = sum / n;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < mean ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function cropQr(img, detection) {
  const { code, scale } = detection;
  const loc = code.location;
  const pts = [loc.topLeftCorner, loc.topRightCorner, loc.bottomLeftCorner, loc.bottomRightCorner];
  const xs = pts.map((p) => p.x / scale);
  const ys = pts.map((p) => p.y / scale);
  const boxW = Math.max(...xs) - Math.min(...xs);
  const boxH = Math.max(...ys) - Math.min(...ys);
  const pad = Math.max(boxW, boxH) * 0.12;
  const x = Math.max(0, Math.min(...xs) - pad);
  const y = Math.max(0, Math.min(...ys) - pad);
  const w = Math.min(img.width - x, boxW + pad * 2);
  const h = Math.min(img.height - y, boxH + pad * 2);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 512, 512);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h, 0, 0, 512, 512);
  binarize(ctx, 512);
  return canvas.toDataURL("image/png");
}

function textRegionCanvas(img, detection) {
  let x = 0;
  let y = Math.round(img.height * 0.42);
  let w = img.width;
  let h = Math.round(img.height * 0.48);
  if (detection) {
    const ys = [
      detection.code.location.topLeftCorner.y,
      detection.code.location.topRightCorner.y,
      detection.code.location.bottomLeftCorner.y,
      detection.code.location.bottomRightCorner.y,
    ].map((v) => v / detection.scale);
    y = Math.min(img.height - 40, Math.round(Math.max(...ys) + 16));
    h = Math.max(80, img.height - y - Math.round(img.height * 0.08));
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas;
}

function pickMembership(text, qrPayload) {
  const sources = `${text || ""}\n${qrPayload || ""}`;
  const labeled = sources.match(/Membership\s*Number[\s\S]{0,40}?(\d{8,12})/i);
  if (labeled) return labeled[1];

  const tens = [...sources.matchAll(/\b(\d{10})\b/g)]
    .map((m) => m[1])
    .filter((n) => !/^20\d{8}$/.test(n));
  if (tens.length) return tens[0];

  const fromQr = String(qrPayload || "").match(/(\d{10,12})/);
  if (fromQr) return fromQr[1];

  const any = sources.match(/\b(\d{8,12})\b/);
  return any ? any[1] : "";
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = resolve;
    el.onerror = () => reject(new Error("Не удалось загрузить распознавание текста"));
    document.head.appendChild(el);
  });
}

async function ocrMembership(img, detection, qrPayload) {
  const fromPayload = pickMembership("", qrPayload);
  try {
    await loadScript(TESSERACT_SRC);
    const worker = await Tesseract.createWorker("eng", 1, { logger: () => {} });
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ",
    });
    const region = textRegionCanvas(img, detection);
    const { data: regionData } = await worker.recognize(region);
    let num = pickMembership(regionData.text, qrPayload);
    if (!num) {
      const { data: fullData } = await worker.recognize(img);
      num = pickMembership(fullData.text, qrPayload);
    }
    await worker.terminate();
    return num || fromPayload;
  } catch {
    return fromPayload;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

async function applyQrFromFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Нужен файл изображения", "err");
    return;
  }
  setStatus("Ищу QR на скрине…");
  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const found = detectQr(img);
    if (found) {
      state.qrPayload = found.code.data || "";
      state.qrDataUrl = cropQr(img, found);
    } else {
      state.qrPayload = "";
      state.qrDataUrl = await fileToDataUrl(file);
    }
    renderCard();

    const fromQr = pickMembership("", state.qrPayload);
    if (fromQr) setMembership(fromQr);

    let number = fromQr;
    if (!number || number.length < 8) {
      setStatus("Читаю Membership Number со скрина…");
      number = await ocrMembership(img, found, state.qrPayload);
      setMembership(number);
    }

    if (number) {
      setStatus(
        found
          ? `QR и номер ${number} сняты со скрина. Обрезать пиксель в пиксель не нужно.`
          : `Номер ${number} прочитан, QR как картинка. Если не сканируется — дайте более чёткий скрин.`,
        found ? "ok" : "warn"
      );
    } else {
      setStatus(
        found
          ? "QR поставлен. Номер со скрина не прочитался — впишите вручную."
          : "Код не распознался — поставил картинку как есть. Номер тоже впишите вручную.",
        "warn"
      );
    }
  } catch (err) {
    setStatus(err.message || "Ошибка чтения файла", "err");
  } finally {
    URL.revokeObjectURL(src);
  }
}

function pdfFileName() {
  const num = state.membership.trim();
  return num ? `Priority Pass ${num}.pdf` : "Priority Pass.pdf";
}

function bytesToPdfAscii(u8) {
  const chunk = 0x8000;
  let out = "";
  for (let i = 0; i < u8.length; i += chunk) {
    out += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return out;
}

function jpegToPdfBlob(jpegDataUrl, widthPx, heightPx) {
  const raw = atob(jpegDataUrl.split(",")[1]);
  const jpeg = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) jpeg[i] = raw.charCodeAt(i);

  const widthPt = +(widthPx * 72 / (96 * PIXEL_RATIO)).toFixed(2);
  const heightPt = +(heightPx * 72 / (96 * PIXEL_RATIO)).toFixed(2);
  const jpegStr = bytesToPdfAscii(jpeg);
  const content = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im0 Do Q`;

  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpegStr}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
  return new Blob([bytes], { type: "application/pdf" });
}

function clickDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;

function canShareFiles() {
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return Boolean(navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

const SHARE_MODE = IS_TOUCH && canShareFiles();

function setActionStatus(text, kind) {
  els.actionStatus.textContent = text;
  els.actionStatus.className = `action-status ${kind || ""}`;
}

// Файлы готовим заранее, пока человек вводит данные: iOS разрешает открыть меню «Поделиться»
// только сразу после нажатия, ждать отрисовку карты к этому моменту уже поздно.
let exportReady = null;
let exportJob = null;
let exportTimer = 0;
let exportVersion = 0;
let exportWarm = false;

function scheduleExport() {
  exportVersion += 1;
  exportReady = null;
  clearTimeout(exportTimer);
  exportTimer = setTimeout(() => ensureExport().catch(() => {}), 450);
}

async function buildExport(version) {
  await document.fonts.ready;
  const opts = { pixelRatio: PIXEL_RATIO, backgroundColor: "#ffffff", cacheBust: true };
  if (!exportWarm) {
    // Safari в первый раз часто рисует карту без картинок, поэтому делаем один пробный проход.
    exportWarm = true;
    await htmlToImage.toCanvas(els.card, opts).catch(() => {});
  }
  const shot = await htmlToImage.toCanvas(els.card, opts);
  const canvas = document.createElement("canvas");
  canvas.width = shot.width;
  canvas.height = shot.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(shot, 0, 0);

  const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const pdf = jpegToPdfBlob(canvas.toDataURL("image/jpeg", 0.95), canvas.width, canvas.height);
  const result = { png, pdf };
  if (version === exportVersion) exportReady = result;
  return result;
}

function ensureExport() {
  if (exportReady) return Promise.resolve(exportReady);
  clearTimeout(exportTimer);
  if (!exportJob || exportJob.version !== exportVersion) {
    exportJob = { version: exportVersion, promise: buildExport(exportVersion) };
  }
  return exportJob.promise;
}

async function deliver(kind, { share }) {
  const problem = validateGuests();
  if (problem) {
    setActionStatus(problem, "err");
    return;
  }
  setActionStatus("");
  const buttons = [els.shareBtn, els.downloadBtn, els.downloadPngBtn];
  buttons.forEach((b) => (b.disabled = true));
  try {
    // Если файлы уже готовы, до share() не должно быть ни одного await — иначе iOS потеряет «нажатие».
    if (!exportReady) setActionStatus("Готовлю файл…");
    const ready = exportReady || (await ensureExport());
    setActionStatus("");
    const isPdf = kind === "pdf";
    const name = isPdf ? pdfFileName() : pdfFileName().replace(/\.pdf$/i, ".png");
    const blob = isPdf ? ready.pdf : ready.png;
    const file = new File([blob], name, { type: blob.type });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    clickDownload(file, name);
  } catch (err) {
    setActionStatus("Не удалось сохранить файл", "err");
    console.error(err);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

function applyMskDefaults() {
  const now = mskNow();
  state.validFrom = now.date;
  state.untilManual = false;
  els.validFrom.value = now.date;
  syncUntilFromFrom();
}

function resetAll() {
  state.guests = [{ title: "", name: "" }];
  state.membership = "";
  state.qrDataUrl = "";
  state.qrPayload = "";
  els.membership.value = "";
  applyMskDefaults();
  setStatus("");
  setActionStatus("");
  setGuestCount(1);
}

els.tariffs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tariff");
  if (!btn) return;
  setGuestCount(Number(btn.dataset.guests));
});

els.membership.addEventListener("input", () => {
  state.membership = els.membership.value.replaceAll(/\D/g, "");
  els.membership.value = state.membership;
  renderCard();
});

els.validFrom.addEventListener("input", () => {
  state.validFrom = els.validFrom.value;
  syncUntilFromFrom();
  renderCard();
});

els.validUntil.addEventListener("input", () => {
  state.untilManual = true;
  state.validUntil = els.validUntil.value;
  renderCard();
});

els.dropzone.addEventListener("click", () => els.qrFile.click());
els.qrFile.addEventListener("change", () => {
  const file = els.qrFile.files[0];
  if (file) applyQrFromFile(file);
});

["dragenter", "dragover"].forEach((type) => {
  els.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropzone.classList.add("is-over");
  });
});

["dragleave", "drop"].forEach((type) => {
  els.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("is-over");
  });
});

els.dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) applyQrFromFile(file);
});

document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (!item) return;
  applyQrFromFile(item.getAsFile());
});

els.shareBtn.addEventListener("click", () => deliver("png", { share: true }));
els.downloadBtn.addEventListener("click", () => deliver("pdf", { share: SHARE_MODE }));
els.downloadPngBtn.addEventListener("click", () => deliver("png", { share: SHARE_MODE }));
els.resetBtn.addEventListener("click", resetAll);

window.addEventListener("resize", fitCard);
if ("ResizeObserver" in window) new ResizeObserver(fitCard).observe(els.card);

if (SHARE_MODE) {
  document.documentElement.classList.add("share-mode");
  els.shareBtn.hidden = false;
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

resetAll();
