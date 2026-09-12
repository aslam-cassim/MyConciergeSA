require('dotenv').config();
const ftp = require('basic-ftp');
const tls = require('tls');

const EXPECTED_CERT_HOSTNAME = 'rogue.hkdns.host';
function checkServerIdentity(hostname, cert) {
  return tls.checkServerIdentity(EXPECTED_CERT_HOSTNAME, cert);
}

async function main() {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: true,
      secureOptions: { checkServerIdentity },
    });

    console.log('Listing:', process.env.FTP_REMOTE_PATH);
    const top = await client.list(process.env.FTP_REMOTE_PATH);
    for (const item of top) {
      console.log(' ', item.isDirectory ? '[dir] ' : '[file]', item.name, item.size, item.rawModifiedAt || '');
    }

    const publicHtmlPath = process.env.FTP_REMOTE_PATH + '/public_html';
    const hasPublicHtml = top.some(i => i.isDirectory && i.name === 'public_html');
    if (hasPublicHtml) {
      console.log('\nListing:', publicHtmlPath);
      const inner = await client.list(publicHtmlPath);
      for (const item of inner) {
        console.log(' ', item.isDirectory ? '[dir] ' : '[file]', item.name, item.size, item.rawModifiedAt || '');
      }
    } else {
      console.log('\nNo public_html subfolder found at that path.');
    }
  } catch (e) {
    console.error('FAILED:', e.message);
  } finally {
    client.close();
  }
}

main();
