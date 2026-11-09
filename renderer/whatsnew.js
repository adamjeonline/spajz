// Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0): most of this file is Boxshelf's
// renderer/whatsnew.js; modified for Špajz (its own versions' notes).
// What's new: each version's notes, shipped with the app (so the card after an update works offline, and on the Thor).
// The shelf shows a version's highlights once, the first time it starts; Settings → System → What's new lists the
// items (a short headline per row; the side card says more). scripts/release-notes.js prints the same notes as Markdown
// for the GitHub release, so the app and the release page always say the same thing.
// { version (Windows / Linux), android (the Android build with the same changes, if any), date, title, highlights[],
//   sections: [{ h, items: [[headline, more]] }] }; newest first.
window.BS_WHATSNEW = [
  {
    version: '1.0.0.0', android: '', date: '2026-11-09', title: "První vydání Špajzu",
    highlights: [
      "Celé rozhraní v češtině, s českým formátem data a 24hodinovými hodinami",
      "Nové jméno a logo: Špajz se zavařovačkou",
      "Windows: police Game Pass s hrami z Xbox Game Passu a Microsoft Storu",
      "Steam Deck: hru v herním režimu zavřeš bez zavření Špajzu"
    ],
    platforms: [
      "Windows: všechno výše.",
      "Linux / Steam Deck: všechno kromě police Game Pass."
    ],
    sections: [
      { h: "Novinky", items: [
        ["Čeština", "Menu, nastavení, průvodce prvním spuštěním, podrobnosti her i rychlé menu jsou v češtině. Jazyk změníš v Nastavení → Zobrazení → Jazyk."],
        ["Police Game Pass", "Hry z Xbox Game Passu a Microsoft Storu mají vlastní polici vedle PC, i ty nainstalované ve složce WindowsApps, se skutečnými názvy. Vypneš ji v Nastavení → Hry pro PC → Police Game Pass."],
        ["Ukončení hry na Steam Decku", "V herním režimu zůstane Špajz otevřený za hrou. V menu Steamu se na něj přepni a dvakrát stiskni B: hra se zavře a vrátíš se na polici."]
      ] }
    ]
  }
];
