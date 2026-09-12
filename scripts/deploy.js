require('dotenv').config();
const ftp = require('basic-ftp');
const tls = require('tls');
const path = require('path');

const { FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_REMOTE_PATH } = process.env;

// The host's FTPS cert is issued for its shared-server hostname, not for
// myconciergesa.com (confirmed with the hosting provider). Pin to that exact
// hostname instead of disabling hostname verification altogether, so a cert
// for any *other* unexpected host still fails closed.
const EXPECTED_CERT_HOSTNAME = 'rogue.hkdns.host';

function checkServerIdentity(hostname, cert) {
  return tls.checkServerIdentity(EXPECTED_CERT_HOSTNAME, cert);
}

const FILES = [
  'index.html',
  'reviews.json',
  'logo.png',
  'og-image.png',
  'sedick-portrait.jpg',
  'robots.txt',
  'sitemap.xml',
];

async function deploy() {
  if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD || !FTP_REMOTE_PATH) {
    console.error('Missing FTP_HOST, FTP_USER, FTP_PASSWORD or FTP_REMOTE_PATH. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASSWORD,
      secure: true,
      secureOptions: { checkServerIdentity },
    });

    await client.ensureDir(FTP_REMOTE_PATH);

    for (const file of FILES) {
      const localPath = path.join(__dirname, '..', file);
      process.stdout.write(`Uploading ${file} ... `);
      await client.uploadFrom(localPath, file);
      console.log('done');
    }

    console.log('Deploy complete.');
  } catch (err) {
    console.error('Deploy failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

deploy();
