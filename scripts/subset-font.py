# 사이트에 쓰이는 글자만 남긴 Pretendard Variable 서브셋 생성 (개발용 도구)
# 사용: python scripts/subset-font.py <PretendardVariable.woff2 경로>
# 원본: https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2 (SIL OFL 1.1)
import sys, pathlib
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
chars = set()
for p in list(root.glob('*.html')) + list(root.glob('*/index.html')) + list((root / 'assets').glob('*.js')) + list((root / 'scripts').glob('build-content.mjs')):
    chars |= set(p.read_text(encoding='utf-8'))
chars |= set(r'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .,:;!?()[]{}<>/\-_+=*&%#@~·…→←✈×−’‘“”\'"|')
# 날짜 표시에 쓰는 요일·단위 글자 보장
chars |= set('일월화수목금토년월일번연휴차쉬어요')
text = ''.join(sorted(c for c in chars if ord(c) >= 32))
out = root / 'assets' / 'fonts' / 'pretendard-subset.woff2'
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['kern', 'tnum', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk']
opts.name_IDs = ['*']
font = subset.load_font(sys.argv[1], opts)
s = subset.Subsetter(opts)
s.populate(text=text)
s.subset(font)
subset.save_font(font, str(out), opts)
print(out, out.stat().st_size, 'bytes', len(text), 'chars')
