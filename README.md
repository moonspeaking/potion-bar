# Призрачный Бар — браузерный порт

Играть: https://moonspeaking.github.io/potion-bar/ (устанавливается как PWA, работает офлайн).

Порт Potion Bar на чистый JavaScript без сборки и npm: `index.html`, `js/`, `assets/`.

## Локальный запуск

```bash
python3 tools/serve.py        # http://localhost:8765
```

## Структура

- `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` — PWA-оболочка;
- `js/` — код игры; `assets/` — ресурсы;
- `tools/` — сервер и вспомогательные скрипты;
- `research/` — результаты реверса оригинала (Ghidra, SWF), не публикуется (в `.gitignore`).
