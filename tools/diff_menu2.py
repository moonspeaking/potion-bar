import glob
from PIL import Image
import numpy as np
from collections import deque

shot = Image.open('extracted/sheets/orig_s4.png').convert('RGB')
SW, SH = shot.size
A = np.asarray(shot).astype(np.int16)
print('shot', shot.size)

# --- find title bar: rows 30..280, x in [1200..2000]: uniform (low std) strip
xs0, xs1 = 1200, 2000
y0 = 30
strip = A[y0:300, xs0:xs1]
rowstd = strip.std(axis=(1, 2))
low = [i for i in range(strip.shape[0]) if rowstd[i] < 10]
print('low-std rows rel', y0, ':', (low[0], low[-1], len(low)) if low else None)

title_bottom = None
if low:
    # first contiguous run of length >= 20
    run_start = None
    prev = None
    for i in low:
        if run_start is None:
            run_start = i
        elif i != prev + 1:
            if prev - run_start >= 20:
                break
            run_start = i
        prev = i
    if run_start is not None and prev is not None and prev - run_start >= 20:
        title_bottom = y0 + prev + 1
if title_bottom is None:
    title_bottom = 106  # 25pt menubar + 28pt titlebar
print('title_bottom px:', title_bottom)

LEFT = 0
CONTENT_W, CONTENT_H = 2048, 1536  # 1024x768 points at retina 2x
content = shot.crop((LEFT, title_bottom, LEFT + CONTENT_W, title_bottom + CONTENT_H))
content.save('extracted/sheets/game_content.png')
content.resize((1024, 768)).save('extracted/sheets/game_content_small.jpg', quality=92)
print('content size:', content.size)

bgp = None
for p in ['extracted/pak/**/Episode_BG_01.jpg', 'extracted/pak/**/*BG_01*.jpg',
          'extracted/pak/**/*BG_01*.png']:
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
for dy in range(-16, 17, 4):
    for dx in range(-16, 17, 4):
        ys0, ys1 = max(0, dy), min(ch, ch + dy)
        xs0a, xs1a = max(0, dx), min(cw, cw + dx)
        c = Ca[ys0:ys1, xs0a:xs1a]
        b = Ba[ys0 - dy:ys1 - dy, xs0a - dx:xs1a - dx]
        d = np.abs(c - b).mean()
        if best is None or d < best[0]:
            best = (d, dx, dy)
print('best align (meandiff, dx, dy):', best)
d0, dx, dy = best
ys0, ys1 = max(0, dy), min(ch, ch + dy)
xs0a, xs1a = max(0, dx), min(cw, cw + dx)
c = Ca[ys0:ys1, xs0a:xs1a]
b = Ba[ys0 - dy:ys1 - dy, xs0a - dx:xs1a - dx]
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

vis = Image.new('RGB', (cw, ch))
vis.paste(content, (0, 0))
mv = Image.fromarray((mask * 255).astype('uint8')).convert('RGB')
vis.paste(mv, (cw, 0))
vis.resize((cw, ch // 2)).save('extracted/sheets/menu_diff.jpg', quality=88)
print('saved extracted/sheets/menu_diff.jpg')
