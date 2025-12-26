// --- Forecast Pagination State ---
let forecastAllDays = [];
let forecastPage = 0;
const FORECAST_INITIAL = 3;
const FORECAST_TOTAL = 5;

function showForecastPage(page) {
    let daysToShow = [];
    if (page === 0) {
        daysToShow = forecastAllDays.slice(0, FORECAST_INITIAL);
    } else {
        daysToShow = forecastAllDays.slice(0, FORECAST_TOTAL);
    }
    renderForecastCards(daysToShow);
    // Clear the forecastDays row since date/day will be in the card
    const forecastDays = document.getElementById('forecastDays');
    if (forecastDays) forecastDays.innerHTML = '';
    // Show/hide Load More button
    const btn = document.getElementById('forecastLoadMore');
    if (btn) {
        // Always reset button visibility on each render
        if (forecastAllDays.length > FORECAST_INITIAL && daysToShow.length === FORECAST_INITIAL) {
            btn.style.display = '';
            btn.disabled = false;
        } else {
            btn.style.display = 'none';
        }
    }
}

const API_KEY =
    window.WEATHERWISE_CONFIG?.OPENWEATHER_API_KEY ||
    "YOUR_API_KEY_HERE";

const UNITS = "metric"; // Celsius
const COUNTRY_ONLY = "PH"; // Philippines-only search
const DEFAULT_CITY = "Manila";
const FETCH_TIMEOUT_MS = 12000;

// Major PH cities for dropdown (keeps search constrained to Philippines)
const PH_CITIES = [
    "Manila",
    "Quezon City",
    "Caloocan",
    "Davao City",
    "Cebu City",
    "Zamboanga City",
    "Taguig",
    "Pasig",
    "Makati",
    "Baguio",
    "Cagayan de Oro",
    "Iloilo City",
    "Bacolod",
    "General Santos",
    "Antipolo",
    "Pasay",
    "Paranaque",
    "Las Pinas",
    "Mandaluyong",
    "San Juan",
    "Valenzuela",
    "Marikina",
    "Muntinlupa",
    "Lapu-Lapu City",
    "Tacloban",
    "Dumaguete",
    "Puerto Princesa",
    "Legazpi",
    "Butuan",
    "Cotabato City",
];

// DOM helpers
const $ = (sel) => document.querySelector(sel);

const el = {
    // Inputs / Controls
    searchInput: $("#searchInput"),
    searchBtn: $("#searchBtn"),
    seeAllBtn: $("#seeAllBtn"),
    themeBtn: $("#themeBtn"),
    citySelect: $("#citySelect"),

    // Alerts
    errorBox: $("#errorBox"),

    // Display fields
    locationLine: $("#locationLine"),
    dateLine: $("#dateLine"),
    tempNow: $("#tempNow"),
    tempHigh: $("#tempHigh"),
    tempLow: $("#tempLow"),
    headline: $("#headline"),
    metaLine: $("#metaLine"),
    sidebarLocation: $("#sidebarLocation"),

    // Sidebar status
    statusValue: $("#statusValue"),
    statusLabel: $("#statusLabel"),
    statusDot: $("#statusDot"),

    // Recent cards
    recentGrid: $("#recentGrid"),

    // Forecast visualization
    forecastDays: $("#forecastDays"),
    forecastTemps: $("#forecastTemps"),
    forecastPath: $("#forecastPath"),
    forecastFocus: $("#forecastFocus"),
    forecastVLine: $("#forecastVLine"),

    // Humidity now element
    humidityNow: $("#humidityNow"),

    // Favorites grid
    favoritesGrid: $("#favoritesGrid"),
};


// Utility Functions
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function roundTemp(n) {
    return Math.round(n);
}

function renderForecastCards(days) {
    // Show temp, humidity, icon, and day for each day
    const container = document.getElementById('forecastCards');
    if (!container) return;
    container.innerHTML = days.map((d) => {
        const icon = d.sample?.weather?.[0]?.icon || '01d';
        const desc = d.sample?.weather?.[0]?.description || '';
        const humidity = d.sample?.main?.humidity;
        const temp = roundTemp(d.sample?.main?.temp ?? d.max);
        const dateObj = new Date(d.dateLocalMs);
        const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const day = dayShort(dateObj);
        return `
            <div class="forecast__card">
                <div style='font-size:0.95rem;color:var(--muted2);margin-bottom:2px;'>${dateStr}</div>
                <div class="forecast__day">${day}</div>
                <img class="forecast__icon" src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${desc}">
                <div class="forecast__temp">${temp}°C</div>
                <div class="forecast__humidity">${humidity != null ? `Humidity: ${humidity}%` : ''}</div>
            </div>
        `;
    }).join('');
}

function formatLocalDate(date) {
    return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

function dayShort(date) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
}

function titleCase(s) {
    return String(s)
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/**
 * UI: show/hide loading state and disable inputs while loading.
 */
function setLoading(isLoading) {
    // Loading UI removed per user request.
}

/**
 * UI: show error message, hide when empty.
 */
function setError(message) {
    if (!message) {
        el.errorBox.hidden = true;
        el.errorBox.textContent = "";
        return;
    }
    el.errorBox.hidden = false;
    el.errorBox.textContent = message;
}

// API Functions

function buildOWMUrl(path, params) {
    const url = new URL(`https://api.openweathermap.org${path}`);
    Object.entries({ ...params, appid: API_KEY }).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    return url.toString();
}

async function fetchJson(url) {
    // API call explanation: fetch() -> JSON with async/await.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Request failed (${res.status}): ${text || url}`);
        }
        return res.json();
    } catch (err) {
        if (err?.name === "AbortError") {
            throw new Error("Request timed out. Check your internet connection and try again.");
        }
        throw err;
    } finally {
        clearTimeout(t);
    }
}

/**
 * API: geocode a city name (Philippines-only) into coordinates.
 */
async function geocodeCityPH(query) {
    // Force PH only by adding ,PH.
    const q = `${query},${COUNTRY_ONLY}`;
    const url = buildOWMUrl("/geo/1.0/direct", { q, limit: 5 });
    const results = await fetchJson(url);
    if (!Array.isArray(results) || results.length === 0) return null;
    const first = results[0];
    if (first?.country && String(first.country).toUpperCase() !== COUNTRY_ONLY) return null;
    return first;
}

async function getCurrent(lat, lon) {
    // API call explanation: current weather by coordinates.
    const url = buildOWMUrl("/data/2.5/weather", { lat, lon, units: UNITS });
    return fetchJson(url);
}

async function getForecast(lat, lon) {
    // API call explanation: 5-day forecast by coordinates.
    const url = buildOWMUrl("/data/2.5/forecast", { lat, lon, units: UNITS });
    return fetchJson(url);
}

function aggregateDailyFrom3h(list, tzOffsetSeconds) {
    // Build up to 6 days starting today using local day boundaries.
    const byDay = new Map();

    for (const item of list) {
        const utcMs = item.dt * 1000;
        const localMs = utcMs + tzOffsetSeconds * 1000;
        const d = new Date(localMs);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

        const temp = item.main?.temp;
        if (typeof temp !== "number") continue;

        const existing = byDay.get(key) || {
            dateLocalMs: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
            min: temp,
            max: temp,
            sample: item,
        };
        existing.min = Math.min(existing.min, temp);
        existing.max = Math.max(existing.max, temp);

        // Prefer midday icon/desc for nicer cards.
        const hour = d.getHours();
        if (hour >= 11 && hour <= 15) existing.sample = item;

        byDay.set(key, existing);
    }

    const days = [...byDay.values()].sort((a, b) => a.dateLocalMs - b.dateLocalMs);
    return days.slice(0, 6);
}

function computeStatusFromWeather(current) {
    // A simple "status" meter for the sidebar.
    // Use cloudiness% as the numeric value, and a label based on condition.
    const clouds = clamp(Number(current?.clouds?.all ?? 0), 0, 100);
    const code = Number(current?.weather?.[0]?.id ?? 800);

    let label = "Good";
    if (code >= 200 && code < 300) label = "Dangerous";
    else if (code >= 300 && code < 600) label = "Wet";
    else if (code >= 600 && code < 700) label = "Snow";
    else if (code >= 700 && code < 800) label = "Hazy";
    else if (code === 800) label = "Clear";
    else if (code > 800) label = "Cloudy";

    return { value: clouds, label };
}

function positionStatusDot(percent) {
    // Map 0..100 to a pleasing region along the existing curve.
    // We'll move the dot left->right and slightly up/down.
    const p = clamp(percent, 0, 100) / 100;
    const cx = 20 + p * 200;
    const cy = 70 - p * 52;
    el.statusDot.setAttribute("cx", String(cx));
    el.statusDot.setAttribute("cy", String(cy));
}

function setText(node, value) {
    if (!node) return;
    node.textContent = value;
}

/**
 * LocalStorage: save a city in the recents list.
 */
function setRecent(cityObj) {
    const key = "weatherwise.recent";
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    const entry = {
        name: cityObj.name,
        state: cityObj.state || "",
        country: cityObj.country || "",
        lat: cityObj.lat,
        lon: cityObj.lon,
        t: Date.now(),
    };

    const filtered = list.filter((x) => !(x && x.lat === entry.lat && x.lon === entry.lon));
    filtered.unshift(entry);
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, 8)));
}

function getRecent() {
    try {
        return JSON.parse(localStorage.getItem("weatherwise.recent") || "[]");
    } catch {
        return [];
    }
}

function iconUrl(code) {
    // OpenWeather icon set
    return `https://openweathermap.org/img/wn/${code}@2x.png`;
}

function renderRecentCards(cardsWeather) {
    // DOM manipulation: build and insert "recent search" cards.
    el.recentGrid.innerHTML = "";
    for (const item of cardsWeather.slice(0, 2)) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "card";
        card.title = "Load this city";

        const top = document.createElement("div");
        top.className = "card__top";

        const temp = document.createElement("div");
        temp.className = "card__temp";
        temp.textContent = `${roundTemp(item.temp)}`;

        const img = document.createElement("img");
        img.className = "card__icon";
        img.alt = item.desc;
        img.src = iconUrl(item.icon);

        top.append(temp, img);

        const place = document.createElement("div");
        place.className = "card__place";
        place.textContent = item.place;

        const desc = document.createElement("div");
        desc.className = "card__desc";
        desc.textContent = item.desc;

        card.append(top, place, desc);
        card.addEventListener("click", () => {
            loadByCoords(item.lat, item.lon, item.place);
        });

        el.recentGrid.append(card);
    }
}

function renderForecast(days) {
    // DOM manipulation + SVG: render day labels, temps, and a curve chart.
    const dayNames = days.map((d) => dayShort(new Date(d.dateLocalMs)));
    const highs = days.map((d) => roundTemp(d.max));

    el.forecastDays.innerHTML = dayNames
        .map((name) => `<div style="text-align:center;">${name}</div>`)
        .join("");



    // Render forecast cards (temp, humidity, icon)
    forecastAllDays = days;
    forecastPage = 0;
    showForecastPage(forecastPage);
    // Always re-bind the Load More button to ensure it works after city change
    const btn = document.getElementById('forecastLoadMore');
    if (btn) {
        btn.onclick = () => {
            forecastPage = 1;
            showForecastPage(forecastPage);
        };
    }


// Wire up Load More button once after DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('forecastLoadMore');
    if (btn) {
        btn.addEventListener('click', () => {
            forecastPage = 1;
            showForecastPage(forecastPage);
        });
    }
});
    // Graph removed: no SVG path or focus rendering
}

function humanPlace(cityName, state, country) {
    const parts = [cityName];
    if (state) parts.push(state);
    if (country) parts.push(country);
    return parts.join(", ");
}

/**
 * Input validation (Rubric)
 * - trims whitespace
 * - blocks empty input
 * - blocks invalid characters
 * - blocks non-PH country codes
 */
function validateCityInput(raw) {
    const q = String(raw || "").trim();
    if (!q) return { ok: false, message: "Please enter a city name." };

    // Allow letters, spaces, commas, periods, apostrophes, hyphens
    const valid = /^[a-zA-Z\s,.'-]+$/;
    if (!valid.test(q)) {
        return { ok: false, message: "Invalid input. Use letters/spaces only (no numbers/symbols)." };
    }

    // If user typed a country code, enforce PH only.
    if (q.includes(",")) {
        const parts = q.split(",").map((p) => p.trim()).filter(Boolean);
        const last = (parts[parts.length - 1] || "").toUpperCase();
        if (last.length === 2 && last !== COUNTRY_ONLY) {
            return { ok: false, message: "This project only supports cities in the Philippines (PH)." };
        }
    }

    return { ok: true, value: q };
}

/**
 * Simple API key check (frontend demo).
 */
function ensureApiKey() {
    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
        setError("Missing API key. Set it in config.js or Local Storage key: OWM_API_KEY");
        return false;
    }
    return true;
}

/**
 * Main loader: fetch API data and update the dashboard.
 */
async function loadByCoords(lat, lon, placeOverride) {
    try {
        setError("");
        setLoading(true);

        const [current, forecast] = await Promise.all([getCurrent(lat, lon), getForecast(lat, lon)]);

        const place = placeOverride || current?.name || "Unknown";

        const dtLocal = new Date((current.dt + (current.timezone || 0)) * 1000);
        setText(el.locationLine, place);
        setText(el.dateLine, `(${formatLocalDate(dtLocal)})`);
        setText(el.sidebarLocation, place);

        const temp = roundTemp(current.main.temp);
        setText(el.tempNow, `${temp}`);

        const headline = titleCase(current.weather?.[0]?.description || "");
        setText(el.headline, headline || "");

        const humidity = current.main.humidity;
        const wind = current.wind?.speed;
        const feels = current.main.feels_like;
        setText(
            el.metaLine,
            `Feels like ${roundTemp(feels)}  Humidity ${humidity}%  Wind ${Math.round(wind)} m/s`
        );

        const daily = aggregateDailyFrom3h(forecast.list || [], forecast.city?.timezone || 0);
        if (daily.length) {
            setText(el.tempHigh, `${roundTemp(daily[0].max)}`);
            setText(el.tempLow, `${roundTemp(daily[0].min)}`);
            setText(el.humidityNow, `Humidity: ${humidity}%`);
            renderForecast(daily);
        }

        const status = computeStatusFromWeather(current);
        setText(el.statusValue, `${Math.round(status.value)}%`);
        setText(el.statusLabel, status.label);
        positionStatusDot(status.value);

        // LocalStorage (bonus): save recent searches
        if (current?.name) setRecent({ name: current.name, country: COUNTRY_ONLY, state: "", lat, lon });

        // Update favorite button and favorites list
        updateFavoriteBtn(current);
        renderFavorites();

        await hydrateRecentCards();
    } catch (err) {
        console.error(err);
        // Error handling: failed API call
        setError("Failed API call. Please try again later (or check your API key). ");
        setText(el.metaLine, "Couldnt load weather.");
    } finally {
        setLoading(false);
    }
}

/**
 * Search flow: validate -> geocode (PH only) -> load.
 */
async function loadByCityPH(query) {
    try {
        setError("");
        setLoading(true);

        const check = validateCityInput(query);
        if (!check.ok) {
            // Error handling: invalid input
            setError(check.message);
            return;
        }
        if (!ensureApiKey()) return;

        const city = await geocodeCityPH(check.value);
        if (!city) {
            // Error handling: no results found
            setError("No results found in the Philippines. Try a different PH city.");
            return;
        }

        const place = humanPlace(city.name, city.state || "", city.country || COUNTRY_ONLY);
        await loadByCoords(city.lat, city.lon, place);
    } catch (err) {
        console.error(err);
        setError(err?.message || "Something went wrong. Please try again.");
    } finally {
        setLoading(false);
    }
}

async function hydrateRecentCards() {
    const recent = getRecent();
    if (!recent.length) {
        el.recentGrid.innerHTML = "";
        return;
    }

    const items = recent.slice(0, 2);
    const cardsWeather = await Promise.all(
        items.map(async (r) => {
            const cur = await getCurrent(r.lat, r.lon);
            return {
                lat: r.lat,
                lon: r.lon,
                place: humanPlace(r.name, r.state, r.country),
                temp: cur.main.temp,
                desc: titleCase(cur.weather?.[0]?.description || ""),
                icon: cur.weather?.[0]?.icon || "01d",
            };
        })
    );

    renderRecentCards(cardsWeather);
}

/**
 * DOM: fill the dropdown with PH cities.
 */
function populateCitySelect() {
    for (const name of PH_CITIES) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        el.citySelect.append(opt);
    }
}

/**
 * Theme toggle (optional but recommended).
 */
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("weatherwise.theme", theme);
    // Update theme button label
    if (el.themeBtn) {
        el.themeBtn.textContent = theme === 'light' ? 'Light' : 'Dark';
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
}

function wireUI() {
    // Button: triggers search
    el.searchBtn.addEventListener("click", () => {
        const q = el.searchInput.value;
        loadByCityPH(q);
    });

    el.searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const q = el.searchInput.value.trim();
            // Input validation includes trimming; this is just UX.
            loadByCityPH(q);
        }
    });

    // Dropdown: quick select a PH city
    el.citySelect.addEventListener("change", () => {
        if (!el.citySelect.value) return;
        el.searchInput.value = el.citySelect.value;
        loadByCityPH(el.citySelect.value);
    });

    // Theme toggle
    el.themeBtn.addEventListener("click", toggleTheme);

    // Removed seeAllBtn event listener
}

// Safety net: if any promise rejects without being caught, stop loading.
window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
    setLoading(false);
    setError("Something went wrong while loading weather data.");
});

// --- FAVORITES LOGIC ---
function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem("weatherwise.favorites") || "[]");
    } catch {
        return [];
    }
}

function setFavorites(list) {
    localStorage.setItem("weatherwise.favorites", JSON.stringify(list));
}

function addFavorite(cityObj) {
    const favs = getFavorites();
    const exists = favs.some(f => f.lat === cityObj.lat && f.lon === cityObj.lon);
    if (!exists) {
        favs.unshift({
            name: cityObj.name,
            state: cityObj.state || "",
            country: cityObj.country || "",
            lat: cityObj.lat,
            lon: cityObj.lon,
            t: Date.now(),
        });
        setFavorites(favs.slice(0, 8));
    }
}

function removeFavorite(cityObj) {
    let favs = getFavorites();
    favs = favs.filter(f => !(f.lat === cityObj.lat && f.lon === cityObj.lon));
    setFavorites(favs);
}

function isFavorite(cityObj) {
    const favs = getFavorites();
    return favs.some(f => f.lat === cityObj.lat && f.lon === cityObj.lon);
}

function renderFavorites() {
    const favs = getFavorites();
    el.favoritesGrid.innerHTML = "";
    if (!favs.length) {
        el.favoritesGrid.innerHTML = '<div class="favorites__empty">No favorites yet.</div>';
        return;
    }
    favs.forEach(fav => {
        const div = document.createElement("div");
        div.className = "favorites__card";
        div.innerHTML = `<div class="favorites__name">${fav.name}${fav.country ? ', ' + fav.country : ''}</div><button class="favorites__remove" title="Remove from favorites">✕</button>`;
        div.querySelector(".favorites__remove").onclick = () => {
            removeFavorite(fav);
            renderFavorites();
        };
        div.onclick = (e) => {
            if (e.target.classList.contains("favorites__remove")) return;
            // Trigger search for this city
            loadByCoords(fav.lat, fav.lon, fav.name);
        };
        el.favoritesGrid.appendChild(div);
    });
}

// --- Add Favorite Button to Main Weather Panel ---
function updateFavoriteBtn(current) {
    // Use static favoriteBtn from HTML
    let btn = document.getElementById("favoriteBtn");
    if (!btn) return; // If not found, do nothing
    // DEBUG: Always show favorite button for troubleshooting
    btn.style.display = "inline-block";
    btn.style.background = "#222";
    btn.style.color = "#fff";
    btn.style.border = "2px solid #ff0";
    btn.style.marginTop = "8px";
    btn.style.fontSize = "1rem";
    console.log("[DEBUG] Favorite button created/updated", current);

    const cityObj = {
        name: current.name,
        state: current.state || "",
        country: current.sys?.country || "",
        lat: current.coord?.lat,
        lon: current.coord?.lon
    };
    if (isFavorite(cityObj)) {
        btn.textContent = "★";
        btn.onclick = () => {
            removeFavorite(cityObj);
            updateFavoriteBtn(current);
            renderFavorites();
        };
    } else {
        btn.textContent = "☆";
        btn.onclick = () => {
            addFavorite(cityObj);
            updateFavoriteBtn(current);
            renderFavorites();
        };
    }
}

async function boot() {
    // Set initial theme
    applyTheme(localStorage.getItem("weatherwise.theme") || "dark");

    populateCitySelect();
    wireUI();

    // Loading state example
    setLoading(false);
    setError("");

    // Start with a Philippines city by default.
    // (Geolocation can be outside PH, so we don't use it for this PH-only requirement.)
    await loadByCityPH(DEFAULT_CITY);
}

boot();
