<!-- Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0). Written by supalii
(https://github.com/supalii) in their Boxshelf fork (https://github.com/supalii/boxshelf-source); brought into (T)rustyShelf
with the app's name changed. -->
# Localization

## Current status

(T)rustyShelf does not currently have a runtime language selector or translation catalogs. English is the built-in UI
language, and most labels, help text, dialogs, and notifications are written directly in the renderer and settings
code. The `lang="en"` attribute in `renderer/index.html` describes the current page language; it does not enable
language switching.

## Adding Indonesian without removing English

Keep English as the default and fallback. A localization change should add a user-selectable language preference and
an Indonesian (`id`) catalog, rather than replacing the existing English text. Missing Indonesian entries must fall
back to English so partial translations and future features remain usable.

The translation boundary should cover app-authored interface text on Windows and Android: shelf and settings labels,
tooltips, setup instructions, confirmation dialogs, errors, accessibility names, and notifications. Do not translate
game titles, user-entered names, file paths, emulator names, store names, or other library data supplied by the user
or an external service. Keep formatting placeholders intact and use locale-aware number/date formatting where the
display is part of the interface.

When contributing translations:

1. Keep each English source string associated with a stable key; avoid using translated text as a key.
2. Add Indonesian values in the Indonesian catalog and preserve English values as the fallback.
3. Use the same translation lookup in shared UI flows on Windows and Android. Native Android text should use the
   platform's own resource localization if it is introduced.
4. Test the language selector, fallback for a missing key, and representative shelf, settings, dialog, and error
   screens in both languages.
5. Keep English enabled and review Indonesian phrasing and text expansion on TV-sized and phone-sized layouts.

No localization runtime has been implemented yet; this document records the current state and the intended approach
for adding Indonesian as an additional language.
