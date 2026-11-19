# tests/fixtures/garanti-ornek.xls üreticisi (python3 + xlwt 1.3.0): python3 tests/fixtures/garanti-ornek.py tests/fixtures/garanti-ornek.xls
# Garanti BBVA "hesap hareketleri" düzeninde uydurma ekstre (gerçek kişi, hesap ya da IBAN yok).
import sys, xlwt
wb = xlwt.Workbook(encoding='utf-8'); ws = wb.add_sheet('hesaphareketleri')
ws.write(0, 1, 'T. GARANTİ BANKASI A.Ş.\nGenel Müdürlük: Örnek adres')
top = [('Ad Soyad', 'ÖRNEK SİTE YÖNETİMİ'), ('Hesap', '000 - 0000000 TL'), (None, None), ('IBAN', 'TR42 0006 2000 0000 0000 0000 01'),
       ('Şube', 'ÖRNEK'), ('Başlangıç', '01/11/2026'), ('Bitiş', '18/11/2026'), ('İndirme Tarihi', '18/11/2026 23:40'),
       ('Bakiye', '0,00 TL'), ('Kullanılabilir Bakiye', '0,00 TL')]
for i, (a, b) in enumerate(top):
    if a: ws.write(3 + i, 0, a); ws.write(3 + i, 1, b)
head = ['Tarih', 'Açıklama', 'Etiket', 'Tutar', 'Bakiye', 'Dekont No']
for c, h in enumerate(head): ws.write(14, c, h)
rows = [
  ('16/11/2026', 'AYŞE YILMAZ-K7MXRP KASIM AIDAT', 'Para Transferi', 1500.0, 0.0, '2026-11-16-10.00.00.000001'),
  ('15/11/2026', 'MEHMET DEMİR--HVL-CEP ŞUBE', 'Para Transferi', 1000.0, 0.0, '2026-11-15-09.00.00.000002'),
  ('14/11/2026', 'ELEKTRİK FATURASI', 'Fatura', -850.25, 0.0, '2026-11-14-08.00.00.000003'),
  ('13/11/2026', 'ZEYNEP KAYA P3QWHT', 'Para Transferi', 500.0, 0.0, '2026-11-13-08.00.00.000004'),
  ('12/11/2026', 'BİLİNMEYEN GÖNDEREN', 'Para Transferi', 750.0, 0.0, '2026-11-12-08.00.00.000005'),
]
for r, row in enumerate(rows):
    for c, v in enumerate(row): ws.write(15 + r, c, v)
wb.save(sys.argv[1])
