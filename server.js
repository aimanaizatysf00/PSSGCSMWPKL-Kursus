const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public')); // Memaparkan fail index.html dari folder public

// Tetapan Google Sheets API
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);

// 1. Ambil Senarai Pesilat Master daripada Sheet Utama
app.get('/api/pesilat-master', async (req, res) => {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0]; // Sheet pertama = Data Master Pesilat
    const rows = await sheet.getRows();
    
    const senaraiPesilat = rows
      .filter(row => row.get('Nama Pesilat')) // Tapis baris kosong
      .map(row => ({
        nama: row.get('Nama Pesilat'),
        ic: String(row.get('No IC') || ''),
        gelanggang: row.get('Nama Gelanggang') || ''
      }));

    res.json({ success: true, data: senaraiPesilat });
  } catch (err) {
    console.error("Error Get Pesilat:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Cipta Sheet Baharu & Sediakan Lembaran Pemarkahan
app.post('/api/cipta-sesi-ujian', async (req, res) => {
  try {
    const { penguji, taliPinggang, kumpulan, pesilatPilihan } = req.body;
    await doc.loadInfo();

    const namaSheetBaharu = `${kumpulan}_${taliPinggang}_${penguji}`.substring(0, 99);

    // Semak jika sheet dah wujud. Jika wujud, padam sheet lama dulu untuk elak error.
    const existingSheet = doc.sheetsByTitle[namaSheetBaharu];
    if (existingSheet) {
      await existingSheet.delete();
    }

    // Cipta sheet baharu dengan Header Pemarkahan
    const sheetBaharu = await doc.addSheet({
      title: namaSheetBaharu,
      headerValues: [
        'Nama Pesilat', 'No IC', 'Gelanggang', 
        'Gerakan Asas (15)', 'Asas Elak (15)', 'Asas Kaki (15)', 
        'Anak Harimau (20)', 'Elak Pukul (20)', 'Lompatan (15)', 'Jumlah (100)'
      ]
    });

    // Masukkan data pesilat yang dipilih
    const rowsToAdd = pesilatPilihan.map(p => ({
      'Nama Pesilat': p.nama,
      'No IC': p.ic,
      'Gelanggang': p.gelanggang,
      'Gerakan Asas (15)': 0,
      'Asas Elak (15)': 0,
      'Asas Kaki (15)': 0,
      'Anak Harimau (20)': 0,
      'Elak Pukul (20)': 0,
      'Lompatan (15)': 0,
      'Jumlah (100)': 0
    }));

    await sheetBaharu.addRows(rowsToAdd);

    res.json({ success: true, sheetTitle: namaSheetBaharu });
  } catch (err) {
    console.error("Error Cipta Sesi:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Simpan / Kemaskini Markah Akhir
app.post('/api/simpan-markah', async (req, res) => {
  try {
    const { sheetTitle, dataMarkah } = req.body;
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle[sheetTitle];
    if (!sheet) {
      return res.status(404).json({ success: false, message: 'Sheet tidak dijumpai!' });
    }

    const rows = await sheet.getRows();

    // Kemaskini setiap baris pesilat dengan markah baharu
    for (let i = 0; i < dataMarkah.length; i++) {
      const item = dataMarkah[i];
      if (rows[i]) {
        rows[i].set('Gerakan Asas (15)', item.m1);
        rows[i].set('Asas Elak (15)', item.m2);
        rows[i].set('Asas Kaki (15)', item.m3);
        rows[i].set('Anak Harimau (20)', item.m4);
        rows[i].set('Elak Pukul (20)', item.m5);
        rows[i].set('Lompatan (15)', item.m6);
        rows[i].set('Jumlah (100)', item.jumlah);
        await rows[i].save();
      }
    }

    res.json({ success: true, message: 'Markah berjaya disimpan!' });
  } catch (err) {
    console.error("Error Simpan Markah:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server beroperasi di port ${PORT}`));
