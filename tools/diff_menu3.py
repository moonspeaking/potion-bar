import glob
from PIL import Image
import numpy as np

shot = Image.open('extracted/sheets/orig_s4.png').convert('RGB')
A = np.asarray(shot).astype(np.int16)
strip = A[30:90, 1200:2000]
rs = strip.std(axis=(1, 2))
mb = 30 + next(i for i, v in enumerate(rs) if v > 30)
print('menu bar bottom px:', mb)
content = shot.crop((0, mb, 2048, mb + 1536))
content.save('extracted/sheets/game_content.png')
content.resize((1024, 768)).save('extracted/sheets/game_content_small.jpg', quality=92)
bgp = glob.glob('extracted/pak/**/Episode_BG_01.jpg', recursive=True)[0]
bg = Image.open(bgp).convert('RGB').resize((2048, 1536))
Ca = np.asarray(content).astype(np.int16)
Ba = np.asarray(bg).astype(np.int16)
best = None
for dy in range(-24, 25, 2):
    for dx in range(-24, 25, 2):
        ys0, ys1 = max(0, dy), min(1536, 1536 + dy)
        xs0, xs1 = max(0, dx), min(2048, 2048 + dx)
        d = np.abs(Ca[ys0:ys1, xs0:xs1] - Ba[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]).mean()
        if best is None or d < best[0]:
            best = (round(float(d), 2), dx, dy)
print('best align (diff,dx,dy):', best)
d0, dx, dy = best
ys0, ys1 = max(0, dy), min(1536, 1536 + dy)
xs0, xs1 = max(0, dx), min(2048, 2048 + dx)
D = np.abs(Ca[ys0:ys1, xs0:xs1] - Ba[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]).sum(axis=2)
mask = np.zeros((1536, 2048), bool)
mask[ys0:ys1, xs0:xs1] = D > 90
print('diff fraction: %.3f  content mean %.0f  bg mean %.0f' % (mask.mean(), Ca.mean(), Ba.mean()))
print('diff density map (cell=32 logical px, rows y=0..736):')
for gy in range(24):
    row = ''
    for gx in range(32):
        f = mask[gy * 64:(gy + 1) * 64, gx * 64:(gx + 1) * 64].mean()
        row += ' .:*#'[min(4, int(f * 5))]
    print('%4d %s' % (gy * 32, row))
sbs = Image.new('RGB', (2048, 768))
sbs.paste(content.resize((1024, 768)), (0, 0))
sbs.paste(bg.resize((1024, 768)), (1024, 0))
sbs.save('extracted/sheets/sbs_content_bg.jpg', quality=90)
print('saved sbs_content_bg.jpg (left=game, right=Episode_BG_01)')
