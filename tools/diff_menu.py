import glob, sys
from PIL import Image
import numpy as np
from collections import deque

SHOT = 'extracted/sheets/orig_s4.png'
shot = Image.open(SHOT).convert('RGB')
SW, SH = shot.size

bounds = None
try:
    import Quartz
    wl = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
        Quartz.kCGNullWindowID)
    cands = []
    for w in wl:
        b = w.get('kCGWindowBounds')
        if not b:
            continue
        W, H = int(b['Width']), int(b['Height'])
        if abs(W - 1024) < 150 and abs(H - 768) < 150:
            cands.append((str(w.get('kCGWindowOwnerName', '?')), str(w.get('kCGWindowName', '?')),
                          int(b['X']), int(b['Y']), W, H))
    print('window candidates:', cands)
    if cands:
        o, n, x, y, W, H = cands[0]
        bounds = (x, y, W, H)
except Exception as e:
    print('Quartz fail:', repr(e))

if bounds is None:
    # fallback: variance-based edge detection in upper-left region
    A0 = np.asarray(shot).astype(np.int16)
    reg = A0[:1900, :2500]
    colv = reg[:1600].std(axis=(0, 2))
    rowv = reg[:, :1600].std(axis=(1, 2))
    # wallpaper is smooth; game content textured -> find where variance jumps
    thr = colv[:100].mean() * 2.5
    xs = np.where(colv > max(thr, 25))[0]
    thr2 = rowv[:100].mean() * 2.5
    ys = np.where(rowv > max(thr2, 25))[0]
    if len(xs) and len(ys):
        bounds = (0, 0, int(xs.max()) // 2 + 1, int(ys.max()) // 2 + 1)
    print('fallback bounds:', bounds)

if not bounds:
    print('no bounds found')
    sys.exit(1)

x, y, W, H = bounds
s = 2 if SW >= 3000 else 1
px, py, pw, ph = x * s, y * s, W * s, H * s
win = shot.crop((px, py, px + pw, py + ph))
print('win crop size:', win.size)

# find title bar bottom: scan rows using right 45-90% columns (no traffic lights there)
Wa = np.asarray(win).astype(np.int16)
right = Wa[:, int(pw * 0.45):int(pw * 0.9)]
stds = right.std(axis=(1,))
tb = 0
for i in range(0, min(160, ph)):
    if stds[i] > 18:
        tb = i
        break
print('title bar bottom (win px):', tb)

content = win.crop((0, tb, pw, ph))
content.save('extracted/sheets/game_content.png')
print('content size:', content.size)

bgp = None
for p in ['extracted/pak/**/Episode_BG_01.jpg', 'extracted/pak/**/*BG_01*.jpg',
          'extracted/pak/**/*BG_01*.png', 'extracted/pak/**/*MainBG*']:
    g = glob.glob(p, recursive=True)
    if g:
        bgp = g[0]
        break
print('bg asset:', bgp)

bg = Image.open(bgp).convert('RGB')
cw, ch = content.size
bgr = bg.resize((cw, ch))
Ca = np.asarray(content).astype(np.int16)
Ba = np.asarray(bgr).astype(np.int16)

best = None
for dy in range(-24, 25, 4):
    for dx in range(-24, 25, 4):
        ys0, ys1 = max(0, dy), min(ch, ch + dy)
        xs0, xs1 = max(0, dx), min(cw, cw + dx)
        c = Ca[ys0:ys1, xs0:xs1]
        b = Ba[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
        d = np.abs(c - b).mean()
        if best is None or d < best[0]:
            best = (d, dx, dy)
print('best align (meandiff, dx, dy):', best)
d0, dx, dy = best
ys0, ys1 = max(0, dy), min(ch, ch + dy)
xs0, xs1 = max(0, dx), min(cw, cw + dx)
c = Ca[ys0:ys1, xs0:xs1]
b = Ba[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
D = np.abs(c - b).sum(axis=2)
mask = (D > 90)
print('diff fraction: %.3f' % mask.mean())

gh, gw = ch // 16 + 1, cw // 16 + 1
grid = np.zeros((gh, gw), bool)
ys, xs = np.where(mask)
for yy, xx in zip(ys, xs):
    grid[yy // 16, xx // 16] = True
seen = np.zeros_like(grid)
boxes = []
for gy in range(gh):
    for gx in range(gw):
        if grid[gy, gx] and not seen[gy, gx]:
            q = deque([(gy, gx)])
            seen[gy, gx] = True
            minx = maxx = gx
            miny = maxy = gy
            cnt = 0
            while q:
                cy, cx = q.popleft()
                cnt += 1
                minx = min(minx, cx); maxx = max(maxx, cx)
                miny = min(miny, cy); maxy = max(maxy, cy)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < gh and 0 <= nx < gw and grid[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if cnt >= 6:
                boxes.append((minx * 16, miny * 16, (maxx + 1) * 16, (maxy + 1) * 16, cnt * 256))
boxes.sort(key=lambda t: -t[4])
print('diff regions (x0,y0,x1,y1,area) content-px; logical=/2:')
for bx in boxes[:25]:
    print(bx, '-> logical', tuple(v // 2 for v in bx[:4]))

vis = Image.new('RGB', (cw, ch // 2 * 2))
vis.paste(content.resize((cw // 2, ch // 2)), (0, 0))
mv = Image.fromarray((mask * 255).astype('uint8')).convert('RGB').resize((cw // 2, ch // 2))
vis.paste(mv, (cw // 2, 0))
vis.save('extracted/sheets/menu_diff.jpg', quality=90)
print('saved extracted/sheets/menu_diff.jpg')
