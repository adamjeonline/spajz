// Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0): this file is the same as Boxshelf's
// renderer/splash.js apart from the app's name (Špajz).
// Špajz start-up: decided before the first paint whether the logo screen shows (Settings → Display → Startup animation)
try { const v = localStorage.getItem('bootIntro'); if (v === 'off') document.documentElement.classList.add('no-splash'); if (v) document.documentElement.dataset.intro = v; } catch (e) {}
