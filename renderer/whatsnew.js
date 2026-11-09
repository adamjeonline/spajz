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
    version: '1.3.0.0', android: '1.3.0.0', date: '2026-11-09', title: "Neo Geo Pocket, Neo Geo Pocket Color and Game.com shelves",
    highlights: [
      "A Neo Geo Pocket shelf and a Neo Geo Pocket Color shelf, played in RetroArch's Beetle NeoPop core",
      "A Game.com shelf, played in MAME",
      "Each with its own box art, manuals and card box"
    ],
    platforms: [
      "Windows and Linux: all three shelves.",
      "Android (AYN Thor): the Neo Geo Pocket and Neo Geo Pocket Color shelves, through RetroArch."
    ],
    sections: [
      { h: "New shelves", items: [
        ["Neo Geo Pocket and Neo Geo Pocket Color", "One shelf for each, as their box art is kept apart: .ngp games in an ngp or Neo Geo Pocket folder, .ngc games in an ngpc or Neo Geo Pocket Color folder. They play in RetroArch's Beetle NeoPop core (no BIOS needed; on Windows the core is downloaded the first time), with box art from libretro and LaunchBox, manuals from GamesDatabase.org and small card boxes of their own. On the Thor too. Asked for by ShayneVi."],
        ["Game.com", "Tiger's handheld gets a shelf: .tgc or .bin games in a gamecom or Game.com folder, started in MAME. MAME needs the Game.com's own system file (gamecom.zip, from a MAME BIOS set) in its roms folder first; Setup and Settings say so. Asked for by ShayneVi."]
      ] }
    ]
  },
  {
    version: '1.2.0.0', android: '1.2.0.0', date: '2026-11-08', title: "Art match for console games, and console box art that shows",
    highlights: [
      "Art match: pick by name which game a console game's box art comes from, for ROM hacks, translations and mods",
      "Console box art for PC games shows again: the covers had gone back to the made-up cases",
      "Automatic PC posters show too",
      "Settings → Controller says what to do when a PlayStation pad does nothing while Steam is open"
    ],
    platforms: [
      "Windows and Linux: everything above.",
      "Android: no changes in this release."
    ],
    sections: [
      { h: "Box art", items: [
        ["Art match", "A ROM hack, a translation or a mod named after its serial or file name got no box art. Details → Art match searches the console's games in the box art databases by name: pick the right one and its box art is fetched for this game, and remembered. Back to automatic undoes it. Asked for by jhonam05 in Špajz's issue 2."],
        ["Console box art shows again", "With Settings → PC games → Console box art on, the console boxes were made but never shown: the shelf fell back to the made-up cases. They show now, back and spine too. Reported by jhonam05 in Špajz's issue 1."],
        ["Automatic PC posters", "The automatic SteamGridDB posters and store box art for PC games had the same problem, and show now as well."]
      ] },
      { h: "Controllers", items: [
        ["PlayStation pads and Steam", "While Steam is open, Steam Input can take a DualSense or DualShock 4 for itself. Settings → Controller now says so and where to turn it off: \"PlayStation pad does nothing?\""]
      ] }
    ]
  },
  {
    version: '1.1.0.0', android: '1.1.0.0', date: '2026-11-08', title: "Window modes, HoYoPlay, Epic downloads, your own music and saved looks",
    highlights: [
      "A window mode for each PC game (borderless or windowed), a HoYoPlay shelf, and a start through Windows' administrator prompt",
      "Epic downloads on Linux: a queue with Pause and Resume, an installation status, and a Storage view by drive",
      "Your own music (a Music folder) as the menu music, and saved looks: a whole look in one press",
      "An original Xbox shelf (xemu), Portuguese (Brasil), a Discord \"Playing\" status and Export / Import everything",
      "A start script for Linux, and PC games in their console box"
    ],
    platforms: [
      "Windows: the window mode, HoYoPlay and the administrator start (they use Windows itself).",
      "Linux: the Epic download manager, the installation status and the start script (start-trustyshelf.sh).",
      "Windows and Linux: your own music, Storage, Export / Import everything and the Discord status.",
      "Windows, Linux and Android: saved looks, the Installed filter and the language choice."
    ],
    sections: [
      { h: "PC games", items: [
        ["A window mode for each PC game", "Details → Window, on a PC game the shelf starts itself (Quiver, GOG, HoYoPlay, the PC games folder, programs you added): Borderless takes the frame and title bar off and stretches the game over its screen; Windowed keeps the game a window and leaves the taskbar. Windows only. The idea is from the TyroShelf fork."],
        ["A HoYoPlay shelf", "Genshin Impact, Honkai: Star Rail, Zenless Zone Zero and Honkai Impact 3rd, as HoYoPlay installed them, are on the PC shelf and start from their own folders. Settings → PC games → Show installed HoYoPlay games. Windows. The idea is from the TyroShelf fork."],
        ["Administrator rights", "A program that needs administrator rights is started through Windows' own prompt, instead of not starting. Windows."],
        ["Epic downloads", "Installs and updates run in a queue, one at a time: progress, speed and time left, Pause and Resume (what was downloaded stays, the download goes on from there), Move up and Remove. Settings → PC games → Downloads, and an Epic downloads row in the quick menu. Linux, through legendary as before."],
        ["Installed or not", "Details → Installation sets an Epic game to installed or not installed by hand (a game that is not installed is greyed, and Play offers to install it); another press goes back to what the shelf finds. Linux."],
        ["Storage", "Settings → PC games → Storage lists every installed PC game with its size, by drive, and how much room each drive has."],
        ["An Installed filter", "The Sort panel's filter row has Installed when some of your games are greyed, so the shelf can show only what you can play now."],
        ["PC games in their console box", "Settings → PC games → Console box art (off by default): each PC game shows the box of its newest console release, with the back and spine too, and a Steam band over the console's logo."]
      ] },
      { h: "Look and sound", items: [
        ["Your own music", "Put music files (mp3, ogg, opus, wav, flac, m4a, aac and more) in the Music folder beside the app, or in Songs; subfolders count. Settings → Sound → Menu music → Your music plays them one after another, never the same twice running. Reload music reads the folder again. Up to 500 files. The idea is from the TyroShelf fork."],
        ["Saved looks", "Settings → Display → Looks keeps the look you have now (theme, background, interface size, clock, home layout, order, filter, sound and menu music, museum scene) under a name; Apply puts it all back in one press. Rename, Update and Delete are there too. The idea is from the saved workspaces of the 0libote launcher."],
        ["Português (Brasil)", "Settings → Display → Language. The translation is from Thanks2111's fork; the screen reloads to switch."],
        ["Discord status", "Settings → Display → Show what I'm playing on Discord: while a game runs, your profile says Playing with its name. Off by default; it needs a free Discord application id and only talks to the Discord app on your computer."],
        ["Home on Linux", "The Home key, the Guide button and the menu request open the quick menu in the shelf's own window, where the keyboard and controller work."]
      ] },
      { h: "Consoles and emulators", items: [
        ["An original Xbox shelf", "Disc images (.iso, .xiso) from an xbox folder, started in xemu full screen, with box art, manuals and a black Xbox case. xemu needs its BIOS, boot ROM and hard disk set up first."],
        ["Portable emulators", "Settings → Consoles → Find emulators in a folder looks for every emulator Špajz knows in a folder you choose, four folders deep, even on another drive; RetroAchievements shows whether DuckStation, RetroArch and Flycast are signed in, portable or installed."],
        ["More emulators found", "DeSmuME for the DS, VisualBoyAdvance-M for the Game Boy shelves, and more DuckStation builds are found and started."],
        ["Switch 2 sizes", "Unpacked Switch 2 games (a folder with exefs and romfs) show their size."]
      ] },
      { h: "Your data and the app", items: [
        ["Export everything, Import everything", "Settings → System: copy your whole collection (settings, favourites, history, art databases, themes, songs, and the art and manuals next to your games) to a folder, and bring it back on another PC. Nothing is deleted on import."],
        ["A start for Linux", "start-trustyshelf.sh runs Špajz from the source on any Linux with Node.js: it installs what it needs on the first run and repairs Electron if its download failed. --windowed starts in a window; the idea is from wouldja's launcher."],
        ["Versions and updates", "The version reads like the releases (1.1.0.0), the wording says Updates instead of beta, and the update check reads this repository's releases."]
      ] }
    ]
  },
  {
    version: '1.0.1.0', android: '1.0.1.0', date: '2026-11-08', title: 'Custom games on any shelf, and fixes from Boxshelf\'s reports',
    highlights: [
      'Custom games: each gets its own page, with launch arguments and a Platform: Custom, PC or any console\'s shelf',
      'An Xbox One shelf for PC ports, and automatic SteamGridDB posters for PC games with no cover',
      'The museum no longer opens on a black screen with a big library',
      'Android: PC games through GameNative or DroidDeck, and Pause / Cancel for box art downloads',
      'Retro TV: live progress for the commercial search and ad downloads'
    ],
    platforms: [
      'Windows and Linux: everything above but the Android parts.',
      'Android (AYN Thor): the PC console, box art Pause / Cancel, the museum and Retro TV fixes.'
    ],
    sections: [
      { h: 'Custom games and shelves', items: [
        ['A page for each custom game', 'Settings → Custom games → a game: its name, launch arguments (for example -dx12), its Platform and Remove. Details shows its program and arguments. By supalii, from their Boxshelf fork.'],
        ['Put a program on any shelf', 'Platform puts it on Custom, PC or a console\'s shelf, beside that console\'s games. Špajz still starts the program itself, never through the emulator. By supalii.'],
        ['Xbox One shelf', 'A shelf for Xbox One ports and recompilations that run as PC programs: no emulator or games folder. It shows up once a program is put on it. By supalii.'],
        ['Automatic PC posters', 'With a SteamGridDB key and automatic box art on, PC games with no cover get a SteamGridDB poster. A cover you chose, the store\'s or Steam\'s always comes first. By supalii.'],
        ['Hide more tiles', 'Hide from shelf works on the Open emulator and Surprise me tiles too; Settings → Hidden games & tiles brings them back. By supalii.']
      ] },
      { h: 'Museum and Retro TV', items: [
        ['No more black museum', 'With a few hundred games on a console, the museum opened all black until you zoomed in. A wide wall is now framed around where you are, and it\'s never lost in the room\'s haze.'],
        ['Look around', 'The right stick, a mouse drag or , and . look left and right along the wall; the side displays can be picked from the wide view. By TrapEmAll.'],
        ['Retro TV progress', 'The TV guide shows the commercial search as it goes (42 of 300, 6 found), and the TV says how far an ad\'s download is. By TrapEmAll.']
      ] },
      { h: 'Android', items: [
        ['PC games', 'A PC console: GameNative\'s Frontend sync files are its games, started in GameNative (every store) or DroidDeck (Steam), or any other app you pick.'],
        ['Pause or cancel box art', 'While box art downloads, the quick menu\'s Box art download row has Pause, Resume and Cancel, as on Windows. (On Windows and Linux, the art card\'s Resume button now resumes instead of pausing again.)'],
        ['ARMSX2', 'ARMSX2\'s GitHub, nightly and debug builds are found by their ids too.']
      ] }
    ]
  },
  {
    version: '1.82.0-beta.9', android: '1.82.0-beta.9', date: '2026-11-06', title: 'Smoother, better manuals, and covers for every custom game',
    highlights: [
      'Smoother: background work no longer makes the shelf hitch, and the Art Studio opens faster',
      'Manuals: the right manual for the right game, scan collections for 26 consoles, cleaner pages',
      'Connect your accounts during setup, with Paste buttons (right-click Paste works too)',
      'Covers for all your custom games at once: recomps, ports and programs you added',
      'Thor: video previews, ports and custom APKs, six more consoles; Steam Deck: hold Select + Start to close a game'
    ],
    platforms: [
      'Windows: everything above but the Thor parts.',
      'Android (AYN Thor): video previews in Details, ports and custom APKs, six more consoles.',
      'Linux / Steam Deck (experimental): hold Select + Start to close a game; covers for every custom game.'
    ],
    sections: [
      { h: 'New', items: [
        ['Covers for every custom game', 'Settings → Custom games → Covers: go through every recomp, port and program without a cover (SteamGridDB\'s covers for each, A uses one, Skip moves on), or let Špajz pick the best match for each in one go, with Undo. Needs a free SteamGridDB key.'],
        ['Thor: video previews', 'Videos beside your games (a "videos", "media/videos" or "snap" folder in a console\'s games folder) play behind the case in Details, and YouTube trailers in the Media tab. Off until you switch them on: Settings → Shelf & museum → Video previews.'],
        ['Thor: ports and custom APKs', 'Settings → Games → Ports & custom APKs: switch on the apps that are games (ports, recomps, a custom APK) and they get a Custom shelf of their own, off the Apps shelf.'],
        ['Thor: six more consoles', 'Sega CD, 32X, Atari 2600, Lynx, WonderSwan and DOS, through RetroArch (MD.emu for Sega CD too), with their box art, manuals and achievements.'],
        ['Steam Deck: leave any game', 'Hold Select + Start for a moment during a game and Špajz closes it, whatever the emulator.'],
        ['Accounts in setup', 'The first-run setup has an optional Accounts page: RetroAchievements, SteamGridDB, ScreenScraper and fanart.tv, each with a link to its free key, a Paste button and a Test. With a controller, an on-screen keyboard. Skip it and nothing changes.'],
        ['Manuals for many more consoles', 'Scan collections for PlayStation, NES, SNES, N64, Game Boy, DS, 3DS, Sega, Atari, TurboGrafx-16 and Neo Geo games, plus Nintendo\'s high-resolution manuals for Wii, GameCube, N64, DS and 3DS.']
      ] },
      { h: 'Better', items: [
        ['Smoother everywhere', 'Box art, manual and library work in the background takes turns with the shelf instead of freezing it, games folders are read once instead of over and over, and coming back from a game no longer sets off a full rescan.'],
        ['The right manual for the right game', 'Stricter matching: no more sequels\' or other consoles\' manuals, no promotional flyers. Manuals picked before that don\'t match are set aside (kept in the backup folder) and looked up again. Games with no manual anywhere say "no manual found online".'],
        ['Cleaner manual pages', 'No more thumbnail "pages", huge scans made a sensible size, and digital manuals and box wraps are no longer cut in half.'],
        ['Fix a manual', 'In the manual reader, Fix manual (Y / W) offers Wrong game (set it aside and get the right one, from the scan collections first) or Repair (the same manual with its cover, pages and sizes put right). Right away, for that game only.'],
        ['Art Studio shows the whole box', 'The case in the Art Studio takes the shape of the game\'s box, so 3DS, PSP, Switch, Blu-ray and cartridge boxes show whole instead of cropped.'],
        ['Wii U manuals open on the box', 'Manuals made from a Wii U game\'s own e-manual open on the box front again, wherever Špajz runs from.'],
        ['Right-click Paste', 'Text boxes have the usual Cut / Copy / Paste menu.'],
        ['Settings opens the right page', 'Links to a page of its own (from a card or the bottom screen) now land on that page, on every platform.']
      ] }
    ]
  },
  {
    version: '1.82.0-beta.8', android: '1.82.0-beta.8', date: '2026-11-06', title: 'Video previews, a new Details page and easier setup',
    highlights: [
      'Video previews: rest on a game and its trailer plays, on the shelf and in Details, console games too',
      'A new Details page: the game\'s logo, play stats, tabs and one big Play button',
      'Add many games at once: pick several, scan a folder, or import from Playnite (experimental)',
      'Ten more consoles, including Saturn, Neo Geo, Arcade and DOS',
      'Set up for me: one switch sets up RetroArch, Dolphin, DuckStation, PCSX2 and PPSSPP'
    ],
    // (scripts/release-notes.js prints these under the notes: where each part works)
    platforms: [
      'Windows: everything above.',
      'Linux / Steam Deck (experimental): everything except Set up for me, console trailers, scanning a folder of games and the Playnite import. On a Steam Deck, add Špajz to Steam (it offers to) and play from Game Mode.',
      'Android (AYN Thor): the new Details page and the magazines fix; video previews, Add games and the new consoles come to Android later.'
    ],
    sections: [
      { h: 'New', items: [
        ['Video previews', 'Rest on a game and its preview plays, softly behind the shelf and behind the case in Details: your own videos (ES-DE, EmuDeck, RetroBat, LaunchBox or a folder of your own), Steam\'s own trailers for Steam games, and console trailers from YouTube. Settings → Video previews, which also sets how soon they start (half a second to 15 seconds).'],
        ['Console trailers', 'A console game\'s YouTube trailer is kept as a short clip (about 1 MB) the first time you rest on it, so it plays on the shelf just like a Steam trailer. It needs a free helper (yt-dlp), fetched once with one press: Špajz asks you on the shelf, or Settings → Video previews.'],
        ['A new Details page', 'The game\'s logo, time played and last played, one Play button with Manual, Inspect and More beside it, and tabs: Overview, Media and Your copy (LB / RB, or Q / E). The game\'s art or its preview fills the background.'],
        ['Add many games at once', 'Settings → Custom games → Add games, or the Add games tile at the end of the Custom shelf: pick several programs at once, or point Špajz at a folder of games and tick the ones to add.'],
        ['Import from Playnite (experimental)', 'Bring your Playnite library over in one go: games you added by hand, with their covers, and your emulated games\' folders. You see what will be added first, and one press removes it all again. Tell us how it goes.'],
        ['Steam Deck: Game Mode and Add to Steam', 'Špajz now starts from Steam and in Game Mode by itself. On a Steam Deck in Desktop Mode it offers to add itself to Steam, so your controller works as a gamepad in games (outside Steam, B is the Esc key, which quits most emulators). Any time: Settings → System → Add Špajz to Steam.'],
        ['Switch: Citron and Ryujinx', 'Found and started as well as Eden, so EmuDeck\'s Switch emulator works without setting anything up.'],
        ['Ten more consoles', 'Saturn, TurboGrafx-16, Neo Geo, Arcade, Sega CD, 32X, Atari 2600, Lynx, WonderSwan and DOS, through RetroArch, each with its own case and colours. Arcade games show their real names.'],
        ['Set up for me', 'Settings → a console → Set up for me: your controller mapped, the Home menu\'s Save and Load keys, one shared BIOS folder and graphics that suit your PC. Your files are backed up first, and Undo puts them back. The first run can do it for you.'],
        ['RetroArch cores and BIOS files', 'A missing RetroArch core downloads by itself the first time you play, and Settings checks the BIOS files each console needs.'],
        ['More PC stores', 'GOG, Ubisoft Connect, EA app and Xbox / Game Pass games join Steam and Epic on the PC shelf.'],
        ['Library tools', 'Filter by decade, genre, players or co-op, and make collections: shelves of your own, from Details → More → Collections.'],
        ['Patch notes in the app', 'A card on the shelf when a new version is out, with its highlights; What\'s new after you update; and every version\'s notes in Settings → System → What\'s new.']
      ] },
      { h: 'Better', items: [
        ['A tidier first run', 'Only the consoles you have games for come ticked; the rest fold away, grouped by maker.'],
        ['Easier to find', 'Video previews has its own place in Settings, and Add games its own page, so the main pages stay short.']
      ] },
      { h: 'Fixed', items: [
        ['Trailers play again', 'YouTube stopped playing trailers opened on their own. They now play in TrustyShelf\'s own player.'],
        ['Android: magazines and guides always show', 'The reading corner\'s list could stay empty on some devices; it now always loads.'],
        ['Your changes stay put', 'A game you renamed, or a finished "Set up for me", could be undone by changing another setting in the same visit.'],
        ['No accidental holds', 'Holding A on a disc, or holding Restart / Shut down, now stops if you switch away or pull down the notification shade, instead of finishing on its own.'],
        ['Covers and the museum', 'A Wi-Fi sign-in page could be saved as a game\'s cover, and the museum\'s camera jumped when you touched the controls after leaving it idle.'],
        ['Android: taps after a quick swipe', 'After flicking the shelf or the console bar, the first tap on a game or console did nothing. It works first time now.']
      ] }
    ]
  },  {
    version: '1.82.0-beta.6', android: '0.4.0-beta.1', date: '2026-11-05', title: 'Now on Android and Linux, and clean game transitions',
    highlights: [
      'Špajz on Android (AYN Thor) and Linux / Steam Deck',
      'Starting and quitting a game shows nothing but the game',
      'Twelve retro consoles, from PlayStation to Dreamcast'
    ],
    sections: [
      { h: 'New', items: [
        ['Android and Linux', 'The AYN Thor gets Špajz with its bottom screen; Linux and the Steam Deck get an AppImage (experimental).'],
        ['Retro consoles', 'PlayStation, NES, SNES, Nintendo 64, Game Boy, Game Boy Color, Game Boy Advance, DS, Mega Drive, Master System, Game Gear and Dreamcast.'],
        ['Rename and change covers', 'Give any game the name you want, and pick its cover from every one found.']
      ] },
      { h: 'Better', items: [
        ['Clean game transitions', 'No taskbar, no desktop and no gaps while a game starts or closes: it feels like a console.']
      ] }
    ]
  }
];
