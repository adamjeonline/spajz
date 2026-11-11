<h1 align="center">
  <img src="renderer/brand/trustyshelf-logo-dark.svg" alt="ŠPAJZ" width="480">
</h1>

<p align="center"><b>Česká herní polička pro tvoje emulátory, Steam a Game Pass. Pro Windows, Linux, Steam Deck a Android.</b><br>
Skutečné krabice her na 3D policích, návody ke čtení, achievementy a jeden ovladač na všechno.</p>

<p align="center"><img src="docs/spajz/hero.jpg" alt="Špajz" width="100%"></p>


## Jak to vypadá

| Police | Podrobnosti hry |
|---|---|
| ![Police](docs/spajz/police.jpg) | ![Podrobnosti](docs/spajz/podrobnosti.jpg) |
| **Rychlé menu** | **Nastavení** |
| ![Menu](docs/spajz/menu.jpg) | ![Nastavení](docs/spajz/nastaveni.jpg) |

## Stažení

Hotové verze najdeš na stránce [Releases](https://github.com/adamjeonline/spajz/releases):

- **Windows:** `Spajz-<verze>-windows.exe`. Dej ho do vlastní složky (vedle sebe si vytvoří složku `data`
  s nastavením) a spusť dvojklikem. Když Windows ukáže „Systém Windows ochránil váš počítač“, klikni na
  *Další informace → Přesto spustit* (program není digitálně podepsaný).
- **Linux a Steam Deck:** `Spajz-<verze>-linux.AppImage`. Povol spouštění (*Vlastnosti → Oprávnění → Je spustitelný*,
  nebo `chmod +x Spajz-*.AppImage`) a spusť. Nastavení se ukládá do `~/TrustyShelf`.
- **Android:** `Spajz-<verze>-android.apk` ([přímé stažení verze 1.0.0](https://adamjeonline.github.io/spajz/stahnout/Spajz-1.0.0-android.apk)).
  Otevři ho v telefonu nebo handheldu a povol instalaci z neznámých zdrojů.

### Android

- Funguje na telefonech, tabletech a herních handheldech s Androidem 7 nebo novějším (nejlépe na šířku s ovladačem).
- Při prvním spuštění tě provede nastavením: vybereš hlavní složku s ROM a Špajz sám najde konzole i nainstalované
  emulátory (RetroArch, Dolphin, AetherSX2/NetherSX2, PPSSPP, Azahar a další).
- Na zařízeních se dvěma displeji (třeba AYN Thor) umí využít spodní obrazovku na podrobnosti o hře a dotyková tlačítka.
- Špajz si můžeš nastavit jako domovskou obrazovku, takže se zařízení chová jako konzole.

### Steam Deck (herní režim)

1. V režimu plochy dej AppImage třeba do `~/Applications/Spajz` a povol spouštění.
2. Ve Steamu: *Hry → Přidat hru mimo Steam → Procházet*, přepni filtr na „Všechny soubory“ a vyber AppImage.
   (Nebo nech Špajz, ať se do Steamu přidá sám: *Nastavení → Systém*.)
3. V herním režimu ho najdeš v *Knihovna → Mimo Steam*. V nastavení ovladače zvol šablonu **Gamepad**.
4. Hru ukončíš podržením **Select + Start**, nebo se v menu Steamu přepni na Špajz a dvakrát stiskni **B**.

## Sestavení ze zdrojového kódu

Potřebuješ [Node.js](https://nodejs.org) (LTS).

```
npm install
npm run dist:win      # Windows: dist/Spajz-<verze>-win-portable.exe
npm run dist:linux    # Linux:   dist/Spajz-<verze>-linux.AppImage
npm start             # spuštění bez sestavení
```

Android (potřebuješ ještě JDK 21 a Android SDK):

```
cd android-app
npm install
npm run sync
cd android && ./gradlew assembleRelease
```

Překlad je ve složce `scripts/i18n/cs` (řádky `číslo|text` a `=anglický text|český text`). Po úpravě spusť
`python3 scripts/i18n/build_cs.py`.


Špajz neobsahuje žádné hry, BIOSy ani obaly: hraj jen to, co vlastníš.
