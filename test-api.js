const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Helper function to perform HTTP POST requests
function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(responseData)
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Helper function to perform HTTP DELETE requests
function deleteJSON(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'DELETE',
      headers: {
        'X-Delete-Token': token || ''
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(responseData)
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Helper function to perform HTTP GET requests
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(responseData)
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    }).on('error', reject);
  });
}

// Helper to simulate multipart/form-data boundary generation (for simple API tests without massive external libs)
function postMultipart(url, fields, files = []) {
  return new Promise((resolve, reject) => {
    const boundary = '----TestBoundary' + Math.random().toString(36).substring(2);
    let payload = [];

    // Fields
    for (const [key, val] of Object.entries(fields)) {
      payload.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`);
    }

    // Files
    files.forEach(file => {
      payload.push(`--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.mimetype}\r\n\r\n${file.content}\r\n`);
    });

    payload.push(`--${boundary}--\r\n`);
    const buffer = Buffer.concat(payload.map(p => Buffer.from(p)));

    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': buffer.length
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(responseData)
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting DropLink API Verification Tests ---');

  try {
    // 1. Create a password-protected link
    console.log('\n[TEST 1] Creating password-protected transfer with 1 text file...');
    const transferPayload = {
      title: 'Dossier Secret',
      textContent: 'Ce contenu est hautement confidentiel.',
      password: 'mon-mot-de-passe-super-sur',
      customSlug: 'test-api-slug-' + Math.random().toString(36).substring(2, 6)
    };
    const filesPayload = [
      {
        fieldname: 'files',
        filename: 'secret.txt',
        mimetype: 'text/plain',
        content: 'Voici les codes secrets de lancement : 12345.'
      }
    ];

    const createRes = await postMultipart(`${BASE_URL}/api/transfers`, transferPayload, filesPayload);
    
    if (createRes.status !== 201 || !createRes.data.success) {
      throw new Error(`Failed to create transfer: ${JSON.stringify(createRes.data)}`);
    }
    console.log('✔ Transfer created successfully!', createRes.data);
    const transferId = createRes.data.transferId;

    // 2. Fetch metadata of the password-protected link
    console.log('\n[TEST 2] Fetching link metadata (should be locked and hide contents)...');
    const metaRes = await getJSON(`${BASE_URL}/api/transfers/${transferId}`);
    
    if (metaRes.status !== 200) {
      throw new Error(`Failed to fetch metadata: ${metaRes.status}`);
    }
    
    const meta = metaRes.data;
    console.log('✔ Metadata received:', meta);
    
    if (meta.status !== 'locked' || meta.textContent || meta.files) {
      throw new Error('❌ SECURITY FAILURE: Password-locked metadata leaked private details!');
    }
    console.log('✔ Security check passed: content is locked & hidden.');

    // 3. Try to unlock with incorrect password
    console.log('\n[TEST 3] Unlocking with INCORRECT password...');
    const badUnlock = await postJSON(`${BASE_URL}/api/transfers/${transferId}/unlock`, { password: 'wrong-password' });
    
    if (badUnlock.status !== 401) {
      throw new Error(`❌ Security failure: Server allowed unlocking with wrong password (Status: ${badUnlock.status})`);
    }
    console.log('✔ Verification blocked bad password correctly! (Status 401 Unauthorized)');

    // 4. Unlock with correct password
    console.log('\n[TEST 4] Unlocking with CORRECT password...');
    const goodUnlock = await postJSON(`${BASE_URL}/api/transfers/${transferId}/unlock`, { password: 'mon-mot-de-passe-super-sur' });
    
    if (goodUnlock.status !== 200 || !goodUnlock.data.success) {
      throw new Error(`❌ Unlock failed: Could not unlock with correct password (Status: ${goodUnlock.status})`);
    }
    console.log('✔ Unlocked successfully!', goodUnlock.data);
    
    if (goodUnlock.data.textContent !== 'Ce contenu est hautement confidentiel.') {
      throw new Error('❌ Data verification error: text content does not match!');
    }
    const fileId = goodUnlock.data.files[0].id;
    console.log('✔ Unlocked data and file ID matches specs.');

    // 5. Try downloading file without password
    console.log('\n[TEST 5] Downloading file WITHOUT password (should fail)...');
    const badDownload = await getJSON(`${BASE_URL}/api/transfers/${transferId}/files/${fileId}`);
    if (badDownload.status !== 401) {
      throw new Error(`❌ Security failure: Server allowed file download without password (Status: ${badDownload.status})`);
    }
    console.log('✔ File download blocked without password correctly!');

    // 6. Download file with CORRECT password
    console.log('\n[TEST 6] Downloading file WITH password...');
    const goodDownload = await getJSON(`${BASE_URL}/api/transfers/${transferId}/files/${fileId}?password=mon-mot-de-passe-super-sur`);
    if (goodDownload.status !== 200) {
      throw new Error(`❌ Download failed with correct password (Status: ${goodDownload.status})`);
    }
    console.log('✔ File downloaded successfully!');
    if (goodDownload.data !== 'Voici les codes secrets de lancement : 12345.') {
      throw new Error('❌ Downloaded file content mismatch!');
    }
    console.log('✔ Downloaded file content verified perfectly!');

    // 7. Verify Expired Link
    console.log('\n[TEST 7] Creating expired transfer...');
    const expiredRes = await postMultipart(`${BASE_URL}/api/transfers`, {
      title: 'Transfert Périmé',
      endDate: new Date(Date.now() - 60000).toISOString() // 1 minute ago
    });
    const expMeta = await getJSON(`${BASE_URL}/api/transfers/${expiredRes.data.transferId}`);
    if (expMeta.data.status !== 'expired') {
      throw new Error(`❌ Expiry check failed: Status is ${expMeta.data.status}`);
    }
    console.log('✔ Expired link identified and blocked server-side!', expMeta.data);

    // 8. Verify Pending Link
    console.log('\n[TEST 8] Creating future/pending transfer...');
    const pendingRes = await postMultipart(`${BASE_URL}/api/transfers`, {
      title: 'Transfert Futur',
      startDate: new Date(Date.now() + 60000).toISOString() // 1 minute in the future
    });
    const pendMeta = await getJSON(`${BASE_URL}/api/transfers/${pendingRes.data.transferId}`);
    if (pendMeta.data.status !== 'pending') {
      throw new Error(`❌ Pending check failed: Status is ${pendMeta.data.status}`);
    }
    // 9. Verify Delete Transfer
    console.log('\n[TEST 9] Verifying Delete Transfer...');
    const deleteId = createRes.data.transferId;
    const correctToken = createRes.data.deleteToken;

    console.log(' - Deleting with INCORRECT token...');
    const badDelete = await deleteJSON(`${BASE_URL}/api/transfers/${deleteId}`, 'wrong-token');
    if (badDelete.status !== 401) {
      throw new Error(`❌ Security failure: Server allowed delete with wrong token (Status: ${badDelete.status})`);
    }
    console.log('  ✔ Blocked wrong token correctly.');

    console.log(' - Deleting with CORRECT token...');
    const goodDelete = await deleteJSON(`${BASE_URL}/api/transfers/${deleteId}`, correctToken);
    if (goodDelete.status !== 200) {
      throw new Error(`❌ Delete failed with correct token (Status: ${goodDelete.status})`);
    }
    console.log('  ✔ Delete request returned 200 OK.');

    console.log(' - Verifying metadata returns 404...');
    const deletedMeta = await getJSON(`${BASE_URL}/api/transfers/${deleteId}`);
    if (deletedMeta.status !== 404) {
      throw new Error(`❌ Security failure: Deleted transfer metadata still accessible (Status: ${deletedMeta.status})`);
    }
    console.log('  ✔ Transfer is indeed gone from DB.');

    console.log('\n=============================================');
    console.log('🎉 ALL API VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('=============================================');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
