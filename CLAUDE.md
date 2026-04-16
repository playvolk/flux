# FLUX — Renk Akış Bulmaca Oyunu

## Proje Bilgileri
- **Repo**: https://github.com/playvolk/flux
- **Deploy**: Vercel (static HTML)
- **Versiyon**: v0.3 — Liquid Light

## Dosya Yapısı
```
flux/
├── index.html      — Ana sayfa, tüm ekranlar (menü, level seç, oyun, overlay'ler)
├── style.css       — Mobile-first responsive CSS, safe area desteği
├── game.js         — Tüm oyun motoru (~1600 satır)
├── FLUX GDD.docx   — Oyun Tasarım Dokümanı (orijinal)
├── FLUX_GDD.txt    — GDD'nin text versiyonu
└── CLAUDE.md       — Bu dosya
```

## Teknik Mimari
- **Framework**: Sıfır bağımlılık, saf Canvas 2D API
- **Render**: devicePixelRatio destekli retina canvas
- **State**: Tek global `G` objesi
- **Save**: localStorage (`flux_save_v3`)
- **Font**: Google Fonts — Inter

## Zorluk Sistemi
- **Sawtooth eğrisi**: Her 15 level = 1 episode (5E + 5M + 4H + 1Boss)
- **BFS Solver**: Her level üretiminde optimal hamle hesaplanır
- **Hamle çarpanları**: Easy 1.9x, Medium 1.4x, Hard 1.15x, Boss 1.0x
- **DDA**: Son 5 levelde 3+ fail → gizli +2 hamle bonusu

## Mekanik Katmanları (Episode Bazlı)
| Episode | Levellar | Mekanik |
|---------|----------|---------|
| 0-1 | 1-30 | Temel akış (2-3 renk) |
| 2-3 | 31-60 | Duvarlar |
| 4-6 | 61-105 | Buz (kayma) |
| 7-10 | 106-165 | Köprüler |
| 11-15 | 166-240 | Kilitler |
| 16-20 | 241-315 | Bombalar |
| 21-25 | 316-390 | Borular |
| 26+ | 391+ | Renk karışımı |

## Görsel Sistem: Liquid Light
- Orb'lar → 7 katmanlı sıvı boya damlaları (glow, shadow, gradient sphere, specular)
- Tile'lar → buzlu cam (rounded corners, glass highlight)
- Sürükleme → 3 katmanlı sıvı yol (glow + fill + highlight)
- Dönüşüm → elastic blob + dalga halkası + boya sıçraması
- Parçacıklar → yerçekimli sıvı damlacıklar

## DEV MODE
`game.js` dosyasının BOOT bölümünde DEV MODE aktif:
- 5 can, 9999 coin, 2000 level açık
- Production'a geçerken bu bloğu kaldır/yorum yap

## Renk Karışım Tablosu
- Kırmızı + Mavi = Mor
- Kırmızı + Sarı = Turuncu
- Mavi + Sarı = Yeşil
